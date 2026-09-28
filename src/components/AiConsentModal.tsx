import { Alert, Button, Checkbox, Modal } from './ui'
import type { AnalysisFlow, FlowState } from '../analysis/analysisFlow'
import { ConsentNotice } from './ConsentNotice'
import { useState } from 'react'

function ConsentChoices({
  flow,
  state,
}: {
  flow: AnalysisFlow
  state: FlowState
}) {
  const [ai, setAi] = useState(false)
  const [transfer, setTransfer] = useState(false)
  // Do not collect an overseas-transfer agreement until it is covered by the
  // server's versioned notice. Both choices are included in that one version.
  const includesTransfer = state.consent?.notice.includes('국외 이전') ?? false
  return (
    <div className="space-y-3 rounded-lg border border-line p-3">
      <Checkbox
        label="[필수] 외부 AI를 이용한 Git 작업 데이터 처리에 동의합니다."
        checked={ai}
        disabled={state.phase !== 'consent'}
        onChange={(event) => {
          const checked = event.target.checked
          setAi(checked)
          flow.setChecked(checked && (!includesTransfer || transfer))
        }}
      />
      {includesTransfer && (
        <Checkbox
          label="[필수] 개인정보의 국외 이전에 동의합니다."
          checked={transfer}
          disabled={state.phase !== 'consent'}
          onChange={(event) => {
            const checked = event.target.checked
            setTransfer(checked)
            flow.setChecked(ai && checked)
          }}
        />
      )}
      <p className="text-xs leading-relaxed text-muted">
        동의하지 않으면 취소를 눌러 돌아갈 수 있습니다.
      </p>
    </div>
  )
}

export function AiConsentModal({
  flow,
  state,
}: {
  flow: AnalysisFlow
  state: FlowState
}) {
  const starting = state.phase === 'starting'
  return (
    <Modal
      open={state.phase !== 'idle'}
      onClose={() => flow.cancel()}
      closeDisabled={starting}
      closeOnBackdrop={false}
      title={
        state.consent?.agreedVersion
          ? '외부 AI 전송 재동의'
          : '외부 AI 전송 동의'
      }
      description="분석에 필요한 정보를 외부 AI에 전송하기 전에 아래 내용을 확인해주세요."
      footer={
        <>
          <Button
            variant="secondary"
            disabled={starting}
            onClick={() => flow.cancel()}
          >
            취소
          </Button>
          {state.phase === 'error' ? (
            <Button onClick={() => flow.retry()}>다시 시도</Button>
          ) : (
            <Button
              disabled={!state.checked || state.phase !== 'consent'}
              loading={state.phase === 'saving' || starting}
              onClick={() => void flow.confirm()}
            >
              {starting
                ? '분석 요청 중…'
                : flow.consentOnly
                  ? '동의하고 저장소 연결'
                  : '동의하고 분석 시작'}
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        {state.message && (
          <Alert tone={state.phase === 'error' ? 'danger' : 'warning'}>
            {state.message}
          </Alert>
        )}
        {state.phase === 'checking' && (
          <p role="status" className="text-muted">
            동의 정보를 확인하고 있습니다…
          </p>
        )}
        {flow.consentOnly && (
          <p className="text-sm text-muted">
            아직 저장소 연결과 분석을 시작하지 않았습니다. 동의 후 진행합니다.
          </p>
        )}
        {starting && (
          <p role="status" className="text-muted">
            분석을 요청하고 있습니다. 결과를 확인할 때까지 기다려주세요.
          </p>
        )}
        {state.consent && (
          <>
            <p className="text-xs text-muted">
              고지 버전: {state.consent.currentVersion}
            </p>
            <div
              tabIndex={0}
              aria-label="외부 AI 전송 동의서"
              className="max-h-[40dvh] overflow-y-auto rounded-lg border border-line bg-subtle p-4 sm:p-5"
            >
              <ConsentNotice text={state.consent.notice} />
            </div>
            <ConsentChoices
              key={state.consent.currentVersion}
              flow={flow}
              state={state}
            />
            {state.phase === 'saving' && (
              <p role="status" className="text-xs text-muted">
                동의를 저장하고 있습니다. 취소하면 분석은 시작하지 않지만 동의
                기록은 저장될 수 있습니다.
              </p>
            )}
          </>
        )}
      </div>
    </Modal>
  )
}
