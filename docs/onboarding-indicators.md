# Onboarding Indicators

This document describes the system for showing one-time onboarding indicators to
help users discover features. Once a user interacts with a feature, the
indicator is permanently dismissed and stored in their preferences database.

## Overview

The onboarding system consists of three parts:

1. **Database schema** - Tracks which features the user has seen
2. **API endpoint** - Marks a feature as seen
3. **UI component** - Shows the indicator and triggers the API when dismissed

## Adding a New Onboarding Indicator

### Step 1: Add the preference to the database schema

In `packages/workshop-utils/src/db.server.ts`, add a new field to the
`onboarding` object in the `DataSchema`:

```typescript
onboarding: z
  .object({
    hasSeenFilesTooltip: z.boolean().default(false),
    // Add your new field here:
    hasSeenYourFeature: z.boolean().default(false),
  })
  .optional()
  .default({ hasSeenFilesTooltip: false }),
```

### Step 2: Create an API endpoint to mark as seen

Create a new route file (e.g., `packages/workshop-app/app/routes/mark-your-feature-seen.tsx`):

```typescript
import { setPreferences } from '@epic-web/workshop-utils/db.server'
import { type ActionFunctionArgs } from 'react-router'

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 })
  }

  await setPreferences({
    onboarding: { hasSeenYourFeature: true },
  })

  return Response.json({ success: true })
}
```

### Step 3: Add the indicator to your component

In your component, use this pattern:

```typescript
import { useFetcher } from 'react-router'
import { useRootLoaderData } from '#app/utils/root-loader.ts'

function YourComponent() {
  const rootData = useRootLoaderData()
  const fetcher = useFetcher()

  // Local state for immediate UI feedback
  const [hasMarkedAsSeen, setHasMarkedAsSeen] = React.useState(false)

  // Check if user has seen this feature (from database)
  const hasSeenFeature =
    rootData.preferences?.onboarding?.hasSeenYourFeature ?? false

  // Show indicator only if not seen and not just marked
  const showIndicator = !hasSeenFeature && !hasMarkedAsSeen

  function handleInteraction() {
    if (showIndicator) {
      // Update local state for immediate UI feedback
      setHasMarkedAsSeen(true)

      // Persist to database
      void fetcher.submit(null, {
        method: 'POST',
        action: '/mark-your-feature-seen',
      })
    }
  }

  return (
    <div>
      <button onClick={handleInteraction}>
        Your Feature
        {showIndicator ? (
          <span className="bg-accent text-accent-foreground absolute -top-1 -right-1 flex h-5 w-5 animate-pulse items-center justify-center rounded-full text-xs font-bold shadow-md">
            !
          </span>
        ) : null}
      </button>

      {showIndicator ? (
        <div className="bg-accent text-accent-foreground absolute top-full left-0 z-20 mt-1 max-w-64 rounded-md px-3 py-2 text-sm shadow-lg">
          <p className="font-medium">👋 Click here to discover this feature!</p>
        </div>
      ) : null}
    </div>
  )
}
```

## Existing Onboarding Indicators

| Feature | Preference Key | API Endpoint | Component |
|---------|---------------|--------------|-----------|
| FILES button | `hasSeenFilesTooltip` | `/mark-files-seen` | `touched-files.tsx` |

## Design Guidelines

When creating onboarding indicators:

1. **Be non-intrusive** - The indicator should draw attention without blocking
   the user's workflow
2. **Dismiss on interaction** - The indicator should disappear as soon as the
   user interacts with the feature
3. **Persist permanently** - Once dismissed, the indicator should never show
   again (stored in database)
4. **Immediate feedback** - Use local state to hide the indicator immediately,
   don't wait for the API response
5. **Use semantic colors** - Use `bg-accent` and `text-accent-foreground` for
   consistent theming

## Visual Patterns

### Pulsing Badge

A small pulsing circle with an icon, positioned at the corner of the element:

```tsx
<span className="bg-accent text-accent-foreground absolute -top-1 -right-1 flex h-5 w-5 animate-pulse items-center justify-center rounded-full text-xs font-bold shadow-md">
  !
</span>
```

### Callout Message

A floating message box that appears near the element:

```tsx
<div className="bg-accent text-accent-foreground absolute top-full left-0 z-20 mt-1 max-w-64 rounded-md px-3 py-2 text-sm shadow-lg">
  <p className="font-medium">👋 Your helpful message here!</p>
</div>
```

## Testing

To test onboarding indicators during development:

1. Open the database file (accessible via Admin > Database)
2. Set the relevant `hasSeenX` field to `false`
3. Refresh the page to see the indicator

Alternatively, you can delete your local database to reset all preferences.
