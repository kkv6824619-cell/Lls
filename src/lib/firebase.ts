import { initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  getFirestore,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Timestamp,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import type {
  CameraMotion,
  CaptionStyleId,
  ProjectStatus,
  StoryboardScene,
  StudioProject,
  VisualStyleId,
  VoiceProfileId,
} from '../types/studio';
import { computeTimedCaptions } from './teluguChunker';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid ?? null,
      email: auth.currentUser?.email ?? null,
      emailVerified: auth.currentUser?.emailVerified ?? null,
      isAnonymous: auth.currentUser?.isAnonymous ?? null,
      tenantId: auth.currentUser?.tenantId ?? null,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Validate connection to Firestore on startup
export async function testFirestoreConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration (client is offline).');
      return false;
    }
    // Permission denied on /test/connection is expected by default-deny rules and proves server reachability
    return true;
  }
}

void testFirestoreConnection();

export function subscribeAuth(callback: (user: User | null) => void): () => void {
  return onAuthStateChanged(auth, callback);
}

export async function signInWithGoogle(): Promise<User> {
  const credential = await signInWithPopup(auth, googleProvider);
  const user = credential.user;
  await upsertUserProfile(user);
  return user;
}

export async function signOutUser(): Promise<void> {
  await signOut(auth);
}

const VALID_ID_REGEX = /^[a-zA-Z0-9_-]+$/;

function sanitizeId(raw: string, fallbackPrefix: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
  if (cleaned.length >= 1 && VALID_ID_REGEX.test(cleaned)) {
    return cleaned;
  }
  return `${fallbackPrefix}_${Date.now().toString(36)}`;
}

function clampString(val: string, maxLen: number, fallback = 'Untitled'): string {
  const trimmed = (val ?? '').trim();
  if (!trimmed) return fallback.slice(0, maxLen);
  return trimmed.slice(0, maxLen);
}

