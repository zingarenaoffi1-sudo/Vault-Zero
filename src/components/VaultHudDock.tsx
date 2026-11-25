import React from 'react';
import { Eye, EyeOff, Pause, RotateCcw, Volume2, VolumeX } from 'lucide-react';
import type {
  LiveRadarSnapshot,
  PactChoice,
  RoundConfig,
  RoundPhase,
  RoundResolution,
} from '../game/types';

interface VaultHudDockProps {
  dayNumber: number;
  isPractice: boolean;
  isRanked: boolean;
  canRestart: boolean;
  round: RoundConfig;
  roundPhase: RoundPhase;
  secondsLeft: number;
  totalGold: number;
  selectedVault: number | null;
  decoyVault: number | null;
  decoyAvailable: boolean;
  decoyArming: boolean;
  pactChoice: PactChoice;
  pressures: number[];
  radar: LiveRadarSnapshot;
  lastResolution: RoundResolution | null;
  muted: boolean;
  dockCollapsed: boolean;
  onSelectVault: (index: number) => void;
  onToggleDecoyArm: () => void;
  onChangePact: (pact: PactChoice) => void;
  onLockIn: () => void;
  onAdvanceAfterReveal: () => void;
  onToggleMute: () => void;
  onPause: () => void;
  onRestart: () => void;
  onToggleDock: () => void;
}

function pressureLabel(p: number): { text: string; colorClass: string } {
  if (p >= 0.72) return { text: 'CRITICAL', colorClass: 'text-[#ff6b74]' };
  if (p >= 0.45) return { text: 'RISING', colorClass: 'text-[#f4a236]' };
  return { text: 'QUIET', colorClass: 'text-[#4ade80]' };
}

