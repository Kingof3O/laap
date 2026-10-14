import { REGION_GROUPS } from '../../lib/constants'
import type { Region } from '../../lib/types'
export function RegionSelect({
  value,
  onChange,
  disabled = false,
  includeAll = false,
  label = 'Region',
}: {
  value: string
  onChange: (region: Region | '') => void
  disabled?: boolean
  includeAll?: boolean
  label?: string
}) {
  return (
    <select
      className="hextech-select"
      aria-label={label}
      disabled={disabled}
      value={value}
      onChange={(event) => onChange(event.target.value as Region | '')}
    >
      {includeAll ? (
        <option value="ALL">All regions</option>
      ) : (
        <option value="">Choose region</option>
      )}
      {REGION_GROUPS.map((group) => (
        <optgroup key={group.label} label={group.label}>
          {group.regions.map((region) => (
            <option value={region.value} key={region.value}>
              {region.value} — {region.label}
            </option>
          ))}
        </optgroup>
      ))}
      {value === 'SEA' || includeAll ? (
        <optgroup label="Legacy region">
          <option value="SEA">SEA — Previously saved region</option>
        </optgroup>
      ) : null}
    </select>
  )
}
