import React from 'react';
import {
  Cloud,
  CloudOff,
  Copy,
  FolderOpen,
  HardDrive,
  Loader2,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import type { User } from 'firebase/auth';
import type { StudioProject } from '../types/studio';
import { formatDuration } from '../lib/teluguChunker';

interface ProjectsDrawerProps {
  open: boolean;
  onClose: () => void;
  user: User | null;
  activeProjectId: string;
  cloudProjects: StudioProject[];
  localDrafts: StudioProject[];
  isLoadingCloud: boolean;
  isSyncing: boolean;
  onCreateNew: () => void;
  onSelectProject: (project: StudioProject) => void;
  onSyncCurrentToCloud: () => void;
  onDuplicateProject: (project: StudioProject) => void;
  onDeleteProject: (project: StudioProject) => void;
  onSignIn: () => void;
}

export function ProjectsDrawer({
  open,
  onClose,
  user,
  activeProjectId,
  cloudProjects,
  localDrafts,
  isLoadingCloud,
  isSyncing,
  onCreateNew,
  onSelectProject,
  onSyncCurrentToCloud,
  onDuplicateProject,
  onDeleteProject,
  onSignIn,
}: ProjectsDrawerProps) {
  if (!open) return null;

  const formatDate = (ms: number) => {
    try {
      return new Date(ms).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '';
    }
  };

  const renderProjectRow = (proj: StudioProject) => {
    const isActive = proj.id === activeProjectId;
    return (
      <div
        key={`${proj.source}-${proj.id}`}
        className={`p-3.5 rounded-lg border transition-colors ${
          isActive
            ? 'bg-[#221A10] border-[#F29F05]'
            : 'bg-[#110F14] border-[#2A2431] hover:border-[#3D3448]'
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <button
            type="button"
            onClick={() => {
              onSelectProject(proj);
              onClose();
            }}
            className="text-left flex-1 min-w-0 cursor-pointer"
          >
            <p className="font-telugu text-sm font-semibold text-[#F5F0E6] truncate">
              {proj.title}
            </p>
            <p className="text-[11px] text-[#8D847A] mt-1 tabular-nums">
              {proj.sceneCount} scenes · {formatDuration(proj.totalDurationSec)} ·{' '}
              {formatDate(proj.updatedAtMs)}
            </p>
          </button>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => onDuplicateProject(proj)}
              title="Duplicate project"
              className="p-1.5 rounded-md text-[#B5AC9E] hover:text-[#F5F0E6] hover:bg-[#221D29] transition-colors cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onDeleteProject(proj)}
              title="Delete project"
              className="p-1.5 rounded-md text-[#B5AC9E] hover:text-[#F87171] hover:bg-[#2B1519] transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex justify-end" role="dialog" aria-modal="true">
      <div className="w-full max-w-md bg-[#141118] border-l border-[#2A2431] h-full flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#2A2431]">
          <div className="flex items-center gap-2">
            <FolderOpen className="w-4 h-4 text-[#F29F05]" />
            <h2 className="font-display text-base font-semibold text-[#F5F0E6]">
              Studio Projects
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close projects drawer"
            className="p-1.5 rounded-lg text-[#B5AC9E] hover:text-[#F5F0E6] hover:bg-[#221D29] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Actions */}
        <div className="p-4 border-b border-[#2A2431] flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => {
              onCreateNew();
              onClose();
            }}
            className="flex-1 inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#F29F05] text-[#09080A] text-xs font-semibold hover:bg-[#FBBF24] transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            New Project
          </button>

          {user ? (
            <button
              type="button"
              disabled={isSyncing}
              onClick={onSyncCurrentToCloud}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#1F1B24] border border-[#342D3D] text-xs font-medium text-[#F5F0E6] hover:border-[#F29F05]/60 disabled:opacity-45 transition-colors cursor-pointer"
            >
              {isSyncing ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-[#F29F05]" />
                  Syncing...
                </>
              ) : (
                <>
                  <Cloud className="w-3.5 h-3.5 text-[#F29F05]" />
                  Save to Cloud
                </>
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={onSignIn}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#1F1B24] border border-[#342D3D] text-xs font-medium text-[#F5F0E6] hover:border-[#F29F05]/60 transition-colors cursor-pointer"
            >
              <Cloud className="w-3.5 h-3.5 text-[#F29F05]" />
              Sign In to Sync
            </button>
          )}
        </div>

        {/* Scrollable Project Lists */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* Cloud Projects (Firestore) */}
          <section className="space-y-3">
            <div className="flex items-center justify-between text-xs text-[#B5AC9E]">
              <span className="inline-flex items-center gap-1.5 font-medium text-[#F5F0E6]">
                {user ? (
                  <Cloud className="w-3.5 h-3.5 text-[#F29F05]" />
                ) : (
                  <CloudOff className="w-3.5 h-3.5 text-[#7B7369]" />
                )}
                Cloud Sync (Firestore)
              </span>
              {user && <span className="tabular-nums">{cloudProjects.length} saved</span>}
            </div>

            {!user ? (
              <p className="text-xs text-[#8D847A] leading-relaxed">
                Sign in with Google to save scripts and directed storyboards to Firestore and access
                them across devices.
              </p>
            ) : isLoadingCloud ? (
              <div className="flex items-center gap-2 text-xs text-[#B5AC9E] py-4">
                <Loader2 className="w-4 h-4 animate-spin text-[#F29F05]" />
                Loading cloud projects...
              </div>
            ) : cloudProjects.length === 0 ? (
              <p className="text-xs text-[#8D847A]">
                No cloud projects yet. Click Save to Cloud to store your active storyboard.
              </p>
            ) : (
              <div className="space-y-2">{cloudProjects.map(renderProjectRow)}</div>
            )}
          </section>

          {/* Local Offline Drafts (LocalStorage) */}
          <section className="space-y-3 pt-4 border-t border-[#2A2431]">
            <div className="flex items-center justify-between text-xs text-[#B5AC9E]">
              <span className="inline-flex items-center gap-1.5 font-medium text-[#F5F0E6]">
                <HardDrive className="w-3.5 h-3.5 text-[#F29F05]" />
                Offline Local Drafts
              </span>
              <span className="tabular-nums">{localDrafts.length} stored</span>
            </div>

            {localDrafts.length === 0 ? (
              <p className="text-xs text-[#8D847A]">
                Drafts auto-save locally to your browser even when offline.
              </p>
            ) : (
              <div className="space-y-2">{localDrafts.map(renderProjectRow)}</div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
