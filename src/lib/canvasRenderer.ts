import type { CameraMotion, CaptionStyleId, StoryboardScene } from '../types/studio';
import { decodeAudioUrl, loadImageElement } from './audioUtils';
import { computeTimedCaptions } from './teluguChunker';

export const CANVAS_WIDTH = 1280;
export const CANVAS_HEIGHT = 720;

export interface TimelineSegment {
  scene: StoryboardScene;
  index: number;
  startSec: number;
  endSec: number;
  durationSec: number;
}

export function buildTimelineSegments(scenes: StoryboardScene[]): {
  segments: TimelineSegment[];
  totalDurationSec: number;
} {
  let cursor = 0;
  const segments: TimelineSegment[] = scenes.map((scene, index) => {
    const durationSec = Math.max(2, Number(scene.durationSec || 6));
    const startSec = cursor;
    const endSec = cursor + durationSec;
    cursor = endSec;
    return { scene, index, startSec, endSec, durationSec };
  });
  return { segments, totalDurationSec: cursor };
}

function easeInOutSine(t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  return -(Math.cos(Math.PI * clamped) - 1) / 2;
}

function drawKenBurnsImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  motion: CameraMotion,
  progress: number,
  alpha = 1
) {
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  const eased = easeInOutSine(progress);

  // Base cover scale so image fills 16:9 canvas with overscan room for smooth motion
  const imgRatio = img.naturalWidth / Math.max(1, img.naturalHeight);
  const canvasRatio = width / height;
  let baseW = width;
  let baseH = height;
  if (imgRatio > canvasRatio) {
    baseH = height;
    baseW = height * imgRatio;
  } else {
    baseW = width;
    baseH = width / imgRatio;
  }

  let scale = 1.12;
  let offsetX = 0;
  let offsetY = 0;

  switch (motion) {
    case 'zoom-in':
      scale = 1.03 + 0.14 * eased;
      break;
    case 'zoom-out':
      scale = 1.17 - 0.14 * eased;
      break;
    case 'pan-left':
      scale = 1.16;
      offsetX = (0.5 - eased) * width * 0.11;
      break;
    case 'pan-right':
      scale = 1.16;
      offsetX = (eased - 0.5) * width * 0.11;
      break;
    case 'pan-up':
      scale = 1.16;
      offsetY = (0.5 - eased) * height * 0.1;
      break;
    case 'pan-down':
      scale = 1.16;
      offsetY = (eased - 0.5) * height * 0.1;
      break;
    default:
      scale = 1.04 + 0.12 * eased;
  }

  const drawW = baseW * scale;
  const drawH = baseH * scale;
  const x = (width - drawW) / 2 + offsetX;
  const y = (height - drawH) / 2 + offsetY;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.drawImage(img, x, y, drawW, drawH);
  ctx.restore();
}

function drawFallbackBackdrop(
  ctx: CanvasRenderingContext2D,
  scene: StoryboardScene,
  progress: number,
  alpha = 1
) {
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  ctx.save();
  ctx.globalAlpha = alpha;

  const grad = ctx.createRadialGradient(
    width * (0.45 + 0.1 * progress),
    height * 0.35,
    40,
    width * 0.5,
    height * 0.5,
    width * 0.75
  );
  grad.addColorStop(0, '#2A1D12');
  grad.addColorStop(0.55, '#130F17');
  grad.addColorStop(1, '#09080A');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  // Subtle architectural cinema framing lines
  ctx.strokeStyle = 'rgba(242, 159, 5, 0.22)';
  ctx.lineWidth = 1;
  ctx.strokeRect(48, 48, width - 96, height - 96);

  // Telugu Scene Title centered gently when artwork is pending
  ctx.fillStyle = 'rgba(245, 240, 230, 0.85)';
  ctx.font = '600 34px "Noto Sans Telugu", "Space Grotesk", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(scene.titleTe, width / 2, height * 0.42);

  ctx.fillStyle = 'rgba(242, 159, 5, 0.75)';
  ctx.font = '500 16px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(`${scene.mood} · Artwork Pending`, width / 2, height * 0.5);

  ctx.restore();
}

