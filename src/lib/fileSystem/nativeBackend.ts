import { FileNode } from "./types";
import { dbGet, dbPut, dbDelete } from "../db";

const ROOT_KEY = "native-root-handle";
const MAP_KEY = "native-path-map";

interface PathMap {
  pathToId: Record<string, string>;
  idToPath: Record<string, string>;
}

let rootHandle: FileSystemDirectoryHandle | null = null;

// ── Persistence ───────────────────────────────────────────────────────────────

async function loadMap(): Promise<PathMap> {
  const r = await dbGet<{ key: string; data: PathMap }>("meta", MAP_KEY);
  return r?.data ?? { pathToId: {}, idToPath: {} };
}

async function saveMap(map: PathMap): Promise<void> {
  await dbPut("meta", { key: MAP_KEY, data: map });
}

// ── Handle management ─────────────────────────────────────────────────────────

export function nativeGetRoot(): FileSystemDirectoryHandle | null {
  return rootHandle;
}

export async function nativeInit(): Promise<FileSystemDirectoryHandle | null> {
  const stored = await dbGet<{ key: string; handle: FileSystemDirectoryHandle }>("handles", ROOT_KEY);
  if (!stored?.handle) return null;
  try {
    const perm = await stored.handle.queryPermission({ mode: "readwrite" });
    if (perm === "granted") {
      rootHandle = stored.handle;
      return rootHandle;
    }
    return stored.handle; // caller can call nativeRequestPermission
  } catch {
    return null;
  }
}

export async function nativeMount(): Promise<FileSystemDirectoryHandle> {
  const handle = await (window as any).showDirectoryPicker({ mode: "readwrite" });
  rootHandle = handle;
  await dbPut("handles", { key: ROOT_KEY, handle });
  await dbPut("meta", { key: MAP_KEY, data: { pathToId: {}, idToPath: {} } });
  return handle;
}

export async function nativeRequestPermission(
  handle: FileSystemDirectoryHandle,
): Promise<boolean> {
  const perm = await handle.requestPermission({ mode: "readwrite" });
  if (perm === "granted") {
    rootHandle = handle;
    return true;
  }
  return false;
}

export async function nativeClear(): Promise<void> {
  rootHandle = null;
  await dbDelete("handles", ROOT_KEY);
  await dbDelete("meta", MAP_KEY);
}

// ── Directory scanning ────────────────────────────────────────────────────────

const ALLOWED_EXTENSIONS = new Set([".md", ".txt", ".tex", ".markdown"]);

function isAllowedFile(name: string): boolean {
  const ext = name.slice(name.lastIndexOf("."));
  return ALLOWED_EXTENSIONS.has(ext.toLowerCase());
}

export async function nativeScan(): Promise<FileNode[]> {
  if (!rootHandle) throw new Error("No directory mounted");
  const map = await loadMap();
  const nodes: FileNode[] = [];
  await scanDir(rootHandle, null, map, nodes, "");
  await saveMap(map);
  return nodes;
}

async function scanDir(
  dirHandle: FileSystemDirectoryHandle,
  parentId: string | null,
  map: PathMap,
  nodes: FileNode[],
  prefix: string,
): Promise<void> {
  for await (const [name, handle] of (dirHandle as any).entries()) {
    if (name.startsWith(".")) continue;
    const path = prefix ? `${prefix}/${name}` : name;

    if (handle.kind === "directory") {
      let id = map.pathToId[path];
      if (!id) {
        id = crypto.randomUUID();
        map.pathToId[path] = id;
        map.idToPath[id] = path;
      }
      nodes.push({ id, name, type: "dir", parentId, updatedAt: 0 });
      await scanDir(handle as FileSystemDirectoryHandle, id, map, nodes, path);
    } else if (isAllowedFile(name)) {
      let id = map.pathToId[path];
      if (!id) {
        id = crypto.randomUUID();
        map.pathToId[path] = id;
        map.idToPath[id] = path;
      }
      const file = await (handle as FileSystemFileHandle).getFile();
      nodes.push({ id, name, type: "file", parentId, updatedAt: file.lastModified });
    }
  }
}

// ── Path resolution ───────────────────────────────────────────────────────────

async function pathFromId(id: string): Promise<string[]> {
  const map = await loadMap();
  const path = map.idToPath[id];
  if (!path) throw new Error(`Unknown file id: ${id}`);
  return path.split("/");
}

async function resolveDir(parts: string[]): Promise<FileSystemDirectoryHandle> {
  let cur = rootHandle!;
  for (const part of parts) {
    cur = await cur.getDirectoryHandle(part);
  }
  return cur;
}

// ── File operations ───────────────────────────────────────────────────────────

export async function nativeGetContent(id: string): Promise<string> {
  const parts = await pathFromId(id);
  const dirParts = parts.slice(0, -1);
  const fileName = parts[parts.length - 1];
  const dir = dirParts.length > 0 ? await resolveDir(dirParts) : rootHandle!;
  const fh = await dir.getFileHandle(fileName);
  return (await fh.getFile()).text();
}

