import {
  useEffect,
  useSyncExternalStore,
  useState,
  type ReactNode,
} from 'react'
import { useSearchParams } from 'react-router'
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
  Textarea,
  type Tone,
} from '../components/ui'
import {
  confirmAllFeatures,
  confirmFeature,
  deleteFeature,
  getFeatureReviewList,
  getFeatureReviewSummary,
  mergeFeature,
  splitFeature,
  updateFeature,
  type FeatureIssueType,
  type FeatureReviewFilter,
  type FeatureReviewItem,
  type FeatureReviewList,
  type FeatureReviewStatus,
  type FeatureReviewSummary,
} from '../lib/featureReviewApi'

import { getFeatureReviewOwner } from '../analysis/featureReview'

type ReviewDialog =
  | { kind: 'confirm-all' }
  | { kind: 'edit'; feature: FeatureReviewItem }
  | { kind: 'merge'; feature: FeatureReviewItem }
  | { kind: 'split'; feature: FeatureReviewItem }
  | { kind: 'delete'; feature: FeatureReviewItem }
  | null

const filterQuery: Record<string, FeatureReviewFilter> = {
  required: 'REVIEW_REQUIRED',
  unreviewed: 'NO_ISSUE',
  reviewed: 'REVIEWED',
}
const queryFilter: Partial<Record<FeatureReviewFilter, string>> = {
  REVIEW_REQUIRED: 'required',
  NO_ISSUE: 'unreviewed',
  REVIEWED: 'reviewed',
}
const issueLabels: Record<FeatureIssueType, string> = {
  DUPLICATE_SUSPECTED: '중복 의심',
  MISSING_REQUIREMENTS: '요구사항 없음',
  SPLIT_RECOMMENDED: '분리 권장',
  SOURCE_REVIEW_REQUIRED: '원문 확인 필요',
  SOURCE_CONTENT_CONFLICT: '원문 내용 충돌',
}
const statusLabels: Record<FeatureReviewStatus, [string, Tone]> = {
  UNREVIEWED: ['미확인', 'neutral'],
  USER_CONFIRMED: ['확인 완료', 'success'],
  USER_MODIFIED: ['수정됨', 'accent'],
}

function sourcePages(start: number | null, end: number | null) {
  if (start === null) return '원문 위치 없음'
  return end !== null && end !== start
    ? `원문 p.${start}–${end}`
    : `원문 p.${start}`
}

