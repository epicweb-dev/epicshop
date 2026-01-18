# Styling and theming

This repo’s UI styling is mostly **Tailwind CSS v4** (CSS-first config), backed
by **CSS variables** for theming (light/dark) and a small amount of hand-written
CSS.

## Where styling lives

- **Tailwind + theme tokens**: `packages/workshop-app/app/styles/tailwind.css`
- **Global CSS utilities / overrides**:
  `packages/workshop-app/app/styles/app.css`
  - Includes things like clip-path button shapes and code syntax highlighting
    variables.
- **Feature-specific CSS**:
  `packages/workshop-app/app/styles/touched-files.css`,
  `packages/workshop-app/app/routes/**/**.css`
- **Styles are loaded** from the root route via `<Links />` in
  `packages/workshop-app/app/root.tsx`.

## Tailwind setup (v4 “CSS-first”)

Tailwind is configured in `packages/workshop-app/app/styles/tailwind.css` rather
than a `tailwind.config.*` file:

- `@import 'tailwindcss';` enables Tailwind.
- `@source ...` declares which files Tailwind should scan for class names.
- `@plugin ...` enables Tailwind plugins (typography, radix, scrollbar, etc).
- `@custom-variant dark (&:is(.dark *));` defines the `dark:` variant based on
  the presence of a `.dark` class.

Build integration is via Vite’s Tailwind plugin in
`packages/workshop-app/vite.config.ts` (`@tailwindcss/vite`).

## Theme model (light/dark) and semantic colors

### The core theme tokens

Theme values live as CSS variables in
`packages/workshop-app/app/styles/tailwind.css`.

Light mode tokens are declared on:

- `:root` (default)
- plus some selectors used to support `invert-theme` (explained below)

Dark mode tokens are declared on:

- `.dark`
- plus some selectors used to support `invert-theme`

Most tokens are stored as **HSL channels** (no `hsl(...)` wrapper), for example:

- `--background: 0 0% 100%;`
- `--foreground: 0 0% 0%;`

And are consumed later with `hsl(var(--background))`.

### Mapping tokens to Tailwind utilities (the “semantic color” layer)

Tailwind utilities like `bg-background`, `text-foreground`, and `border-border`
come from `@theme inline` in `packages/workshop-app/app/styles/tailwind.css`,
which maps the raw tokens to Tailwind’s expected variables:

- `--color-background: hsl(var(--background));`
- `--color-foreground: hsl(var(--foreground));`
- `--color-muted-foreground: hsl(var(--muted-foreground));`
- etc.

This is why the repo strongly prefers **semantic color classes** (for dark
mode + consistent theming), e.g.:

- `bg-background text-foreground`
- `border-border`
- `text-muted-foreground`

Avoid hard-coded palette utilities (like `bg-white`, `text-red-600`) unless
there’s a specific reason.

### Adding a new semantic color

To add a new semantic color token end-to-end:

- Add the base token for **both** light and dark blocks in `tailwind.css`:
  - `--my-token: ...;`
- Map it in `@theme inline`:
  - `--color-my-token: hsl(var(--my-token));`
- Use it via Tailwind utilities:
  - `bg-my-token`, `text-my-token`, `border-my-token` (depending on how you
    mapped it)

If you need a non-HSL token (like the scrollbar color), you can map it without
`hsl(...)` (see `--color-scrollbar`).

## How theme switching works (system / light / dark)

There are two inputs:

1. **User preference** stored in the `EpicShop_theme` cookie (`light`/`dark`, or
   cleared for `system`).
   `packages/workshop-app/app/routes/theme/theme-session.server.ts`.
2. **System preference** via the “client hints” cookie
   (`EpicShop_CH-prefers-color-scheme`) managed by
   `packages/workshop-app/app/utils/client-hints.tsx`.

The switching UX is implemented in
`packages/workshop-app/app/routes/theme/index.tsx`:

- `ThemeSwitch` posts to `/theme` to rotate `system → light → dark → system`.
- The action sets/clears `EpicShop_theme`.

At runtime, the effective theme class is chosen by `useTheme()`:

- If the user explicitly set `light`/`dark`, use that.
- If the user chose `system`, fall back to the client hint (`hints.theme`).
- During the POST, the UI uses an optimistic value so the theme flips
  immediately.

Finally, the root route applies the theme as a class on the `<html>` element in
`packages/workshop-app/app/root.tsx`:

- `<html className={...theme}>` where `theme` is `light` or `dark`.

Because Tailwind’s `dark:` variant is configured to activate when `.dark` is
present, this class controls both:

- Which CSS variables are active (`:root` vs `.dark` blocks)
- Which Tailwind `dark:` styles apply

## `invert-theme` (nesting “the opposite theme”)

Some UI wants the **opposite theme** inside the current theme (for contrast or
legibility).

This repo implements an `invert-theme` helper class in
`packages/workshop-app/app/styles/tailwind.css`:

- When the page is `.dark`, elements with `.invert-theme` get the **light**
  variables.
- When the page is `.light`, elements with `.invert-theme` get the **dark**
  variables.
- The CSS includes special selectors so repeated nesting doesn’t flip endlessly
  (it flips back every 2 levels).

Example usage: the “Relevant Files” popover applies
`invert-theme bg-background text-foreground` in
`packages/workshop-app/app/routes/_app+/exercise+/$exerciseNumber_.$stepNumber.$type+/__shared/touched-files.tsx`.

## Custom CSS (when Tailwind isn’t enough)

The repo still uses hand-written CSS for a few cases:

- **Global utilities** like clip-path button shapes and scrollbox shadows in
  `packages/workshop-app/app/styles/app.css` (these still use the theme
  variables where possible).
- **Code syntax highlighting** variables in
  `packages/workshop-app/app/styles/app.css` (default “dark”, with `.light`
  overrides).
- **Complex selectors / nested styling** like
  `packages/workshop-app/app/styles/touched-files.css`.

When authoring CSS that should respect theming, prefer the semantic tokens
(`--background`, `--foreground`, etc) rather than hard-coded colors.
