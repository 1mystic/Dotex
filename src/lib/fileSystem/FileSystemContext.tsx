import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { BackendType, FileNode, FileSystemContextValue } from "./types";
import {
  idbCreateNode,
  idbDeleteNode,
  idbGetContent,
  idbListAll,
  idbRenameNode,
  idbSaveContent,
  idbSeedWelcome,
} from "./idbBackend";
import {
  nativeClear,
  nativeCreateDir,
  nativeCreateFile,
  nativeDeleteEntry,
  nativeGetContent,
  nativeGetRoot,
  nativeInit,
  nativeMount,
  nativeRenameFile,
  nativeRequestPermission,
  nativeSaveContent,
  nativeScan,
} from "./nativeBackend";
import {
  gdriveClearMap,
  gdriveCreateDir,
  gdriveCreateFile,
  gdriveDeleteEntry,
  gdriveGetContent,
  gdriveGetUser,
  gdriveListAll,
  gdriveRename,
  gdriveSaveContent,
  gdriveSignIn,
  gdriveSignOut,
} from "./gdriveBackend";

// ── Welcome content for first-time users ─────────────────────────────────────

const WELCOME_CONTENT = `# Welcome to Matex ✦

A powerful **Markdown + LaTeX** editor with live preview and export.

---

## Markdown Features

Write *italic*, **bold**, ~~strikethrough~~, and \`inline code\`.

> Blockquotes look great for callouts and important notes.

### Lists

- Item one
- Item two
  - Nested item

1. First step
2. Second step

### Code Blocks

\`\`\`javascript
const greet = (name) => \`Hello, \${name}!\`;
console.log(greet("Matex"));
\`\`\`

---

## LaTeX Math

Inline math like $E = mc^2$ flows naturally with text.

Display equations:

$$\\int_{-\\infty}^{\\infty} e^{-x^2} dx = \\sqrt{\\pi}$$

### Aligned Equations

$$
\\begin{align}
(a + b)^2 &= a^2 + 2ab + b^2 \\\\
(a - b)^2 &= a^2 - 2ab + b^2
\\end{align}
$$

Happy writing!
`;

// ── Preferences stored in localStorage ───────────────────────────────────────

const PREF_BACKEND = "texflow-backend";
const PREF_ACTIVE = "texflow-active-file";

// ── Context ───────────────────────────────────────────────────────────────────

const Ctx = createContext<FileSystemContextValue | null>(null);

export function useFileSystem(): FileSystemContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useFileSystem must be used inside FileSystemProvider");
  return ctx;
}

