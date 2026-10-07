import { useRef, useState } from 'react'
import {
  Alert,
  Badge,
  Button,
  Card,
  Menu,
  MenuItem,
  Modal,
  type Tone,
} from '../../components/ui'
import { unlinkRepository } from './api'
import { projectAnalysis } from '../projects/projectAnalysis'
import type { ProjectDetail, LinkedRepository } from '../projects/api'
import type { loadOverview } from '../projects/overviewApi'
import { displayDate } from '../../lib/format'
import { getCollectionNotices } from '../../lib/collectionNotices'
import { CollectionNotice } from '../../components/CollectionNotice'
import { RepositoryExcludedFiles } from '../pull-requests/CollectionExcludedFiles'

const statuses: Record<string, [string, Tone]> = {
  PENDING: ['수집 대기', 'info'],
  COLLECTING: ['수집 중', 'accent'],
  COMPLETED: ['수집 완료', 'success'],
  FAILED: ['수집 실패', 'danger'],
  CANCELLED: ['수집 취소', 'neutral'],
  SKIPPED: ['수집 건너뜀', 'warning'],
}
export function ProjectRepositoryCards({
  project,
  data,
  refresh,
  busy,
}: {
  project: ProjectDetail
  data: Awaited<ReturnType<typeof loadOverview>> | null
  refresh: () => void
  busy: boolean
}) {
  const [target, setTarget] = useState<LinkedRepository | null>(null)
  const [removing, setRemoving] = useState(false)
  const [error, setError] = useState('')
  const lock = useRef(false)
  async function remove() {
    if (!target || lock.current) return
    lock.current = true
    setRemoving(true)
    setError('')
    try {
      await unlinkRepository(project.id, target.repositoryId)
      setTarget(null)
    } catch {
      setError(
        '연결 해제 결과를 확인하지 못했습니다. 최신 저장소 목록을 확인해주세요.',
      )
    } finally {
      await projectAnalysis.refresh(project.id)
      refresh()
      lock.current = false
      setRemoving(false)
    }
  }
  return (
    <section className="space-y-3">
      <h2 className="text-[15.5px] font-extrabold">연결된 저장소</h2>
      {project.repositories.length === 0 && (
        <Card>
          연결된 저장소가 없습니다. 저장소를 추가해 분석을 시작하세요.
        </Card>
      )}
      {project.repositories.map((repo) => {
        const counts = data?.overview?.repositories.find(
          (r) => r.id === repo.repositoryId,
        )
        const targetState = data?.repositoryStatuses?.find(
          (r) => r.repositoryId === repo.repositoryId,
        )
        const collectionNotices = getCollectionNotices(
          targetState?.incompleteReasons,
        )
        const [label, tone] =
          repo.accessStatus === 'INACCESSIBLE'
            ? (['접근 권한 없음', 'warning'] as const)
            : (statuses[targetState?.status ?? ''] ?? [
                '수집 상태 미확인',
                'neutral',
              ])
        return (
          <Card
            key={repo.repositoryId}
            className="flex flex-wrap items-center gap-4"
          >
            <span
              aria-hidden="true"
              className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-neutral-bg font-extrabold text-muted"
            >
              {(repo.fullName.split('/').at(-1) ?? repo.fullName)
                .slice(0, 1)
                .toUpperCase()}
            </span>
            <div className="min-w-0 flex-1 lg:w-[240px] lg:flex-none">
              <h3 className="break-words font-mono text-[13.5px] font-bold">
                {repo.fullName}
              </h3>
              {repo.private !== undefined && (
                <div className="mt-1">
                  <Badge tone={repo.private ? 'accent' : 'neutral'}>
                    {repo.private ? 'Private' : 'Public'}
                  </Badge>
                </div>
              )}
              <p className="mt-1 break-words text-xs leading-relaxed text-faint">
                {repo.defaultBranch ?? '브랜치 미확인'} · 동기화{' '}
                {displayDate(repo.lastSyncedAt)} ·{' '}
                <a
                  href={`https://github.com/${repo.fullName.split('/').map(encodeURIComponent).join('/')}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  GitHub ↗
                </a>
              </p>
            </div>
            <div className="flex basis-full flex-wrap gap-x-4 gap-y-2 text-[13px] text-body lg:flex-1 lg:basis-auto">
              <span>
                수집 PR <b>{counts?.pullRequestCount ?? '—'}</b>
              </span>
              <span>
                요약 완료{' '}
                <b>{data?.repositoryCompleted[repo.repositoryId] ?? '—'}</b>
              </span>
              <span>
                실패{' '}
                <b className={counts?.failedCount ? 'text-danger' : ''}>
                  {counts?.failedCount ?? '—'}
                </b>
              </span>
            </div>
            {counts?.failedCount ? (
              <Badge tone="warning">
                확인 필요 · PR 실패 {counts.failedCount}건
              </Badge>
            ) : (
              <Badge tone={tone}>{label}</Badge>
            )}
            <Menu label={`${repo.fullName} 저장소 메뉴`}>
              <MenuItem
                disabled={busy}
                tone="danger"
                onClick={() => {
                  setTarget(repo)
                  setError('')
                }}
              >
                프로젝트에서 제거
              </MenuItem>
            </Menu>
            {collectionNotices.length ? (
              <CollectionNotice
                notices={collectionNotices}
                className="basis-full"
              >
                <RepositoryExcludedFiles
                  projectId={project.id}
                  repositoryId={repo.repositoryId}
                  analysisRunId={targetState?.analysisRunId}
                  reasons={targetState?.incompleteReasons ?? []}
                />
              </CollectionNotice>
            ) : null}
          </Card>
        )
      })}
      <p className="text-xs leading-relaxed text-faint">
        수집 완료와 PR 요약 완료는 다릅니다. 저장소를 제거해도 GitHub 원본
        저장소는 삭제되지 않습니다.
      </p>
      <Modal
        open={target !== null}
        onClose={() => {
          if (!removing) setTarget(null)
        }}
        title="저장소 연결을 해제할까요?"
        footer={
          <>
            <Button
              variant="secondary"
              disabled={removing}
              onClick={() => setTarget(null)}
            >
              취소
            </Button>
            <Button
              variant="danger"
              loading={removing}
              onClick={() => void remove()}
            >
              연결 해제
            </Button>
          </>
        }
      >
        <p className="break-words text-sm">
          {target?.fullName}의 수집 데이터와 요약 결과가 프로젝트에서
          제외됩니다. GitHub 원본은 유지됩니다.
        </p>
        {error && <Alert tone="warning">{error}</Alert>}
      </Modal>
    </section>
  )
}
