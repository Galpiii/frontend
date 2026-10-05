import { lazy, Suspense } from 'react'
import { Alert, Badge, Button } from '../../components/ui'
import { githubUrl } from '../../lib/format'
import { usePullRequestDetail } from '../pull-requests/usePullRequestDetail'

const Markdown = lazy(() =>
  import('../../components/Markdown').then((module) => ({
    default: module.Markdown,
  })),
)

export function EmbeddedPrDetail({
  id,
  repositoryIds,
  onBack,
}: {
  id: number
  repositoryIds: number[]
  onBack: () => void
}) {
  const { data: detail, error, query } = usePullRequestDetail(id, repositoryIds)
  return (
    <section
      className="min-w-0 overflow-hidden rounded-[14px] border border-line bg-surface"
      aria-label="PR 상세"
    >
      <header className="border-b border-line px-5 py-4 sm:px-6">
        <button
          type="button"
          className="mb-3 text-[13px] font-bold text-primary underline"
          onClick={onBack}
        >
          ← 기능 근거로 돌아가기
        </button>
        <h3 className="break-words text-[17px] font-extrabold">
          {detail ? `#${detail.number} ${detail.title}` : 'PR 상세'}
        </h3>
        {detail && (
          <p className="mt-1 break-all text-xs text-muted">
            {detail.repository.fullName}
          </p>
        )}
      </header>
      <div className="space-y-5 p-5 text-[13px] sm:p-6">
        {error ? (
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
        ) : !detail ? (
          <p role="status">PR 상세를 불러오는 중입니다…</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              <Badge tone="neutral">{detail.state}</Badge>
              {detail.analysis?.status === 'COMPLETED' && (
                <Badge tone="accent">AI 분석 완료</Badge>
              )}
            </div>
            <section>
              <h4 className="font-extrabold">PR 설명</h4>
              {detail.body?.trim() ? (
                <Suspense
                  fallback={
                    <p className="mt-2 whitespace-pre-wrap break-words leading-relaxed text-body">
                      {detail.body}
                    </p>
                  }
                >
                  <Markdown className="mt-2">{detail.body}</Markdown>
                </Suspense>
              ) : (
                <p className="mt-2 text-muted">작성된 설명이 없습니다.</p>
              )}
            </section>
            {detail.analysis?.summary && (
              <section className="border-t border-line pt-4">
                <h4 className="font-extrabold">분석 요약</h4>
                <p className="mt-2 whitespace-pre-wrap break-words leading-relaxed text-body">
                  {detail.analysis.summary}
                </p>
              </section>
            )}
            <section className="border-t border-line pt-4">
              <h4 className="font-extrabold">
                변경 파일 {detail.files.length}개
              </h4>
              {detail.files.length ? (
                <ul className="mt-2 space-y-1 break-all font-mono text-xs text-body">
                  {detail.files.map((file) => (
                    <li key={file.path}>{file.path}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-muted">파일 정보가 없습니다.</p>
              )}
              {detail.filesTruncated && (
                <p className="mt-2 text-warning">
                  파일 목록의 일부만 표시합니다.
                </p>
              )}
            </section>
            {githubUrl(detail.htmlUrl) && (
              <a
                href={githubUrl(detail.htmlUrl)!}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block font-bold text-primary underline"
              >
                GitHub에서 PR 열기 ↗
              </a>
            )}
          </>
        )}
      </div>
    </section>
  )
}
