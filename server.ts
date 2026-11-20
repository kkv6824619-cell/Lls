import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';

function getGenAI(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error(
      'GEMINI_API_KEY is not configured. Please add your Gemini API key in the Settings > Secrets panel.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function getErrorStatus(err: unknown): number {
  const e = err as { status?: number; code?: number; message?: string };
  if (typeof e?.status === 'number') return e.status;
  if (typeof e?.code === 'number') return e.code;
  const msg = String(e?.message ?? '');
  if (msg.includes('404') || msg.includes('NOT_FOUND')) return 404;
  if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) return 429;
  if (msg.includes('403') || msg.includes('PERMISSION_DENIED')) return 403;
  if (msg.includes('400') || msg.includes('INVALID_ARGUMENT') || msg.includes('API_KEY_INVALID')) return 400;
  return 500;
}

function formatUpstreamError(err: unknown, modelName: string): { status: number; message: string } {
  const status = getErrorStatus(err);
  const raw = err instanceof Error ? err.message : String(err);

  if (status === 429 || raw.includes('RESOURCE_EXHAUSTED')) {
    return {
      status: 429,
      message:
        modelName === 'gemini-nano-banana-2.1'
          ? 'Quota exceeded or billing-enabled API key required for gemini-nano-banana-2.1. Select a paid Gemini API key in Settings > Secrets, or upload custom scene artwork.'
          : `Rate limit reached for ${modelName}. Please wait a moment and retry, or upgrade your API key in Settings > Secrets.`,
    };
  }
  if (status === 403 || raw.includes('PERMISSION_DENIED') || raw.includes('API_KEY_INVALID')) {
    return {
      status: 403,
      message: `API key permission error for ${modelName}. Please verify your Gemini API key in Settings > Secrets.`,
    };
  }
  return { status, message: raw || `Request failed for ${modelName}` };
}

/**
 * Inspects returned audio bytes:
 * - If already a RIFF/WAVE file, measures exact duration from WAV headers.
 * - If headerless raw PCM (24kHz, mono, 16-bit LE), wraps in a 44-byte RIFF WAV header and measures duration.
 */
function ensureWavAndDuration(rawBuffer: Buffer, sampleRate = 24000): { wavBuffer: Buffer; durationSec: number } {
  const isRiff =
    rawBuffer.length >= 44 &&
    rawBuffer.toString('ascii', 0, 4) === 'RIFF' &&
    rawBuffer.toString('ascii', 8, 12) === 'WAVE';

  if (isRiff) {
    // Parse fmt and data chunks accurately
    let byteRate = sampleRate * 2;
    let dataSize = rawBuffer.length - 44;
    let offset = 12;
    while (offset + 8 <= rawBuffer.length) {
      const chunkId = rawBuffer.toString('ascii', offset, offset + 4);
      const chunkSize = rawBuffer.readUInt32LE(offset + 4);
      if (chunkId === 'fmt ' && offset + 8 + 16 <= rawBuffer.length) {
        byteRate = rawBuffer.readUInt32LE(offset + 16) || byteRate;
      } else if (chunkId === 'data') {
        dataSize = chunkSize;
        break;
      }
      offset += 8 + chunkSize + (chunkSize % 2);
    }
    const durationSec = byteRate > 0 ? Number((dataSize / byteRate).toFixed(3)) : 0;
    return { wavBuffer: rawBuffer, durationSec };
  }

  // Raw 16-bit mono PCM -> prepend 44-byte RIFF WAV header
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = rawBuffer.length;

  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16); // PCM subchunk size
  header.writeUInt16LE(1, 20); // PCM format
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(dataSize, 40);

  const wavBuffer = Buffer.concat([header, rawBuffer]);
  const durationSec = Number((dataSize / byteRate).toFixed(3));
  return { wavBuffer, durationSec };
}

const STYLE_DIRECTIVES: Record<string, string> = {
  'cinematic-cinema':
    'Grand Tollywood cinema 35mm anamorphic film still, dramatic golden-hour and tungsten lighting, rich film grain, authentic South Indian architectural textures, expressive framing, shallow depth of field',
  'mythological-epic':
    'Monumental Indian mythological cinema epic still, carved sandstone temples, glowing saffron brass oil lamps, dramatic storm-lit skies, intricate traditional regalia, sweeping divine atmosphere',
  'illustrated-tale':
    'Hand-painted editorial storybook illustration inspired by classic Indian miniature and modern concept art, warm ochre, saffron gold, and deep indigo brushstrokes, rich painterly texture',
  'noir-thriller':
    'Moody South Indian neo-noir thriller film still, rain-slicked midnight streets, stark chiaroscuro tungsten shadows, wet cobblestone reflections, tense atmospheric mystery',
  'stylized-anime':
    'High-budget theatrical anime cinema background and character framing, vivid twilight lighting, crisp cel-shaded silhouettes, dramatic wind and atmospheric depth, Indian cultural setting',
};

