import { useState } from 'react'
import draft from '../../docs/ai-data-consent.draft.md?raw'
import { Alert, Button, Checkbox, Modal } from './ui'
import { ConsentNotice } from './ConsentNotice'

/** Development-only preview: deliberately has no auth, consent or analysis API. */
export function AiConsentDraftPreview() {
  const [open, setOpen] = useState(false)
  const [ai, setAi] = useState(false)
  const [transfer, setTransfer] = useState(false)
  if (!import.meta.env.DEV) return null
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          setAi(false)
          setTransfer(false)
          setOpen(true)
        }}
      >
        동의서 초안 미리보기
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        closeOnBackdrop={false}
        title="외부 AI 전송 동의 · 검토용 초안"
        description="작성 중인 문서의 내용과 화면 구성을 확인하는 미리보기입니다."
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              미리보기 닫기
            </Button>
            <Button disabled>초안은 동의할 수 없습니다</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Alert tone="warning" title="검토용 초안 · 시행 전">
            미정인 항목이 포함되어 있습니다. 체크해도 동의는 저장되지 않으며
            파일 전송, 저장소 연결, 분석을 시작하지 않습니다.
          </Alert>
          <div
            tabIndex={0}
            aria-label="동의서 초안 본문"
            className="max-h-[40dvh] overflow-y-auto rounded-lg border border-line bg-subtle p-4 sm:p-5"
          >
            <ConsentNotice text={draft} />
          </div>
          <div className="space-y-3 rounded-lg border border-line p-3">
            <Checkbox
              label="[필수] 외부 AI를 이용한 작업 데이터 처리에 동의합니다. (미리보기)"
              checked={ai}
              onChange={(event) => setAi(event.target.checked)}
            />
            <Checkbox
              label="[필수] 개인정보의 국외 이전에 동의합니다. (미리보기)"
              checked={transfer}
              onChange={(event) => setTransfer(event.target.checked)}
            />
          </div>
        </div>
      </Modal>
    </>
  )
}
