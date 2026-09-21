<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules --># Project Instructions

## UI/UX

For every frontend, UI, UX, page, component, dashboard, modal, form, or responsive design task:

1. Use the installed `ui-ux-pro-max` skill for design-system decisions, typography, spacing, colors, visual hierarchy, UX patterns, and responsive behavior.

2. Use the installed `frontend-design` skill to establish a clear visual direction and avoid generic AI-generated interfaces.

3. Use the installed `ui-ux` skill to review the result for:
   - usability
   - consistency
   - accessibility
   - responsive behavior
   - loading states
   - empty states
   - error states
   - forms and validation
   - navigation
   - interaction feedback

4. Use the installed frontend production skill when implementing React, Tailwind CSS, shadcn/ui, or related frontend components.

## Design Quality

Do not create generic AI-looking interfaces.

Avoid:
- unnecessary gradients
- excessive rounded cards
- random glassmorphism
- excessive shadows
- inconsistent spacing
- oversized hero text
- unnecessary decorative elements
- excessive animations

Prefer:
- strong visual hierarchy
- consistent spacing
- intentional typography
- clear navigation
- polished interaction states
- responsive layouts
- accessible controls
- reusable components
- coherent design systems

## Existing Project

Before changing the UI:
1. Inspect the existing project.
2. Understand its component structure and design system.
3. Preserve working functionality.
4. Reuse existing components when appropriate.
5. Do not rewrite working business logic just to change the design.

## Responsive Design

Every interface must work properly on:
- desktop
- laptop
- tablet
- mobile

Do not treat mobile responsiveness as an afterthought.

## Final Review

After implementing UI changes:
1. Review the result using the installed UI/UX skills.
2. Look for visual inconsistencies and UX problems.
3. Fix problems you find.
4. Check responsive behavior.
5. Check loading, empty, error, hover, focus, disabled, and validation states where applicable.
