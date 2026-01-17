# Onboarding Indicators

This document describes the system for showing one-time onboarding indicators to
help users discover features. Once a user interacts with a feature, the
indicator is permanently dismissed and stored in their preferences database.

## Overview

The onboarding system provides:

1. **`useOnboardingIndicator` hook** - Manages state and persistence with
   optimistic updates
2. **`OnboardingForm` component** - Form-based submission with progressive
   enhancement
3. **`OnboardingBadge` component** - A pulsing badge indicator
4. **`OnboardingCallout` component** - A floating message callout
5. **Generic API endpoint** - Persists completion state to database

## Quick Start

Adding an onboarding indicator to a feature is simple:

```tsx
import {
	OnboardingBadge,
	OnboardingCallout,
	useOnboardingIndicator,
} from '#app/components/onboarding-indicator.tsx'

function MyFeatureButton() {
	// Returns a tuple so you can name them whatever makes sense
	const [showBadge, dismissBadge] = useOnboardingIndicator('my-feature')

	return (
		<button
			className="relative"
			onClick={() => {
				dismissBadge()
				// ... do feature stuff
			}}
		>
			My Feature
			{showBadge ? <OnboardingBadge tooltip="Try this!" /> : null}
		</button>
	)
}
```

That's it! The hook handles:

- Checking if the user has already completed this onboarding
- Providing immediate UI feedback when dismissed (optimistic updates)
- Persisting the state to the database
- Progressive enhancement (works without JavaScript via form submission)

## Progressive Enhancement

The onboarding system supports progressive enhancement, similar to theme
switching. This means:

1. **With JavaScript**: Uses `useFetcher` for optimistic updates - the indicator
   disappears immediately when `markComplete()` is called
2. **Without JavaScript**: Falls back to form submission with a redirect back to
   the current page

### Using `OnboardingForm` for Full PE Support

For features where you want a form-based approach with full progressive
enhancement:

```tsx
import {
	OnboardingBadge,
	OnboardingForm,
	useOnboardingIndicator,
} from '#app/components/onboarding-indicator.tsx'

function MyFeature() {
	const [showBadge] = useOnboardingIndicator('my-feature')

	return (
		<OnboardingForm featureId="my-feature" onSubmit={() => doSomething()}>
			<button type="submit" className="relative">
				Click me
				{showBadge ? <OnboardingBadge /> : null}
			</button>
		</OnboardingForm>
	)
}
```

## API Reference

### `useOnboardingIndicator(featureId: string)`

A hook that manages onboarding indicator state with optimistic updates.

**Parameters:**

- `featureId` - A unique string identifier for the feature (e.g.,
  `'files-popover'`, `'persist-playground'`)

**Returns:** A tuple `[showIndicator, markComplete]`:

- `showIndicator: boolean` - Whether to show the indicator (optimistic)
- `markComplete: () => void` - Function to mark the onboarding as complete

The tuple return allows you to name the values whatever makes sense for your
context:

**Example:**

```tsx
// Name them whatever makes sense for your context
const [showBadge, dismissBadge] = useOnboardingIndicator('my-feature')
const [isNew, markSeen] = useOnboardingIndicator('another-feature')

function handleClick() {
	dismissBadge()
	// ... handle click
}
```

### `<OnboardingForm />`

A form component that handles marking onboarding as complete with progressive
enhancement support.

**Props:**

- `featureId: string` - The feature ID to mark as complete
- `children: ReactNode` - Form contents (typically a button)
- `onSubmit?: () => void` - Optional callback when form submits
- `className?: string` - Additional CSS classes

**Example:**

```tsx
<OnboardingForm featureId="my-feature" onSubmit={() => console.log('clicked')}>
	<button type="submit">Try this feature</button>
</OnboardingForm>
```

### `<OnboardingBadge />`

A pulsing badge that draws attention to a feature. Position it absolutely within
a relatively-positioned parent. Optionally shows a tooltip on hover.

**Props:**

- `children?: ReactNode` - Content inside the badge (default: `'!'`)
- `tooltip?: string` - Tooltip message shown on hover
- `className?: string` - Additional CSS classes

**Example:**

