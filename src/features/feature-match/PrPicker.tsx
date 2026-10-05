import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
  Alert,
  Badge,
  Button,
  FilterChip,
  Input,
  Modal,
} from '../../components/ui'
import type { ProjectDetail } from '../projects/api'
import { getPrPage } from '../pull-requests/api'
import { cn } from '../../lib/cn'
import { pullRequestKeys } from '../pull-requests/keys'

export function PrPicker({
  projectId,
  repositories,
  linkedIds,
  busy,
  blocked,
  onClose,
  onConnect,
}: {
  projectId: number
  repositories: ProjectDetail['repositories']
  linkedIds: Set<number>
  busy: boolean
  blocked: boolean
  onClose: () => void
  onConnect: (ids: number[]) => void
}) {
  const [repositoryId, setRepositoryId] = useState<number>()
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState<Set<number>>(() => new Set())
  const options = { repositoryId, q: query || undefined, page, size: 30 }
  const list = useQuery({
    queryKey: pullRequestKeys.list(projectId, options),
    queryFn: ({ signal }) => getPrPage(projectId, options, signal),
    placeholderData: keepPreviousData,
  })
  const result = list.data ?? null
  const error = list.isError ? 'PR 목록을 불러오지 못했습니다.' : ''
  const toggle = (id: number) =>
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  return (
    <Modal
      open
      size="wide"
      title="이 기능에 PR 직접 연결"
      description="연결할 PR을 여러 개 선택할 수 있습니다. 이미 연결된 PR은 다시 선택할 수 없습니다."
      onClose={onClose}
      closeDisabled={busy}
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          <span className="text-[13px] text-muted">선택 {selected.size}개</span>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose} disabled={busy}>
              취소
            </Button>
            <Button
              onClick={() => onConnect([...selected])}
              disabled={busy || blocked || selected.size === 0}
              loading={busy}
            >
              추가
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2" aria-label="PR 저장소 필터">
          <FilterChip
            selected={!repositoryId}
            onClick={() => {
              setRepositoryId(undefined)
              setPage(0)
            }}
          >
            전체 저장소
          </FilterChip>
          {repositories.map((repo) => (
            <FilterChip
              key={repo.repositoryId}
              selected={repositoryId === repo.repositoryId}
              onClick={() => {
                setRepositoryId(repo.repositoryId)
                setPage(0)
              }}
            >
              {repo.fullName.split('/').at(-1) ?? repo.fullName}
            </FilterChip>
          ))}
        </div>
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            setQuery(search.trim())
            setPage(0)
          }}
        >
          <div className="min-w-0 flex-1">
            <Input
              label="PR 검색"
              hideLabel
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="PR 번호 또는 제목 검색"
            />
          </div>
          <Button type="submit" variant="secondary">
            검색
          </Button>
        </form>
        {error && (
          <Alert
            tone="warning"
            action={
              <Button
                size="sm"
                variant="secondary"
                loading={list.isFetching}
                onClick={() => void list.refetch()}
              >
                다시 조회
              </Button>
            }
          >
            {error}
          </Alert>
        )}
        {!result && !error && (
          <p role="status" className="text-[13px] text-muted">
            PR 목록을 불러오는 중입니다…
          </p>
        )}
        {result && (
          <p className="text-xs text-muted">전체 {result.totalElements}개 PR</p>
        )}
        {result?.pullRequests.length === 0 && (
          <p className="text-[13px] text-muted">조건에 맞는 PR이 없습니다.</p>
        )}
        <div
          aria-busy={list.isPlaceholderData || undefined}
          className={cn(
            'max-h-[45dvh] overflow-y-auto rounded-xl border border-line transition-opacity',
            list.isPlaceholderData && 'opacity-60',
          )}
        >
          {result?.pullRequests.map((pr) => {
            const linked = linkedIds.has(pr.id)
            return (
              <label
                key={pr.id}
                className={`flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0 ${linked ? 'bg-subtle' : 'cursor-pointer hover:bg-subtle'}`}
              >
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={linked || selected.has(pr.id)}
                  disabled={
                    linked ||
                    busy ||
                    blocked ||
                    (!selected.has(pr.id) && selected.size >= 100)
                  }
                  onChange={() => toggle(pr.id)}
                  aria-label={`#${pr.number} ${pr.title} 선택`}
                />
                <span className="min-w-0 flex-1">
                  <span className="block break-all text-xs text-muted">
                    {pr.repository.fullName} · #{pr.number}
                  </span>
                  <span className="mt-1 block break-words text-[13px] font-bold">
                    {pr.title}
                  </span>
                </span>
                {linked && <Badge tone="neutral">이미 연결됨</Badge>}
              </label>
            )
          })}
        </div>
        {result && result.totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 text-[13px]">
            <Button
              size="sm"
              variant="secondary"
              disabled={page === 0}
              onClick={() => setPage((value) => value - 1)}
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
              onClick={() => setPage((value) => value + 1)}
            >
              다음
            </Button>
          </div>
        )}
      </div>
    </Modal>
  )
}
