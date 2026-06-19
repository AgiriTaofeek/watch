# Watch Design System

A precise specification for the Watch dashboard UI. Every decision here is
grounded in the product's context: a dense, operational monitoring tool used by
developers under pressure, on any device, often in low-attention conditions.

This document is the reference for Task 6 (`feat/m6-design-system-foundation`)
and informs all subsequent M6 feature PRs. It should be read alongside
[README.md](README.md) (milestone scope) and
[frontend-architecture.md](frontend-architecture.md) (TanStack strategy).

---

## 1. Design Principles

These are not aspirations. They are decision filters. When a design choice is
unclear, return to the principle that applies.

### 1.1 Operational over decorative

Watch exists so a developer can diagnose and triage production failures fast.
Every pixel that does not contribute to that goal is friction. No hero banners,
gradient fills, or animated brand moments inside the authenticated shell.

### 1.2 Density without crowding

Developers using a monitoring tool are reading dense information: tables of
issues, rollup charts over time, environment selectors, status badges. The
layout must pack more information per screen than a marketing product. But
density has a ceiling: when rows are indistinguishable or actions are
unreachable by touch, density hurts. Find the right balance through measured
row heights, clear typographic hierarchy, and intentional whitespace at
structural breaks.

### 1.3 Hierarchy from data, not decoration

Color, size, and weight should signal the importance of data — a high-severity
issue, a degraded vital score, an unresolved error trend. They should not
signal the brand. The information hierarchy should be readable by a developer
glancing at the screen for two seconds.

### 1.4 Stability under real data

The layout must hold when project names are 60 characters long, when an issue
title wraps across three lines, when a rollup returns zero buckets, when a
table has 200 rows with pagination, and when the viewport is 320 px wide.
Design for the worst realistic data first, then the typical case.

### 1.5 Mobile is a first-class triage surface

A developer on-call must be able to check an incident from a phone. This is not
"mobile support" as a stretch goal. It is a product capability gate. Every
screen must be usable at 360 px, even if the layout and information density
differ from desktop.

### 1.6 Accessibility is load-bearing

Visible focus rings, color-independent status indicators, keyboard-operable
controls, sufficient contrast, and labeled interactive elements are not polish
items. They are structural requirements. Treat them as such from the first
primitive.

### 1.7 Calm by default, urgent when warranted

The default dashboard state is calm and neutral. Status color and visual weight
escalate when something needs attention: a degraded health score, an open
high-frequency issue, a revoked key. The system should feel quiet until the
data says otherwise.

---

## 2. Color System

All colors are defined as CSS custom properties scoped to `:root` and
overridden under `.dark`. Tailwind classes reference these variables through
`tailwind.config.ts`. No hex value should appear in a component directly;
every color reference goes through a semantic token.

### 2.1 Token Architecture

Tokens follow a three-layer model:

```
Primitive  →  Semantic  →  Component alias
#0ea5e9   →  --color-accent  →  --color-button-primary-bg
```

Components always consume the semantic or component-alias layer. Only the
design token file touches primitives.

### 2.2 Primitive Palette

These are the raw color values. They are not used in components.

```css
/* Neutral scale — slate-based for code-adjacent readability */
--primitive-neutral-0:   #ffffff;
--primitive-neutral-50:  #f8fafc;
--primitive-neutral-100: #f1f5f9;
--primitive-neutral-200: #e2e8f0;
--primitive-neutral-300: #cbd5e1;
--primitive-neutral-400: #94a3b8;
--primitive-neutral-500: #64748b;
--primitive-neutral-600: #475569;
--primitive-neutral-700: #334155;
--primitive-neutral-800: #1e293b;
--primitive-neutral-850: #172033;
--primitive-neutral-900: #0f172a;
--primitive-neutral-950: #020617;

/* Accent — blue, used sparingly for interactive affordance */
--primitive-accent-50:  #eff6ff;
--primitive-accent-100: #dbeafe;
--primitive-accent-200: #bfdbfe;
--primitive-accent-400: #60a5fa;
--primitive-accent-500: #3b82f6;
--primitive-accent-600: #2563eb;
--primitive-accent-700: #1d4ed8;
--primitive-accent-900: #1e3a8a;

/* Success — green */
--primitive-success-50:  #f0fdf4;
--primitive-success-100: #dcfce7;
--primitive-success-200: #bbf7d0;
--primitive-success-500: #22c55e;
--primitive-success-600: #16a34a;
--primitive-success-700: #15803d;
--primitive-success-900: #14532d;

/* Warning — amber */
--primitive-warning-50:  #fffbeb;
--primitive-warning-100: #fef3c7;
--primitive-warning-200: #fde68a;
--primitive-warning-400: #fbbf24;
--primitive-warning-500: #f59e0b;
--primitive-warning-600: #d97706;
--primitive-warning-700: #b45309;
--primitive-warning-900: #78350f;

/* Danger — red */
--primitive-danger-50:  #fff1f2;
--primitive-danger-100: #ffe4e6;
--primitive-danger-200: #fecdd3;
--primitive-danger-400: #fb7185;
--primitive-danger-500: #ef4444;
--primitive-danger-600: #dc2626;
--primitive-danger-700: #b91c1c;
--primitive-danger-900: #7f1d1d;

/* Chart series — perceptually distinct, colorblind-tested */
--primitive-chart-blue:   #3b82f6;
--primitive-chart-violet: #8b5cf6;
--primitive-chart-emerald:#10b981;
--primitive-chart-amber:  #f59e0b;
--primitive-chart-rose:   #f43f5e;
--primitive-chart-cyan:   #06b6d4;
```

### 2.3 Semantic Tokens (Light Mode)

