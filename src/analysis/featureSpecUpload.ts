import {
  FeatureSpecUploadRejected,
  getFeatureSpecStage,
  replaceFeatureSpec,
  uploadFeatureSpec,
} from '../lib/featureSpecApi.ts'
import { getProjectDetail, type ProjectDetail } from '../lib/projectApi.ts'

type State = {
  phase: 'idle' | 'requesting' | 'accepted' | 'unknown' | 'rejected'
  previousId?: number
  message?: string
}
const idle: State = { phase: 'idle' }
const defaultApi = {
  get: getProjectDetail,
  upload: uploadFeatureSpec,
  replace: replaceFeatureSpec,
}

/** Mutation ownership outlives route mounts. GET never resends a request. */
export class FeatureSpecUploadStore {
  private states = new Map<number, State>()
  private listeners = new Set<() => void>()
  private api: typeof defaultApi
  constructor(api = defaultApi) {
    this.api = api
  }
  get = (id: number) => this.states.get(id) ?? idle
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
  private set(id: number, state: State) {
    this.states.set(id, state)
    this.listeners.forEach((listener) => listener())
  }
  async request(
    id: number,
    file: File,
    previousId: number | undefined,
    authorize: () => Promise<boolean>,
    isActive: () => boolean = () => true,
  ) {
    if (['requesting', 'accepted', 'unknown'].includes(this.get(id).phase))
      return
    this.set(id, {
      phase: 'requesting',
      previousId,
      message: '동의와 서버 상태를 확인하고 있습니다.',
    })
    let dispatched = false
    try {
      if (!(await authorize())) {
        this.set(id, idle)
        return
      }
      const current = await this.api.get(id)
      if (!isActive()) {
        this.set(id, idle)
        return
      }
      const document = current.specDocument
      if (
        previousId === undefined
          ? document !== null
          : document?.specDocumentId !== previousId ||
            !['ready', 'failed'].includes(getFeatureSpecStage(document))
      ) {
        throw new FeatureSpecUploadRejected(
          '기능명세서 상태가 변경되었습니다. 서버 상태를 확인하고 다시 선택해주세요.',
        )
      }
      this.set(id, {
        phase: 'requesting',
        previousId,
        message: '기능명세서를 전송하고 있습니다.',
      })
      dispatched = true
      await (previousId === undefined
        ? this.api.upload(id, file)
        : this.api.replace(id, file))
      this.set(id, {
        phase: 'accepted',
        previousId,
        message: '요청을 접수했습니다. 새 문서 상태는 자동으로 갱신됩니다.',
      })
    } catch (error) {
      const rejected = !dispatched || error instanceof FeatureSpecUploadRejected
      this.set(id, {
        phase: rejected ? 'rejected' : 'unknown',
        previousId,
        message: rejected
          ? error instanceof FeatureSpecUploadRejected
            ? error.message
            : '요청 전 확인에 실패했습니다. 다시 시도해주세요.'
          : '접수 여부가 불확실합니다. 기존 문서가 유지되었는지 단정할 수 없습니다. 다시 전송하지 않고 서버 상태를 자동으로 확인합니다.',
      })
    }
  }
  observe(id: number, current: ProjectDetail) {
    const before = this.get(id)
    if (!['accepted', 'unknown'].includes(before.phase)) return
    const newId = current.specDocument?.specDocumentId
    if (Number.isSafeInteger(newId) && newId !== before.previousId) {
      this.set(id, {
        phase: 'idle',
        message: '서버에서 새 기능명세서를 확인했습니다.',
      })
    }
  }
  async check(id: number): Promise<ProjectDetail> {
    const before = this.get(id)
    const current = await this.api.get(id)
    // A read that started before a new intent cannot release that intent's lock.
    if (this.get(id) !== before || before.phase === 'requesting') return current
    this.observe(id, current)
    if (
      ['accepted', 'unknown'].includes(before.phase) &&
      this.get(id) === before
    ) {
      this.set(id, {
        ...before,
        message:
          '새 문서를 아직 확인하지 못했습니다. 요청이 늦게 처리될 수 있어 다시 전송하지 않습니다.',
      })
    }
    return current
  }
}

export const featureSpecUpload = new FeatureSpecUploadStore()
