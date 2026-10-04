import { useEffect, useState } from 'react'
import { Alert, Badge, Button, Card, Drawer } from '../components/ui'
import { PrStatusBadge } from '../components/PrStatusBadge'
import {
  changeTypes,
  failureReasons,
  getPullRequestDetail,
  type PullRequestDetail,
} from '../lib/pullRequestApi'
import { displayDate, githubUrl } from '../lib/projectOverviewApi'
export function PullRequestDetailDrawer({
  id,
  repositoryIds,
  onClose,
}: {
  id: number
  repositoryIds: number[]
  onClose: () => void
}) {
  const [data, setData] = useState<PullRequestDetail | null>(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const key = repositoryIds.join(',')
  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      setError('')
      setData(null)
      try {
        const result = await getPullRequestDetail(id, controller.signal)
        if (!key.split(',').includes(String(result.repository.id)))
          throw new Error('이 프로젝트에 연결된 PR이 아닙니다.')
        if (!controller.signal.aborted) setData(result)
      } catch (cause) {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : 'PR 상세를 불러오지 못했습니다.',
          )
      }
    }
    void load()
    return () => controller.abort()
  }, [id, key, attempt])
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
              onClick={() => setAttempt((v) => v + 1)}
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
          <Card>
            <h3 className="font-bold">관련 기능</h3>
            <p className="mt-2 text-[13px] text-muted">
              기능–PR 대조는 준비 중입니다. 아직 관련 기능을 확인할 수 없습니다.
            </p>
          </Card>
        </div>
      )}
    </Drawer>
  )
}
