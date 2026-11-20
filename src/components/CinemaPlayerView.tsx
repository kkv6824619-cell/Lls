import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Download,
  Film,
  Loader2,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Square,
  Volume2,
  VolumeX,
} from 'lucide-react';
import {
  CAPTION_STYLE_OPTIONS,
  type CaptionStyleId,
  type StudioProject,
} from '../types/studio';
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  buildTimelineSegments,
  exportCinemaVideo,
  renderCinemaFrame,
  type ExportProgress,
} from '../lib/canvasRenderer';
import { decodeAudioUrl, loadImageElement } from '../lib/audioUtils';
import { formatDuration } from '../lib/teluguChunker';

interface CinemaPlayerViewProps {
  project: StudioProject;
  initialSceneIndex?: number;
  onChangeCaptionStyle: (style: CaptionStyleId) => void;
  onBackToStoryboard: () => void;
}

export function CinemaPlayerView({
  project,
  initialSceneIndex = 0,
  onChangeCaptionStyle,
  onBackToStoryboard,
}: CinemaPlayerViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  const { segments, totalDurationSec } = useMemo(
    () => buildTimelineSegments(project.scenes),
    [project.scenes]
  );

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTimeSec, setCurrentTimeSec] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportedUrl, setExportedUrl] = useState<{ url: string; filename: string } | null>(null);
  const [imagesReadyTick, setImagesReadyTick] = useState(0);

  const imageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const audioCtxRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const audioBuffersRef = useRef<Map<string, AudioBuffer>>(new Map());
  const activeAudioSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const playStartWallRef = useRef<number>(0);
  const playStartOffsetRef = useRef<number>(0);
  const rafRef = useRef<number>(0);
  const exportAbortRef = useRef<AbortController | null>(null);

  // Jump to requested scene when entering player
  useEffect(() => {
    if (segments.length === 0) return;
    const clampedIdx = Math.max(0, Math.min(segments.length - 1, initialSceneIndex));
    setCurrentTimeSec(segments[clampedIdx].startSec);
  }, [initialSceneIndex, segments]);

  // Preload all scene artwork into canvas Image cache
  useEffect(() => {
    let cancelled = false;
    const loadAll = async () => {
      await Promise.all(
        project.scenes.map(async (scene) => {
          const src = scene.imageDataUrl || scene.staticImagePath;
          if (!src) return;
          const existing = imageCacheRef.current.get(scene.id);
          if (existing && existing.src === src && existing.complete) return;
          try {
            const img = await loadImageElement(src);
            if (!cancelled) {
              imageCacheRef.current.set(scene.id, img);
            }
          } catch {
            // Fallback frame renders gracefully
          }
        })
      );
      if (!cancelled) {
        setImagesReadyTick((t) => t + 1);
      }
    };
    void loadAll();
    return () => {
      cancelled = true;
    };
  }, [project.scenes]);

  // Cleanup object URL on unmount
  useEffect(() => {
    return () => {
      if (exportedUrl?.url) {
        URL.revokeObjectURL(exportedUrl.url);
      }
    };
  }, [exportedUrl]);

  const stopScheduledAudio = useCallback(() => {
    activeAudioSourcesRef.current.forEach((src) => {
      try {
        src.stop();
      } catch {
        // ignore
      }
    });
    activeAudioSourcesRef.current = [];
  }, []);

  const ensureAudioContext = useCallback(async () => {
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      const gain = ctx.createGain();
      gain.gain.value = isMuted ? 0 : 1;
      gain.connect(ctx.destination);
      audioCtxRef.current = ctx;
      gainNodeRef.current = gain;
    }
    if (audioCtxRef.current.state === 'suspended') {
      await audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  }, [isMuted]);

  // Update mute gain live
  useEffect(() => {
    if (gainNodeRef.current && audioCtxRef.current) {
      gainNodeRef.current.gain.setValueAtTime(isMuted ? 0 : 1, audioCtxRef.current.currentTime);
    }
  }, [isMuted]);

  const schedulePlaybackAudioFrom = useCallback(
    async (offsetSec: number) => {
      stopScheduledAudio();
      const ctx = await ensureAudioContext();
      const gain = gainNodeRef.current;
      if (!gain) return;

      // Decode any uncached audio clips
      await Promise.all(
        segments.map(async (seg) => {
          const url = seg.scene.audioDataUrl;
          if (!url) return;
          const cacheKey = `${seg.scene.id}::${url.slice(0, 48)}`;
          if (!audioBuffersRef.current.has(cacheKey)) {
            try {
              const decoded = await decodeAudioUrl(ctx, url);
              audioBuffersRef.current.set(cacheKey, decoded);
            } catch {
              // skip undecodable audio
            }
          }
        })
      );

      const now = ctx.currentTime + 0.03;
      const created: AudioBufferSourceNode[] = [];

      for (const seg of segments) {
        if (seg.endSec <= offsetSec) continue;
        const url = seg.scene.audioDataUrl;
        if (!url) continue;
        const cacheKey = `${seg.scene.id}::${url.slice(0, 48)}`;
        const buffer = audioBuffersRef.current.get(cacheKey);
        if (!buffer) continue;

        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(gain);

        if (offsetSec <= seg.startSec) {
          const delay = seg.startSec - offsetSec;
          source.start(now + delay, 0);
        } else {
          const clipOffset = offsetSec - seg.startSec;
          if (clipOffset < buffer.duration) {
            source.start(now, clipOffset);
          }
        }
        created.push(source);
      }

      activeAudioSourcesRef.current = created;
    },
    [ensureAudioContext, segments, stopScheduledAudio]
  );

  // Draw current frame whenever paused time, caption style, or loaded images change
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    renderCinemaFrame({
      ctx,
      segments,
      currentTimeSec,
      captionStyle: project.captionStyle,
      imageCache: imageCacheRef.current,
      projectTitle: project.title,
    });
  }, [segments, currentTimeSec, project.captionStyle, project.title, imagesReadyTick]);

  // Live 60fps animation loop during playback
  useEffect(() => {
    if (!isPlaying) {
      cancelAnimationFrame(rafRef.current);
      stopScheduledAudio();
      return;
    }

    let cancelled = false;
    const startOffset = currentTimeSec >= totalDurationSec - 0.08 ? 0 : currentTimeSec;
    playStartOffsetRef.current = startOffset;
    playStartWallRef.current = performance.now();

    void schedulePlaybackAudioFrom(startOffset);

    const loop = (now: number) => {
      if (cancelled) return;
      const elapsed = (now - playStartWallRef.current) / 1000;
      const nextTime = Math.min(totalDurationSec, playStartOffsetRef.current + elapsed);
      setCurrentTimeSec(nextTime);

      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (ctx) {
        renderCinemaFrame({
          ctx,
          segments,
          currentTimeSec: nextTime,
          captionStyle: project.captionStyle,
          imageCache: imageCacheRef.current,
          projectTitle: project.title,
        });
      }

      if (nextTime >= totalDurationSec) {
        setIsPlaying(false);
        stopScheduledAudio();
        return;
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      stopScheduledAudio();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, segments, totalDurationSec, project.captionStyle]);

  // Cleanup AudioContext on unmount
  useEffect(() => {
    return () => {
      stopScheduledAudio();
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        void audioCtxRef.current.close().catch(() => {});
      }
      exportAbortRef.current?.abort();
    };
  }, [stopScheduledAudio]);

  const seekTo = useCallback(
    (timeSec: number) => {
      const clamped = Math.max(0, Math.min(totalDurationSec, timeSec));
      setCurrentTimeSec(clamped);
      if (isPlaying) {
        playStartOffsetRef.current = clamped;
        playStartWallRef.current = performance.now();
        void schedulePlaybackAudioFrom(clamped);
      }
    },
    [isPlaying, schedulePlaybackAudioFrom, totalDurationSec]
  );

  const activeSegmentIndex = useMemo(() => {
    if (segments.length === 0) return 0;
    const idx = segments.findIndex(
      (s) => currentTimeSec >= s.startSec && currentTimeSec < s.endSec
    );
    return idx === -1 ? segments.length - 1 : idx;
  }, [segments, currentTimeSec]);

  const activeSegment = segments[activeSegmentIndex];

  const handleScrubPointer = (clientX: number) => {
    const bar = timelineRef.current;
    if (!bar || totalDurationSec <= 0) return;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)));
    seekTo(ratio * totalDurationSec);
  };

  const handleExportVideo = async () => {
    if (isExporting || project.scenes.length === 0) return;
    setIsPlaying(false);
    setExportError(null);
    setIsExporting(true);
    setExportProgress({
      percent: 0,
      currentSceneIndex: 0,
      totalScenes: project.scenes.length,
      elapsedSec: 0,
      totalSec: totalDurationSec,
    });

    if (exportedUrl?.url) {
      URL.revokeObjectURL(exportedUrl.url);
      setExportedUrl(null);
    }

    const controller = new AbortController();
    exportAbortRef.current = controller;

    try {
      const { blob, extension } = await exportCinemaVideo({
        scenes: project.scenes,
        captionStyle: project.captionStyle,
        projectTitle: project.title,
        onProgress: setExportProgress,
        signal: controller.signal,
      });

      const url = URL.createObjectURL(blob);
      const safeSlug =
        project.title
          .replace(/[^\p{L}\p{N}_-]+/gu, '_')
          .replace(/^_+|_+$/g, '')
          .slice(0, 48) || 'kathavani_cinema';
      const filename = `${safeSlug}.${extension}`;

      setExportedUrl({ url, filename });

      // Trigger one-click automatic download
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      if ((err as Error)?.name !== 'AbortError') {
        setExportError(err instanceof Error ? err.message : 'Video export failed.');
      }
    } finally {
      setIsExporting(false);
      exportAbortRef.current = null;
    }
  };

  if (project.scenes.length === 0) {
    return (
      <div className="max-w-[1440px] mx-auto px-6 py-16">
        <div className="max-w-xl mx-auto text-center space-y-5 py-14 px-8 rounded-xl border border-[#2A2431] bg-[#141118]">
          <Film className="w-10 h-10 text-[#F29F05] mx-auto" />
          <div className="space-y-2">
            <h2 className="font-display text-xl font-semibold text-[#F5F0E6]">
              Cinema Stage Ready for Your Storyboard
            </h2>
            <p className="text-sm text-[#B5AC9E]">
              Direct a storyboard first so KathaVani can play your scenes with Ken Burns camera motion,
              synced Telugu narration, and exportable cinema captions.
            </p>
          </div>
          <button
            type="button"
            onClick={onBackToStoryboard}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#F29F05] text-[#09080A] text-sm font-semibold hover:bg-[#FBBF24] transition-colors cursor-pointer"
          >
            Go to Storyboard
          </button>
        </div>
      </div>
    );
  }

  const playheadPercent = totalDurationSec > 0 ? (currentTimeSec / totalDurationSec) * 100 : 0;

  return (
    <div className="max-w-[1440px] mx-auto px-6 py-8 space-y-6">
      {/* Top Cinema Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-[#2A2431]">
        <div>
          <h1 className="font-telugu text-xl font-bold text-[#F5F0E6]">{project.title}</h1>
          <div className="flex flex-wrap items-center gap-2 text-xs text-[#B5AC9E] tabular-nums mt-1">
            <span>
              Scene {String(activeSegmentIndex + 1).padStart(2, '0')} of{' '}
              {String(segments.length).padStart(2, '0')}
            </span>
            <span aria-hidden="true" className="text-[#524B5B]">·</span>
            <span className="font-telugu text-[#F5F0E6]">{activeSegment?.scene.titleTe}</span>
            <span aria-hidden="true" className="text-[#524B5B]">·</span>
            <span>{formatDuration(totalDurationSec)} total</span>
            <span aria-hidden="true" className="text-[#524B5B]">·</span>
            <span>1280×720 HD 16:9</span>
          </div>
        </div>

        {/* Live Caption Style Switcher */}
        <div className="flex items-center gap-1 p-1 rounded-lg bg-[#141118] border border-[#2A2431]">
          {CAPTION_STYLE_OPTIONS.map((style) => {
            const active = project.captionStyle === style.id;
            return (
              <button
                key={style.id}
                type="button"
                onClick={() => onChangeCaptionStyle(style.id)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  active
                    ? 'bg-[#F29F05] text-[#09080A] font-semibold'
                    : 'text-[#B5AC9E] hover:text-[#F5F0E6]'
                }`}
              >
                {style.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Cinema Stage + Side Export & Scene List */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-6 items-start">
        {/* Left: HTML5 Cinema Canvas + Transport + Full Timeline Scrubber */}
        <div className="space-y-4">
          <div className="relative rounded-xl overflow-hidden border border-[#2A2431] bg-[#050406] aspect-video">
            <canvas
              ref={canvasRef}
              width={CANVAS_WIDTH}
              height={CANVAS_HEIGHT}
              onClick={() => setIsPlaying((p) => !p)}
              className="w-full h-full block cursor-pointer"
            />
          </div>

          {/* Transport Controls */}
          <div className="rounded-xl border border-[#2A2431] bg-[#141118] p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const prevIdx = Math.max(0, activeSegmentIndex - 1);
                    seekTo(segments[prevIdx].startSec);
                  }}
                  aria-label="Previous scene"
                  className="p-2.5 rounded-lg bg-[#1F1B24] text-[#F5F0E6] hover:bg-[#2A2431] transition-colors cursor-pointer"
                >
                  <SkipBack className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => setIsPlaying((p) => !p)}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#F29F05] text-[#09080A] text-sm font-semibold hover:bg-[#FBBF24] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {isPlaying ? (
                    <>
                      <Pause className="w-4 h-4" />
                      Pause
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4" />
                      {currentTimeSec >= totalDurationSec - 0.1 ? 'Replay' : 'Play'}
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const nextIdx = Math.min(segments.length - 1, activeSegmentIndex + 1);
                    seekTo(segments[nextIdx].startSec);
                  }}
                  aria-label="Next scene"
                  className="p-2.5 rounded-lg bg-[#1F1B24] text-[#F5F0E6] hover:bg-[#2A2431] transition-colors cursor-pointer"
                >
                  <SkipForward className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => setIsMuted((m) => !m)}
                  aria-label={isMuted ? 'Unmute narration' : 'Mute narration'}
                  className="p-2.5 rounded-lg bg-[#1F1B24] text-[#B5AC9E] hover:text-[#F5F0E6] transition-colors cursor-pointer"
                >
                  {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                </button>
              </div>

              <div className="font-mono text-sm text-[#F5F0E6] tabular-nums">
                {formatDuration(currentTimeSec)}{' '}
                <span className="text-[#7B7369]">/ {formatDuration(totalDurationSec)}</span>
              </div>
            </div>

            {/* Full Interactive Timeline Scrubber */}
            <div className="space-y-2">
              <div
                ref={timelineRef}
                role="slider"
                tabIndex={0}
                aria-label="Cinema Timeline Scrubber"
                aria-valuemin={0}
                aria-valuemax={Math.round(totalDurationSec)}
                aria-valuenow={Math.round(currentTimeSec)}
                onMouseDown={(e) => {
                  handleScrubPointer(e.clientX);
                  const onMove = (moveEvent: MouseEvent) => handleScrubPointer(moveEvent.clientX);
                  const onUp = () => {
                    window.removeEventListener('mousemove', onMove);
                    window.removeEventListener('mouseup', onUp);
                  };
                  window.addEventListener('mousemove', onMove);
                  window.addEventListener('mouseup', onUp);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowRight') seekTo(currentTimeSec + 2);
                  if (e.key === 'ArrowLeft') seekTo(currentTimeSec - 2);
                  if (e.key === ' ') {
                    e.preventDefault();
                    setIsPlaying((p) => !p);
                  }
                }}
                className="relative h-12 rounded-lg bg-[#0D0B10] border border-[#2A2431] overflow-hidden cursor-ew-resize select-none flex"
              >
                {segments.map((seg) => {
                  const widthPct = (seg.durationSec / Math.max(0.1, totalDurationSec)) * 100;
                  const isCurrent = seg.index === activeSegmentIndex;
                  return (
                    <div
                      key={seg.scene.id}
                      style={{ width: `${widthPct}%` }}
                      className={`h-full border-r border-[#2A2431] last:border-r-0 px-2 flex flex-col justify-center overflow-hidden transition-colors ${
                        isCurrent ? 'bg-[#261D11]' : 'bg-[#141118] hover:bg-[#1B1722]'
                      }`}
                    >
                      <span className="text-[11px] font-medium text-[#F5F0E6] truncate">
                        {String(seg.index + 1).padStart(2, '0')} · {seg.scene.titleTe}
                      </span>
                      <span className="text-[10px] text-[#8D847A] tabular-nums truncate">
                        {seg.durationSec.toFixed(1)}s{seg.scene.audioDataUrl ? ' · Audio' : ''}
                      </span>
                    </div>
                  );
                })}

                {/* Playhead Needle */}
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-[#F29F05] pointer-events-none shadow-[0_0_8px_#F29F05]"
                  style={{ left: `${playheadPercent}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right: Video Export & Scene Jump Rail */}
        <aside className="rounded-xl border border-[#2A2431] bg-[#141118] divide-y divide-[#2A2431]">
          {/* Browser Video Export Panel */}
          <div className="p-5 space-y-4">
            <div className="space-y-1">
              <h2 className="font-display text-sm font-semibold text-[#F5F0E6]">
                Browser Video Export
              </h2>
              <p className="text-xs text-[#B5AC9E] leading-relaxed">
                Renders 1280×720 HD video with Ken Burns motion, synced Telugu narration audio, and
                captions directly on your device.
              </p>
            </div>

            {isExporting && exportProgress ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs text-[#FDE68A] tabular-nums">
                  <span className="inline-flex items-center gap-1.5">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-[#F29F05]" />
                    Scene {exportProgress.currentSceneIndex + 1}/{exportProgress.totalScenes}
                  </span>
                  <span>{exportProgress.percent}%</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-[#2A2431] overflow-hidden">
                  <div
                    className="h-full bg-[#F29F05] transition-all duration-200"
                    style={{ width: `${exportProgress.percent}%` }}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => exportAbortRef.current?.abort()}
                  className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-[#2B1519] border border-[#6E2630] text-xs font-semibold text-[#FECACA] hover:bg-[#3A1B21] transition-colors cursor-pointer"
                >
                  <Square className="w-3.5 h-3.5" />
                  Cancel Export
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => void handleExportVideo()}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#F29F05] text-[#09080A] text-sm font-semibold hover:bg-[#FBBF24] transition-colors cursor-pointer"
              >
                <Download className="w-4 h-4" />
                Export &amp; Download Video
              </button>
            )}

            {exportedUrl && !isExporting && (
              <a
                href={exportedUrl.url}
                download={exportedUrl.filename}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-[#1F1B24] border border-[#F29F05]/50 text-xs font-medium text-[#FDE68A] hover:bg-[#2A2431] transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                Download {exportedUrl.filename}
              </a>
            )}

            {exportError && (
              <div className="flex items-start gap-2 text-xs text-[#FCA5A5] bg-[#2B1519] border border-[#6E2630] rounded-lg p-3">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{exportError}</span>
              </div>
            )}
          </div>

          {/* Scene Jump List */}
          <div className="p-5 space-y-3">
            <h3 className="font-display text-xs font-semibold text-[#B5AC9E]">
              Scene Cue Sheet ({segments.length})
            </h3>
            <div className="max-h-[380px] overflow-y-auto space-y-1.5 pr-1">
              {segments.map((seg) => {
                const active = seg.index === activeSegmentIndex;
                return (
                  <button
                    key={seg.scene.id}
                    type="button"
                    onClick={() => seekTo(seg.startSec)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors cursor-pointer ${
                      active
                        ? 'bg-[#221A10] border-[#F29F05] text-[#F5F0E6]'
                        : 'bg-transparent border-transparent hover:bg-[#1B1722] text-[#B5AC9E]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 text-[11px] tabular-nums">
                      <span className={active ? 'text-[#F29F05] font-semibold' : 'text-[#7B7369]'}>
                        {String(seg.index + 1).padStart(2, '0')} · {formatDuration(seg.startSec)}
                      </span>
                      <span className="text-[#7B7369]">{seg.durationSec.toFixed(1)}s</span>
                    </div>
                    <p className="font-telugu text-xs font-medium text-[#F5F0E6] mt-0.5 line-clamp-1">
                      {seg.scene.titleTe}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
