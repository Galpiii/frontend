import {
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
  type RefObject,
} from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useAnalysisStart } from '../analysis/useAnalysisStart'
import { projectAnalysis } from '../analysis/projectAnalysis'
import { AiConsentModal } from '../components/AiConsentModal'
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  FilterChip,
  Stepper,
  type Tone,
} from '../components/ui'
import {
  FeatureSpecUploadRejected,
  FeatureSpecUploadUnknown,
  getFeatureSpecStage,
  uploadFeatureSpec,
  validateFeatureSpecFile,
  type FeatureSpecStage,
} from '../lib/featureSpecApi'
import { getProjectDetail, type ProjectDetail } from '../lib/projectApi'

const extractionLabel: Record<string, string> = {
  PENDING: '기능 추출 대기',
  PROCESSING: '기능 추출 중',
  COMPLETED: '기능 추출 완료',
  FAILED: '기능 추출 실패',
}

function stageStep(stage: FeatureSpecStage) {
  if (stage === 'empty') return 0
  if (stage === 'extracting' || stage === 'failed' || stage === 'unknown')
    return 1
  return 2
}

function formatFileSize(bytes: number) {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))}KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

function SpecHeader({ stage }: { stage: FeatureSpecStage }) {
  return (
    <header className="flex max-w-[1020px] flex-col gap-3">
      <div>
        <h1 className="text-[23px] font-extrabold tracking-[-.4px]">
          기능대조
        </h1>
        <p className="mt-1 max-w-2xl text-[13.5px] leading-relaxed text-muted">
          기능명세서에서 추출한 기능과 연결된 저장소의 PR을 대조합니다.
        </p>
      </div>
      <Stepper
        steps={['기능명세서 등록', '기능 추출', '기능대조']}
        current={stageStep(stage)}
      />
    </header>
  )
}

function ViewSelector({
  value,
  onChange,
}: {
  value: 'spec' | 'results'
  onChange: (value: 'spec' | 'results') => void
}) {
  return (
    <div
      className="flex flex-wrap items-center gap-2"
      aria-label="기능대조 보기"
    >
      <FilterChip selected={value === 'spec'} onClick={() => onChange('spec')}>
        기능명세서
      </FilterChip>
      <FilterChip
        selected={value === 'results'}
        onClick={() => onChange('results')}
      >
        기능별 대조 결과
      </FilterChip>
      <span className="text-xs leading-relaxed text-faint">
        진행 단계와 관계없이 두 화면을 오갈 수 있습니다.
      </span>
    </div>
  )
}

interface UploadPanelProps {
  file: File | null
  busy: boolean
  uncertain: boolean
  dragging: boolean
  repositoryCount: number
  message: string
  messageTone: Tone
  inputRef: RefObject<HTMLInputElement | null>
  onFile: (file?: File) => void
  onUpload: () => void
  onCheckStatus: () => void
  onDragging: (value: boolean) => void
  compact?: boolean
}

