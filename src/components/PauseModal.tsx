import React from 'react';

interface PauseModalProps {
  canRestart: boolean;
  onResume: () => void;
  onRestart: () => void;
  onExitToTitle: () => void;
}

export const PauseModal: React.FC<PauseModalProps> = ({
  canRestart,
  onResume,
  onRestart,
  onExitToTitle,
}) => {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="pause-heading"
      onClick={onResume}
      className="fixed inset-0 z-30 bg-[#080b0e]/80 flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm bg-[#12171c] border border-[#b88a44]/45 rounded-md p-6 shadow-2xl"
      >
        <h2 id="pause-heading" className="font-display text-3xl font-extrabold tracking-wide text-[#f6f2e9]">
          HEIST PAUSED
        </h2>
        <p className="text-sm text-[#9da7b2] mt-1">
          Chamber timers are frozen. Resume when ready to lock your next vault.
        </p>

        <div className="flex flex-col gap-2.5 mt-6">
          <button
            type="button"
            onClick={onResume}
            className="w-full py-2.5 bg-[#e63946] hover:bg-[#f04754] text-white font-semibold text-sm rounded cursor-pointer transition-colors"
          >
            Resume Heist [Esc]
          </button>
          {canRestart && (
            <button
              type="button"
              onClick={onRestart}
              className="w-full py-2.5 bg-[#1b222a] hover:bg-[#252f3a] text-[#ece8df] border border-[#36414c] font-medium text-sm rounded cursor-pointer transition-colors"
            >
              Restart Heist [R]
            </button>
          )}
          <button
            type="button"
            onClick={onExitToTitle}
            className="w-full py-2.5 bg-[#14191f] hover:bg-[#1d252e] text-[#b8c0c8] border border-[#2b343e] font-medium text-sm rounded cursor-pointer transition-colors"
          >
            Title Screen
          </button>
        </div>
      </div>
    </div>
  );
};