const STORYBOARD_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    chunkSummary: {
      type: Type.STRING,
      description: 'One concise English sentence summarizing continuity at the end of this chunk for the next chunk.',
    },
    scenes: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          titleTe: {
            type: Type.STRING,
            description: 'Short cinematic Telugu scene title (3 to 8 Telugu words).',
          },
          speaker: {
            type: Type.STRING,
            description: 'Speaker name in Telugu or English (use "కథకుడు" for narrator).',
          },
          dialogueTe: {
            type: Type.STRING,
            description: 'Faithful Telugu narration or dialogue spoken in this scene.',
          },
          captionLines: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description:
              '2 to 5 short, natural Telugu subtitle lines that together cover the entire dialogueTe cleanly for cinema captions.',
          },
          visualPromptEn: {
            type: Type.STRING,
            description:
              'Detailed 16:9 English cinematic visual prompt describing subject, setting, lighting, composition, and period/cultural detail. Must never ask for text, titles, or watermarks.',
          },
          cameraMotion: {
            type: Type.STRING,
            description: 'One of: zoom-in, zoom-out, pan-left, pan-right, pan-up, pan-down.',
          },
          mood: {
            type: Type.STRING,
            description: 'Concise emotional mood word (e.g., Heroic, Poetic, Suspenseful, Devotional, Melancholic, Dramatic).',
          },
          voiceDirection: {
            type: Type.STRING,
            description: 'Concise vocal direction for the Telugu voice actor (pace, warmth, intensity, pauses).',
          },
        },
        required: [
          'titleTe',
          'speaker',
          'dialogueTe',
          'captionLines',
          'visualPromptEn',
          'cameraMotion',
          'mood',
          'voiceDirection',
        ],
      },
    },
  },
  required: ['chunkSummary', 'scenes'],
};