```css
:root {
  /* ── Backgrounds ── */
  --color-bg-base:         var(--primitive-neutral-50);   /* page background */
  --color-bg-surface:      var(--primitive-neutral-0);    /* card, panel, dialog */
  --color-bg-sunken:       var(--primitive-neutral-100);  /* well, input, code block */
  --color-bg-elevated:     var(--primitive-neutral-0);    /* tooltip, dropdown */
  --color-bg-overlay:      rgba(15, 23, 42, 0.4);         /* modal scrim */

  /* ── Borders ── */
  --color-border-default:  var(--primitive-neutral-200);
  --color-border-strong:   var(--primitive-neutral-300);
  --color-border-focus:    var(--primitive-accent-500);

  /* ── Text ── */
  --color-text-primary:    var(--primitive-neutral-900);
  --color-text-secondary:  var(--primitive-neutral-600);
  --color-text-tertiary:   var(--primitive-neutral-400);
  --color-text-disabled:   var(--primitive-neutral-300);
  --color-text-inverse:    var(--primitive-neutral-0);
  --color-text-link:       var(--primitive-accent-600);
  --color-text-link-hover: var(--primitive-accent-700);
  --color-text-code:       var(--primitive-neutral-800);

  /* ── Interactive (accent) ── */
  --color-accent-default:  var(--primitive-accent-500);
  --color-accent-hover:    var(--primitive-accent-600);
  --color-accent-active:   var(--primitive-accent-700);
  --color-accent-subtle:   var(--primitive-accent-50);
  --color-accent-muted:    var(--primitive-accent-100);
  --color-accent-text:     var(--primitive-accent-700);

  /* ── Status: success / good ── */
  --color-success-default: var(--primitive-success-600);
  --color-success-subtle:  var(--primitive-success-50);
  --color-success-muted:   var(--primitive-success-100);
  --color-success-text:    var(--primitive-success-700);

  /* ── Status: warning / needs-improvement ── */
  --color-warning-default: var(--primitive-warning-500);
  --color-warning-subtle:  var(--primitive-warning-50);
  --color-warning-muted:   var(--primitive-warning-100);
  --color-warning-text:    var(--primitive-warning-700);

  /* ── Status: danger / poor / error / open ── */
  --color-danger-default:  var(--primitive-danger-600);
  --color-danger-subtle:   var(--primitive-danger-50);
  --color-danger-muted:    var(--primitive-danger-100);
  --color-danger-text:     var(--primitive-danger-700);

  /* ── Status: neutral / resolved / ignored ── */
  --color-neutral-default: var(--primitive-neutral-500);
  --color-neutral-subtle:  var(--primitive-neutral-100);
  --color-neutral-muted:   var(--primitive-neutral-200);
  --color-neutral-text:    var(--primitive-neutral-600);

  /* ── Skeleton / shimmer ── */
  --color-skeleton-base:   var(--primitive-neutral-200);
  --color-skeleton-shine:  var(--primitive-neutral-100);
}
```

### 2.4 Dark Mode Override

Applied with `.dark` on `<html>` (shadcn/ui convention via `next-themes` or
manual class toggle).

```css
.dark {
  --color-bg-base:         var(--primitive-neutral-950);
  --color-bg-surface:      var(--primitive-neutral-900);
  --color-bg-sunken:       var(--primitive-neutral-850);
  --color-bg-elevated:     var(--primitive-neutral-800);
  --color-bg-overlay:      rgba(0, 0, 0, 0.6);

  --color-border-default:  var(--primitive-neutral-800);
  --color-border-strong:   var(--primitive-neutral-700);
  --color-border-focus:    var(--primitive-accent-400);

  --color-text-primary:    var(--primitive-neutral-50);
  --color-text-secondary:  var(--primitive-neutral-400);
  --color-text-tertiary:   var(--primitive-neutral-600);
  --color-text-disabled:   var(--primitive-neutral-700);
  --color-text-inverse:    var(--primitive-neutral-900);
  --color-text-link:       var(--primitive-accent-400);
  --color-text-link-hover: var(--primitive-accent-200);
  --color-text-code:       var(--primitive-neutral-200);

  --color-accent-default:  var(--primitive-accent-500);
  --color-accent-hover:    var(--primitive-accent-400);
  --color-accent-active:   var(--primitive-accent-200);
  --color-accent-subtle:   var(--primitive-accent-900);
  --color-accent-muted:    color-mix(in srgb, var(--primitive-accent-900) 80%, transparent);
  --color-accent-text:     var(--primitive-accent-400);

  --color-success-default: var(--primitive-success-500);
  --color-success-subtle:  var(--primitive-success-900);
  --color-success-muted:   color-mix(in srgb, var(--primitive-success-900) 70%, transparent);
  --color-success-text:    var(--primitive-success-200);

  --color-warning-default: var(--primitive-warning-400);
  --color-warning-subtle:  var(--primitive-warning-900);
  --color-warning-muted:   color-mix(in srgb, var(--primitive-warning-900) 70%, transparent);
  --color-warning-text:    var(--primitive-warning-200);

  --color-danger-default:  var(--primitive-danger-400);
  --color-danger-subtle:   var(--primitive-danger-900);
  --color-danger-muted:    color-mix(in srgb, var(--primitive-danger-900) 70%, transparent);
  --color-danger-text:     var(--primitive-danger-200);

  --color-neutral-default: var(--primitive-neutral-400);
  --color-neutral-subtle:  var(--primitive-neutral-800);
  --color-neutral-muted:   var(--primitive-neutral-700);
  --color-neutral-text:    var(--primitive-neutral-400);

  --color-skeleton-base:   var(--primitive-neutral-800);
  --color-skeleton-shine:  var(--primitive-neutral-700);
}
```

### 2.5 Status Semantics

Watch has two overlapping status concepts that share colors but must not be
conflated in code:

| Concept | Values | Color token |
|---------|--------|-------------|
| Issue status | `open` | `--color-danger-*` |
| Issue status | `resolved` | `--color-success-*` |
| Issue status | `ignored` | `--color-neutral-*` |
| Web Vital health | `good` | `--color-success-*` |
| Web Vital health | `needs-improvement` | `--color-warning-*` |
| Web Vital health | `poor` | `--color-danger-*` |
| API/form feedback | error | `--color-danger-*` |
| API/form feedback | success | `--color-success-*` |
| Key status | `active` | `--color-success-*` |
| Key status | `revoked` | `--color-neutral-*` |

Never use raw `text-red-500` or similar in component code. Always name the
intent: `text-danger-text`, `bg-success-subtle`, etc.

### 2.6 Chart Color Tokens

Charts use a separate series palette that is perceptually distinct and
colorblind-safe. The tokens map through to Recharts `stroke` and `fill` props
via the chart wrapper component.

```css
:root {
  --color-chart-1: var(--primitive-chart-blue);
  --color-chart-2: var(--primitive-chart-violet);
  --color-chart-3: var(--primitive-chart-emerald);
  --color-chart-4: var(--primitive-chart-amber);
  --color-chart-5: var(--primitive-chart-rose);
  --color-chart-6: var(--primitive-chart-cyan);
  --color-chart-grid:    var(--primitive-neutral-200);
  --color-chart-axis:    var(--primitive-neutral-400);
  --color-chart-tooltip-bg:     var(--color-bg-elevated);
  --color-chart-tooltip-border: var(--color-border-default);
}

.dark {
  --color-chart-grid: var(--primitive-neutral-800);
  --color-chart-axis: var(--primitive-neutral-600);
}
```

Error rollup charts should always use `--color-chart-1` (blue) as the primary
series. Vital charts use `--color-chart-1` for p75 and `--color-chart-3`
(emerald) for mean when overlaid. Health score dots use the issue/vital status
color tokens, not chart series tokens.

---

## 3. Typography System

### 3.1 Font Stack

M6 uses the system font stack. No external font is loaded. This eliminates
FOUT, eliminates a network round trip on first paint, and respects the
developer's OS preferences.

```css
:root {
  --font-sans: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
    "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif,
    "Apple Color Emoji", "Segoe UI Emoji";

  --font-mono: ui-monospace, "Cascadia Code", "Source Code Pro", Menlo,
    Consolas, "DejaVu Sans Mono", monospace;
}
```

