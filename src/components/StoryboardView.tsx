import React, { useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Clapperboard,
  Copy,
  Edit3,
  Film,
  Image as ImageIcon,
  Loader2,
  Mic,
  Play,
  Plus,
  RefreshCw,
  Square,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  CAMERA_MOTION_LABELS,
  type StoryboardScene,
  type StudioProject,
} from '../types/studio';
import { computeTimedCaptions, formatDuration } from '../lib/teluguChunker';
import { SceneEditModal } from './SceneEditModal';

interface StoryboardViewProps {
  project: StudioProject;
  onGenerateImage: (sceneId: string) => void;
  onGenerateAudio: (sceneId: string) => void;
  onGenerateAllAssets: () => void;
  onStopBatch: () => void;
  isBatchGenerating: boolean;
  batchStatusText: string | null;
  onUpdateScene: (scene: StoryboardScene) => void;
  onUploadSceneImage: (sceneId: string, file: File) => void;
  onAddScene: () => void;
  onDuplicateScene: (sceneId: string) => void;
  onDeleteScene: (sceneId: string) => void;
  onMoveScene: (sceneId: string, direction: 'up' | 'down') => void;
  onGoToScript: () => void;
  onOpenCinema: (startSceneIndex?: number) => void;
}

export function StoryboardView({
  project,
  onGenerateImage,
  onGenerateAudio,
  onGenerateAllAssets,
  onStopBatch,
  isBatchGenerating,
  batchStatusText,
  onUpdateScene,
  onUploadSceneImage,
  onAddScene,
  onDuplicateScene,
  onDeleteScene,
  onMoveScene,
  onGoToScript,
  onOpenCinema,
}: StoryboardViewProps) {
  const [editingScene, setEditingScene] = useState<StoryboardScene | null>(null);
  const uploadRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const scenes = project.scenes;
  const totalSec = scenes.reduce((acc, s) => acc + Math.max(2, Number(s.durationSec || 6)), 0);
  const readyImages = scenes.filter((s) => Boolean(s.imageDataUrl || s.staticImagePath)).length;
  const readyAudio = scenes.filter((s) => Boolean(s.audioDataUrl)).length;
  const isArchived = project.status === 'archived';

  if (scenes.length === 0) {
    return (
      <div className="max-w-[1440px] mx-auto px-6 py-16">
        <div className="max-w-xl mx-auto text-center space-y-5 py-14 px-8 rounded-xl border border-[#2A2431] bg-[#141118]">
          <Clapperboard className="w-10 h-10 text-[#F29F05] mx-auto" />
          <div className="space-y-2">
            <h2 className="font-display text-xl font-semibold text-[#F5F0E6]">No Storyboard Scenes Yet</h2>
            <p className="text-sm text-[#B5AC9E] leading-relaxed">
              Write or load a Telugu script in the Script Editor and click Direct Storyboard to split your
              story into structured scenes with Telugu captions, camera motion, and narration direction.
            </p>
          </div>
          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={onGoToScript}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#F29F05] text-[#09080A] text-sm font-semibold hover:bg-[#FBBF24] transition-colors cursor-pointer"
            >
              Open Script Editor
            </button>
            <button
              type="button"
              disabled={isArchived}
              onClick={onAddScene}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#1F1B24] border border-[#2A2431] text-sm font-medium text-[#F5F0E6] hover:border-[#F29F05]/60 transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Add Manual Scene
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[1440px] mx-auto px-6 py-8 space-y-6">
      {/* Toolbar Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-[#2A2431]">
        <div className="space-y-1">
          <h1 className="font-display text-2xl font-bold text-[#F5F0E6] font-telugu">
            {project.title}
          </h1>
          <div className="flex flex-wrap items-center gap-2 text-xs text-[#B5AC9E] tabular-nums">
            <span>{scenes.length} {scenes.length === 1 ? 'scene' : 'scenes'}</span>
            <span aria-hidden="true" className="text-[#524B5B]">·</span>
            <span>{formatDuration(totalSec)} runtime</span>
            <span aria-hidden="true" className="text-[#524B5B]">·</span>
            <span>{readyImages}/{scenes.length} visuals ready</span>
            <span aria-hidden="true" className="text-[#524B5B]">·</span>
            <span>{readyAudio}/{scenes.length} narrations ready</span>
            <span aria-hidden="true" className="text-[#524B5B]">·</span>
            <span>Voice: {project.voiceProfile}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {isBatchGenerating ? (
            <button
              type="button"
              onClick={onStopBatch}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#2B1519] border border-[#6E2630] text-sm font-semibold text-[#FECACA] hover:bg-[#3A1B21] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Square className="w-3.5 h-3.5" />
              Stop Generation
            </button>
          ) : (
            <button
              type="button"
              disabled={isArchived}
              onClick={onGenerateAllAssets}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#F29F05] text-[#09080A] text-sm font-semibold hover:bg-[#FBBF24] disabled:opacity-45 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Film className="w-4 h-4" />
              Generate All Visuals &amp; Audio
            </button>
          )}

          <button
            type="button"
            disabled={isArchived}
            onClick={onAddScene}
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg bg-[#17141B] border border-[#2A2431] text-sm font-medium text-[#F5F0E6] hover:border-[#F29F05]/60 disabled:opacity-45 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4 text-[#F29F05]" />
            Add Scene
          </button>

          <button
            type="button"
            onClick={() => onOpenCinema(0)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg bg-[#1F1B24] border border-[#342D3D] text-sm font-medium text-[#F5F0E6] hover:border-[#F29F05]/60 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Play className="w-4 h-4 text-[#F29F05]" />
            Play Cinema
          </button>
        </div>
      </div>

      {isBatchGenerating && batchStatusText && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-[#1A1512] border border-[#F29F05]/40 text-sm text-[#FDE68A]">
          <Loader2 className="w-4 h-4 animate-spin text-[#F29F05] shrink-0" />
          <span>{batchStatusText}</span>
        </div>
      )}

      {/* Scenes List */}
      <div className="space-y-5">
        {scenes.map((scene, idx) => {
          const imgSrc = scene.imageDataUrl || scene.staticImagePath;
          const timed =
            scene.timedCaptions && scene.timedCaptions.length > 0
              ? scene.timedCaptions
              : computeTimedCaptions(scene.captionLines, scene.durationSec || 6);

          return (
            <article
              key={scene.id}
              className="rounded-xl border border-[#2A2431] bg-[#141118] overflow-hidden"
            >
              <div className="grid grid-cols-1 lg:grid-cols-[400px_1fr]">
                {/* Left: 16:9 Scene Artwork Frame */}
                <div className="bg-[#0D0B10] border-b lg:border-b-0 lg:border-r border-[#2A2431] flex flex-col justify-between">
                  <div className="relative aspect-video w-full bg-[#110F14] overflow-hidden">
                    {imgSrc ? (
                      <img
                        src={imgSrc}
                        alt={scene.titleTe}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center gap-2 p-6 text-center bg-gradient-to-br from-[#231910] via-[#120F16] to-[#09080A]">
                        <ImageIcon className="w-7 h-7 text-[#F29F05]/60" />
                        <p className="font-telugu text-sm font-medium text-[#F5F0E6]/85 line-clamp-1">
                          {scene.titleTe}
                        </p>
                        <p className="text-xs text-[#8D847A]">16:9 Artwork Not Generated</p>
                      </div>
                    )}

                    {scene.imageStatus === 'generating' && (
                      <div className="absolute inset-0 bg-[#09080A]/80 flex flex-col items-center justify-center gap-2">
                        <Loader2 className="w-6 h-6 text-[#F29F05] animate-spin" />
                        <span className="text-xs font-medium text-[#F5F0E6]">
                          Rendering 16:9 frame...
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Visual Controls Footer */}
                  <div className="p-3.5 space-y-2.5 border-t border-[#2A2431]">
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        disabled={isArchived || scene.imageStatus === 'generating'}
                        onClick={() => onGenerateImage(scene.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1F1B24] border border-[#2F2838] text-xs font-medium text-[#F5F0E6] hover:border-[#F29F05]/60 disabled:opacity-45 transition-colors cursor-pointer"
                      >
                        <RefreshCw
                          className={`w-3.5 h-3.5 text-[#F29F05] ${
                            scene.imageStatus === 'generating' ? 'animate-spin' : ''
                          }`}
                        />
                        {imgSrc ? 'Regenerate Visual' : 'Generate Visual'}
                      </button>

                      <input
                        ref={(el) => {
                          uploadRefs.current[scene.id] = el;
                        }}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) onUploadSceneImage(scene.id, file);
                          e.target.value = '';
                        }}
                      />
                      <button
                        type="button"
                        disabled={isArchived}
                        onClick={() => uploadRefs.current[scene.id]?.click()}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-[#B5AC9E] hover:text-[#F5F0E6] hover:bg-[#1F1B24] transition-colors cursor-pointer"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        Upload Image
                      </button>
                    </div>

                    {scene.imageError && (
                      <div className="flex items-start gap-2 text-xs text-[#FCA5A5] bg-[#2B1519] border border-[#6E2630] rounded-lg p-2.5">
                        <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                        <span className="leading-snug">{scene.imageError}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right: Scene Direction, Telugu Dialogue, Captions & Narration */}
                <div className="p-5 flex flex-col justify-between gap-4">
                  <div className="space-y-3">
                    {/* Header Row */}
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-[#B5AC9E] tabular-nums">
                          <span className="font-semibold text-[#F29F05]">
                            Scene {String(idx + 1).padStart(2, '0')}
                          </span>
                          <span aria-hidden="true" className="text-[#524B5B]">·</span>
                          <span className="font-telugu text-[#F5F0E6]">{scene.speaker}</span>
                          <span aria-hidden="true" className="text-[#524B5B]">·</span>
                          <span>{scene.mood}</span>
                          <span aria-hidden="true" className="text-[#524B5B]">·</span>
                          <span>{CAMERA_MOTION_LABELS[scene.cameraMotion]}</span>
                          <span aria-hidden="true" className="text-[#524B5B]">·</span>
                          <span>{scene.durationSec.toFixed(1)}s</span>
                        </div>
                        <h3 className="font-telugu text-lg font-semibold text-[#F5F0E6]">
                          {scene.titleTe}
                        </h3>
                      </div>

                      {/* Scene Action Icons */}
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => onOpenCinema(idx)}
                          title="Play from this scene"
                          className="p-2 rounded-lg text-[#B5AC9E] hover:text-[#F29F05] hover:bg-[#1F1B24] transition-colors cursor-pointer"
                        >
                          <Play className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          disabled={isArchived}
                          onClick={() => setEditingScene(scene)}
                          title="Edit scene"
                          className="p-2 rounded-lg text-[#B5AC9E] hover:text-[#F5F0E6] hover:bg-[#1F1B24] disabled:opacity-40 transition-colors cursor-pointer"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          disabled={isArchived || idx === 0}
                          onClick={() => onMoveScene(scene.id, 'up')}
                          title="Move scene up"
                          className="p-2 rounded-lg text-[#B5AC9E] hover:text-[#F5F0E6] hover:bg-[#1F1B24] disabled:opacity-30 transition-colors cursor-pointer"
                        >
                          <ArrowUp className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          disabled={isArchived || idx === scenes.length - 1}
                          onClick={() => onMoveScene(scene.id, 'down')}
                          title="Move scene down"
                          className="p-2 rounded-lg text-[#B5AC9E] hover:text-[#F5F0E6] hover:bg-[#1F1B24] disabled:opacity-30 transition-colors cursor-pointer"
                        >
                          <ArrowDown className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          disabled={isArchived}
                          onClick={() => onDuplicateScene(scene.id)}
                          title="Duplicate scene"
                          className="p-2 rounded-lg text-[#B5AC9E] hover:text-[#F5F0E6] hover:bg-[#1F1B24] disabled:opacity-40 transition-colors cursor-pointer"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          disabled={isArchived}
                          onClick={() => onDeleteScene(scene.id)}
                          title="Delete scene"
                          className="p-2 rounded-lg text-[#B5AC9E] hover:text-[#F87171] hover:bg-[#2B1519] disabled:opacity-40 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Telugu Dialogue */}
                    <p className="font-telugu text-[15px] leading-relaxed text-[#F5F0E6]/95">
                      {scene.dialogueTe}
                    </p>

                    {/* Proportionally Timed Captions Breakdown */}
                    <div className="pt-2 border-t border-[#221D29] space-y-1.5">
                      <p className="text-[11px] font-medium text-[#8D847A]">
                        Synced Telugu Captions ({timed.length} {timed.length === 1 ? 'line' : 'lines'})
                      </p>
                      <div className="space-y-1">
                        {timed.map((cap, cIdx) => (
                          <div
                            key={cIdx}
                            className="flex items-baseline gap-3 text-xs leading-relaxed"
                          >
                            <span className="font-mono text-[11px] text-[#7B7369] tabular-nums shrink-0">
                              {cap.startTime.toFixed(1)}s–{cap.endTime.toFixed(1)}s
                            </span>
                            <span className="font-telugu text-[#D4CCC0]">{cap.text}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Visual Prompt & Voice Direction */}
                    <div className="pt-2 border-t border-[#221D29] grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="text-[#7B7369] block mb-0.5">Visual Prompt</span>
                        <p className="text-[#B5AC9E] leading-relaxed line-clamp-2">
                          {scene.visualPromptEn}
                        </p>
                      </div>
                      <div>
                        <span className="text-[#7B7369] block mb-0.5">Voice Direction</span>
                        <p className="text-[#B5AC9E] leading-relaxed line-clamp-2">
                          {scene.voiceDirection}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Narration Audio Bar */}
                  <div className="pt-3 border-t border-[#2A2431] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <button
                        type="button"
                        disabled={isArchived || scene.audioStatus === 'generating'}
                        onClick={() => onGenerateAudio(scene.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1F1B24] border border-[#2F2838] text-xs font-medium text-[#F5F0E6] hover:border-[#F29F05]/60 disabled:opacity-45 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        {scene.audioStatus === 'generating' ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 text-[#F29F05] animate-spin" />
                            Synthesizing Telugu...
                          </>
                        ) : (
                          <>
                            <Mic className="w-3.5 h-3.5 text-[#F29F05]" />
                            {scene.audioDataUrl ? 'Regenerate Narration' : 'Generate Narration'}
                          </>
                        )}
                      </button>

                      {scene.audioDataUrl ? (
                        <audio
                          controls
                          src={scene.audioDataUrl}
                          className="h-8 max-w-xs w-full accent-[#F29F05]"
                        />
                      ) : (
                        <span className="text-xs text-[#7B7369]">
                          No audio yet · plays silently for {scene.durationSec.toFixed(1)}s
                        </span>
                      )}
                    </div>

                    {scene.audioError && (
                      <div className="flex items-center gap-1.5 text-xs text-[#FCA5A5]">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        <span className="line-clamp-1">{scene.audioError}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <SceneEditModal
        scene={editingScene}
        onClose={() => setEditingScene(null)}
        onSave={(updated) => {
          onUpdateScene(updated);
          setEditingScene(null);
        }}
      />
    </div>
  );
}
