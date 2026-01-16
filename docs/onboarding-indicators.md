# Onboarding Indicators

This document describes the system for showing one-time onboarding indicators to
help users discover features. Once a user interacts with a feature, the
indicator is permanently dismissed and stored in their preferences database.

## Overview

The onboarding system provides:

1. **`useOnboardingIndicator` hook** - Manages state and persistence
2. **`OnboardingBadge` component** - A pulsing badge indicator
3. **`OnboardingCallout` component** - A floating message callout
4. **Generic API endpoint** - Persists completion state to database

## Quick Start

Adding an onboarding indicator to a feature is simple:

```tsx
import {
	OnboardingBadge,
	OnboardingCallout,
	useOnboardingIndicator,
} from '#app/components/onboarding-indicator.tsx'

function MyFeatureButton() {
	const { showIndicator, markComplete } = useOnboardingIndicator('my-feature')

	return (
		<div className="relative">
			<button
				onClick={() => {
					markComplete()
					// ... do feature stuff
				}}
			>
				My Feature
				{showIndicator ? <OnboardingBadge /> : null}
			</button>
			{showIndicator ? (
				<OnboardingCallout>
					👋 Click here to discover this feature!
				</OnboardingCallout>
			) : null}
		</div>
	)
}
```

That's it! The hook handles:

- Checking if the user has already completed this onboarding
- Providing immediate UI feedback when dismissed
- Persisting the state to the database

## API Reference

### `useOnboardingIndicator(featureId: string)`

A hook that manages onboarding indicator state.

**Parameters:**

- `featureId` - A unique string identifier for the feature (e.g.,
  `'files-popover'`, `'persist-playground'`)

**Returns:**

- `showIndicator: boolean` - Whether to show the indicator
- `markComplete: () => void` - Function to mark the onboarding as complete

**Example:**

```tsx
const { showIndicator, markComplete } = useOnboardingIndicator('my-feature')

// Call markComplete() when the user interacts with the feature
function handleClick() {
	markComplete()
	// ... handle click
}
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
<button className="relative">
  Click me
  {showIndicator ? <OnboardingBadge tooltip="Click to discover!" /> : null}
</button>

// Without tooltip
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
  {showIndicator ? (
    <OnboardingCallout>👋 Try clicking this button!</OnboardingCallout>
  ) : null}
</div>

// Custom positioning
<OnboardingCallout className="left-auto right-0">
  Check this out!
</OnboardingCallout>
```

## Existing Indicators

| Feature      | Feature ID      | Location            |
| ------------ | --------------- | ------------------- |
| FILES button | `files-popover` | `touched-files.tsx` |

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
`featureId` form field:

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

Alternatively, delete your local database to reset all preferences.
