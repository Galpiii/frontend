import { getProjectDetail } from '../lib/projectApi.ts'
import {
  getLatestMatchRun,
  MatchApiError,
  MatchOutcomeUnknown,
  startMatchRun,
  type MatchRun,
} from '../lib/featureMatchApi.ts'

type Snapshot = {
  phase: 'loading' | 'idle' | 'sending' | 'running' | 'unknown' | 'read-error'
  run: MatchRun | null
  message: string
  revision: number
}

class MatchOwner {
  private state: Snapshot = {
    phase: 'loading',
    run: null,
    message: '',
    revision: 0,
  }
  private listeners = new Set<() => void>()
  private inFlight: Promise<void> | null = null
  private uncertainBaseline: number | null | undefined
  private acceptedRunId: number | undefined
  private projectId: number
  constructor(projectId: number) {
    this.projectId = projectId
  }
  getSnapshot = () => this.state
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
  private publish(update: Partial<Snapshot>) {
    this.state = { ...this.state, ...update }
    this.listeners.forEach((listener) => listener())
  }
  refresh = () => {
    if (this.inFlight) return this.inFlight
    this.inFlight = this.load().finally(() => {
      this.inFlight = null
    })
    return this.inFlight
  }
  private async load() {
    try {
      const latest = await getLatestMatchRun(this.projectId)
      const run = latest
      if (this.acceptedRunId !== undefined) {
        if (run && run.featureMatchRunId >= this.acceptedRunId)
          this.acceptedRunId = undefined
        else {
          this.publish({
            run,
            phase: 'unknown',
            message:
              '접수된 실행이 최신 목록에 아직 보이지 않습니다. 서버 상태를 다시 확인해주세요.',
            revision: this.state.revision + 1,
          })
          return
        }
      }
      if (this.uncertainBaseline !== undefined) {
        if (
          run?.featureMatchRunId !== undefined &&
          run.featureMatchRunId !== this.uncertainBaseline
        )
          this.uncertainBaseline = undefined
        else {
          this.publish({
            run,
            phase: 'unknown',
            revision: this.state.revision + 1,
          })
          return
        }
      }
      this.publish({
        run,
        phase:
          run && ['QUEUED', 'RUNNING'].includes(run.status)
            ? 'running'
            : 'idle',
        message: '',
        revision: this.state.revision + 1,
      })
    } catch (error) {
      this.publish({
        phase: 'read-error',
        message:
          error instanceof MatchApiError && error.code === 'PROJECT-001'
            ? '프로젝트를 찾을 수 없거나 접근할 수 없습니다.'
            : error instanceof MatchApiError && error.status === 404
              ? '최신 기능대조 실행 조회 API를 사용할 수 없습니다. 서버 상태를 확인해주세요.'
              : '기능대조 실행 상태를 확인하지 못했습니다.',
        revision: this.state.revision + 1,
      })
    }
  }
  async start(specDocumentId: number) {
    if (this.state.phase !== 'idle' || this.inFlight) return
    const baseline = this.state.run?.featureMatchRunId ?? null
    this.publish({ phase: 'sending', message: '기능대조를 요청하고 있습니다.' })
    try {
      const project = await getProjectDetail(this.projectId)
      if (
        project.specDocument?.specDocumentId !== specDocumentId ||
        project.specDocument.extractionStatus !== 'COMPLETED'
      )
        throw new MatchApiError(409, 'SOURCE_CHANGED')
      const latest = await getLatestMatchRun(this.projectId)
      if (latest && ['QUEUED', 'RUNNING'].includes(latest.status)) {
        this.publish({ run: latest, phase: 'running', message: '' })
        return
      }
      if ((latest?.featureMatchRunId ?? null) !== baseline)
        throw new MatchApiError(409, 'SOURCE_CHANGED')
      const created = await startMatchRun(this.projectId)
      if (created.specDocumentId !== specDocumentId) {
        this.uncertainBaseline = baseline
        this.publish({
          phase: 'unknown',
          message:
            '다른 명세서의 대조 실행이 접수되었습니다. 서버 상태를 확인해주세요.',
        })
      } else {
        this.acceptedRunId = created.featureMatchRunId
        this.publish({ run: null, phase: 'running', message: '' })
      }
    } catch (error) {
      if (error instanceof MatchOutcomeUnknown) {
        this.uncertainBaseline = baseline
        this.publish({ phase: 'unknown', message: error.message })
      } else {
        const message =
          error instanceof MatchApiError && error.code === 'SOURCE_CHANGED'
            ? '명세서 또는 실행 상태가 바뀌었습니다. 최신 상태를 확인해주세요.'
            : error instanceof MatchApiError && error.code === 'CONSENT-001'
              ? 'AI 데이터 전송 동의를 다시 확인해주세요.'
              : '기능대조를 시작하지 못했습니다. 서버 상태를 확인해주세요.'
        this.publish({ phase: 'read-error', message })
      }
    } finally {
      await this.refreshAfterStart()
    }
  }
  private async refreshAfterStart() {
    // A status read is safe after every mutation outcome. Unknown outcomes
    // remain locked unless a distinct new run is observed.
    await this.refresh()
  }
}

const owners = new Map<number, MatchOwner>()
export function getMatchOwner(projectId: number) {
  let owner = owners.get(projectId)
  if (!owner) {
    owner = new MatchOwner(projectId)
    owners.set(projectId, owner)
  }
  return owner
}
