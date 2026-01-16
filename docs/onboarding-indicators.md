# Onboarding Indicators

This document describes the system for showing one-time onboarding indicators to
help users discover features. Once a user interacts with a feature, the
indicator is permanently dismissed and stored in their preferences database.

## Overview

The onboarding system provides:

1. **`useOnboardingIndicator` hook** - Manages state and persistence
2. **`OnboardingBadge` component** - A pulsing badge indicator
3. **`OnboardingCallout` component** - A floating message callout
4. **Generic API endpoint** - Persists seen state to database

## Quick Start

Adding an onboarding indicator to a feature is simple:

```tsx
import {
	OnboardingBadge,
	OnboardingCallout,
	useOnboardingIndicator,
} from '#app/components/onboarding-indicator.tsx'

function MyFeatureButton() {
	const { showIndicator, markAsSeen } = useOnboardingIndicator('my-feature')

	return (
		<div className="relative">
			<button
				onClick={() => {
					markAsSeen()
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

- Checking if the user has already seen this feature
- Providing immediate UI feedback when dismissed
- Persisting the state to the database

## API Reference

### `useOnboardingIndicator(featureId: string)`

A hook that manages onboarding indicator state.

**Parameters:**

- `featureId` - A unique string identifier for the feature (e.g.,
  `'files-tooltip'`, `'persist-playground'`)

**Returns:**

- `showIndicator: boolean` - Whether to show the indicator
- `markAsSeen: () => void` - Function to mark the feature as seen

**Example:**

```tsx
const { showIndicator, markAsSeen } = useOnboardingIndicator('my-feature')

// Call markAsSeen() when the user interacts with the feature
function handleClick() {
	markAsSeen()
	// ... handle click
}
```

### `<OnboardingBadge />`

A pulsing badge that draws attention to a feature. Position it absolutely within
a relatively-positioned parent.

**Props:**

- `children?: ReactNode` - Content inside the badge (default: `'!'`)
- `className?: string` - Additional CSS classes

**Example:**

```tsx
<button className="relative">
  Click me
  {showIndicator ? <OnboardingBadge /> : null}
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
| FILES button | `files-tooltip` | `touched-files.tsx` |

## Architecture

### Database Storage

Feature seen states are stored in the user preferences as a simple key-value
record:

```typescript
// In packages/workshop-utils/src/db.server.ts
preferences: {
  onboardingSeen: {
    'files-tooltip': true,
    'my-feature': true,
    // ... other features
  }
}
```

### Server Functions

The `db.server.ts` module exports helper functions:

```typescript
// Mark a feature as seen
await markOnboardingAsSeen('my-feature')

// Check if a feature has been seen
const seen = await hasSeenOnboarding('my-feature')
```

### API Endpoint

The `/mark-onboarding-seen` endpoint accepts POST requests with a `featureId`
form field:

```typescript
// This is handled automatically by the hook, but for reference:
fetcher.submit(
	{ featureId: 'my-feature' },
	{ method: 'POST', action: '/mark-onboarding-seen' },
)
```

## Design Guidelines

1. **Be non-intrusive** - Indicators should draw attention without blocking the
   user's workflow

2. **Dismiss on interaction** - Mark as seen when the user interacts with the
   feature, not just when they hover

3. **Use consistent styling** - Use the provided components to maintain visual
   consistency

4. **Choose unique feature IDs** - Use descriptive, kebab-case identifiers
   (e.g., `'persist-playground-tip'`, `'diff-tab-intro'`)

5. **Keep messages short** - Callout messages should be concise and actionable

## Testing

To test onboarding indicators during development:

1. Open the database file (accessible via Admin > Database)
2. Find the `onboardingSeen` object in preferences
3. Delete the key for your feature or set it to `false`
4. Refresh the page to see the indicator

Alternatively, delete your local database to reset all preferences.
