import { useRef, useState } from "react";
import { ChevronRight, File, Folder, FolderOpen, Pencil, Check, X } from "lucide-react";
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
}

export default function FileTree({
  nodes,
  activeFileId,
  onOpen,
  onRename,
  onDelete,
  onNewFile,
  onNewFolder,
}: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);

  const toggle = (id: string) =>
    setExpanded((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const startRename = (node: FileNode) => {
    setRenamingId(node.id);
    // Strip .md for display convenience
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

  const renderNode = (node: FileNode, depth: number) => {
    const isDir = node.type === "dir";
    const isOpen = expanded.has(node.id);
    const isActive = node.id === activeFileId;
    const isRenaming = renamingId === node.id;
    const children = nodes.filter((n) => n.parentId === node.id);

    return (
      <div key={node.id}>
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <div
              className={cn(
                "flex items-center gap-1.5 px-2 py-[3px] rounded-md cursor-pointer select-none group text-sm",
                isActive
                  ? "bg-primary/15 text-primary font-medium"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground",
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
                <span className="truncate flex-1 text-xs">
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

  return (
    <div className="py-1">
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
