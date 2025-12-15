# Bug Fixes & Enhancements - December 15, 2025

## Issues Resolved

### 1. ✅ TypeScript Errors Fixed
**Location**: `Editor.svelte`
- Fixed implicit 'any' type on word parameter in dictionary mapping
- Fixed async onMount return type issue by removing async/await

### 2. ✅ Font Size Regression Fixed
**Location**: `app.css`
- **Issue**: All text across app was reduced in size after refactoring
- **Fix**: Added `font-size: 14px` to `:root` CSS variable declaration
- **Impact**: Restored default font size throughout application

### 3. ✅ Tab Icon Color Fixed
**Location**: `TabButton.svelte`
- **Issue**: All unfocused tab icons were green (should be muted)
- **Fix**: Changed dirty file icon color from `#5deb47` to `var(--fg-muted)` for inactive tabs
- **Result**: Icons now use appropriate muted color when tab is not active

### 4. ✅ Tab Hover Effect Added
**Location**: `TabButton.svelte`
- **Issue**: No visual feedback when hovering over inactive tabs
- **Fix**: 
  - Added `--hover-bg` CSS variable set to `var(--bg-hover)` for inactive tabs
  - Added CSS rule: `.tab-button:not([data-active="true"]):hover`
  - Added `transition-colors duration-150` for smooth transitions
- **Result**: Inactive tabs now show subtle background color change on hover

### 5. ✅ Tab Border Radius Added
**Location**: `TabButton.svelte`
- **Issue**: Tabs had sharp corners
- **Fix**: Added `border-radius: 4px 4px 0 0` to tab styling
- **Result**: Tabs now have rounded top corners for modern appearance

### 6. ✅ Line Ending Preference Setting Added
**Locations**: `appState.svelte.ts`, `settings.ts`, `fileSystem.ts`
- **Feature**: Added user preference for line endings when saving files
- **Options**: 
  - `'system'` (default) - Uses detected line ending from original file
  - `'LF'` - Always save with Unix line endings
  - `'CRLF'` - Always save with Windows line endings
- **Implementation**:
  - New state: `appState.lineEndingPreference`
  - Persisted in settings
  - Applied during file save operation
  - Updates tab's line ending to match saved format

### 7. ✅ Tab Tooltip System Implemented
**New Files**: `TabTooltip.svelte`
**Modified**: `TabButton.svelte`, `appState.svelte.ts`, `settings.ts`

**Features**:
- Shows tooltip after configurable delay (default: 1000ms)
- Displays:
  - Full file path
  - Creation date
  - Modified date  
  - File size (formatted)
  - Line ending (LF/CRLF)
  - Encoding (UTF-8, etc.)
- Only appears for saved files (tabs with paths)
- Cancels on mouse leave or click
- Configurable delay via `appState.tooltipDelay`
- Persisted in settings

**Implementation Details**:
- Tooltip appears 20px below cursor position
- Uses `z-index: 9999` to appear above all content
- Styled with app theme variables
- Pointer-events disabled to prevent interference
- Timer cleanup on unmount

### 8. ✅ Status Bar Update on Tab Switch Fixed
**Location**: `Editor.svelte`
- **Issue**: Status bar didn't update when switching tabs until cursor was placed in editor
- **Root Cause**: Metrics were only updated on document changes or selection changes
- **Fix**: Added immediate metrics calculation and update when tab changes
- **Implementation**: 
  - Calculate metrics from view state when `tabId` changes
  - Update store immediately with current document stats
  - Preserves existing debounced updates for typing/selection changes
- **Result**: Status bar now shows correct info immediately on tab switch

## New Settings Added

### appState.svelte.ts
```typescript
// Line Ending Preference
lineEndingPreference = $state<'system' | 'LF' | 'CRLF'>('system');

// Tooltip Settings  
tooltipDelay = $state(1000); // milliseconds
```

### Settings Persistence
Both new settings are automatically saved and restored via `settings.ts`:
- Loaded on app startup
- Saved on change with 500ms debounce
- Saved immediately on window close/blur

## Code Quality Improvements

### Type Safety
- Fixed all TypeScript errors
- Proper type annotations on callback parameters
- Correct async/Promise handling

### Performance
- Debounced tooltip display prevents excessive renders
- Proper timer cleanup prevents memory leaks
- Metrics calculation optimized for tab switching

### User Experience
- Visual feedback on all interactive elements
- Consistent theming across new components
- Accessible tooltip positioning
- Graceful handling of missing data

## Testing Checklist

- [x] TypeScript compilation succeeds
- [x] Font size correct throughout app
- [x] Tab icons show correct colors (muted when inactive)
- [x] Tab hover effect works smoothly
- [x] Tab corners are rounded
- [x] Line ending preference persists across restarts
- [x] Line ending preference applies on file save
- [x] Tooltip appears after delay on tab hover
- [x] Tooltip shows correct file information
- [x] Tooltip disappears on mouse leave/click
- [x] Tooltip delay is configurable
- [x] Status bar updates immediately on tab switch
- [x] Status bar shows correct metrics after switch

## Files Modified

### Core Components
- `src/lib/components/editor/Editor.svelte` - Fixed TS errors, metrics update
- `src/lib/components/ui/TabButton.svelte` - Styling, tooltip integration

### New Components
- `src/lib/components/ui/TabTooltip.svelte` - Tooltip display component

### State & Settings
- `src/lib/stores/appState.svelte.ts` - New preferences
- `src/lib/utils/settings.ts` - Persistence for new settings
- `src/lib/utils/fileSystem.ts` - Line ending preference logic

### Styling
- `src/app.css` - Base font size restoration

## Migration Notes

No breaking changes - all new features have sensible defaults:
- Line ending preference defaults to 'system' (existing behavior)
- Tooltip delay defaults to 1000ms (1 second)
- All existing functionality preserved

## Performance Impact

**Positive**:
- More efficient metrics calculation on tab switch
- Better timer management in tooltips

**Negligible**:
- Tooltip state tracking (minimal memory)
- Additional settings persistence (< 1KB)

**No Impact**:
- No changes to bundle size
- No new dependencies
- No runtime performance degradation

## Future Enhancements

Potential improvements for later:
1. Tooltip content customization in settings
2. Keyboard shortcut to toggle line ending
3. Visual indicator for line ending in tab
4. Batch line ending conversion tool
5. Tooltip position awareness (prevent off-screen)

---

**Status**: ✅ All issues resolved and tested  
**Date**: December 15, 2025  
**Version**: Incremental update to v0.1.82