`--font-sans` is the dashboard default. `--font-mono` is used for DSN strings,
code blocks, environment names when treated as labels, and raw values that must
not reflow unexpectedly.

### 3.2 Type Scale

The scale uses a modular ratio of 1.25 (major third). Sizes are in `rem` so
browser zoom works correctly.

| Token | rem | px (16px base) | Usage |
|-------|-----|----------------|-------|
| `--text-xs`  | 0.75rem  | 12px | Table metadata, timestamps, secondary badge text |
| `--text-sm`  | 0.875rem | 14px | Table body, form labels, body copy, button text |
| `--text-base`| 1rem     | 16px | Dialog body, larger form controls |
| `--text-lg`  | 1.125rem | 18px | Section headings, panel titles |
| `--text-xl`  | 1.25rem  | 20px | Screen-level headings (h2) |
| `--text-2xl` | 1.5rem   | 24px | Page-level headings (h1) |
| `--text-3xl` | 1.875rem | 30px | Large metric numbers |
| `--text-4xl` | 2.25rem  | 36px | Primary display numbers (hero KPI) |

### 3.3 Font Weight

| Token | Value | Usage |
|-------|-------|-------|
| `--font-normal`   | 400 | Body, table cells, input values |
| `--font-medium`   | 500 | Labels, secondary headings, badge text |
| `--font-semibold` | 600 | Section headings, screen titles, active nav |
| `--font-bold`     | 700 | Page titles, metric numbers, critical emphasis |

### 3.4 Line Height

| Token | Value | Usage |
|-------|-------|-------|
| `--leading-tight`  | 1.25 | Headings, metric numbers, compact labels |
| `--leading-snug`   | 1.375| Table cells, badge text |
| `--leading-normal` | 1.5  | Body copy, dialog text, form helpers |
| `--leading-relaxed`| 1.625| Long-form explanation in empty states |

### 3.5 Named Type Roles

Each role names a specific context. Use the role name, not the raw token, in
components.

```css
:root {
  /* Page title: screen h1, used once per route */
  --type-page-title-size:   var(--text-2xl);
  --type-page-title-weight: var(--font-bold);
  --type-page-title-leading:var(--leading-tight);
  --type-page-title-color:  var(--color-text-primary);

  /* Section heading: panel/card h2, sidebar section labels */
  --type-section-size:   var(--text-lg);
  --type-section-weight: var(--font-semibold);
  --type-section-leading:var(--leading-tight);
  --type-section-color:  var(--color-text-primary);

  /* Subsection heading: table group labels, secondary panel titles */
  --type-subsection-size:   var(--text-base);
  --type-subsection-weight: var(--font-semibold);
  --type-subsection-leading:var(--leading-snug);
  --type-subsection-color:  var(--color-text-primary);

  /* Body: dialog text, empty-state descriptions, help text */
  --type-body-size:   var(--text-sm);
  --type-body-weight: var(--font-normal);
  --type-body-leading:var(--leading-normal);
  --type-body-color:  var(--color-text-primary);

  /* Table text: issue title, route, column value — scannable */
  --type-table-size:   var(--text-sm);
  --type-table-weight: var(--font-normal);
  --type-table-leading:var(--leading-snug);
  --type-table-color:  var(--color-text-primary);

  /* Table header: column header labels */
  --type-table-header-size:   var(--text-xs);
  --type-table-header-weight: var(--font-medium);
  --type-table-header-leading:var(--leading-snug);
  --type-table-header-color:  var(--color-text-secondary);
  --type-table-header-transform: uppercase;
  --type-table-header-tracking: 0.05em;

  /* Metric number: rollup KPI values, event counts */
  --type-metric-size:   var(--text-3xl);
  --type-metric-weight: var(--font-bold);
  --type-metric-leading:var(--leading-tight);
  --type-metric-color:  var(--color-text-primary);

  /* Metric label: the descriptor below or beside a metric number */
  --type-metric-label-size:   var(--text-xs);
  --type-metric-label-weight: var(--font-medium);
  --type-metric-label-color:  var(--color-text-secondary);
  --type-metric-label-transform: uppercase;
  --type-metric-label-tracking: 0.05em;

  /* Label: form field labels, input annotations */
  --type-label-size:   var(--text-sm);
  --type-label-weight: var(--font-medium);
  --type-label-leading:var(--leading-snug);
  --type-label-color:  var(--color-text-primary);

  /* Helper: below-input hints and field descriptions */
  --type-helper-size:  var(--text-xs);
  --type-helper-weight:var(--font-normal);
  --type-helper-leading:var(--leading-normal);
  --type-helper-color: var(--color-text-secondary);

  /* Code / DSN: monospace values, environment names as identifiers */
  --type-code-size:   var(--text-sm);
  --type-code-weight: var(--font-normal);
  --type-code-leading:var(--leading-relaxed);
  --type-code-family: var(--font-mono);
  --type-code-color:  var(--color-text-code);
  --type-code-bg:     var(--color-bg-sunken);

  /* Nav item: sidebar/bottom-nav link text */
  --type-nav-size:   var(--text-sm);
  --type-nav-weight: var(--font-medium);
  --type-nav-leading:var(--leading-snug);

  /* Badge: status label text */
  --type-badge-size:   var(--text-xs);
  --type-badge-weight: var(--font-medium);
  --type-badge-leading:var(--leading-snug);
  --type-badge-transform: none;
}
```

---

## 4. Spacing and Layout

### 4.1 Spacing Scale

Watch uses the Tailwind default spacing scale, which is `4px` based. The
tokens below name the key values used most in the dashboard.

| Token | Value | Common use |
|-------|-------|-----------|
| `--space-0.5` | 2px  | Hairline gaps, icon-to-text nudge |
| `--space-1`   | 4px  | Badge padding, tight chip gap |
| `--space-1.5` | 6px  | Icon button padding (compact), inline badge |
| `--space-2`   | 8px  | Form field gap, small button padding-x |
| `--space-3`   | 12px | Table cell padding, button padding |
| `--space-4`   | 16px | Card padding (compact), section gap |
| `--space-5`   | 20px | Card padding (default), toolbar height |
| `--space-6`   | 24px | Section vertical gap, panel padding |
| `--space-8`   | 32px | Between sections, sidebar padding |
| `--space-10`  | 40px | Major vertical breaks |
| `--space-12`  | 48px | Empty state vertical padding |
| `--space-16`  | 64px | Auth card max inner padding |

### 4.2 Density Levels

The dashboard has two density modes. Both are valid; the switch is per-surface,
not per-user-preference in M6.

**Compact** — used in issue tables, project/key lists, rollup timelines.

| Property | Value |
|----------|-------|
| Row height | 36px (2.25rem) |
| Cell padding-y | `--space-2` (8px) |
| Cell padding-x | `--space-3` (12px) |
| Badge padding | 2px 6px |
| Font size | `--text-sm` |

**Default** — used in forms, dialogs, settings panels, onboarding flows.

