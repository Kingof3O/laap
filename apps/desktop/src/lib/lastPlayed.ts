/**
 * Compact, localized recency label for the roster. Keep the original value
 * in the card's title attribute so exact timestamps remain accessible.
 */
export function formatLastPlayed(value: string | null | undefined, now = new Date()): string {
  if (!value) return 'Never'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value

  const midnight = (date: Date) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  const elapsedDays = Math.round((midnight(now) - midnight(parsed)) / 86_400_000)

  if (elapsedDays === 0) return 'Today'
  if (elapsedDays === 1) return 'Yesterday'
  if (elapsedDays > 1 && elapsedDays < 7) return `${elapsedDays} days ago`
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    ...(parsed.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
  }).format(parsed)
}
