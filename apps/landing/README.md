# LAAP Landing

A separate, public-facing marketing application for LAAP. Built with the repository's React 19 + TypeScript + Vite stack and the existing Velvet Amethyst design tokens, fonts and authentic desktop captures.

## Local development

From the repository root (Node.js 22+):

```sh
npm ci
npm run landing:dev
npm run landing:typecheck
npm run landing:build
npm run landing:preview
```

The output is `apps/landing/dist`. For Cloudflare Pages, build from the repository root with `npm ci && npm run landing:build`, and set output directory to `apps/landing/dist`. The marketing app does not share routes, authentication, runtime storage or network clients with the admin dashboard or desktop app.

## Architecture

- `src/content.ts`: approved source-aligned feature copy, FAQs and public links
- `src/components/Nav.tsx`: responsive accessible navigation
- `src/components/ProductWindow.tsx`: desktop screenshot frame
- `src/components/ScrollStory.tsx`: pinned scroll narrative and image chapters
- `src/components/Pricing.tsx`: selectable planned pricing, no checkout
- `src/components/Faq.tsx`: native keyboard-accessible disclosures
- `src/App.tsx`: section composition and page shell
- `src/styles.css`: design tokens, responsive styling, motion fallback

### Scroll interaction

The right column uses native CSS `position: sticky`. A passive scroll listener, throttled to one `requestAnimationFrame` per paint, chooses the nearest narrative chapter and scrubs a lightweight progress indicator. It **does not intercept the wheel, alter the scroll position, force smooth scrolling, block the browser's back button or run an animation engine on every element**. On tablet/mobile, sticky visuals are replaced with a normal stack of screenshots. `prefers-reduced-motion` disables transitions and smooth anchor scrolling.

## Product / release constraints

- The latest releases link is GitHub's real public release listing. Don't hardcode unverified versions, platform availability, download size, counts or testimonials.
- Basic includes two active profiles; planned Pro pricing is $3 monthly, $20 yearly, and $60 lifetime.
- Production Pro checkout must remain **disabled** until the repository's billing and approval gates are met. No dead checkout buttons, payment forms, or promises of launch dates.
- LAAP is an independent project, not endorsed by Riot. Avoid anti-cheat guarantees or claims of account safety; the site points to the repo's security materials.

## Before launch

- Set the production origin and add a canonical URL, sitemap, and absolute OG image URL. These cannot safely be invented before a domain exists.
- Confirm the release page includes signed binaries for advertised platforms.
- Run Lighthouse, axe / screen-reader tests, keyboard navigation, 320/375/768/1440px viewports, Safari/iOS, Firefox, and reduced-motion.
- Validate content against desktop product and billing changes before publishing.
- Use a consent-free static deploy unless analytics are explicitly approved; do not add trackers by default.

Assets under `public/` are copied from versioned files already in this repository. Any screenshot changes should be deliberate and reviewed alongside the app UI.
