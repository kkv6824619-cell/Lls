import type { CaptionStyleId, StoryboardScene, VisualStyleId, VoiceProfileId } from '../types/studio';
import { computeTimedCaptions, createSafeId } from './teluguChunker';

export const STUDIO_HERO_IMAGE = '/src/assets/images/tollywood_cinema_stage_1795154789203.jpg';
export const KAKATIYA_SAMPLE_IMAGE = '/src/assets/images/scene_kakatiya_epic_1795154788417.jpg';
export const GODAVARI_SAMPLE_IMAGE = '/src/assets/images/scene_godavari_dusk_1795154790525.jpg';

export interface SampleStory {
  id: string;
  title: string;
  subtitle: string;
  visualStyle: VisualStyleId;
  voiceProfile: VoiceProfileId;
  captionStyle: CaptionStyleId;
  scriptText: string;
  previewScenes?: Omit<StoryboardScene, 'id' | 'projectId'>[];
}

export const SAMPLE_STORIES: SampleStory[] = [
  {
    id: 'kakatiya-deepam',
    title: 'కాకతీయ తోరణం — శిల్పి స్వప్నం',
    subtitle: 'Mythological Historical Epic · Warangal',
    visualStyle: 'mythological-epic',
    voiceProfile: 'Charon',
    captionStyle: 'cinema-gold',
    scriptText: `సంధ్యాసమయంలో ఓరుగల్లు కోటపై బంగారు మేఘాలు కమ్ముకున్నాయి. వేయి దీపాల వెలుగులో కాకతీయ కళాతోరణం రాతి శిల్పంలా కాదు, సజీవమైన చరిత్రలా మెరిసిపోయింది.

ప్రధాన శిల్పి రుద్రయ్య తన ఉలిని పక్కన పెట్టి ఆకాశం వైపు చూశాడు. "ఈ రాయిలో ప్రాణం ఉంది. తరతరాలు గడిచినా తెలుగువారి కీర్తి ఈ తోరణంలో ప్రతిధ్వనిస్తూనే ఉంటుంది" అని గంభీరంగా పలికాడు.

ఆ మాట విన్న యువ శిష్యుడు నాగయ్య కళ్ళలో కొత్త కాంతి మెరిసింది. దూరాన గోదావరి నదిపై తేలుతున్న పడవలో ఒకే ఒక్క ఇత్తడి దీపం చీకటిని చీల్చుకుంటూ ముందుకు సాగింది.

"గురువుగారు, ఒక శిల్పం కాలాన్ని ఎలా జయిస్తుంది?" అని నాగయ్య మెల్లగా అడిగాడు. రుద్రయ్య చిరునవ్వు నవ్వి, "మనసులోని సత్యాన్ని రాతిలో చెక్కినప్పుడు, కాలం కూడా దానికి తలవంచుతుంది" అన్నాడు.

ఆ రాత్రి ఓరుగల్లు వీధులన్నీ మృదంగ నాదంతో, దీపాల వెలుగుతో పండుగలా మారిపోయాయి. ఒక శిల్పి కల, ఒక జాతి గర్వంగా నిలిచిపోయింది.`,
    previewScenes: [
      {
        orderIndex: 0,
        titleTe: 'ఓరుగల్లు సంధ్యా తోరణం',
        speaker: 'కథకుడు',
        dialogueTe:
          'సంధ్యాసమయంలో ఓరుగల్లు కోటపై బంగారు మేఘాలు కమ్ముకున్నాయి. వేయి దీపాల వెలుగులో కాకతీయ కళాతోరణం సజీవమైన చరిత్రలా మెరిసిపోయింది.',
        captionLines: [
          'సంధ్యాసమయంలో ఓరుగల్లు కోటపై బంగారు మేఘాలు కమ్ముకున్నాయి.',
          'వేయి దీపాల వెలుగులో కాకతీయ కళాతోరణం',
          'సజీవమైన చరిత్రలా మెరిసిపోయింది.',
        ],
        visualPromptEn:
          'Epic Tollywood mythological cinema wide shot of an ancient Kakatiya carved sandstone temple gateway at golden dusk, flickering brass oil lamps illuminating carved pillars, dramatic amber storm clouds over Deccan hills',
        cameraMotion: 'zoom-in',
        mood: 'Majestic',
        voiceDirection: 'Deep, resonant storytelling cadence with grand pauses',
        durationSec: 8,
        staticImagePath: KAKATIYA_SAMPLE_IMAGE,
        imageDataUrl: KAKATIYA_SAMPLE_IMAGE,
        imageStatus: 'ready',
        audioStatus: 'idle',
      },
      {
        orderIndex: 1,
        titleTe: 'గోదావరి దీపపు పడవ',
        speaker: 'నాగయ్య & రుద్రయ్య',
        dialogueTe:
          'దూరాన గోదావరి నదిపై తేలుతున్న పడవలో ఒకే ఒక్క ఇత్తడి దీపం చీకటిని చీల్చుకుంటూ ముందుకు సాగింది. మనసులోని సత్యాన్ని చెక్కినప్పుడు కాలం కూడా తలవంచుతుంది.',
        captionLines: [
          'దూరాన గోదావరి నదిపై తేలుతున్న పడవలో',
          'ఒకే ఒక్క ఇత్తడి దీపం చీకటిని చీల్చుకుంటూ సాగింది.',
          'మనసులోని సత్యాన్ని చెక్కినప్పుడు కాలం కూడా తలవంచుతుంది.',
        ],
        visualPromptEn:
          'Poetic South Indian cinema wide shot of a wooden boat with a glowing brass lantern drifting down the misty Godavari river at twilight, saffron-gold sunset reflections on dark indigo water',
        cameraMotion: 'pan-right',
        mood: 'Poetic',
        voiceDirection: 'Soft, philosophical, heartfelt Telugu narration',
        durationSec: 8.5,
        staticImagePath: GODAVARI_SAMPLE_IMAGE,
        imageDataUrl: GODAVARI_SAMPLE_IMAGE,
        imageStatus: 'ready',
        audioStatus: 'idle',
      },
      {
        orderIndex: 2,
        titleTe: 'కళావేదికపై శాశ్వత కీర్తి',
        speaker: 'కథకుడు',
        dialogueTe:
          'ఆ రాత్రి ఓరుగల్లు వీధులన్నీ మృదంగ నాదంతో, దీపాల వెలుగుతో పండుగలా మారిపోయాయి. ఒక శిల్పి కల, ఒక జాతి గర్వంగా నిలిచిపోయింది.',
        captionLines: [
          'ఆ రాత్రి ఓరుగల్లు వీధులన్నీ మృదంగ నాదంతో,',
          'దీపాల వెలుగుతో పండుగలా మారిపోయాయి.',
          'ఒక శిల్పి కల, ఒక జాతి గర్వంగా నిలిచిపోయింది.',
        ],
        visualPromptEn:
          'Grand Indian cinema soundstage illuminated by warm saffron-gold tungsten rays cutting through atmospheric mist, dramatic silhouettes celebrating timeless cinema craft',
        cameraMotion: 'zoom-out',
        mood: 'Triumphant',
        voiceDirection: 'Warm, uplifting crescendo closing line',
        durationSec: 7.5,
        staticImagePath: STUDIO_HERO_IMAGE,
        imageDataUrl: STUDIO_HERO_IMAGE,
        imageStatus: 'ready',
        audioStatus: 'idle',
      },
    ],
  },
  {
    id: 'godavari-sandhya',
    title: 'గోదావరి తీరాన మౌన రాగం',
    subtitle: 'Poetic Cinema Drama · Rajahmundry',
    visualStyle: 'cinematic-cinema',
    voiceProfile: 'Aoede',
    captionStyle: 'clean-subtitle',
    scriptText: `రాజమండ్రి గోదావరి గట్టుపై సాయంత్రం చల్లగాలి వీస్తోంది. నీటి అలలపై పసుపు రంగు సూర్యకిరణాలు బంగారు తీగల్లా మెరుస్తున్నాయి.

పాత నావ నడిపే సుబ్బారావు తన పడవలోని లాంతరును వెలిగించాడు. నలభై ఏళ్ళుగా ఆ నదిని దాటిస్తున్న అతనికి ప్రతి అల ఒక కొత్త కథలా అనిపిస్తుంది.

ఆ రోజు సాయంత్రం, పట్నం నుండి తిరిగి వచ్చిన గాయని మైథిలి ఆ పడవలో ఎక్కింది. "తాతయ్యా, ఇన్నేళ్ళయినా ఈ నది పాట మాత్రం మారలేదు" అని ఆమె నవ్వుతూ చెప్పింది.

సుబ్బారావు తెడ్డును నెమ్మదిగా నీటిలో కదుపుతూ, "మనుషులు మారతారమ్మా, కానీ మనసులో దాచుకున్న రాగాలు ఎప్పుడూ అలాగే ఉంటాయి" అన్నాడు.

నది మధ్యలో చేరుకోగానే మైథిలి ఒక పాత తెలుగు జానపద గీతాన్ని ఆలపించింది. ఆ స్వరం పొగమంచును చీల్చుకుంటూ రెండు తీరాలనూ తాకింది.`,
  },
  {
    id: 'charminar-nidra',
    title: 'అర్ధరాత్రి పాతబస్తీ రహస్యం',
    subtitle: 'Neo-Noir Thriller · Hyderabad',
    visualStyle: 'noir-thriller',
    voiceProfile: 'Fenrir',
    captionStyle: 'bold-highlight',
    scriptText: `హైదరాబాద్ పాతబస్తీలో అర్ధరాత్రి జల్లులు కురుస్తున్నాయి. తడిసిన రాతి రోడ్లపై వీధి దీపాల కాంతి అద్దంలా ప్రతిఫలిస్తోంది.

ఇన్‌స్పెక్టర్ విక్రమ్ తన కోటు కాలర్ పైకి ఎత్తుకుని, చార్మినార్ సమీపంలోని పాత గడియారపు దుకాణం ముందు ఆగాడు. అతని చేతిలో ఉన్న పాత ఉత్తరంలో ఒకే ఒక వాక్యం ఉంది: "సరిగ్గా పన్నెండు గంటలకు నిజం బయటపడుతుంది."

దుకాణం తలుపు నెమ్మదిగా తెరుచుకుంది. లోపల గడియారాల టిక్-టిక్ శబ్దం తప్ప మరేమీ వినిపించడం లేదు. ఒక నీడ వెనుక కారిడార్ వైపు వేగంగా కదిలింది.

"ఆగు! ఎవరక్కడ?" అని విక్రమ్ గట్టిగా అరిచాడు. మెరుపు వెలుగులో టేబుల్‌పై ఉన్న ఒక ప్రాచీన ఇత్తడి తాళం చెవి మెరిసిపోయింది.

ఆ తాళం చెవి వెనుక దాగి ఉన్న రహస్యం నగరాన్ని కుదిపేయబోతోందని విక్రమ్‌కు ఆ క్షణంలోనే అర్థమైంది.`,
  },
];

export function buildSampleScenes(projectId: string, sample: SampleStory): StoryboardScene[] {
  if (!sample.previewScenes) return [];
  return sample.previewScenes.map((s, idx) => ({
    ...s,
    id: createSafeId(`scene_${idx + 1}`),
    projectId,
    timedCaptions: computeTimedCaptions(s.captionLines, s.durationSec),
  }));
}
