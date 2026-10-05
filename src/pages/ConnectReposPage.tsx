import { useAnalysisStart } from '../features/consent/useAnalysisStart'
import { AiConsentModal } from '../features/consent/AiConsentModal'
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Link,
  Navigate,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router'
import { AppHeader, AppShell } from '../components/layout'
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  FilterChip,
  Input,
  Modal,
  Select,
  Stepper,
  Toast,
  type ToastMessage,
} from '../components/ui'
import { SessionError } from '../features/auth/session'
import {
  connectRepositories,
  getInstallUrl,
  listGithubRepositories,
  resolveRepository,
} from '../features/repositories/api'
import { projectAnalysis } from '../features/projects/projectAnalysis'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import { repositoryKeys } from '../features/repositories/keys'
import { ONBOARDING_STEPS } from '../features/projects/onboardingSteps'
import {
  filterRepositories,
  ownerSummary,
  OWNER_ALL,
  OWNER_ORGANIZATIONS,
  OWNER_PERSONAL,
  reconcileRepositorySelection,
  SORT_LABELS,
  type RepositoryRow,
  type SortKey,
  type Visibility,
} from '../features/repositories/repositoryFilters'

/**
 * The backend reports why an installation could not be read, and each reason
 * needs a different action from the user. An unknown reason still gets a
 * message rather than disappearing.
 */
const FAILURE_MESSAGES: Record<string, string> = {
  SUSPENDED:
    'GitHub App 설치가 일시 중지되었습니다. GitHub 설정에서 다시 활성화해주세요.',
  NOT_FOUND:
    '설치 정보를 찾을 수 없습니다. GitHub App이 제거되었을 수 있습니다.',
  FORBIDDEN:
    '조직이 앱 접근을 승인하지 않았습니다. 조직 관리자에게 승인을 요청해주세요.',
  TEMPORARY_ERROR:
    'GitHub가 일시적으로 응답하지 않았습니다. 잠시 후 다시 불러와주세요.',
}

function failureMessage(reason: string) {
  return (
    FAILURE_MESSAGES[reason] ??
    '저장소 목록을 불러오지 못했습니다. GitHub 접근 권한을 확인해주세요.'
  )
}

