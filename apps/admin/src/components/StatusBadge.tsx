import { Circle, TriangleAlert } from 'lucide-react'
import type { SessionRow } from '../lib/data'
import type { FriendlyAccountStatus, FriendlySessionStatus } from '../lib/labels'

type StatusValue = SessionRow['status'] | 'Available' | 'Leased' | 'Maintenance' | 'Disabled' | 'Operator' | 'Administrator' | 'Active' | 'Removed' | 'Expired' | 'suspended' | 'disabled' | FriendlyAccountStatus | FriendlySessionStatus

const statusConfig: Record<StatusValue, { label: string; className: string; Icon: typeof Circle }> = {
  active: { label: 'In use', className: 'status-green', Icon: Circle },
  ended: { label: 'Ended', className: 'status-slate', Icon: Circle },
  Ended: { label: 'Ended', className: 'status-slate', Icon: Circle },
  stale: { label: 'Needs attention', className: 'status-amber', Icon: TriangleAlert },
  error: { label: 'Problem', className: 'status-red', Icon: TriangleAlert },
  Available: { label: 'Ready', className: 'status-green', Icon: Circle },
  Leased: { label: 'In use', className: 'status-violet', Icon: Circle },
  Maintenance: { label: 'Temporarily unavailable', className: 'status-amber', Icon: TriangleAlert },
  Disabled: { label: 'Disabled', className: 'status-red', Icon: TriangleAlert },
  Operator: { label: 'Operator', className: 'status-blue', Icon: Circle },
  Administrator: { label: 'Administrator', className: 'status-violet', Icon: Circle },
  Active: { label: 'Active', className: 'status-green', Icon: Circle },
  Removed: { label: 'Removed', className: 'status-slate', Icon: Circle },
  Expired: { label: 'Expired', className: 'status-amber', Icon: TriangleAlert },
  suspended: { label: 'Suspended', className: 'status-amber', Icon: TriangleAlert },
  disabled: { label: 'Disabled', className: 'status-red', Icon: TriangleAlert },
  Ready: { label: 'Ready', className: 'status-green', Icon: Circle },
  'In use': { label: 'In use', className: 'status-violet', Icon: Circle },
  'Temporarily unavailable': { label: 'Temporarily unavailable', className: 'status-amber', Icon: TriangleAlert },
  'Needs attention': { label: 'Needs attention', className: 'status-amber', Icon: TriangleAlert },
  Problem: { label: 'Problem', className: 'status-red', Icon: TriangleAlert },
}

export function StatusBadge({ value, compact = false }: { value: StatusValue; compact?: boolean }) {
  const config = statusConfig[value] ?? statusConfig.active
  const { Icon } = config
  return (
    <span className={`status-badge ${config.className} ${compact ? 'px-2 py-1 text-[10px]' : ''}`}>
      <Icon aria-hidden="true" size={compact ? 11 : 12} strokeWidth={2.2} />
      {config.label}
    </span>
  )
}