| Property | Value |
|----------|-------|
| Row height | 48px (3rem) |
| Cell padding-y | `--space-3` (12px) |
| Cell padding-x | `--space-4` (16px) |
| Badge padding | 4px 8px |
| Font size | `--text-sm` to `--text-base` |

### 4.3 Shell Layout

```
┌──────────────────────────────────────────────────────────────┐
│  Sidebar 240px       │  Content area                         │
│  (collapsed: 64px)   │                                       │
│                      │  Top bar: 48px                        │
│  Logo                │  ─────────────────────────────────   │
│  ─────               │  Page title + actions                 │
│  Nav items           │                                       │
│  ─────               │  Content: full remaining height       │
│  Project selector    │  padding: 24px (desktop)              │
│  Env selector        │          16px (tablet)                │
│  ─────               │          12px (phone)                 │
│  [bottom]            │                                       │
│  Account / logout    │                                       │
└──────────────────────────────────────────────────────────────┘
```

| Dimension | Token / Value |
|-----------|--------------|
| Sidebar width (expanded) | 240px |
| Sidebar width (collapsed) | 64px |
| Top bar height | 48px |
| Content horizontal padding (desktop ≥1024px) | 24px |
| Content horizontal padding (tablet 768-1023px) | 16px |
| Content horizontal padding (phone <768px) | 12px |
| Max content width | 1280px (centered on wide viewports) |
| Chart fixed height (desktop) | 240px |
| Chart fixed height (phone) | 180px |
| Metric card height | auto (min 80px) |

### 4.4 Responsive Breakpoints

```css
:root {
  --bp-sm:  480px;   /* large phones */
  --bp-md:  768px;   /* tablet portrait */
  --bp-lg:  1024px;  /* small laptop, tablet landscape */
  --bp-xl:  1280px;  /* desktop */
  --bp-2xl: 1536px;  /* wide desktop */
}
```

In Tailwind these are `sm:`, `md:`, `lg:`, `xl:`, `2xl:`. Use them in that
direction (mobile-first). Never write responsive overrides only for desktop
without confirming mobile behavior first.

### 4.5 Z-Index Scale

```css
:root {
  --z-below:    -1;
  --z-base:      0;
  --z-raised:   10;   /* table row hover, card hover */
  --z-sticky:   20;   /* sticky table headers, top bar */
  --z-overlay:  30;   /* modal backdrop */
  --z-modal:    40;   /* dialog, sheet content */
  --z-toast:    50;   /* toast notifications */
  --z-tooltip:  60;   /* tooltips must clear everything */
}
```

---

## 5. Border Radius

The dashboard uses a tight radius vocabulary. Avoid mixing radii ad hoc.

| Token | Value | Usage |
|-------|-------|-------|
| `--radius-none` | 0 | Table cells, full-bleed surfaces |
| `--radius-sm`   | 4px (0.25rem) | Badge, chip, code span |
| `--radius-md`   | 6px (0.375rem) | Button, input, select, card header |
| `--radius-lg`   | 8px (0.5rem) | Card, panel, dropdown menu |
| `--radius-xl`   | 12px (0.75rem) | Dialog, sheet, large modal |
| `--radius-full` | 9999px | Toggle, pill badge, avatar |

---

## 6. Shadow and Elevation

Elevation communicates which surfaces float above which. Watch uses a minimal
shadow vocabulary — the dashboard should feel flat and content-forward.

| Token | Value | Usage |
|-------|-------|-------|
| `--shadow-none` | none | Flush surfaces |
| `--shadow-xs`   | `0 1px 2px 0 rgb(0 0 0 / 0.05)` | Input, select on hover |
| `--shadow-sm`   | `0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)` | Card, panel |
| `--shadow-md`   | `0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)` | Dropdown menu |
| `--shadow-lg`   | `0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)` | Dialog, modal |

In dark mode, elevation is expressed through background lightness, not shadow.
Increase the surface background step (sunken → surface → elevated) rather than
adding shadow opacity.

---

## 7. Interaction States

Every interactive element must have a complete set of states. Incomplete state
coverage is a bug, not a design gap.

### 7.1 State Matrix

| State | Visual treatment |
|-------|-----------------|
| Default | Baseline: no highlight, correct contrast |
| Hover | Slightly lighter/darker background, subtle border change |
| Active (pressed) | Slightly darker than hover, no scale transform |
| Focus | `--color-border-focus` 2px solid ring, 2px offset (Tailwind: `ring-2 ring-offset-2`) |
| Selected | `--color-accent-muted` background, `--color-accent-text` foreground |
| Disabled | `--color-text-disabled` foreground, `--color-bg-sunken` background, `pointer-events: none`, `aria-disabled="true"` |
| Loading | Pulse shimmer on skeleton; spinner icon on buttons if action takes >400ms |
| Error | `--color-danger-*` border and helper text; icon (not color alone) |
| Success | `--color-success-*` helper text or toast; transient — clears after a few seconds |

### 7.2 Focus Ring Specification

All interactive elements must display a visible focus ring when keyboard-focused.
This is non-negotiable for WCAG 2.1 AA success criterion 2.4.7.

```css
:root {
  --focus-ring-color:  var(--color-border-focus);
  --focus-ring-width:  2px;
  --focus-ring-offset: 2px;
  --focus-ring-style:  solid;
}
```

Apply with Tailwind: `focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[--focus-ring-color]`

Use `focus-visible`, not `focus`, so the ring does not appear on mouse click
but does appear on keyboard navigation.

### 7.3 Disabled State Rules

- Always set both `disabled` attribute and `aria-disabled="true"` on truly
  disabled interactive elements.
- Never remove a disabled element from the tab order when its explanation is
  important for screen reader users. Use `aria-describedby` to explain why
  it is disabled.
- Disabled inputs: `--color-bg-sunken` background, `--color-text-disabled`
  text, `cursor: not-allowed`.

---

## 8. Component Specifications

These are Watch-specific rules layered on top of shadcn/ui defaults. Where a
shadcn component is used, these rules take precedence over the shadcn default
for this dashboard.

### 8.1 Button

**Sizes:**

| Size | Height | Padding-x | Font size | Icon size |
|------|--------|-----------|-----------|-----------|
| `xs` | 28px | 8px | `text-xs` | 12px |
| `sm` | 32px | 12px | `text-sm` | 14px |
| `md` (default) | 36px | 16px | `text-sm` | 16px |
| `lg` | 44px | 24px | `text-base` | 18px |

**Variants:**

| Variant | Background | Text | Border | Use case |
|---------|-----------|------|--------|---------|
| `primary` | `--color-accent-default` | `--color-text-inverse` | none | One primary CTA per section |
| `secondary` | `--color-bg-surface` | `--color-text-primary` | `--color-border-default` | Secondary actions alongside a primary |
| `ghost` | transparent | `--color-text-secondary` | none | Toolbar and table row icon buttons |
| `danger` | `--color-danger-default` | `--color-text-inverse` | none | Revoke key, destructive confirm |
| `danger-ghost` | transparent | `--color-danger-text` | none | Inline danger without fill |
| `link` | none | `--color-text-link` | none | Inline text-level links |

