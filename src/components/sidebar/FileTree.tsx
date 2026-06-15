import { useRef, useState } from "react";
import { ChevronRight, File, Folder, FolderOpen, Pencil, Check, X, Scissors, ClipboardPaste } from "lucide-react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { FileNode } from "@/lib/fileSystem/types";
import { cn } from "@/lib/utils";

interface Props {
  nodes: FileNode[];
  activeFileId: string | null;
  onOpen: (id: string) => void;
  onRename: (id: string, newName: string) => void;
  onDelete: (id: string) => void;
  onNewFile: (parentId: string | null) => void;
  onNewFolder: (parentId: string | null) => void;
  onMove: (id: string, newParentId: string | null) => void;
}

// Returns true if `nodeId` is an ancestor of `targetId` (or equal).
// Used to prevent dropping a folder into itself or its descendants.
function isAncestorOrSelf(nodes: FileNode[], nodeId: string, targetId: string): boolean {
  if (nodeId === targetId) return true;
  let cur = nodes.find((n) => n.id === targetId);
  while (cur?.parentId) {
    if (cur.parentId === nodeId) return true;
    cur = nodes.find((n) => n.id === cur!.parentId);
  }
  return false;
}

export default function FileTree({
  nodes,
  activeFileId,
  onOpen,
  onRename,
  onDelete,
  onNewFile,
  onNewFolder,
  onMove,
}: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Drag state
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverTarget, setDragOverTarget] = useState<string | "root" | null>(null);
  // Cut/paste clipboard (alternative to drag-and-drop)
  const [cutId, setCutId] = useState<string | null>(null);

  const toggle = (id: string) =>
    setExpanded((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const startRename = (node: FileNode) => {
    setRenamingId(node.id);
    setRenameDraft(node.name.replace(/\.md$/, ""));
    requestAnimationFrame(() => renameInputRef.current?.select());
  };

  const commitRename = () => {
    if (renamingId && renameDraft.trim()) {
      onRename(renamingId, renameDraft.trim());
    }
    setRenamingId(null);
  };

  const cancelRename = () => setRenamingId(null);

  // ── Drag helpers ─────────────────────────────────────────────────────────────

  const canDropOnto = (targetId: string | null): boolean => {
    if (!draggingId) return false;
    if (targetId === null) return true; // root always valid
    if (isAncestorOrSelf(nodes, draggingId, targetId)) return false;
    // Don't drop onto the node's current parent (no-op, but still allow — harmless)
    return true;
  };

  const handleDrop = (targetId: string | null) => {
    if (draggingId && canDropOnto(targetId)) {
      onMove(draggingId, targetId);
      // Auto-expand target folder so the dropped item is visible
      if (targetId) setExpanded((s) => new Set(s).add(targetId));
    }
    setDraggingId(null);
    setDragOverTarget(null);
  };

  // ── Cut / paste helpers ──────────────────────────────────────────────────────

  // Can the cut item be pasted into `targetId`? (null = root)
  const canPasteInto = (targetId: string | null): boolean => {
    if (!cutId) return false;
    if (targetId === null) return true;
    if (isAncestorOrSelf(nodes, cutId, targetId)) return false; // into self/descendant
    return true;
  };

  const pasteInto = (targetId: string | null) => {
    if (cutId && canPasteInto(targetId)) {
      onMove(cutId, targetId);
      if (targetId) setExpanded((s) => new Set(s).add(targetId));
    }
    setCutId(null);
  };

  const cutNode = cutId ? nodes.find((n) => n.id === cutId) : null;

  // ── Render ───────────────────────────────────────────────────────────────────

  const renderNode = (node: FileNode, depth: number) => {
    const isDir = node.type === "dir";
    const isOpen = expanded.has(node.id);
    const isActive = node.id === activeFileId;
    const isRenaming = renamingId === node.id;
    const isDragging = draggingId === node.id;
    const isDragOver = isDir && dragOverTarget === node.id;
    const children = nodes.filter((n) => n.parentId === node.id);

    return (
      <div key={node.id}>
        {/* Drag handlers live on this plain wrapper, NOT on the Radix
            ContextMenuTrigger child. Radix attaches its own pointer handlers to
            the trigger, which prevents native HTML5 drag from starting. Keeping
            the draggable element outside the trigger makes drag reliable. The
            wrapper holds only the row (children are siblings below), so dragging
            over a nested child correctly bubbles past it to the root drop zone. */}
        <div
          draggable={!isRenaming}
          onDragStart={(e) => {
            setDraggingId(node.id);
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", node.id);
          }}
          onDragEnd={() => {
            setDraggingId(null);
            setDragOverTarget(null);
          }}
          onDragOver={(e) => {
            if (!isDir) return;
            if (!canDropOnto(node.id)) return;
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = "move";
            if (dragOverTarget !== node.id) setDragOverTarget(node.id);
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
              if (dragOverTarget === node.id) setDragOverTarget(null);
            }
          }}
          onDrop={(e) => {
            if (!isDir) return;
            e.preventDefault();
            e.stopPropagation();
            handleDrop(node.id);
          }}
        >
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <div
              className={cn(
                "flex items-center gap-1.5 px-2 py-1.5 rounded-sm cursor-pointer select-none group text-sm transition-colors",
                isActive && !isDragOver
                  ? "bg-primary/15 text-primary font-medium"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                isDragOver && "bg-primary/20 ring-1 ring-inset ring-primary/50 text-primary",
                isDragging && "opacity-40",
                cutId === node.id && "opacity-50 italic",
              )}
              style={{ paddingLeft: `${8 + depth * 14}px` }}
              onClick={() => {
                if (isDir) toggle(node.id);
                else onOpen(node.id);
              }}
            >
              {isDir ? (
                <>
                  <ChevronRight
                    className={cn(
                      "h-3.5 w-3.5 shrink-0 transition-transform text-muted-foreground/60",
                      isOpen && "rotate-90",
                    )}
                  />
                  {isOpen ? (
                    <FolderOpen className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                  ) : (
                    <Folder className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                  )}
                </>
              ) : (
                <>
                  <span className="w-3.5 shrink-0" />
                  <File className="h-3.5 w-3.5 shrink-0 text-primary/70" />
                </>
              )}

              {isRenaming ? (
                <div className="flex items-center gap-1 flex-1 min-w-0" onClick={(e) => e.stopPropagation()}>
                  <input
                    ref={renameInputRef}
                    className="flex-1 min-w-0 bg-input border border-ring rounded px-1 text-xs text-foreground outline-none"
                    value={renameDraft}
                    onChange={(e) => setRenameDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitRename();
                      if (e.key === "Escape") cancelRename();
                    }}
                    autoFocus
                  />
                  <button onClick={commitRename} className="text-green-500 hover:text-green-400">
                    <Check className="h-3 w-3" />
                  </button>
                  <button onClick={cancelRename} className="text-destructive hover:text-destructive/80">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <span className="truncate flex-1 text-sm">
                  {node.type === "file" ? node.name.replace(/\.md$/, "") : node.name}
                </span>
              )}
            </div>
          </ContextMenuTrigger>

          <ContextMenuContent className="w-44 text-sm">
            {!isDir && (
              <ContextMenuItem onClick={() => onOpen(node.id)}>Open</ContextMenuItem>
            )}
            <ContextMenuItem onClick={() => startRename(node)}>
              <Pencil className="h-3.5 w-3.5 mr-2" /> Rename
            </ContextMenuItem>

            <ContextMenuSeparator />
            <ContextMenuItem onClick={() => setCutId(node.id)}>
              <Scissors className="h-3.5 w-3.5 mr-2" /> Cut
            </ContextMenuItem>
            {isDir && cutId && canPasteInto(node.id) && (
              <ContextMenuItem onClick={() => pasteInto(node.id)}>
                <ClipboardPaste className="h-3.5 w-3.5 mr-2" /> Paste into folder
              </ContextMenuItem>
            )}

            {isDir && (
              <>
                <ContextMenuSeparator />
                <ContextMenuItem onClick={() => onNewFile(node.id)}>New File here</ContextMenuItem>
                <ContextMenuItem onClick={() => onNewFolder(node.id)}>New Folder here</ContextMenuItem>
              </>
            )}
            <ContextMenuSeparator />
            <ContextMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => {
                if (confirm(`Delete "${node.name}"${isDir ? " and all its contents" : ""}?`)) {
                  onDelete(node.id);
                }
              }}
            >
              Delete
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
        </div>

        {isDir && isOpen && children.length > 0 && (
          <div>
            {sortNodes(children).map((c) => renderNode(c, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  const roots = sortNodes(nodes.filter((n) => n.parentId === null));

  if (roots.length === 0) {
    return (
      <div className="px-4 py-6 text-center text-xs text-muted-foreground">
        No files yet.
        <br />
        Create one with the <span className="font-medium">+ File</span> button.
      </div>
    );
  }

  // True when the item being dragged isn't already at the root level — only then
  // is a "move to root" drop meaningful.
  const draggingNode = draggingId ? nodes.find((n) => n.id === draggingId) : null;
  const canMoveToRoot = !!draggingNode && draggingNode.parentId !== null;

  return (
    // The whole tree area is a root drop target: dropping on empty space (or on a
    // file/anything that isn't a folder) moves the item to the top level. Folder
    // rows stop propagation, so dropping onto a folder still nests inside it.
    <div
      className={cn(
        "py-1 min-h-full transition-colors",
        canMoveToRoot && dragOverTarget === "root" && "bg-primary/5",
      )}
      onDragOver={(e) => {
        // Accept a root-level drop anywhere that isn't a folder. Folder rows call
        // stopPropagation so this never fires while hovering them. We always
        // preventDefault here (the drag event in flight must be preventDefault-ed
        // for the browser to allow the drop), then resolve the target in handleDrop.
        if (!draggingId) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (canMoveToRoot && dragOverTarget !== "root") setDragOverTarget("root");
      }}
      onDrop={(e) => {
        if (!draggingId) return;
        e.preventDefault();
        handleDrop(null);
      }}
    >
      {/* Explicit "move to root" bar — clearly visible whenever a nested item is
          being dragged, so it's an easy, obvious target. */}
      {canMoveToRoot && (
        <div
          className={cn(
            "mx-2 mb-1 flex h-8 items-center justify-center rounded-sm border border-dashed text-xs transition-colors",
            dragOverTarget === "root"
              ? "border-primary/60 bg-primary/15 text-primary font-medium"
              : "border-border/70 text-muted-foreground",
          )}
          onDragOver={(e) => {
            if (!canDropOnto(null)) return;
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = "move";
            if (dragOverTarget !== "root") setDragOverTarget("root");
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handleDrop(null);
          }}
        >
          ↑ Move to root
        </div>
      )}

      {/* Clipboard bar — shown after "Cut", offers paste-to-root and cancel. */}
      {cutNode && (
        <div className="mx-2 mb-1 flex items-center gap-1 rounded-sm border border-primary/40 bg-primary/10 px-2 py-1 text-xs">
          <ClipboardPaste className="h-3.5 w-3.5 shrink-0 text-primary" />
          <span className="truncate flex-1 text-foreground/80">
            {cutNode.name.replace(/\.md$/, "")}
          </span>
          {cutNode.parentId !== null && (
            <button
              onClick={() => pasteInto(null)}
              className="shrink-0 rounded px-1.5 py-0.5 font-medium text-primary hover:bg-primary/15"
              title="Paste to root"
            >
              Paste to root
            </button>
          )}
          <button
            onClick={() => setCutId(null)}
            className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-secondary"
            title="Cancel"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {roots.map((n) => renderNode(n, 0))}
    </div>
  );
}

function sortNodes(nodes: FileNode[]): FileNode[] {
  return [...nodes].sort((a, b) => {
    if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}