function FeatureCard({
  feature,
  expanded,
  busy,
  onConfirm,
  onEdit,
  onMerge,
  onSplit,
  onDelete,
}: {
  feature: FeatureReviewItem
  expanded: boolean
  busy: boolean
  onConfirm: () => void
  onEdit: () => void
  onMerge: () => void
  onSplit: () => void
  onDelete: () => void
}) {
  const [statusLabel, statusTone] = statusLabels[feature.reviewStatus]
  const needsReview = feature.issues.length > 0
  return (
    <details
      open={expanded}
      className="group overflow-hidden rounded-xl border border-line bg-surface open:border-accent-border"
    >
      <summary className="flex list-none items-start gap-3 px-4 py-3.5 [&::-webkit-details-marker]:hidden">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="break-words text-[14.5px] font-extrabold">
              {feature.name}
            </h4>
            <Badge tone={needsReview ? 'warning' : statusTone}>
              {needsReview ? '확인 필요' : statusLabel}
            </Badge>
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-faint">
            <span>
              {sourcePages(feature.sourcePageStart, feature.sourcePageEnd)}
            </span>
            <span>요구사항 {feature.requirements.length}개</span>
            {!!feature.issues.length && (
              <span>특이사항 {feature.issues.length}개</span>
            )}
          </div>
        </div>
        <span className="shrink-0 pt-0.5 text-xs font-bold text-primary group-open:hidden">
          자세히
        </span>
        <span className="hidden shrink-0 pt-0.5 text-xs font-bold text-primary group-open:inline">
          접기
        </span>
      </summary>
      <div className="space-y-4 border-t border-line bg-subtle px-4 py-4">
        {!!feature.issues.length && (
          <section aria-label="특이사항" className="space-y-2">
            <h5 className="text-xs font-extrabold text-faint">특이사항</h5>
            <div className="space-y-2">
              {feature.issues.map((issue, index) => (
                <Alert
                  key={`${issue.issueType}-${index}`}
                  tone="warning"
                  title={issueLabels[issue.issueType]}
                >
                  {issue.description}
                </Alert>
              ))}
            </div>
          </section>
        )}

        <section aria-label="세부 요구사항" className="space-y-2">
          <h5 className="text-xs font-extrabold text-faint">세부 요구사항</h5>
          {feature.requirements.length ? (
            <div className="grid gap-2">
              {feature.requirements.map((requirement) => (
                <div
                  key={requirement.requirementId}
                  className="rounded-[9px] border border-line bg-surface px-3.5 py-3"
                >
                  <p className="break-words text-[13px] leading-relaxed text-body">
                    {requirement.content}
                  </p>
                  {requirement.sourceText && (
                    <p className="mt-2 break-words border-l-2 border-accent-border pl-3 text-xs leading-relaxed text-muted">
                      <span className="mr-1 font-bold text-faint">원문</span>
                      {requirement.sourceText}
                    </p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[13px] text-warning">
              추출된 세부 요구사항이 없습니다.
            </p>
          )}
        </section>

        {!!feature.duplicateCandidates.length && (
          <section aria-label="중복 후보" className="space-y-2">
            <h5 className="text-xs font-extrabold text-faint">중복 후보</h5>
            <div className="grid gap-2 sm:grid-cols-2">
              {feature.duplicateCandidates.map((candidate) => (
                <div
                  key={candidate.targetFeatureId}
                  className="rounded-[9px] border border-warning-border bg-warning-bg px-3.5 py-3"
                >
                  <p className="break-words text-[13px] font-bold text-ink">
                    {candidate.targetFeatureName}
                  </p>
                  <p className="mt-1 text-xs text-faint">
                    {sourcePages(
                      candidate.targetSourcePageStart,
                      candidate.targetSourcePageEnd,
                    )}
                  </p>
                  <p className="mt-2 break-words text-xs leading-relaxed text-warning">
                    {candidate.reason}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        {!!feature.splitSuggestions.length && (
          <section aria-label="분리 제안" className="space-y-2">
            <h5 className="text-xs font-extrabold text-faint">분리 제안</h5>
            <div className="grid gap-2 sm:grid-cols-2">
              {feature.splitSuggestions.map((suggestion) => (
                <div
                  key={suggestion.suggestionId}
                  className="rounded-[9px] border border-accent-border bg-accent-bg px-3.5 py-3"
                >
                  <p className="break-words text-[13px] font-bold text-ink">
                    {suggestion.suggestedName}
                  </p>
                  <p className="mt-1 text-xs text-accent">
                    {suggestion.suggestedSection} · 요구사항{' '}
                    {suggestion.requirements.length}개
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        <div className="flex flex-wrap gap-2 border-t border-line pt-4">
          {feature.reviewStatus === 'UNREVIEWED' && (
            <Button size="sm" disabled={busy} onClick={onConfirm}>
              현재 내용으로 승인
            </Button>
          )}
          {!!feature.duplicateCandidates.length && (
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={onMerge}
            >
              중복 기능 병합
            </Button>
          )}
          {!!feature.splitSuggestions.length && (
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={onSplit}
            >
              추천안대로 분리
            </Button>
          )}
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={onEdit}
          >
            수정
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={onDelete}
            className="text-danger"
          >
            삭제
          </Button>
        </div>
      </div>
    </details>
  )
}

function LoadingReview() {
  return (
    <div aria-label="기능 목록 불러오는 중" className="space-y-3">
      {[0, 1, 2].map((item) => (
        <div
          key={item}
          className="animate-pulse rounded-xl border border-line bg-surface px-4 py-4 motion-reduce:animate-none"
        >
          <div className="h-4 w-2/5 rounded bg-neutral-bg" />
          <div className="mt-3 h-3 w-3/5 rounded bg-subtle" />
        </div>
      ))}
    </div>
  )
}

function countForFilter(
  summary: FeatureReviewSummary | null,
  filter: FeatureReviewFilter,
) {
  if (!summary) return '—'
  if (filter === 'REVIEW_REQUIRED') return summary.reviewRequired
  if (filter === 'NO_ISSUE') return summary.noIssue
  if (filter === 'REVIEWED') return summary.reviewed
  return summary.total
}

export function ProjectFeatureReview({
  specDocumentId,
  fileName,
  replaceDisabled,
  onReplace,
  replacementPanel,
}: {
  specDocumentId: number
  fileName: string
  replaceDisabled: boolean
  onReplace: () => void
  replacementPanel?: ReactNode
}) {
  const [params, setParams] = useSearchParams()
  const filter = filterQuery[params.get('review') ?? ''] ?? 'ALL'
  const [summary, setSummary] = useState<FeatureReviewSummary | null>(null)
  const [result, setResult] = useState<FeatureReviewList | null>(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [dialog, setDialog] = useState<ReviewDialog>(null)
  const owner = getFeatureReviewOwner(specDocumentId)
  const mutation = useSyncExternalStore(owner.subscribe, owner.getSnapshot)
  const [loadedRevision, setLoadedRevision] = useState(-1)
  const { notice } = mutation
  const pendingAction = mutation.label
  const busy =
    mutation.phase !== 'idle' ||
    !result ||
    !!error ||
    loadedRevision !== mutation.revision
  const [editName, setEditName] = useState('')
  const [editRequirements, setEditRequirements] = useState<
    { id?: number; content: string }[]
  >([])
  const [mergeTargetId, setMergeTargetId] = useState<number | null>(null)
  const [mergeName, setMergeName] = useState('')
  const [splitNames, setSplitNames] = useState<Record<number, string>>({})
  const [formError, setFormError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      setResult(null)
      setError('')
      setSummary(null)
      const [summaryResult, listResult] = await Promise.allSettled([
        getFeatureReviewSummary(specDocumentId, controller.signal),
        getFeatureReviewList(specDocumentId, filter, controller.signal),
      ])
      if (controller.signal.aborted) return
      if (summaryResult.status === 'fulfilled') setSummary(summaryResult.value)
      if (listResult.status === 'fulfilled') setResult(listResult.value)
      setLoadedRevision(mutation.revision)
      if (
        summaryResult.status === 'rejected' ||
        listResult.status === 'rejected'
      )
        setError('기능 목록을 불러오지 못했습니다.')
    }
    void load()
    return () => controller.abort()
  }, [specDocumentId, filter, attempt, mutation.revision])

  const runMutation = async (
    label: string,
    request: () => Promise<void>,
    successMessage: string,
  ) => {
    if (busy) return
    setDialog(null)
    await owner.run(label, request, successMessage)
  }

  const openEdit = (feature: FeatureReviewItem) => {
    setFormError('')
    setEditName(feature.name)
    setEditRequirements(
      feature.requirements.map((requirement) => ({
        id: requirement.requirementId,
        content: requirement.content,
      })),
    )
    setDialog({ kind: 'edit', feature })
  }

  const openMerge = (feature: FeatureReviewItem) => {
    const candidate = feature.duplicateCandidates[0]
    if (!candidate) return
    setFormError('')
    setMergeTargetId(candidate.targetFeatureId)
    setMergeName(candidate.suggestedMergedName)
    setDialog({ kind: 'merge', feature })
  }

  const openSplit = (feature: FeatureReviewItem) => {
    setFormError('')
    setSplitNames(
      Object.fromEntries(
        feature.splitSuggestions.map((suggestion) => [
          suggestion.suggestionId,
          suggestion.suggestedName,
        ]),
      ),
    )
    setDialog({ kind: 'split', feature })
  }

  const validName = (value: string) => {
    const length = value.trim().length
    return length >= 1 && length <= 255
  }

  const submitEdit = () => {
    if (dialog?.kind !== 'edit') return
    if (!validName(editName)) {
      setFormError('기능명은 1자 이상 255자 이하로 입력해주세요.')
      return
    }
    const requirements = editRequirements.map((requirement) => ({
      ...requirement,
      content: requirement.content.trim(),
    }))
    if (
      requirements.length > 100 ||
      requirements.some(
        (requirement) =>
          !requirement.content || requirement.content.length > 2000,
      )
    ) {
      setFormError(
        '세부 요구사항은 100개 이하이며 각 내용은 1자 이상 2000자 이하여야 합니다.',
      )
      return
    }
    void runMutation(
      '기능 저장 중',
      () =>
        updateFeature(specDocumentId, dialog.feature.featureId, {
          name: editName.trim(),
          requirements,
        }),
      '기능을 수정했습니다.',
    )
  }

  const submitMerge = () => {
    if (dialog?.kind !== 'merge' || mergeTargetId === null) return
    if (!validName(mergeName)) {
      setFormError('병합할 기능명은 1자 이상 255자 이하로 입력해주세요.')
      return
    }
    void runMutation(
      '기능 병합 중',
      () =>
        mergeFeature(
          specDocumentId,
          dialog.feature.featureId,
          mergeTargetId,
          mergeName.trim(),
        ),
      '두 기능을 병합했습니다.',
    )
  }

  const submitSplit = () => {
    if (dialog?.kind !== 'split') return
    const features = dialog.feature.splitSuggestions.map((suggestion) => ({
      suggestionId: suggestion.suggestionId,
      name: (splitNames[suggestion.suggestionId] ?? '').trim(),
    }))
    if (
      !features.length ||
      features.some((feature) => !validName(feature.name))
    ) {
      setFormError('각 기능명은 1자 이상 255자 이하로 입력해주세요.')
      return
    }
    void runMutation(
      '기능 분리 중',
      () =>
        splitFeature(specDocumentId, dialog.feature.featureId, { features }),
      `기능을 ${features.length}개로 분리했습니다.`,
    )
  }

  const changeFilter = (nextFilter: FeatureReviewFilter) => {
    const next = new URLSearchParams(params)
    const query = queryFilter[nextFilter]
    if (query) next.set('review', query)
    else next.delete('review')
    setParams(next, { replace: true })
  }

  const filters: { value: FeatureReviewFilter; label: string }[] = [
    { value: 'ALL', label: '전체' },
    { value: 'REVIEW_REQUIRED', label: '확인 필요' },
    { value: 'NO_ISSUE', label: '미확인' },
    { value: 'REVIEWED', label: '검토 완료' },
  ]
  const visibleCount =
    result?.sections.reduce(
      (sum, section) => sum + section.features.length,
      0,
    ) ?? 0

  return (
    <div className="flex max-w-[1000px] flex-col gap-4">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-extrabold text-faint">
              기능명세서 분석 완료
            </p>
            <h2 className="mt-1 break-words text-[18px] font-extrabold">
              {summary ? `기능 ${summary.total}개를 추출했습니다` : '기능 목록'}
            </h2>
            <p className="mt-1 break-all text-xs text-muted">{fileName}</p>
          </div>
          {summary && (
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Badge
                tone={
                  summary.reviewRequired + summary.noIssue > 0
                    ? 'warning'
                    : 'success'
                }
              >
                검토 {summary.reviewed}/{summary.total}
              </Badge>
              {summary.reviewed < summary.total && (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => {
                    setFormError('')
                    setDialog({ kind: 'confirm-all' })
                  }}
                >
                  남은 기능 모두 승인
                </Button>
              )}
            </div>
          )}
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <p className="text-[13px] leading-relaxed text-muted">
            기능 검토는 선택 사항이며, 미확인 기능도 이후 대조에 사용할 수
            있습니다.
          </p>
          <Button
            variant="secondary"
            size="sm"
            disabled={replaceDisabled || busy}
            onClick={onReplace}
          >
            기능명세서 교체
          </Button>
        </div>
      </Card>

      {replacementPanel}

      {notice && <Alert tone={notice.tone}>{notice.message}</Alert>}

      {pendingAction && <Alert tone="info">{pendingAction}</Alert>}
      {(mutation.phase === 'uncertain' || mutation.phase === 'read-error') && (
        <Alert
          tone="warning"
          action={
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => void owner.refresh()}
              >
                최신 목록 확인
              </Button>
              {mutation.phase === 'uncertain' && (
                <Button
                  size="sm"
                  variant="secondary"
                  // Unlock only once the list below is the one just read.
                  disabled={loadedRevision !== mutation.revision || !!error}
                  onClick={() => owner.acknowledge()}
                >
                  확인했습니다, 다시 편집
                </Button>
              )}
            </div>
          }
        >
          {mutation.phase === 'read-error'
            ? '최신 목록과 요약을 확인하지 못했습니다. 확인 전까지 변경을 잠시 막습니다.'
            : '목록을 조회했지만 이전 요청의 완료 여부는 확정할 수 없어 추가 변경을 막았습니다. 아래 목록에 변경이 반영됐는지 확인한 뒤 잠금을 해제해주세요. 반영되지 않은 변경을 다시 보내면 늦게 처리된 이전 요청과 중복될 수 있습니다.'}
        </Alert>
      )}

      <div
        className="flex flex-wrap items-center gap-2"
        aria-label="기능 검토 필터"
      >
        {filters.map((item) => (
          <FilterChip
            key={item.value}
            selected={filter === item.value}
            onClick={() => changeFilter(item.value)}
          >
            {item.label} {countForFilter(summary, item.value)}
          </FilterChip>
        ))}
      </div>

      {error && (
        <Alert
          tone="warning"
          action={
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setAttempt((value) => value + 1)}
            >
              다시 불러오기
            </Button>
          }
        >
          {error}
        </Alert>
      )}

      {!result && !error ? (
        <LoadingReview />
      ) : result && visibleCount === 0 ? (
        <EmptyState
          title="조건에 맞는 기능이 없습니다"
          description="다른 검토 필터를 선택해 추출된 기능을 확인해주세요."
        />
      ) : result ? (
        <div className="space-y-5">
          {result.sections.map((section, sectionIndex) => (
            <section
              key={section.sectionId ?? `unclassified-${sectionIndex}`}
              aria-labelledby={`feature-section-${section.sectionId ?? sectionIndex}`}
              className="space-y-2.5"
            >
              <div className="flex flex-wrap items-baseline gap-2 px-1">
                <h3
                  id={`feature-section-${section.sectionId ?? sectionIndex}`}
                  className="text-[14.5px] font-extrabold"
                >
                  {section.title || '미분류'}
                </h3>
                <span className="text-xs text-faint">
                  {section.features.length}개
                </span>
              </div>
              <div className="space-y-2.5">
                {section.features.map((feature) => (
                  <FeatureCard
                    key={feature.featureId}
                    feature={feature}
                    expanded={filter === 'REVIEW_REQUIRED'}
                    busy={busy}
                    onConfirm={() =>
                      void runMutation(
                        '기능 승인 중',
                        () => confirmFeature(specDocumentId, feature.featureId),
                        `「${feature.name}」을 현재 내용으로 승인했습니다.`,
                      )
                    }
                    onEdit={() => openEdit(feature)}
                    onMerge={() => openMerge(feature)}
                    onSplit={() => openSplit(feature)}
                    onDelete={() => {
                      setFormError('')
                      setDialog({ kind: 'delete', feature })
                    }}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : null}

      <Modal
        open={dialog?.kind === 'confirm-all'}
        onClose={() => setDialog(null)}
        closeDisabled={!!pendingAction}
        title="남은 기능을 모두 승인할까요?"
        description="특이사항이 있는 기능을 포함해 아직 검토하지 않은 모든 기능을 현재 내용으로 확정합니다."
        footer={
          <>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => setDialog(null)}
            >
              취소
            </Button>
            <Button
              loading={pendingAction === '전체 기능 승인 중'}
              onClick={() =>
                void runMutation(
                  '전체 기능 승인 중',
                  () => confirmAllFeatures(specDocumentId),
                  '남은 기능을 모두 현재 내용으로 승인했습니다.',
                )
              }
            >
              모두 승인
            </Button>
          </>
        }
      >
        <Alert tone="warning">
          승인하면 해당 기능의 특이사항과 병합·분리 제안이 정리됩니다.
        </Alert>
      </Modal>

      <Modal
        open={dialog?.kind === 'edit'}
        onClose={() => setDialog(null)}
        closeDisabled={!!pendingAction}
        title="기능 수정"
        description="기능명과 세부 요구사항을 저장하면 사용자 수정 상태로 기록됩니다."
        footer={
          <>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => setDialog(null)}
            >
              취소
            </Button>
            <Button
              loading={pendingAction === '기능 저장 중'}
              onClick={submitEdit}
            >
              저장
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {formError && <Alert tone="danger">{formError}</Alert>}
          <Input
            label="기능명"
            value={editName}
            maxLength={255}
            disabled={busy}
            onChange={(event) => setEditName(event.target.value)}
          />
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-[13px] font-bold text-body">세부 요구사항</h3>
              <Button
                size="sm"
                variant="secondary"
                disabled={!!pendingAction || editRequirements.length >= 100}
                onClick={() =>
                  setEditRequirements((current) => [
                    ...current,
                    { content: '' },
                  ])
                }
              >
                요구사항 추가
              </Button>
            </div>
            {editRequirements.length ? (
              editRequirements.map((requirement, index) => (
                <div
                  key={requirement.id ?? `new-${index}`}
                  className="rounded-[9px] border border-line bg-subtle p-3"
                >
                  <Textarea
                    label={`요구사항 ${index + 1}`}
                    value={requirement.content}
                    maxLength={2000}
                    disabled={busy}
                    onChange={(event) =>
                      setEditRequirements((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, content: event.target.value }
                            : item,
                        ),
                      )
                    }
                  />
                  <Button
                    className="mt-2"
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() =>
                      setEditRequirements((current) =>
                        current.filter((_, itemIndex) => itemIndex !== index),
                      )
                    }
                  >
                    요구사항 삭제
                  </Button>
                </div>
              ))
            ) : (
              <p className="text-[13px] text-muted">
                세부 요구사항 없이도 저장할 수 있습니다.
              </p>
            )}
          </div>
          <p className="text-xs leading-relaxed text-muted">
            수정하면 기존 특이사항과 병합·분리 제안은 삭제됩니다.
          </p>
        </div>
      </Modal>

      <Modal
        open={dialog?.kind === 'merge'}
        onClose={() => setDialog(null)}
        closeDisabled={!!pendingAction}
        title="중복 기능 병합"
        description={
          dialog?.kind === 'merge'
            ? `「${dialog.feature.name}」과 중복 후보를 하나의 기능으로 합칩니다.`
            : undefined
        }
        footer={
          <>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => setDialog(null)}
            >
              취소
            </Button>
            <Button
              loading={pendingAction === '기능 병합 중'}
              onClick={submitMerge}
            >
              병합
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {formError && <Alert tone="danger">{formError}</Alert>}
          <Select
            label="병합할 중복 후보"
            value={mergeTargetId ?? ''}
            disabled={busy}
            onChange={(event) => {
              const target = Number(event.target.value)
              setMergeTargetId(target)
              if (dialog?.kind === 'merge') {
                const candidate = dialog.feature.duplicateCandidates.find(
                  (item) => item.targetFeatureId === target,
                )
                if (candidate) setMergeName(candidate.suggestedMergedName)
              }
            }}
          >
            {dialog?.kind === 'merge' &&
              dialog.feature.duplicateCandidates.map((candidate) => (
                <option
                  key={candidate.targetFeatureId}
                  value={candidate.targetFeatureId}
                >
                  {candidate.targetFeatureName}
                </option>
              ))}
          </Select>
          <Input
            label="병합 후 기능명"
            value={mergeName}
            maxLength={255}
            disabled={busy}
            onChange={(event) => setMergeName(event.target.value)}
          />
          <Alert tone="warning">
            두 기존 기능은 삭제되고 요구사항을 합친 새 기능이 만들어집니다.
          </Alert>
        </div>
      </Modal>

      <Modal
        open={dialog?.kind === 'split'}
        onClose={() => setDialog(null)}
        closeDisabled={!!pendingAction}
        title="추천안대로 기능 분리"
        description="추출 결과에 저장된 모든 분리 제안을 적용합니다. 각 기능명은 적용 전에 수정할 수 있습니다."
        footer={
          <>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => setDialog(null)}
            >
              취소
            </Button>
            <Button
              loading={pendingAction === '기능 분리 중'}
              onClick={submitSplit}
            >
              분리
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {formError && <Alert tone="danger">{formError}</Alert>}
          {dialog?.kind === 'split' &&
            dialog.feature.splitSuggestions.map((suggestion, index) => (
              <div
                key={suggestion.suggestionId}
                className="rounded-[9px] border border-line bg-subtle p-3"
              >
                <Input
                  label={`분리 기능 ${index + 1}`}
                  value={splitNames[suggestion.suggestionId] ?? ''}
                  maxLength={255}
                  disabled={busy}
                  hint={`${suggestion.suggestedSection} · 요구사항 ${suggestion.requirements.length}개`}
                  onChange={(event) =>
                    setSplitNames((current) => ({
                      ...current,
                      [suggestion.suggestionId]: event.target.value,
                    }))
                  }
                />
              </div>
            ))}
        </div>
      </Modal>

      <Modal
        open={dialog?.kind === 'delete'}
        onClose={() => setDialog(null)}
        closeDisabled={!!pendingAction}
        title="기능을 삭제할까요?"
        description={
          dialog?.kind === 'delete'
            ? `「${dialog.feature.name}」과 세부 요구사항을 삭제합니다.`
            : undefined
        }
        footer={
          <>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => setDialog(null)}
            >
              취소
            </Button>
            <Button
              variant="danger"
              loading={pendingAction === '기능 삭제 중'}
              onClick={() => {
                if (dialog?.kind !== 'delete') return
                void runMutation(
                  '기능 삭제 중',
                  () => deleteFeature(specDocumentId, dialog.feature.featureId),
                  '기능을 삭제했습니다.',
                )
              }}
            >
              삭제
            </Button>
          </>
        }
      >
        <Alert tone="warning">
          삭제한 기능과 검토 정보는 이 화면에서 복원할 수 없습니다.
        </Alert>
      </Modal>
    </div>
  )
}
