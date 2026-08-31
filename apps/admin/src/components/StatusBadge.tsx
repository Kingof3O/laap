import { Circle, LoaderCircle, Radio, TriangleAlert } from 'lucide-react'
import type { SessionRow } from '../lib/data'

type StatusValue = SessionRow['runtimeState'] | SessionRow['status'] | 'Available' | 'Leased' | 'Maintenance' | 'Operator' | 'Administrator' | 'Active' | 'suspended' | 'disabled'

const statusConfig: Record<StatusValue, { label: string; className: string; Icon: typeof Circle }> = {
  IN_GAME: { label: 'In game', className: 'status-green', Icon: Radio },
  IN_CLIENT: { label: 'In client', className: 'status-blue', Icon: Circle },
  RECONNECTING: { label: 'Reconnecting', className: 'status-amber', Icon: LoaderCircle },
  LAUNCHING: { label: 'Launching', className: 'status-violet', Icon: LoaderCircle },
  EXITED: { label: 'Exited', className: 'status-slate', Icon: Circle },
  active: { label: 'Active', className: 'status-green', Icon: Circle },
  starting: { label: 'Starting', className: 'status-violet', Icon: LoaderCircle },
  stopping: { label: 'Stopping', className: 'status-amber', Icon: LoaderCircle },
  stale: { label: 'Stale', className: 'status-amber', Icon: TriangleAlert },
  error: { label: 'Error', className: 'status-red', Icon: TriangleAlert },
  Available: { label: 'Available', className: 'status-green', Icon: Circle },
  Leased: { label: 'Leased', className: 'status-violet', Icon: Circle },
  Maintenance: { label: 'Maintenance', className: 'status-amber', Icon: TriangleAlert },
  Operator: { label: 'Operator', className: 'status-blue', Icon: Circle },
  Administrator: { label: 'Administrator', className: 'status-violet', Icon: Circle },
  Active: { label: 'Active', className: 'status-green', Icon: Circle },
  suspended: { label: 'Suspended', className: 'status-amber', Icon: TriangleAlert },
  disabled: { label: 'Disabled', className: 'status-red', Icon: TriangleAlert },
}

export function StatusBadge({ value, compact = false }: { value: StatusValue; compact?: boolean }) {
  const config = statusConfig[value]
  const { Icon } = config
  return (
    <span className={`status-badge ${config.className} ${compact ? 'px-2 py-1 text-[10px]' : ''}`}>
      <Icon aria-hidden="true" className={value === 'RECONNECTING' || value === 'LAUNCHING' || value === 'starting' || value === 'stopping' ? 'animate-spin' : ''} size={compact ? 11 : 12} strokeWidth={2.2} />
      {config.label}
    </span>
  )
}
