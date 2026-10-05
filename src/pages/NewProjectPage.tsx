import { useEffect, useRef, useState, type DragEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { ONBOARDING_STEPS } from '../features/projects/onboardingSteps'
import { AppHeader, AppShell } from '../components/layout'
import { Alert, Button, Card, Input, Modal, Stepper } from '../components/ui'
import { authenticatedFetch, SessionError } from '../features/auth/session'
import { projectPaths } from '../lib/api'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import { cn } from '../lib/cn'
import { createProject, skipProjectSpec } from '../features/projects/api'
import { useAnalysisStart } from '../features/consent/useAnalysisStart'
import { AiConsentModal } from '../features/consent/AiConsentModal'

const MAX_SPEC_BYTES = 20 * 1024 * 1024
const MAX_NAME_LENGTH = 100

/** Mirrors the backend's FEATURE-SPEC-FILE rules so a bad file never uploads. */
function validateSpecFile(file: File) {
  if (!file.name.toLowerCase().endsWith('.pdf'))
    return 'PDF 파일만 등록할 수 있습니다.'
  if (file.size === 0) return '비어 있는 파일은 등록할 수 없습니다.'
  if (file.size > MAX_SPEC_BYTES) return '파일 크기는 20MB를 넘을 수 없습니다.'
  if (file.name.length > 255) return '파일 이름은 255자를 넘을 수 없습니다.'
  return ''
}

/** The upload endpoint documents its failures by status; each needs its own fix. */
function specUploadMessage(status: number) {
  if (status === 400)
    return '기능명세서를 읽을 수 없습니다. 스캔본이나 암호가 걸린 PDF인지 확인해주세요.'
  if (status === 409) return '이미 등록된 기능명세서가 있습니다.'
  if (status === 503)
    return '분석 요청이 몰려 접수하지 못했습니다. 잠시 후 같은 파일로 다시 등록해주세요.'
  return '기능명세서를 등록하지 못했습니다. 잠시 후 다시 시도해주세요.'
}

export function NewProjectPage({
  project,
}: {
  project?: { id: number; name: string }
}) {
  useDocumentTitle(project ? '프로젝트 생성 이어하기' : '새 프로젝트')
  const navigate = useNavigate()
  const fileInput = useRef<HTMLInputElement>(null)
  const consent = useAnalysisStart()
  const pending = useRef(false)
  const requests = useRef(new AbortController())
  useEffect(() => {
    const controller = new AbortController()
    requests.current = controller
    return () => controller.abort()
  }, [])
  // A retry reuses the project already created; creating a second one is worse
  // than a failed upload the user can repeat.
  const [createdId, setCreatedId] = useState<number | null>(project?.id ?? null)

  const [name, setName] = useState(project?.name ?? '')
  const [nameError, setNameError] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState('')
  const [dragging, setDragging] = useState(false)
  const [skipAsk, setSkipAsk] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  function pickFile(picked: File | undefined | null) {
    if (pending.current) return
    if (!picked) return
    const message = validateSpecFile(picked)
    setFileError(message)
    setFile(message ? null : picked)
    setSubmitError('')
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setDragging(false)
    pickFile(event.dataTransfer.files?.[0])
  }

  async function submit(withSpec: boolean) {
    if (pending.current) return
    const trimmed = name.trim()
    if (!trimmed) {
      setNameError('프로젝트 이름을 입력해주세요.')
      return
    }
    if (withSpec && !file) return
    pending.current = true
    setSubmitError('')
    const signal = requests.current.signal
    try {
      if (withSpec) {
        const agreed = await consent.flow.requestConsent('feature-spec')
        if (!agreed || consent.flow.disposed || signal.aborted) return
      }
      setSubmitting(true)
      let projectId = createdId
      if (projectId === null) {
        projectId = (await createProject(trimmed, signal)).id
        if (signal.aborted) return
        setCreatedId(projectId)
      }
      if (withSpec && file) {
        const form = new FormData()
        // Let the browser set multipart boundaries; a manual header breaks them.
        form.append('file', file)
        const response = await authenticatedFetch(
          projectPaths.featureSpecs(projectId),
          { method: 'POST', body: form, signal },
        )
        if (!response.ok) throw new Error(specUploadMessage(response.status))
      } else {
        await skipProjectSpec(projectId, signal)
      }
      // Replace, so Back cannot return to a form whose project already exists.
      if (signal.aborted) return
      navigate(`/projects/${projectId}/repositories`, { replace: true })
    } catch (cause) {
      if (signal.aborted) return
      // An expiry is already routing us to sign-in; no request error on top.
      if (cause instanceof SessionError && cause.status === 401) return
      setSubmitError(
        cause instanceof Error
          ? cause.message
          : '요청을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.',
      )
    } finally {
      pending.current = false
      if (!signal.aborted) setSubmitting(false)
    }
  }

  return (
    <AppShell
      header={
        <AppHeader
          context={project ? '프로젝트 생성 이어하기' : '새 프로젝트'}
        />
      }
    >
      <div className="mx-auto flex max-w-[720px] flex-col gap-4 py-1 break-keep sm:py-2">
        <Link to="/projects" className="self-start text-[13.5px] font-bold">
          ← 프로젝트 목록
        </Link>
        <Stepper steps={ONBOARDING_STEPS} current={0} />
        {project && (
          <Alert tone="info">
            명세서 등록부터 이어서 진행해주세요. 업로드하지 않은 PDF는 다시
            선택해야 합니다.
          </Alert>
        )}

        <div>
          <h1 className="text-[22px] font-extrabold tracking-[-.4px]">
            기능명세서부터 등록하세요
          </h1>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">
            기능명세서에서 추출한 기능 항목과 GitHub PR을 연결해 기능별 관련
            작업을 보여줍니다. 지금 등록하지 않아도 나중에 기능대조 탭에서
            등록할 수 있습니다.
          </p>
        </div>

        <div className="space-y-2 text-sm text-muted">
          <p>
            명세서를 등록하면 PDF를 OpenAI에 전송해 기능 항목을 추출합니다. 전송
            전에 동의를 확인합니다.
          </p>
        </div>

        <Card>
          <Input
            label="프로젝트 이름"
            required
            value={name}
            maxLength={MAX_NAME_LENGTH}
            disabled={submitting || createdId !== null}
            placeholder="예: GDG 통합 플랫폼"
            error={nameError}
            hint={
              createdId !== null
                ? '프로젝트가 생성되었습니다. 이름은 프로젝트 목록의 정보 수정 메뉴에서 변경할 수 있습니다.'
                : undefined
            }
            onChange={(event) => {
              setName(event.target.value)
              setNameError('')
            }}
          />
        </Card>

        <input
          ref={fileInput}
          type="file"
          accept="application/pdf,.pdf"
          hidden
          onChange={(event) => {
            pickFile(event.target.files?.[0])
            // Allow re-picking the same file after clearing it.
            event.target.value = ''
          }}
        />

        {file ? (
          <Card className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="flex size-9 shrink-0 items-center justify-center rounded-[9px] border border-success-border bg-success-bg text-xs font-bold text-success"
            >
              PDF
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-bold">{file.name}</p>
              <p className="mt-0.5 text-xs text-faint">
                {(file.size / 1024 / 1024).toFixed(1)}MB · 업로드 대기
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              disabled={submitting}
              onClick={() => fileInput.current?.click()}
            >
              다른 파일 선택
            </Button>
          </Card>
        ) : (
          <div
            onDragOver={(event) => {
              event.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={cn(
              'flex flex-col items-center gap-2.5 rounded-[14px] border-2 border-dashed px-6 py-10 text-center',
              dragging
                ? 'border-primary bg-accent-bg'
                : 'border-accent-border bg-subtle',
            )}
          >
            <span
              aria-hidden="true"
              className="flex size-11 items-center justify-center rounded-xl bg-accent-bg text-xl text-primary"
            >
              ⇪
            </span>
            <p className="text-[14.5px] font-extrabold">
              PDF 파일을 끌어다 놓거나
            </p>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => fileInput.current?.click()}
            >
              파일 선택
            </Button>
            <p className="text-xs text-faint">
              PDF만 지원 · 최대 20MB · 프로젝트당 활성 문서 1개
            </p>
          </div>
        )}

        {fileError && <Alert tone="danger">{fileError}</Alert>}

        {submitError && (
          <Alert
            tone="danger"
            action={
              createdId !== null && (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={submitting}
                  onClick={() => setSkipAsk(true)}
                >
                  저장소 연결로 계속
                </Button>
              )
            }
          >
            {submitError}
            {createdId !== null &&
              ' 프로젝트는 이미 만들어졌으니 다시 시도하거나 다음 단계로 넘어갈 수 있습니다.'}
          </Alert>
        )}

        <div className="flex items-center gap-3 border-t border-line pt-4">
          <Button
            variant="secondary"
            disabled={submitting || consent.state.phase !== 'idle'}
            onClick={() => {
              if (!name.trim()) {
                setNameError('프로젝트 이름을 입력해주세요.')
                return
              }
              setSkipAsk(true)
            }}
          >
            명세서는 나중에 등록
          </Button>
          <span className="flex-1" />
          <Button
            size="lg"
            loading={submitting}
            disabled={!file || consent.state.phase !== 'idle'}
            onClick={() => void submit(true)}
          >
            다음 · 저장소 연결 →
          </Button>
        </div>
      </div>

      <Modal
        open={skipAsk}
        onClose={() => setSkipAsk(false)}
        title="기능명세서 없이 계속할까요?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setSkipAsk(false)}>
              돌아가서 등록하기
            </Button>
            <Button
              variant="dark"
              loading={submitting}
              onClick={() => {
                setSkipAsk(false)
                void submit(false)
              }}
            >
              건너뛰고 저장소 연결
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <Alert tone="warning">
            기능명세서를 등록하지 않으면 <b>기능대조를 사용할 수 없습니다.</b>
          </Alert>
          <p className="text-[13px] leading-loose text-body">
            · 다음 단계에서 저장소를 연결하면 PR 목록은 그대로 사용할 수
            있습니다.
            <br />· 기능별 관련 PR 근거는 확인할 수 없습니다.
            <br />· 나중에 기능대조 탭에서 명세서를 등록하면 바로 사용할 수
            있습니다.
          </p>
        </div>
      </Modal>
      <AiConsentModal flow={consent.flow} state={consent.state} />
    </AppShell>
  )
}
