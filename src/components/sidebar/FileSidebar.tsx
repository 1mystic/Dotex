import { useRef, useState } from "react";
import {
  FilePlus,
  FolderPlus,
  HardDrive,
  Cloud,
  LogOut,
  RefreshCw,
  FolderOpen,
  Loader2,
  PanelLeftClose,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useFileSystem } from "@/lib/fileSystem/FileSystemContext";
import FileTree from "./FileTree";
import { toast } from "sonner";

// ── New item dialog ───────────────────────────────────────────────────────────

interface NewItemDialogProps {
  open: boolean;
  kind: "file" | "folder";
  onConfirm: (name: string) => void;
  onClose: () => void;
}

function NewItemDialog({ open, kind, onConfirm, onClose }: NewItemDialogProps) {
  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const confirm = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onConfirm(trimmed);
    setName("");
    onClose();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) { setName(""); onClose(); }
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{kind === "file" ? "New File" : "New Folder"}</DialogTitle>
        </DialogHeader>
        <Input
          ref={inputRef}
          placeholder={kind === "file" ? "filename (without .md)" : "folder name"}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") confirm();
            if (e.key === "Escape") onClose();
          }}
          autoFocus
          className="mt-1"
        />
        <DialogFooter className="mt-3">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={confirm} disabled={!name.trim()}>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main sidebar ──────────────────────────────────────────────────────────────

interface Props {
  pendingNewParentId: string | null;
  setPendingNewParentId: (id: string | null) => void;
  onToggleSidebar: () => void;
}

export default function FileSidebar({ pendingNewParentId, setPendingNewParentId, onToggleSidebar }: Props) {
  const {
    nodes,
    activeFileId,
    backend,
    nativeRootName,
    googleUser,
    openFile,
    createFile,
    createDir,
    deleteNode,
    renameNode,
    mountLocalFolder,
    unmountLocalFolder,
    signInWithGoogle,
    signOutGoogle,
    refreshNodes,
  } = useFileSystem();

  const [dialog, setDialog] = useState<{ open: boolean; kind: "file" | "folder"; parentId: string | null }>({
    open: false,
    kind: "file",
    parentId: null,
  });
  const [cloudBusy, setCloudBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const openDialog = (kind: "file" | "folder", parentId: string | null = null) => {
    setDialog({ open: true, kind, parentId });
    setPendingNewParentId(parentId);
  };

  const handleCreate = async (name: string) => {
    try {
      const parentId = pendingNewParentId;
      const node =
        dialog.kind === "file"
          ? await createFile(parentId, name)
          : await createDir(parentId, name);
      if (dialog.kind === "file") openFile(node.id);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to create item");
    }
    setPendingNewParentId(null);
  };

  const handleMountFolder = async () => {
    try {
      setCloudBusy(true);
      await mountLocalFolder();
      toast.success("Local folder mounted");
    } catch (e: any) {
      if (e?.name !== "AbortError") toast.error(e?.message ?? "Failed to mount folder");
    } finally {
      setCloudBusy(false);
    }
  };

  const handleUnmount = async () => {
    await unmountLocalFolder();
    toast.info("Switched back to browser storage");
  };

  const handleGoogleSignIn = async () => {
    try {
      setCloudBusy(true);
      await signInWithGoogle();
      toast.success("Connected to Google Drive");
    } catch (e: any) {
      toast.error(e?.message ?? "Google sign-in failed");
    } finally {
      setCloudBusy(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshNodes();
    } catch (e: any) {
      toast.error(e?.message ?? "Refresh failed");
    } finally {
      setRefreshing(false);
    }
  };

  // ── Backend label / icon ─────────────────────────────────────────────────────
  const backendLabel =
    backend === "native"
      ? nativeRootName ?? "Local Folder"
      : backend === "gdrive"
      ? googleUser ?? "Google Drive"
      : "Browser Storage";

  const BackendIcon =
    backend === "native" ? HardDrive : backend === "gdrive" ? Cloud : HardDrive;

  return (
    <div className="flex flex-col h-full bg-card border-r border-border overflow-hidden">
      {/* Header */}
      <div className="shrink-0 flex items-center gap-1 px-2 py-2 border-b border-border">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0"
              onClick={onToggleSidebar}
            >
              <PanelLeftClose className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Close Sidebar</TooltipContent>
        </Tooltip>

        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground flex-1 pl-1">
          Files
        </span>

        <div className="flex items-center gap-0.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => openDialog("file")}
              >
                <FilePlus className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">New File</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => openDialog("folder")}
              >
                <FolderPlus className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">New Folder</TooltipContent>
          </Tooltip>

          {(backend === "native" || backend === "gdrive") && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={handleRefresh}
                  disabled={refreshing}
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Refresh</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>

      {/* File tree */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <FileTree
          nodes={nodes}
          activeFileId={activeFileId}
          onOpen={openFile}
          onRename={renameNode}
          onDelete={deleteNode}
          onNewFile={(parentId) => openDialog("file", parentId)}
          onNewFolder={(parentId) => openDialog("folder", parentId)}
        />
      </div>

      {/* Storage footer */}
      <div className="shrink-0 border-t border-border px-3 py-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="flex items-center gap-2 w-full text-left px-1 py-1 rounded hover:bg-secondary transition-colors"
              disabled={cloudBusy}
            >
              {cloudBusy ? (
                <Loader2 className="h-3.5 w-3.5 text-muted-foreground animate-spin shrink-0" />
              ) : (
                <BackendIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              )}
              <span className="text-[11px] text-muted-foreground truncate flex-1">
                {backendLabel}
              </span>
            </button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="start" side="top" className="w-56">
            <DropdownMenuItem
              disabled={backend === "idb"}
              onClick={backend !== "idb" ? handleUnmount : undefined}
            >
              <HardDrive className="h-4 w-4 mr-2" />
              Browser Storage
              {backend === "idb" && (
                <span className="ml-auto text-xs text-primary">active</span>
              )}
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            <DropdownMenuItem onClick={handleMountFolder} disabled={cloudBusy}>
              <FolderOpen className="h-4 w-4 mr-2" />
              {backend === "native" ? "Change Local Folder" : "Mount Local Folder"}
              {backend === "native" && (
                <span className="ml-auto text-xs text-primary">active</span>
              )}
            </DropdownMenuItem>

            {backend === "native" && (
              <DropdownMenuItem onClick={handleUnmount}>
                <LogOut className="h-4 w-4 mr-2 text-muted-foreground" />
                Unmount Folder
              </DropdownMenuItem>
            )}

            <DropdownMenuSeparator />

            {googleUser ? (
              <>
                <div className="px-2 py-1 text-xs text-muted-foreground truncate">
                  <Cloud className="inline h-3 w-3 mr-1" />
                  {googleUser}
                </div>
                <DropdownMenuItem onClick={signOutGoogle}>
                  <LogOut className="h-4 w-4 mr-2 text-muted-foreground" />
                  Sign out Google
                </DropdownMenuItem>
              </>
            ) : (
              <DropdownMenuItem onClick={handleGoogleSignIn} disabled={cloudBusy}>
                <Cloud className="h-4 w-4 mr-2" />
                Sign in with Google Drive
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* New item dialog */}
      <NewItemDialog
        open={dialog.open}
        kind={dialog.kind}
        onConfirm={handleCreate}
        onClose={() => setDialog((d) => ({ ...d, open: false }))}
      />
    </div>
  );
}