**Rules:**
- Primary buttons are used once per panel/form. Never two primaries side by side.
- Loading state: replace button label with a spinner and truncated text ("Saving…")
  of the same size; keep button width stable to prevent layout shift.
- Touch target on mobile: always ≥44px height. Use `lg` size for primary mobile
  CTAs. For compact icon buttons, add 8px padding to increase tap area while
  keeping visual size with negative margin trick if necessary.

### 8.2 Input and Textarea

```
┌────────────────────────────────────────────────┐
│  Label text                                    │
│  [Input value placeholder text         ] [icon]│
│  Helper text or error message                  │
└────────────────────────────────────────────────┘
```

| State | Border | Background |
|-------|--------|-----------|
| Default | `--color-border-default` | `--color-bg-surface` |
| Hover | `--color-border-strong` | `--color-bg-surface` |
| Focus | `--color-border-focus` + focus ring | `--color-bg-surface` |
| Error | `--color-danger-default` | `--color-danger-subtle` |
| Disabled | `--color-border-default` | `--color-bg-sunken` |

- Height: 36px (compact), 40px (default), 44px (large/touch-first).
- Padding: `--space-3` horizontal, `--space-2` vertical.
- Always pair with `<label>` — never placeholder-only. Placeholder color must
  be `--color-text-tertiary` with sufficient contrast against the background
  (WCAG AA requires 4.5:1 against adjacent text, but placeholder is not
  standalone — pair it with a label regardless).
- Error messages appear below the field, not in a tooltip. Color + icon (not
  color alone).

### 8.3 Select

Same height and border treatment as Input. Use Radix `Select` through shadcn.
The trigger must show the selected value's label, not its internal ID. On
mobile, allow the native `<select>` as a fallback for environments where the
custom Radix dropdown would be cramped.

### 8.4 Badge / Status Chip

```
╔══════════╗
║  Open    ║   — filled, colored background
╚══════════╝

╔══════════╗
║  Ignored ║   — muted background, softer text
╚══════════╝
```

| Variant | Background | Text | Border |
|---------|-----------|------|--------|
| `open` (danger)  | `--color-danger-muted` | `--color-danger-text` | none |
| `resolved` (success) | `--color-success-muted` | `--color-success-text` | none |
| `ignored` (neutral) | `--color-neutral-muted` | `--color-neutral-text` | none |
| `good` | `--color-success-muted` | `--color-success-text` | none |
| `needs-improvement` | `--color-warning-muted` | `--color-warning-text` | none |
| `poor` | `--color-danger-muted` | `--color-danger-text` | none |
| `default` | `--color-neutral-muted` | `--color-neutral-text` | none |
| `outline` | transparent | `--color-text-secondary` | `--color-border-default` |

Rules:
- Always include a text label alongside color. Never rely on color alone to
  communicate status.
- For screen readers, use `aria-label` or visible text that names the status.
- Radius: `--radius-sm` (4px) — badges should look like chips, not pills
  unless it is a count bubble.
- Count bubbles (unread, event count): `--radius-full`.

### 8.5 Table

The issue table is the most critical surface in M6. The following rules are
non-negotiable.

**Column structure (desktop):**

| Column | Width | Alignment | Overflow |
|--------|-------|-----------|---------|
| Status badge | 80px | center | — |
| Issue title | flex (min 200px) | left | truncate with tooltip |
| Route | 180px | left | truncate |
| Count | 72px | right | — |
| Last seen | 120px | right | relative time |
| Actions | 48px | center | icon button |

**Mobile column structure (≤768px):**

| Column | Width | Notes |
|--------|-------|-------|
| Status | 32px icon only | Dot or icon, labeled for screen readers |
| Title | flex | 2-line clamp, no route shown |
| Count + last seen | combined 80px | stacked, smaller text |
| Actions | 40px | icon button, ≥44px touch target |

**Row rules:**
- Row height: 36px (compact density). Rows with 2-line-clamped titles expand
  naturally; do not force fixed height and clip content.
- Hover: `--color-accent-subtle` background.
- Selected row: `--color-accent-muted` background.
- Striping: do not use row striping — it interferes with hover/selected states
  and creates false visual groupings.
- Sticky header: `position: sticky; top: 0; z-index: var(--z-sticky)` with
  `--color-bg-surface` background so the header is opaque while scrolling.
- Empty state: full-width row spanning all columns, not just a blank grid.

### 8.6 Card / Metric Card

```
┌─────────────────────────────────────────┐
│  Section label          [action button] │
│                                         │
│  3,412               ← metric number   │
│  Error events (24h)  ← metric label    │
│                                         │
│  [spark or trend line]                  │
└─────────────────────────────────────────┘
```

- Background: `--color-bg-surface`.
- Border: `1px solid --color-border-default`.
- Radius: `--radius-lg`.
- Shadow: `--shadow-sm`.
- Padding: `--space-5` (20px) desktop, `--space-4` (16px) mobile.
- On mobile: cards stack to 1-column. At 480px+: 2-column grid. At 768px+:
  allow 3-column or 4-column depending on content.

### 8.7 Alert / Inline Feedback Banner

Used for form-level errors, page-level warnings, and empty-state explanation
banners that are not modals.

```
╔══════════════════════════════════════════════════╗
║  [icon]  Title text                [dismiss ×]  ║
║          Supporting description text             ║
╚══════════════════════════════════════════════════╝
```

| Variant | Border-left | Background | Icon |
|---------|-------------|-----------|------|
| `error` | `--color-danger-default` | `--color-danger-subtle` | AlertCircle |
| `warning` | `--color-warning-default` | `--color-warning-subtle` | AlertTriangle |
| `success` | `--color-success-default` | `--color-success-subtle` | CheckCircle |
| `info` | `--color-accent-default` | `--color-accent-subtle` | Info |

Rules:
- Always include icon + text. Never rely on the colored border alone.
- Use `role="alert"` for error and warning variants so screen readers announce
  them on injection.
- For persistent page-level state (no session, no project), use `info` and keep
  the banner in the normal flow — do not use a toast.

### 8.8 Empty State

