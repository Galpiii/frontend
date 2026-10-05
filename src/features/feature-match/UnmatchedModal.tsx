import { useState } from 'react'
import { Link } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { Alert, Button, Modal } from '../../components/ui'
import { getUnmatchedPrs, MatchRunChanged } from './api'
import { matchKeys } from './keys'

export function UnmatchedModal({
  projectId,
  runId,
  onClose,
}: {
  projectId: number
  runId: number
  onClose: () => void
}) {
  const [page, setPage] = useState(0)
  const query = useQuery({
    queryKey: matchKeys.unmatched(projectId, runId, page),
    queryFn: async ({ signal }) => {
      const data = await getUnmatchedPrs(projectId, page, signal)
      if (data.featureMatchRunId !== runId) throw new MatchRunChanged()
      return data
    },
  })
  const result = query.data ?? null
  const error = !query.isError
    ? ''
    : query.error instanceof MatchRunChanged
      ? '대조 결과가 변경되었습니다. 다시 확인해주세요.'
      : '연결되지 않은 PR을 불러오지 못했습니다.'
  return (
    <Modal
      open
      size="wide"
      title="매칭되지 않은 PR"
      description="명세서의 어떤 기능과도 연결되지 않은 PR입니다. PR을 선택하면 상세 내용을 확인할 수 있습니다."
      onClose={onClose}
      footer={
        <Button variant="secondary" onClick={onClose}>
          닫기
        </Button>
      }
    >
      <div className="space-y-4">
        {error && <Alert tone="warning">{error}</Alert>}
        {!error && !result && (
          <p role="status" className="text-[13px] text-muted">
            PR 목록을 불러오는 중입니다…
          </p>
        )}
        {result && (
          <p className="text-xs text-muted">전체 {result.totalElements}개 PR</p>
        )}
        {result?.pullRequests.length === 0 && (
          <p className="text-[13px] text-muted">
            이 페이지에 연결되지 않은 PR이 없습니다.
          </p>
        )}
        {result && result.pullRequests.length > 0 && (
          <ul className="max-h-[45dvh] overflow-y-auto rounded-xl border border-line">
            {result.pullRequests.map((pr) => (
              <li
                key={pr.pullRequestId}
                className="border-b border-line last:border-b-0"
              >
                <Link
                  to={`/projects/${projectId}?tab=prs&pr=${pr.pullRequestId}`}
                  onClick={onClose}
                  className="block px-4 py-3 hover:bg-subtle"
                >
                  <span className="block break-all text-xs text-muted">
                    {pr.repositoryFullName} · #{pr.number}
                  </span>
                  <span className="mt-1 block break-words text-[13px] font-bold">
                    {pr.title}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {result && result.totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 text-[13px]">
            <Button
              size="sm"
              variant="secondary"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              이전
            </Button>
            <span>
              {page + 1} / {result.totalPages}
            </span>
            <Button
              size="sm"
              variant="secondary"
              disabled={page + 1 >= result.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              다음
            </Button>
          </div>
        )}
      </div>
    </Modal>
  )
}
