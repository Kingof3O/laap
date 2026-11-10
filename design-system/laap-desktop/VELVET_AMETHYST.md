# Velvet Amethyst desktop design system

The canvas is deep violet `#100D19` with a `#0A0811` shadow falloff. Primary surfaces use `#241D34`, raised glass `#392D4C`, and muted structural strokes `#54456F`. Lavender `#C9A6FF` is reserved for primary actions, focus and selection; hover uses `#DCC7FF`, deeper accents `#9C76DB`. Primary text is `#F8F2FF`, supporting text `#C3B5D2` and muted text `#AC9DC2`; `#A89BD9` provides secondary illumination. Green, amber and red remain operational status colors. Real LAAP branding and League crests retain their source colors.

Sora is the locally bundled display face; Manrope is used for controls and descriptions. Use the existing 4/8/12/16/20/24/32px spacing rhythm, compact 32px controls, 36–40px standard controls, and a 40px primary action where space permits. Keep labels readable, use visible focus outlines, and ensure controls retain accessible names.

The background uses static radial violet lighting and dark edge falloff. Primary cards and the inspector use translucent gradients, fine strokes, top highlights and directional shadows. Floating menus and dialogs use a stronger surface and selective backdrop blur. Avoid excessive nested borders and animated background effects.

Use the unified title bar and toolbar; account count is quiet metadata, view mode is segmented, and Add Profile is the primary action. The profile inspector is optional and persisted. Presence shows requested and applied state, with a guarded restart only inside its popover. Background synchronization should not trigger visible syncing animations on routine checks. Dialogs retain scrollable content and a visible footer.

Use short opacity and translation transitions for menus and dialogs, subtle button feedback and selection changes. Respect OS and application reduced-motion preferences. Do not rely on color alone for operational state. Keep credential handling and Riot session lifecycle outside presentation code.

The semantic source is `apps/desktop/src/styles/tokens.css`; workspace and component styles use the `--accent-*`, `--bg-*`, `--text-*`, `--status-*` and border tokens. Remaining raw values include status colors, shadows, material gradients and rank-specific exceptions; `docs/visual-v2-3/color-inventory.json` lists the current inventory.
