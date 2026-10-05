import { Badge, type Tone } from '../../components/ui'

const analysisStatuses: Record<string, { label: string; tone: Tone }> = {
  QUEUED: { label: '분석 대기 중', tone: 'info' },
  RUNNING: { label: '분석 중', tone: 'accent' },
  COMPLETED: { label: '분석 완료', tone: 'success' },
  PARTIALLY_COMPLETED: { label: '분석 일부 완료', tone: 'warning' },
  RATE_LIMITED: { label: '요청 제한으로 중단', tone: 'warning' },
  FAILED: { label: '분석 실패', tone: 'danger' },
  CANCELLED: { label: '분석 취소됨', tone: 'neutral' },
}

export function AnalysisStatusBadge({ status }: { status?: string | null }) {
  const { label, tone }: { label: string; tone: Tone } = status
    ? (analysisStatuses[status] ?? {
        label: '알 수 없는 분석 상태',
        tone: 'neutral',
      })
    : { label: '분석 전', tone: 'neutral' }

  return <Badge tone={tone}>{label}</Badge>
}
