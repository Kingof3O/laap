import type { PageName } from './data'

export const pageLabels: Record<PageName, string> = {
  Overview: 'Overview',
  Customers: 'Customers & Licenses',
  Gifts: 'Gift Codes',
  Audit: 'Audit & Webhooks',
}

export function navigationLabel(page: PageName) {
  return pageLabels[page] || page
}

export function initials(name: string) {
  return name
    .trim()
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'LP'
}

export function formatDate(isoString?: string | null) {
  if (!isoString) return '—'
  const date = new Date(isoString)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function formatDateTime(isoString?: string | null) {
  if (!isoString) return '—'
  const date = new Date(isoString)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
