import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type DragEvent,
  type ReactNode,
  type RefObject,
} from 'react'
import { useSearchParams } from 'react-router'
import { useAnalysisStart } from '../analysis/useAnalysisStart'
import { featureSpecUpload } from '../analysis/featureSpecUpload'
import { projectAnalysis } from '../analysis/projectAnalysis'
import { getMatchOwner } from '../analysis/featureMatch'
import { AiConsentModal } from '../components/AiConsentModal'
import { ProjectFeatureReview } from './ProjectFeatureReview'
import { ProjectFeatureMatch } from './ProjectFeatureMatch'
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  FilterChip,
  Modal,
  Stepper,
  type Tone,
} from '../components/ui'
import {
  getFeatureSpecStage,
  validateFeatureSpecFile,
  type FeatureSpecStage,
} from '../lib/featureSpecApi'
import { type ProjectDetail } from '../lib/projectApi'

function stageStep(stage: FeatureSpecStage, view: 'spec' | 'results') {
  if (stage === 'empty') return 0
  if (stage === 'extracting' || stage === 'failed' || stage === 'unknown')
    return 1
  return view === 'results' ? 3 : 2
}

function formatFileSize(bytes: number) {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))}KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

function SpecHeader({
  stage,
  view,
}: {
  stage: FeatureSpecStage
  view: 'spec' | 'results'
}) {
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
        steps={['기능명세서 등록', '기능 추출', '기능 검토', '기능대조']}
        current={stageStep(stage, view)}
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
  inputRef: RefObject<HTMLInputElement | null>
  onFile: (file?: File) => void
  onUpload: () => void
  onDragging: (value: boolean) => void
  compact?: boolean
  replacing: boolean
}

