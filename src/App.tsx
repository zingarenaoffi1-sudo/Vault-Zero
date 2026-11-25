import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArchiveModal } from './components/ArchiveModal';
import { FallbackVaultStage } from './components/FallbackVaultStage';
import { PauseModal } from './components/PauseModal';
import { ResultModal } from './components/ResultModal';
import { TitleOverlay } from './components/TitleOverlay';
import { VaultHudDock } from './components/VaultHudDock';
import {
  calculatePercentile,
  classifyArchetype,
  generateDailyHeist,
  getTodayDateStr,
  hashString,
  offsetDateStr,
} from './game/heistEngine';
import { soundFx } from './game/soundFx';
import type {
  DailyHeist,
  GamePhase,
  HeistSummary,
  LeaderboardEntry,
  LiveRadarSnapshot,
  PactChoice,
  PlayerProgress,
  RoundPhase,
  RoundResolution,
} from './game/types';
import {
  buildFallbackRadars,
  fetchDailyHeistBundle,
  getArchiveDates,
  getPlayerUsername,
  loadProgress,
  plantDecoyOnServer,
  RadarSocketClient,
  resolveRoundOnServer,
  type RoundRadarsTuple,
  saveCompletedHeist,
  submitLeaderboardEntry,
} from './services/heistApi';
import { VaultChamberScene } from './three/VaultChamberScene';

function computeVaultPressures(
  dateStr: string,
  roundNumber: 1 | 2 | 3,
  vaultCount: number,
  radar: LiveRadarSnapshot,
  localDecoyIndex: number | null
): number[] {
  const commits = radar.dailyCommits;
  const hovers = radar.hoverCounts;
  const decoys = radar.decoyCounts;

  const raw: number[] = [];
  for (let i = 0; i < vaultCount; i++) {
    const base = commits[i] ?? 20;
    // Realistic ±14% radar sensor fog so gauges signal genuine heat without deterministically spoiling the exact #1 explosion
    const fogSeed = hashString(`fog:${dateStr}:r${roundNumber}:v${i}`) % 1000;
    const fogFactor = 0.86 + (fogSeed / 999) * 0.28;
    const liveHoverBoost = (hovers[i] ?? 0) * 9;
    const serverDecoys = decoys[i] ?? 0;
    const optimisticLocal = localDecoyIndex === i && serverDecoys === 0 ? 1 : 0;
    const decoyBoost = (serverDecoys + optimisticLocal) * 14;
    raw.push(base * fogFactor + liveHoverBoost + decoyBoost);
  }
  const minVal = Math.min(...raw);
  const maxVal = Math.max(...raw);
  const span = maxVal - minVal;
  if (span < 1) {
    return raw.map(() => 0.48);
  }
  return raw.map((val) => {
    const rel = (val - minVal) / span;
    return Math.max(0.18, Math.min(0.95, 0.22 + rel * 0.72));
  });
}

