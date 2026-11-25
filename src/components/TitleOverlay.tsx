import React from 'react';
import type { DailyHeist, PlayerProgress } from '../game/types';

interface TitleOverlayProps {
  heist: DailyHeist;
  progress: PlayerProgress;
  onlineCount: number;
  alreadySolvedToday: boolean;
  onStartDaily: () => void;
  onStartPractice: () => void;
  onOpenArchive: () => void;
}

export const TitleOverlay: React.FC<TitleOverlayProps> = ({
  heist,
  progress,
  onlineCount,
  alreadySolvedToday,
  onStartDaily,
  onStartPractice,
  onOpenArchive,
}) => {
  return (
    <div className="fixed inset-0 z-20 pointer-events-none flex flex-col justify-between p-3 sm:p-6">
      {/* Top-left quiet daily stamp (zero pills, clean unboxed metadata) */}
      <div className="flex items-center justify-between gap-2 sm:gap-4">
        <div className="pointer-events-auto inline-flex items-center gap-2 text-xs sm:text-sm text-[#c7c0b2] bg-[#0e1216]/85 border border-[#b88a44]/30 px-3 py-1.5 sm:px-3.5 sm:py-2 rounded whitespace-nowrap">
          <span className="font-mono-tabular font-semibold text-[#f4a236]">HEIST #{heist.dayNumber}</span>
          <span aria-hidden="true" className="text-[#5e6873]">·</span>
          <span className="font-mono-tabular">{heist.dateStr}</span>
          <span aria-hidden="true" className="text-[#5e6873] hidden lg:inline">·</span>
          <span className="hidden lg:inline text-[#e8e3d5]">{heist.codename}</span>
          <span aria-hidden="true" className="text-[#5e6873] hidden xl:inline">·</span>
          <span className="hidden xl:inline text-[#9da7b2]">Curated by {heist.curator}</span>
        </div>

        <div className="pointer-events-auto inline-flex items-center gap-2 sm:gap-3 text-xs sm:text-sm text-[#c7c0b2] bg-[#0e1216]/85 border border-[#343e48] px-3 py-1.5 sm:px-3.5 sm:py-2 rounded font-mono-tabular whitespace-nowrap">
          <span>STREAK {progress.streak}D</span>
          <span aria-hidden="true" className="text-[#5e6873]">·</span>
          <span>BEST {progress.bestHaul.toLocaleString()}G</span>
          <span aria-hidden="true" className="text-[#5e6873] hidden md:inline">·</span>
          <span className="hidden md:inline text-[#f4a236]">{onlineCount} LIVE</span>
        </div>
      </div>

      {/* Bottom-left anchored focal title block over calm floor negative space */}
      <div className="flex flex-col gap-3 sm:gap-4 max-w-xl">
        <div className="pointer-events-auto bg-[#0e1216]/90 border border-[#b88a44]/40 p-4 sm:p-6 rounded-md shadow-2xl">
          {/* Bespoke inline SVG mechanical vault emblem + title lockup */}
          <div className="flex items-center gap-3.5 mb-2.5">
            <svg
              width="48"
              height="48"
              viewBox="0 0 56 56"
              fill="none"
              aria-hidden="true"
              className="shrink-0"
            >
              <rect x="2" y="2" width="52" height="52" rx="6" fill="#171d23" stroke="#b88a44" strokeWidth="2.5" />
              <circle cx="28" cy="28" r="16" stroke="#d4a44a" strokeWidth="3" />
              <circle cx="28" cy="28" r="5" fill="#e63946" stroke="#ece8df" strokeWidth="1.5" />
              <line x1="28" y1="12" x2="28" y2="22" stroke="#d4a44a" strokeWidth="2.5" strokeLinecap="round" />
              <line x1="28" y1="34" x2="28" y2="44" stroke="#d4a44a" strokeWidth="2.5" strokeLinecap="round" />
              <line x1="12" y1="28" x2="22" y2="28" stroke="#d4a44a" strokeWidth="2.5" strokeLinecap="round" />
              <line x1="34" y1="28" x2="44" y2="28" stroke="#d4a44a" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
            <div>
              <h1 className="font-display text-4xl sm:text-5xl font-extrabold tracking-tight leading-none text-[#f6f2e9]">
                VAULT ZERO
              </h1>
              <p className="text-xs sm:text-base text-[#b8c0c8] mt-1">
                Pick a vault. Plant a decoy. Dodge the overcrowd blast.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 mt-4">
            <button
              type="button"
              data-start="true"
              onClick={(e) => {
                e.currentTarget.blur();
                onStartDaily();
              }}
              className="px-5 py-2.5 sm:px-6 sm:py-3 bg-[#e63946] hover:bg-[#f04754] active:translate-y-px text-white font-semibold text-sm sm:text-base tracking-wide rounded transition-colors cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f4a236]"
            >
              {alreadySolvedToday ? 'Replay Daily (Unranked)' : 'Start Daily Heist'}
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.currentTarget.blur();
                onStartPractice();
              }}
              className="px-4 py-2.5 sm:py-3 bg-[#1b2229] hover:bg-[#252f38] text-[#ece8df] border border-[#3a4550] font-medium text-sm rounded transition-colors cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f4a236]"
            >
              Practice Run
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.currentTarget.blur();
                onOpenArchive();
              }}
              className="px-4 py-2.5 sm:py-3 bg-[#141a20] hover:bg-[#1e2730] text-[#c7c0b2] border border-[#2f3842] font-medium text-sm rounded transition-colors cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f4a236]"
            >
              Past Heists
            </button>
          </div>
        </div>

        {/* Single flat borderless inline control hint in bottom safe margin */}
        <p className="text-xs text-[#d6d1c6] font-mono-tabular tracking-wide drop-shadow-[0_1px_4px_rgba(0,0,0,0.95)]">
          1-5 Select Vault · D Plant Decoy · S/T Split/Steal · Enter Lock In · P Pause · M Mute
        </p>
      </div>
    </div>
  );
};
