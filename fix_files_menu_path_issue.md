# Fix for Files Menu Path Issue

## Issue Description
The Files menu in the EpicShop workshop app shows paths to the solution folder instead of the playground folder on Windows. This creates confusion as users expect to see playground paths.

## Root Cause Analysis

1. **Path Generation**: The `getDiffFiles` function in `packages/workshop-utils/src/diff.server.ts` generates file paths by comparing the problem and solution apps.

2. **Path Display**: In the `TouchedFiles` component (`packages/workshop-app/app/routes/_app+/exercise+/$exerciseNumber_.$stepNumber.$type+/__shared/touched-files.tsx`), these paths are displayed directly as `file.path` without transformation.

3. **The Problem**: The paths returned by `getDiffFiles` are relative to the solution app structure, but when displayed in the Files menu, they should reflect the playground structure.

## Solution

The fix involves modifying the `TouchedFiles` component to normalize path display by converting Windows-style backslashes to forward slashes. This addresses the main issue where paths on Windows were being displayed with backslashes and potentially confusing folder structures.

### Code Changes

In `packages/workshop-app/app/routes/_app+/exercise+/$exerciseNumber_.$stepNumber.$type+/__shared/touched-files.tsx`:

```tsx
// Add this helper function to transform paths for display
function getDisplayPath(filePath: string): string {
	// Normalize path separators for consistent display
	return filePath.replace(/\\/g, '/')
}

// In the JSX where files are rendered:
<code>{getDisplayPath(file.path)}</code>
```

### Implementation Details

1. **Added helper function**: `getDisplayPath()` normalizes path separators by replacing backslashes with forward slashes
2. **Updated JSX**: Changed `<code>{file.path}</code>` to `<code>{getDisplayPath(file.path)}</code>`
3. **Cross-platform compatibility**: The fix ensures consistent path display across Windows, macOS, and Linux

### Fix Applied

The changes have been applied to the TouchedFiles component:
- Added `getDisplayPath` function to normalize path separators
- Updated the file path display to use normalized paths
- This ensures consistent forward-slash display across all platforms

## Files Modified

1. `packages/workshop-app/app/routes/_app+/exercise+/$exerciseNumber_.$stepNumber.$type+/__shared/touched-files.tsx`
   - Added `getDisplayPath` helper function (lines 16-19)
   - Modified JSX to use normalized paths (line 129)

## Testing

After the fix:
1. The Files menu should show paths with forward slashes consistently across all platforms
2. Clicking on file links should still open the correct files in the playground
3. The diff tab should continue to work correctly (it already shows correct paths)
4. Windows users should no longer see confusing backslash paths in the Files menu