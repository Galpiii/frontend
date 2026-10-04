import {
  FeatureReviewMutationRejected,
  getFeatureReviewList,
  getFeatureReviewSummary,
} from '../lib/featureReviewApi.ts'

type Snapshot = {
  phase: 'idle' | 'sending' | 'checking' | 'read-error' | 'uncertain'
  label: string
  notice: { tone: 'success' | 'warning' | 'danger'; message: string } | null
  revision: number
}

// A document owns its request even when no review screen is subscribed.
class FeatureReviewOwner {
  private state: Snapshot = {
    phase: 'idle',
    label: '',
    notice: null,
    revision: 0,
  }
  private listeners = new Set<() => void>()
  private uncertain = false
  private documentId: number
  constructor(documentId: number) {
    this.documentId = documentId
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
  async run(label: string, request: () => Promise<void>, success: string) {
    if (this.state.phase !== 'idle') return false
    this.publish({ phase: 'sending', label, notice: null })
    try {
      await request()
      this.publish({ notice: { tone: 'success', message: success } })
    } catch (error) {
      this.uncertain = !(error instanceof FeatureReviewMutationRejected)
      this.publish({
        notice: {
          tone: this.uncertain ? 'warning' : 'danger',
          message:
            error instanceof Error
              ? error.message
              : '처리 결과를 확인하지 못했습니다.',
        },
      })
    }
    await this.reconcile()
    return true
  }
  async reconcile() {
    if (this.state.phase === 'checking') return
    this.publish({ phase: 'checking', label: '최신 기능 목록 확인 중' })
    const results = await Promise.allSettled([
      getFeatureReviewList(this.documentId, 'ALL'),
      getFeatureReviewSummary(this.documentId),
    ])
    const failed = results.some((result) => result.status === 'rejected')
    this.publish({
      phase: failed ? 'read-error' : this.uncertain ? 'uncertain' : 'idle',
      label: '',
      revision: this.state.revision + 1,
    })
  }
  refresh = async () => {
    if (this.state.phase === 'sending' || this.state.phase === 'checking')
      return
    await this.reconcile()
  }
}
const owners = new Map<number, FeatureReviewOwner>()
export function getFeatureReviewOwner(documentId: number) {
  let owner = owners.get(documentId)
  if (!owner) {
    owner = new FeatureReviewOwner(documentId)
    owners.set(documentId, owner)
  }
  return owner
}
