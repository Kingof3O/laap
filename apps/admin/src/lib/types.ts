export type AdminUser = {
  id: string
  email: string
  role: 'owner'
}

export type OverviewMetrics = {
  totalUsers: number
  activeSubscribers: number
  planCounts: {
    monthly: number
    yearly: number
    lifetime: number
    gifts: number
  }
  mrr: number
  totalRevenue: number
  totalGifts: number
  activeGifts: number
  redeemedGifts: number
}

export type SystemHealth = {
  worker: string
  supabase: string
  paddle: string
}

export type OverviewData = {
  metrics: OverviewMetrics
  health: SystemHealth
}

export type Customer = {
  id: string
  email: string
  createdAt: string
  confirmedAt: string | null
  lastSignInAt: string | null
  hasPro: boolean
  plan: string
  giftId: string | null
  endsAt: string | null
}

export type GiftCode = {
  id: string
  duration: 'month' | 'year' | 'lifetime'
  recipient: string | null
  redeem_by: string
  redeemed_at: string | null
  ends_at: string | null
  revoked_at: string | null
  code?: string
}

export type PaddleTransaction = {
  id: string
  status: string
  customer_id: string
  created_at: string
  details?: {
    totals?: {
      grand_total?: string
    }
  }
  currency_code?: string
}

export type AuditData = {
  transactions: PaddleTransaction[]
  gifts: GiftCode[]
}

export type PageName = 'Overview' | 'Customers' | 'Gifts' | 'Audit'
