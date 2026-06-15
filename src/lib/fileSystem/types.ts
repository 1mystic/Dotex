export type NodeType = "file" | "dir";
export type BackendType = "idb" | "native" | "gdrive";

export interface FileNode {
  id: string;
  name: string;
  type: NodeType;
  parentId: string | null;
  updatedAt: number;
}

export interface FileSystemContextValue {
  nodes: FileNode[];
  activeFileId: string | null;
  isReady: boolean;
  backend: BackendType;
  nativeRootName: string | null;
  googleUser: string | null;

  openFile: (id: string) => void;
  createFile: (parentId: string | null, name: string) => Promise<FileNode>;
  createDir: (parentId: string | null, name: string) => Promise<FileNode>;
  deleteNode: (id: string) => Promise<void>;
  renameNode: (id: string, newName: string) => Promise<void>;
  moveNode: (id: string, newParentId: string | null) => Promise<void>;
  getContent: (id: string) => Promise<string>;
  saveContent: (id: string, content: string) => Promise<void>;
  mountLocalFolder: () => Promise<void>;
  unmountLocalFolder: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOutGoogle: () => void;
  refreshNodes: () => Promise<void>;
}
