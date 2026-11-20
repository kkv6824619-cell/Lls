import React, { useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  Clapperboard,
  FileText,
  Film,
  Loader2,
  Square,
  Upload,
  Volume2,
  Subtitles,
  AlertCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  CAPTION_STYLE_OPTIONS,
  VISUAL_STYLE_OPTIONS,
  VOICE_PROFILE_OPTIONS,
  type CaptionStyleId,
  type StudioProject,
  type VisualStyleId,
  type VoiceProfileId,
} from '../types/studio';
import {
  MAX_SCRIPT_WORDS,
  countWords,
  estimateRuntimeSeconds,
  formatDuration,
  splitTeluguScriptIntoChunks,
} from '../lib/teluguChunker';
import { SAMPLE_STORIES, STUDIO_HERO_IMAGE, type SampleStory } from '../lib/sampleStories';

interface ScriptEditorViewProps {
  project: StudioProject;
  onUpdateProject: (patch: Partial<StudioProject>) => void;
  onLoadSample: (sample: SampleStory) => void;
  onDirectStoryboard: () => void;
  onCancelDirecting: () => void;
  isDirecting: boolean;
  directingProgress: {
    currentChunk: number;
    totalChunks: number;
    scenesCreated: number;
  } | null;
  directingError: string | null;
  onOpenCinema: () => void;
}