function UploadPanel({
  file,
  busy,
  uncertain,
  dragging,
  repositoryCount,
  message,
  messageTone,
  inputRef,
  onFile,
  onUpload,
  onCheckStatus,
  onDragging,
  compact = false,
}: UploadPanelProps) {
  const drop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    onDragging(false)
    if (busy || uncertain) return
    onFile(event.dataTransfer.files[0])
  }
  return (
    <div className="flex max-w-[680px] flex-col gap-4">
      {!compact && (
        <>
          <Alert tone="warning">
            기능대조는 기능명세서가 있어야 사용할 수 있습니다. PDF를 등록하면
            기능별 관련 PR 근거를 확인할 수 있습니다.
          </Alert>
          <p className="text-[13.5px] text-muted">
            프로젝트 공통 PDF 기능명세서 하나를 등록합니다.
          </p>
        </>
      )}
      <Alert tone="info">
        이 기능명세서는 프로젝트에 연결된 모든 저장소
        {repositoryCount > 0 ? ` ${repositoryCount}개` : ''}에 공통으로
        적용됩니다. 여러 저장소에 나뉜 작업도 하나의 기능 항목에서 함께 확인할
        수 있습니다.
      </Alert>
      <div
        onDragEnter={(event) => {
          event.preventDefault()
          if (!busy && !uncertain) onDragging(true)
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node))
            onDragging(false)
        }}
        onDrop={drop}
        className={`flex flex-col items-center gap-3 rounded-[14px] border-2 border-dashed px-6 py-8 text-center transition-colors ${
          dragging
            ? 'border-primary bg-accent-bg'
            : 'border-accent-border bg-info-bg'
        }`}
      >
        <span
          aria-hidden="true"
          className="flex size-11 items-center justify-center rounded-xl bg-accent-bg text-xl font-bold text-primary"
        >
          ↑
        </span>
        <div>
          <p className="text-[14.5px] font-extrabold">
            PDF 파일을 끌어다 놓거나
          </p>
          <p className="mt-1 text-xs text-faint">
            PDF만 지원 · 최대 20MB · 프로젝트당 활성 문서 1개
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,application/pdf"
          disabled={busy || uncertain}
          aria-label="기능명세서 PDF 선택"
          className="sr-only"
          onChange={(event) => onFile(event.target.files?.[0])}
        />
        <Button
          variant="secondary"
          size="sm"
          disabled={busy || uncertain}
          onClick={() => inputRef.current?.click()}
        >
          파일 선택
        </Button>
      </div>
      {file && (
        <Card className="flex flex-wrap items-center justify-between gap-3 py-3">
          <div className="min-w-0">
            <p className="truncate text-[13.5px] font-bold">{file.name}</p>
            <p className="mt-0.5 text-xs text-faint">
              {formatFileSize(file.size)}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            disabled={busy || uncertain}
            onClick={() => onFile()}
          >
            선택 취소
          </Button>
        </Card>
      )}
      {message && <Alert tone={messageTone}>{message}</Alert>}
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={!file || uncertain}
          loading={busy && !uncertain}
          onClick={onUpload}
        >
          업로드하고 분석하기
        </Button>
        {uncertain && (
          <Button variant="secondary" loading={busy} onClick={onCheckStatus}>
            서버 상태 확인
          </Button>
        )}
      </div>
      {!compact && (
        <div className="space-y-1 text-[13px] leading-relaxed text-muted">
          <p>· PDF를 등록하지 않아도 PR 목록은 계속 사용할 수 있습니다.</p>
          <p>· 등록 결과가 불확실하면 자동으로 다시 전송하지 않습니다.</p>
          <p>· 기능 목록과 대조 결과는 서버에서 제공되는 상태만 표시합니다.</p>
        </div>
      )}
    </div>
  )
}

function ExtractingPanel({ project }: { project: ProjectDetail }) {
  const status = project.specDocument?.extractionStatus ?? ''
  return (
    <Card className="mx-auto mt-10 flex max-w-[540px] flex-col items-center gap-4 px-6 py-8 text-center">
      <span
        aria-hidden="true"
        className="size-6 animate-spin rounded-full border-[3px] border-primary border-t-transparent motion-reduce:animate-none"
      />
      <div>
        <h2 className="text-[15px] font-extrabold">
          {status === 'PENDING'
            ? '기능명세서 분석을 기다리고 있습니다'
            : '기능명세서에서 기능을 추출하고 있습니다'}
        </h2>
        <p className="mt-2 text-[13px] leading-relaxed text-muted">
          {project.specDocument?.fileName} · 완료되면 이 화면에 결과 상태가
          표시됩니다.
        </p>
      </div>
      <Badge tone="info">
        {extractionLabel[status] ?? '기능 추출 상태 확인 중'}
      </Badge>
    </Card>
  )
}

function UnknownStatusPanel({
  project,
  onRefresh,
}: {
  project: ProjectDetail
  onRefresh: () => void
}) {
  return (
    <Card className="max-w-[680px] border-warning-border">
      <Badge tone="warning">상태 확인 필요</Badge>
      <h2 className="mt-3 text-[16px] font-extrabold">
        기능명세서의 현재 상태를 확인하지 못했습니다
      </h2>
      <p className="mt-2 text-[13px] leading-relaxed text-muted">
        {project.specDocument?.fileName} 문서는 유지되어 있습니다. 다시
        업로드하지 않고 서버 상태를 먼저 확인해주세요.
      </p>
      <Button className="mt-4" variant="secondary" onClick={onRefresh}>
        상태 다시 확인
      </Button>
    </Card>
  )
}

