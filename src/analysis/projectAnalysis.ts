import {
  AnalysisRequestRejected,
  getProjectDetail,
  startProjectAnalysis,
  type ProjectDetail,
} from '../lib/projectApi.ts'
import { ConsentRequired } from '../lib/consentApi.ts'

type Phase =
  'idle' | 'queued' | 'requesting' | 'confirmed' | 'rejected' | 'unknown'
export interface ProjectAnalysisState {
  phase: Phase
  project?: ProjectDetail
  error?: string
  excluded?: number
  consentRequired?: boolean
  awaitingRun?: boolean
  preflightFailed?: boolean
}
const empty: ProjectAnalysisState = { phase: 'idle' }
const defaultApi = { get: getProjectDetail, start: startProjectAnalysis }

/** In-memory intent, never router/storage state: a reload can only read the server.
 * The owner outlives React mounts. Only explicit queue/retry actions permit POST.
 */
export class ProjectAnalysisStore {
  private states = new Map<number, ProjectAnalysisState>()
  private listeners = new Set<() => void>()
  private reads = new Map<number, Promise<void>>()
  private revisions = new Map<number, number>()
  private baselines = new Map<number, number | null>()
  private api: typeof defaultApi
  constructor(api = defaultApi) {
    this.api = api
  }
  get = (id: number) => this.states.get(id) ?? empty
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
  private update(id: number, patch: Partial<ProjectAnalysisState>) {
    this.states.set(id, { ...this.get(id), ...patch })
    this.listeners.forEach((listener) => listener())
  }
  queue(id: number) {
    const state = this.get(id)
    if (['queued', 'requesting', 'unknown'].includes(state.phase)) return
    this.revisions.set(id, (this.revisions.get(id) ?? 0) + 1)
    this.update(id, {
      phase: 'queued',
      preflightFailed: false,
      error: undefined,
      consentRequired: false,
      excluded: undefined,
      awaitingRun: false,
    })
  }
  retry(id: number) {
    if (this.get(id).phase !== 'rejected') return
    this.queue(id)
    void this.consume(id)
  }
  async consume(id: number) {
    if (this.get(id).phase !== 'queued') return
    this.update(id, { phase: 'requesting' }) // lock before the first await (StrictMode)
    let dispatched = false
    try {
      // Establish a baseline so an old completed run cannot confirm this request.
      const project = await this.api.get(id)
      this.update(id, { project })
      this.baselines.set(id, project.lastAnalysis?.analysisRunId ?? null)
      if (['QUEUED', 'RUNNING'].includes(project.lastAnalysis?.status ?? '')) {
        this.update(id, { phase: 'confirmed' })
        return
      }
      dispatched = true
      const run = await this.api.start(id)
      this.update(id, {
        phase: 'confirmed',
        awaitingRun: true,
        excluded: run.inaccessibleRepositoryCount,
      })
    } catch (error) {
      const rejected =
        !dispatched ||
        error instanceof AnalysisRequestRejected ||
        error instanceof ConsentRequired
      this.update(id, {
        phase: rejected ? 'rejected' : 'unknown',
        preflightFailed: !dispatched,
        consentRequired: error instanceof ConsentRequired,
      })
    }
    await this.refresh(id)
  }
  refresh(id: number): Promise<void> {
    if (['queued', 'requesting'].includes(this.get(id).phase))
      return Promise.resolve()
    const existing = this.reads.get(id)
    if (existing) return existing
    const request = this.read(id).finally(() => this.reads.delete(id))
    this.reads.set(id, request)
    return request
  }
  private async read(id: number) {
    const revision = this.revisions.get(id)
    try {
      const project = await this.api.get(id)
      if (revision !== this.revisions.get(id)) return
      const current = this.get(id)
      const latest = project.lastAnalysis
      const discovered =
        latest &&
        (['QUEUED', 'RUNNING'].includes(latest.status) ||
          (this.baselines.has(id) &&
            latest.analysisRunId !== this.baselines.get(id)))
      this.update(id, {
        project,
        error: undefined,
        ...(discovered ? { awaitingRun: false } : {}),
        ...(current.phase === 'unknown' && discovered
          ? { phase: 'confirmed' as const }
          : {}),
      })
    } catch {
      if (revision !== this.revisions.get(id)) return
      this.update(id, {
        error:
          '서버 상태를 불러오지 못했습니다. 상태 확인을 다시 시도해주세요.',
      })
    }
  }
}
export const projectAnalysis = new ProjectAnalysisStore()