export function ScriptEditorView({
  project,
  onUpdateProject,
  onLoadSample,
  onDirectStoryboard,
  onCancelDirecting,
  isDirecting,
  directingProgress,
  directingError,
  onOpenCinema,
}: ScriptEditorViewProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [showSampleMenu, setShowSampleMenu] = useState(false);
  const [showChunkPreview, setShowChunkPreview] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const wordCount = useMemo(() => countWords(project.scriptText), [project.scriptText]);
  const estimatedSec = useMemo(() => estimateRuntimeSeconds(wordCount), [wordCount]);
  const chunks = useMemo(() => splitTeluguScriptIntoChunks(project.scriptText), [project.scriptText]);
  const isOverLimit = wordCount > MAX_SCRIPT_WORDS;

  const handleFileLoad = async (file: File) => {
    setUploadError(null);
    const lower = file.name.toLowerCase();
    if (!lower.endsWith('.txt') && !lower.endsWith('.md')) {
      setUploadError('Please upload a .txt or .md Telugu script file.');
      return;
    }
    try {
      const content = await file.text();
      const baseTitle = file.name.replace(/\.(txt|md)$/i, '').trim();
      onUpdateProject({
        scriptText: content,
        title: project.title === 'కొత్త కథావాణి చిత్రం' && baseTitle ? baseTitle : project.title,
      });
    } catch {
      setUploadError('Could not read the selected file.');
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      void handleFileLoad(file);
    }
  };

  const isArchived = project.status === 'archived';

  return (
    <div className="max-w-[1440px] mx-auto px-6 py-8">
      {/* Studio Hero Strip */}
      <div className="relative overflow-hidden rounded-xl border border-[#2A2431] bg-[#110F14] mb-8">
        <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] items-stretch">
          <div className="p-6 lg:p-8 flex flex-col justify-between gap-6">
            <div className="space-y-3">
              <p className="text-xs font-medium text-[#F29F05] tracking-wide">
                Telugu Long-Form AI Cinema Studio · Up to 10,000 Words
              </p>
              <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#F5F0E6] leading-tight [text-wrap:balance]">
                Turn Telugu scripts into narrated widescreen cinema
              </h1>
              <p className="text-sm text-[#B5AC9E] leading-relaxed max-w-xl">
                Write or upload a Telugu screenplay, direct structured multi-chunk storyboards with Gemini,
                render 16:9 visuals and expressive Telugu narration, and export video directly in your browser.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={onDirectStoryboard}
                disabled={isDirecting || wordCount === 0 || isOverLimit || isArchived}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#F29F05] text-[#09080A] text-sm font-semibold hover:bg-[#FBBF24] disabled:opacity-45 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {isDirecting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Directing Storyboard...
                  </>
                ) : (
                  <>
                    <Clapperboard className="w-4 h-4" />
                    Direct Storyboard
                  </>
                )}
              </button>

              {project.scenes.length > 0 && (
                <button
                  type="button"
                  onClick={onOpenCinema}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#1F1B24] border border-[#342D3D] text-[#F5F0E6] text-sm font-medium hover:border-[#F29F05]/60 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Film className="w-4 h-4 text-[#F29F05]" />
                  Watch Preview ({project.scenes.length} scenes)
                </button>
              )}
            </div>
          </div>

          <div className="relative min-h-[190px] lg:min-h-[240px] bg-[#17141B]">
            <img
              src={STUDIO_HERO_IMAGE}
              alt="KathaVani Tollywood cinema soundstage with warm saffron tungsten lighting"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-[#110F14] via-[#110F14]/35 to-transparent lg:block hidden" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#09080A]/80 via-transparent to-transparent" />
            <div className="absolute bottom-4 right-5 text-right">
              <p className="font-telugu text-sm font-semibold text-[#F5F0E6]">కథావాణి స్టూడియో</p>
              <p className="text-xs text-[#B5AC9E]">16:9 Cinema · Synced Telugu Narration</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main 2-Column Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_390px] gap-8 items-start">
        {/* Left: 10,000-Word Telugu Script Editor */}
        <section className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#2A2431]">
            <div className="flex-1 min-w-0">
              <label htmlFor="project-title" className="sr-only">
                Project Title
              </label>
              <input
                id="project-title"
                type="text"
                value={project.title}
                disabled={isArchived}
                onChange={(e) => onUpdateProject({ title: e.target.value })}
                placeholder="Enter Telugu or English film title..."
                className="w-full bg-transparent font-telugu text-xl font-semibold text-[#F5F0E6] placeholder-[#7B7369] focus:outline-none border-b border-transparent focus:border-[#F29F05] pb-1 transition-colors"
              />
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.md,text/plain,text/markdown"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleFileLoad(file);
                  e.target.value = '';
                }}
              />
              <button
                type="button"
                disabled={isArchived}
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#17141B] border border-[#2A2431] text-xs font-medium text-[#F5F0E6] hover:border-[#F29F05]/60 disabled:opacity-45 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5 text-[#F29F05]" />
                Upload .txt / .md
              </button>

              <div className="relative">
                <button
                  type="button"
                  disabled={isArchived}
                  onClick={() => setShowSampleMenu((prev) => !prev)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#17141B] border border-[#2A2431] text-xs font-medium text-[#F5F0E6] hover:border-[#F29F05]/60 disabled:opacity-45 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <BookOpen className="w-3.5 h-3.5 text-[#F29F05]" />
                  Load Sample Story
                  <ChevronDown className="w-3.5 h-3.5 text-[#B5AC9E]" />
                </button>

                {showSampleMenu && (
                  <div className="absolute right-0 mt-2 w-80 rounded-xl bg-[#17141B] border border-[#2A2431] shadow-2xl z-30 py-1.5">
                    {SAMPLE_STORIES.map((sample) => (
                      <button
                        key={sample.id}
                        type="button"
                        onClick={() => {
                          onLoadSample(sample);
                          setShowSampleMenu(false);
                        }}
                        className="w-full text-left px-4 py-3 hover:bg-[#221D29] transition-colors cursor-pointer"
                      >
                        <p className="font-telugu text-sm font-semibold text-[#F5F0E6]">
                          {sample.title}
                        </p>
                        <p className="text-xs text-[#B5AC9E] mt-0.5">{sample.subtitle}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {uploadError && (
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#2B1519] border border-[#6E2630] text-xs text-[#FCA5A5]">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{uploadError}</span>
            </div>
          )}

          {isArchived && (
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#241D12] border border-[#5B451B] text-xs text-[#FDE68A]">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>This project is archived and locked. Open Projects to duplicate or start a new draft.</span>
            </div>
          )}

          {/* Script Textarea with Drag & Drop */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              if (!isArchived) setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            className={`relative rounded-xl border transition-colors bg-[#110F14] ${
              isDragging
                ? 'border-[#F29F05] bg-[#1A1512]'
                : isOverLimit
                  ? 'border-[#DC2626]'
                  : 'border-[#2A2431] focus-within:border-[#F29F05]/70'
            }`}
          >
            <textarea
              value={project.scriptText}
              disabled={isArchived}
              onChange={(e) => onUpdateProject({ scriptText: e.target.value })}
              placeholder="ఇక్కడ మీ తెలుగు కథ లేదా స్క్రిప్ట్ టైప్ చేయండి, పేస్ట్ చేయండి లేదా .txt / .md ఫైల్‌ను డ్రాగ్ చేసి వదలండి..."
              rows={18}
              className="w-full min-h-[440px] p-6 bg-transparent font-telugu text-[15.5px] leading-[1.85] text-[#F5F0E6] placeholder-[#7B7369] resize-y focus:outline-none"
            />

            {isDragging && (
              <div className="absolute inset-0 bg-[#09080A]/85 rounded-xl flex flex-col items-center justify-center gap-2 pointer-events-none">
                <FileText className="w-8 h-8 text-[#F29F05]" />
                <p className="text-sm font-medium text-[#F5F0E6]">Drop .txt or .md Telugu script file</p>
              </div>
            )}
          </div>

          {/* Live Script Metrics Bar (Zero-Pill Unboxed Metadata with Tabular Numerals) */}
          <div className="flex flex-wrap items-center justify-between gap-4 pt-1 text-xs text-[#B5AC9E] tabular-nums">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className={isOverLimit ? 'text-[#F87171] font-semibold' : 'text-[#F5F0E6] font-medium'}>
                {wordCount.toLocaleString()} / {MAX_SCRIPT_WORDS.toLocaleString()} words
              </span>
              <span aria-hidden="true" className="text-[#524B5B]">·</span>
              <span>Est. runtime {formatDuration(estimatedSec)}</span>
              <span aria-hidden="true" className="text-[#524B5B]">·</span>
              <span>
                {chunks.length} {chunks.length === 1 ? 'chunk' : 'chunks'} (~650 words/chunk)
              </span>
            </div>

            {chunks.length > 0 && (
              <button
                type="button"
                onClick={() => setShowChunkPreview((prev) => !prev)}
                className="inline-flex items-center gap-1 text-xs font-medium text-[#F29F05] hover:text-[#FBBF24] transition-colors cursor-pointer"
              >
                {showChunkPreview ? 'Hide Chunk Boundaries' : 'Inspect Chunk Boundaries'}
                {showChunkPreview ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
            )}
          </div>

          {isOverLimit && (
            <p className="text-xs text-[#F87171]">
              Script exceeds the 10,000-word limit by {(wordCount - MAX_SCRIPT_WORDS).toLocaleString()} words. Trim the script before directing.
            </p>
          )}

          {/* Optional Chunk Boundary Inspector */}
          {showChunkPreview && chunks.length > 0 && (
            <div className="rounded-xl border border-[#2A2431] bg-[#141118] divide-y divide-[#2A2431]">
              {chunks.map((chunk, idx) => (
                <div key={idx} className="p-4 space-y-1.5">
                  <div className="flex items-center justify-between text-xs text-[#B5AC9E] tabular-nums">
                    <span className="font-medium text-[#F29F05]">
                      Chunk {String(idx + 1).padStart(2, '0')} of {String(chunks.length).padStart(2, '0')}
                    </span>
                    <span>{countWords(chunk)} words</span>
                  </div>
                  <p className="font-telugu text-xs text-[#B5AC9E] line-clamp-2 leading-relaxed">
                    {chunk}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Directing Progress / Error Banner */}
          {isDirecting && directingProgress && (
            <div className="rounded-xl border border-[#F29F05]/40 bg-[#1A1512] p-4 space-y-3">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2.5 text-sm text-[#F5F0E6] tabular-nums">
                  <Loader2 className="w-4 h-4 text-[#F29F05] animate-spin shrink-0" />
                  <span>
                    Directing chunk {directingProgress.currentChunk} of {directingProgress.totalChunks}
                    {directingProgress.scenesCreated > 0
                      ? ` · ${directingProgress.scenesCreated} scenes directed`
                      : ''}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={onCancelDirecting}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#2A2018] text-xs font-medium text-[#FDE68A] hover:bg-[#3A2B1F] transition-colors cursor-pointer"
                >
                  <Square className="w-3 h-3" />
                  Stop
                </button>
              </div>
              <div className="h-1.5 w-full rounded-full bg-[#2A2431] overflow-hidden">
                <div
                  className="h-full bg-[#F29F05] transition-all duration-300"
                  style={{
                    width: `${Math.max(
                      8,
                      Math.round((directingProgress.currentChunk / Math.max(1, directingProgress.totalChunks)) * 100)
                    )}%`,
                  }}
                />
              </div>
            </div>
          )}

          {directingError && (
            <div className="flex items-start gap-2.5 p-4 rounded-xl bg-[#2B1519] border border-[#6E2630] text-sm text-[#FCA5A5]">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-[#FECACA]">Storyboard Director Error</p>
                <p className="text-xs text-[#FCA5A5]/90 mt-1">{directingError}</p>
              </div>
            </div>
          )}
        </section>

        {/* Right: Studio Direction Controls (Single-Elevation, Hairline-Separated) */}
        <aside className="rounded-xl border border-[#2A2431] bg-[#141118] divide-y divide-[#2A2431]">
          {/* Visual Style Selector */}
          <div className="p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Film className="w-4 h-4 text-[#F29F05]" />
              <h2 className="font-display text-sm font-semibold text-[#F5F0E6]">Visual Style</h2>
            </div>
            <div className="space-y-1.5">
              {VISUAL_STYLE_OPTIONS.map((style) => {
                const active = project.visualStyle === style.id;
                return (
                  <button
                    key={style.id}
                    type="button"
                    disabled={isArchived}
                    onClick={() => onUpdateProject({ visualStyle: style.id as VisualStyleId })}
                    className={`w-full text-left px-3.5 py-2.5 rounded-lg border transition-colors cursor-pointer ${
                      active
                        ? 'bg-[#221A10] border-[#F29F05] text-[#F5F0E6]'
                        : 'bg-transparent border-transparent hover:bg-[#1B1722] text-[#B5AC9E]'
                    }`}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className={`text-sm font-medium ${active ? 'text-[#FDE68A]' : 'text-[#F5F0E6]'}`}>
                        {style.label}
                      </span>
                      <span className="font-telugu text-[11px] text-[#7B7369]">{style.teluguLabel}</span>
                    </div>
                    <p className="text-xs text-[#8D847A] mt-0.5 leading-snug">{style.description}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Voice Profile Selector */}
          <div className="p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Volume2 className="w-4 h-4 text-[#F29F05]" />
              <h2 className="font-display text-sm font-semibold text-[#F5F0E6]">Voice Profile</h2>
            </div>
            <div className="grid grid-cols-1 gap-1.5">
              {VOICE_PROFILE_OPTIONS.map((voice) => {
                const active = project.voiceProfile === voice.id;
                return (
                  <button
                    key={voice.id}
                    type="button"
                    disabled={isArchived}
                    onClick={() => onUpdateProject({ voiceProfile: voice.id as VoiceProfileId })}
                    className={`w-full text-left px-3.5 py-2 rounded-lg border transition-colors cursor-pointer ${
                      active
                        ? 'bg-[#221A10] border-[#F29F05] text-[#F5F0E6]'
                        : 'bg-transparent border-transparent hover:bg-[#1B1722] text-[#B5AC9E]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-sm font-medium ${active ? 'text-[#FDE68A]' : 'text-[#F5F0E6]'}`}>
                        {voice.label}
                      </span>
                      <span className="text-xs text-[#8D847A]">{voice.tone}</span>
                    </div>
                    <p className="text-[11px] text-[#7B7369] mt-0.5">{voice.bestFor}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Caption Style Selector */}
          <div className="p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Subtitles className="w-4 h-4 text-[#F29F05]" />
              <h2 className="font-display text-sm font-semibold text-[#F5F0E6]">Caption Style</h2>
            </div>
            <div className="space-y-1.5">
              {CAPTION_STYLE_OPTIONS.map((cap) => {
                const active = project.captionStyle === cap.id;
                return (
                  <button
                    key={cap.id}
                    type="button"
                    disabled={isArchived}
                    onClick={() => onUpdateProject({ captionStyle: cap.id as CaptionStyleId })}
                    className={`w-full text-left px-3.5 py-2.5 rounded-lg border transition-colors cursor-pointer ${
                      active
                        ? 'bg-[#221A10] border-[#F29F05] text-[#F5F0E6]'
                        : 'bg-transparent border-transparent hover:bg-[#1B1722] text-[#B5AC9E]'
                    }`}
                  >
                    <p className={`text-sm font-medium ${active ? 'text-[#FDE68A]' : 'text-[#F5F0E6]'}`}>
                      {cap.label}
                    </p>
                    <p className="text-xs text-[#8D847A] mt-0.5">{cap.description}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Direct CTA Footer */}
          <div className="p-5">
            <button
              type="button"
              onClick={onDirectStoryboard}
              disabled={isDirecting || wordCount === 0 || isOverLimit || isArchived}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-[#F29F05] text-[#09080A] text-sm font-semibold hover:bg-[#FBBF24] disabled:opacity-45 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              {isDirecting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Directing {chunks.length} {chunks.length === 1 ? 'Chunk' : 'Chunks'}...
                </>
              ) : (
                <>
                  <Clapperboard className="w-4 h-4" />
                  Direct Storyboard ({chunks.length} {chunks.length === 1 ? 'Chunk' : 'Chunks'})
                </>
              )}
            </button>
            <p className="text-[11px] text-[#7B7369] mt-2.5 text-center">
              Splits along Telugu paragraph &amp; sentence boundaries with Gemini Storyboard Director
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