async function createApp() {
  const app = express();
  app.use(express.json({ limit: '20mb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true, service: 'kathavani-studio' });
  });

  // 1. Multi-Chunk Storyboard Director (gemini-3.8-flash)
  app.post('/api/storyboard/chunk', async (req: Request, res: Response) => {
    try {
      const {
        chunkText,
        chunkIndex = 0,
        totalChunks = 1,
        visualStyle = 'cinematic-cinema',
        voiceProfile = 'Kore',
        previousSceneSummary = '',
        startSceneIndex = 1,
      } = req.body ?? {};

      if (typeof chunkText !== 'string' || !chunkText.trim()) {
        res.status(400).json({ error: 'chunkText is required.' });
        return;
      }

      const ai = getGenAI();
      const styleGuide = STYLE_DIRECTIVES[visualStyle] || STYLE_DIRECTIVES['cinematic-cinema'];

      const systemInstruction = [
        'You are an acclaimed Tollywood film director and Telugu storyboard screenwriter for KathaVani Studio.',
        'Your task is to convert a chunk of a Telugu script into structured cinematic scenes.',
        'Rules:',
        '- Preserve the authentic Telugu language, emotion, and narrative flow from the script in dialogueTe without dropping story content.',
        '- Break the chunk into well-paced cinematic scenes (roughly 35–95 Telugu words per scene, producing 2–8 scenes depending on chunk length).',
        '- captionLines MUST be short, readable Telugu subtitle segments (each 4–10 words) that align sequentially with dialogueTe.',
        `- visualPromptEn MUST be in rich English tailored to this visual style: ${styleGuide}. Never include text overlays, letters, logos, or watermarks in the visual prompt.`,
        '- cameraMotion MUST strictly be one of: zoom-in, zoom-out, pan-left, pan-right, pan-up, pan-down. Vary motion across consecutive scenes.',
        `- voiceDirection should guide the "${voiceProfile}" Telugu voice actor on pacing, warmth, pauses, and dramatic cadence.`,
      ].join('\n');

      const prompt = [
        `Chunk ${chunkIndex + 1} of ${totalChunks} (starting at Scene ${startSceneIndex}).`,
        previousSceneSummary ? `Previous continuity summary: ${previousSceneSummary}` : '',
        'Telugu script chunk:',
        '"""',
        chunkText.trim(),
        '"""',
      ]
        .filter(Boolean)
        .join('\n\n');

      const callModel = async (model: string) =>
        ai.models.generateContent({
          model,
          contents: prompt,
          config: {
            systemInstruction,
            responseMimeType: 'application/json',
            responseSchema: STORYBOARD_SCHEMA,
          },
        });

      let usedModel = 'gemini-3.8-flash';
      let response;
      try {
        response = await callModel('gemini-3.8-flash');
      } catch (err) {
        if (getErrorStatus(err) === 404) {
          usedModel = 'gemini-4-hydrogen';
          response = await callModel('gemini-4-hydrogen');
        } else {
          throw err;
        }
      }

      const rawText = (response.text ?? '').trim();
      const parsed = JSON.parse(rawText || '{"chunkSummary":"","scenes":[]}');
      const allowedMotions = new Set(['zoom-in', 'zoom-out', 'pan-left', 'pan-right', 'pan-up', 'pan-down']);

      const scenes = Array.isArray(parsed.scenes)
        ? parsed.scenes.map((s: Record<string, unknown>, idx: number) => {
            const dialogueTe = String(s.dialogueTe ?? '').trim() || chunkText.trim().slice(0, 300);
            const rawCaptions = Array.isArray(s.captionLines)
              ? s.captionLines.map((c) => String(c ?? '').trim()).filter(Boolean)
              : [];
            const captionLines = rawCaptions.length > 0 ? rawCaptions.slice(0, 16) : [dialogueTe];
            const motionCandidate = String(s.cameraMotion ?? 'zoom-in').trim().toLowerCase();
            const cameraMotion = allowedMotions.has(motionCandidate)
              ? motionCandidate
              : ['zoom-in', 'pan-right', 'zoom-out', 'pan-left'][idx % 4];

            return {
              titleTe: String(s.titleTe ?? `దృశ్యం ${startSceneIndex + idx}`).trim().slice(0, 280),
              speaker: String(s.speaker ?? 'కథకుడు').trim().slice(0, 100),
              dialogueTe: dialogueTe.slice(0, 4800),
              captionLines,
              visualPromptEn: String(s.visualPromptEn ?? `${styleGuide}, cinematic Telugu film frame`).trim().slice(0, 1900),
              cameraMotion,
              mood: String(s.mood ?? 'Dramatic').trim().slice(0, 70),
              voiceDirection: String(s.voiceDirection ?? 'Warm, expressive cinematic Telugu narration').trim().slice(0, 280),
            };
          })
        : [];

      res.json({
        model: usedModel,
        chunkSummary: String(parsed.chunkSummary ?? ''),
        scenes,
      });
    } catch (err) {
      const formatted = formatUpstreamError(err, 'gemini-3.8-flash');
      console.error('[storyboard/chunk] error:', err);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  // 2. 16:9 Scene Artwork Generation (gemini-nano-banana-2.1)
  app.post('/api/generate-image', async (req: Request, res: Response) => {
    try {
      const { prompt, visualStyle = 'cinematic-cinema', mood = 'Dramatic' } = req.body ?? {};
      if (typeof prompt !== 'string' || !prompt.trim()) {
        res.status(400).json({ error: 'prompt is required.' });
        return;
      }

      const ai = getGenAI();
      const styleGuide = STYLE_DIRECTIVES[visualStyle] || STYLE_DIRECTIVES['cinematic-cinema'];
      const fullPrompt = `${prompt.trim()}. Visual direction: ${styleGuide}. Emotional mood: ${mood}. 16:9 widescreen cinema frame, ultra-detailed, strictly no text, no subtitles, no logos, no watermarks.`;

      const response = await ai.models.generateContent({
        model: 'gemini-nano-banana-2.1',
        contents: {
          parts: [{ text: fullPrompt }],
        },
        config: {
          imageConfig: {
            aspectRatio: '16:9',
            imageSize: '1K',
          },
        },
      });

      const parts = response.candidates?.[0]?.content?.parts ?? [];
      for (const part of parts) {
        if (part.inlineData?.data) {
          const mimeType = part.inlineData.mimeType ?? 'image/png';
          const imageDataUrl = `data:${mimeType};base64,${part.inlineData.data}`;
          res.json({
            model: 'gemini-nano-banana-2.1',
            mimeType,
            imageDataUrl,
          });
          return;
        }
      }

      res.status(502).json({
        error: 'No image data was returned by gemini-nano-banana-2.1. Please adjust the visual prompt and retry.',
      });
    } catch (err) {
      const formatted = formatUpstreamError(err, 'gemini-nano-banana-2.1');
      console.error('[generate-image] error:', err);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  // 3. Expressive Human-Like Telugu Narration (gemini-3.1-flash-tts-preview)
  app.post('/api/generate-tts', async (req: Request, res: Response) => {
    try {
      const {
        text,
        voiceProfile = 'Kore',
        voiceDirection = 'Warm, expressive cinematic Telugu storytelling',
        speaker = 'కథకుడు',
        mood = 'Dramatic',
      } = req.body ?? {};

      if (typeof text !== 'string' || !text.trim()) {
        res.status(400).json({ error: 'text is required.' });
        return;
      }

      const ai = getGenAI();
      const validVoices = new Set(['Kore', 'Puck', 'Charon', 'Aoede', 'Fenrir']);
      const selectedVoice = validVoices.has(voiceProfile) ? voiceProfile : 'Kore';
      const stylePrompt = `Expressive native Telugu narration (${mood}, speaker: ${speaker}). ${voiceDirection}`;

      const invokePrimaryTts = async (useSpeechMetadata: boolean) => {
        if (useSpeechMetadata) {
          return ai.models.generateContent({
            model: 'gemini-3.1-flash-tts-preview',
            contents: [
              {
                role: 'user',
                parts: [
                  {
                    text: text.trim(),
                    speechMetadata: {
                      style: stylePrompt,
                    },
                  },
                ],
              },
            ],
            config: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName: selectedVoice },
                },
              },
            },
          });
        }
        return ai.models.generateContent({
          model: 'gemini-3.1-flash-tts-preview',
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: `Speak the following Telugu dialogue naturally with this direction (${stylePrompt}):\n\n${text.trim()}`,
                },
              ],
            },
          ],
          config: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: selectedVoice },
              },
            },
          },
        });
      };

      const invokeFallbackTts = async () => {
        const fallbackVoice = selectedVoice === 'Aoede' ? 'Zephyr' : selectedVoice;
        return ai.models.generateContent({
          model: 'gemini-3.8-flash-lite-tts',
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: text.trim(),
                  speechMetadata: {
                    style: stylePrompt,
                  },
                },
              ],
            },
          ],
          config: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: fallbackVoice },
              },
            },
          },
        });
      };

      let usedModel = 'gemini-3.1-flash-tts-preview';
      let response;
      try {
        response = await invokePrimaryTts(true);
      } catch (err) {
        const st = getErrorStatus(err);
        if (st === 404) {
          usedModel = 'gemini-3.8-flash-lite-tts';
          response = await invokeFallbackTts();
        } else if (st === 400) {
          // Some preview builds prefer inline prompt styling over speechMetadata
          try {
            response = await invokePrimaryTts(false);
          } catch (innerErr) {
            if (getErrorStatus(innerErr) === 404) {
              usedModel = 'gemini-3.8-flash-lite-tts';
              response = await invokeFallbackTts();
            } else {
              throw innerErr;
            }
          }
        } else {
          throw err;
        }
      }

      const parts = response.candidates?.[0]?.content?.parts ?? [];
      let base64Audio: string | undefined;
      for (const part of parts) {
        if (part.inlineData?.data) {
          base64Audio = part.inlineData.data;
          break;
        }
      }

      if (!base64Audio) {
        res.status(502).json({ error: `No audio data returned by ${usedModel}. Please retry.` });
        return;
      }

      const rawBuffer = Buffer.from(base64Audio, 'base64');
      const { wavBuffer, durationSec } = ensureWavAndDuration(rawBuffer, 24000);
      const wavBase64 = wavBuffer.toString('base64');

      res.json({
        model: usedModel,
        mimeType: 'audio/wav',
        audioDataUrl: `data:audio/wav;base64,${wavBase64}`,
        durationSec,
      });
    } catch (err) {
      const formatted = formatUpstreamError(err, 'gemini-3.1-flash-tts-preview');
      console.error('[generate-tts] error:', err);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      const indexHtml = path.join(distDir, 'index.html');
      if (fs.existsSync(indexHtml)) {
        res.sendFile(indexHtml);
      } else {
        res.status(404).send('Build output not found. Run npm run build.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`KathaVani Studio server listening on http://0.0.0.0:${PORT}`);
  });
}

createApp().catch((err) => {
  console.error('Failed to start KathaVani Studio server:', err);
  process.exit(1);
});