export function FileSystemProvider({ children }: { children: React.ReactNode }) {
  const [nodes, setNodes] = useState<FileNode[]>([]);
  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [backend, setBackend] = useState<BackendType>("idb");
  const [nativeRootName, setNativeRootName] = useState<string | null>(null);
  const [googleUser, setGoogleUser] = useState<string | null>(null);

  // Avoid stale-closure issues in callbacks
  const backendRef = useRef<BackendType>("idb");
  backendRef.current = backend;

  // ── Initialisation ──────────────────────────────────────────────────────────

  useEffect(() => {
    (async () => {
      // Restore Google user if token is still in sessionStorage
      const gu = gdriveGetUser();
      if (gu) setGoogleUser(gu);

      const savedBackend = (localStorage.getItem(PREF_BACKEND) as BackendType) ?? "idb";
      const savedActive = localStorage.getItem(PREF_ACTIVE);

      if (savedBackend === "native") {
        const handle = await nativeInit();
        if (handle && nativeGetRoot()) {
          setBackend("native");
          backendRef.current = "native";
          setNativeRootName(handle.name);
          try {
            const scanned = await nativeScan();
            setNodes(scanned);
            const active = savedActive && scanned.find((n) => n.id === savedActive && n.type === "file")
              ? savedActive
              : (scanned.find((n) => n.type === "file")?.id ?? null);
            setActiveFileId(active);
            setIsReady(true);
            return;
          } catch {
            // Fall through to IDB
          }
        } else if (handle) {
          // Need permission re-grant
          const granted = await nativeRequestPermission(handle).catch(() => false);
          if (granted) {
            setBackend("native");
            backendRef.current = "native";
            setNativeRootName(handle.name);
            const scanned = await nativeScan();
            setNodes(scanned);
            const active = savedActive && scanned.find((n) => n.id === savedActive && n.type === "file")
              ? savedActive
              : (scanned.find((n) => n.type === "file")?.id ?? null);
            setActiveFileId(active);
            setIsReady(true);
            return;
          }
        }
        // Reset to IDB if native failed
        localStorage.setItem(PREF_BACKEND, "idb");
      }

      if (savedBackend === "gdrive" && gu) {
        setBackend("gdrive");
        backendRef.current = "gdrive";
        try {
          const list = await gdriveListAll();
          setNodes(list);
          const active = savedActive && list.find((n) => n.id === savedActive && n.type === "file")
            ? savedActive
            : (list.find((n) => n.type === "file")?.id ?? null);
          setActiveFileId(active);
          setIsReady(true);
          return;
        } catch {
          localStorage.setItem(PREF_BACKEND, "idb");
          setBackend("idb");
          backendRef.current = "idb";
        }
      }

      // Default: IDB
      setBackend("idb");
      backendRef.current = "idb";
      let list = await idbListAll();
      if (list.length === 0) {
        const welcome = await idbSeedWelcome(WELCOME_CONTENT);
        list = [welcome];
        setActiveFileId(welcome.id);
      } else {
        const active = savedActive && list.find((n) => n.id === savedActive && n.type === "file")
          ? savedActive
          : (list.find((n) => n.type === "file")?.id ?? null);
        setActiveFileId(active);
      }
      setNodes(list);
      setIsReady(true);
    })();
  }, []);

  // Persist active file id
  useEffect(() => {
    if (activeFileId) localStorage.setItem(PREF_ACTIVE, activeFileId);
  }, [activeFileId]);

  // ── File operations ─────────────────────────────────────────────────────────

  const openFile = useCallback((id: string) => {
    setActiveFileId(id);
  }, []);

  const refreshNodes = useCallback(async () => {
    const b = backendRef.current;
    let list: FileNode[];
    if (b === "native") list = await nativeScan();
    else if (b === "gdrive") list = await gdriveListAll();
    else list = await idbListAll();
    setNodes(list);
  }, []);

  const createFile = useCallback(
    async (parentId: string | null, name: string): Promise<FileNode> => {
      const b = backendRef.current;
      let node: FileNode;
      const safeName = name.endsWith(".md") ? name : `${name}.md`;
      if (b === "native") node = await nativeCreateFile(parentId, safeName);
      else if (b === "gdrive") node = await gdriveCreateFile(parentId, safeName);
      else node = await idbCreateNode({ name: safeName, type: "file", parentId });
      setNodes((prev) => [...prev, node]);
      return node;
    },
    [],
  );

  const createDir = useCallback(
    async (parentId: string | null, name: string): Promise<FileNode> => {
      const b = backendRef.current;
      let node: FileNode;
      if (b === "native") node = await nativeCreateDir(parentId, name);
      else if (b === "gdrive") node = await gdriveCreateDir(parentId, name);
      else node = await idbCreateNode({ name, type: "dir", parentId });
      setNodes((prev) => [...prev, node]);
      return node;
    },
    [],
  );

  const deleteNode = useCallback(
    async (id: string): Promise<void> => {
      const b = backendRef.current;
      if (b === "native") await nativeDeleteEntry(id);
      else if (b === "gdrive") await gdriveDeleteEntry(id);
      else await idbDeleteNode(id);
      setNodes((prev) => prev.filter((n) => n.id !== id));
      setActiveFileId((prev) => (prev === id ? null : prev));
    },
    [],
  );

  const renameNode = useCallback(
    async (id: string, newName: string): Promise<void> => {
      const b = backendRef.current;
      const safeName = (() => {
        const node = nodes.find((n) => n.id === id);
        if (node?.type === "file" && !newName.includes(".")) return `${newName}.md`;
        return newName;
      })();
      if (b === "native") await nativeRenameFile(id, safeName);
      else if (b === "gdrive") await gdriveRename(id, safeName);
      else await idbRenameNode(id, safeName);
      setNodes((prev) =>
        prev.map((n) => (n.id === id ? { ...n, name: safeName, updatedAt: Date.now() } : n)),
      );
    },
    [nodes],
  );

  const getContent = useCallback(
    async (id: string): Promise<string> => {
      const b = backendRef.current;
      if (b === "native") return nativeGetContent(id);
      if (b === "gdrive") return gdriveGetContent(id);
      return idbGetContent(id);
    },
    [],
  );

  const saveContent = useCallback(
    async (id: string, content: string): Promise<void> => {
      const b = backendRef.current;
      if (b === "native") await nativeSaveContent(id, content);
      else if (b === "gdrive") await gdriveSaveContent(id, content);
      else await idbSaveContent(id, content);
      setNodes((prev) =>
        prev.map((n) => (n.id === id ? { ...n, updatedAt: Date.now() } : n)),
      );
    },
    [],
  );

  // ── Backend switching ───────────────────────────────────────────────────────

  const mountLocalFolder = useCallback(async () => {
    if (!("showDirectoryPicker" in window)) {
      throw new Error(
        "Your browser does not support the File System Access API. " +
        "Please use Chrome or Edge.",
      );
    }
    const handle = await nativeMount();
    setNativeRootName(handle.name);
    setBackend("native");
    backendRef.current = "native";
    localStorage.setItem(PREF_BACKEND, "native");

    const scanned = await nativeScan();
    setNodes(scanned);
    const first = scanned.find((n) => n.type === "file") ?? null;
    setActiveFileId(first?.id ?? null);
    setIsReady(true);
  }, []);

  const unmountLocalFolder = useCallback(async () => {
    await nativeClear();
    setNativeRootName(null);
    setBackend("idb");
    backendRef.current = "idb";
    localStorage.setItem(PREF_BACKEND, "idb");

    let list = await idbListAll();
    if (list.length === 0) {
      const welcome = await idbSeedWelcome(WELCOME_CONTENT);
      list = [welcome];
      setActiveFileId(welcome.id);
    }
    setNodes(list);
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const name = await gdriveSignIn();
    setGoogleUser(name);
    setBackend("gdrive");
    backendRef.current = "gdrive";
    localStorage.setItem(PREF_BACKEND, "gdrive");

    const list = await gdriveListAll();
    setNodes(list);
    const first = list.find((n) => n.type === "file") ?? null;
    setActiveFileId(first?.id ?? null);
  }, []);

  const signOutGoogle = useCallback(() => {
    gdriveSignOut();
    gdriveClearMap();
    setGoogleUser(null);
    setBackend("idb");
    backendRef.current = "idb";
    localStorage.setItem(PREF_BACKEND, "idb");
    idbListAll().then(setNodes);
  }, []);

  // ── Context value ───────────────────────────────────────────────────────────

  const value: FileSystemContextValue = {
    nodes,
    activeFileId,
    isReady,
    backend,
    nativeRootName,
    googleUser,
    openFile,
    createFile,
    createDir,
    deleteNode,
    renameNode,
    getContent,
    saveContent,
    mountLocalFolder,
    unmountLocalFolder,
    signInWithGoogle,
    signOutGoogle,
    refreshNodes,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
