import type { CameraMotion, VisualStyleId, VoiceProfileId } from '../types/studio';

export interface DirectedSceneRaw {
  titleTe: string;
  speaker: string;
  dialogueTe: string;
  captionLines: string[];
  visualPromptEn: string;
  cameraMotion: CameraMotion;
  mood: string;
  voiceDirection: string;
}

export interface StoryboardChunkResponse {
  model: string;
  chunkSummary: string;
  scenes: DirectedSceneRaw[];
}

export interface GenerateImageResponse {
  model: string;
  mimeType: string;
  imageDataUrl: string;
}

export interface GenerateTtsResponse {
  model: string;
  mimeType: string;
  audioDataUrl: string;
  durationSec: number;
}

async function postJson<T>(url: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const msg =
      typeof payload?.error === 'string' && payload.error.trim()
        ? payload.error
        : `Request failed with status ${response.status}`;
    throw new Error(msg);
  }
  return payload as T;
}

export async function directStoryboardChunk(
  params: {
    chunkText: string;
    chunkIndex: number;
    totalChunks: number;
    visualStyle: VisualStyleId;
    voiceProfile: VoiceProfileId;
    previousSceneSummary: string;
    startSceneIndex: number;
  },
  signal?: AbortSignal
): Promise<StoryboardChunkResponse> {
  return postJson<StoryboardChunkResponse>('/api/storyboard/chunk', params, signal);
}

export async function generateSceneArtwork(
  params: {
    prompt: string;
    visualStyle: VisualStyleId;
    mood: string;
  },
  signal?: AbortSignal
): Promise<GenerateImageResponse> {
  return postJson<GenerateImageResponse>('/api/generate-image', params, signal);
}

export async function generateSceneNarration(
  params: {
    text: string;
    voiceProfile: VoiceProfileId;
    voiceDirection: string;
    speaker: string;
    mood: string;
  },
  signal?: AbortSignal
): Promise<GenerateTtsResponse> {
  return postJson<GenerateTtsResponse>('/api/generate-tts', params, signal);
}
