export const products = {
  basic: { name: 'LAAP Basic', accounts: true, studio: false },
  studio: { name: 'LAAP Studio', accounts: false, studio: true },
  complete: { name: 'LAAP Complete', accounts: true, studio: true },
} as const

export type ProductFlavor = keyof typeof products
export const flavor: ProductFlavor =
  import.meta.env.MODE === 'offline' || import.meta.env.MODE === 'basic'
    ? 'basic'
    : import.meta.env.MODE === 'studio' ? 'studio' : 'complete'
export const product = products[flavor]