export async function nativeSaveContent(id: string, text: string): Promise<void> {
  const parts = await pathFromId(id);
  const dirParts = parts.slice(0, -1);
  const fileName = parts[parts.length - 1];
  const dir = dirParts.length > 0 ? await resolveDir(dirParts) : rootHandle!;
  const fh = await dir.getFileHandle(fileName, { create: true });
  const writable = await fh.createWritable();
  await writable.write(text);
  await writable.close();
}

export async function nativeCreateFile(
  parentId: string | null,
  name: string,
): Promise<FileNode> {
  const map = await loadMap();
  const parentPath = parentId ? map.idToPath[parentId] ?? "" : "";
  const path = parentPath ? `${parentPath}/${name}` : name;

  const parentDir =
    parentPath ? await resolveDir(parentPath.split("/")) : rootHandle!;
  const fh = await parentDir.getFileHandle(name, { create: true });
  const writable = await fh.createWritable();
  await writable.write("");
  await writable.close();

  const id = crypto.randomUUID();
  map.pathToId[path] = id;
  map.idToPath[id] = path;
  await saveMap(map);

  return { id, name, type: "file", parentId, updatedAt: Date.now() };
}

export async function nativeCreateDir(
  parentId: string | null,
  name: string,
): Promise<FileNode> {
  const map = await loadMap();
  const parentPath = parentId ? map.idToPath[parentId] ?? "" : "";
  const path = parentPath ? `${parentPath}/${name}` : name;

  const parentDir =
    parentPath ? await resolveDir(parentPath.split("/")) : rootHandle!;
  await parentDir.getDirectoryHandle(name, { create: true });

  const id = crypto.randomUUID();
  map.pathToId[path] = id;
  map.idToPath[id] = path;
  await saveMap(map);

  return { id, name, type: "dir", parentId, updatedAt: Date.now() };
}

export async function nativeDeleteEntry(id: string): Promise<void> {
  const map = await loadMap();
  const fullPath = map.idToPath[id];
  if (!fullPath) return;
  const parts = fullPath.split("/");
  const name = parts[parts.length - 1];
  const parentParts = parts.slice(0, -1);
  const parentDir = parentParts.length > 0 ? await resolveDir(parentParts) : rootHandle!;
  await (parentDir as any).removeEntry(name, { recursive: true });

  // Remove all path-map entries for this subtree
  for (const [p, i] of Object.entries(map.pathToId)) {
    if (p === fullPath || p.startsWith(fullPath + "/")) {
      delete map.pathToId[p];
      delete map.idToPath[i];
    }
  }
  await saveMap(map);
}

export async function nativeMoveFile(id: string, newParentId: string | null): Promise<void> {
  const map = await loadMap();
  const fullPath = map.idToPath[id];
  if (!fullPath) throw new Error("File not found in native FS");

  const parts = fullPath.split("/");
  const name = parts[parts.length - 1];
  const oldParentParts = parts.slice(0, -1);

  const newParentPath = newParentId ? map.idToPath[newParentId] ?? "" : "";
  const newPath = newParentPath ? `${newParentPath}/${name}` : name;
  if (fullPath === newPath) return;

  const content = await nativeGetContent(id);
  const newParentDir = newParentPath ? await resolveDir(newParentPath.split("/")) : rootHandle!;
  const newFh = await newParentDir.getFileHandle(name, { create: true });
  const writable = await newFh.createWritable();
  await writable.write(content);
  await writable.close();

  const oldParentDir = oldParentParts.length > 0 ? await resolveDir(oldParentParts) : rootHandle!;
  await (oldParentDir as any).removeEntry(name);

  delete map.pathToId[fullPath];
  map.pathToId[newPath] = id;
  map.idToPath[id] = newPath;
  await saveMap(map);
}

export async function nativeRenameFile(id: string, newName: string): Promise<void> {
  const map = await loadMap();
  const fullPath = map.idToPath[id];
  if (!fullPath) throw new Error("File not found in native FS");

  const parts = fullPath.split("/");
  const oldName = parts[parts.length - 1];
  if (oldName === newName) return;

  const parentParts = parts.slice(0, -1);
  const newPath = [...parentParts, newName].join("/") || newName;

  // Read → write new → delete old (directories not supported)
  const content = await nativeGetContent(id);
  const parentDir = parentParts.length > 0 ? await resolveDir(parentParts) : rootHandle!;
  const newFh = await parentDir.getFileHandle(newName, { create: true });
  const writable = await newFh.createWritable();
  await writable.write(content);
  await writable.close();
  await (parentDir as any).removeEntry(oldName);

  // Update map
  delete map.pathToId[fullPath];
  map.pathToId[newPath] = id;
  map.idToPath[id] = newPath;
  await saveMap(map);
}