export function ConnectReposPage() {
  useDocumentTitle('저장소 연결')
  const navigate = useNavigate()
  const { projectId } = useParams()
  const [searchParams] = useSearchParams()
  const installation = searchParams.get('installation')
  const id = Number(projectId)
  const validId = Number.isInteger(id) && id > 0

  const listing = useQuery({
    queryKey: repositoryKeys.github(id),
    queryFn: ({ signal }) => listGithubRepositories(id, signal),
    enabled: validId,
    // Each read asks GitHub; returning to the tab is not a reason to repeat it.
    refetchOnWindowFocus: false,
  })
  // Repositories added by URL are not part of the GitHub listing response.
  const [added, setAdded] = useState<RepositoryRow[]>([])
  const repositories = useMemo(() => {
    if (!listing.data) return null
    const listed = new Set(
      listing.data.rows.map((repo) => repo.githubRepositoryId),
    )
    return [
      ...added.filter((repo) => !listed.has(repo.githubRepositoryId)),
      ...listing.data.rows,
    ]
  }, [listing.data, added])
  const loading = listing.isPending
  const failures = listing.data?.failures ?? []
  const truncated = listing.data?.truncated ?? false
  const [installError, setInstallError] = useState('')
  const loadError =
    installError ||
    (listing.isError &&
    !(listing.error instanceof SessionError && listing.error.status === 401)
      ? '저장소 목록을 불러오지 못했습니다. 다시 시도해주세요.'
      : '')
  const reloadRepositories = () => {
    setInstallError('')
    void listing.refetch()
  }

  const [picks, setPicks] = useState<number[]>([])
  // A refreshed list drops selections that are gone or already linked, so the
  // UI never submits repository ids the user can no longer see.
  const selected = useMemo(
    () => reconcileRepositorySelection(picks, repositories ?? []),
    [picks, repositories],
  )
  const setSelected = setPicks
  const [query, setQuery] = useState('')
  const [owner, setOwner] = useState<string>(OWNER_ALL)
  const [sort, setSort] = useState<SortKey>('recent')
  const [visibility, setVisibility] = useState<Visibility>('all')

  const [url, setUrl] = useState('')
  const [urlError, setUrlError] = useState('')
  const [resolving, setResolving] = useState(false)

  const analysis = useAnalysisStart()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [connectError, setConnectError] = useState('')
  const [installing, setInstalling] = useState(false)
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  function showToast(text: string) {
    setToasts((current) => [...current, { id: Date.now(), text }])
  }

  const ownerOptions = useMemo(
    () => ownerSummary(repositories ?? []),
    [repositories],
  )

  const visible = useMemo(
    () =>
      filterRepositories(repositories ?? [], {
        owner,
        visibility,
        keyword: query,
        sort,
      }),
    [repositories, query, owner, visibility, sort],
  )

  const picked = useMemo(
    () =>
      (repositories ?? []).filter((repo) =>
        selected.includes(repo.githubRepositoryId),
      ),
    [repositories, selected],
  )

  function toggle(githubRepositoryId: number) {
    setConnectError('')
    setSelected((current) =>
      current.includes(githubRepositoryId)
        ? current.filter((value) => value !== githubRepositoryId)
        : [...current, githubRepositoryId],
    )
  }

  async function addByUrl() {
    if (resolving) return
    const trimmed = url.trim()
    if (!trimmed) {
      setUrlError('GitHub 저장소 URL을 입력해주세요.')
      return
    }
    setResolving(true)
    setUrlError('')
    try {
      const repo = await resolveRepository(id, trimmed)
      if (repo.linked) {
        setUrlError('이미 이 프로젝트에 연결된 저장소입니다.')
        return
      }
      if (
        !repositories?.some(
          (item) => item.githubRepositoryId === repo.githubRepositoryId,
        )
      ) {
        // The resolve endpoint answers per repository and carries no
        // installation, so reuse the account type already known for this owner.
        const known = repositories?.find(
          (item) => item.accountLogin === repo.owner,
        )
        setAdded((current) => [
          {
            ...repo,
            accountLogin: repo.owner,
            organization: known?.organization ?? false,
          },
          ...current,
        ])
      }
      setSelected((current) =>
        current.includes(repo.githubRepositoryId)
          ? current
          : [...current, repo.githubRepositoryId],
      )
      setUrl('')
      showToast(`${repo.fullName} 저장소를 목록에 추가했습니다.`)
    } catch (cause) {
      if (cause instanceof SessionError && cause.status === 401) return
      setUrlError(
        cause instanceof Error
          ? cause.message
          : '저장소를 확인하지 못했습니다.',
      )
    } finally {
      setResolving(false)
    }
  }

  async function connect() {
    if (
      connecting ||
      analysis.flow.state.phase !== 'idle' ||
      selected.length === 0
    )
      return
    setConfirmOpen(false)
    setConnectError('')
    try {
      const agreed = await analysis.flow.requestConsent()
      if (!agreed || analysis.flow.disposed) return
      setConnecting(true)
      const connected = await connectRepositories(id, selected)

      projectAnalysis.queue(
        id,
        connected
          .filter((repo) => selected.includes(repo.githubRepositoryId))
          .map((repo) => repo.repositoryId),
      )
      navigate(`/projects/${id}`, { replace: true })
    } catch (cause) {
      if (cause instanceof SessionError && cause.status === 401) return
      setConfirmOpen(false)
      setConnectError(
        cause instanceof Error
          ? cause.message
          : '저장소를 연결하지 못했습니다.',
      )
    } finally {
      setConnecting(false)
    }
  }

  async function openInstall() {
    setInstalling(true)
    try {
      window.location.href = await getInstallUrl(`/projects/${id}/repositories`)
    } catch (cause) {
      if (cause instanceof SessionError && cause.status === 401) return
      setInstallError(
        cause instanceof Error
          ? cause.message
          : 'GitHub App 설치 주소를 열지 못했습니다.',
      )
      setInstalling(false)
    }
  }

  if (!validId) return <Navigate to="/projects" replace />

  const empty = repositories !== null && repositories.length === 0
  // One message per reason, naming every account that hit it.
  const failureGroups = [
    ...failures
      .reduce((groups, failure) => {
        groups.set(failure.reason, [
          ...(groups.get(failure.reason) ?? []),
          failure.accountLogin,
        ])
        return groups
      }, new Map<string, string[]>())
      .entries(),
  ]

  return (
    <AppShell header={<AppHeader context="저장소 연결" />}>
      <div className="mx-auto flex max-w-[880px] flex-col gap-4 py-1 break-keep sm:py-2">
        <Link to="/projects" className="self-start text-[13.5px] font-bold">
          ← 프로젝트 목록
        </Link>
        <Stepper steps={ONBOARDING_STEPS} current={1} />
        {installation === 'verified' && (
          <Alert tone="success">
            GitHub App 설치를 확인했습니다. 연결할 저장소를 선택해주세요.
          </Alert>
        )}
        {installation === 'unverified' && (
          <Alert tone="warning">
            GitHub App 설치를 아직 확인하지 못했습니다. 조직 관리자 승인이
            필요한지 확인한 뒤 다시 시도해주세요.
          </Alert>
        )}

        <div>
          <h1 className="text-[22px] font-extrabold tracking-[-.4px]">
            분석할 저장소를 선택하세요
          </h1>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">
            프론트엔드, 백엔드, 인프라처럼 하나의 프로젝트를 구성하는 여러
            GitHub 저장소를 함께 연결할 수 있습니다.
          </p>
        </div>

        <Card>
          <Input
            label="GitHub Repository URL로 직접 추가"
            value={url}
            error={urlError}
            placeholder="GitHub Repository URL을 입력하세요. 예 : https://github.com/owner/repository"
            hint="GitHub 이외의 Git 서비스는 지원하지 않습니다 · URL 형식, 저장소 존재 여부, 접근 권한, 중복 여부를 확인합니다."
            className="font-mono"
            action={
              <Button
                variant="secondary"
                loading={resolving}
                onClick={() => void addByUrl()}
              >
                ⧉ URL로 추가
              </Button>
            }
            onChange={(event) => {
              setUrl(event.target.value)
              setUrlError('')
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                void addByUrl()
              }
            }}
          />
        </Card>

        {/*
          Read failures and truncation are shown above every list branch: when
          every installation fails the list is empty for a reason the empty
          state would otherwise misreport as "no App installed".
        */}
        {!loading &&
          !loadError &&
          failureGroups.map(([reason, accounts]) => (
            <Alert
              key={reason}
              tone={reason === 'TEMPORARY_ERROR' ? 'warning' : 'danger'}
              title={`${accounts.join(' · ')} 저장소를 불러오지 못했습니다`}
              action={
                reason === 'TEMPORARY_ERROR' && (
                  <Button
                    variant="secondary"
                    size="sm"
                    loading={listing.isFetching}
                    onClick={reloadRepositories}
                  >
                    다시 불러오기
                  </Button>
                )
              }
            >
              {failureMessage(reason)}
            </Alert>
          ))}

        {!loading && !loadError && truncated && (
          <Alert tone="info">
            저장소가 많아 일부만 표시됩니다. 찾는 저장소가 목록에 없으면 위에서
            URL로 직접 추가해주세요.
          </Alert>
        )}

        {loading ? (
          <Card>
            <p role="status" className="py-8 text-center text-muted">
              GitHub에서 접근 가능한 저장소를 불러오고 있습니다…
            </p>
          </Card>
        ) : loadError ? (
          <Alert
            tone="danger"
            action={
              <Button
                variant="secondary"
                size="sm"
                loading={listing.isFetching}
                onClick={reloadRepositories}
              >
                다시 시도
              </Button>
            }
          >
            {loadError}
          </Alert>
        ) : empty ? (
          <EmptyState
            level={2}
            title="연결할 수 있는 저장소가 없습니다"
            description="GitHub App이 설치되지 않았거나 접근 가능한 저장소가 없습니다. App을 설치하면 선택할 수 있는 저장소가 나타납니다."
            action={
              <Button loading={installing} onClick={() => void openInstall()}>
                GitHub App 설치하기
              </Button>
            }
          />
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <Select
                label="소유자"
                hideLabel
                className="h-10 w-auto text-center"
                value={owner}
                onChange={(event) => setOwner(event.target.value)}
              >
                <option value={OWNER_ALL}>
                  전체 저장소 · {ownerOptions.total}
                </option>
                {ownerOptions.personal > 0 && (
                  <option value={OWNER_PERSONAL}>
                    내 계정 · {ownerOptions.personal}
                  </option>
                )}
                {ownerOptions.organizationTotal !== null && (
                  <option value={OWNER_ORGANIZATIONS}>
                    조직 전체 · {ownerOptions.organizationTotal}
                  </option>
                )}
                {ownerOptions.accounts
                  .filter((account) => account.organization)
                  .map((account) => (
                    <option key={account.login} value={account.login}>
                      {account.login} · {account.count}
                    </option>
                  ))}
              </Select>
              {/* Takes the leftover width rather than reserving a fixed one. */}
              <div className="min-w-0 flex-1">
                <Input
                  label="저장소 검색"
                  hideLabel
                  className="h-10"
                  placeholder="⌕ 저장소 검색 — 이름 · 소유자 · 설명"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>
              <div className="flex gap-2">
                {(['all', 'public', 'private'] as const).map((value) => (
                  <FilterChip
                    key={value}
                    className="h-10"
                    selected={visibility === value}
                    onClick={() => setVisibility(value)}
                  >
                    {value === 'all'
                      ? '전체'
                      : value === 'public'
                        ? 'Public'
                        : 'Private'}
                  </FilterChip>
                ))}
              </div>
              <Select
                label="정렬"
                hideLabel
                className="h-10 w-auto text-center"
                value={sort}
                onChange={(event) => setSort(event.target.value as SortKey)}
              >
                {Object.entries(SORT_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </Select>
            </div>

            {connectError && <Alert tone="danger">{connectError}</Alert>}

            {visible.length === 0 ? (
              <EmptyState
                level={2}
                title="조건에 맞는 저장소가 없습니다"
                description="검색어나 필터를 바꾸거나, 위에서 URL로 직접 추가해주세요."
              />
            ) : (
              <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
                {visible.map((repo) => (
                  <li
                    key={repo.githubRepositoryId}
                    className="flex flex-wrap items-center gap-3 px-4 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-[14px] font-bold">
                          {repo.fullName}
                        </span>
                        <Badge tone={repo.private ? 'warning' : 'neutral'}>
                          {repo.private ? 'Private' : 'Public'}
                        </Badge>
                        {repo.language && (
                          <span className="text-xs text-faint">
                            {repo.language}
                          </span>
                        )}
                      </div>
                      {repo.description && (
                        <p className="mt-0.5 truncate text-[13px] text-muted">
                          {repo.description}
                        </p>
                      )}
                    </div>
                    {repo.linked ? (
                      <Badge tone="success">이미 연결됨</Badge>
                    ) : (
                      <Button
                        // A toggle, not a one-way action, so screen readers get
                        // the pressed state rather than two similar labels.
                        aria-pressed={selected.includes(
                          repo.githubRepositoryId,
                        )}
                        variant={
                          selected.includes(repo.githubRepositoryId)
                            ? 'primary'
                            : 'dark'
                        }
                        size="sm"
                        onClick={() => toggle(repo.githubRepositoryId)}
                      >
                        {selected.includes(repo.githubRepositoryId)
                          ? '추가됨 ✓'
                          : '추가'}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {/* Appears only once something is selected, as in the wireframe. */}
        {selected.length > 0 && (
          <div className="sticky bottom-0 flex flex-wrap items-center gap-3 rounded-t-2xl bg-ink px-5 py-4 text-white shadow-dialog">
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-extrabold">
                {selected.length}개의 저장소를 선택했습니다.
              </p>
              <p className="truncate font-mono text-[13px] text-white/60">
                {picked.map((repo) => repo.fullName).join(' · ')}
              </p>
            </div>
            <Button
              variant="ghost"
              // The shared variants assume a light surface; tailwind-merge lets
              // these win over the defaults on the dark bar.
              className="border-white/25 text-white hover:bg-white/10"
              onClick={() => setSelected([])}
            >
              선택 해제
            </Button>
            <Button
              disabled={connecting || analysis.state.phase !== 'idle'}
              onClick={() => setConfirmOpen(true)}
            >
              {connecting
                ? '저장소 연결 및 분석 요청 중…'
                : `${selected.length}개 저장소 연결`}
            </Button>
          </div>
        )}
      </div>

      <Modal
        open={confirmOpen}
        onClose={() => {
          if (!connecting) setConfirmOpen(false)
        }}
        title={`${selected.length}개 저장소를 연결할까요?`}
        description="외부 AI 전송 동의를 먼저 확인합니다. 동의가 완료되면 저장소를 연결하고 기본 설정(Merge된 PR · 기본 브랜치)으로 분석을 요청합니다."
        footer={
          <>
            <Button
              variant="secondary"
              disabled={connecting}
              onClick={() => setConfirmOpen(false)}
            >
              돌아가기
            </Button>
            <Button loading={connecting} onClick={() => void connect()}>
              저장소 연결
            </Button>
          </>
        }
      >
        <ul className="flex flex-col gap-2">
          {picked.map((repo) => (
            <li
              key={repo.githubRepositoryId}
              className="flex items-center gap-2 rounded-[9px] border border-line px-3 py-2"
            >
              <span className="min-w-0 flex-1 truncate font-mono text-[13px] font-semibold">
                {repo.fullName}
              </span>
              <Badge tone={repo.private ? 'warning' : 'neutral'}>
                {repo.private ? 'Private' : 'Public'}
              </Badge>
              {repo.defaultBranch && (
                <span className="font-mono text-xs text-faint">
                  {repo.defaultBranch}
                </span>
              )}
            </li>
          ))}
        </ul>
      </Modal>

      <Toast
        messages={toasts}
        onDismiss={(id) =>
          setToasts((current) => current.filter((it) => it.id !== id))
        }
      />
      <AiConsentModal flow={analysis.flow} state={analysis.state} />
    </AppShell>
  )
}
