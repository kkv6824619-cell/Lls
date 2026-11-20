/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  Check,
  Cloud,
  CloudOff,
  LogIn,
  LogOut,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import type {
  CaptionStyleId,
  StoryboardScene,
  StudioProject,
} from './types/studio';
import {
  SAMPLE_STORIES,
  buildSampleScenes,
  type SampleStory,
} from './lib/sampleStories';
import {
  computeTimedCaptions,
  createSafeId,
  estimateRuntimeSeconds,
  countWords,
  splitTeluguScriptIntoChunks,
} from './lib/teluguChunker';
import {
  deleteProjectFromCloud,
  listUserProjects,
  loadProjectScenes,
  saveProjectToCloud,
  signInWithGoogle,
  signOutUser,
  subscribeAuth,
} from './lib/firebase';
import {
  cacheSceneMedia,
  deleteLocalDraft,
  getLastActiveProjectId,
  hydrateScenesWithCachedMedia,
  loadLocalDrafts,
  saveLocalDraft,
} from './lib/localDrafts';
import {
  directStoryboardChunk,
  generateSceneArtwork,
  generateSceneNarration,
} from './lib/studioApi';
import { measureAudioDataUrlDuration } from './lib/audioUtils';
import { ScriptEditorView } from './components/ScriptEditorView';
import { StoryboardView } from './components/StoryboardView';
import { CinemaPlayerView } from './components/CinemaPlayerView';
import { ProjectsDrawer } from './components/ProjectsDrawer';

type WorkspaceTab = 'script' | 'storyboard' | 'cinema';

function createInitialSampleProject(): StudioProject {
  const sample = SAMPLE_STORIES[0];
  const projectId = createSafeId('proj');
  const scenes = buildSampleScenes(projectId, sample);
  const totalDurationSec = scenes.reduce((acc, s) => acc + s.durationSec, 0);
  const now = Date.now();
  return {
    id: projectId,
    title: sample.title,
    scriptText: sample.scriptText,
    visualStyle: sample.visualStyle,
    voiceProfile: sample.voiceProfile,
    captionStyle: sample.captionStyle,
    sceneCount: scenes.length,
    totalDurationSec,
    status: 'storyboarded',
    scenes,
    createdAtMs: now,
    updatedAtMs: now,
    source: 'local',
  };
}

function createBlankProject(): StudioProject {
  const now = Date.now();
  return {
    id: createSafeId('proj'),
    title: 'కొత్త కథావాణి చిత్రం',
    scriptText: '',
    visualStyle: 'cinematic-cinema',
    voiceProfile: 'Kore',
    captionStyle: 'cinema-gold',
    sceneCount: 0,
    totalDurationSec: 0,
    status: 'draft',
    scenes: [],
    createdAtMs: now,
    updatedAtMs: now,
    source: 'local',
  };
}

