import { useCallback, useEffect, useRef, useState } from "react";
import DocumentHeader from "@/components/editor/DocumentHeader";
import EditorToolbar from "@/components/editor/EditorToolbar";
import MarkdownPreview from "@/components/editor/MarkdownPreview";
import StatusBar from "@/components/editor/StatusBar";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";

type ViewMode = "editor" | "split" | "preview";

const DEFAULT_CONTENT = `# Welcome to Matex ✦

A powerful **Markdown + LaTeX** editor with live preview and export.

---

## Markdown Features

Write *italic*, **bold**, ~~strikethrough~~, and \`inline code\`.

> Blockquotes look great for callouts and important notes.

### Lists

- Item one
- Item two
  - Nested item
  - Another nested

1. First step
2. Second step
3. Third step

### Code Blocks

\`\`\`javascript
const greet = (name) => {
  return \`Hello, \${name}!\`;
};
console.log(greet("Matex"));
\`\`\`

### Tables

| Feature   | Supported | Notes              |
|-----------|-----------|--------------------|
| Markdown  | ✓         | GFM flavor         |
| LaTeX     | ✓         | KaTeX rendering    |
| HTML      | ✓         | Sanitized          |

---

## LaTeX Math

Inline math like $E = mc^2$ flows naturally with text. The Pythagorean
theorem states that $a^2 + b^2 = c^2$.

Display equations:

$$\\int_{-\\infty}^{\\infty} e^{-x^2} dx = \\sqrt{\\pi}$$

### Aligned Equations

$$
\\begin{align}
(a + b)^2 &= a^2 + 2ab + b^2 \\\\
(a - b)^2 &= a^2 - 2ab + b^2
\\end{align}
$$

### Matrices

$$
\\begin{pmatrix}
1 & 2 & 3 \\\\
4 & 5 & 6 \\\\
7 & 8 & 9
\\end{pmatrix}
$$

### Cases

$$
f(x) = \\begin{cases}
x^2 & \\text{if } x \\geq 0 \\\\
-x  & \\text{if } x < 0
\\end{cases}
$$

### Maxwell's Equations

$$
\\begin{align}
\\nabla \\cdot \\mathbf{E} &= \\frac{\\rho}{\\varepsilon_0} \\\\
\\nabla \\cdot \\mathbf{B} &= 0 \\\\
\\nabla \\times \\mathbf{E} &= -\\frac{\\partial \\mathbf{B}}{\\partial t} \\\\
\\nabla \\times \\mathbf{B} &= \\mu_0 \\mathbf{J} + \\mu_0 \\varepsilon_0 \\frac{\\partial \\mathbf{E}}{\\partial t}
\\end{align}
$$

## HTML Blocks

<div style="padding:1rem;background:#f5f3ff;border-radius:8px;border:1px solid #ddd6fe;">
  <strong>Tip:</strong> You can embed sanitized HTML directly in your document.
</div>

Happy writing!
`;

