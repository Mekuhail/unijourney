# Impeccable audit after P1 (26 Sep 2026)

Scope: client at commit `804c026`, dev build, Chrome headless at 375×812 and 1440×900, light and dark, English and
Arabic. Evidence: axe-core 4 (WCAG 2.0/2.1 A and AA rules) on 31 routes, the impeccable detector on the source tree and
on five rendered routes at 390×844, the project QA script (first-paint visibility, heading order, text size, tap
targets, overflow, document title), and a production `vite build`.

## Audit health score

| # | Dimension | Score | Key finding |
|---|-----------|-------|-------------|
| 1 | Accessibility | 3 | axe reports no violations on 31 routes; input placeholders sit at 3.9:1 in dark mode |
| 2 | Performance | 2 | Main bundle is 674 KB (209 KB gzip); Today still runs a WebGL aurora and a click-spark canvas |
| 3 | Responsive design | 3 | 44 px targets and no horizontal overflow; phone side gutter is 12 px, not 16 px |
| 4 | Theming | 3 | Semantic tokens in both themes; hero and card gradients and map category colours are hard-coded hex |
| 5 | Implementation integrity | 2 | Decorative "generated UI" tells remain: gradient text, orange glow shadows, spotlight glows, eyebrow kickers, glass |
| **Total** | | **13/20** | **Acceptable** |

## Implementation integrity verdict

**Fail, narrowly.** The system underneath is coherent: semantic colour tokens, one Button/Badge/Tabs/Menu family, a
single PageHeader, and product-specific structure (attendance meters, prerequisite map, registration flow). The fail
comes from a decorative layer on top: `GradientText` on the Academics progress figure and the Lost & Found hero,
`ShinyText` on Today and Lost & Found, the Aurora hero, `SpotlightCard` radial glows on job and quick-action cards
(detector: `radial-spotlight-glow` ×3 on /career), an orange `box-shadow` glow on primary buttons (`dark-glow`),
uppercase kickers above every h1 (`kicker-above-heading`), and `.glass` blur on toasts and overlays. All of these are
scheduled in P2 (items 20 and 22).

Detector false positives: `side-tab` in `modules/academics/components.tsx:157` is the capacity marker inside a load
bar, not a card accent. `text-occlusion` on the campus map is map labels drawn over building footprints with a halo,
which is intended. `overused-font` (Inter) is a brand commitment kept on purpose.

## Executive summary

- Score **13/20 (Acceptable)**. Issues: P0 0, P1 2, P2 6, P3 3.
- Top issues: decorative layer (integrity), main bundle size, placeholder contrast, duplicated Today content,
  12 px phone gutter.
- Next: P2 polish items (content, labels, decoration), then P3 code splitting and layer tokens.

## Findings by severity

**[P1] Decorative text effects and glows**
Location: `modules/academics/pages/OverviewPage.tsx` (GradientText), `modules/campus/pages/LostFoundPage.tsx`
(GradientText, ShinyText), `modules/today/TodayPage.tsx` (Aurora, ShinyText), `components/ui/index.tsx` (primary
button glow), SpotlightCard on Career and Today. Category: implementation integrity. Impact: numbers and headings read
as ornament, motion competes with content on phones. Recommendation: solid text colours, neutral elevation shadows, no
spotlight or aurora layers. Command: `/impeccable quieter`.

**[P1] Main bundle 674 KB**
Location: `client/src/App.tsx` eagerly imports Today, Notifications, Approvals and Calendar plus shared vendor code.
Category: performance. Impact: slow first load on mobile data. Recommendation: lazy-load every route with Suspense
skeletons and split vendor chunks. Command: `/impeccable optimize`.

**[P2] Placeholder contrast 3.9:1 in dark mode**
Location: `components/ui/index.tsx` input class `placeholder:text-muted/70`. Category: accessibility. Impact: hint text
is hard to read in sunlight. Standard: WCAG 1.4.3 (advisory for placeholders). Recommendation: use `text-muted`
without alpha. Command: `/impeccable polish`.

**[P2] Phone side gutter 12 px**
Location: `.pad-safe-x` in `styles/index.css`. Category: responsive. Impact: paragraphs sit close to the screen edge
(detector `body-text-viewport-edge` on 4 routes). Recommendation: 16 px minimum. Command: `/impeccable layout`.

**[P2] Today repeats content**
Location: `modules/today/TodayPage.tsx`. Category: implementation integrity. Impact: schedule appears in the list and
the week grid; study planner is linked from four places. Recommendation: spec item 19. Command: `/impeccable distill`.

**[P2] Uppercase kickers above headings**
Location: `components/ui/PageHeader.tsx` eyebrow, `SectionTitle`. Category: implementation integrity. Impact: repeats
the navigation label; uppercase long labels read poorly (`all-caps-body` on /prereqs). Recommendation: breadcrumbs on
sub-pages only (spec item 20). Command: `/impeccable clarify`.

**[P2] Prerequisite graph clipped**
Location: `modules/prereqs/PrereqChainsPage.tsx` diagram section `overflow-hidden`. Category: responsive. Impact: node
cards cut at the scroll edge (`clipped-overflow-container`). Recommendation: spec item 30. Command: `/impeccable layout`.

**[P2] Width animations on load bars**
Location: `modules/academics/components.tsx:159`, `components/ui/index.tsx` Progress. Category: performance. Impact:
layout-property animation on every render. Recommendation: animate `transform: scaleX` or render the final width.
Command: `/impeccable animate`.

**[P3] Info only in `title` tooltips**
Location: study load bars, calendar lock icon (now also labelled). Category: accessibility. Impact: touch users cannot
hover. Recommendation: visible text or a disclosure. Command: `/impeccable clarify`.

**[P3] Hard-coded hex colours**
Location: hero gradients (`#1e1b18`, `#3a2a1a`), React Bits props, map `CATEGORY_COLOR`. Category: theming.
Recommendation: move to tokens where they are theme-dependent; map categories can stay fixed. Command: `/impeccable colorize`.

**[P3] Ad hoc z-index values**
Location: about 20 `z-[..]` utilities. Category: theming. Recommendation: spec item 33 (tokens already defined).
Command: `/impeccable harden`.

## Patterns and systemic issues

- A decorative component layer (React Bits) sits on top of an otherwise tokenised system; removing it is mostly deletion.
- Hard-coded English strings still appear in a few places (demo notes, calendar legend kinds, company names with "(demo)").

## Positive findings

- Content is visible on first paint on every route; no text waits on an animation.
- axe-core: zero WCAG A/AA violations across 31 routes, both themes, both languages.
- One h1 per route, no skipped heading levels, localized `document.title`, focus moves to the h1 after navigation.
- 44 px targets on touch, a real link-based bottom navigation, direction-aware scroll rows and steppers.
- Arabic RTL holds at every step checked; no horizontal overflow at 375 px.

## Recommended actions

1. **[P1] `/impeccable quieter`**: remove gradient text, shiny text, aurora, spotlight and glow shadows.
2. **[P1] `/impeccable optimize`**: route-level code splitting and vendor chunks.
3. **[P2] `/impeccable distill`**: Today sections and duplicate links.
4. **[P2] `/impeccable clarify`**: breadcrumbs instead of kickers, plain-language labels, plurals, dates.
5. **[P2] `/impeccable layout`**: prerequisite graph and legend, 16 px phone gutter.
6. **[P3] `/impeccable harden`**: z-index tokens everywhere.
7. **`/impeccable polish`**: final pass.
