import { useCallback, useEffect, useRef, useState } from "react";
import { type ImperativePanelHandle } from "react-resizable-panels";
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
import {
  Sheet,
  SheetContent,
} from "@/components/ui/sheet";
import { PanelLeftOpen } from "lucide-react";
import { useFileSystem } from "@/lib/fileSystem/FileSystemContext";
import { useDebouncedCallback } from "@/hooks/useDebouncedCallback";

type ViewMode = "editor" | "split" | "preview";


// ── Mobile detection ──────────────────────────────────────────────────────────

function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < breakpoint);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < breakpoint);
    window.addEventListener("resize", handler, { passive: true });
    return () => window.removeEventListener("resize", handler);
  }, [breakpoint]);
  return isMobile;
}

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
  const { nodes, activeFileId, isReady, openFile, getContent, saveContent, renameNode } = useFileSystem();
  const isMobile = useIsMobile();

  // Preferences
  const [viewMode, setViewMode] = useState<ViewMode>(() => loadPref("tf-viewMode", "split"));
  const [darkMode, setDarkMode] = useState(() => loadPref("tf-darkMode", true));
  const [syncScrollEnabled, setSyncScrollEnabled] = useState(() => loadPref("tf-syncScroll", true));
  const [sidebarOpen, setSidebarOpen] = useState(() => !isMobile && loadPref("tf-sidebar", true));
  // Mobile-only sheet state
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);

  // Per-file state
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
  // Imperative handle for the sidebar panel — drives collapse/expand without
  // unmounting the panel (which would reverse the resize direction).
  const sidebarPanelRef = useRef<ImperativePanelHandle>(null);

  // ── Dark mode ───────────────────────────────────────────────────────────────

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
  }, [darkMode]);

  // ── Persist preferences ─────────────────────────────────────────────────────

  useEffect(() => { savePref("tf-viewMode", viewMode); }, [viewMode]);
  useEffect(() => { savePref("tf-darkMode", darkMode); }, [darkMode]);
  useEffect(() => { savePref("tf-syncScroll", syncScrollEnabled); }, [syncScrollEnabled]);
  useEffect(() => { if (!isMobile) savePref("tf-sidebar", sidebarOpen); }, [sidebarOpen, isMobile]);

  // ── Sidebar toggle (imperative API avoids panel re-mount) ───────────────────

  const toggleSidebar = useCallback(() => {
    const panel = sidebarPanelRef.current;
    if (!panel) return;
    if (panel.isCollapsed()) {
      panel.expand();
    } else {
      panel.collapse();
    }
  }, []);

  // ── Load active file ────────────────────────────────────────────────────────

  useEffect(() => {
    if (!isReady || !activeFileId) return;
    if (loadedFileIdRef.current === activeFileId) return;
    loadedFileIdRef.current = activeFileId;

    getContent(activeFileId).then((content) => {
      const node = nodes.find((n) => n.id === activeFileId);
      setTitle(node?.name.replace(/\.md$/, "") ?? "Untitled");
      setSource(content);
      historyRef.current = [content];
      historyIndexRef.current = 0;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFileId, isReady, getContent]);

  // ── Sync title when active file is renamed externally (e.g. from sidebar) ──

  useEffect(() => {
    if (!activeFileId) return;
    const node = nodes.find((n) => n.id === activeFileId);
    if (!node) return;
    setTitle(node.name.replace(/\.md$/, ""));
  }, [nodes, activeFileId]);

  // ── Title change (header edit → persist to file system) ────────────────────

  const handleTitleChange = useCallback((newTitle: string) => {
    setTitle(newTitle);
    if (activeFileId) renameNode(activeFileId, newTitle);
  }, [activeFileId, renameNode]);

  // ── Auto-save ───────────────────────────────────────────────────────────────

  const debouncedSave = useDebouncedCallback(
    (id: string, content: string) => saveContent(id, content),
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

  // ── Cursor ──────────────────────────────────────────────────────────────────

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

  // ── Formatting ──────────────────────────────────────────────────────────────

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
    if (mod && ((e.key.toLowerCase() === "z" && e.shiftKey) || e.key.toLowerCase() === "y")) { e.preventDefault(); redo(); return; }
    if (mod && e.key.toLowerCase() === "s") { e.preventDefault(); return; }
    if (mod && e.key.toLowerCase() === "b") { e.preventDefault(); wrapSelection("**", "**"); return; }
    if (mod && e.key.toLowerCase() === "i") { e.preventDefault(); wrapSelection("_", "_"); return; }
    if (mod && e.key === "`") { e.preventDefault(); wrapSelection("`", "`"); return; }
    if (e.key === "Tab") {
      e.preventDefault();
      const ta = e.currentTarget;
      const start = ta.selectionStart;
      handleSourceChange(ta.value.slice(0, start) + "  " + ta.value.slice(ta.selectionEnd));
      requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = start + 2; updateCursor(); });
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

  // ── Shared editor / preview areas ───────────────────────────────────────────

  const editorArea = (
    <div className="flex flex-col min-h-0 w-full h-full border-r border-border">
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
      <div className="flex-1 min-h-0">
        <MarkdownPreview
          ref={previewScrollRef}
          source={source}
          onScroll={viewMode === "split" ? handlePreviewScroll : undefined}
        />
      </div>
    </div>
  );

  // ── Split panel (direction aware) ───────────────────────────────────────────
  // On mobile the split is vertical so editor stacks above preview.

  const splitDirection = isMobile ? "vertical" : "horizontal";

  const splitContent =
    viewMode === "split" ? (
      // Key forces a clean remount when direction changes (mobile ↔ desktop).
      <ResizablePanelGroup key={splitDirection} direction={splitDirection} className="h-full">
        <ResizablePanel defaultSize={50} minSize={20}>
          {editorArea}
        </ResizablePanel>
        <ResizableHandle
          withHandle={!isMobile}
          className="bg-border hover:bg-primary/40 transition-colors"
        />
        <ResizablePanel defaultSize={50} minSize={20}>
          {previewArea}
        </ResizablePanel>
      </ResizablePanelGroup>
    ) : viewMode === "editor" ? (
      editorArea
    ) : (
      previewArea
    );

  // ── Mobile sidebar sheet ────────────────────────────────────────────────────

  const mobileSidebar = (
    <Sheet open={mobileSheetOpen} onOpenChange={setMobileSheetOpen}>
      <SheetContent side="left" className="p-0 w-72">
        <FileSidebar
          pendingNewParentId={pendingNewParentId}
          setPendingNewParentId={(id) => {
            setPendingNewParentId(id);
            setMobileSheetOpen(false);
          }}
          onToggleSidebar={() => setMobileSheetOpen(false)}
        />
      </SheetContent>
    </Sheet>
  );

  // ── Main layout ─────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden">
      <DocumentHeader
        title={title}
        onTitleChange={handleTitleChange}
        source={source}
        viewMode={viewMode}
        onViewMode={setViewMode}
        darkMode={darkMode}
        onToggleDark={() => setDarkMode((v) => !v)}
        sidebarOpen={isMobile ? mobileSheetOpen : sidebarOpen}
        onToggleSidebar={isMobile ? () => setMobileSheetOpen((v) => !v) : toggleSidebar}
      />
      <EditorToolbar
        onInsert={handleInsert}
        onSnippet={handleSnippet}
        syncScrollEnabled={syncScrollEnabled}
        onToggleSyncScroll={() => setSyncScrollEnabled((v) => !v)}
      />

      <div className="flex-1 min-h-0 overflow-hidden flex relative">
        {isMobile ? (
          // ── Mobile layout: full-width content, sidebar via Sheet ────────────
          <>
            {mobileSidebar}
            <div className="flex-1 min-h-0 overflow-hidden">
              {splitContent}
            </div>
          </>
        ) : (
          // ── Desktop layout: collapsible sidebar panel + content ──────────────
          <>
            <ResizablePanelGroup direction="horizontal" className="flex-1">
              {/* Sidebar — always mounted; collapse/expand via imperative API */}
              <ResizablePanel
                ref={sidebarPanelRef}
                collapsible
                collapsedSize={0}
                defaultSize={15}
                minSize={12}
                maxSize={30}
                onCollapse={() => setSidebarOpen(false)}
                onExpand={() => setSidebarOpen(true)}
              >
                <FileSidebar
                  pendingNewParentId={pendingNewParentId}
                  setPendingNewParentId={setPendingNewParentId}
                  onToggleSidebar={toggleSidebar}
                />
              </ResizablePanel>

              <ResizableHandle className="bg-border hover:bg-primary/30 transition-colors" />

              {/* Editor / preview content */}
              <ResizablePanel defaultSize={85}>
                {splitContent}
              </ResizablePanel>
            </ResizablePanelGroup>

            {/* Floating toggle — visible only when sidebar is collapsed.
                Stays at the left edge of the content area; never moves to header. */}
            {!sidebarOpen && (
              <button
                onClick={toggleSidebar}
                title="Open sidebar"
                className="absolute left-1.5 top-1.5 z-30 flex h-7 w-7 items-center justify-center rounded-md border border-border bg-card/90 shadow-md backdrop-blur-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              >
                <PanelLeftOpen className="h-3.5 w-3.5" />
              </button>
            )}
          </>
        )}
      </div>

      <StatusBar source={source} cursorLine={cursor.line} cursorCol={cursor.col} />
    </div>
  );
}
