export const LINKS = {
  releases: "https://github.com/Kingof3O/laap/releases/latest",
  repository: "https://github.com/Kingof3O/laap",
  security: "https://github.com/Kingof3O/laap/blob/main/SECURITY.md",
  privacy: "https://github.com/Kingof3O/laap/blob/main/PRIVACY.md",
  docs: "https://github.com/Kingof3O/laap#key-features",
  license: "https://github.com/Kingof3O/laap/blob/main/LICENSE",
} as const;

export const CHAPTERS = [
  {
    id: "switching",
    number: "01",
    eyebrow: "EVERY ACCOUNT, ONE HOME",
    title: "Your roster. Without the friction.",
    description: "Favorites, profile notes, regions and competitive ranks stay together. Find the profile you want and launch through the official Riot client.",
    image: "/images/launcher-grid.png",
    imageAlt: "Actual LAAP desktop account grid with saved League profiles",
    marker: "THE ROSTER",
  },
  {
    id: "privacy",
    number: "02",
    eyebrow: "LOCAL-FIRST SECURITY",
    title: "Your sessions stay yours.",
    description: "Saved sessions are encrypted locally. LAAP uses the operating system's credential storage for the encryption key and never asks you to type a Riot password into the app.",
    image: "/images/profile-editor.png",
    imageAlt: "Actual LAAP desktop profile editor",
    marker: "YOUR DEVICE",
  },
  {
    id: "presence",
    number: "03",
    eyebrow: "CONTROL YOUR PRESENCE",
    title: "Choose how you show up.",
    description: "Manage your League chat presence with built-in controls, without modifying game memory. Session switching also checks for active games to reduce accidental interruptions.",
    image: "/images/profile-sync.png",
    imageAlt: "Actual LAAP desktop profile and presence synchronization screen",
    marker: "YOUR CONTROL",
  },
] as const;

export const FAQ = [
  {
    question: "Is LAAP free?",
    answer: "LAAP Basic supports two active profiles and doesn't require a billing account. Pro is planned for unlimited profiles, with purchase availability dependent on approvals and billing launch.",
  },
  {
    question: "Where are my accounts stored?",
    answer: "Your saved Riot sessions are kept in a local encrypted vault, with keys protected by your operating system. Account labels, regions and notes remain local profile metadata.",
  },
  {
    question: "Does LAAP ask for Riot passwords?",
    answer: "No. Sign in using the official Riot client. LAAP works with the resulting local session rather than collecting passwords.",
  },
  {
    question: "Does it inject into League or bypass Vanguard?",
    answer: "No. LAAP does not inject DLLs, read game memory, bypass anti-cheat, unlock paid content, or automate gameplay. Riot's client and policies may change, and no third-party app can guarantee account outcomes.",
  },
  {
    question: "What happens if Pro expires?",
    answer: "Extra profiles remain safely saved in the local vault. Basic lets you select two active profiles; you can replace an active profile without deleting another saved profile.",
  },
  {
    question: "Which platforms are supported?",
    answer: "LAAP provides Windows installers and a macOS release. Check the GitHub releases page for the actual available builds and versions.",
  },
] as const;
