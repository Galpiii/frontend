import { Link } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { Alert, Badge, Button, Card, Drawer } from '../../components/ui'
import { PrStatusBadge } from './PrStatusBadge'
import { getPullRequestFeatures } from '../feature-match/api'
import { changeTypes, failureReasons } from './api'
import { displayDate, githubUrl } from '../../lib/format'
import { matchKeys } from '../feature-match/keys'
import { usePullRequestDetail } from './usePullRequestDetail'
const relatedFeatureNotices = {
  NO_RUN:
    '아직 기능대조를 실행하지 않았습니다. 기능대조를 실행하면 관련 기능을 확인할 수 있습니다.',
  IN_PROGRESS:
    '기능대조가 진행 중입니다. 대조가 끝나면 관련 기능을 확인할 수 있습니다.',
  STALE:
    '명세서나 저장소가 변경되어 기능대조 결과가 오래되었습니다. 기능대조를 다시 실행해주세요.',
}

function RelatedFeatures({
  projectId,
  pullRequestId,
  repositoryId,
}: {
  projectId: number
  pullRequestId: number
  repositoryId: number
}) {
  const query = useQuery({
    queryKey: matchKeys.pullRequestFeatures(
      projectId,
      pullRequestId,
      repositoryId,
    ),
    queryFn: ({ signal }) =>
      getPullRequestFeatures(projectId, pullRequestId, repositoryId, signal),
    // One read fans out to every matched feature's detail; reopening the
    // drawer or returning to the tab reuses it for a while.
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  })
  const data = query.data ?? null
  const error = query.isError ? '관련 기능을 불러오지 못했습니다.' : ''
  return (
    <Card>
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-bold">관련 기능</h3>
        {data?.state === 'READY' && data.features.length > 0 && (
          <span className="text-xs text-muted">{data.features.length}개</span>
        )}
      </div>
      {error ? (
        <div className="mt-3">
          <Alert
            tone="warning"
            action={
              <Button
                size="sm"
                variant="secondary"
                loading={query.isFetching}
                onClick={() => void query.refetch()}
              >
                다시 조회
              </Button>
            }
          >
            {error}
          </Alert>
        </div>
      ) : !data ? (
        <p role="status" className="mt-2 text-[13px] text-muted">
          관련 기능을 찾고 있습니다…
        </p>
      ) : data.state !== 'READY' ? (
        <p className="mt-2 text-[13px] leading-relaxed text-muted">
          {relatedFeatureNotices[data.state]}
        </p>
      ) : data.features.length === 0 ? (
        <p className="mt-2 text-[13px] leading-relaxed text-muted">
          이 PR과 연결된 기능이 없습니다. 기능별 대조 결과에서 직접 연결할 수
          있습니다.
        </p>
      ) : (
        <ul className="mt-3 overflow-hidden rounded-xl border border-line">
          {data.features.map((feature) => (
            <li
              key={feature.featureId}
              className="border-b border-line last:border-b-0"
            >
              <Link
                to={`/projects/${projectId}?tab=match&matchFeature=${feature.featureId}`}
                className="block px-4 py-3 hover:bg-subtle"
              >
                <span className="flex items-start justify-between gap-2">
                  <span className="min-w-0 flex-1">
                    {feature.sectionTitle && (
                      <span className="block break-words text-xs text-muted">
                        {feature.sectionTitle}
                      </span>
                    )}
                    <span className="mt-0.5 block break-words text-[13px] font-bold text-ink">
                      {feature.name}
                    </span>
                  </span>
                  <Badge
                    tone={feature.source === 'USER' ? 'accent' : 'neutral'}
                  >
                    {feature.source === 'USER' ? '사용자 연결' : 'AI 연결'}
                  </Badge>
                </span>
                {feature.reason && (
                  <span className="mt-1.5 line-clamp-2 block break-words text-xs leading-relaxed text-body">
                    {feature.reason}
                  </span>
                )}
                <span className="mt-2 block text-xs font-bold text-primary">
                  대조 근거 보기 →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

export function PullRequestDetailDrawer({
  id,
  projectId,
  repositoryIds,
  onClose,
}: {
  id: number
  projectId: number
  repositoryIds: number[]
  onClose: () => void
}) {
  const { data, error, query } = usePullRequestDetail(id, repositoryIds)
  const url = data && githubUrl(data.htmlUrl)
  return (
    <Drawer
      open
      onClose={onClose}
      title={data ? `#${data.number} ${data.title}` : 'PR 상세'}
      description={data?.repository.fullName}
    >
      {error ? (
        <Alert
          tone="danger"
          action={
            <Button
              size="sm"
              variant="secondary"
              loading={query.isFetching}
              onClick={() => void query.refetch()}
            >
              다시 조회
            </Button>
          }
        >
          {error}
        </Alert>
      ) : !data ? (
        <p role="status">PR 상세를 불러오고 있습니다…</p>
      ) : (
        <div className="space-y-4">
          <Card>
            <Badge tone="neutral">GITHUB 원본</Badge>
            <dl className="mt-3 grid grid-cols-[86px_minmax(0,1fr)] gap-x-3 gap-y-2 text-[13px]">
              <dt className="text-faint">저장소</dt>
              <dd className="break-all font-mono">
                {data.repository.fullName}
              </dd>
              <dt className="text-faint">작성자</dt>
              <dd>{data.author?.login ?? '정보 없음'}</dd>
              <dt className="text-faint">상태</dt>
              <dd>
                <Badge tone="info">{data.state}</Badge>
              </dd>
              <dt className="text-faint">생성 일시</dt>
              <dd>{displayDate(data.createdAtGithub)}</dd>
              <dt className="text-faint">병합 일시</dt>
              <dd>{displayDate(data.mergedAt)}</dd>
              <dt className="text-faint">Base Branch</dt>
              <dd className="break-all font-mono">{data.baseRef}</dd>
              <dt className="text-faint">변경 파일</dt>
              <dd>
                <ul className="space-y-1 break-all font-mono">
                  {data.files.map((f) => (
                    <li key={f.path}>
                      {f.path}
                      {f.patchOmitted && (
                        <span className="font-sans text-warning">
                          {' '}
                          · diff 미제공
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
                {data.files.length === 0 && '파일 정보 없음'}
                {data.filesTruncated && (
                  <p className="mt-2 text-warning">
                    파일 목록의 일부만 표시합니다.
                  </p>
                )}
              </dd>
            </dl>
            {url && (
              <a
                className="mt-4 inline-block text-sm font-bold"
                href={url}
                target="_blank"
                rel="noreferrer"
              >
                GitHub에서 보기 ↗
              </a>
            )}
          </Card>
          <Card className="border-dashed border-accent-border bg-[#f6f8fe]">
            <div className="flex items-center justify-between gap-2">
              <Badge tone="accent">AI 분석</Badge>
              <PrStatusBadge status={data.analysis?.status} />
            </div>
            {data.analysis?.status === 'COMPLETED' ? (
              <dl className="mt-3 space-y-3 text-[13px]">
                <div>
                  <dt className="text-faint">작업 요약</dt>
                  <dd className="mt-1 whitespace-pre-wrap break-words leading-relaxed">
                    {data.analysis.summary ?? '요약 내용이 없습니다.'}
                  </dd>
                </div>
                <div>
                  <dt className="text-faint">변경 유형</dt>
                  <dd className="mt-1">
                    {changeTypes[data.analysis.changeType ?? ''] ??
                      data.analysis.changeType ??
                      '정보 없음'}
                  </dd>
                </div>
                <div>
                  <dt className="text-faint">분석 시각</dt>
                  <dd className="mt-1">
                    {displayDate(data.analysis.analyzedAt)}
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="mt-3 text-sm leading-relaxed">
                {data.analysis?.errorCode
                  ? (failureReasons[data.analysis.errorCode] ??
                    data.analysis.errorCode)
                  : '아직 요약 결과가 없습니다. 분석 상태를 확인해주세요.'}
              </p>
            )}
            <p className="mt-4 border-t border-dashed border-accent-border pt-3 text-xs leading-relaxed text-muted">
              이 요약은 PR의 제목, 본문, 커밋 및 변경 내용을 바탕으로 정리한
              참고 정보입니다.
            </p>
          </Card>
          {!!data.incompleteReasons.length && (
            <Alert tone="warning">
              수집 근거 제한: {data.incompleteReasons.join(' · ')}
            </Alert>
          )}
          <RelatedFeatures
            projectId={projectId}
            pullRequestId={data.id}
            repositoryId={data.repository.id}
          />
        </div>
      )}
    </Drawer>
  )
}