function ReadyPanel({ project }: { project: ProjectDetail }) {
  return (
    <div className="flex max-w-[760px] flex-col gap-4">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-extrabold text-faint">
              기능명세서 분석 완료
            </p>
            <h2 className="mt-1 truncate text-[18px] font-extrabold">
              {project.specDocument?.fileName}
            </h2>
            <p className="mt-2 text-[13px] leading-relaxed text-muted">
              연결된 저장소 {project.repositories.length}개에 공통으로 사용할
              기능명세서입니다.
            </p>
          </div>
          <Badge tone="success">기능 추출 완료</Badge>
        </div>
        <div className="mt-4 border-t border-line pt-4">
          <Button
            variant="secondary"
            size="sm"
            disabled
            title="기능명세서 교체 기능은 준비 중입니다."
          >
            기능명세서 교체 · 준비 중
          </Button>
        </div>
      </Card>
      <Alert tone="info">
        기능 목록 조회와 검토 기능이 제공되면 이 문서에서 추출한 항목을 이
        화면에서 확인할 수 있습니다.
      </Alert>
    </div>
  )
}

function FailedPanel({
  project,
  upload,
}: {
  project: ProjectDetail
  upload: ReactNode
}) {
  return (
    <div className="flex max-w-[680px] flex-col gap-4">
      <Card className="border-danger-border">
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-danger-border bg-danger-bg font-extrabold text-danger"
          >
            !
          </span>
          <div>
            <Badge tone="danger">기능 추출 실패</Badge>
            <h2 className="mt-2 text-[16px] font-extrabold">
              기능명세서를 읽지 못했습니다
            </h2>
            <p className="mt-1 break-all font-mono text-xs text-faint">
              {project.specDocument?.fileName}
            </p>
          </div>
        </div>
        <div className="mt-4 rounded-[10px] bg-subtle px-4 py-3 text-[13px] leading-relaxed text-body">
          <p>· 스캔 이미지로만 구성된 문서인지 확인해주세요.</p>
          <p>· 암호 또는 열기 제한이 설정되어 있는지 확인해주세요.</p>
          <p>· 다른 PDF 뷰어에서 정상적으로 열리는지 확인해주세요.</p>
        </div>
      </Card>
      {upload}
    </div>
  )
}

function MatchResults({
  project,
  stage,
  openSpec,
}: {
  project: ProjectDetail
  stage: FeatureSpecStage
  openSpec: () => void
}) {
  const navigate = useNavigate()
  if (stage === 'empty' || stage === 'failed')
    return (
      <EmptyState
        title="아직 대조할 기능명세서가 없습니다"
        description="PDF를 등록해 기능 항목을 추출하면 연결된 저장소의 PR과 대조할 수 있습니다. PDF 없이도 PR 목록은 계속 사용할 수 있습니다."
        action={<Button onClick={openSpec}>기능명세서 등록</Button>}
      />
    )
  if (stage === 'extracting')
    return (
      <EmptyState
        title="기능을 추출하고 있습니다"
        description="기능 추출이 끝난 뒤 대조 결과를 준비할 수 있습니다. 현재 상태는 자동으로 갱신됩니다."
        action={
          <Button variant="secondary" onClick={openSpec}>
            추출 상태 보기
          </Button>
        }
      />
    )
  return (
    <EmptyState
      title="기능별 대조 결과를 준비하고 있습니다"
      description="현재는 기능명세서 등록과 추출 상태까지 확인할 수 있습니다. 기능 목록과 PR 대조 결과는 다음 단계에서 제공됩니다."
      action={
        <Button
          variant="secondary"
          onClick={() => navigate(`/project/${project.id}?tab=prs`)}
        >
          PR 목록 보기
        </Button>
      }
    />
  )
}