function wrapTeluguText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const lines: string[] = [];
  let current = words[0];

  for (let i = 1; i < words.length; i++) {
    const candidate = `${current} ${words[i]}`;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
    } else {
      lines.push(current);
      current = words[i];
    }
  }
  lines.push(current);
  return lines.slice(0, 3);
}

function getActiveCaption(scene: StoryboardScene, localTimeSec: number): string {
  const timed =
    scene.timedCaptions && scene.timedCaptions.length > 0
      ? scene.timedCaptions
      : computeTimedCaptions(
          scene.captionLines.length > 0 ? scene.captionLines : [scene.dialogueTe],
          Math.max(2, scene.durationSec || 6)
        );

  if (timed.length === 0) return scene.dialogueTe;
  const found = timed.find((c) => localTimeSec >= c.startTime && localTimeSec <= c.endTime);
  if (found) return found.text;
  if (localTimeSec < timed[0].startTime) return timed[0].text;
  return timed[timed.length - 1].text;
}

function drawCaptionOverlay(
  ctx: CanvasRenderingContext2D,
  scene: StoryboardScene,
  localTimeSec: number,
  captionStyle: CaptionStyleId
) {
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  const captionText = getActiveCaption(scene, localTimeSec);
  if (!captionText) return;

  ctx.save();

  // Measured bottom contrast scrim for WCAG AA legibility across all luminance frames
  const scrimGrad = ctx.createLinearGradient(0, height * 0.62, 0, height);
  scrimGrad.addColorStop(0, 'rgba(9, 8, 10, 0)');
  scrimGrad.addColorStop(0.45, 'rgba(9, 8, 10, 0.58)');
  scrimGrad.addColorStop(1, 'rgba(9, 8, 10, 0.92)');
  ctx.fillStyle = scrimGrad;
  ctx.fillRect(0, height * 0.62, width, height * 0.38);

  const fontSize = captionStyle === 'bold-highlight' ? 32 : 30;
  ctx.font = `600 ${fontSize}px "Noto Sans Telugu", "Plus Jakarta Sans", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const maxLineWidth = width * 0.82;
  const lines = wrapTeluguText(ctx, captionText, maxLineWidth);
  const lineHeight = fontSize * 1.48;
  const totalTextHeight = lines.length * lineHeight;

  const hasSpeaker = Boolean(scene.speaker && scene.speaker.trim());
  const blockBottomY = height - 42;
  const startY = blockBottomY - totalTextHeight + lineHeight / 2;

  if (captionStyle === 'cinema-gold') {
    if (hasSpeaker) {
      ctx.font = '600 17px "Noto Sans Telugu", "Space Grotesk", sans-serif';
      ctx.fillStyle = '#F5B041';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
      ctx.shadowBlur = 8;
      ctx.fillText(scene.speaker, width / 2, startY - lineHeight * 0.72);
    }

    // Hairline gold accent beneath speaker / above caption
    ctx.strokeStyle = 'rgba(242, 159, 5, 0.5)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(width / 2 - 48, startY - lineHeight * 0.42);
    ctx.lineTo(width / 2 + 48, startY - lineHeight * 0.42);
    ctx.stroke();

    ctx.font = `600 ${fontSize}px "Noto Sans Telugu", sans-serif`;
    ctx.fillStyle = '#F8F2E4';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.95)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 2;

    lines.forEach((line, idx) => {
      ctx.fillText(line, width / 2, startY + idx * lineHeight);
    });
  } else if (captionStyle === 'clean-subtitle') {
    const widest = Math.max(...lines.map((l) => ctx.measureText(l).width), 220);
    const padX = 28;
    const padY = 14;
    const boxW = Math.min(width - 80, widest + padX * 2);
    const boxH = totalTextHeight + padY * 2;
    const boxX = (width - boxW) / 2;
    const boxY = blockBottomY - totalTextHeight - padY;

    ctx.fillStyle = 'rgba(9, 8, 10, 0.78)';
    ctx.beginPath();
    ctx.roundRect(boxX, boxY, boxW, boxH, 8);
    ctx.fill();

    ctx.fillStyle = '#FFFFFF';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
    ctx.shadowBlur = 4;
    lines.forEach((line, idx) => {
      ctx.fillText(line, width / 2, startY + idx * lineHeight);
    });
  } else {
    // bold-highlight
    if (hasSpeaker) {
      ctx.font = '700 16px "Noto Sans Telugu", "Space Grotesk", sans-serif';
      ctx.fillStyle = '#F5F0E6';
      ctx.shadowColor = 'rgba(0,0,0,0.9)';
      ctx.shadowBlur = 6;
      ctx.fillText(scene.speaker, width / 2, startY - lineHeight * 0.78);
    }

    ctx.font = `700 ${fontSize}px "Noto Sans Telugu", sans-serif`;
    lines.forEach((line, idx) => {
      const y = startY + idx * lineHeight;
      const tw = ctx.measureText(line).width;
      const pillW = Math.min(width - 96, tw + 34);
      const pillH = lineHeight - 6;

      ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
      ctx.shadowBlur = 10;
      ctx.fillStyle = '#F29F05';
      ctx.beginPath();
      ctx.roundRect((width - pillW) / 2, y - pillH / 2, pillW, pillH, 6);
      ctx.fill();

      ctx.shadowBlur = 0;
      ctx.fillStyle = '#09080A';
      ctx.fillText(line, width / 2, y + 1);
    });
  }

  ctx.restore();
}

export function renderCinemaFrame(params: {
  ctx: CanvasRenderingContext2D;
  segments: TimelineSegment[];
  currentTimeSec: number;
  captionStyle: CaptionStyleId;
  imageCache: Map<string, HTMLImageElement>;
  projectTitle?: string;
}) {
  const { ctx, segments, currentTimeSec, captionStyle, imageCache } = params;
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#09080A';
  ctx.fillRect(0, 0, width, height);

  if (segments.length === 0) return;

  const totalDur = segments[segments.length - 1].endSec;
  const clampedTime = Math.max(0, Math.min(totalDur, currentTimeSec));

  let activeIdx = segments.findIndex(
    (seg) => clampedTime >= seg.startSec && clampedTime < seg.endSec
  );
  if (activeIdx === -1) activeIdx = segments.length - 1;

  const seg = segments[activeIdx];
  const localTime = Math.max(0, clampedTime - seg.startSec);
  const progress = seg.durationSec > 0 ? Math.min(1, localTime / seg.durationSec) : 0;

  const img = imageCache.get(seg.scene.id);
  if (img && img.complete && img.naturalWidth > 0) {
    drawKenBurnsImage(ctx, img, seg.scene.cameraMotion, progress, 1);
  } else {
    drawFallbackBackdrop(ctx, seg.scene, progress, 1);
  }

  // Smooth 0.45s crossfade from previous clip at scene boundary
  const crossfadeDur = 0.45;
  if (activeIdx > 0 && localTime < crossfadeDur) {
    const prevSeg = segments[activeIdx - 1];
    const prevAlpha = 1 - localTime / crossfadeDur;
    const prevImg = imageCache.get(prevSeg.scene.id);
    if (prevImg && prevImg.complete && prevImg.naturalWidth > 0) {
      drawKenBurnsImage(ctx, prevImg, prevSeg.scene.cameraMotion, 1, prevAlpha);
    } else {
      drawFallbackBackdrop(ctx, prevSeg.scene, 1, prevAlpha);
    }
  }

  // Subtle cinema vignette
  const vig = ctx.createRadialGradient(
    width / 2,
    height / 2,
    width * 0.34,
    width / 2,
    height / 2,
    width * 0.72
  );
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(9,8,10,0.48)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, width, height);

  // Subtle top-left Telugu scene index & title watermark-free cinema slate
  ctx.save();
  ctx.fillStyle = 'rgba(245, 240, 230, 0.72)';
  ctx.font = '500 15px "Noto Sans Telugu", "Space Grotesk", sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
  ctx.shadowBlur = 6;
  ctx.fillText(
    `${String(activeIdx + 1).padStart(2, '0')} · ${seg.scene.titleTe}`,
    36,
    28
  );
  ctx.restore();

  // Live synced Telugu captions
  drawCaptionOverlay(ctx, seg.scene, localTime, captionStyle);
}

export interface ExportProgress {
  percent: number;
  currentSceneIndex: number;
  totalScenes: number;
  elapsedSec: number;
  totalSec: number;
}

/**
 * Exports the entire storyboard to a downloadable video file directly in the browser
 * using an offscreen 1280x720 <canvas> + Web Audio API MediaStreamAudioDestinationNode + MediaRecorder.
 */
export async function exportCinemaVideo(params: {
  scenes: StoryboardScene[];
  captionStyle: CaptionStyleId;
  projectTitle: string;
  onProgress: (p: ExportProgress) => void;
  signal: AbortSignal;
}): Promise<{ blob: Blob; extension: string }> {
  const { scenes, captionStyle, projectTitle, onProgress, signal } = params;
  if (scenes.length === 0) {
    throw new Error('Add at least one scene before exporting video.');
  }

  // Ensure Telugu fonts are loaded before rendering to canvas
  if (document.fonts && document.fonts.ready) {
    await document.fonts.ready;
  }

  const { segments, totalDurationSec } = buildTimelineSegments(scenes);
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context is unavailable in this browser.');

  // Preload all available scene images
  const imageCache = new Map<string, HTMLImageElement>();
  await Promise.all(
    scenes.map(async (scene) => {
      const src = scene.imageDataUrl || scene.staticImagePath;
      if (!src) return;
      try {
        const img = await loadImageElement(src);
        imageCache.set(scene.id, img);
      } catch {
        // Fallback backdrop handles missing images cleanly
      }
    })
  );

  if (signal.aborted) {
    throw new DOMException('Export cancelled', 'AbortError');
  }

  // Set up Web Audio API mixer for narration tracks
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const audioCtx = new AudioCtx();
  if (audioCtx.state === 'suspended') {
    await audioCtx.resume();
  }
  const dest = audioCtx.createMediaStreamDestination();

  // Decode all audio clips upfront so timeline scheduling is sample-accurate
  const decodedAudio = new Map<string, AudioBuffer>();
  await Promise.all(
    scenes.map(async (scene) => {
      if (!scene.audioDataUrl) return;
      try {
        const buf = await decodeAudioUrl(audioCtx, scene.audioDataUrl);
        decodedAudio.set(scene.id, buf);
      } catch (err) {
        console.warn(`Could not decode audio for scene ${scene.id}:`, err);
      }
    })
  );

  // Add silent oscillator gain (0.0001) so audio track stays active even during silent scenes
  const keepAliveOsc = audioCtx.createOscillator();
  const keepAliveGain = audioCtx.createGain();
  keepAliveGain.gain.value = 0.00001;
  keepAliveOsc.connect(keepAliveGain);
  keepAliveGain.connect(dest);
  keepAliveOsc.start();

  const canvasStream = canvas.captureStream(30);
  const combinedStream = new MediaStream([
    ...canvasStream.getVideoTracks(),
    ...dest.stream.getAudioTracks(),
  ]);

  const mimeCandidates = [
    { mime: 'video/webm;codecs=vp9,opus', ext: 'webm' },
    { mime: 'video/webm;codecs=vp8,opus', ext: 'webm' },
    { mime: 'video/webm', ext: 'webm' },
    { mime: 'video/mp4', ext: 'mp4' },
  ];
  const chosen =
    mimeCandidates.find((c) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c.mime)) ||
    { mime: '', ext: 'webm' };

  const recorder = chosen.mime
    ? new MediaRecorder(combinedStream, {
        mimeType: chosen.mime,
        videoBitsPerSecond: 4_500_000,
      })
    : new MediaRecorder(combinedStream);

  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (ev) => {
    if (ev.data && ev.data.size > 0) {
      chunks.push(ev.data);
    }
  };

  const activeSources: AudioBufferSourceNode[] = [];
  const startAudioTime = audioCtx.currentTime + 0.08;

  // Schedule each scene's narration audio at its exact timeline offset
  for (const seg of segments) {
    const buf = decodedAudio.get(seg.scene.id);
    if (buf) {
      const source = audioCtx.createBufferSource();
      source.buffer = buf;
      source.connect(dest);
      source.start(startAudioTime + seg.startSec);
      activeSources.push(source);
    }
  }

  return new Promise<{ blob: Blob; extension: string }>((resolve, reject) => {
    let rafId = 0;
    let finished = false;

    const cleanup = () => {
      cancelAnimationFrame(rafId);
      activeSources.forEach((s) => {
        try {
          s.stop();
        } catch {
          // ignore
        }
      });
      try {
        keepAliveOsc.stop();
      } catch {
        // ignore
      }
      void audioCtx.close().catch(() => {});
    };

    const onAbort = () => {
      if (finished) return;
      finished = true;
      if (recorder.state !== 'inactive') {
        try {
          recorder.stop();
        } catch {
          // ignore
        }
      }
      cleanup();
      reject(new DOMException('Export cancelled', 'AbortError'));
    };

    signal.addEventListener('abort', onAbort, { once: true });

    recorder.onerror = (ev) => {
      if (finished) return;
      finished = true;
      signal.removeEventListener('abort', onAbort);
      cleanup();
      reject(new Error(`MediaRecorder error: ${String((ev as unknown as { error?: Error })?.error?.message || 'Unknown recording failure')}`));
    };

    recorder.onstop = () => {
      if (finished) return;
      finished = true;
      signal.removeEventListener('abort', onAbort);
      cleanup();
      const blob = new Blob(chunks, { type: chosen.mime || 'video/webm' });
      resolve({ blob, extension: chosen.ext });
    };

    recorder.start(250);
    const wallStart = performance.now() + 80;

    const tick = (now: number) => {
      if (finished) return;
      const elapsedSec = Math.max(0, (now - wallStart) / 1000);
      renderCinemaFrame({
        ctx,
        segments,
        currentTimeSec: Math.min(totalDurationSec, elapsedSec),
        captionStyle,
        imageCache,
        projectTitle,
      });

      const activeIdx = Math.max(
        0,
        segments.findIndex((s) => elapsedSec >= s.startSec && elapsedSec < s.endSec)
      );

      onProgress({
        percent: Math.min(99, Math.round((elapsedSec / Math.max(0.1, totalDurationSec)) * 100)),
        currentSceneIndex: activeIdx === -1 ? segments.length - 1 : activeIdx,
        totalScenes: segments.length,
        elapsedSec: Math.min(totalDurationSec, elapsedSec),
        totalSec: totalDurationSec,
      });

      if (elapsedSec >= totalDurationSec + 0.15) {
        onProgress({
          percent: 100,
          currentSceneIndex: segments.length - 1,
          totalScenes: segments.length,
          elapsedSec: totalDurationSec,
          totalSec: totalDurationSec,
        });
        if (recorder.state !== 'inactive') {
          recorder.stop();
        }
        return;
      }

      rafId = requestAnimationFrame(tick);
    };

    // Draw initial frame immediately
    renderCinemaFrame({
      ctx,
      segments,
      currentTimeSec: 0,
      captionStyle,
      imageCache,
      projectTitle,
    });
    rafId = requestAnimationFrame(tick);
  });
}
