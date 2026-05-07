/**
 * Google Drive backend — uses Google Identity Services (OAuth2 token flow)
 * and the Drive REST API v3 directly via fetch.
 *
 * To enable: create a Google Cloud project, enable the Drive API, create an
 * OAuth 2.0 web-client credential, and set VITE_GOOGLE_CLIENT_ID in a .env file.
 *
 * Scopes requested: https://www.googleapis.com/auth/drive.file
 * (only files created by this app are accessible — no full Drive access)
 */

import { FileNode } from "./types";
import { dbGet, dbPut, dbDelete } from "../db";

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
const SCOPES = "https://www.googleapis.com/auth/drive.file";
const ROOT_FOLDER_NAME = "Texflow Notes";
const MAP_KEY = "gdrive-map";
const TOKEN_KEY = "gdrive-token";
const USER_KEY = "gdrive-user";

interface DriveMap {
  rootFolderId: string;
  idToDriveId: Record<string, string>;
  driveIdToId: Record<string, string>;
}

// In-memory token cache
let _token: string | null = null;
let _userName: string | null = null;

// ── Token management ──────────────────────────────────────────────────────────

export function gdriveGetToken(): string | null {
  if (_token) return _token;
  _token = sessionStorage.getItem(TOKEN_KEY);
  return _token;
}

export function gdriveGetUser(): string | null {
  if (_userName) return _userName;
  _userName = sessionStorage.getItem(USER_KEY);
  return _userName;
}

function saveToken(token: string, name: string): void {
  _token = token;
  _userName = name;
  sessionStorage.setItem(TOKEN_KEY, token);
  sessionStorage.setItem(USER_KEY, name);
}

export function gdriveSignOut(): void {
  _token = null;
  _userName = null;
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
}

// ── OAuth2 sign-in ────────────────────────────────────────────────────────────

function loadGISScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if ((window as any).google?.accounts) { resolve(); return; }
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Failed to load GIS script"));
    document.head.appendChild(s);
  });
}

export async function gdriveSignIn(): Promise<string> {
  if (!CLIENT_ID) {
    throw new Error(
      "Google Client ID not configured. Set VITE_GOOGLE_CLIENT_ID in your .env file.",
    );
  }

  await loadGISScript();

  return new Promise((resolve, reject) => {
    const client = (window as any).google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      callback: async (resp: any) => {
        if (resp.error) { reject(new Error(resp.error)); return; }
        const token = resp.access_token as string;

        // Fetch user profile for display name
        try {
          const me = await fetch(
            "https://www.googleapis.com/oauth2/v3/userinfo",
            { headers: { Authorization: `Bearer ${token}` } },
          ).then((r) => r.json());
          saveToken(token, me.name ?? me.email ?? "Google User");
          resolve(me.name ?? me.email ?? "Google User");
        } catch {
          saveToken(token, "Google User");
          resolve("Google User");
        }
      },
    });
    client.requestAccessToken({ prompt: "consent" });
  });
}

// ── Drive REST helpers ────────────────────────────────────────────────────────

async function driveRequest(
  url: string,
  options: RequestInit = {},
): Promise<any> {
  const token = gdriveGetToken();
  if (!token) throw new Error("Not signed in to Google Drive");

  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.headers ?? {}),
    },
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Drive API error ${res.status}: ${txt}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

// ── Root folder ───────────────────────────────────────────────────────────────

async function loadMap(): Promise<DriveMap | null> {
  const r = await dbGet<{ key: string; data: DriveMap }>("meta", MAP_KEY);
  return r?.data ?? null;
}

async function saveMapData(data: DriveMap): Promise<void> {
  await dbPut("meta", { key: MAP_KEY, data });
}

async function getOrCreateRootFolder(): Promise<string> {
  const map = await loadMap();
  if (map?.rootFolderId) return map.rootFolderId;

  // Search for existing folder
  const q = encodeURIComponent(
    `name='${ROOT_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
  );
  const list = await driveRequest(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)`,
  );
  if (list.files?.length > 0) {
    const id = list.files[0].id as string;
    await saveMapData({ rootFolderId: id, idToDriveId: {}, driveIdToId: {} });
    return id;
  }

  // Create new folder
  const folder = await driveRequest("https://www.googleapis.com/drive/v3/files", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: ROOT_FOLDER_NAME,
      mimeType: "application/vnd.google-apps.folder",
    }),
  });
  await saveMapData({ rootFolderId: folder.id, idToDriveId: {}, driveIdToId: {} });
  return folder.id as string;
}

// ── File listing ──────────────────────────────────────────────────────────────

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  parents?: string[];
  modifiedTime: string;
}

