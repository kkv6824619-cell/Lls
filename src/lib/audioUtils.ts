/**
 * Decodes a data URL (or fetched audio URL) into a Web Audio API AudioBuffer
 * and returns its exact measured duration in seconds.
 */
export async function decodeAudioUrl(
  audioCtx: BaseAudioContext,
  audioUrl: string
): Promise<AudioBuffer> {
  const res = await fetch(audioUrl);
  const arrayBuffer = await res.arrayBuffer();
  // Safari/Chrome compatibility: copy buffer before decoding
  return audioCtx.decodeAudioData(arrayBuffer.slice(0));
}

export async function measureAudioDataUrlDuration(audioDataUrl: string): Promise<number> {
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioCtx();
  try {
    const buffer = await decodeAudioUrl(ctx, audioDataUrl);
    return Number(buffer.duration.toFixed(3));
  } finally {
    await ctx.close().catch(() => {});
  }
}

export function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.referrerPolicy = 'no-referrer';
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err);
    img.src = src;
  });
}
