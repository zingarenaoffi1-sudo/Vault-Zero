import React from 'react';
import type { RoundPhase, VaultDef } from '../game/types';

interface FallbackVaultStageProps {
  vaults: VaultDef[];
  roundPhase: RoundPhase;
  selectedIndex: number | null;
  decoyIndex: number | null;
  pressures: number[];
  explodedIndices: number[];
  stealBustedIndex: number | null;
  onVaultClick: (index: number) => void;
}

/**
 * Graceful hardware-independent architectural vault stage rendered if WebGL is unavailable
 * (e.g., legacy GPUs or browsers with WebGL disabled).
 */
export const FallbackVaultStage: React.FC<FallbackVaultStageProps> = ({
  vaults,
  roundPhase,
  selectedIndex,
  decoyIndex,
  pressures,
  explodedIndices,
  stealBustedIndex,
  onVaultClick,
}) => {
  return (
    <div className="fixed inset-0 z-0 bg-[#11161c] flex items-center justify-center px-4 pb-28 pt-20">
      <div
        className="w-full max-w-5xl grid gap-3 sm:gap-4"
        style={{ gridTemplateColumns: `repeat(${vaults.length}, minmax(0, 1fr))` }}
      >
        {vaults.map((v, i) => {
          const isSelected = selectedIndex === i;
          const isDecoy = decoyIndex === i;
          const isExploded = roundPhase === 'revealing' && explodedIndices.includes(i);
          const isStealJammed = roundPhase === 'revealing' && stealBustedIndex === i;
          const isSafeOpen = roundPhase === 'revealing' && !isExploded && !isStealJammed;
          const pressure = pressures[i] ?? 0.25;

          return (
            <button
              key={v.code}
              type="button"
              disabled={roundPhase !== 'selecting'}
              onClick={() => onVaultClick(i)}
              className={`group relative rounded-md border-2 p-2.5 sm:p-4 flex flex-col items-center justify-between aspect-[3/4] transition-transform cursor-pointer disabled:cursor-default ${
                isExploded || isStealJammed
                  ? 'bg-[#2a1216] border-[#e63946] -rotate-2'
                  : isSafeOpen && isSelected
                    ? 'bg-[#12261c] border-[#22c55e]'
                    : isSelected
                      ? 'bg-[#231d13] border-[#f4a236] -translate-y-1'
                      : 'bg-[#1b222a] border-[#33404d] hover:border-[#b88a44]'
              }`}
            >
              {/* Pressure meter strip */}
              <div className="w-full flex items-center justify-between text-[11px] font-mono-tabular">
                <span className="font-bold px-1.5 py-0.5 rounded bg-[#0d1115] text-[#f6f2e9]">
                  {v.code}
                </span>
                <span className="text-[#f4a236] font-bold">
                  {(v.jackpot * v.multiplier).toLocaleString()}g
                </span>
              </div>

              {/* Mechanical Vault Wheel SVG */}
              <svg viewBox="0 0 80 80" className="w-16 h-16 sm:w-24 sm:h-24 my-2" aria-hidden="true">
                <rect
                  x="6"
                  y="6"
                  width="68"
                  height="68"
                  rx="6"
                  fill={isSafeOpen ? '#0c1014' : '#26303a'}
                  stroke={isExploded ? '#e63946' : isSelected ? '#f4a236' : '#556270'}
                  strokeWidth="3"
                />
                {isSafeOpen ? (
                  <g fill="#f59e0b">
                    <rect x="20" y="48" width="40" height="12" rx="2" />
                    <rect x="26" y="34" width="28" height="12" rx="2" />
                    <rect x="33" y="20" width="14" height="12" rx="2" />
                  </g>
                ) : (
                  <g stroke="#d4a44a" strokeWidth="4" fill="none">
                    <circle cx="40" cy="40" r="19" />
                    <line x1="40" y1="21" x2="40" y2="59" />
                    <line x1="21" y1="40" x2="59" y2="40" />
                    <circle cx="40" cy="40" r="5" fill="#cbd5e1" stroke="none" />
                  </g>
                )}
              </svg>

              <div className="w-full">
                <div className="h-1.5 w-full bg-[#0c1014] rounded overflow-hidden">
                  <div
                    className={`h-full ${
                      isExploded || pressure >= 0.72
                        ? 'bg-[#e63946]'
                        : pressure >= 0.45
                          ? 'bg-[#f4a236]'
                          : 'bg-[#22c55e]'
                    }`}
                    style={{ width: `${Math.round(Math.max(12, pressure * 100))}%` }}
                  />
                </div>
                {isDecoy && (
                  <div className="text-[10px] font-mono-tabular font-bold text-[#38bdf8] mt-1 text-center">
                    DECOY ACTIVE
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
