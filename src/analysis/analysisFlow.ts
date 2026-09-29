import { SessionError } from '../auth/session.ts'
import {
  agreeAiConsent,
  ConsentRequired,
  ConsentVersionChanged,
  getAiConsent,
  type AiConsent,
} from '../lib/consentApi.ts'
import { startProjectAnalysis } from '../lib/projectApi.ts'

type Run = Awaited<ReturnType<typeof startProjectAnalysis>>
export interface FlowState {
  phase: 'idle' | 'checking' | 'consent' | 'saving' | 'starting' | 'error'
  consent?: AiConsent
  checked: boolean
  message?: string
}
const idle: FlowState = { phase: 'idle', checked: false }
const defaultApi = {
  get: getAiConsent,
  agree: agreeAiConsent,
  start: startProjectAnalysis,
}

/** Owns a single user intent. Cancelling invalidates all late responses. */
export class AnalysisFlow {
  state: FlowState = idle
  disposed = false
  activate() {
    this.disposed = false
  }
  private active: {
    id: number | null
    purpose: 'repositories' | 'feature-spec'
    controller: AbortController
    resolve: (run: Run | null) => void
    reject: (error: unknown) => void
  } | null = null
  constructor(privateNotify: (state: FlowState) => void, api = defaultApi) {
    this.notify = privateNotify
    this.api = api
  }
  private notify: (state: FlowState) => void
  private api: typeof defaultApi
  private update(state: FlowState) {
    this.state = state
    this.notify(state)
  }

  get consentOnly() {
    return this.active?.id === null
  }

  get consentPurpose() {
    return this.active?.purpose ?? 'repositories'
  }

  async requestConsent(
    purpose: 'repositories' | 'feature-spec' = 'repositories',
  ): Promise<boolean> {
    return (await this.begin(null, purpose)) !== null
  }

  start(id: number): Promise<Run | null> {
    return this.begin(id, 'repositories')
  }

  private begin(
    id: number | null,
    purpose: 'repositories' | 'feature-spec',
  ): Promise<Run | null> {
    if (this.active || this.disposed) return Promise.resolve(null)
    return new Promise((resolve, reject) => {
      this.active = {
        id,
        purpose,
        resolve,
        reject,
        controller: new AbortController(),
      }
      void this.check(false)
    })
  }

  setChecked(checked: boolean) {
    if (this.state.phase === 'consent') this.update({ ...this.state, checked })
  }

  cancel(silent = false) {
    if (silent) this.disposed = true
    // Once dispatched, an analysis may run on the server even if aborted.
    if (!silent && this.state.phase === 'starting') return
    const operation = this.active
    this.active = null
    operation?.controller.abort()
    if (!silent) this.update(idle)
    operation?.resolve(null)
  }

  retry() {
    if (this.state.phase === 'error') void this.check(true)
  }

  private async check(force: boolean, message?: string) {
    const operation = this.active
    if (!operation) return
    this.update({ phase: 'checking', checked: false, message })
    try {
      const consent = await this.api.get(operation.controller.signal)
      if (this.active !== operation) return
      if (consent.agreed && !force) await this.dispatch()
      else this.update({ phase: 'consent', consent, checked: false, message })
    } catch (error) {
      this.preflightError(operation, error)
    }
  }

  async confirm() {
    const operation = this.active
    const consent = this.state.consent
    if (
      !operation ||
      this.state.phase !== 'consent' ||
      !this.state.checked ||
      !consent
    )
      return
    this.update({ phase: 'saving', consent, checked: true })
    try {
      await this.api.agree(consent.currentVersion, operation.controller.signal)
      if (this.active !== operation) return
      await this.dispatch()
    } catch (error) {
      if (this.active !== operation) return
      if (error instanceof ConsentVersionChanged) {
        await this.check(
          true,
          '고지 내용이 변경되었습니다. 최신 내용을 확인하고 다시 동의해주세요.',
        )
      } else this.preflightError(operation, error)
    }
  }

  private preflightError(operation: typeof this.active, error: unknown) {
    if (this.active !== operation || !operation) return
    if (error instanceof SessionError && error.status === 401) {
      this.finish(null, error)
      return
    }
    this.update({
      phase: 'error',
      checked: false,
      message:
        this.state.phase === 'saving'
          ? '동의 저장 결과를 확인하지 못했습니다. 분석은 시작하지 않았습니다. 다시 시도해주세요.'
          : '동의 정보를 불러오지 못했습니다. 분석은 시작하지 않았습니다. 다시 시도해주세요.',
    })
  }

  private async dispatch() {
    const operation = this.active
    if (!operation) return
    if (operation.id === null) {
      this.finish({ inaccessibleRepositoryCount: 0 })
      return
    }
    this.update({ phase: 'starting', checked: false })
    try {
      const result = await this.api.start(
        operation.id,
        operation.controller.signal,
      )
      if (this.active === operation) this.finish(result)
    } catch (error) {
      if (this.active !== operation) return
      if (error instanceof ConsentRequired) {
        await this.check(
          true,
          '분석을 시작하려면 현재 고지 내용에 동의해야 합니다.',
        )
      } else this.finish(null, error)
    }
  }

  private finish(run: Run | null, error?: unknown) {
    const operation = this.active
    this.active = null
    this.update(idle)
    if (error !== undefined) operation?.reject(error)
    else operation?.resolve(run)
  }
}
