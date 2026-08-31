import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Fira Sans', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['Fira Code', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      colors: {
        ink: 'var(--color-ink)',
        canvas: 'var(--color-canvas)',
        panel: 'var(--color-panel)',
        'panel-strong': 'var(--color-panel-strong)',
        sidebar: 'var(--color-sidebar)',
        stroke: 'var(--color-stroke)',
        muted: 'var(--color-muted)',
        accent: 'var(--color-accent)',
        cyan: 'var(--color-cyan)',
        success: 'var(--color-success)',
        warning: 'var(--color-warning)',
        danger: 'var(--color-danger)',
        tooltip: 'var(--color-tooltip)',
      },
      boxShadow: {
        glass: 'var(--shadow-glass)',
        glow: 'var(--shadow-glow)',
      },
    },
  },
  plugins: [],
} satisfies Config
