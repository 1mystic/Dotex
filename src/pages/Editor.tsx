import { useCallback, useEffect, useRef, useState } from "react";
import DocumentHeader from "@/components/editor/DocumentHeader";
import EditorToolbar from "@/components/editor/EditorToolbar";
import MarkdownPreview from "@/components/editor/MarkdownPreview";
import StatusBar from "@/components/editor/StatusBar";
import FileSidebar from "@/components/sidebar/FileSidebar";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { Button } from "@/components/ui/button";
import { PanelLeftOpen, PanelLeftClose, FileText } from "lucide-react";
import { useFileSystem } from "@/lib/fileSystem/FileSystemContext";
import { useDebouncedCallback } from "@/hooks/useDebouncedCallback";

type ViewMode = "editor" | "split" | "preview";

// ── Preference persistence ────────────────────────────────────────────────────

function loadPref<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v !== null ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function savePref(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* quota */ }
}

// ── Editor ────────────────────────────────────────────────────────────────────

export default function Editor() {
  const { nodes, activeFileId, isReady, openFile, getContent, saveContent } = useFileSystem();

  // Preferences persisted in localStorage
  const [viewMode, setViewMode] = useState<ViewMode>(() => loadPref("tf-viewMode", "split"));
  const [darkMode, setDarkMode] = useState(() => loadPref("tf-darkMode", true));
  const [syncScrollEnabled, setSyncScrollEnabled] = useState(() =>
    loadPref("tf-syncScroll", true),
  );
  const [sidebarOpen, setSidebarOpen] = useState(() => loadPref("tf-sidebar", true));

  // Per-file editor state
  const [source, setSource] = useState("");
  const [title, setTitle] = useState("Untitled");
  const [cursor, setCursor] = useState({ line: 1, col: 1 });
  const [pendingNewParentId, setPendingNewParentId] = useState<string | null>(null);

  // Refs
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const previewScrollRef = useRef<HTMLDivElement>(null);
  const ignoreScrollRef = useRef(false);
  const historyRef = useRef<string[]>([""]);
  const historyIndexRef = useRef(0);
  const isHistoryOpRef = useRef(false);
  const pushTimerRef = useRef<number | null>(null);
  const loadedFileIdRef = useRef<string | null>(null);

  // ── Dark mode effect ────────────────────────────────────────────────────────

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
  }, [darkMode]);

  // ── Persist preferences ─────────────────────────────────────────────────────

  useEffect(() => { savePref("tf-viewMode", viewMode); }, [viewMode]);
  useEffect(() => { savePref("tf-darkMode", darkMode); }, [darkMode]);
  useEffect(() => { savePref("tf-syncScroll", syncScrollEnabled); }, [syncScrollEnabled]);
  useEffect(() => { savePref("tf-sidebar", sidebarOpen); }, [sidebarOpen]);

  // ── Load active file ────────────────────────────────────────────────────────

  useEffect(() => {
    if (!isReady || !activeFileId) return;
    if (loadedFileIdRef.current === activeFileId) return;

    loadedFileIdRef.current = activeFileId;
    getContent(activeFileId).then((content) => {
      const node = nodes.find((n) => n.id === activeFileId);
      const name = node?.name.replace(/\.md$/, "") ?? "Untitled";
      setTitle(name);
      setSource(content);
      historyRef.current = [content];
      historyIndexRef.current = 0;
    });
  }, [activeFileId, isReady, getContent, nodes]);

  // ── Auto-save (debounced 800 ms) ────────────────────────────────────────────

  const debouncedSave = useDebouncedCallback(
    (id: string, content: string) => {
      saveContent(id, content);
    },
    800,
  );

  // ── History ─────────────────────────────────────────────────────────────────

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
    if (activeFileId) debouncedSave(activeFileId, val);
  };

  const undo = () => {
    if (historyIndexRef.current > 0) {
      historyIndexRef.current--;
      isHistoryOpRef.current = true;
      const val = historyRef.current[historyIndexRef.current];
      setSource(val);
      if (activeFileId) debouncedSave(activeFileId, val);
      requestAnimationFrame(() => { isHistoryOpRef.current = false; });
    }
  };

  const redo = () => {
    if (historyIndexRef.current < historyRef.current.length - 1) {
      historyIndexRef.current++;
      isHistoryOpRef.current = true;
      const val = historyRef.current[historyIndexRef.current];
      setSource(val);
      if (activeFileId) debouncedSave(activeFileId, val);
      requestAnimationFrame(() => { isHistoryOpRef.current = false; });
    }
  };

  // ── Cursor tracking ─────────────────────────────────────────────────────────

  const updateCursor = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    const before = ta.value.slice(0, ta.selectionStart);
    const lines = before.split("\n");
    setCursor({ line: lines.length, col: lines[lines.length - 1].length + 1 });
  };

  // ── Scroll sync ─────────────────────────────────────────────────────────────

  const syncScroll = (
    src: HTMLTextAreaElement | HTMLDivElement,
    tgt: HTMLDivElement | HTMLTextAreaElement,
  ) => {
    if (!syncScrollEnabled || ignoreScrollRef.current) return;
    const srcMax = src.scrollHeight - src.clientHeight;
    const tgtMax = tgt.scrollHeight - tgt.clientHeight;
    if (srcMax <= 0 || tgtMax <= 0) return;
    ignoreScrollRef.current = true;
    tgt.scrollTop = (src.scrollTop / srcMax) * tgtMax;
    requestAnimationFrame(() => { ignoreScrollRef.current = false; });
  };

  const handleEditorScroll = () => {
    const e = textareaRef.current, p = previewScrollRef.current;
    if (e && p) syncScroll(e, p);
  };

  const handlePreviewScroll = () => {
    const e = textareaRef.current, p = previewScrollRef.current;
    if (e && p) syncScroll(p, e);
  };

  // ── Formatting helpers ──────────────────────────────────────────────────────

  const wrapSelection = (before: string, after = "") => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const sel = ta.value.slice(start, end);
    const newVal = ta.value.slice(0, start) + before + sel + after + ta.value.slice(end);
    handleSourceChange(newVal);
    requestAnimationFrame(() => {
      ta.focus();
      ta.selectionStart = ta.selectionEnd = sel
        ? start + before.length + sel.length + after.length
        : start + before.length;
      updateCursor();
    });
  };

  const handleInsert = useCallback((before: string, after = "") => {
    wrapSelection(before, after);
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === "z" && !e.shiftKey) { e.preventDefault(); undo(); return; }
    if (mod && ((e.key.toLowerCase() === "z" && e.shiftKey) || e.key.toLowerCase() === "y")) {
      e.preventDefault(); redo(); return;
    }
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

  // ── Loading / empty states ──────────────────────────────────────────────────

  if (!isReady) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-muted-foreground text-sm animate-pulse">Loading…</div>
      </div>
    );
  }

  if (!activeFileId) {
    return (
      <div className="flex h-screen bg-background">
        {sidebarOpen && (
          <div className="w-56 shrink-0">
            <FileSidebar
              pendingNewParentId={pendingNewParentId}
              setPendingNewParentId={setPendingNewParentId}
              onToggleSidebar={() => setSidebarOpen((v) => !v)}
            />
          </div>
        )}
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-muted-foreground">
          <FileText className="h-12 w-12 opacity-30" />
          <p className="text-sm">Select a file from the sidebar or create a new one.</p>
          <Button variant="outline" size="sm" onClick={() => setSidebarOpen(true)}>
            <PanelLeftOpen className="h-4 w-4 mr-2" /> Open Sidebar
          </Button>
        </div>
      </div>
    );
  }

  // ── Main layout ─────────────────────────────────────────────────────────────

  const editorArea = (
    <div className="flex flex-col min-h-0 w-full h-full border-r border-border">
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
        onScroll={viewMode === "split" ? handleEditorScroll : undefined}
        spellCheck={false}
      />
    </div>
  );

  const previewArea = (
    <div className="flex flex-col min-h-0 h-full">
      <div className="shrink-0 px-4 py-1.5 text-[10px] font-mono uppercase tracking-wider text-muted-foreground bg-card border-b border-border">
        Preview
      </div>
      <div className="flex-1 min-h-0">
        <MarkdownPreview
          ref={previewScrollRef}
          source={source}
          onScroll={viewMode === "split" ? handlePreviewScroll : undefined}
        />
      </div>
    </div>
  );

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
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen((v) => !v)}
      />
      <EditorToolbar
        onInsert={handleInsert}
        onSnippet={handleSnippet}
        syncScrollEnabled={syncScrollEnabled}
        onToggleSyncScroll={() => setSyncScrollEnabled((v) => !v)}
      />

      <div className="flex-1 min-h-0 overflow-hidden flex">
        <ResizablePanelGroup direction="horizontal" className="flex-1">
          {/* Sidebar panel */}
          {sidebarOpen && (
            <>
              <ResizablePanel defaultSize={18} minSize={12} maxSize={35} className="min-w-[160px]">
                <FileSidebar
                  pendingNewParentId={pendingNewParentId}
                  setPendingNewParentId={setPendingNewParentId}
                />
              </ResizablePanel>
              <ResizableHandle className="bg-border hover:bg-primary/30 transition-colors" />
            </>
          )}

          {/* Editor / preview panel */}
          <ResizablePanel defaultSize={sidebarOpen ? 82 : 100}>
            {viewMode === "split" ? (
              <ResizablePanelGroup direction="horizontal" className="h-full">
                <ResizablePanel defaultSize={50} minSize={20}>
                  {editorArea}
                </ResizablePanel>
                <ResizableHandle withHandle className="bg-border hover:bg-primary/40 transition-colors" />
                <ResizablePanel defaultSize={50} minSize={20}>
                  {previewArea}
                </ResizablePanel>
              </ResizablePanelGroup>
            ) : viewMode === "editor" ? (
              editorArea
            ) : (
              previewArea
            )}
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

      <StatusBar source={source} cursorLine={cursor.line} cursorCol={cursor.col} />
    </div>
  );
}