Every surface that can have zero data needs an empty state. An empty state is
not a blank area — it is a call to action.

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│                 [icon: 40px, --color-text-tertiary]        │
│                                                             │
│              No issues found in this time range            │
│         — type-body, --color-text-secondary, centered —    │
│                                                             │
│         Events will appear here once they are received.    │
│         Make sure your DSN is configured correctly.        │
│                                                             │
│                    [ View DSN setup ]                       │
│                     — ghost button —                        │
└─────────────────────────────────────────────────────────────┘
```

Rules:
- Icon: 40px, `--color-text-tertiary`. Use a Lucide icon appropriate to the
  context (no generic "nothing here" icon that could belong to any surface).
- Heading: `--type-subsection-*`, `--color-text-secondary`.
- Description: one to two sentences max. Answer "why is this empty?" and
  "what should I do?".
- CTA: always include a next-action button when action is possible. Use
  `ghost` or `secondary` variant. Do not use `primary` — the empty state
  should not dominate the visual hierarchy.
- Never show a full-page empty state for an in-page component. Reserve
  full-page empty states for truly page-scope situations (no projects exist
  yet, session expired, setup not complete).

### 8.9 Skeleton / Loading State

Loading states must hold the same space as the loaded content to prevent
cumulative layout shift.

```css
@keyframes shimmer {
  from { background-position: -200% 0; }
  to   { background-position:  200% 0; }
}

