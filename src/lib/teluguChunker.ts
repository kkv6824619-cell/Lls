import type { TimedCaption } from '../types/studio';

export const MAX_SCRIPT_WORDS = 10000;
export const TARGET_CHUNK_WORDS = 650;
const TELUGU_WORDS_PER_MINUTE = 125;

/**
 * Counts words accurately for both Telugu Unicode script and Latin words.
 */
export function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).filter(Boolean).length;
}

/**
 * Estimates narration runtime in seconds from Telugu word count (~125 WPM).
 */
export function estimateRuntimeSeconds(wordCount: number): number {
  if (wordCount <= 0) return 0;
  return Math.max(4, Math.round((wordCount / TELUGU_WORDS_PER_MINUTE) * 60));
}

/**
 * Formats seconds as MM:SS or H:MM:SS with tabular-friendly zero padding.
 */
export function formatDuration(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds));
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/**
 * Splits a Telugu (or bilingual) script along paragraph and sentence boundaries
 * into balanced chunks of roughly ~650 words so Gemini preserves narrative continuity.
 */
export function splitTeluguScriptIntoChunks(
  script: string,
  targetWords = TARGET_CHUNK_WORDS
): string[] {
  const normalized = script.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];

  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let currentParts: string[] = [];
  let currentWords = 0;

  const flush = () => {
    if (currentParts.length > 0) {
      chunks.push(currentParts.join('\n\n'));
      currentParts = [];
      currentWords = 0;
    }
  };

  for (const para of paragraphs) {
    const paraWords = countWords(para);

    if (paraWords <= targetWords) {
      if (currentWords > 0 && currentWords + paraWords > targetWords * 1.15) {
        flush();
      }
      currentParts.push(para);
      currentWords += paraWords;
      continue;
    }

    // Long single paragraph: split gracefully along Telugu/Indic/English sentence boundaries
    flush();
    const sentences = para
      .split(/(?<=[.!?।॥\n])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);

    let sentBuf: string[] = [];
    let sentWords = 0;

    for (const sentence of sentences) {
      const sw = countWords(sentence);
      if (sw > targetWords * 1.2) {
        // Extremely long sentence without punctuation: split by word window
        if (sentBuf.length > 0) {
          chunks.push(sentBuf.join(' '));
          sentBuf = [];
          sentWords = 0;
        }
        const words = sentence.split(/\s+/);
        for (let i = 0; i < words.length; i += targetWords) {
          chunks.push(words.slice(i, i + targetWords).join(' '));
        }
        continue;
      }

      if (sentWords > 0 && sentWords + sw > targetWords) {
        chunks.push(sentBuf.join(' '));
        sentBuf = [];
        sentWords = 0;
      }
      sentBuf.push(sentence);
      sentWords += sw;
    }

    if (sentBuf.length > 0) {
      chunks.push(sentBuf.join(' '));
    }
  }

  flush();
  return chunks;
}

/**
 * Computes proportionally timed Telugu captions from measured audio duration,
 * weighted by visible character length (+ brief natural breathing buffer).
 */
export function computeTimedCaptions(
  captionLines: string[],
  durationSec: number
): TimedCaption[] {
  const cleanLines = captionLines.map((l) => l.trim()).filter(Boolean);
  if (cleanLines.length === 0) return [];
  const totalDur = Math.max(1.5, durationSec);

  const weights = cleanLines.map((line) => Math.max(4, line.replace(/\s+/g, '').length));
  const totalWeight = weights.reduce((acc, w) => acc + w, 0);

  let cursor = 0;
  return cleanLines.map((text, idx) => {
    const share = (weights[idx] / totalWeight) * totalDur;
    const startTime = Number(cursor.toFixed(3));
    const endTime = idx === cleanLines.length - 1 ? Number(totalDur.toFixed(3)) : Number((cursor + share).toFixed(3));
    cursor += share;
    return { text, startTime, endTime };
  });
}

/**
 * Generates a Firestore-rule-safe ID matching ^[a-zA-Z0-9_\-]+$ (<= 128 chars).
 */
export function createSafeId(prefix: string): string {
  const cleanPrefix = prefix.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 20) || 'id';
  const rand = Math.random().toString(36).slice(2, 10);
  return `${cleanPrefix}_${Date.now().toString(36)}_${rand}`;
}
