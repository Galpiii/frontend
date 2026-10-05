import { Alert, Button, Checkbox, Modal } from '../../components/ui'
import type { AnalysisFlow, FlowState } from './analysisFlow'
import { ConsentNotice } from './ConsentNotice'
import { useState } from 'react'
import consentDocument from '../../../docs/ai-data-consent.draft.md?raw'

function ConsentChoices({
  flow,
  state,
}: {
  flow: AnalysisFlow
  state: FlowState
}) {
  const [ai, setAi] = useState(false)
  const [transfer, setTransfer] = useState(false)
  return (
    <div className="space-y-3 rounded-lg border border-line p-3">
      <Checkbox
        label={
          flow.consentPurpose === 'feature-spec'
            ? '[필수] 기능명세서의 외부 AI 처리에 동의합니다.'
            : flow.consentPurpose === 'feature-match'
              ? '[필수] 기능명세서와 Git 작업 데이터의 외부 AI 처리에 동의합니다.'
              : '[필수] 외부 AI를 이용한 Git 작업 데이터 처리에 동의합니다.'
        }
        checked={ai}
        disabled={state.phase !== 'consent'}
        onChange={(event) => {
          const checked = event.target.checked
          setAi(checked)
          flow.setChecked(checked && transfer)
        }}
      />
      {
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
      }
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
  const featureSpec = flow.consentPurpose === 'feature-spec'
  const featureMatch = flow.consentPurpose === 'feature-match'
  return (
    <Modal
      open={state.phase !== 'idle' && state.phase !== 'checking'}
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
                  ? featureSpec
                    ? '동의하고 명세서 전송'
                    : featureMatch
                      ? '동의하고 기능대조 준비'
                      : '동의하고 저장소 연결'
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
            {featureSpec
              ? '선택한 PDF를 OpenAI에 전송해 기능 항목을 추출합니다. 아직 파일을 전송하거나 분석을 시작하지 않았습니다.'
              : featureMatch
                ? '기능과 PR 정보를 OpenAI에 전송해 관련 근거를 찾습니다. 아직 기능대조를 시작하지 않았습니다.'
                : '아직 저장소 연결과 분석을 시작하지 않았습니다. 동의 후 진행합니다.'}
          </p>
        )}
        {starting && (
          <p role="status" className="text-muted">
            분석을 요청하고 있습니다. 결과를 확인할 때까지 기다려주세요.
          </p>
        )}
        {state.consent && (
          <>
            <div
              tabIndex={0}
              aria-label="외부 AI 전송 동의서"
              className="max-h-[40dvh] overflow-y-auto rounded-lg border border-line bg-subtle p-4 sm:p-5"
            >
              <ConsentNotice text={consentDocument} />
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
