import React from 'react';
import { X } from 'lucide-react';
import { generateDailyHeist } from '../game/heistEngine';
import type { PlayerProgress } from '../game/types';

interface ArchiveModalProps {
  dates: string[];
  todayDate: string;
  progress: PlayerProgress;
  onSelectDate: (dateStr: string) => void;
  onClose: () => void;
}

export const ArchiveModal: React.FC<ArchiveModalProps> = ({
  dates,
  todayDate,
  progress,
  onSelectDate,
  onClose,
}) => {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="archive-heading"
      onClick={onClose}
      className="fixed inset-0 z-40 bg-[#080b0e]/82 flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-[#11161b] border border-[#b88a44]/45 rounded-md p-5 shadow-2xl"
      >
        <div className="flex items-center justify-between pb-3 border-b border-[#252e37]">
          <div>
            <h2 id="archive-heading" className="font-display text-2xl font-extrabold tracking-wide text-[#f6f2e9]">
              PAST DAILY HEISTS
            </h2>
            <p className="text-xs text-[#9da7b2]">Replay any recent chamber with its unique Round 2 twist.</p>
          </div>
          <button
            type="button"
            aria-label="Close archive"
            onClick={onClose}
            className="w-8 h-8 rounded bg-[#1b222a] hover:bg-[#27313d] flex items-center justify-center text-[#d6d1c6] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="mt-3 space-y-2 max-h-[60vh] overflow-y-auto">
          {dates.map((dateStr) => {
            const heist = generateDailyHeist(dateStr);
            const record = progress.completedDays[dateStr];
            const isToday = dateStr === todayDate;

            return (
              <button
                key={dateStr}
                type="button"
                onClick={() => onSelectDate(dateStr)}
                className="w-full text-left p-3 bg-[#171d24] hover:bg-[#1f2730] border border-[#2b3540] hover:border-[#b88a44]/60 rounded flex items-center justify-between gap-3 cursor-pointer transition-colors"
              >
                <div>
                  <div className="flex items-center gap-2 text-xs font-mono-tabular">
                    <span className="text-[#f4a236] font-bold">HEIST #{heist.dayNumber}</span>
                    <span aria-hidden="true" className="text-[#515c67]">·</span>
                    <span className="text-[#9da7b2]">{isToday ? 'Today' : dateStr}</span>
                  </div>
                  <div className="text-sm font-semibold text-[#ece8df] mt-0.5">{heist.codename}</div>
                  <div className="text-xs text-[#8d98a4] mt-0.5">
                    R2 Twist: {heist.rounds[1].title}
                  </div>
                </div>

                <div className="text-right shrink-0 font-mono-tabular">
                  {record ? (
                    <>
                      <div className="text-sm font-bold text-[#4ade80]">{record.totalGold.toLocaleString()}g</div>
                      <div className="text-[11px] text-[#9da7b2]">{record.archetype.title}</div>
                    </>
                  ) : (
                    <span className="text-xs text-[#f4a236] font-semibold">PLAY</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
