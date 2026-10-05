import { Badge } from '../../components/ui'
import { prStatuses } from './api'
export function PrStatusBadge({ status }: { status?: string | null }) {
  const [label, tone] = prStatuses[status ?? ''] ?? ['분석 전', 'neutral']
  return <Badge tone={tone}>{label}</Badge>
}