export default function App() {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('script');
  const [cinemaStartIndex, setCinemaStartIndex] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Project state
  const [project, setProject] = useState<StudioProject>(() => {
    const drafts = loadLocalDrafts();
    const lastId = getLastActiveProjectId();
    const found = drafts.find((d) => d.id === lastId) || drafts[0];
    return found || createInitialSampleProject();
  });
  const [localDrafts, setLocalDrafts] = useState<StudioProject[]>(() => loadLocalDrafts());

  // Firebase Auth & Cloud Sync state
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [cloudProjects, setCloudProjects] = useState<StudioProject[]>([]);
  const [isLoadingCloud, setIsLoadingCloud] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showAccountMenu, setShowAccountMenu] = useState(false);
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  // Toast notice
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  // Storyboard directing state
  const [isDirecting, setIsDirecting] = useState(false);
  const [directingProgress, setDirectingProgress] = useState<{
    currentChunk: number;
    totalChunks: number;
    scenesCreated: number;
  } | null>(null);
  const [directingError, setDirectingError] = useState<string | null>(null);
  const directingAbortRef = useRef<AbortController | null>(null);

  // Batch media generation state
  const [isBatchGenerating, setIsBatchGenerating] = useState(false);
  const [batchStatusText, setBatchStatusText] = useState<string | null>(null);
  const batchAbortRef = useRef<AbortController | null>(null);

  const projectRef = useRef(project);
  projectRef.current = project;

  const showNotice = useCallback((kind: 'success' | 'error', text: string) => {
    setNotice({ kind, text });
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 5000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  // Monitor browser online/offline state
  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  // Hydrate initial project scenes from IndexedDB cached artwork & audio
  useEffect(() => {
    let active = true;
    const hydrate = async () => {
      if (project.scenes.length === 0) return;
      const hydrated = await hydrateScenesWithCachedMedia(project.id, project.scenes);
      if (active) {
        setProject((prev) =>
          prev.id === project.id ? { ...prev, scenes: hydrated } : prev
        );
      }
    };
    void hydrate();
    return () => {
      active = false;
    };
    // Run only when switching active project ID
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  // Autosave active project draft to LocalStorage for offline resilience
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const updatedList = saveLocalDraft(project);
      setLocalDrafts(updatedList);
    }, 450);
    return () => window.clearTimeout(timer);
  }, [project]);

  // Subscribe to Firebase Auth
  useEffect(() => {
    const unsubscribe = subscribeAuth((nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
    });
    return unsubscribe;
  }, []);

  // Refresh cloud projects whenever user authenticates
  const refreshCloudProjects = useCallback(async (uid: string) => {
    setIsLoadingCloud(true);
    try {
      const list = await listUserProjects(uid);
      setCloudProjects(list);
    } catch (err) {
      console.error('Failed to load cloud projects:', err);
      showNotice('error', 'Could not load cloud projects. Local offline drafts remain available.');
    } finally {
      setIsLoadingCloud(false);
    }
  }, [showNotice]);

  useEffect(() => {
    if (authReady && user) {
      void refreshCloudProjects(user.uid);
    } else if (authReady && !user) {
      setCloudProjects([]);
    }
  }, [authReady, user, refreshCloudProjects]);

  const updateProject = useCallback((patch: Partial<StudioProject>) => {
    setProject((prev) => {
      const nextScenes = patch.scenes ?? prev.scenes;
      const totalDurationSec = Number(
        nextScenes.reduce((acc, s) => acc + Math.max(2, Number(s.durationSec || 6)), 0).toFixed(2)
      );
      return {
        ...prev,
        ...patch,
        scenes: nextScenes,
        sceneCount: nextScenes.length,
        totalDurationSec,
        updatedAtMs: Date.now(),
      };
    });
  }, []);

  const updateSceneById = useCallback(
    (sceneId: string, updater: (scene: StoryboardScene) => StoryboardScene) => {
      setProject((prev) => {
        const nextScenes = prev.scenes.map((s) => (s.id === sceneId ? updater(s) : s));
        const totalDurationSec = Number(
          nextScenes.reduce((acc, s) => acc + Math.max(2, Number(s.durationSec || 6)), 0).toFixed(2)
        );
        return {
          ...prev,
          scenes: nextScenes,
          sceneCount: nextScenes.length,
          totalDurationSec,
          updatedAtMs: Date.now(),
        };
      });
    },
    []
  );

  // Google Sign-In / Sign-Out
  const handleSignIn = async () => {
    try {
      const signedIn = await signInWithGoogle();
      showNotice('success', `Signed in as ${signedIn.displayName || signedIn.email}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Google Sign-In failed.';
      if (!msg.includes('popup-closed-by-user')) {
        showNotice('error', msg);
      }
    }
  };

  const handleSignOut = async () => {
    setShowAccountMenu(false);
    try {
      await signOutUser();
      showNotice('success', 'Signed out. Your offline local drafts remain saved in this browser.');
    } catch {
      showNotice('error', 'Could not sign out right now.');
    }
  };

  const handleSyncToCloud = async () => {
    if (!user) {
      await handleSignIn();
      return;
    }
    if (!isOnline) {
      showNotice('error', 'You are currently offline. Your draft is safely stored in LocalStorage.');
      return;
    }
    setIsSyncing(true);
    try {
      const current = projectRef.current;
      await saveProjectToCloud(current, user.uid);
      updateProject({ ownerId: user.uid, source: 'cloud' });
      await refreshCloudProjects(user.uid);
      showNotice('success', 'Project & storyboard synced to Firestore.');
    } catch (err) {
      showNotice('error', err instanceof Error ? err.message : 'Cloud sync failed.');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSelectProject = async (selected: StudioProject) => {
    if (selected.source === 'cloud' && user) {
      try {
        const cloudScenes = await loadProjectScenes(selected.id, user.uid);
        const hydrated = await hydrateScenesWithCachedMedia(selected.id, cloudScenes);
        setProject({
          ...selected,
          scenes: hydrated,
          sceneCount: hydrated.length,
        });
        showNotice('success', `Loaded "${selected.title}" from cloud.`);
      } catch (err) {
        showNotice('error', err instanceof Error ? err.message : 'Failed to load cloud scenes.');
      }
    } else {
      const hydrated = await hydrateScenesWithCachedMedia(selected.id, selected.scenes || []);
      setProject({
        ...selected,
        scenes: hydrated,
      });
    }
  };

  const handleDuplicateProject = (target: StudioProject) => {
    const newId = createSafeId('proj');
    const now = Date.now();
    const clonedScenes = (target.scenes || []).map((s, idx) => ({
      ...s,
      id: createSafeId(`scene_${idx + 1}`),
      projectId: newId,
    }));
    const copy: StudioProject = {
      ...target,
      id: newId,
      title: `${target.title} (Copy)`,
      status: clonedScenes.length > 0 ? 'storyboarded' : 'draft',
      scenes: clonedScenes,
      sceneCount: clonedScenes.length,
      createdAtMs: now,
      updatedAtMs: now,
      source: 'local',
    };
    setProject(copy);
    const updated = saveLocalDraft(copy);
    setLocalDrafts(updated);
    showNotice('success', 'Created editable project copy.');
  };

  const handleDeleteProject = async (target: StudioProject) => {
    if (target.source === 'cloud' && user) {
      try {
        await deleteProjectFromCloud(target.id, user.uid);
        await refreshCloudProjects(user.uid);
      } catch (err) {
        showNotice('error', err instanceof Error ? err.message : 'Failed to delete cloud project.');
        return;
      }
    }
    const nextLocal = deleteLocalDraft(target.id);
    setLocalDrafts(nextLocal);
    if (project.id === target.id) {
      setProject(nextLocal[0] || createBlankProject());
    }
    showNotice('success', `Deleted "${target.title}".`);
  };

  const handleLoadSample = (sample: SampleStory) => {
    const nextScenes = buildSampleScenes(project.id, sample);
    updateProject({
      title: sample.title,
      scriptText: sample.scriptText,
      visualStyle: sample.visualStyle,
      voiceProfile: sample.voiceProfile,
      captionStyle: sample.captionStyle,
      scenes: nextScenes,
      status: nextScenes.length > 0 ? 'storyboarded' : 'draft',
    });
    showNotice('success', `Loaded sample story "${sample.title}".`);
  };

  // Multi-Chunk Storyboard Director (gemini-3.8-flash)
  const handleDirectStoryboard = async () => {
    const current = projectRef.current;
    const chunks = splitTeluguScriptIntoChunks(current.scriptText);
    if (chunks.length === 0) return;

    setDirectingError(null);
    setIsDirecting(true);
    setDirectingProgress({ currentChunk: 1, totalChunks: chunks.length, scenesCreated: 0 });

    const controller = new AbortController();
    directingAbortRef.current = controller;

    const allScenes: StoryboardScene[] = [];
    let continuitySummary = '';

    try {
      for (let i = 0; i < chunks.length; i++) {
        if (controller.signal.aborted) break;
        setDirectingProgress({
          currentChunk: i + 1,
          totalChunks: chunks.length,
          scenesCreated: allScenes.length,
        });

        const result = await directStoryboardChunk(
          {
            chunkText: chunks[i],
            chunkIndex: i,
            totalChunks: chunks.length,
            visualStyle: current.visualStyle,
            voiceProfile: current.voiceProfile,
            previousSceneSummary: continuitySummary,
            startSceneIndex: allScenes.length + 1,
          },
          controller.signal
        );

        continuitySummary = result.chunkSummary || continuitySummary;

        for (const raw of result.scenes) {
          const estDur = Math.max(4, estimateRuntimeSeconds(countWords(raw.dialogueTe)));
          const sceneId = createSafeId(`scene_${allScenes.length + 1}`);
          allScenes.push({
            id: sceneId,
            projectId: current.id,
            orderIndex: allScenes.length,
            titleTe: raw.titleTe,
            speaker: raw.speaker,
            dialogueTe: raw.dialogueTe,
            captionLines: raw.captionLines,
            visualPromptEn: raw.visualPromptEn,
            cameraMotion: raw.cameraMotion,
            mood: raw.mood,
            voiceDirection: raw.voiceDirection,
            durationSec: estDur,
            timedCaptions: computeTimedCaptions(raw.captionLines, estDur),
            imageStatus: 'idle',
            audioStatus: 'idle',
          });
        }

        // Stream scenes into state progressively so long scripts show immediate results
        updateProject({
          scenes: [...allScenes],
          status: 'storyboarded',
        });
      }

      if (!controller.signal.aborted && allScenes.length > 0) {
        setActiveTab('storyboard');
        showNotice('success', `Directed ${allScenes.length} cinematic scenes across ${chunks.length} chunk(s).`);
      }
    } catch (err) {
      if ((err as Error)?.name !== 'AbortError') {
        const msg = err instanceof Error ? err.message : 'Storyboard direction failed.';
        setDirectingError(msg);
      }
    } finally {
      setIsDirecting(false);
      setDirectingProgress(null);
      directingAbortRef.current = null;
    }
  };

  // Generate 16:9 Artwork for a Single Scene (gemini-nano-banana-2.1)
  const handleGenerateImage = useCallback(
    async (sceneId: string, signal?: AbortSignal) => {
      const currentProj = projectRef.current;
      const target = currentProj.scenes.find((s) => s.id === sceneId);
      if (!target) return;

      updateSceneById(sceneId, (s) => ({
        ...s,
        imageStatus: 'generating',
        imageError: undefined,
      }));

      try {
        const res = await generateSceneArtwork(
          {
            prompt: target.visualPromptEn,
            visualStyle: currentProj.visualStyle,
            mood: target.mood,
          },
          signal
        );

        await cacheSceneMedia(currentProj.id, sceneId, { imageDataUrl: res.imageDataUrl });

        updateSceneById(sceneId, (s) => ({
          ...s,
          imageDataUrl: res.imageDataUrl,
          imageStatus: 'ready',
          imageError: undefined,
        }));
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') {
          updateSceneById(sceneId, (s) => ({ ...s, imageStatus: s.imageDataUrl ? 'ready' : 'idle' }));
          return;
        }
        const msg = err instanceof Error ? err.message : 'Artwork generation failed.';
        updateSceneById(sceneId, (s) => ({
          ...s,
          imageStatus: 'error',
          imageError: msg,
        }));
      }
    },
    [updateSceneById]
  );

  // Generate Expressive Telugu Narration for a Single Scene (gemini-3.1-flash-tts-preview)
  const handleGenerateAudio = useCallback(
    async (sceneId: string, signal?: AbortSignal) => {
      const currentProj = projectRef.current;
      const target = currentProj.scenes.find((s) => s.id === sceneId);
      if (!target) return;

      updateSceneById(sceneId, (s) => ({
        ...s,
        audioStatus: 'generating',
        audioError: undefined,
      }));

      try {
        const res = await generateSceneNarration(
          {
            text: target.dialogueTe,
            voiceProfile: currentProj.voiceProfile,
            voiceDirection: target.voiceDirection,
            speaker: target.speaker,
            mood: target.mood,
          },
          signal
        );

        // Verify exact browser-decoded audio duration for frame-accurate caption sync
        let exactDuration = res.durationSec;
        try {
          const measured = await measureAudioDataUrlDuration(res.audioDataUrl);
          if (measured > 0.2) exactDuration = measured;
        } catch {
          // Use server WAV-header duration fallback
        }
        const safeDuration = Math.max(2, Number(exactDuration || target.durationSec || 6));

        await cacheSceneMedia(currentProj.id, sceneId, {
          audioDataUrl: res.audioDataUrl,
          durationSec: safeDuration,
        });

        updateSceneById(sceneId, (s) => ({
          ...s,
          audioDataUrl: res.audioDataUrl,
          durationSec: safeDuration,
          timedCaptions: computeTimedCaptions(s.captionLines, safeDuration),
          audioStatus: 'ready',
          audioError: undefined,
        }));
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') {
          updateSceneById(sceneId, (s) => ({ ...s, audioStatus: s.audioDataUrl ? 'ready' : 'idle' }));
          return;
        }
        const msg = err instanceof Error ? err.message : 'Narration synthesis failed.';
        updateSceneById(sceneId, (s) => ({
          ...s,
          audioStatus: 'error',
          audioError: msg,
        }));
      }
    },
    [updateSceneById]
  );

  // Batch generate all missing visuals & narration clips cleanly
  const handleGenerateAllAssets = async () => {
    const scenes = projectRef.current.scenes;
    if (scenes.length === 0 || isBatchGenerating) return;

    const controller = new AbortController();
    batchAbortRef.current = controller;
    setIsBatchGenerating(true);

    try {
      for (let i = 0; i < scenes.length; i++) {
        if (controller.signal.aborted) break;
        const latestScene = projectRef.current.scenes.find((s) => s.id === scenes[i].id);
        if (!latestScene) continue;

        const needsImage = !latestScene.imageDataUrl && !latestScene.staticImagePath;
        const needsAudio = !latestScene.audioDataUrl;

        if (!needsImage && !needsAudio) continue;

        setBatchStatusText(
          `Rendering Scene ${i + 1} of ${scenes.length}: ${
            needsImage && needsAudio
              ? '16:9 artwork & Telugu narration'
              : needsImage
                ? '16:9 artwork'
                : 'Telugu narration'
          }...`
        );

        const jobs: Promise<void>[] = [];
        if (needsImage) jobs.push(handleGenerateImage(latestScene.id, controller.signal));
        if (needsAudio) jobs.push(handleGenerateAudio(latestScene.id, controller.signal));
        await Promise.all(jobs);
      }

      if (!controller.signal.aborted) {
        showNotice('success', 'Batch media rendering pass complete.');
      }
    } finally {
      setIsBatchGenerating(false);
      setBatchStatusText(null);
      batchAbortRef.current = null;
    }
  };

  const handleUploadSceneImage = (sceneId: string, file: File) => {
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!dataUrl) return;
      await cacheSceneMedia(projectRef.current.id, sceneId, { imageDataUrl: dataUrl });
      updateSceneById(sceneId, (s) => ({
        ...s,
        imageDataUrl: dataUrl,
        imageStatus: 'ready',
        imageError: undefined,
      }));
    };
    reader.readAsDataURL(file);
  };

  const handleAddScene = () => {
    const idx = project.scenes.length;
    const newScene: StoryboardScene = {
      id: createSafeId(`scene_${idx + 1}`),
      projectId: project.id,
      orderIndex: idx,
      titleTe: `కొత్త దృశ్యం ${idx + 1}`,
      speaker: 'కథకుడు',
      dialogueTe: 'ఇక్కడ మీ కొత్త దృశ్య సంభాషణ లేదా కథనం రాయండి.',
      captionLines: ['ఇక్కడ మీ కొత్త దృశ్య సంభాషణ లేదా కథనం రాయండి.'],
      visualPromptEn:
        'Cinematic Tollywood widescreen film frame, golden twilight ambiance, rich architectural depth, 35mm film grain',
      cameraMotion: 'zoom-in',
      mood: 'Dramatic',
      voiceDirection: 'Warm, expressive Telugu narration',
      durationSec: 6,
      timedCaptions: computeTimedCaptions(['ఇక్కడ మీ కొత్త దృశ్య సంభాషణ లేదా కథనం రాయండి.'], 6),
      imageStatus: 'idle',
      audioStatus: 'idle',
    };
    updateProject({ scenes: [...project.scenes, newScene], status: 'storyboarded' });
  };

  const handleDuplicateScene = (sceneId: string) => {
    const idx = project.scenes.findIndex((s) => s.id === sceneId);
    if (idx === -1) return;
    const source = project.scenes[idx];
    const copy: StoryboardScene = {
      ...source,
      id: createSafeId('scene'),
      titleTe: `${source.titleTe} (2)`,
    };
    const next = [...project.scenes];
    next.splice(idx + 1, 0, copy);
    updateProject({
      scenes: next.map((s, i) => ({ ...s, orderIndex: i })),
    });
  };

  const handleDeleteScene = (sceneId: string) => {
    const next = project.scenes
      .filter((s) => s.id !== sceneId)
      .map((s, i) => ({ ...s, orderIndex: i }));
    updateProject({ scenes: next });
  };

  const handleMoveScene = (sceneId: string, direction: 'up' | 'down') => {
    const idx = project.scenes.findIndex((s) => s.id === sceneId);
    if (idx === -1) return;
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= project.scenes.length) return;
    const next = [...project.scenes];
    const [moved] = next.splice(idx, 1);
    next.splice(targetIdx, 0, moved);
    updateProject({
      scenes: next.map((s, i) => ({ ...s, orderIndex: i })),
    });
  };

  return (
    <div className="min-h-screen bg-[#09080A] text-[#F5F0E6] flex flex-col">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-40 bg-[#09080A]/95 backdrop-blur-md border-b border-[#2A2431]">
        <div className="max-w-[1440px] mx-auto px-6 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Single-line Brand Wordmark */}
          <button
            type="button"
            onClick={() => setActiveTab('script')}
            className="font-display text-lg font-bold tracking-tight text-[#F5F0E6] hover:text-[#F29F05] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            KathaVani <span className="font-telugu text-[#F29F05] font-semibold">కథావాణి</span>
          </button>

          {/* Zone 2: Clean Single-Line Text Navigation Links */}
          <nav className="flex items-center gap-6 sm:gap-8 text-sm font-medium overflow-x-auto">
            <button
              type="button"
              onClick={() => setActiveTab('script')}
              className={`py-5 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'script'
                  ? 'border-[#F29F05] text-[#F5F0E6]'
                  : 'border-transparent text-[#B5AC9E] hover:text-[#F5F0E6]'
              }`}
            >
              Script
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('storyboard')}
              className={`py-5 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'storyboard'
                  ? 'border-[#F29F05] text-[#F5F0E6]'
                  : 'border-transparent text-[#B5AC9E] hover:text-[#F5F0E6]'
              }`}
            >
              Storyboard{project.scenes.length > 0 ? ` (${project.scenes.length})` : ''}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('cinema')}
              className={`py-5 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'cinema'
                  ? 'border-[#F29F05] text-[#F5F0E6]'
                  : 'border-transparent text-[#B5AC9E] hover:text-[#F5F0E6]'
              }`}
            >
              Cinema
            </button>
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="py-5 border-b-2 border-transparent text-[#B5AC9E] hover:text-[#F5F0E6] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Projects
            </button>
          </nav>

          {/* Zone 3: Single Primary Action (Google Account & Cloud Sync) */}
          <div className="relative shrink-0">
            {user ? (
              <>
                <button
                  type="button"
                  onClick={() => setShowAccountMenu((p) => !p)}
                  className="inline-flex items-center gap-2.5 px-3.5 py-2 rounded-lg bg-[#17141B] border border-[#2A2431] hover:border-[#F29F05]/60 text-xs font-medium text-[#F5F0E6] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {isSyncing ? (
                    <Loader2 className="w-3.5 h-3.5 text-[#F29F05] animate-spin" />
                  ) : isOnline ? (
                    <Cloud className="w-3.5 h-3.5 text-[#F29F05]" />
                  ) : (
                    <CloudOff className="w-3.5 h-3.5 text-[#8D847A]" />
                  )}
                  <span className="max-w-[120px] truncate">
                    {user.displayName || user.email?.split('@')[0] || 'Account'}
                  </span>
                </button>

                {showAccountMenu && (
                  <div className="absolute right-0 mt-2 w-64 rounded-xl bg-[#17141B] border border-[#2A2431] shadow-2xl z-50 py-1.5">
                    <div className="px-4 py-2.5 border-b border-[#2A2431]">
                      <p className="text-xs font-semibold text-[#F5F0E6] truncate">
                        {user.displayName || 'KathaVani Creator'}
                      </p>
                      <p className="text-[11px] text-[#8D847A] truncate">{user.email}</p>
                    </div>
                    <button
                      type="button"
                      disabled={isSyncing || !isOnline}
                      onClick={() => {
                        setShowAccountMenu(false);
                        void handleSyncToCloud();
                      }}
                      className="w-full text-left px-4 py-2.5 text-xs text-[#F5F0E6] hover:bg-[#221D29] disabled:opacity-45 flex items-center gap-2 transition-colors cursor-pointer"
                    >
                      <Cloud className="w-3.5 h-3.5 text-[#F29F05]" />
                      Save Active Project to Cloud
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleSignOut()}
                      className="w-full text-left px-4 py-2.5 text-xs text-[#FCA5A5] hover:bg-[#2B1519] flex items-center gap-2 transition-colors cursor-pointer"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      Sign Out
                    </button>
                  </div>
                )}
              </>
            ) : (
              <button
                type="button"
                onClick={() => void handleSignIn()}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#F29F05] text-[#09080A] text-xs font-semibold hover:bg-[#FBBF24] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <LogIn className="w-3.5 h-3.5" />
                Sign In
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Subtle Offline / Notice Bar */}
      {(!isOnline || notice) && (
        <div className="max-w-[1440px] w-full mx-auto px-6 pt-4 space-y-2">
          {!isOnline && (
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#1A1610] border border-[#4A3918] text-xs text-[#FDE68A]">
              <CloudOff className="w-3.5 h-3.5 shrink-0" />
              <span>Offline mode active — script drafts and edits are saving locally to your browser.</span>
            </div>
          )}
          {notice && (
            <div
              className={`flex items-center justify-between gap-3 px-4 py-2.5 rounded-lg border text-xs ${
                notice.kind === 'error'
                  ? 'bg-[#2B1519] border-[#6E2630] text-[#FCA5A5]'
                  : 'bg-[#171A13] border-[#364A22] text-[#D9F99D]'
              }`}
            >
              <div className="flex items-center gap-2">
                {notice.kind === 'error' ? (
                  <AlertCircle className="w-4 h-4 shrink-0" />
                ) : (
                  <Check className="w-4 h-4 shrink-0" />
                )}
                <span>{notice.text}</span>
              </div>
              <button
                type="button"
                onClick={() => setNotice(null)}
                className="text-current opacity-70 hover:opacity-100 cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          )}
        </div>
      )}

      {/* Main Active Studio Stage */}
      <main className="flex-1">
        {activeTab === 'script' && (
          <ScriptEditorView
            project={project}
            onUpdateProject={updateProject}
            onLoadSample={handleLoadSample}
            onDirectStoryboard={() => void handleDirectStoryboard()}
            onCancelDirecting={() => directingAbortRef.current?.abort()}
            isDirecting={isDirecting}
            directingProgress={directingProgress}
            directingError={directingError}
            onOpenCinema={() => {
              setCinemaStartIndex(0);
              setActiveTab('cinema');
            }}
          />
        )}

        {activeTab === 'storyboard' && (
          <StoryboardView
            project={project}
            onGenerateImage={(sceneId) => void handleGenerateImage(sceneId)}
            onGenerateAudio={(sceneId) => void handleGenerateAudio(sceneId)}
            onGenerateAllAssets={() => void handleGenerateAllAssets()}
            onStopBatch={() => batchAbortRef.current?.abort()}
            isBatchGenerating={isBatchGenerating}
            batchStatusText={batchStatusText}
            onUpdateScene={(updated) => updateSceneById(updated.id, () => updated)}
            onUploadSceneImage={handleUploadSceneImage}
            onAddScene={handleAddScene}
            onDuplicateScene={handleDuplicateScene}
            onDeleteScene={handleDeleteScene}
            onMoveScene={handleMoveScene}
            onGoToScript={() => setActiveTab('script')}
            onOpenCinema={(startIdx = 0) => {
              setCinemaStartIndex(startIdx);
              setActiveTab('cinema');
            }}
          />
        )}

        {activeTab === 'cinema' && (
          <CinemaPlayerView
            project={project}
            initialSceneIndex={cinemaStartIndex}
            onChangeCaptionStyle={(style: CaptionStyleId) =>
              updateProject({ captionStyle: style })
            }
            onBackToStoryboard={() => setActiveTab('storyboard')}
          />
        )}
      </main>

      {/* Quiet Studio Footer */}
      <footer className="border-t border-[#1D1924] mt-12">
        <div className="max-w-[1440px] mx-auto px-6 py-5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#7B7369]">
          <span className="font-telugu">
            KathaVani · కథావాణి Telugu Cinema Studio
          </span>
          <div className="flex items-center gap-4">
            <span>Local drafts auto-saved</span>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              onClick={() => void handleSyncToCloud()}
              className="text-[#B5AC9E] hover:text-[#F29F05] transition-colors cursor-pointer"
            >
              {user ? 'Sync Now to Cloud' : 'Sign In for Cloud Sync'}
            </button>
          </div>
        </div>
      </footer>

      {/* Projects & Cloud Sync Slide-Over Drawer */}
      <ProjectsDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        user={user}
        activeProjectId={project.id}
        cloudProjects={cloudProjects}
        localDrafts={localDrafts}
        isLoadingCloud={isLoadingCloud}
        isSyncing={isSyncing}
        onCreateNew={() => {
          setProject(createBlankProject());
          setActiveTab('script');
        }}
        onSelectProject={(proj) => void handleSelectProject(proj)}
        onSyncCurrentToCloud={() => void handleSyncToCloud()}
        onDuplicateProject={handleDuplicateProject}
        onDeleteProject={(proj) => void handleDeleteProject(proj)}
        onSignIn={() => void handleSignIn()}
      />
    </div>
  );
}