export async function upsertUserProfile(user: User): Promise<void> {
  const uid = sanitizeId(user.uid, 'user');
  const userPath = `users/${uid}`;
  const ref = doc(db, 'users', uid);

  try {
    const existingSnap = await getDoc(ref);
    const displayName = clampString(user.displayName || 'KathaVani Creator', 120, 'KathaVani Creator');
    const email = clampString(user.email || `${uid}@kathavani.local`, 254, 'creator@kathavani.local');
    const photoURL = (user.photoURL || '').slice(0, 500);

    if (existingSnap.exists()) {
      await updateDoc(ref, {
        displayName,
        email,
        photoURL,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        uid,
        displayName,
        email,
        photoURL,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, userPath);
  }
}

function timestampToMs(ts: unknown): number {
  if (ts && typeof (ts as Timestamp).toMillis === 'function') {
    return (ts as Timestamp).toMillis();
  }
  return Date.now();
}

export async function listUserProjects(ownerId: string): Promise<StudioProject[]> {
  const projectsPath = 'projects';
  try {
    const q = query(
      collection(db, projectsPath),
      where('ownerId', '==', ownerId),
      orderBy('updatedAt', 'desc')
    );
    const snap = await getDocs(q);
    return snap.docs.map((docSnap) => {
      const d = docSnap.data();
      return {
        id: String(d.id || docSnap.id),
        ownerId: String(d.ownerId),
        title: String(d.title || 'Untitled Script'),
        scriptText: String(d.scriptText || ''),
        visualStyle: (d.visualStyle as VisualStyleId) || 'cinematic-cinema',
        voiceProfile: (d.voiceProfile as VoiceProfileId) || 'Kore',
        captionStyle: (d.captionStyle as CaptionStyleId) || 'cinema-gold',
        sceneCount: Number(d.sceneCount || 0),
        totalDurationSec: Number(d.totalDurationSec || 0),
        status: (d.status as ProjectStatus) || 'draft',
        scenes: [],
        createdAtMs: timestampToMs(d.createdAt),
        updatedAtMs: timestampToMs(d.updatedAt),
        source: 'cloud',
      };
    });
  } catch (error) {
    // Fallback without composite index if orderBy triggers index requirement
    const errMsg = error instanceof Error ? error.message : String(error);
    if (errMsg.includes('index')) {
      try {
        const simpleQ = query(collection(db, projectsPath), where('ownerId', '==', ownerId));
        const snap = await getDocs(simpleQ);
        return snap.docs
          .map((docSnap) => {
            const d = docSnap.data();
            return {
              id: String(d.id || docSnap.id),
              ownerId: String(d.ownerId),
              title: String(d.title || 'Untitled Script'),
              scriptText: String(d.scriptText || ''),
              visualStyle: (d.visualStyle as VisualStyleId) || 'cinematic-cinema',
              voiceProfile: (d.voiceProfile as VoiceProfileId) || 'Kore',
              captionStyle: (d.captionStyle as CaptionStyleId) || 'cinema-gold',
              sceneCount: Number(d.sceneCount || 0),
              totalDurationSec: Number(d.totalDurationSec || 0),
              status: (d.status as ProjectStatus) || 'draft',
              scenes: [],
              createdAtMs: timestampToMs(d.createdAt),
              updatedAtMs: timestampToMs(d.updatedAt),
              source: 'cloud' as const,
            };
          })
          .sort((a, b) => b.updatedAtMs - a.updatedAtMs);
      } catch (innerErr) {
        handleFirestoreError(innerErr, OperationType.LIST, projectsPath);
      }
    }
    handleFirestoreError(error, OperationType.LIST, projectsPath);
  }
}

export async function loadProjectScenes(projectId: string, ownerId: string): Promise<StoryboardScene[]> {
  const safeProjId = sanitizeId(projectId, 'proj');
  const scenesPath = `projects/${safeProjId}/scenes`;
  try {
    const q = query(collection(db, scenesPath), where('ownerId', '==', ownerId));
    const snap = await getDocs(q);
    return snap.docs
      .map((docSnap) => {
        const d = docSnap.data();
        const captionLines = Array.isArray(d.captionLines)
          ? d.captionLines.map((c) => String(c))
          : [];
        const durationSec = Number(d.durationSec || 6);
        const staticImagePath = typeof d.staticImagePath === 'string' && d.staticImagePath ? d.staticImagePath : undefined;
        return {
          id: String(d.id || docSnap.id),
          projectId: safeProjId,
          orderIndex: Number(d.orderIndex ?? 0),
          titleTe: String(d.titleTe || 'దృశ్యం'),
          speaker: String(d.speaker || 'కథకుడు'),
          dialogueTe: String(d.dialogueTe || ''),
          captionLines,
          visualPromptEn: String(d.visualPromptEn || ''),
          cameraMotion: (d.cameraMotion as CameraMotion) || 'zoom-in',
          mood: String(d.mood || 'Dramatic'),
          voiceDirection: String(d.voiceDirection || 'Expressive Telugu narration'),
          durationSec,
          staticImagePath,
          imageDataUrl: staticImagePath,
          timedCaptions: computeTimedCaptions(captionLines, durationSec),
          imageStatus: staticImagePath ? ('ready' as const) : ('idle' as const),
          audioStatus: 'idle' as const,
        };
      })
      .sort((a, b) => a.orderIndex - b.orderIndex);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, scenesPath);
  }
}

export async function saveProjectToCloud(project: StudioProject, ownerId: string): Promise<void> {
  const safeProjId = sanitizeId(project.id, 'proj');
  const projectPath = `projects/${safeProjId}`;
  const projectRef = doc(db, 'projects', safeProjId);

  const boundedTitle = clampString(project.title, 200, 'కొత్త కథావాణి చిత్రం');
  const boundedScript = (project.scriptText || '').slice(0, 180000);
  const scenesToSync = project.scenes.slice(0, 300);
  const totalDurationSec = Number(
    scenesToSync.reduce((acc, s) => acc + Math.max(0, Number(s.durationSec || 0)), 0).toFixed(2)
  );
  const computedStatus: ProjectStatus =
    project.status === 'archived'
      ? 'archived'
      : scenesToSync.length > 0
        ? 'storyboarded'
        : 'draft';

  try {
    const existingSnap = await getDoc(projectRef);

    if (existingSnap.exists()) {
      const existingStatus = existingSnap.data()?.status;
      if (existingStatus === 'archived') {
        throw new Error('This project is archived and locked against edits. Duplicate it to make changes.');
      }
      await updateDoc(projectRef, {
        title: boundedTitle,
        scriptText: boundedScript,
        visualStyle: project.visualStyle,
        voiceProfile: project.voiceProfile,
        captionStyle: project.captionStyle,
        sceneCount: scenesToSync.length,
        totalDurationSec: Math.min(36000, totalDurationSec),
        status: computedStatus,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(projectRef, {
        id: safeProjId,
        ownerId,
        title: boundedTitle,
        scriptText: boundedScript,
        visualStyle: project.visualStyle,
        voiceProfile: project.voiceProfile,
        captionStyle: project.captionStyle,
        sceneCount: scenesToSync.length,
        totalDurationSec: Math.min(36000, totalDurationSec),
        status: computedStatus === 'archived' ? 'draft' : computedStatus,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, projectPath);
  }

  // Sync scenes subcollection (metadata only — never base64 blobs!)
  const scenesPath = `projects/${safeProjId}/scenes`;
  try {
    const existingScenesSnap = await getDocs(
      query(collection(db, scenesPath), where('ownerId', '==', ownerId))
    );
    const existingMap = new Map(existingScenesSnap.docs.map((d) => [d.id, d]));
    const nextIds = new Set<string>();

    // Chunk batched writes (<= 400 ops per batch)
    let batch = writeBatch(db);
    let opCount = 0;

    const commitIfFull = async () => {
      if (opCount >= 350) {
        await batch.commit();
        batch = writeBatch(db);
        opCount = 0;
      }
    };

    for (let i = 0; i < scenesToSync.length; i++) {
      const s = scenesToSync[i];
      const safeSceneId = sanitizeId(s.id, `scene_${i + 1}`);
      nextIds.add(safeSceneId);
      const sceneRef = doc(db, scenesPath, safeSceneId);

      const safeCaptions = (s.captionLines || [])
        .map((c) => c.trim().slice(0, 400))
        .filter(Boolean)
        .slice(0, 20);

      const staticImagePath =
        s.staticImagePath && s.staticImagePath.startsWith('/src/assets/')
          ? s.staticImagePath.slice(0, 300)
          : '';

      if (existingMap.has(safeSceneId)) {
        batch.update(sceneRef, {
          orderIndex: i,
          titleTe: clampString(s.titleTe, 300, `దృశ్యం ${i + 1}`),
          speaker: clampString(s.speaker, 120, 'కథకుడు'),
          dialogueTe: clampString(s.dialogueTe, 5000, '...'),
          captionLines: safeCaptions,
          visualPromptEn: clampString(s.visualPromptEn, 2000, 'Cinematic Telugu film still'),
          cameraMotion: s.cameraMotion || 'zoom-in',
          mood: clampString(s.mood, 80, 'Dramatic'),
          voiceDirection: clampString(s.voiceDirection, 300, 'Expressive Telugu narration'),
          durationSec: Math.min(600, Math.max(0, Number(s.durationSec || 6))),
          staticImagePath,
          updatedAt: serverTimestamp(),
        });
      } else {
        batch.set(sceneRef, {
          id: safeSceneId,
          projectId: safeProjId,
          ownerId,
          orderIndex: i,
          titleTe: clampString(s.titleTe, 300, `దృశ్యం ${i + 1}`),
          speaker: clampString(s.speaker, 120, 'కథకుడు'),
          dialogueTe: clampString(s.dialogueTe, 5000, '...'),
          captionLines: safeCaptions,
          visualPromptEn: clampString(s.visualPromptEn, 2000, 'Cinematic Telugu film still'),
          cameraMotion: s.cameraMotion || 'zoom-in',
          mood: clampString(s.mood, 80, 'Dramatic'),
          voiceDirection: clampString(s.voiceDirection, 300, 'Expressive Telugu narration'),
          durationSec: Math.min(600, Math.max(0, Number(s.durationSec || 6))),
          staticImagePath,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      opCount++;
      await commitIfFull();
    }

    // Delete removed scenes
    for (const [oldId, oldSnap] of existingMap.entries()) {
      if (!nextIds.has(oldId)) {
        batch.delete(oldSnap.ref);
        opCount++;
        await commitIfFull();
      }
    }

    if (opCount > 0) {
      await batch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, scenesPath);
  }
}

export async function deleteProjectFromCloud(projectId: string, ownerId: string): Promise<void> {
  const safeProjId = sanitizeId(projectId, 'proj');
  const scenesPath = `projects/${safeProjId}/scenes`;
  const projectPath = `projects/${safeProjId}`;

  // Delete child scenes first while parent still exists (Master Gate requirement)
  try {
    const scenesSnap = await getDocs(
      query(collection(db, scenesPath), where('ownerId', '==', ownerId))
    );
    let batch = writeBatch(db);
    let count = 0;
    for (const d of scenesSnap.docs) {
      batch.delete(d.ref);
      count++;
      if (count >= 350) {
        await batch.commit();
        batch = writeBatch(db);
        count = 0;
      }
    }
    if (count > 0) {
      await batch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, scenesPath);
  }

  try {
    await deleteDoc(doc(db, 'projects', safeProjId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, projectPath);
  }
}
