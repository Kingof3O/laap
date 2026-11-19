export const pageMeta = {
  Overview: {
    eyebrow: 'BUSINESS & HEALTH',
    title: 'Operations Overview',
    description: 'Monitor active subscriptions, revenue metrics, and billing infrastructure health.',
  },
  Customers: {
    eyebrow: 'MEMBERSHIP & DEVICES',
    title: 'Customers & Licenses',
    description: 'Search registered accounts, manage Pro grants, and authorize hardware PC transfer overrides.',
  },
  Gifts: {
    eyebrow: 'CODES & PROMOTIONS',
    title: 'Gift & Promo Codes',
    description: 'Generate time-limited or lifetime Pro codes, assign them to recipients, or revoke active codes.',
  },
  Audit: {
    eyebrow: 'TRANSACTIONS & EVENTS',
    title: 'Audit & Webhooks',
    description: 'Inspect live Paddle payments, customer checkouts, and security audit records.',
  },
} as const

export type PageName = keyof typeof pageMeta