function UploadPanel({
  file,
  busy,
  uncertain,
  dragging,
  inputRef,
  onFile,
  onUpload,
  onDragging,
  compact = false,
  replacing,
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
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={!file || uncertain}
          loading={busy && !uncertain}
          onClick={onUpload}
        >
          {replacing ? '교체' : '업로드하고 분석하기'}
        </Button>
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

function ReadyPanel({
  project,
  onReplace,
  disabled,
}: {
  project: ProjectDetail
  onReplace: () => void
  disabled: boolean
}) {
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
            disabled={disabled}
            onClick={onReplace}
          >
            기능명세서 교체
          </Button>
        </div>
      </Card>
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
  onStartConsent,
}: {
  project: ProjectDetail
  stage: FeatureSpecStage
  openSpec: () => void
  onStartConsent: () => Promise<boolean>
}) {
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
  if (stage === 'ready' && project.specDocument?.specDocumentId)
    return (
      <ProjectFeatureMatch project={project} onStartConsent={onStartConsent} />
    )
  return (
    <EmptyState
      title="기능명세서 상태를 확인할 수 없습니다"
      description="서버 상태를 다시 확인한 뒤 대조를 시작해주세요."
      action={<Button onClick={openSpec}>명세서 상태 보기</Button>}
    />
  )
}

export function ProjectSpecification({ project }: { project: ProjectDetail }) {
  const consent = useAnalysisStart()
  const inputRef = useRef<HTMLInputElement>(null)
  const [searchParams, setSearchParams] = useSearchParams()
  const [file, setFile] = useState<File | null>(null)
  const [editing, setEditing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [confirmedId, setConfirmedId] = useState<number>()
  const request = useSyncExternalStore(featureSpecUpload.subscribe, () =>
    featureSpecUpload.get(project.id),
  )
  const busy = request.phase === 'requesting'
  const uncertain = request.phase === 'accepted' || request.phase === 'unknown'
  const [dragging, setDragging] = useState(false)
  const [checking, setChecking] = useState(false)
  const [message, setMessage] = useState('')
  const [messageTone, setMessageTone] = useState<Tone>('danger')
  const stage = getFeatureSpecStage(project.specDocument)
  const matchOwner = getMatchOwner(project.id)
  const matchState = useSyncExternalStore(
    matchOwner.subscribe,
    matchOwner.getSnapshot,
  )
  const requestedView = searchParams.get('view')
  const view =
    requestedView === 'spec' || requestedView === 'results'
      ? requestedView
      : matchState.run
        ? 'results'
        : 'spec'

  useEffect(() => {
    featureSpecUpload.observe(project.id, project)
  }, [project, project.id])

  useEffect(() => {
    void matchOwner.refresh()
  }, [matchOwner])

  const setView = (nextView: 'spec' | 'results') => {
    const next = new URLSearchParams(searchParams)
    next.set('view', nextView)
    setSearchParams(next, { replace: true })
  }

  const chooseFile = (next?: File) => {
    if (busy || uncertain) return
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

  const replacing = project.specDocument !== null
  const previousId = project.specDocument?.specDocumentId
  const canReplace =
    Number.isSafeInteger(previousId) &&
    (stage === 'ready' || stage === 'failed')

  async function upload() {
    if (
      !file ||
      busy ||
      uncertain ||
      (replacing && (!canReplace || confirmedId !== previousId))
    )
      return
    setConfirming(false)
    setMessage('')
    await featureSpecUpload.request(
      project.id,
      file,
      previousId,
      async () =>
        (await consent.flow.requestConsent('feature-spec')) &&
        !consent.flow.disposed,
      () => !consent.flow.disposed,
    )
    if (consent.flow.disposed) return
    const phase = featureSpecUpload.get(project.id).phase
    if (phase === 'accepted' || phase === 'unknown') {
      setFile(null)
      setEditing(false)
      if (inputRef.current) inputRef.current.value = ''
    }
    await projectAnalysis.refresh(project.id)
  }

  /** GET only: it never resends, but lets the user release an uncertain lock. */
  async function checkUpload() {
    setChecking(true)
    setMessage('')
    try {
      await featureSpecUpload.check(project.id)
      await projectAnalysis.refresh(project.id)
    } catch {
      setMessage('서버 상태를 확인하지 못했습니다. 잠시 후 다시 확인해주세요.')
      setMessageTone('warning')
    } finally {
      setChecking(false)
    }
  }

  const uploader = (
    <UploadPanel
      file={file}
      busy={busy}
      uncertain={uncertain}
      dragging={dragging}
      inputRef={inputRef}
      onFile={chooseFile}
      onUpload={() => {
        if (replacing) {
          setConfirmedId(previousId)
          setConfirming(true)
        } else void upload()
      }}
      onDragging={setDragging}
      compact={replacing}
      replacing={replacing}
    />
  )

  return (
    <section className="flex flex-col gap-4">
      <SpecHeader stage={stage} view={view} />
      <ViewSelector value={view} onChange={setView} />
      {message && <Alert tone={messageTone}>{message}</Alert>}
      {request.message && (
        <Alert
          tone={
            request.phase === 'rejected'
              ? 'danger'
              : request.phase === 'unknown'
                ? 'warning'
                : 'info'
          }
          action={
            uncertain && (
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  loading={checking}
                  onClick={() => void checkUpload()}
                >
                  서버 상태 확인
                </Button>
                {request.phase === 'unknown' && request.checked && (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={checking}
                    onClick={() => featureSpecUpload.acknowledge(project.id)}
                  >
                    확인했습니다, 다시 업로드
                  </Button>
                )}
              </div>
            )
          }
        >
          {request.message}
        </Alert>
      )}
      {view === 'results' ? (
        <MatchResults
          project={project}
          stage={stage}
          openSpec={() => setView('spec')}
          onStartConsent={async () =>
            (await consent.flow.requestConsent('feature-match')) &&
            !consent.flow.disposed
          }
        />
      ) : stage === 'empty' ? (
        uploader
      ) : stage === 'extracting' ? (
        <ExtractingPanel project={project} />
      ) : stage === 'failed' ? (
        <FailedPanel
          project={project}
          upload={
            canReplace ? (
              uploader
            ) : (
              <Alert tone="warning">
                문서 식별 정보를 확인할 수 없어 교체할 수 없습니다.
              </Alert>
            )
          }
        />
      ) : stage === 'ready' ? (
        <>
          {typeof previousId === 'number' ? (
            <ProjectFeatureReview
              specDocumentId={previousId}
              fileName={project.specDocument?.fileName ?? ''}
              replaceDisabled={busy || uncertain}
              onReplace={() => setEditing(true)}
              replacementPanel={editing ? uploader : null}
            />
          ) : (
            <ReadyPanel
              project={project}
              disabled
              onReplace={() => setEditing(true)}
            />
          )}
          {editing && typeof previousId !== 'number' && uploader}
        </>
      ) : (
        <UnknownStatusPanel
          project={project}
          onRefresh={() => void projectAnalysis.refresh(project.id)}
        />
      )}
      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        title="기능명세서를 교체할까요?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              취소
            </Button>
            <Button
              disabled={
                busy || uncertain || !canReplace || confirmedId !== previousId
              }
              onClick={() => void upload()}
            >
              기존 결과를 삭제하고 교체
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {confirmedId !== previousId && (
            <Alert tone="warning">
              문서가 변경되었습니다. 취소 후 최신 문서를 확인해주세요.
            </Alert>
          )}
          <div className="overflow-hidden rounded-[10px] border border-line bg-subtle">
            <div className="grid grid-cols-[64px_minmax(0,1fr)] gap-3 border-b border-line px-4 py-3 text-[13px]">
              <span className="font-bold text-faint">현재</span>
              <span className="min-w-0 break-all font-medium text-body">
                {project.specDocument?.fileName}
              </span>
            </div>
            <div className="grid grid-cols-[64px_minmax(0,1fr)] gap-3 px-4 py-3 text-[13px]">
              <span className="font-bold text-primary">교체 후</span>
              <span className="min-w-0 break-all font-bold text-ink">
                {file?.name}
              </span>
            </div>
          </div>
          <Alert tone="warning">
            기존 추출 결과와 검토 기록(병합·분리·확인)이 모두 삭제되며 되돌릴 수
            없습니다. 새 PDF로 기능을 다시 추출합니다.
          </Alert>
        </div>
      </Modal>
      <AiConsentModal flow={consent.flow} state={consent.state} />
    </section>
  )
}
