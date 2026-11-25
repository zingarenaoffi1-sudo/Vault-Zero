import React, { useEffect, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { formatRedditComment } from '../game/heistEngine';
import type { HeistSummary, LeaderboardEntry } from '../game/types';

interface ResultModalProps {
  summary: HeistSummary;
  leaderboard: LeaderboardEntry[];
  isPractice: boolean;
  isRanked: boolean;
  onPlayPractice: () => void;
  onOpenArchive: () => void;
  onBackToTitle: () => void;
}

const CODES = ['A', 'B', 'C', 'D', 'E'] as const;

function formatUtcCountdown(): string {
  const now = new Date();
  const nextMidnight = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
    0,
    0,
    0
  );
  const diffSec = Math.max(0, Math.floor((nextMidnight - now.getTime()) / 1000));
  const h = String(Math.floor(diffSec / 3600)).padStart(2, '0');
  const m = String(Math.floor((diffSec % 3600) / 60)).padStart(2, '0');
  const s = String(diffSec % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

export const ResultModal: React.FC<ResultModalProps> = ({
  summary,
  leaderboard,
  isPractice,
  isRanked,
  onPlayPractice,
  onOpenArchive,
  onBackToTitle,
}) => {
  const [copied, setCopied] = useState(false);
  const [showCardText, setShowCardText] = useState(false);
  const [nextCountdown, setNextCountdown] = useState<string>(() => formatUtcCountdown());
  const copyTimerRef = useRef<number | null>(null);
  const redditCard = formatRedditComment(summary);

  useEffect(() => {
    const id = window.setInterval(() => {
      setNextCountdown(formatUtcCountdown());
    }, 1000);
    return () => {
      window.clearInterval(id);
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  const handleCopy = async () => {
    let ok = false;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(redditCard);
        ok = true;
      }
    } catch {
      ok = false;
    }

    if (!ok) {
      try {
        const ta = document.createElement('textarea');
        ta.value = redditCard;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        ok = document.execCommand('copy');
        document.body.removeChild(ta);
      } catch {
        ok = false;
      }
    }

    if (ok) {
      setCopied(true);
      if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
      copyTimerRef.current = window.setTimeout(() => {
        copyTimerRef.current = null;
        setCopied(false);
      }, 2400);
    } else {
      setShowCardText(true);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="result-heading"
      className="fixed inset-0 z-30 bg-[#080b0e]/82 flex items-center justify-center p-3 sm:p-5 overflow-y-auto"
    >
      <div className="w-full max-w-xl max-h-[94vh] overflow-y-auto bg-[#11161b] border border-[#b88a44]/50 rounded-md p-4 sm:p-6 shadow-2xl my-auto">
        {/* Header + Archetype */}
        <div className="flex items-start justify-between gap-4 pb-3 border-b border-[#252e37]">
          <div>
            <div className="text-xs font-mono-tabular text-[#b8c0c8]">
              {isPractice
                ? 'PRACTICE HEIST COMPLETE'
                : isRanked
                  ? `HEIST #${summary.dayNumber} · ${summary.codename}`
                  : `HEIST #${summary.dayNumber} · UNRANKED REPLAY`}
            </div>
            <h2
              id="result-heading"
              className="font-display text-3xl sm:text-4xl font-extrabold tracking-wide text-[#f6f2e9] mt-0.5"
            >
              {summary.archetype.title}
            </h2>
            <p className="text-xs sm:text-sm text-[#9da7b2] mt-0.5">{summary.archetype.tagline}</p>
          </div>

          <div className="text-right shrink-0">
            <div className="text-[11px] font-mono-tabular text-[#9da7b2]">NEXT HEIST (UTC)</div>
            <div className="font-mono-tabular text-sm sm:text-base font-bold text-[#f4a236] mt-0.5">
              {nextCountdown}
            </div>
            <div className="text-[10px] font-mono-tabular text-[#8d98a4] mt-0.5">
              FLAIR: {summary.archetype.flairText}
            </div>
          </div>
        </div>

        {/* 3 Mastery Stat Tiles */}
        <div className="grid grid-cols-3 gap-2.5 my-4">
          <div className="bg-[#171d24] border border-[#2c3640] rounded p-2.5 sm:p-3">
            <div className="text-[10px] font-mono-tabular text-[#9da7b2] whitespace-nowrap">TOTAL HAUL</div>
            <div
              data-testid="result-total-gold"
              className="font-mono-tabular text-lg sm:text-2xl font-bold text-[#f4a236] mt-0.5 whitespace-nowrap"
            >
              {summary.totalGold.toLocaleString()}g
            </div>
          </div>
          <div className="bg-[#171d24] border border-[#2c3640] rounded p-2.5 sm:p-3">
            <div className="text-[10px] font-mono-tabular text-[#9da7b2] whitespace-nowrap">CROWD RANK</div>
            <div className="font-mono-tabular text-lg sm:text-2xl font-bold text-[#ece8df] mt-0.5 whitespace-nowrap">
              Top {summary.percentile}%
            </div>
          </div>
          <div className="bg-[#171d24] border border-[#2c3640] rounded p-2.5 sm:p-3">
            <div className="text-[10px] font-mono-tabular text-[#9da7b2] whitespace-nowrap">DAILY STREAK</div>
            <div className="font-mono-tabular text-lg sm:text-2xl font-bold text-[#4ade80] mt-0.5 whitespace-nowrap">
              {summary.streak}d
            </div>
          </div>
        </div>

        {/* 3-Round Replay Ledger */}
        <div className="space-y-1.5 mb-4">
          {summary.rounds.map((r) => {
            const code = CODES[r.chosenVaultIndex] ?? 'A';
            const bad = r.playerExploded || r.stealBusted;
            return (
              <div
                key={r.roundNumber}
                className="flex items-center justify-between gap-2 px-3 py-2 bg-[#161c22] border border-[#26303a] rounded text-xs sm:text-sm"
              >
                <div className="flex items-center gap-2.5">
                  <span className="font-mono-tabular text-[#9da7b2]">R{r.roundNumber}</span>
                  <span className="font-semibold text-[#ece8df]">Vault {code}</span>
                  <span className="font-mono-tabular text-xs text-[#8d98a4]">
                    {r.crowdShares[r.chosenVaultIndex]}% crowd
                  </span>
                </div>
                <span
                  className={`font-mono-tabular font-bold ${
                    bad ? 'text-[#ff6b74]' : 'text-[#4ade80]'
                  }`}
                >
                  {r.playerExploded
                    ? 'BLAST · 0g'
                    : r.stealBusted
                      ? 'CLASH · 0g'
                      : `+${r.goldEarned.toLocaleString()}g`}
                </span>
              </div>
            );
          })}
        </div>

        {/* Compact Top Agents Leaderboard */}
        {leaderboard.length > 0 && (
          <div className="mb-4 bg-[#141a20] border border-[#252e37] rounded p-3">
            <div className="text-[11px] font-mono-tabular text-[#9da7b2] mb-2">
              {isPractice ? `HEIST #${summary.dayNumber} TOP AGENTS` : "TODAY'S TOP AGENTS"}
            </div>
            <div className="space-y-1">
              {leaderboard.slice(0, 4).map((entry, idx) => (
                <div
                  key={`${entry.username}-${idx}`}
                  className="flex items-center justify-between text-xs font-mono-tabular"
                >
                  <span className={entry.isCurrentPlayer ? 'text-[#f4a236] font-bold' : 'text-[#d6d1c6]'}>
                    {idx + 1}. {entry.username} · <span className="text-[#8d98a4]">{entry.archetype}</span>
                  </span>
                  <span className="text-[#ece8df] font-semibold">{entry.gold.toLocaleString()}g</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {showCardText && (
          <div className="mb-3">
            <label htmlFor="reddit-share-preview" className="block text-[11px] font-mono-tabular text-[#9da7b2] mb-1">
              SELECT &amp; COPY FOR REDDIT COMMENTS
            </label>
            <textarea
              id="reddit-share-preview"
              readOnly
              rows={4}
              value={redditCard}
              onFocus={(e) => e.currentTarget.select()}
              className="w-full bg-[#0b0e12] border border-[#343f4b] rounded p-2 text-xs font-mono-tabular text-[#ece8df] select-text resize-none"
            />
          </div>
        )}

        {/* 1-Click Reddit Comment Share Block */}
        <div className="flex flex-col gap-2 pt-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#f4a236] hover:bg-[#fbbf24] text-[#0d1115] font-bold text-sm rounded cursor-pointer transition-colors whitespace-nowrap"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              <span>{copied ? 'Copied for Reddit Comments' : 'Copy Reddit Comment'}</span>
            </button>

            <button
              type="button"
              data-start="true"
              onClick={onPlayPractice}
              className="px-4 py-2.5 bg-[#e63946] hover:bg-[#f04754] text-white font-semibold text-sm rounded cursor-pointer transition-colors whitespace-nowrap"
            >
              New Practice Heist
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={onOpenArchive}
              className="px-3.5 py-2 bg-[#1b222a] hover:bg-[#252f3a] text-[#d6d1c6] border border-[#343f4b] font-medium text-xs sm:text-sm rounded cursor-pointer transition-colors whitespace-nowrap"
            >
              Past Daily Heists
            </button>

            <button
              type="button"
              onClick={onBackToTitle}
              className="px-3.5 py-2 bg-[#14191f] hover:bg-[#1d252e] text-[#9da7b2] border border-[#2a333d] font-medium text-xs sm:text-sm rounded cursor-pointer transition-colors whitespace-nowrap"
            >
              Back to Title
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
