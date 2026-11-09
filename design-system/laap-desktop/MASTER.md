# LAAP desktop: Obsidian Hextech

## Direction
An account launcher should put the roster and its launch action first. Obsidian and midnight surfaces carry the interface; champagne marks selection and primary actions, sapphire is reserved for information, and green, amber and red describe operational states. Avoid decorative animation, repeated borders around every nested element, and claims about operations that have not occurred.

## Foundation
The active CSS tokens are in `apps/desktop/src/styles/tokens.css`. Canvas is #080C17, surface #111D30, elevated surface #1C2D45, gold #DABB79, bright gold #F1D9A1 and sapphire #64CDE1. Text uses primary, secondary and muted roles; success, warning and danger have separate semantic tokens. Use the existing spacing and radius tokens and the 120/180 ms transition tokens; avoid arbitrary animation of layout dimensions. Focus must remain visible, and both OS and application reduced-motion preferences must be respected.

Sora is the display face and Manrope the interface face, bundled as local variable WOFF2 Latin subsets. Their SIL Open Font License notices are beside the assets. System fallbacks cover missing scripts. Use mono for versions and technical values. Cards use a translucent gradient, inner highlight, fine stroke and an 8px backdrop blur; floating menus use deeper shadows and a stronger glass surface. The canvas uses static radial lighting, not a continuously animated background.

## Components
Keep one application identity in the title area, with native controls on Windows and native traffic-light space on macOS. Keep search, filters, view selection and the add action in the roster toolbar. The filter disclosure contains region, rank and sorting. Cards keep identity, rank, session state and the primary action legible; favorites are separate from profile names. Menus must support keyboard navigation, escape, focus restoration and viewport positioning. Settings use a category rail and a scrollable content pane; controls must operate on the real controller and persisted preferences.

## References
The design direction was informed by [Anthropic frontend design](https://github.com/anthropics/skills/tree/main/skills/frontend-design) (deliberate identity), [UI/UX Pro Max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) (desktop accessibility and hierarchy), [Vercel Web Interface Guidelines](https://github.com/vercel-labs/web-interface-guidelines) (interaction and accessibility), [Radix Primitives](https://github.com/radix-ui/primitives) (accessible interaction patterns), [Motion Primitives](https://github.com/ibelick/motion-primitives) and [Motion](https://github.com/motiondivision/motion) (restrained transitions), [Magic UI](https://github.com/magicuidesign/magicui) and [React Bits](https://github.com/DavidHDev/react-bits) (lighting and effects). No component code or animation runtime was copied or added from these projects. Tauri's [window](https://v2.tauri.app/learn/window-customization/) and [updater](https://v2.tauri.app/plugin/updater/) guides are the native integration references.

## Small roster workspace
One and two account grids use a restrained two-column composition capped at 1120px. The inspector must reflect only the selected account's real session state, use, creation date and notes. Account selection remains keyboard accessible, and the compact list or larger grid is used when the roster grows. Cards receive only a restrained lift; entrances animate opacity and translation and must honor reduced motion.
