export type VisualStyleId =
  | 'cinematic-cinema'
  | 'mythological-epic'
  | 'illustrated-tale'
  | 'noir-thriller'
  | 'stylized-anime';

export type VoiceProfileId = 'Kore' | 'Puck' | 'Charon' | 'Aoede' | 'Fenrir';

export type CaptionStyleId = 'cinema-gold' | 'clean-subtitle' | 'bold-highlight';

export type CameraMotion =
  | 'zoom-in'
  | 'zoom-out'
  | 'pan-left'
  | 'pan-right'
  | 'pan-up'
  | 'pan-down';

export type ProjectStatus = 'draft' | 'storyboarded' | 'rendered' | 'archived';

export interface TimedCaption {
  text: string;
  startTime: number;
  endTime: number;
}

export interface StoryboardScene {
  id: string;
  projectId: string;
  orderIndex: number;
  titleTe: string;
  speaker: string;
  dialogueTe: string;
  captionLines: string[];
  visualPromptEn: string;
  cameraMotion: CameraMotion;
  mood: string;
  voiceDirection: string;
  /** Exact measured WAV audio duration in seconds (or estimated fallback before TTS). */
  durationSec: number;
  /** Optional static bundled sample asset path (never base64 in Firestore). */
  staticImagePath?: string;
  /** Runtime/local generated or uploaded image URL (data URL or object URL). */
  imageDataUrl?: string;
  /** Runtime/local generated WAV narration URL (data URL). */
  audioDataUrl?: string;
  /** Derived proportional captions timed to durationSec. */
  timedCaptions?: TimedCaption[];
  /** Client-only generation status flags */
  imageStatus?: 'idle' | 'generating' | 'ready' | 'error';
  imageError?: string;
  audioStatus?: 'idle' | 'generating' | 'ready' | 'error';
  audioError?: string;
}

export interface StudioProject {
  id: string;
  ownerId?: string;
  title: string;
  scriptText: string;
  visualStyle: VisualStyleId;
  voiceProfile: VoiceProfileId;
  captionStyle: CaptionStyleId;
  sceneCount: number;
  totalDurationSec: number;
  status: ProjectStatus;
  scenes: StoryboardScene[];
  updatedAtMs: number;
  createdAtMs: number;
  source: 'local' | 'cloud';
}

export interface VisualStyleOption {
  id: VisualStyleId;
  label: string;
  teluguLabel: string;
  description: string;
}

export interface VoiceProfileOption {
  id: VoiceProfileId;
  label: string;
  tone: string;
  bestFor: string;
}

export interface CaptionStyleOption {
  id: CaptionStyleId;
  label: string;
  description: string;
}

export const VISUAL_STYLE_OPTIONS: VisualStyleOption[] = [
  {
    id: 'cinematic-cinema',
    label: 'Cinematic Cinema',
    teluguLabel: 'సినిమాటిక్ చిత్రం',
    description: '35mm Tollywood anamorphic drama, golden-hour tungsten depth',
  },
  {
    id: 'mythological-epic',
    label: 'Mythological Epic',
    teluguLabel: 'పౌరాణిక గాథ',
    description: 'Carved stone temples, saffron firelight, mythic grandeur',
  },
  {
    id: 'illustrated-tale',
    label: 'Illustrated Tale',
    teluguLabel: 'చిత్రకళా కథ',
    description: 'Hand-painted storybook gouache with warm ochre & indigo',
  },
  {
    id: 'noir-thriller',
    label: 'Noir Thriller',
    teluguLabel: 'నాయర్ థ్రిల్లర్',
    description: 'Rain-slicked midnight shadows, stark chiaroscuro suspense',
  },
  {
    id: 'stylized-anime',
    label: 'Stylized Anime',
    teluguLabel: 'స్టైలైజ్డ్ యానిమే',
    description: 'Theatrical anime framing with crisp silhouettes & twilight skies',
  },
];

export const VOICE_PROFILE_OPTIONS: VoiceProfileOption[] = [
  { id: 'Kore', label: 'Kore', tone: 'Warm & Expressive', bestFor: 'Emotional drama & storytelling' },
  { id: 'Puck', label: 'Puck', tone: 'Lively & Dynamic', bestFor: 'Folktales, wit & brisk pacing' },
  { id: 'Charon', label: 'Charon', tone: 'Deep & Resonant', bestFor: 'Epics, thrillers & gravity' },
  { id: 'Aoede', label: 'Aoede', tone: 'Melodic & Poetic', bestFor: 'Lyrical river & heritage stories' },
  { id: 'Fenrir', label: 'Fenrir', tone: 'Commanding & Bold', bestFor: 'Heroic monologues & action' },
];

export const CAPTION_STYLE_OPTIONS: CaptionStyleOption[] = [
  {
    id: 'cinema-gold',
    label: 'Cinema Gold',
    description: 'Warm obsidian cinema scrim with saffron-gold speaker & ivory Telugu lines',
  },
  {
    id: 'clean-subtitle',
    label: 'Clean Subtitle',
    description: 'Broadcast-grade translucent subtitle band with crisp high-contrast white type',
  },
  {
    id: 'bold-highlight',
    label: 'Bold Highlight',
    description: 'Saffron-gold emphasized subtitle block with bold dark cinema edge',
  },
];

export const CAMERA_MOTION_LABELS: Record<CameraMotion, string> = {
  'zoom-in': 'Slow Zoom In',
  'zoom-out': 'Slow Zoom Out',
  'pan-left': 'Pan Left',
  'pan-right': 'Pan Right',
  'pan-up': 'Tilt Up',
  'pan-down': 'Tilt Down',
};
