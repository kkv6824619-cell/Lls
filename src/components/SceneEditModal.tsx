import React, { useEffect, useState } from 'react';
import { X, Save } from 'lucide-react';
import {
  CAMERA_MOTION_LABELS,
  type CameraMotion,
  type StoryboardScene,
} from '../types/studio';
import { computeTimedCaptions } from '../lib/teluguChunker';

interface SceneEditModalProps {
  scene: StoryboardScene | null;
  onClose: () => void;
  onSave: (updated: StoryboardScene) => void;
}

export function SceneEditModal({ scene, onClose, onSave }: SceneEditModalProps) {
  const [titleTe, setTitleTe] = useState('');
  const [speaker, setSpeaker] = useState('');
  const [dialogueTe, setDialogueTe] = useState('');
  const [captionText, setCaptionText] = useState('');
  const [visualPromptEn, setVisualPromptEn] = useState('');
  const [cameraMotion, setCameraMotion] = useState<CameraMotion>('zoom-in');
  const [mood, setMood] = useState('');
  const [voiceDirection, setVoiceDirection] = useState('');
  const [durationSec, setDurationSec] = useState(6);

  useEffect(() => {
    if (!scene) return;
    setTitleTe(scene.titleTe);
    setSpeaker(scene.speaker);
    setDialogueTe(scene.dialogueTe);
    setCaptionText((scene.captionLines || []).join('\n'));
    setVisualPromptEn(scene.visualPromptEn);
    setCameraMotion(scene.cameraMotion);
    setMood(scene.mood);
    setVoiceDirection(scene.voiceDirection);
    setDurationSec(scene.durationSec || 6);
  }, [scene]);

  if (!scene) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const lines = captionText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, 20);
    const safeDuration = Math.max(2, Math.min(600, Number(durationSec) || 6));
    const finalCaptions = lines.length > 0 ? lines : [dialogueTe.trim() || titleTe.trim()];

    onSave({
      ...scene,
      titleTe: titleTe.trim() || scene.titleTe,
      speaker: speaker.trim() || 'కథకుడు',
      dialogueTe: dialogueTe.trim() || scene.dialogueTe,
      captionLines: finalCaptions,
      visualPromptEn: visualPromptEn.trim() || scene.visualPromptEn,
      cameraMotion,
      mood: mood.trim() || 'Dramatic',
      voiceDirection: voiceDirection.trim() || 'Expressive Telugu narration',
      durationSec: safeDuration,
      timedCaptions: computeTimedCaptions(finalCaptions, safeDuration),
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Edit Scene"
    >
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl bg-[#141118] border border-[#2A2431] shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#2A2431] sticky top-0 bg-[#141118] z-10">
          <h2 className="font-display text-base font-semibold text-[#F5F0E6]">
            Edit Scene {String(scene.orderIndex + 1).padStart(2, '0')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#B5AC9E] hover:text-[#F5F0E6] hover:bg-[#221D29] transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-[#B5AC9E]">Telugu Scene Title</label>
              <input
                type="text"
                value={titleTe}
                onChange={(e) => setTitleTe(e.target.value)}
                required
                maxLength={300}
                className="w-full px-3.5 py-2 rounded-lg bg-[#0D0B10] border border-[#2A2431] font-telugu text-sm text-[#F5F0E6] focus:border-[#F29F05] focus:outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-[#B5AC9E]">Speaker</label>
              <input
                type="text"
                value={speaker}
                onChange={(e) => setSpeaker(e.target.value)}
                required
                maxLength={120}
                className="w-full px-3.5 py-2 rounded-lg bg-[#0D0B10] border border-[#2A2431] font-telugu text-sm text-[#F5F0E6] focus:border-[#F29F05] focus:outline-none"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-[#B5AC9E]">Telugu Narration / Dialogue</label>
            <textarea
              rows={3}
              value={dialogueTe}
              onChange={(e) => setDialogueTe(e.target.value)}
              required
              maxLength={5000}
              className="w-full px-3.5 py-2.5 rounded-lg bg-[#0D0B10] border border-[#2A2431] font-telugu text-sm leading-relaxed text-[#F5F0E6] focus:border-[#F29F05] focus:outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-[#B5AC9E]">
              Dialogue-Aligned Telugu Caption Lines (one subtitle per line)
            </label>
            <textarea
              rows={4}
              value={captionText}
              onChange={(e) => setCaptionText(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg bg-[#0D0B10] border border-[#2A2431] font-telugu text-sm leading-relaxed text-[#F5F0E6] focus:border-[#F29F05] focus:outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-[#B5AC9E]">English Visual Prompt (16:9 Artwork)</label>
            <textarea
              rows={3}
              value={visualPromptEn}
              onChange={(e) => setVisualPromptEn(e.target.value)}
              required
              maxLength={2000}
              className="w-full px-3.5 py-2.5 rounded-lg bg-[#0D0B10] border border-[#2A2431] text-sm leading-relaxed text-[#F5F0E6] focus:border-[#F29F05] focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-[#B5AC9E]">Ken Burns Camera Motion</label>
              <select
                value={cameraMotion}
                onChange={(e) => setCameraMotion(e.target.value as CameraMotion)}
                className="w-full px-3 py-2 rounded-lg bg-[#0D0B10] border border-[#2A2431] text-sm text-[#F5F0E6] focus:border-[#F29F05] focus:outline-none"
              >
                {(Object.keys(CAMERA_MOTION_LABELS) as CameraMotion[]).map((key) => (
                  <option key={key} value={key}>
                    {CAMERA_MOTION_LABELS[key]}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-[#B5AC9E]">Mood</label>
              <input
                type="text"
                value={mood}
                onChange={(e) => setMood(e.target.value)}
                maxLength={80}
                className="w-full px-3.5 py-2 rounded-lg bg-[#0D0B10] border border-[#2A2431] text-sm text-[#F5F0E6] focus:border-[#F29F05] focus:outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-[#B5AC9E]">Duration (seconds)</label>
              <input
                type="number"
                min={2}
                max={600}
                step={0.1}
                value={durationSec}
                onChange={(e) => setDurationSec(Number(e.target.value))}
                className="w-full px-3.5 py-2 rounded-lg bg-[#0D0B10] border border-[#2A2431] text-sm text-[#F5F0E6] tabular-nums focus:border-[#F29F05] focus:outline-none"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-[#B5AC9E]">Voice Direction</label>
            <input
              type="text"
              value={voiceDirection}
              onChange={(e) => setVoiceDirection(e.target.value)}
              maxLength={300}
              className="w-full px-3.5 py-2 rounded-lg bg-[#0D0B10] border border-[#2A2431] text-sm text-[#F5F0E6] focus:border-[#F29F05] focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#2A2431]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-[#1F1B24] text-sm font-medium text-[#B5AC9E] hover:text-[#F5F0E6] transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#F29F05] text-[#09080A] text-sm font-semibold hover:bg-[#FBBF24] transition-colors cursor-pointer"
            >
              <Save className="w-4 h-4" />
              Save Scene
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
