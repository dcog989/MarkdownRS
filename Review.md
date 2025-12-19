# MarkdownRS - Code Review & Fixes

## Unused Struct `TransformOptions`
**Location:** `src-tauri/src/text_transforms.rs:5`

**Problem:**
```rust
pub struct TransformOptions {
    pub operation: String,
}
```

This struct is defined but never used. why?

## Text Metrics Calculation

**Current:** Rust backend via `calculate_text_metrics_command`

**Issue:** This is called **very frequently** (on every keystroke for cursor position). The IPC overhead might be significant.

**Recommendation:** Move basic metrics to frontend TypeScript

**File:** `src/lib/utils/textMetrics.ts` - Already exists! ✓

You already have this file. **Use it instead of the Rust command** for real-time metrics:

```typescript
// src/lib/utils/textMetrics.ts - Already implemented correctly
export function calculateTextMetrics(content: string) {
    const lines = content.split('\n');
    const words = content.trim() === '' ? 0 : content.trim().split(/\s+/).length;
    
    return {
        lineCount: lines.length,
        wordCount: words,
        charCount: content.length
    };
}
```

**Update:** `src/lib/components/editor/EditorView.svelte`

## Simple Text Operations

Some text operations could be done in frontend:

**Move to Frontend:**
- `trim-whitespace` - Simple string operation
- `remove-all-spaces` - Simple filter
- `uppercase/lowercase` - Built-in string methods

**Keep in Backend:**
- Complex sorting with numeric extraction
- Markdown formatting
- Multi-line transformations with complex logic

## Svelte 5 Runes - Use `$state.frozen` for Immutable Data

**File:** `src/lib/stores/editorStore.svelte.ts`

Since tabs are updated immutably, use `$state.frozen`:

```typescript
// Current
tabs = $state<EditorTab[]>([]);

// Better (Svelte 5.2+)
tabs = $state.frozen<EditorTab[]>([]);
```

This tells Svelte the array is immutable, enabling optimizations.

#### Use `untrack()` More Consistently

You're already using it correctly in some places:

```typescript
untrack(() => {
    const currentDoc = view.state.doc.toString();
    // ...
});
```

Continue using `untrack()` when you need to read reactive values without creating dependencies.

----

## 5. Tailwind v4.1 Updates

Your Tailwind usage is mostly correct, but Tailwind v4 has some changes:

### ⚠️ CSS Variable Pattern (v4 Preferred)

**Old Pattern (v3):**
```css
background-color: var(--bg-main);
```

**New Pattern (v4):**
```css
@theme {
  --color-bg-main: #1e1e1e;
}

/* Use as utility class */
bg-bg-main
```

**Recommendation:** Migrate your CSS variables to Tailwind's `@theme` directive in `app.css`.

**File:** `src/app.css`

```css
@import "tailwindcss";

@theme {
  /* Colors */
  --color-bg-main: #1e1e1e;
  --color-bg-panel: #252525;
  --color-fg-default: #d4d4d4;
  --color-fg-muted: #858585;
  --color-accent-primary: #007acc;
  --color-danger-text: #f48771;
  --color-border-main: #3c3c3c;
  
  /* Spacing (if needed) */
  --spacing-tab-width-min: 140px;
  --spacing-tab-width-max: 220px;
}
```

Then use as utilities:

```html
<!-- OLD -->
<div style="background-color: var(--bg-main);">

<!-- NEW -->
<div class="bg-bg-main">
```