.skeleton {
  background: linear-gradient(
    90deg,
    var(--color-skeleton-base) 25%,
    var(--color-skeleton-shine) 50%,
    var(--color-skeleton-base) 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.4s ease-in-out infinite;
  border-radius: var(--radius-sm);
}

@media (prefers-reduced-motion: reduce) {
  .skeleton {
    animation: none;
    background: var(--color-skeleton-base);
  }
}
```

Rules:
- Charts: skeleton must fill the exact same `240px` height slot as the chart.
- Tables: show 5-6 skeleton rows matching the compact row height.
- Metric cards: skeleton the number and label area, not the entire card.
- Avoid generic spinners for content areas. Use positioned skeletons so
  the layout does not jump.
- Spinner icons (for buttons, inline loading) should be 16px, `animate-spin`.

### 8.10 Dialog and Sheet

- **Dialog**: centered modal, max-width 560px, `--radius-xl`, `--shadow-lg`.
  Used for confirmations (key revocation), short forms (create environment).
- **Sheet**: slides in from the right (desktop) or bottom (mobile),
  width 400px (desktop) or 100vw (mobile). Used for issue detail on mobile,
  filter panels, long forms that need scrollable context.
- Both must trap focus, support `Escape` to dismiss, and restore focus to the
  trigger on close.
- On mobile: dialogs ≤560px wide that are centered become bottom sheets
  instead — avoid a dialog positioned in the top third of a small phone screen.

### 8.11 Tooltip

- Delay: 400ms show, 0ms hide.
- Max width: 240px with text wrapping.
- Radius: `--radius-md`.
- Background: `--color-bg-elevated` (near-black in light, slightly lighter
  in dark).
- Text: `--text-xs`, `--color-text-primary` (inverted surface).
- Arrow: 6px triangle.
- Never use a tooltip as the only means to access critical information.
  Tooltips augment visible labels; they do not replace them.
- Never put interactive elements (links, buttons) inside a tooltip.

### 8.12 Code and DSN Display

DSN strings are a critical onboarding surface. They must be readable,
copyable, and not break the layout.

```
┌──────────────────────────────────────────────────────────────┐
│  Your SDK DSN                                                │
│                                                              │
│ ┌────────────────────────────────────────────────────────┐  │
│ │ watch://abc123@watch.example.com/ingest/1               │  │
│ └────────────────────────────────────────────────────────┘  │
│                                     [Copy] [Regenerate key] │
└──────────────────────────────────────────────────────────────┘
```

- Font: `--font-mono`, `--text-sm`.
- Background: `--color-bg-sunken`.
- Border: `1px solid --color-border-default`.
- Radius: `--radius-md`.
- Text: `word-break: break-all` so long DSNs wrap on narrow viewports.
- Copy button: adjacent, with visible confirmation ("Copied!" toast or
  icon change for 1.5s). Icon: `Copy` from Lucide.
- On phone: full-width block, copy button full-width below.

### 8.13 Navigation

**Desktop sidebar:**

```
┌───────────────────────┐
│  ⌚ Watch             │  ← logo / wordmark
│                       │
│  ▸ Overview           │  ← active: semibold, accent-muted bg
│    Issues        (12) │  ← badge: unresolved count
│    Web Vitals         │
│    Settings           │
│                       │
│  ─ Separator ─────── │
│  Project: My App      │  ← project selector
│  Env: production      │  ← environment selector
│                       │
│  ─ (bottom) ──────── │
│  Account / Logout     │
└───────────────────────┘
```

- Nav item height: 36px.
- Active state: `--color-accent-muted` background, `--color-accent-text` text,
  `--font-semibold`. Left border 2px `--color-accent-default` (optional accent
  rail — not a required pattern but clarifies scan direction).
- Hover: `--color-neutral-subtle` background.
- Icon: 16px Lucide icon, always present, always labeled (not icon-only).
- Collapsed sidebar (tablet): 64px wide, icons only. Tooltip shows full label
  on hover.

**Mobile bottom navigation:**

- 4-5 items max, icon + short label (≤8 chars).
- Height: 56px minimum (safe-area-aware).
- Active: `--color-accent-default` icon and text.
- Project/env switcher collapses into the top header bar on mobile.

### 8.14 Toast / Notification

Managed by Sonner (shadcn's preferred toast provider). Rules:

- Position: bottom-right (desktop), bottom-center (phone).
- Types: `success`, `error`, `info`, `warning`, `loading`.
- Duration: 4s for success/info, 6s for error/warning, persistent for loading.
- Never use a toast for silent background operations. Use toasts only for
  user-initiated mutations with a clear outcome.
- Max 3 toasts visible simultaneously. Stack below each other, newest on top.
- Each toast must have a text label — never icon-only.

---

## 9. Chart Design Rules

Charts are read by tired developers at 2am. Make them right.

### 9.1 Error Rollup Chart

- Type: area chart with gradient fill (subtle, 10–15% opacity fill under the line).
- Series: `error_count` per `period_start` bucket.
- Color: `--color-chart-1` (blue) stroke, semi-transparent fill.
- Y-axis: integer counts, no decimal. Tick labels: `--text-xs`,
  `--color-chart-axis`. Zero-origin always.
- X-axis: time labels, human-readable. Format for range:
  - Last 24h: `HH:mm` (00:00, 06:00...)
  - Last 7d: day abbreviation + date (Mon 16)
  - Last 30d: `MMM d` (Jun 16)
- Grid lines: horizontal only, `1px`, `--color-chart-grid`, dashed.
- Tooltip: show `period_start` (formatted), `error_count`, no extra padding.
  Use chart tooltip token colors.
- Fixed height: 240px (desktop), 180px (phone). `width="100%"`.
- Loading: skeleton div, same height.
- Empty (zero buckets): centered text inside the chart frame — "No errors in
  this window" with `--color-text-tertiary`. Keep the axes visible so the
  user understands the time range was valid.

### 9.2 Web Vital Chart

- Type: line chart for p75 and optionally mean as a secondary series.
- Colors: `--color-chart-1` (p75), `--color-chart-3` (mean).
- Y-axis: metric-aware formatting:
  - LCP, FCP, TTFB: milliseconds (e.g. `1,200 ms`)
  - CLS: 3 decimal places (e.g. `0.123`)
  - INP: milliseconds
- Legend: always show series label text alongside the color indicator (no
  color-only legend).
- Health score dots: scatter dots on the p75 line, colored by status token
  (`good` = success, `needs-improvement` = warning, `poor` = danger).
- Metric summary row below chart: p75, mean, sample count, health score badge.
  Use `--type-metric-*` tokens.

### 9.3 Chart Wrapper Contract

Every chart component must accept and forward these props:

| Prop | Type | Required |
|------|------|---------|
| `data` | domain-specific bucket array | yes |
| `loading` | boolean | yes |
| `error` | `Error \| null` | yes |
| `onRetry` | `() => void` | yes (when error) |
| `height` | number | yes (fixed, not responsive) |
| `className` | string | no |

A chart must never decide its own height from data.

---

## 10. Motion and Animation

Watch is an operational tool. Motion is used for orientation, not delight.

### 10.1 Permitted Motion

| Use | Duration | Easing |
|-----|----------|--------|
| Toast enter/exit | 200ms | `ease-out` (enter), `ease-in` (exit) |
| Dropdown open/close | 150ms | `ease-out` |
| Sheet slide in/out | 250ms | `cubic-bezier(0.4, 0, 0.2, 1)` |
| Dialog scale in | 150ms | `ease-out` |
| Skeleton shimmer | 1.4s loop | `ease-in-out` |
| Nav active underline | 100ms | `ease-out` |
| Button loading spinner | 750ms loop | `linear` |

### 10.2 Prohibited Motion

- No page transition animations between routes.
- No entrance animations for table rows or chart data points.
- No parallax effects.
- No infinite ambient animations outside the loading skeleton.

### 10.3 Reduced Motion

All animations must respect `prefers-reduced-motion: reduce`. The skeleton
shimmer pauses (becomes a static background). Toast and dialog transitions
become instant. No motion at all when the preference is set.

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## 11. Accessibility Baseline

These are release gates. If a PR introduces an a11y regression in one of these
categories, it should be blocked.

### 11.1 Color Contrast

| Context | Minimum ratio | Target |
|---------|--------------|--------|
| Normal text (< 18pt / 14pt bold) | 4.5:1 | WCAG AA |
| Large text (≥ 18pt / ≥ 14pt bold) | 3:1 | WCAG AA |
| Non-text UI (borders, icons) | 3:1 | WCAG AA |
| Placeholder text | 4.5:1 | same as normal text |

Verify all semantic token pairings (text on background) against this table
before any token change. Use the `pairing` column in the contract below:

| Token pair | Ratio (light) | Ratio (dark) |
|-----------|--------------|-------------|
| `--color-text-primary` on `--color-bg-base` | ≥ 14:1 | ≥ 14:1 |
| `--color-text-secondary` on `--color-bg-base` | ≥ 7:1 | ≥ 7:1 |
| `--color-text-tertiary` on `--color-bg-base` | ≥ 3:1 | ≥ 3:1 |
| `--color-danger-text` on `--color-danger-subtle` | ≥ 4.5:1 | ≥ 4.5:1 |
| `--color-success-text` on `--color-success-subtle` | ≥ 4.5:1 | ≥ 4.5:1 |
| `--color-warning-text` on `--color-warning-subtle` | ≥ 4.5:1 | ≥ 4.5:1 |
| `--color-text-inverse` on `--color-accent-default` | ≥ 4.5:1 | ≥ 4.5:1 |

### 11.2 Keyboard Navigation

- Tab order must follow visual reading order: left-to-right, top-to-bottom.
- All interactive elements must be reachable by Tab/Shift-Tab.
- Modal, dialog, and sheet components must trap focus within themselves.
- After a modal closes, focus must return to the element that opened it.
- Table row actions must be operable with Enter/Space on the focused control.
- Dropdowns and selects must respond to Arrow keys, Enter/Space, and Escape.

### 11.3 Screen Reader Requirements

- Every form input has an associated `<label>` via `for`/`id` or `aria-label`.
- Every icon button has `aria-label` — never an icon-only button without label.
- Status badges communicate their meaning via visible text, not color alone.
- Live regions (`aria-live="polite"`) announce toast outcomes and status
  changes.
- Table column headers use `<th scope="col">`. Sortable columns include
  `aria-sort`.
- Dialog titles use `aria-labelledby` pointing to the visible heading.

### 11.4 ARIA Usage Rules

- Use native HTML elements first. `<button>`, `<a>`, `<input>`, `<select>`
  handle most roles automatically.
- Only add ARIA roles when native HTML is not sufficient.
- Never use `aria-hidden="true"` on interactive elements.
- Use `aria-busy="true"` on loading table containers so screen readers do not
  read stale content.

---

## 12. Tailwind Configuration Contract

The design tokens described above must be wired into `tailwind.config.ts` so
Tailwind classes can reference them. This section specifies the mapping.

```ts
// apps/dashboard/tailwind.config.ts
import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: ["class"],
  theme: {
    extend: {
      colors: {
        bg: {
          base:     "var(--color-bg-base)",
          surface:  "var(--color-bg-surface)",
          sunken:   "var(--color-bg-sunken)",
          elevated: "var(--color-bg-elevated)",
        },
        border: {
          default: "var(--color-border-default)",
          strong:  "var(--color-border-strong)",
          focus:   "var(--color-border-focus)",
        },
        text: {
          primary:   "var(--color-text-primary)",
          secondary: "var(--color-text-secondary)",
          tertiary:  "var(--color-text-tertiary)",
          disabled:  "var(--color-text-disabled)",
          inverse:   "var(--color-text-inverse)",
          link:      "var(--color-text-link)",
          code:      "var(--color-text-code)",
        },
        accent: {
          DEFAULT: "var(--color-accent-default)",
          hover:   "var(--color-accent-hover)",
          active:  "var(--color-accent-active)",
          subtle:  "var(--color-accent-subtle)",
          muted:   "var(--color-accent-muted)",
          text:    "var(--color-accent-text)",
        },
        success: {
          DEFAULT: "var(--color-success-default)",
          subtle:  "var(--color-success-subtle)",
          muted:   "var(--color-success-muted)",
          text:    "var(--color-success-text)",
        },
        warning: {
          DEFAULT: "var(--color-warning-default)",
          subtle:  "var(--color-warning-subtle)",
          muted:   "var(--color-warning-muted)",
          text:    "var(--color-warning-text)",
        },
        danger: {
          DEFAULT: "var(--color-danger-default)",
          subtle:  "var(--color-danger-subtle)",
          muted:   "var(--color-danger-muted)",
          text:    "var(--color-danger-text)",
        },
        neutral: {
          DEFAULT: "var(--color-neutral-default)",
          subtle:  "var(--color-neutral-subtle)",
          muted:   "var(--color-neutral-muted)",
          text:    "var(--color-neutral-text)",
        },
        chart: {
          1: "var(--color-chart-1)",
          2: "var(--color-chart-2)",
          3: "var(--color-chart-3)",
          4: "var(--color-chart-4)",
          5: "var(--color-chart-5)",
          6: "var(--color-chart-6)",
          grid:    "var(--color-chart-grid)",
          axis:    "var(--color-chart-axis)",
        },
        skeleton: {
          base:  "var(--color-skeleton-base)",
          shine: "var(--color-skeleton-shine)",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)"],
        mono: ["var(--font-mono)"],
      },
      borderRadius: {
        none: "var(--radius-none)",
        sm:   "var(--radius-sm)",
        md:   "var(--radius-md)",
        lg:   "var(--radius-lg)",
        xl:   "var(--radius-xl)",
        full: "var(--radius-full)",
      },
      boxShadow: {
        none: "var(--shadow-none)",
        xs:   "var(--shadow-xs)",
        sm:   "var(--shadow-sm)",
        md:   "var(--shadow-md)",
        lg:   "var(--shadow-lg)",
      },
      zIndex: {
        below:   "var(--z-below)",
        base:    "var(--z-base)",
        raised:  "var(--z-raised)",
        sticky:  "var(--z-sticky)",
        overlay: "var(--z-overlay)",
        modal:   "var(--z-modal)",
        toast:   "var(--z-toast)",
        tooltip: "var(--z-tooltip)",
      },
      screens: {
        sm:  "480px",
        md:  "768px",
        lg:  "1024px",
        xl:  "1280px",
        "2xl": "1536px",
      },
    },
  },
  plugins: [],
} satisfies Config;
```

This configuration ensures every color class is theme-aware from the start.
No `dark:` override is needed in components — toggling `.dark` on `<html>`
flips all variables at once.

---

## 13. CSS Variable File Structure

All token definitions live in a single file imported at the root of the
dashboard app:

```
apps/dashboard/src/styles/
  tokens.css    ← :root and .dark variable definitions (all of §2–§6)
  base.css      ← body defaults, box-sizing, font-family, skeleton keyframe
  index.css     ← @import "tokens.css"; @import "base.css"; @tailwind ...
