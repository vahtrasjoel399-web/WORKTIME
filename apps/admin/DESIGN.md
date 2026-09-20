# WorkTime admin design system

WorkTime is a workforce operations product for employers and workers. Its interface should make current work, exceptions, pay inputs, and the next action easy to scan without looking like a generic dashboard template.

## Product temperament

- Calm, practical, and trustworthy.
- Light-first with full dark-mode parity.
- Compact enough for daily operations, with deliberate breathing room around page sections.
- Visual references: Atlassian and Shopify Polaris for operational clarity, GitHub Primer for data surfaces, and Linear for restraint.

## Foundation

Global color and typography tokens live in `app/globals.css` and are exposed through `tailwind.config.ts`.

- `bg`: application canvas.
- `surface`: primary content surface.
- `elevated`: interactive or raised surface.
- `text` and `muted`: primary and secondary copy.
- `border` and `border-strong`: structural and interactive borders.
- `primary`: navigation and primary actions.
- `live`: healthy or currently active state.
- `signal`: calculated money and attention-worthy non-error information.
- `alert`: errors, destructive actions, and exceptions.

Use semantic tokens; do not add page-specific hex values. JetBrains Mono is reserved for time, quantities, codes, rates, and monetary values.

## Shared patterns

- Page title: `page-title`; page supporting copy: `page-description`.
- Content surface: `panel`; padded surface: `panel-pad`.
- Form control: `control`; visible label: `field-label`; helper copy: `field-hint`.
- Actions: `btn-primary`, `btn-secondary`, `btn-quiet`, and `btn-danger`.
- Data table: `data-table` inside a `panel` with horizontal overflow when comparison must remain tabular.
- Reusable React patterns live in `components/ui.tsx`: `PageHeader`, `MetricStrip`, `StatusBadge`, `EmptyState`, and `Field`.

## Layout and density

- Main shell max width: `max-w-7xl`.
- Standard section gap: 24px.
- Panel radius: 12px; control radius: 8px.
- Borders establish hierarchy. Shadows are reserved for dialogs, toasts, and overlays.
- A page can have one visually primary action per region. Utility and destructive actions remain quieter.

## Responsive rules

- Below 640px, desktop tables become task-oriented record cards when comparison is not essential.
- Essential comparison tables may scroll horizontally inside their own bounded surface.
- Toolbars stack; primary actions remain near the page title or current task.
- The admin shell uses bottom navigation on mobile and top navigation from 640px upward.
- Controls maintain a minimum 40px height; mobile navigation and primary worker actions are at least 44px.

## State and accessibility contract

- Async routes have stable loading UI; route failures provide an explanation and retry action.
- Empty states explain what the absence means and how to proceed.
- Errors use `role="alert"`; success notifications use `role="status"`.
- Inputs always have visible labels. Placeholder text is supplementary only.
- Icon-only buttons require an accessible name.
- Status is always expressed in text as well as color.
- Focus rings use the primary token and must remain visible.
- Motion must be short and is disabled under `prefers-reduced-motion`.

## Domain-specific rules

- Never imply all work is hourly. Show the pricing model, rate unit, quantity where relevant, worked time, and calculated amount separately.
- Monetary totals are estimates unless payroll rules explicitly make them final.
- Location copy must explain that the map contains shift start/end points, not continuous tracking.
- Destructive worker, document, assignment, and application actions require confirmation.