export async function gdriveListAll(): Promise<FileNode[]> {
  const rootId = await getOrCreateRootFolder();
  const map = (await loadMap()) ?? { rootFolderId: rootId, idToDriveId: {}, driveIdToId: {} };
  const folderMime = "application/vnd.google-apps.folder";

  const q = encodeURIComponent(
    `trashed=false and (mimeType='text/plain' or mimeType='text/markdown' or mimeType='${folderMime}')`,
  );
  const data = await driveRequest(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType,parents,modifiedTime)&pageSize=1000`,
  );

  const driveFiles: DriveFile[] = data.files ?? [];

  // Build Drive id → our stable id mapping
  const nodes: FileNode[] = [];
  // Map Drive folder id → our node id (start with root)
  const driveToOur = new Map<string, string | null>();
  driveToOur.set(rootId, null); // root maps to parentId null

  // First pass: folders
  for (const f of driveFiles) {
    if (f.mimeType !== folderMime) continue;
    let ourId = map.driveIdToId[f.id];
    if (!ourId) {
      ourId = crypto.randomUUID();
      map.idToDriveId[ourId] = f.id;
      map.driveIdToId[f.id] = ourId;
    }
    driveToOur.set(f.id, ourId);
  }

  // Second pass: build nodes (folders first, then files)
  for (const f of driveFiles) {
    const parentDriveId = f.parents?.[0];
    if (!parentDriveId || !driveToOur.has(parentDriveId)) continue; // outside our tree
    const parentId = driveToOur.get(parentDriveId) ?? null;

    let ourId = map.driveIdToId[f.id];
    if (!ourId) {
      ourId = crypto.randomUUID();
      map.idToDriveId[ourId] = f.id;
      map.driveIdToId[f.id] = ourId;
    }

    nodes.push({
      id: ourId,
      name: f.name,
      type: f.mimeType === folderMime ? "dir" : "file",
      parentId,
      updatedAt: new Date(f.modifiedTime).getTime(),
    });
  }

  await saveMapData(map);
  return nodes;
}

// ── Content operations ────────────────────────────────────────────────────────

async function getDriveId(ourId: string): Promise<string> {
  const map = await loadMap();
  const driveId = map?.idToDriveId[ourId];
  if (!driveId) throw new Error("File not found in Drive map");
  return driveId;
}

export async function gdriveGetContent(id: string): Promise<string> {
  const driveId = await getDriveId(id);
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${driveId}?alt=media`,
    { headers: { Authorization: `Bearer ${gdriveGetToken()}` } },
  );
  if (!res.ok) throw new Error(`Drive read error ${res.status}`);
  return res.text();
}

export async function gdriveSaveContent(id: string, text: string): Promise<void> {
  const driveId = await getDriveId(id);
  await fetch(
    `https://www.googleapis.com/upload/drive/v3/files/${driveId}?uploadType=media`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${gdriveGetToken()}`,
        "Content-Type": "text/plain",
      },
      body: text,
    },
  );
}

export async function gdriveCreateFile(
  parentId: string | null,
  name: string,
): Promise<FileNode> {
  const rootId = await getOrCreateRootFolder();
  const map = (await loadMap())!;
  const drivePId = parentId ? map.idToDriveId[parentId] : rootId;
  if (!drivePId) throw new Error("Parent folder not found in Drive");

  const boundary = "---texflow_boundary---";
  const metadata = JSON.stringify({ name, parents: [drivePId], mimeType: "text/plain" });
  const body = [
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    metadata,
    `--${boundary}`,
    "Content-Type: text/plain",
    "",
    "",
    `--${boundary}--`,
  ].join("\r\n");

  const res = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${gdriveGetToken()}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    },
  );
  const data = await res.json();
  const driveId = data.id as string;
  const ourId = crypto.randomUUID();
  map.idToDriveId[ourId] = driveId;
  map.driveIdToId[driveId] = ourId;
  await saveMapData(map);
  return { id: ourId, name, type: "file", parentId, updatedAt: Date.now() };
}

export async function gdriveCreateDir(
  parentId: string | null,
  name: string,
): Promise<FileNode> {
  const rootId = await getOrCreateRootFolder();
  const map = (await loadMap())!;
  const drivePId = parentId ? map.idToDriveId[parentId] : rootId;
  if (!drivePId) throw new Error("Parent folder not found in Drive");

  const f = await driveRequest("https://www.googleapis.com/drive/v3/files", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: [drivePId],
    }),
  });

  const ourId = crypto.randomUUID();
  map.idToDriveId[ourId] = f.id;
  map.driveIdToId[f.id] = ourId;
  await saveMapData(map);
  return { id: ourId, name, type: "dir", parentId, updatedAt: Date.now() };
}

export async function gdriveDeleteEntry(id: string): Promise<void> {
  const driveId = await getDriveId(id);
  await driveRequest(`https://www.googleapis.com/drive/v3/files/${driveId}`, {
    method: "DELETE",
  });
  const map = await loadMap();
  if (map) {
    delete map.idToDriveId[id];
    delete map.driveIdToId[driveId];
    await saveMapData(map);
  }
}

export async function gdriveRename(id: string, newName: string): Promise<void> {
  const driveId = await getDriveId(id);
  await driveRequest(`https://www.googleapis.com/drive/v3/files/${driveId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: newName }),
  });
}

export async function gdriveClearMap(): Promise<void> {
  await dbDelete("meta", MAP_KEY);
}
