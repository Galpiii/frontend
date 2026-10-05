import { retryFailedPrs, PrRetryRejected } from './api.ts'
import { ConsentRequired } from '../consent/api.ts'
type State = {
  phase: 'idle' | 'requesting' | 'success' | 'rejected' | 'unknown'
  message?: string
}
const idle: State = { phase: 'idle' }
/** Shared across drawer closes and route remounts; no effect ever replays this POST. */
export class PrRetryStore {
  private states = new Map<number, State>()
  private listeners = new Set<() => void>()
  private api: typeof retryFailedPrs
  constructor(api = retryFailedPrs) {
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
    this.listeners.forEach((l) => l())
  }
  /**
   * Called after an explicit status check. With nothing pending no retry can
   * still be in flight, so a finished or an uncertain request both unlock.
   */
  allowAfterStatus(id: number, pendingCount: number) {
    const { phase } = this.get(id)
    if (phase !== 'success' && phase !== 'unknown') return
    if (pendingCount === 0) this.set(id, idle)
    else if (phase === 'unknown')
      this.set(id, {
        phase,
        message: `대기 중인 분석 ${pendingCount}건이 끝난 뒤 다시 요청할 수 있습니다.`,
      })
  }
  async request(id: number, repositoryId?: number) {
    if (['requesting', 'unknown', 'success'].includes(this.get(id).phase))
      return
    this.set(id, {
      phase: 'requesting',
      message: '실패한 PR의 재분석을 요청하고 있습니다.',
    })
    try {
      const result = await this.api(id, repositoryId)
      this.set(id, {
        phase: 'success',
        message: result.requeuedCount
          ? `실패한 PR ${result.requeuedCount}개의 재분석을 접수했습니다. 성공한 요약은 유지됩니다.`
          : '다시 분석할 실패 PR이 없습니다. 최신 상태를 확인해주세요.',
      })
    } catch (error) {
      const rejected =
        error instanceof PrRetryRejected || error instanceof ConsentRequired
      this.set(id, {
        phase: rejected ? 'rejected' : 'unknown',
        message:
          error instanceof ConsentRequired
            ? '현재 AI 전송 동의가 필요합니다. 다시 요청하면 동의를 확인합니다.'
            : rejected
              ? '재분석 요청이 거절되었습니다. 다시 시도할 수 있습니다.'
              : '접수 여부가 불확실합니다. 다시 전송하지 않고 상태를 조회해주세요. 대기 중인 분석이 없으면 상태 확인 후 다시 요청할 수 있습니다.',
      })
    }
  }
}
export const prRetry = new PrRetryStore()