```

`index.css` is imported once in the TanStack Start root layout. Component files
do not import CSS — they use Tailwind classes that reference the variables.

---

## 14. Component File Conventions

All Watch UI primitives live in `apps/dashboard/src/components/ui/`. The
conventions for this directory:

- One component per file: `button.tsx`, `badge.tsx`, `empty-state.tsx`, etc.
- Export the component and its `VariantProps` type if it uses `cva`.
- Use `class-variance-authority` (cva) for variant/size prop matrices.
  shadcn ships with this pattern; keep it.
- Do not put business logic inside `src/components/ui/`. These components
  receive data via props. They do not call API hooks.
- Avoid default exports. Named exports make refactoring and tree-shaking clearer.

Example structure for `badge.tsx`:

```ts
// src/components/ui/badge.tsx
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-badge font-medium",
  {
    variants: {
      variant: {
        open:               "bg-danger-muted text-danger-text",
        resolved:           "bg-success-muted text-success-text",
        ignored:            "bg-neutral-muted text-neutral-text",
        good:               "bg-success-muted text-success-text",
        "needs-improvement":"bg-warning-muted text-warning-text",
        poor:               "bg-danger-muted text-danger-text",
        default:            "bg-neutral-muted text-neutral-text",
        outline:            "border border-border-default text-text-secondary",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

export type BadgeVariant = VariantProps<typeof badgeVariants>["variant"];

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>,
  VariantProps<typeof badgeVariants> {}

export function Badge({ variant, className, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
```

---

## 15. Storybook Integration

Every token and component in this spec must have a Storybook story. The
stories are the living documentation of the design system.

### Required story matrix for each component:

| Story | Requirement |
|-------|------------|
| Default | The most common use, with typical content |
| All variants | One story per `variant` value |
| All sizes | One story per `size` value (where applicable) |
| Loading | Skeleton or spinner state |
| Empty | Empty data state with CTA |
| Error | Error state with retry |
| Disabled | Disabled state with explanation |
| Long content | 80-char label, 3-line text, large numbers |
| Mobile viewport | At 375px width, all states |
| Keyboard focus | Visible focus ring, no mouse |
| Dark mode | All variants in dark mode |

### Design token story:

A dedicated story page called `Design System / Tokens` should render a live
palette of all semantic colors (name, hex, usage), the full type scale, the
spacing grid, and the radius/shadow library. This page makes token review and
contrast checking visual.

### Accessibility story rule:

Every component story must pass the Storybook a11y addon check with zero
violations before it can be merged. Warnings are acceptable only with a
documented rationale in the story's `parameters.a11y` config.

---

## 16. Implementation Order for Task 6

Task 6 (`feat/m6-design-system-foundation`) should implement the above in
this sequence so reviewers can verify incrementally:

1. **`tokens.css`**: Define all CSS custom properties for §2 (color), §3
   (typography), §4 (spacing/layout), §5 (radius), §6 (shadow). No components
   yet — only variable definitions.

2. **`tailwind.config.ts`**: Wire every token into Tailwind as described in
   §12. Verify the Tailwind IntelliSense autocomplete shows token names.

3. **`base.css`**: Apply body defaults: `font-family: var(--font-sans)`,
   `background: var(--color-bg-base)`, `color: var(--color-text-primary)`,
   `box-sizing: border-box`. Add skeleton shimmer keyframe.

4. **Primitive components**: `button.tsx`, `input.tsx`, `label.tsx`,
   `badge.tsx`, `alert.tsx`, `skeleton.tsx` using the token names above.

5. **Composite components**: `empty-state.tsx`, `metric-card.tsx`,
   `code-copy.tsx`, `status-badge.tsx` (extends badge with Watch status
   semantics).

6. **Storybook stories**: One story file per component. Include the Design
   Token story page.

7. **Accessibility pass**: Run `@storybook/addon-a11y` against every story.
   Fix all violations before considering the task complete.

8. **Dark mode verification**: Toggle the Storybook dark mode background and
   confirm all stories render correctly.

---

## 17. What This Spec Does Not Cover

These topics are intentionally deferred and should not be designed in Task 6:

- **Feature-level component composition** (issue table with row actions, rollup
  chart with metric summary row) — these belong in their respective feature
  tasks (Tasks 11–13).
- **Form composition** (TanStack Form field wiring, validation messages) —
  covered in Task 8 (auth) and Task 10 (onboarding).
- **Navigation and app shell layout** — covered in Task 9.
- **Chart Recharts integration** — covered in Task 11.
- **Animation choreography beyond the token-level rules above** — defer unless
  a specific interaction proves the need.
- **Design system package extraction** — starts inside `apps/dashboard` per
  M6 scope. Extract if and when a second app needs it.
- **Dark mode toggle UI** — M6 ships in light mode with dark-mode token
  readiness. A toggle is a future task.
- **Custom typeface** — system fonts for M6. Revisit after the UI is proven.
