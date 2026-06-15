# Scroll Sync — Line-Anchored Approach (Deferred)

## Problem

The current proportional scroll sync maps scroll *percentage* between the editor and preview:

```ts
tgt.scrollTop = (src.scrollTop / srcMax) * tgtMax;
```

This breaks for large documents because markdown source is dense (compact text) while the rendered preview is expanded (headings render tall, code blocks add padding, etc.). A heading that is 1 line in source might be 60–80px tall in preview. This causes the two panes to drift apart as you scroll — visible as mismatched content between source and preview.

Reverted because the mismatched speeds during the transition looked jarring. The fix is non-trivial and needs proper testing.

---

## Planned Fix: Block-Anchored Interpolation

### Core idea

Instead of percentage-based sync, build a **line map**: a sorted list of `{ line: number, y: number }` entries that pairs each source block's start line with its rendered Y position in the preview. Then interpolate between entries to translate between editor scroll position and preview scroll position.

### Step 1 — Build the line map

Walk the source line-by-line to find block start lines (paragraphs, headings, code fences, lists, blockquotes, tables). Simultaneously query the matching rendered block elements in the preview DOM. Pair them up in order.

```ts
type LineMapEntry = { line: number; y: number };

function buildLineToYMap(source: string, previewContainer: HTMLElement): LineMapEntry[] {
  const contentEl = previewContainer.firstElementChild as HTMLElement | null;
  if (!contentEl) return [];
  const blockEls = contentEl.querySelectorAll(
    "p, h1, h2, h3, h4, h5, h6, pre, blockquote, ul, ol, table, hr",
  );
  if (!blockEls.length) return [];

  const lines = source.split("\n");
  const blockStartLines: number[] = [];
  let inCode = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trimStart().startsWith("```")) {
      if (!inCode) { blockStartLines.push(i); inCode = true; }
      else inCode = false;
    } else if (!inCode && line.trim()) {
      const prev = i > 0 ? lines[i - 1] : "";
      if (i === 0 || !prev.trim()) blockStartLines.push(i);
    }
  }

  const containerRect = previewContainer.getBoundingClientRect();
  const n = Math.min(blockStartLines.length, blockEls.length);
  const map: LineMapEntry[] = [];
  for (let i = 0; i < n; i++) {
    const r = (blockEls[i] as HTMLElement).getBoundingClientRect();
    map.push({ line: blockStartLines[i], y: r.top - containerRect.top + previewContainer.scrollTop });
  }
  return map;
}
```

> **Note on Y measurement**: use `getBoundingClientRect()` relative to the container, plus `container.scrollTop`, to get the absolute scroll offset of each block. Do NOT use `offsetTop` — its `offsetParent` may not be the scroll container.

### Step 2 — Editor → Preview sync

Compute the first visible source line from the textarea's scrollTop, then interpolate Y from the map.

```ts
function lineToPreviewY(line: number, map: LineMapEntry[], totalLines: number, maxScroll: number): number {
  if (!map.length) return (line / Math.max(1, totalLines)) * maxScroll;
  if (line <= map[0].line) return map[0].y;
  const last = map[map.length - 1];
  if (line >= last.line) {
    const t = (line - last.line) / Math.max(1, totalLines - last.line);
    return Math.min(maxScroll, last.y + t * (maxScroll - last.y));
  }
  for (let i = 0; i < map.length - 1; i++) {
    if (map[i].line <= line && line < map[i + 1].line) {
      const t = (line - map[i].line) / (map[i + 1].line - map[i].line);
      return map[i].y + t * (map[i + 1].y - map[i].y);
    }
  }
  return last.y;
}

// In the editor scroll handler:
const totalLines = source.split("\n").length;
const avgLineH = ta.scrollHeight / Math.max(1, totalLines);
const firstLine = ta.scrollTop / avgLineH;
const map = getLineMap();
const maxPreviewScroll = preview.scrollHeight - preview.clientHeight;
preview.scrollTop = lineToPreviewY(firstLine, map, totalLines, maxPreviewScroll);
```

### Step 3 — Preview → Editor sync

Reverse: given preview scrollTop, find which block it falls between in the map, interpolate to get a source line, then scroll the textarea there.

```ts
function previewYToLine(y: number, map: LineMapEntry[], totalLines: number, maxScroll: number): number {
  if (!map.length) return (y / Math.max(1, maxScroll)) * totalLines;
  if (y <= map[0].y) return map[0].line;
  const last = map[map.length - 1];
  if (y >= last.y) {
    const t = (y - last.y) / Math.max(1, maxScroll - last.y);
    return last.line + t * (totalLines - last.line);
  }
  for (let i = 0; i < map.length - 1; i++) {
    if (map[i].y <= y && y < map[i + 1].y) {
      const t = (y - map[i].y) / (map[i + 1].y - map[i].y);
      return map[i].line + t * (map[i + 1].line - map[i].line);
    }
  }
  return last.line;
}

// In the preview scroll handler:
const firstLine = previewYToLine(preview.scrollTop, map, totalLines, maxPreviewScroll);
const avgLineH = ta.scrollHeight / Math.max(1, totalLines);
ta.scrollTop = firstLine * avgLineH;
```

### Step 4 — Cache the map

`getBoundingClientRect()` forces layout. Avoid calling it on every scroll event by caching the map and invalidating only when the source or preview DOM changes.

```ts
const lineMapRef = useRef<LineMapEntry[]>([]);
const lineMapForSourceRef = useRef<string>("");
const lineMapForHeightRef = useRef<number>(0);

const getLineMap = (): LineMapEntry[] => {
  const preview = previewScrollRef.current;
  if (!preview) return [];
  if (
    lineMapForSourceRef.current === source &&
    lineMapForHeightRef.current === preview.scrollHeight
  ) {
    return lineMapRef.current;
  }
  const map = buildLineToYMap(source, preview);
  lineMapRef.current = map;
  lineMapForSourceRef.current = source;
  lineMapForHeightRef.current = preview.scrollHeight;
  return map;
};
```

- `source` comparison: JS string equality, fast (reference bail-out on same string).
- `preview.scrollHeight` as a proxy for "preview DOM changed" — changes after `useDeferredValue` re-renders the preview.

---

## Known edge cases to test

- **Inline math** (`$x$`) — doesn't create a new block, should be fine.
- **Display math** (`$$...$$`) — renders as a block. Check that it counts as one block in the source walk and maps to one DOM element.
- **Tight lists** (no blank lines between items) — the source walker only starts a new block at a blank line boundary, so consecutive list items within the same `<ul>` all map to the first list item's line. This is approximate but acceptable.
- **Nested blockquotes** — querySelectorAll picks up nested `<blockquote>` too. May over-count DOM blocks vs source blocks. Consider scoping the query to direct children of the content element.
- **Very short documents** — map may have 0–1 entries, fallback to percentage works.
- **Deferred render timing** — `MarkdownPreview` uses `useDeferredValue`, so after typing, the preview DOM lags the source. The cache invalidates on `preview.scrollHeight` change, so the map rebuilds after re-render. During the lag window, sync uses the stale map (slightly off but not wrong).

## Files to change when implementing

- `src/pages/Editor.tsx` — all changes go here (helpers before component, refs, scroll handlers).
- No changes needed to `MarkdownPreview.tsx` or `markdownCompiler.ts`.