```tsx
// Inside a button (most common pattern)
<button className="relative">
  Click me
  {showBadge ? <OnboardingBadge tooltip="Try this feature!" /> : null}
</button>

// Custom content
<OnboardingBadge>✨</OnboardingBadge>

// Custom positioning
<OnboardingBadge className="-bottom-1 -left-1 top-auto right-auto">
  New
</OnboardingBadge>
```

### `<OnboardingCallout />`

A floating message box that explains a feature. Position it near the element
it's describing.

**Props:**

- `children: ReactNode` - The message content
- `className?: string` - Additional CSS classes

**Example:**

```tsx
<div className="relative">
  <button>Click me</button>
  {showBadge ? (
    <OnboardingCallout>👋 Try clicking this button!</OnboardingCallout>
  ) : null}
</div>

// Custom positioning
<OnboardingCallout className="left-auto right-0">
  Check this out!
</OnboardingCallout>
```

## Existing Indicators

| Feature               | Feature ID            | Location                                    |
| --------------------- | --------------------- | ------------------------------------------- |
| FILES button          | `files-popover`       | `touched-files.tsx`                         |
| Account link          | `account-link`        | `_app+/_layout.tsx` (Navigation components) |
| Login button          | `login-button`        | `_app+/_layout.tsx` (NoUserBanner)          |
| Guide (account)       | `account-guide`       | `_app+/account.tsx`                         |
| Preferences (account) | `account-preferences` | `_app+/account.tsx`                         |
| Set playground dialog | `set-playground`      | `set-playground.tsx`                        |

## Deployed Environment

Onboarding indicators are automatically hidden in deployed environments
(`ENV.EPICSHOP_DEPLOYED`). The `useOnboardingIndicator` hook returns
`[false, () => {}]` when running in a deployed environment, so no additional
checks are needed in consuming components.

## Architecture

### Database Storage

Completed onboarding features are stored as an array of feature IDs in user
preferences:

```typescript
// In packages/workshop-utils/src/db.server.ts
preferences: {
	onboardingComplete: ['files-popover', 'persist-playground']
}
```

### Server Functions

The `db.server.ts` module exports helper functions:

```typescript
// Mark a feature's onboarding as complete
await markOnboardingComplete('my-feature')

// Check if onboarding is complete for a feature
const complete = await isOnboardingComplete('my-feature')
```

### API Endpoint

The `/mark-onboarding-complete` endpoint accepts POST requests with a
`featureId` form field. It includes:

- `ensureUndeployed()` check - Only works in local development
- Progressive enhancement support - Redirects back to the originating page when
  JavaScript is disabled

```typescript
// This is handled automatically by the hook, but for reference:
fetcher.submit(
	{ featureId: 'my-feature' },
	{ method: 'POST', action: '/mark-onboarding-complete' },
)
```

## Workshop Guide Page

The app includes a `/guide` page (`routes/_app+/guide.tsx`) that provides
comprehensive documentation for users about how to use the workshop app. This
page is a good destination for "Learn more" links in onboarding-related UI.

The guide includes:

- Tutorial callout encouraging users to run `npx epicshop add epicshop-tutorial`
- Workshop structure explanation (exercises/, playground/)
- Lesson page tabs overview (Playground, Problem, Solution, Diff, Tests)
- Files list documentation
- Troubleshooting for file links (EPICSHOP_EDITOR)
- Emoji key reference

When adding new onboarding indicators, consider linking to the guide page for
users who want more detailed information.

## Design Guidelines

1. **Be non-intrusive** - Indicators should draw attention without blocking the
   user's workflow

2. **Dismiss on interaction** - Mark as complete when the user interacts with
   the feature, not just when they hover

3. **Use consistent styling** - Use the provided components to maintain visual
   consistency

4. **Choose unique feature IDs** - Use descriptive, kebab-case identifiers
   (e.g., `'persist-playground'`, `'diff-tab'`)

5. **Keep messages short** - Callout messages should be concise and actionable

6. **Link to the guide** - For complex features, include a "Learn more" link to
   `/guide` for users who want detailed information

## Testing

To test onboarding indicators during development:

1. Open the database file (accessible via Admin > Database)
2. Find the `onboardingComplete` array in preferences
3. Remove your feature ID from the array
4. Refresh the page to see the indicator