export const VaultHudDock: React.FC<VaultHudDockProps> = ({
  dayNumber,
  isPractice,
  isRanked,
  canRestart,
  round,
  roundPhase,
  secondsLeft,
  totalGold,
  selectedVault,
  decoyVault,
  decoyAvailable,
  decoyArming,
  pactChoice,
  pressures,
  radar,
  lastResolution,
  muted,
  dockCollapsed,
  onSelectVault,
  onToggleDecoyArm,
  onChangePact,
  onLockIn,
  onAdvanceAfterReveal,
  onToggleMute,
  onPause,
  onRestart,
  onToggleDock,
}) => {
  const isUrgent = roundPhase === 'selecting' && secondsLeft <= 4;

  return (
    <div className="fixed inset-0 z-20 pointer-events-none flex flex-col justify-between p-3 sm:p-4">
      {/* TOP PERIMETER HUD STRIP — compact, unobstructed central 3D view */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 sm:gap-4">
        {/* Left: Round & Rule Brief */}
        <div className="pointer-events-auto bg-[#0e1216]/92 border border-[#b88a44]/35 rounded px-3 py-1.5 sm:px-3.5 sm:py-2 sm:max-w-lg">
          <div className="flex items-center justify-between sm:justify-start gap-2 text-[11px] sm:text-xs font-mono-tabular text-[#c7c0b2] whitespace-nowrap">
            <div className="flex items-center gap-1.5 sm:gap-2.5 truncate">
              <span className="text-[#f4a236] font-semibold">
                {isPractice ? 'PRACTICE' : isRanked ? `HEIST #${dayNumber}` : `HEIST #${dayNumber} · REPLAY`}
              </span>
              <span aria-hidden="true" className="text-[#4a5562]">·</span>
              <span className="text-[#ece8df] font-semibold">R{round.roundNumber}/3</span>
              <span aria-hidden="true" className="text-[#4a5562]">·</span>
              <span className="text-[#e63946] font-semibold uppercase truncate">{round.title}</span>
            </div>
          </div>
          <p className="text-[11px] sm:text-sm text-[#e3dfd5] mt-0.5 leading-snug">
            {round.ruleSummary}
          </p>
        </div>

        {/* Right: Hero Readouts (Haul + Timer) + Square Utility Icon Buttons */}
        <div className="pointer-events-auto flex items-center justify-between sm:justify-end gap-2 shrink-0">
          <div className="bg-[#0e1216]/92 border border-[#323c47] rounded px-3 py-1 sm:py-1.5 flex items-center gap-3.5">
            <div className="text-right">
              <div className="text-[10px] font-mono-tabular tracking-wider text-[#9da7b2]">HAUL</div>
              <div
                data-testid="hud-gold"
                className="font-mono-tabular text-sm sm:text-xl font-bold text-[#f4a236] leading-tight"
              >
                {totalGold.toLocaleString()}g
              </div>
            </div>

            <div className="w-px h-6 sm:h-7 bg-[#2a333d]" aria-hidden="true" />

            <div className="text-right min-w-[38px] sm:min-w-[42px]">
              <div className="text-[10px] font-mono-tabular tracking-wider text-[#9da7b2]">CLOCK</div>
              <div
                data-testid="hud-timer"
                className={`font-mono-tabular text-sm sm:text-xl font-bold leading-tight ${
                  isUrgent ? 'text-[#ff5964]' : 'text-[#ece8df]'
                }`}
              >
                {roundPhase === 'selecting' ? `${Math.max(0, Math.ceil(secondsLeft))}s` : '--'}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              tabIndex={-1}
              aria-label={muted ? 'Unmute audio' : 'Mute audio'}
              onClick={(e) => {
                e.currentTarget.blur();
                onToggleMute();
              }}
              className="w-9 h-9 sm:w-10 sm:h-10 bg-[#0e1216]/92 hover:bg-[#1c242c] border border-[#323c47] rounded flex items-center justify-center text-[#d6d1c6] cursor-pointer transition-colors"
            >
              {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>

            <button
              type="button"
              tabIndex={-1}
              aria-label="Pause heist"
              onClick={(e) => {
                e.currentTarget.blur();
                onPause();
              }}
              className="w-9 h-9 sm:w-10 sm:h-10 bg-[#0e1216]/92 hover:bg-[#1c242c] border border-[#323c47] rounded flex items-center justify-center text-[#d6d1c6] cursor-pointer transition-colors"
            >
              <Pause className="w-4 h-4" />
            </button>

            {canRestart && (
              <button
                type="button"
                tabIndex={-1}
                aria-label="Restart heist"
                onClick={(e) => {
                  e.currentTarget.blur();
                  onRestart();
                }}
                className="hidden sm:flex w-10 h-10 bg-[#0e1216]/92 hover:bg-[#1c242c] border border-[#323c47] rounded items-center justify-center text-[#d6d1c6] cursor-pointer transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* UNIFIED COLLAPSIBLE BOTTOM CONTROL DOCK */}
      <div className="flex flex-col items-center w-full">
        {/* Top-edge collapse toggle tab */}
        <button
          type="button"
          tabIndex={-1}
          onClick={(e) => {
            e.currentTarget.blur();
            onToggleDock();
          }}
          className="pointer-events-auto inline-flex items-center gap-1.5 px-3 py-1 bg-[#0e1216]/92 hover:bg-[#1b232b] border border-b-0 border-[#36414c] rounded-t text-[11px] font-mono-tabular text-[#b8c0c8] cursor-pointer transition-colors"
        >
          {dockCollapsed ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
          <span>{dockCollapsed ? 'Show Controls [H]' : 'Hide Controls [H]'}</span>
        </button>

        {!dockCollapsed && (
          <div className="pointer-events-auto w-full max-w-[920px] bg-[#0e1216]/95 border border-[#b88a44]/40 rounded-md p-3 sm:p-4 shadow-2xl">
            {roundPhase === 'revealing' && lastResolution ? (
              /* REVEAL OUTCOME DOCK */
              <div className="flex flex-col gap-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`font-display text-2xl sm:text-3xl font-extrabold tracking-wide ${
                          lastResolution.playerExploded || lastResolution.stealBusted
                            ? 'text-[#ff5964]'
                            : 'text-[#4ade80]'
                        }`}
                      >
                        {lastResolution.headline}
                      </span>
                    </div>
                    <p className="text-xs sm:text-sm text-[#c7c0b2] mt-0.5">
                      {lastResolution.subline}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.currentTarget.blur();
                      onAdvanceAfterReveal();
                    }}
                    className="px-5 py-2.5 bg-[#f4a236] hover:bg-[#fbbf24] text-[#0d1115] font-bold text-sm rounded cursor-pointer whitespace-nowrap shrink-0 transition-colors"
                  >
                    {round.roundNumber < 3 ? `Next: Round ${round.roundNumber + 1}` : 'View Final Haul'}
                  </button>
                </div>

                {/* Live Crowd Share Breakdown across vaults */}
                <div
                  className="grid gap-2"
                  style={{ gridTemplateColumns: `repeat(${round.vaults.length}, minmax(0, 1fr))` }}
                >
                  {round.vaults.map((v, i) => {
                    const share = lastResolution.crowdShares[i] ?? 0;
                    const exploded = lastResolution.explodedVaultIndices.includes(i);
                    const isMine = lastResolution.chosenVaultIndex === i;
                    const isStealClash = isMine && lastResolution.stealBusted;
                    return (
                      <div
                        key={v.code}
                        className={`p-1.5 sm:p-2 rounded border ${
                          exploded || isStealClash
                            ? 'bg-[#2a1216] border-[#e63946]/70'
                            : isMine
                              ? 'bg-[#12261c] border-[#22c55e]/70'
                              : 'bg-[#151b21] border-[#2c3540]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1 text-[10px] sm:text-xs font-mono-tabular whitespace-nowrap">
                          <span className="font-bold text-[#ece8df]">
                            {v.code}
                            {isMine && (
                              <span className="hidden sm:inline"> (YOU)</span>
                            )}
                          </span>
                          <span
                            className={
                              exploded || isStealClash
                                ? 'text-[#ff6b74] font-bold'
                                : isMine
                                  ? 'text-[#4ade80] font-bold'
                                  : 'text-[#9da7b2]'
                            }
                          >
                            {exploded ? 'BLAST' : isStealClash ? 'CLASH' : isMine ? 'YOU' : 'SAFE'}
                          </span>
                        </div>
                        <div className="mt-1.5 h-1.5 w-full bg-[#0b0e12] rounded overflow-hidden">
                          <div
                            className={`h-full ${
                              exploded || isStealClash
                                ? 'bg-[#e63946]'
                                : isMine
                                  ? 'bg-[#22c55e]'
                                  : 'bg-[#64748b]'
                            }`}
                            style={{ width: `${Math.min(100, Math.max(8, share * 2))}%` }}
                          />
                        </div>
                        <div className="mt-1 text-[10px] sm:text-[11px] font-mono-tabular text-[#9da7b2] whitespace-nowrap">
                          {share}%<span className="hidden sm:inline"> crowd</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              /* ACTIVE SELECTION & BLUFFING DOCK */
              <div className="flex flex-col gap-3">
                {/* Vault Selector Strip */}
                <div
                  className="grid gap-2"
                  style={{ gridTemplateColumns: `repeat(${round.vaults.length}, minmax(0, 1fr))` }}
                >
                  {round.vaults.map((v, i) => {
                    const isSelected = selectedVault === i;
                    const isDecoy = decoyVault === i;
                    const p = pressures[i] ?? 0.25;
                    const pInfo = pressureLabel(p);
                    const liveHovers = radar.hoverCounts[i] ?? 0;

                    return (
                      <button
                        key={v.code}
                        type="button"
                        disabled={roundPhase !== 'selecting'}
                        aria-label={
                          decoyArming
                            ? `Plant Decoy on Vault ${v.code}`
                            : `Select Vault ${v.code} for ${(v.jackpot * v.multiplier).toLocaleString()} gold`
                        }
                        aria-pressed={isSelected}
                        onClick={(e) => {
                          e.currentTarget.blur();
                          onSelectVault(i);
                        }}
                        className={`text-left p-2 sm:p-2.5 rounded border transition-colors cursor-pointer disabled:opacity-60 ${
                          decoyArming
                            ? 'bg-[#10222d] border-[#38bdf8] hover:bg-[#163140]'
                            : isSelected
                              ? 'bg-[#241d11] border-[#f4a236]'
                              : 'bg-[#151b21] border-[#2e3842] hover:border-[#64748b]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-display text-base sm:text-xl font-bold text-[#f6f2e9] leading-none whitespace-nowrap">
                            <span className="sm:hidden">{v.code}</span>
                            <span className="hidden sm:inline">Vault {v.code}</span>
                          </span>
                          <span className="hidden sm:inline font-mono-tabular text-[11px] text-[#9da7b2]">[{i + 1}]</span>
                        </div>

                        <div className="font-mono-tabular text-xs sm:text-base font-bold text-[#f4a236] mt-1 whitespace-nowrap">
                          {(v.jackpot * v.multiplier).toLocaleString()}g
                          {v.multiplier > 1 && (
                            <span className="ml-0.5 text-[10px] sm:text-[11px] text-[#ff6b74]">2X</span>
                          )}
                        </div>

                        {/* Pressure bar + explicit text state (no hue-only) */}
                        <div className="mt-1.5 h-1.5 w-full bg-[#0b0e12] rounded overflow-hidden">
                          <div
                            className={`h-full transition-transform origin-left ${
                              p >= 0.72
                                ? 'bg-[#e63946]'
                                : p >= 0.45
                                  ? 'bg-[#f4a236]'
                                  : 'bg-[#22c55e]'
                            }`}
                            style={{ width: `${Math.round(Math.max(12, p * 100))}%` }}
                          />
                        </div>

                        <div className="mt-1 flex items-center justify-between text-[9px] sm:text-[10px] font-mono-tabular">
                          <span className={pInfo.colorClass}>{pInfo.text}</span>
                          {isDecoy ? (
                            <span className="text-[#38bdf8] font-bold">DECOY</span>
                          ) : liveHovers > 0 ? (
                            <span className="hidden sm:inline text-[#cbd5e1]">{liveHovers} near</span>
                          ) : null}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Action Row: Decoy / Split-or-Steal + Lock In CTA */}
                <div className="flex items-center justify-between gap-2 pt-1 border-t border-[#222b33]">
                  {round.twist === 'split-or-steal' ? (
                    <div className="flex items-center gap-1 bg-[#151b21] p-1 rounded border border-[#2e3842]">
                      <button
                        type="button"
                        onClick={() => onChangePact('split')}
                        className={`px-2.5 sm:px-3 py-1.5 text-[11px] sm:text-xs font-semibold rounded cursor-pointer transition-colors whitespace-nowrap ${
                          pactChoice === 'split'
                            ? 'bg-[#22c55e] text-[#08130c]'
                            : 'text-[#b8c0c8] hover:text-white'
                        }`}
                      >
                        <span className="sm:hidden">SPLIT</span>
                        <span className="hidden sm:inline">SPLIT [S] · Safe Share</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onChangePact('steal')}
                        className={`px-2.5 sm:px-3 py-1.5 text-[11px] sm:text-xs font-semibold rounded cursor-pointer transition-colors whitespace-nowrap ${
                          pactChoice === 'steal'
                            ? 'bg-[#e63946] text-white'
                            : 'text-[#b8c0c8] hover:text-white'
                        }`}
                      >
                        <span className="sm:hidden">STEAL 1.85x</span>
                        <span className="hidden sm:inline">STEAL [T] · 1.85x or 0g</span>
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={!decoyAvailable || roundPhase !== 'selecting'}
                      onClick={(e) => {
                        e.currentTarget.blur();
                        onToggleDecoyArm();
                      }}
                      className={`px-3 sm:px-3.5 py-2 text-xs font-semibold rounded border transition-colors cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed whitespace-nowrap ${
                        decoyArming
                          ? 'bg-[#0ea5e9] text-[#04141d] border-[#38bdf8]'
                          : decoyVault !== null
                            ? 'bg-[#10222d] text-[#38bdf8] border-[#38bdf8]/60'
                            : 'bg-[#161e26] hover:bg-[#1f2a35] text-[#d6d1c6] border-[#394654]'
                      }`}
                    >
                      {decoyArming ? (
                        <>
                          <span className="sm:hidden">Tap Vault for Decoy</span>
                          <span className="hidden sm:inline">Click a Vault to Plant Decoy...</span>
                        </>
                      ) : decoyVault !== null ? (
                        <>
                          <span className="sm:hidden">Decoy: {round.vaults[decoyVault]?.code}</span>
                          <span className="hidden sm:inline">Decoy Active on Vault {round.vaults[decoyVault]?.code}</span>
                        </>
                      ) : decoyAvailable ? (
                        <>
                          <span className="sm:hidden">Decoy (1)</span>
                          <span className="hidden sm:inline">Plant Decoy [D] (1 Left)</span>
                        </>
                      ) : (
                        'Decoy Spent'
                      )}
                    </button>
                  )}

                  <div className="flex items-center gap-3 ml-auto">
                    <span className="hidden md:inline text-xs font-mono-tabular text-[#8e9aa6]">
                      {radar.onlineCount} online ·{' '}
                      {selectedVault !== null
                        ? `Vault ${round.vaults[selectedVault]?.code} targeted`
                        : 'Select a vault door'}
                    </span>

                    <button
                      type="button"
                      disabled={selectedVault === null || roundPhase !== 'selecting'}
                      onClick={(e) => {
                        e.currentTarget.blur();
                        onLockIn();
                      }}
                      className="px-4 sm:px-5 py-2 bg-[#e63946] hover:bg-[#f04754] disabled:bg-[#3a424b] disabled:text-[#8a949e] text-white font-bold text-xs sm:text-sm rounded transition-colors cursor-pointer disabled:cursor-not-allowed whitespace-nowrap shrink-0"
                    >
                      {roundPhase === 'locking' ? (
                        'Sealing...'
                      ) : (
                        <>
                          <span className="sm:hidden">Lock In Vault</span>
                          <span className="hidden sm:inline">Lock In Vault [Enter]</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
