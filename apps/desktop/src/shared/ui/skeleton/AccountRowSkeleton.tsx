import { Skeleton } from './Skeleton.tsx'

export function AccountRowSkeleton({ className = '' }: { className?: string }) {
  return (
    <tr className={`roster-table-row-skeleton ${className}`} aria-hidden="true">
      {/* Profile Column */}
      <td>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Skeleton
            variant="rectangular"
            width={28}
            height={28}
            style={{ borderRadius: '6px' }}
          />
          <div style={{ display: 'grid', gap: 4 }}>
            <Skeleton variant="text" width={96} height={13} />
            <Skeleton variant="text" width={56} height={10} />
          </div>
        </div>
      </td>

      {/* Rank Column */}
      <td>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Skeleton variant="circular" width={22} height={22} />
          <Skeleton variant="text" width={74} height={12} />
        </div>
      </td>

      {/* Region Column */}
      <td>
        <Skeleton variant="pill" width={38} height={18} />
      </td>

      {/* Status Column */}
      <td>
        <Skeleton variant="pill" width={82} height={18} />
      </td>

      {/* Last Played Column */}
      <td>
        <Skeleton variant="text" width={64} height={11} />
      </td>

      {/* Actions Column */}
      <td>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
          <Skeleton variant="circular" width={24} height={24} />
          <Skeleton variant="pill" width={64} height={28} />
        </div>
      </td>
    </tr>
  )
}