export function ProjectSpecification({ project }: { project: ProjectDetail }) {
  const consent = useAnalysisStart()
  const lock = useRef(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const [searchParams, setSearchParams] = useSearchParams()
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [message, setMessage] = useState('')
  const [messageTone, setMessageTone] = useState<Tone>('danger')
  const [uncertain, setUncertain] = useState(false)
  const stage = getFeatureSpecStage(project.specDocument)
  const view = searchParams.get('view') === 'results' ? 'results' : 'spec'

  const setView = (nextView: 'spec' | 'results') => {
    const next = new URLSearchParams(searchParams)
    if (nextView === 'spec') next.delete('view')
    else next.set('view', 'results')
    setSearchParams(next, { replace: true })
  }

  const chooseFile = (next?: File) => {
    setDragging(false)
    if (!next) {
      setFile(null)
      setMessage('')
      setMessageTone('danger')
      if (inputRef.current) inputRef.current.value = ''
      return
    }
    const error = validateFeatureSpecFile(next)
    if (error) {
      setFile(null)
      setMessage(error)
      setMessageTone('danger')
      if (inputRef.current) inputRef.current.value = ''
      return
    }
    setFile(next)
    setMessage('')
    setMessageTone('danger')
  }

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
      await uploadFeatureSpec(project.id, file)
      setUncertain(true)
      setFile(null)
      if (inputRef.current) inputRef.current.value = ''
      setMessageTone('info')
      setMessage(
        '등록 요청을 접수했습니다. 서버에서 문서를 확인할 때까지 다시 전송하지 않습니다.',
      )
      await projectAnalysis.refresh(project.id)
    } catch (cause) {
      if (consent.flow.disposed) return
      if (cause instanceof FeatureSpecUploadUnknown) {
        setUncertain(true)
        setMessageTone('warning')
      } else {
        setMessageTone('danger')
      }
      setMessage(
        cause instanceof FeatureSpecUploadRejected ||
          cause instanceof FeatureSpecUploadUnknown
          ? cause.message
          : '기능명세서를 등록하지 못했습니다.',
      )
    } finally {
      lock.current = false
      if (!consent.flow.disposed) setBusy(false)
    }
  }

  async function checkServerStatus() {
    if (busy) return
    setBusy(true)
    setMessage('')
    try {
      const current = await getProjectDetail(project.id)
      if (current.specDocument) {
        setMessageTone('success')
        setMessage('서버에서 등록된 기능명세서를 확인했습니다.')
      } else {
        setUncertain(false)
        setMessageTone('info')
        setMessage(
          '서버에 등록된 기능명세서가 없습니다. 같은 파일을 다시 등록할 수 있습니다.',
        )
      }
      await projectAnalysis.refresh(project.id)
    } catch {
      setMessageTone('warning')
      setMessage(
        '서버 상태를 확인하지 못했습니다. 자동으로 다시 전송하지 않습니다.',
      )
    } finally {
      setBusy(false)
    }
  }

  const uploader = (
    <UploadPanel
      file={file}
      busy={busy}
      uncertain={uncertain}
      dragging={dragging}
      repositoryCount={project.repositories.length}
      message={message}
      messageTone={messageTone}
      inputRef={inputRef}
      onFile={chooseFile}
      onUpload={() => void upload()}
      onCheckStatus={() => void checkServerStatus()}
      onDragging={setDragging}
      compact={stage === 'failed'}
    />
  )

  return (
    <section className="flex flex-col gap-4">
      <SpecHeader stage={stage} />
      <ViewSelector value={view} onChange={setView} />
      {view === 'results' ? (
        <MatchResults
          project={project}
          stage={stage}
          openSpec={() => setView('spec')}
        />
      ) : stage === 'empty' ? (
        uploader
      ) : stage === 'extracting' ? (
        <ExtractingPanel project={project} />
      ) : stage === 'failed' ? (
        <FailedPanel project={project} upload={uploader} />
      ) : stage === 'ready' ? (
        <ReadyPanel project={project} />
      ) : (
        <UnknownStatusPanel
          project={project}
          onRefresh={() => void projectAnalysis.refresh(project.id)}
        />
      )}
      <AiConsentModal flow={consent.flow} state={consent.state} />
    </section>
  )
}