export default function Editor() {
  const [source, setSource] = useState(DEFAULT_CONTENT);
  const [title, setTitle] = useState("Untitled Document");
  const [viewMode, setViewMode] = useState<ViewMode>("split");
  const [darkMode, setDarkMode] = useState(true);
  const [syncScrollEnabled, setSyncScrollEnabled] = useState(true);
  const [cursor, setCursor] = useState({ line: 1, col: 1 });
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const previewScrollRef = useRef<HTMLDivElement>(null);
  const ignoreScrollRef = useRef(false);

  const historyRef = useRef<string[]>([DEFAULT_CONTENT]);
  const historyIndexRef = useRef(0);
  const isHistoryOpRef = useRef(false);
  const pushTimerRef = useRef<number | null>(null);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
  }, [darkMode]);

  const pushHistory = (val: string) => {
    if (isHistoryOpRef.current) return;
    if (pushTimerRef.current) window.clearTimeout(pushTimerRef.current);
    pushTimerRef.current = window.setTimeout(() => {
      const stack = historyRef.current.slice(0, historyIndexRef.current + 1);
      stack.push(val);
      if (stack.length > 200) stack.shift();
      historyRef.current = stack;
      historyIndexRef.current = stack.length - 1;
    }, 250);
  };

  const handleSourceChange = (val: string) => {
    setSource(val);
    pushHistory(val);
  };

  const undo = () => {
    if (historyIndexRef.current > 0) {
      historyIndexRef.current--;
      isHistoryOpRef.current = true;
      setSource(historyRef.current[historyIndexRef.current]);
      requestAnimationFrame(() => { isHistoryOpRef.current = false; });
    }
  };
  const redo = () => {
    if (historyIndexRef.current < historyRef.current.length - 1) {
      historyIndexRef.current++;
      isHistoryOpRef.current = true;
      setSource(historyRef.current[historyIndexRef.current]);
      requestAnimationFrame(() => { isHistoryOpRef.current = false; });
    }
  };

  const updateCursor = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    const pos = ta.selectionStart;
    const before = ta.value.slice(0, pos);
    const lines = before.split("\n");
    setCursor({ line: lines.length, col: lines[lines.length - 1].length + 1 });
  };

  const syncScroll = (sourceEl: HTMLTextAreaElement | HTMLDivElement, targetEl: HTMLDivElement | HTMLTextAreaElement) => {
    if (!syncScrollEnabled || ignoreScrollRef.current) return;

    const sourceMax = sourceEl.scrollHeight - sourceEl.clientHeight;
    const targetMax = targetEl.scrollHeight - targetEl.clientHeight;
    if (sourceMax <= 0 || targetMax <= 0) return;

    const ratio = sourceEl.scrollTop / sourceMax;
    ignoreScrollRef.current = true;
    targetEl.scrollTop = ratio * targetMax;
    requestAnimationFrame(() => {
      ignoreScrollRef.current = false;
    });
  };

  const handleEditorScroll = () => {
    const editor = textareaRef.current;
    const preview = previewScrollRef.current;
    if (!editor || !preview) return;
    syncScroll(editor, preview);
  };

  const handlePreviewScroll = () => {
    const editor = textareaRef.current;
    const preview = previewScrollRef.current;
    if (!editor || !preview) return;
    syncScroll(preview, editor);
  };

  const wrapSelection = (before: string, after: string = "") => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = ta.value.slice(start, end);
    const newVal = ta.value.slice(0, start) + before + selected + after + ta.value.slice(end);
    handleSourceChange(newVal);
    requestAnimationFrame(() => {
      ta.focus();
      const cursorPos = selected ? start + before.length + selected.length + after.length : start + before.length;
      ta.selectionStart = ta.selectionEnd = cursorPos;
      updateCursor();
    });
  };

  const handleInsert = useCallback((before: string, after: string = "") => {
    wrapSelection(before, after);
  }, []);

  const handleSnippet = useCallback((snippet: string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const newVal = ta.value.slice(0, start) + snippet + ta.value.slice(ta.selectionEnd);
    handleSourceChange(newVal);
    requestAnimationFrame(() => {
      ta.focus();
      ta.selectionStart = ta.selectionEnd = start + snippet.length;
      updateCursor();
    });
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === "z" && !e.shiftKey) { e.preventDefault(); undo(); return; }
    if (mod && ((e.key.toLowerCase() === "z" && e.shiftKey) || e.key.toLowerCase() === "y")) { e.preventDefault(); redo(); return; }
    if (mod && e.key.toLowerCase() === "s") { e.preventDefault(); return; }
    if (mod && e.key.toLowerCase() === "b") { e.preventDefault(); wrapSelection("**", "**"); return; }
    if (mod && e.key.toLowerCase() === "i") { e.preventDefault(); wrapSelection("_", "_"); return; }
    if (mod && e.key === "`") { e.preventDefault(); wrapSelection("`", "`"); return; }
    if (e.key === "Tab") {
      e.preventDefault();
      const ta = e.currentTarget;
      const start = ta.selectionStart;
      const newVal = ta.value.slice(0, start) + "  " + ta.value.slice(ta.selectionEnd);
      handleSourceChange(newVal);
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = start + 2;
        updateCursor();
      });
    }
  };

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden">
      <DocumentHeader
        title={title}
        onTitleChange={setTitle}
        source={source}
        viewMode={viewMode}
        onViewMode={setViewMode}
        darkMode={darkMode}
        onToggleDark={() => setDarkMode((v) => !v)}
      />
      <EditorToolbar
        onInsert={handleInsert}
        onSnippet={handleSnippet}
        syncScrollEnabled={syncScrollEnabled}
        onToggleSyncScroll={() => setSyncScrollEnabled((v) => !v)}
      />

      <div className="flex-1 min-h-0 overflow-hidden flex">
        {viewMode === "split" ? (
          <ResizablePanelGroup direction="horizontal" className="flex-1">
            <ResizablePanel defaultSize={50} minSize={20}>
              <div className="flex flex-col min-h-0 h-full border-r border-border">
                <div className="shrink-0 px-4 py-1.5 text-[10px] font-mono uppercase tracking-wider text-muted-foreground bg-card border-b border-border">
                  Source
                </div>
                <textarea
                  ref={textareaRef}
                  className="editor-textarea flex-1"
                  value={source}
                  onChange={(e) => handleSourceChange(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onSelect={updateCursor}
                  onClick={updateCursor}
                  onKeyUp={updateCursor}
                  onScroll={handleEditorScroll}
                  spellCheck={false}
                />
              </div>
            </ResizablePanel>
            <ResizableHandle withHandle className="bg-border hover:bg-primary/40 transition-colors" />
            <ResizablePanel defaultSize={50} minSize={20}>
              <div className="flex flex-col min-h-0 h-full">
                <div className="shrink-0 px-4 py-1.5 text-[10px] font-mono uppercase tracking-wider text-muted-foreground bg-card border-b border-border">
                  Preview
                </div>
                <div className="flex-1 min-h-0">
                  <MarkdownPreview ref={previewScrollRef} source={source} onScroll={handlePreviewScroll} />
                </div>
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        ) : viewMode === "editor" ? (
          <div className="flex flex-col min-h-0 w-full">
            <div className="shrink-0 px-4 py-1.5 text-[10px] font-mono uppercase tracking-wider text-muted-foreground bg-card border-b border-border">
              Source
            </div>
            <textarea
              ref={textareaRef}
              className="editor-textarea flex-1"
              value={source}
              onChange={(e) => handleSourceChange(e.target.value)}
              onKeyDown={handleKeyDown}
              onSelect={updateCursor}
              onClick={updateCursor}
              onKeyUp={updateCursor}
              spellCheck={false}
            />
          </div>
        ) : (
          <div className="flex flex-col min-h-0 w-full">
            <div className="shrink-0 px-4 py-1.5 text-[10px] font-mono uppercase tracking-wider text-muted-foreground bg-card border-b border-border">
              Preview
            </div>
            <div className="flex-1 min-h-0">
              <MarkdownPreview ref={previewScrollRef} source={source} />
            </div>
          </div>
        )}
      </div>

      <StatusBar source={source} cursorLine={cursor.line} cursorCol={cursor.col} />
    </div>
  );
}
