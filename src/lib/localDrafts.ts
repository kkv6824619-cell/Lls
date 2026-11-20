import type { StoryboardScene, StudioProject } from '../types/studio';

const LOCAL_DRAFTS_KEY = 'kathavani_offline_drafts_v1';
const ACTIVE_PROJECT_KEY = 'kathavani_active_project_id_v1';
const MEDIA_DB_NAME = 'kathavani_media_cache_v1';
const MEDIA_STORE_NAME = 'scene_media';

interface StoredSceneMedia {
  key: string; // `${projectId}::${sceneId}`
  imageDataUrl?: string;
  audioDataUrl?: string;
  durationSec?: number;
  updatedAt: number;
}

function stripHeavyMediaForLocalStorage(project: StudioProject): StudioProject {
  return {
    ...project,
    scenes: project.scenes.map((scene) => ({
      ...scene,
      // Keep static sample paths in localStorage; binary data URLs live in IndexedDB
      imageDataUrl: scene.imageDataUrl?.startsWith('data:') ? undefined : scene.imageDataUrl,
      audioDataUrl: undefined,
    })),
  };
}

export function loadLocalDrafts(): StudioProject[] {
  try {
    const raw = localStorage.getItem(LOCAL_DRAFTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveLocalDraft(project: StudioProject): StudioProject[] {
  const existing = loadLocalDrafts();
  const lite = stripHeavyMediaForLocalStorage(project);
  const idx = existing.findIndex((p) => p.id === lite.id);
  const next = idx >= 0 ? existing.map((p, i) => (i === idx ? lite : p)) : [lite, ...existing];
  // Cap local drafts at 20 most recent to stay safely within localStorage quota
  const bounded = next.sort((a, b) => b.updatedAtMs - a.updatedAtMs).slice(0, 20);
  try {
    localStorage.setItem(LOCAL_DRAFTS_KEY, JSON.stringify(bounded));
    localStorage.setItem(ACTIVE_PROJECT_KEY, lite.id);
  } catch (err) {
    console.warn('LocalStorage quota warning:', err);
  }
  return bounded;
}

export function deleteLocalDraft(projectId: string): StudioProject[] {
  const next = loadLocalDrafts().filter((p) => p.id !== projectId);
  try {
    localStorage.setItem(LOCAL_DRAFTS_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
  return next;
}

export function getLastActiveProjectId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_PROJECT_KEY);
  } catch {
    return null;
  }
}

// IndexedDB cache for generated 16:9 images and WAV narration clips
function openMediaDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(MEDIA_DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(MEDIA_STORE_NAME)) {
        db.createObjectStore(MEDIA_STORE_NAME, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function cacheSceneMedia(
  projectId: string,
  sceneId: string,
  media: { imageDataUrl?: string; audioDataUrl?: string; durationSec?: number }
): Promise<void> {
  try {
    const db = await openMediaDb();
    const key = `${projectId}::${sceneId}`;
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(MEDIA_STORE_NAME, 'readwrite');
      const store = tx.objectStore(MEDIA_STORE_NAME);
      const getReq = store.get(key);
      getReq.onsuccess = () => {
        const prev = (getReq.result as StoredSceneMedia | undefined) ?? { key, updatedAt: Date.now() };
        const next: StoredSceneMedia = {
          key,
          imageDataUrl: media.imageDataUrl !== undefined ? media.imageDataUrl : prev.imageDataUrl,
          audioDataUrl: media.audioDataUrl !== undefined ? media.audioDataUrl : prev.audioDataUrl,
          durationSec: media.durationSec !== undefined ? media.durationSec : prev.durationSec,
          updatedAt: Date.now(),
        };
        store.put(next);
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Graceful no-op if IndexedDB is blocked in private iframe
  }
}

export async function hydrateScenesWithCachedMedia(
  projectId: string,
  scenes: StoryboardScene[]
): Promise<StoryboardScene[]> {
  try {
    const db = await openMediaDb();
    const hydrated = await Promise.all(
      scenes.map(async (scene) => {
        const key = `${projectId}::${scene.id}`;
        const cached = await new Promise<StoredSceneMedia | undefined>((resolve) => {
          const tx = db.transaction(MEDIA_STORE_NAME, 'readonly');
          const req = tx.objectStore(MEDIA_STORE_NAME).get(key);
          req.onsuccess = () => resolve(req.result as StoredSceneMedia | undefined);
          req.onerror = () => resolve(undefined);
        });

        const imageDataUrl = cached?.imageDataUrl || scene.imageDataUrl || scene.staticImagePath;
        const audioDataUrl = cached?.audioDataUrl || scene.audioDataUrl;
        const durationSec = cached?.durationSec || scene.durationSec;

        return {
          ...scene,
          imageDataUrl,
          audioDataUrl,
          durationSec,
          imageStatus: imageDataUrl ? ('ready' as const) : scene.imageStatus || ('idle' as const),
          audioStatus: audioDataUrl ? ('ready' as const) : scene.audioStatus || ('idle' as const),
        };
      })
    );
    return hydrated;
  } catch {
    return scenes;
  }
}
