import { useRef, useState } from 'react'
import { useAnalysisStart } from '../analysis/useAnalysisStart'
import { projectAnalysis } from '../analysis/projectAnalysis'
import { AiConsentModal } from '../components/AiConsentModal'
import { Alert, Button, Card } from '../components/ui'
import { authenticatedFetch } from '../auth/session'
import { projectPaths } from '../lib/api'
import type { ProjectDetail } from '../lib/projectApi'

const extraction: Record<string, string> = {
  PENDING: '기능 추출 대기',
  PROCESSING: '기능 추출 중',
  COMPLETED: '기능 추출 완료',
  FAILED: '기능 추출 실패',
}
export function ProjectSpecification({ project }: { project: ProjectDetail }) {
  const consent = useAnalysisStart()
  const lock = useRef(false)
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [uncertain, setUncertain] = useState(false)
  async function upload() {
    if (!file || lock.current || uncertain) return
    lock.current = true
    setBusy(true)
    setMessage('')
    try {
      if (
        !(await consent.flow.requestConsent('feature-spec')) ||
        consent.flow.disposed
      )
        return
      const body = new FormData()
      body.append('file', file)
      let response: Response
      try {
        response = await authenticatedFetch(
          projectPaths.featureSpecs(project.id),
          { method: 'POST', body },
        )
      } catch {
        setUncertain(true)
        throw new Error(
          '등록 결과를 확인하지 못했습니다. 재전송하지 않고 서버 상태를 확인합니다.',
        )
      }
      if (!response.ok) {
        if (response.status >= 500 || response.status === 408)
          setUncertain(true)
        throw new Error(
          response.status === 409
            ? '이미 등록된 명세서가 있습니다. 서버 상태를 확인해주세요.'
            : '명세서 등록에 실패했습니다. 파일과 서버 상태를 확인해주세요.',
        )
      }
      setMessage('명세서를 등록했습니다. 기능 추출 상태는 자동으로 갱신됩니다.')
      setUncertain(true) // prevent a second upload until the saved document is visible
    } catch (cause) {
      if (!consent.flow.disposed)
        setMessage(
          cause instanceof Error
            ? cause.message
            : '명세서를 등록하지 못했습니다.',
        )
    } finally {
      lock.current = false
      if (!consent.flow.disposed) {
        setBusy(false)
        void projectAnalysis.refresh(project.id)
      }
    }
  }
  return (
    <section className="space-y-4">
      <h2 className="text-[22px] font-extrabold">기능명세서</h2>
      <Card>
        <h3 className="font-bold">프로젝트 공통 명세서</h3>
        <p className="mt-2 text-[13px] text-muted">
          {project.specDocument?.fileName ??
            '등록된 기능명세서가 없습니다. PDF를 등록해 기능 항목을 추출할 수 있습니다.'}
        </p>
        {project.specDocument ? (
          <p className="mt-3 text-sm text-primary">
            {extraction[project.specDocument.extractionStatus ?? ''] ??
              project.specDocument.extractionStatus ??
              '추출 상태 확인 중'}
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            <label className="block text-sm font-bold">
              기능명세서 PDF
              <input
                type="file"
                accept=".pdf,application/pdf"
                disabled={busy || uncertain}
                className="mt-2 block w-full text-sm"
                onChange={(e) => {
                  const next = e.target.files?.[0]
                  if (!next) {
                    setFile(null)
                    return
                  }
                  if (
                    !next.name.toLowerCase().endsWith('.pdf') ||
                    next.size === 0 ||
                    next.size > 20 * 1024 * 1024 ||
                    next.name.length > 255
                  ) {
                    setFile(null)
                    setMessage(
                      '20MB 이하의 비어 있지 않은 PDF를 선택해주세요. 파일 이름은 255자 이하여야 합니다.',
                    )
                    return
                  }
                  setFile(next)
                  setMessage('')
                }}
              />
            </label>
            <Button
              disabled={!file || uncertain}
              loading={busy}
              onClick={() => void upload()}
            >
              명세서 등록
            </Button>
          </div>
        )}
      </Card>
      {message && <Alert tone="info">{message}</Alert>}
      <p className="text-[13px] text-muted">
        기능–PR 대조는 준비 중입니다. 기능 추출 완료는 구현 완료나 PR 대조
        완료를 의미하지 않습니다.
      </p>
      <AiConsentModal flow={consent.flow} state={consent.state} />
    </section>
  )
}
