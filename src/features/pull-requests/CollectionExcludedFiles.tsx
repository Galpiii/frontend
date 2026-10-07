import { useQuery } from '@tanstack/react-query'
import { Button } from '../../components/ui'
import { githubUrl } from '../../lib/format'
import { projectKeys } from '../projects/keys'
import type { PullRequestDetail } from './api'
import {
  getExcludedFilePaths,
  hasUnlistedFiles,
  loadRepositoryExcludedFiles,
} from './excludedFiles'

function FilePaths({ paths }: { paths: string[] }) {
  return (
    <ul className="space-y-1 font-mono leading-relaxed">
      {paths.map((path) => (
        <li key={path} className="break-all">
          {path}
        </li>
      ))}
    </ul>
  )
}

function IncompleteFileNotice() {
  return (
    <p className="leading-relaxed">
      파일 목록이 일부만 제공되거나 수집 제한으로 제외된 파일이 있어 전체 경로를
      확인할 수 없습니다.
    </p>
  )
}

export function PullRequestExcludedFiles({
  detail,
}: {
  detail: PullRequestDetail
}) {
  const paths = getExcludedFilePaths(detail)
  return (
    <div className="space-y-2">
      {paths.length ? (
        <>
          <p className="font-bold">변경 내용이 제공되지 않은 파일</p>
          <div className="max-h-64 overflow-y-auto pr-1">
            <FilePaths paths={paths} />
          </div>
        </>
      ) : (
        <p>현재 수집 정보에서 제외된 파일 경로를 확인할 수 없습니다.</p>
      )}
      {(detail.filesTruncated ||
        hasUnlistedFiles(detail.incompleteReasons)) && <IncompleteFileNotice />}
    </div>
  )
}

export function RepositoryExcludedFiles({
  projectId,
  repositoryId,
  analysisRunId,
  reasons,
}: {
  projectId: number
  repositoryId: number
  analysisRunId?: number
  reasons: string[]
}) {
  const query = useQuery({
    queryKey: [
      ...projectKeys.detail(projectId),
      'collection-files',
      repositoryId,
      analysisRunId,
    ],
    queryFn: ({ signal }) =>
      loadRepositoryExcludedFiles(projectId, repositoryId, signal),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    retry: false,
  })

  if (query.isError) {
    return (
      <div className="space-y-2">
        <p className="text-danger">제외된 파일 정보를 불러오지 못했습니다.</p>
        <Button
          variant="ghost"
          size="sm"
          loading={query.isFetching}
          onClick={() => void query.refetch()}
        >
          다시 조회
        </Button>
      </div>
    )
  }
  if (!query.data) return <p role="status">파일 정보를 불러오고 있습니다…</p>

  const { groups, unavailablePrCount, incomplete } = query.data
  return (
    <div className="space-y-2">
      {groups.length ? (
        <>
          <p className="font-bold">
            수집된 PR에서 변경 내용이 제공되지 않은 파일
          </p>
          <div className="max-h-64 space-y-3 overflow-y-auto pr-1">
            {groups.map((group) => {
              const url = githubUrl(group.htmlUrl)
              return (
                <div key={group.id} className="space-y-1">
                  {url ? (
                    <a
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="font-bold"
                    >
                      PR #{group.number} ↗
                    </a>
                  ) : (
                    <p className="font-bold">PR #{group.number}</p>
                  )}
                  <FilePaths paths={group.paths} />
                </div>
              )
            })}
          </div>
        </>
      ) : unavailablePrCount ? null : (
        <p>현재 수집 정보에서 제외된 파일 경로를 확인할 수 없습니다.</p>
      )}
      {(incomplete || hasUnlistedFiles(reasons)) && <IncompleteFileNotice />}
      {!!unavailablePrCount && (
        <div className="space-y-2">
          <p>
            PR {unavailablePrCount}건의 파일 정보를 불러오지 못해 목록이 일부만
            표시됩니다.
          </p>
          <Button
            variant="ghost"
            size="sm"
            loading={query.isFetching}
            onClick={() => void query.refetch()}
          >
            다시 조회
          </Button>
        </div>
      )}
    </div>
  )
}