export default function App() {
  const todayDate = useMemo(() => getTodayDateStr(), []);
  const username = useMemo(() => getPlayerUsername(), []);
  const archiveDates = useMemo(() => getArchiveDates(7), []);

  const [activeDate, setActiveDate] = useState<string>(todayDate);
  const [isPractice, setIsPractice] = useState<boolean>(false);
  const [isRankedRun, setIsRankedRun] = useState<boolean>(false);
  const [heist, setHeist] = useState<DailyHeist>(() => generateDailyHeist(todayDate));
  const [progress, setProgress] = useState<PlayerProgress>(() => loadProgress());

  const [gamePhase, setGamePhase] = useState<GamePhase>('title');
  const [roundIdx, setRoundIdx] = useState<0 | 1 | 2>(0);
  const [roundPhase, setRoundPhase] = useState<RoundPhase>('selecting');
  const [secondsLeft, setSecondsLeft] = useState<number>(15);

  const [selectedVault, setSelectedVault] = useState<number | null>(null);
  const [hoveredVault, setHoveredVault] = useState<number | null>(null);
  const [decoyVault, setDecoyVault] = useState<number | null>(null);
  const [decoyAvailable, setDecoyAvailable] = useState<boolean>(true);
  const [decoyArming, setDecoyArming] = useState<boolean>(false);
  const [decoyUsedRecord, setDecoyUsedRecord] = useState<{ roundNumber: number; vaultCode: string } | null>(null);
  const [pactChoice, setPactChoice] = useState<PactChoice>('split');

  const [resolutions, setResolutions] = useState<RoundResolution[]>([]);
  const [lastResolution, setLastResolution] = useState<RoundResolution | null>(null);
  const [summary, setSummary] = useState<HeistSummary | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);

  const [radars, setRadars] = useState<RoundRadarsTuple>(() =>
    buildFallbackRadars(generateDailyHeist(todayDate))
  );

  const [muted, setMuted] = useState<boolean>(() => soundFx.isMuted());
  const [dockCollapsed, setDockCollapsed] = useState<boolean>(false);
  const [archiveOpen, setArchiveOpen] = useState<boolean>(false);
  const [webglFailed, setWebglFailed] = useState<boolean>(false);

  const currentRound = heist.rounds[roundIdx];
  const radar = radars[roundIdx];
  const totalGold = useMemo(
    () => resolutions.reduce((acc, r) => acc + r.goldEarned, 0),
    [resolutions]
  );

  const pressures = useMemo(
    () =>
      computeVaultPressures(
        heist.dateStr,
        currentRound.roundNumber,
        currentRound.vaults.length,
        radar,
        decoyVault
      ),
    [heist.dateStr, currentRound.roundNumber, currentRound.vaults.length, radar, decoyVault]
  );

  // Isolated Three.js mount container + refs (never re-created on React HUD updates)
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<VaultChamberScene | null>(null);
  const socketRef = useRef<RadarSocketClient | null>(null);
  const lockTimerRef = useRef<number | null>(null);
  const runTokenRef = useRef<number>(0);
  const activeDateRef = useRef<string>(todayDate);
  const practiceSeedOffsetRef = useRef<number>(14);

  activeDateRef.current = activeDate;

  const cancelPendingLock = useCallback(() => {
    runTokenRef.current += 1;
    if (lockTimerRef.current !== null) {
      window.clearTimeout(lockTimerRef.current);
      lockTimerRef.current = null;
    }
  }, []);

  const updateRoundRadar = useCallback((roundNumber: 1 | 2 | 3, snapshot: LiveRadarSnapshot) => {
    setRadars((prev) => {
      const next: RoundRadarsTuple = [prev[0], prev[1], prev[2]];
      next[roundNumber - 1] = snapshot;
      return next;
    });
  }, []);

  // Sync body[data-state] for accessibility & browser verification
  useEffect(() => {
    document.body.dataset.state = gamePhase;
  }, [gamePhase]);

  // Load heist bundle from authoritative server whenever activeDate changes
  useEffect(() => {
    let cancelled = false;
    fetchDailyHeistBundle(activeDate).then((bundle) => {
      if (cancelled) return;
      setHeist(bundle.heist);
      setRadars(bundle.radars);
      setLeaderboard(bundle.leaderboard);
    });
    return () => {
      cancelled = true;
    };
  }, [activeDate]);

  // Connect WebSocket radar room
  useEffect(() => {
    const client = new RadarSocketClient((dateStr, roundNumber, snapshot) => {
      if (dateStr !== activeDateRef.current) return;
      updateRoundRadar(roundNumber, snapshot);
    });
    socketRef.current = client;
    return () => {
      client.dispose();
      socketRef.current = null;
    };
  }, [updateRoundRadar]);

  useEffect(() => {
    socketRef.current?.connect(heist.dateStr, currentRound.roundNumber, username);
  }, [heist.dateStr, currentRound.roundNumber, username]);

  // Keep latest handlers in refs for Three.js scene callbacks
  const handleVaultInteractRef = useRef<(index: number) => void>(() => {});
  const handleHoverChangeRef = useRef<(index: number | null) => void>(() => {});

  const handleSelectVault = useCallback(
    (index: number) => {
      if (gamePhase !== 'playing' || roundPhase !== 'selecting') return;
      if (index < 0 || index >= currentRound.vaults.length) return;

      if (decoyArming && decoyAvailable) {
        const token = runTokenRef.current;
        const roundNum = currentRound.roundNumber;
        setDecoyVault(index);
        if (selectedVault === index) {
          setSelectedVault(null);
        }
        setDecoyAvailable(false);
        setDecoyArming(false);
        setDecoyUsedRecord({
          roundNumber: roundNum,
          vaultCode: currentRound.vaults[index]?.code ?? 'A',
        });
        soundFx.playDecoyPing();
        plantDecoyOnServer(heist.dateStr, roundNum, index, username, isRankedRun).then((nextRadar) => {
          if (nextRadar && token === runTokenRef.current) {
            updateRoundRadar(roundNum, nextRadar);
          }
        });
        return;
      }

      setSelectedVault(index);
      soundFx.playDialClick(0.92 + index * 0.06);
      socketRef.current?.sendHover(index);
    },
    [
      currentRound.roundNumber,
      currentRound.vaults,
      decoyArming,
      decoyAvailable,
      gamePhase,
      heist.dateStr,
      isRankedRun,
      roundPhase,
      selectedVault,
      updateRoundRadar,
      username,
    ]
  );

  handleVaultInteractRef.current = handleSelectVault;
  handleHoverChangeRef.current = (idx: number | null) => {
    setHoveredVault(idx);
    socketRef.current?.sendHover(idx);
  };

  // Mount Three.js scene ONCE (with graceful 2D fallback on legacy/blocklisted GPUs)
  useEffect(() => {
    const mount = canvasMountRef.current;
    if (!mount || webglFailed) return;
    let chamber: VaultChamberScene | null = null;
    try {
      chamber = new VaultChamberScene(mount, {
        onHoverChange: (idx) => handleHoverChangeRef.current(idx),
        onVaultClick: (idx) => handleVaultInteractRef.current(idx),
        onContextLost: () => setWebglFailed(true),
      });
      sceneRef.current = chamber;
    } catch {
      mount.innerHTML = '';
      setWebglFailed(true);
    }
    return () => {
      chamber?.dispose();
      sceneRef.current = null;
    };
  }, [webglFailed]);

  // Push declarative state updates into the 3D scene
  useEffect(() => {
    sceneRef.current?.syncState({
      gamePhase,
      roundPhase,
      vaults: currentRound.vaults,
      selectedIndex: selectedVault,
      hoveredIndex: hoveredVault,
      decoyIndex: decoyVault,
      pressures,
      explodedIndices: lastResolution ? lastResolution.explodedVaultIndices : [],
      playerSafeIndex:
        roundPhase === 'revealing' &&
        lastResolution &&
        !lastResolution.playerExploded &&
        !lastResolution.stealBusted
          ? lastResolution.chosenVaultIndex
          : null,
      stealBustedIndex:
        roundPhase === 'revealing' && lastResolution && lastResolution.stealBusted
          ? lastResolution.chosenVaultIndex
          : null,
    });
  }, [
    currentRound.vaults,
    decoyVault,
    gamePhase,
    hoveredVault,
    lastResolution,
    pressures,
    roundPhase,
    selectedVault,
  ]);

  const startHeistRun = useCallback(
    (targetDate: string, practiceMode: boolean) => {
      cancelPendingLock();
      const nextHeist = generateDailyHeist(targetDate);
      const latestProgress = loadProgress();
      const ranked =
        !practiceMode &&
        targetDate === todayDate &&
        !Boolean(latestProgress.completedDays[todayDate]);
      if (targetDate !== activeDateRef.current) {
        setRadars(buildFallbackRadars(nextHeist));
      }
      setActiveDate(targetDate);
      setIsPractice(practiceMode);
      setIsRankedRun(ranked);
      setHeist(nextHeist);
      setRoundIdx(0);
      setRoundPhase('selecting');
      setSecondsLeft(nextHeist.rounds[0].durationSec);
      setSelectedVault(null);
      setHoveredVault(null);
      setDecoyVault(null);
      setDecoyAvailable(true);
      setDecoyArming(false);
      setDecoyUsedRecord(null);
      setPactChoice('split');
      setResolutions([]);
      setLastResolution(null);
      setSummary(null);
      setArchiveOpen(false);
      setDockCollapsed(false);
      document.body.dataset.state = 'playing';
      setGamePhase('playing');
      soundFx.playDialClick(1.15);
    },
    [cancelPendingLock, todayDate]
  );

  const returnToTitle = useCallback(() => {
    cancelPendingLock();
    const todayHeist = generateDailyHeist(todayDate);
    if (activeDateRef.current !== todayDate) {
      setRadars(buildFallbackRadars(todayHeist));
    }
    setActiveDate(todayDate);
    setIsPractice(false);
    setIsRankedRun(false);
    setHeist(todayHeist);
    setRoundIdx(0);
    setRoundPhase('selecting');
    setSecondsLeft(todayHeist.rounds[0].durationSec);
    setSelectedVault(null);
    setHoveredVault(null);
    setDecoyVault(null);
    setDecoyAvailable(true);
    setDecoyArming(false);
    setDecoyUsedRecord(null);
    setPactChoice('split');
    setResolutions([]);
    setLastResolution(null);
    setSummary(null);
    setArchiveOpen(false);
    setDockCollapsed(false);
    document.body.dataset.state = 'title';
    setGamePhase('title');
  }, [cancelPendingLock, todayDate]);

  const handlePause = useCallback(() => {
    if (roundPhase === 'locking') {
      cancelPendingLock();
      setRoundPhase('selecting');
    }
    setGamePhase('paused');
  }, [cancelPendingLock, roundPhase]);

  // Support ?autostart=1 query param
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('autostart') === '1') {
      startHeistRun(todayDate, false);
    }
  }, [startHeistRun, todayDate]);

  const handleLockIn = useCallback(
    (forcedVaultIndex?: number) => {
      if (gamePhase !== 'playing' || roundPhase !== 'selecting') return;
      const chosen = forcedVaultIndex !== undefined ? forcedVaultIndex : selectedVault;
      if (chosen === null) return;

      cancelPendingLock();
      const token = runTokenRef.current;

      setSelectedVault(chosen);
      setDecoyArming(false);
      setRoundPhase('locking');
      soundFx.playBoltLock();

      const roundNum = currentRound.roundNumber;
      const pact = currentRound.twist === 'split-or-steal' ? pactChoice : null;

      lockTimerRef.current = window.setTimeout(async () => {
        lockTimerRef.current = null;
        if (token !== runTokenRef.current) return;

        const { resolution, radar: nextRadar } = await resolveRoundOnServer({
          heist,
          roundNumber: roundNum,
          chosenVaultIndex: chosen,
          decoyVaultIndex: decoyVault,
          pactChoice: pact,
          username,
          ranked: isRankedRun,
        });

        if (token !== runTokenRef.current) return;

        if (nextRadar) updateRoundRadar(roundNum, nextRadar);
        setLastResolution(resolution);
        setResolutions((prev) => [...prev, resolution]);
        setRoundPhase('revealing');

        if (resolution.playerExploded || resolution.stealBusted) {
          soundFx.playExplosion();
        } else {
          soundFx.playGoldJackpot(resolution.stealJackpot || resolution.goldEarned >= 900);
        }
      }, 650);
    },
    [
      cancelPendingLock,
      currentRound.roundNumber,
      currentRound.twist,
      decoyVault,
      gamePhase,
      heist,
      isRankedRun,
      pactChoice,
      roundPhase,
      selectedVault,
      updateRoundRadar,
      username,
    ]
  );

  const lastTickSecRef = useRef<number>(-1);

  // Countdown tick during selecting phase (pure state updater, zero side effects inside updater)
  useEffect(() => {
    if (gamePhase !== 'playing' || roundPhase !== 'selecting') {
      lastTickSecRef.current = -1;
      return;
    }
    const interval = window.setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 0) return 0;
        return Math.max(0, Number((prev - 0.2).toFixed(1)));
      });
    }, 200);
    return () => window.clearInterval(interval);
  }, [gamePhase, roundPhase]);

  // Play urgent countdown ticks cleanly in effect when integer second drops to 3, 2, 1
  useEffect(() => {
    if (gamePhase !== 'playing' || roundPhase !== 'selecting') return;
    const ceilSec = Math.ceil(secondsLeft);
    if (ceilSec > 0 && ceilSec <= 3 && ceilSec !== lastTickSecRef.current) {
      lastTickSecRef.current = ceilSec;
      soundFx.playTick(1 + (4 - ceilSec) * 0.12);
    }
  }, [gamePhase, roundPhase, secondsLeft]);

  // Auto-lock cleanly when countdown reaches 0 (never dead-ends)
  useEffect(() => {
    if (gamePhase === 'playing' && roundPhase === 'selecting' && secondsLeft <= 0) {
      handleLockIn(selectedVault !== null ? selectedVault : 0);
    }
  }, [gamePhase, handleLockIn, roundPhase, secondsLeft, selectedVault]);

  const handleAdvanceAfterReveal = useCallback(async () => {
    if (gamePhase !== 'playing' || roundPhase !== 'revealing') return;
    if (roundIdx < 2) {
      const nextIdx = (roundIdx + 1) as 1 | 2;
      const nextRound = heist.rounds[nextIdx];
      setRoundIdx(nextIdx);
      setRoundPhase('selecting');
      setSecondsLeft(nextRound.durationSec);
      setSelectedVault(null);
      setHoveredVault(null);
      setDecoyVault(null);
      setDecoyArming(false);
      setLastResolution(null);
      setPactChoice('split');
      soundFx.playDialClick(1.05);
      return;
    }

    // Finalize 3-round heist summary
    const token = runTokenRef.current;
    const finalGold = resolutions.reduce((acc, r) => acc + r.goldEarned, 0);
    const percentile = calculatePercentile(finalGold, heist);
    const archetype = classifyArchetype(resolutions, finalGold, decoyUsedRecord !== null);

    const draftSummary: HeistSummary = {
      heistId: heist.id,
      dayNumber: heist.dayNumber,
      dateStr: heist.dateStr,
      codename: heist.codename,
      totalGold: finalGold,
      percentile,
      rounds: resolutions,
      archetype,
      decoyUsedOn: decoyUsedRecord,
      streak: progress.streak,
      completedAt: new Date().toISOString(),
    };

    const isArchiveDay = archiveDates.includes(heist.dateStr);
    const updatedProgress = saveCompletedHeist(
      draftSummary,
      isRankedRun,
      isArchiveDay && heist.dateStr !== todayDate
    );
    setProgress(updatedProgress);

    const finalSummary: HeistSummary = {
      ...draftSummary,
      streak: updatedProgress.streak,
    };
    setSummary(finalSummary);
    setRoundPhase('selecting');
    document.body.dataset.state = 'gameover';
    setGamePhase('gameover');

    const updatedBoard = await submitLeaderboardEntry(
      heist.dateStr,
      username,
      finalGold,
      archetype.title,
      isRankedRun
    );
    if (token !== runTokenRef.current) return;
    setLeaderboard(
      updatedBoard.map((entry) => ({
        ...entry,
        isCurrentPlayer: entry.username === username,
      }))
    );
  }, [
    archiveDates,
    decoyUsedRecord,
    gamePhase,
    heist,
    isRankedRun,
    progress.streak,
    resolutions,
    roundIdx,
    roundPhase,
    todayDate,
    username,
  ]);

  const handleStartPractice = useCallback(() => {
    practiceSeedOffsetRef.current += 7;
    const practiceDate = offsetDateStr(todayDate, -practiceSeedOffsetRef.current);
    startHeistRun(practiceDate, true);
  }, [startHeistRun, todayDate]);

  // Global keyboard shortcuts (edge-triggered, respects pause/title/playing states)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (archiveOpen) {
        if (e.key === 'Escape') setArchiveOpen(false);
        return;
      }

      const key = e.key.toLowerCase();

      if (key === 'm') {
        setMuted(soundFx.toggleMute());
        return;
      }

      if (gamePhase === 'title') {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          startHeistRun(todayDate, false);
        }
        return;
      }

      if (gamePhase === 'gameover') {
        if (e.key === 'Escape') {
          e.preventDefault();
          returnToTitle();
        }
        return;
      }

      if (gamePhase === 'paused') {
        if (e.key === 'Escape' || key === 'p') {
          e.preventDefault();
          setGamePhase('playing');
        }
        return;
      }

      if (gamePhase === 'playing') {
        if (e.key === 'Escape' || key === 'p') {
          e.preventDefault();
          handlePause();
          return;
        }
        if (key === 'h') {
          setDockCollapsed((prev) => !prev);
          return;
        }
        if (key === 'r' && !isRankedRun) {
          startHeistRun(activeDate, isPractice);
          return;
        }
        if (roundPhase === 'selecting') {
          if (key >= '1' && key <= '5') {
            const idx = Number(key) - 1;
            if (idx < currentRound.vaults.length) {
              handleSelectVault(idx);
            }
            return;
          }
          if (key === 'd' && currentRound.twist !== 'split-or-steal' && decoyAvailable) {
            setDecoyArming((prev) => !prev);
            soundFx.playTick(1.1);
            return;
          }
          if (currentRound.twist === 'split-or-steal' && (key === 's' || key === 't')) {
            const nextPact: PactChoice = key === 't' ? 'steal' : 'split';
            setPactChoice(nextPact);
            soundFx.playDialClick(nextPact === 'steal' ? 1.25 : 0.9);
            return;
          }
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (selectedVault !== null) handleLockIn();
          }
        } else if (roundPhase === 'revealing') {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleAdvanceAfterReveal();
          }
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    activeDate,
    archiveOpen,
    currentRound.twist,
    currentRound.vaults.length,
    decoyAvailable,
    gamePhase,
    handleAdvanceAfterReveal,
    handleLockIn,
    handlePause,
    handleSelectVault,
    isPractice,
    isRankedRun,
    returnToTitle,
    roundPhase,
    selectedVault,
    startHeistRun,
    todayDate,
  ]);

  // Clean up any pending lock timeout on unmount
  useEffect(() => {
    return () => {
      cancelPendingLock();
    };
  }, [cancelPendingLock]);

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-[#0d1115] select-none">
      {/* Isolated sibling Three.js WebGL viewport (or hardware-safe 2D fallback) */}
      {webglFailed ? (
        <FallbackVaultStage
          vaults={currentRound.vaults}
          roundPhase={roundPhase}
          selectedIndex={selectedVault}
          decoyIndex={decoyVault}
          pressures={pressures}
          explodedIndices={lastResolution ? lastResolution.explodedVaultIndices : []}
          stealBustedIndex={
            roundPhase === 'revealing' && lastResolution && lastResolution.stealBusted
              ? lastResolution.chosenVaultIndex
              : null
          }
          onVaultClick={handleSelectVault}
        />
      ) : (
        <div
          ref={canvasMountRef}
          data-testid="vault-canvas-mount"
          className="fixed inset-0 z-0"
        />
      )}

      {gamePhase === 'title' && (
        <TitleOverlay
          heist={heist}
          progress={progress}
          onlineCount={radar.onlineCount}
          alreadySolvedToday={Boolean(progress.completedDays[todayDate])}
          onStartDaily={() => startHeistRun(todayDate, false)}
          onStartPractice={handleStartPractice}
          onOpenArchive={() => setArchiveOpen(true)}
        />
      )}

      {(gamePhase === 'playing' || gamePhase === 'paused') && (
        <VaultHudDock
          dayNumber={heist.dayNumber}
          isPractice={isPractice}
          isRanked={isRankedRun}
          canRestart={!isRankedRun}
          round={currentRound}
          roundPhase={roundPhase}
          secondsLeft={secondsLeft}
          totalGold={totalGold}
          selectedVault={selectedVault}
          decoyVault={decoyVault}
          decoyAvailable={decoyAvailable}
          decoyArming={decoyArming}
          pactChoice={pactChoice}
          pressures={pressures}
          radar={radar}
          lastResolution={lastResolution}
          muted={muted}
          dockCollapsed={dockCollapsed}
          onSelectVault={handleSelectVault}
          onToggleDecoyArm={() => {
            if (!decoyAvailable) return;
            setDecoyArming((prev) => !prev);
            soundFx.playTick(1.1);
          }}
          onChangePact={(p) => {
            setPactChoice(p);
            soundFx.playDialClick(p === 'steal' ? 1.25 : 0.9);
          }}
          onLockIn={() => handleLockIn()}
          onAdvanceAfterReveal={handleAdvanceAfterReveal}
          onToggleMute={() => setMuted(soundFx.toggleMute())}
          onPause={handlePause}
          onRestart={() => startHeistRun(activeDate, isPractice)}
          onToggleDock={() => setDockCollapsed((prev) => !prev)}
        />
      )}

      {gamePhase === 'paused' && (
        <PauseModal
          canRestart={!isRankedRun}
          onResume={() => setGamePhase('playing')}
          onRestart={() => startHeistRun(activeDate, isPractice)}
          onExitToTitle={returnToTitle}
        />
      )}

      {gamePhase === 'gameover' && summary && (
        <ResultModal
          summary={summary}
          leaderboard={leaderboard}
          isPractice={isPractice}
          isRanked={isRankedRun}
          onPlayPractice={handleStartPractice}
          onOpenArchive={() => setArchiveOpen(true)}
          onBackToTitle={returnToTitle}
        />
      )}

      {archiveOpen && (
        <ArchiveModal
          dates={archiveDates}
          todayDate={todayDate}
          progress={progress}
          onSelectDate={(d) => startHeistRun(d, d !== todayDate)}
          onClose={() => setArchiveOpen(false)}
        />
      )}
    </main>
  );
}
