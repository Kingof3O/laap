export const pageMeta = {
  Overview: {
    eyebrow: 'HOME',
    title: 'Welcome back.',
    description: 'See what is ready, what is in use, and what needs attention.',
  },
  'Account pool': {
    eyebrow: 'ACCOUNTS',
    title: 'Your accounts.',
    description: 'See which accounts are ready, in use, or temporarily unavailable.',
  },
  Assignments: {
    eyebrow: 'ACCESS',
    title: 'Who can use each account.',
    description: 'Give people access to the accounts they need, and remove it when you are done.',
  },
  Users: {
    eyebrow: 'PEOPLE',
    title: 'Authorized users.',
    description: 'Add people to LAAP and choose what they are allowed to do.',
  },
  Devices: {
    eyebrow: 'COMPUTERS',
    title: 'Connected computers.',
    description: 'See which computers are ready to start an account session.',
  },
  'Audit log': {
    eyebrow: 'HISTORY',
    title: 'Recent activity.',
    description: 'Review the important changes made in your workspace.',
  },
} as const

export type PageName = keyof typeof pageMeta
