import { FileNode, NodeType } from "./types";
import { dbGet, dbGetAll, dbPut, dbDelete } from "../db";

export async function idbListAll(): Promise<FileNode[]> {
  return dbGetAll<FileNode>("nodes");
}

export async function idbGetContent(id: string): Promise<string> {
  const r = await dbGet<{ id: string; text: string }>("contents", id);
  return r?.text ?? "";
}

export async function idbSaveContent(id: string, text: string): Promise<void> {
  await dbPut("contents", { id, text });
  const node = await dbGet<FileNode>("nodes", id);
  if (node) await dbPut("nodes", { ...node, updatedAt: Date.now() });
}

export async function idbCreateNode(
  partial: Omit<FileNode, "id" | "updatedAt">,
): Promise<FileNode> {
  const node: FileNode = { ...partial, id: crypto.randomUUID(), updatedAt: Date.now() };
  await dbPut("nodes", node);
  if (node.type === "file") await dbPut("contents", { id: node.id, text: "" });
  return node;
}

export async function idbDeleteNode(id: string): Promise<void> {
  const all = await dbGetAll<FileNode>("nodes");
  const ids = collectSubtree(all, id);
  for (const nid of ids) {
    await dbDelete("nodes", nid);
    await dbDelete("contents", nid);
  }
}

export async function idbRenameNode(id: string, name: string): Promise<void> {
  const node = await dbGet<FileNode>("nodes", id);
  if (node) await dbPut("nodes", { ...node, name, updatedAt: Date.now() });
}

export function idbBuildTree(nodes: FileNode[]): FileNode[] {
  return nodes;
}

function collectSubtree(all: FileNode[], rootId: string): string[] {
  const ids = [rootId];
  const queue = [rootId];
  while (queue.length) {
    const pid = queue.shift()!;
    for (const n of all) {
      if (n.parentId === pid) {
        ids.push(n.id);
        if (n.type === "dir") queue.push(n.id);
      }
    }
  }
  return ids;
}

export async function idbSeedWelcome(DEFAULT_CONTENT: string): Promise<FileNode> {
  const node = await idbCreateNode({
    name: "Getting Started.md",
    type: "file" as NodeType,
    parentId: null,
  });
  await idbSaveContent(node.id, DEFAULT_CONTENT);
  return node;
}
