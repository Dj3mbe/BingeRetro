import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TopBar } from "./components/TopBar.tsx";
import { VideoStage } from "./components/VideoStage.tsx";
import { PlayerControls } from "./components/PlayerControls.tsx";
import { ChannelRail } from "./components/ChannelRail.tsx";
import { EpgGuide } from "./components/EpgGuide.tsx";
import { CategoriesView } from "./components/CategoriesView.tsx";
import { CouchModeOverlay } from "./components/CouchModeOverlay.tsx";
import { TvSetupModal } from "./components/TvSetupModal.tsx";
import { OfflineIndicator } from "./components/OfflineIndicator.tsx";
import type {
  Channel,
  ChannelSchedule,
  LineupResponse,
  PlutoBundleResponse,
  SchedulesResponse,
  ViewMode,
} from "./types/tv.ts";
import { clearDurationCache, getNowNext } from "./utils/scheduleEngine.ts";

const STORAGE_LAST_CH = "bingetv-last-ch";
const STORAGE_FAVS = "bingetv-favorites";
const STORAGE_VOL = "bingetv-vol";
const STORAGE_43 = "bingetv-aspect-43";
const STORAGE_CRT = "bingetv-crt";

function loadStoredFavorites(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_FAVS);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed.map(String)) : new Set();
  } catch {
    return new Set();
  }
}

export default function App() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [schedules, setSchedules] = useState<Record<string, ChannelSchedule>>({});
  const [plutoUrls, setPlutoUrls] = useState<Record<string, string>>({});
  const [globalAnchor, setGlobalAnchor] = useState<number>(1704067200);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [activeView, setActiveView] = useState<ViewMode>("live");
  const [activeChannelId, setActiveChannelId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(STORAGE_LAST_CH);
    } catch {
      return null;
    }
  });
  const [favorites, setFavorites] = useState<Set<string>>(loadStoredFavorites);

  const [volume, setVolume] = useState<number>(() => {
    try {
      const saved = Number(localStorage.getItem(STORAGE_VOL));
      return Number.isFinite(saved) && saved >= 0 && saved <= 1 ? saved : 0.8;
    } catch {
      return 0.8;
    }
  });
  const [muted, setMuted] = useState(false);
  const [aspect43, setAspect43] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_43) === "1";
    } catch {
      return false;
    }
  });
  const [scanlines, setScanlines] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_CRT) === "1";
    } catch {
      return false;
    }
  });
  const [isPlaying, setIsPlaying] = useState(false);
  const [showBannerSignal, setShowBannerSignal] = useState(0);
  const [digitBuffer, setDigitBuffer] = useState("");
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [couchMode, setCouchMode] = useState<boolean>(() => {
    try {
      return new URLSearchParams(window.location.search).get("mode") === "tv";
    } catch {
      return false;
    }
  });
  const [couchGuideOpen, setCouchGuideOpen] = useState(false);
  const [tvSetupOpen, setTvSetupOpen] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const stageContainerRef = useRef<HTMLDivElement | null>(null);
  const digitTimerRef = useRef<number | null>(null);
  const scheduleFetchedAtRef = useRef<number>(Date.now());
  const channelsRef = useRef<Channel[]>([]);
  channelsRef.current = channels;

  // Tick clock every second for accurate progress bars and broadcast clock
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const mergePlutoSchedules = useCallback(
    (
      baseSchedules: Record<string, ChannelSchedule>,
      plutoBundle: PlutoBundleResponse | null,
      channelList: Channel[]
    ): Record<string, ChannelSchedule> => {
      if (!plutoBundle?.schedules) return baseSchedules;
      const merged = { ...baseSchedules };
      for (const ch of channelList) {
        if (ch.kind === "pluto" && ch.pluto && plutoBundle.schedules[ch.pluto]) {
          merged[ch.id] = {
            ...plutoBundle.schedules[ch.pluto],
            id: ch.id,
          };
        }
      }
      return merged;
    },
    []
  );

  const refreshSchedules = useCallback(async () => {
    try {
      const [schedRes, plutoRes] = await Promise.all([
        fetch("/api/btv/schedules?hours=6"),
        fetch("/api/btv/pluto").catch(() => null),
      ]);
      const plutoBundle: PlutoBundleResponse | null =
        plutoRes && plutoRes.ok ? await plutoRes.json() : null;
      if (plutoBundle?.urls) setPlutoUrls(plutoBundle.urls);

      if (schedRes.ok) {
        const data: SchedulesResponse = await schedRes.json();
        clearDurationCache();
        setGlobalAnchor(data.anchor);
        setSchedules(
          mergePlutoSchedules(data.schedules || {}, plutoBundle, channelsRef.current)
        );
        scheduleFetchedAtRef.current = Date.now();
      }
    } catch {
      // Keep current schedule slice
    }
  }, [mergePlutoSchedules]);

  // Initial boot fetch: instant stale-while-revalidate from localStorage + single /api/btv/bootstrap call
  useEffect(() => {
    let active = true;

    const applyBootstrap = (bundle: {
      lineup?: LineupResponse;
      schedules?: SchedulesResponse;
      pluto?: PlutoBundleResponse;
    }) => {
      const allChannels = [...(bundle.lineup?.channels || [])]
        .filter(
          (ch) =>
            (ch.kind as string) !== "board" &&
            ch.num !== 2 &&
            ch.num !== 3 &&
            ch.id !== "ia-retro-weather" &&
            ch.id !== "ia-retro-newswire"
        )
        .sort((a, b) => a.num - b.num);
      if (allChannels.length > 0) {
        setChannels(allChannels);
        setActiveChannelId((prev) => {
          const exists = prev && allChannels.some((c) => c.id === prev);
          if (exists) return prev;
          const defaultCh =
            allChannels.find((c) => c.num === 32 || c.num === 6 || c.num === 7) ||
            allChannels[0];
          return defaultCh.id;
        });
      }

      const plutoBundle = bundle.pluto || null;
      if (plutoBundle?.urls) setPlutoUrls(plutoBundle.urls);

      if (bundle.schedules) {
        clearDurationCache();
        setGlobalAnchor(bundle.schedules.anchor);
        setSchedules(
          mergePlutoSchedules(
            bundle.schedules.schedules || {},
            plutoBundle,
            allChannels
          )
        );
        scheduleFetchedAtRef.current = Date.now();
      }
    };

    // Hydrate immediately from localStorage cache if available (0ms UI + immediate video start)
    let hadCached = false;
    try {
      localStorage.removeItem("bingetv-bootstrap-v3");
      localStorage.removeItem("bingeretro-bootstrap-v4");
      const cachedRaw = localStorage.getItem("bingeretro-bootstrap-v5");
      if (cachedRaw) {
        const parsed = JSON.parse(cachedRaw);
        if (parsed?.lineup?.channels?.length) {
          applyBootstrap(parsed);
          setLoading(false);
          hadCached = true;
        }
      }
    } catch {}

    async function boot() {
      if (!hadCached) setLoading(true);
      setLoadError(null);
      try {
        const res = await fetch("/api/btv/bootstrap");
        if (!res.ok) {
          throw new Error(`Failed to fetch channel lineup (${res.status})`);
        }
        const rawText = await res.text();
        const bundle = JSON.parse(rawText);
        if (!active) return;

        applyBootstrap(bundle);
        try {
          localStorage.setItem("bingeretro-bootstrap-v5", rawText);
        } catch {}
      } catch (err) {
        if (!active || hadCached) return;
        setLoadError(
          err instanceof Error ? err.message : "Unable to load BingeRetro channels"
        );
      } finally {
        if (active) setLoading(false);
      }
    }
    boot();

    const schedInterval = window.setInterval(refreshSchedules, 45 * 60_000);
    const onVisibility = () => {
      if (!document.hidden && Date.now() - scheduleFetchedAtRef.current > 20 * 60_000) {
        refreshSchedules();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      active = false;
      window.clearInterval(schedInterval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refreshSchedules, mergePlutoSchedules]);

  // Silently warm adjacent CH +1 / CH -1 Pluto HLS manifests so channel surfing feels instant
  useEffect(() => {
    if (!channels.length || !activeChannelId) return;
    const idx = channels.findIndex((c) => c.id === activeChannelId);
    if (idx < 0) return;

    const neighbors = [
      channels[(idx + 1) % channels.length],
      channels[(idx - 1 + channels.length) % channels.length],
    ];
    for (const n of neighbors) {
      if (n.kind === "pluto" && n.pluto && plutoUrls[n.pluto]) {
        fetch(`/api/btv/hls?url=${encodeURIComponent(plutoUrls[n.pluto])}`).catch(
          () => {}
        );
      }
    }
  }, [activeChannelId, channels, plutoUrls]);

  // Persist user preferences
  useEffect(() => {
    if (activeChannelId) {
      try {
        localStorage.setItem(STORAGE_LAST_CH, activeChannelId);
      } catch {}
    }
  }, [activeChannelId]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_VOL, String(volume));
    } catch {}
  }, [volume]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_43, aspect43 ? "1" : "0");
    } catch {}
  }, [aspect43]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_CRT, scanlines ? "1" : "0");
    } catch {}
  }, [scanlines]);

  const activeChannel = useMemo(
    () => channels.find((c) => c.id === activeChannelId) || null,
    [channels, activeChannelId]
  );

  const activeIndex = useMemo(
    () => channels.findIndex((c) => c.id === activeChannelId),
    [channels, activeChannelId]
  );

  const nowInfo = useMemo(
    () =>
      activeChannel
        ? getNowNext(activeChannel, schedules, globalAnchor, nowMs / 1000)
        : null,
    [activeChannel, schedules, globalAnchor, nowMs]
  );

  const tuneChannelById = useCallback((channelId: string) => {
    setActiveChannelId(channelId);
    setActiveView("live");
    setShowBannerSignal((n) => n + 1);
  }, []);

  const stepChannel = useCallback(
    (delta: number) => {
      if (!channels.length) return;
      const base = activeIndex >= 0 ? activeIndex : 0;
      const nextIdx = (base + delta + channels.length) % channels.length;
      setActiveChannelId(channels[nextIdx].id);
      setShowBannerSignal((n) => n + 1);
    },
    [channels, activeIndex]
  );

  const jumpToNumber = useCallback(
    (num: number): boolean => {
      const target = channels.find((c) => c.num === num);
      if (!target) return false;
      tuneChannelById(target.id);
      return true;
    },
    [channels, tuneChannelById]
  );

  const shuffleChannel = useCallback(() => {
    const pool = channels.filter((c) => c.id !== activeChannelId);
    if (!pool.length) return;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    tuneChannelById(pick.id);
  }, [channels, activeChannelId, tuneChannelById]);

  const toggleFavorite = useCallback((channelId: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(channelId)) next.delete(channelId);
      else next.add(channelId);
      try {
        localStorage.setItem(STORAGE_FAVS, JSON.stringify(Array.from(next)));
      } catch {}
      return next;
    });
  }, []);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().then(() => setIsPlaying(true)).catch(() => {});
    } else {
      video.pause();
      setIsPlaying(false);
    }
  }, []);

  const toggleFullscreen = useCallback(() => {
    const el = stageContainerRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      el.requestFullscreen?.().catch(() => {});
    }
  }, []);

  const enterCouchMode = useCallback(() => {
    setActiveView("live");
    setCouchGuideOpen(false);
    setCouchMode(true);
    setShowBannerSignal((n) => n + 1);
    document.documentElement.requestFullscreen?.().catch(() => {});
  }, []);

  const exitCouchMode = useCallback(() => {
    setCouchGuideOpen(false);
    setCouchMode(false);
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
  }, []);

  // Keyboard & TV Remote Control Shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (couchGuideOpen || tvSetupOpen) return;

      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }

      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        setDigitBuffer((prev) => {
          const next = (prev.length >= 3 ? "" : prev) + e.key;
          if (digitTimerRef.current) window.clearTimeout(digitTimerRef.current);
          digitTimerRef.current = window.setTimeout(() => {
            const num = Number(next);
            setDigitBuffer("");
            jumpToNumber(num);
          }, next.length >= 2 ? 700 : 1400);
          return next;
        });
        return;
      }

      if (
        e.key === "ArrowUp" ||
        e.key === "ChannelUp" ||
        e.key === "MediaTrackNext"
      ) {
        e.preventDefault();
        stepChannel(1);
      } else if (
        e.key === "ArrowDown" ||
        e.key === "ChannelDown" ||
        e.key === "MediaTrackPrevious"
      ) {
        e.preventDefault();
        stepChannel(-1);
      } else if (couchMode && e.key === "ArrowLeft") {
        e.preventDefault();
        setCouchGuideOpen(true);
      } else if (couchMode && (e.key === "ArrowRight" || e.key === "Enter")) {
        e.preventDefault();
        setShowBannerSignal((n) => n + 1);
      } else if (couchMode && (e.key === "Escape" || e.key === "Backspace")) {
        e.preventDefault();
        exitCouchMode();
      } else if (e.key === "c" || e.key === "C") {
        e.preventDefault();
        if (couchMode) exitCouchMode();
        else enterCouchMode();
      } else if (e.key === "g" || e.key === "G") {
        e.preventDefault();
        if (couchMode) {
          setCouchGuideOpen(true);
        } else {
          setActiveView((v) => (v === "guide" ? "live" : "guide"));
        }
      } else if (e.key === "Escape" && activeView !== "live") {
        e.preventDefault();
        setActiveView("live");
      } else if (e.key === "m" || e.key === "M") {
        e.preventDefault();
        setMuted((m) => !m);
      } else if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        toggleFullscreen();
      } else if (e.key === "a" || e.key === "A") {
        e.preventDefault();
        setAspect43((v) => !v);
      } else if (e.key === "i" || e.key === "I") {
        e.preventDefault();
        setShowBannerSignal((n) => n + 1);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    stepChannel,
    jumpToNumber,
    toggleFullscreen,
    activeView,
    couchMode,
    couchGuideOpen,
    tvSetupOpen,
    enterCouchMode,
    exitCouchMode,
  ]);

  return (
    <div className="min-h-screen bg-[#09080D] text-[#F5F3EE]">
      <TopBar
        activeView={activeView}
        onSelectView={setActiveView}
        onShuffleChannel={shuffleChannel}
        onEnterCouchMode={enterCouchMode}
        favoritesCount={favorites.size}
      />

      {loadError && (
        <div className="mx-auto mt-6 max-w-[1440px] px-4 sm:px-6">
          <div className="flex flex-col items-start justify-between gap-3 rounded-xl border border-red-500/40 bg-red-950/30 p-4 sm:flex-row sm:items-center">
            <div>
              <p className="text-sm font-semibold text-red-200">
                Channel guide unavailable
              </p>
              <p className="mt-0.5 text-xs text-red-300/80">{loadError}</p>
            </div>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-lg bg-red-500 px-3.5 py-2 text-xs font-semibold text-white hover:bg-red-400 cursor-pointer"
            >
              Retry Connection
            </button>
          </div>
        </div>
      )}

      {activeView === "live" && (
        <main className="mx-auto max-w-[1440px] px-4 py-5 sm:px-6">
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
            <div>
              <div className={couchMode ? "fixed inset-0 z-40 bg-black" : ""}>
                <VideoStage
                  channel={activeChannel}
                  schedules={schedules}
                  globalAnchor={globalAnchor}
                  plutoUrls={plutoUrls}
                  aspect43={aspect43}
                  scanlines={scanlines}
                  volume={volume}
                  muted={muted}
                  isPlaying={isPlaying}
                  onPlayingChange={setIsPlaying}
                  showBannerSignal={showBannerSignal}
                  digitBuffer={digitBuffer}
                  nowMs={nowMs}
                  videoRef={videoRef}
                  stageContainerRef={stageContainerRef}
                  onStageClick={() => setShowBannerSignal((n) => n + 1)}
                  couchMode={couchMode}
                />

                {couchMode && (
                  <CouchModeOverlay
                    channels={channels}
                    schedules={schedules}
                    globalAnchor={globalAnchor}
                    activeChannelId={activeChannelId}
                    favorites={favorites}
                    guideOpen={couchGuideOpen}
                    onSetGuideOpen={setCouchGuideOpen}
                    onSelectChannel={tuneChannelById}
                    onStepChannel={stepChannel}
                    onShuffleChannel={shuffleChannel}
                    onToggleFavorite={toggleFavorite}
                    volume={volume}
                    muted={muted}
                    onToggleMute={() => setMuted((m) => !m)}
                    aspect43={aspect43}
                    onToggleAspect43={() => setAspect43((v) => !v)}
                    scanlines={scanlines}
                    onToggleScanlines={() => setScanlines((v) => !v)}
                    onFullscreen={toggleFullscreen}
                    onOpenTvSetup={() => setTvSetupOpen(true)}
                    onExitCouchMode={exitCouchMode}
                    nowMs={nowMs}
                  />
                )}
              </div>

              <PlayerControls
                channel={activeChannel}
                nowInfo={nowInfo}
                isPlaying={isPlaying}
                onTogglePlay={togglePlay}
                onChannelStep={stepChannel}
                onJumpToNumber={jumpToNumber}
                volume={volume}
                muted={muted}
                onVolumeChange={(val) => {
                  setVolume(val);
                  if (val > 0 && muted) setMuted(false);
                }}
                onToggleMute={() => setMuted((m) => !m)}
                aspect43={aspect43}
                onToggleAspect43={() => setAspect43((v) => !v)}
                scanlines={scanlines}
                onToggleScanlines={() => setScanlines((v) => !v)}
                isFavorite={
                  activeChannel ? favorites.has(activeChannel.id) : false
                }
                onToggleFavorite={() => {
                  if (activeChannel) toggleFavorite(activeChannel.id);
                }}
                onShowBanner={() => setShowBannerSignal((n) => n + 1)}
                onFullscreen={toggleFullscreen}
                onOpenTvSetup={() => setTvSetupOpen(true)}
              />

              <p className="mt-3 hidden text-xs text-[#8D82A3] sm:block">
                Keyboard remote: Up/Down = channel · 0–9 = direct tune · C = TV Mode · G = guide · A = 4:3 · M = mute · F = fullscreen · I = info
              </p>
            </div>

            <ChannelRail
              channels={channels}
              schedules={schedules}
              globalAnchor={globalAnchor}
              activeChannelId={activeChannelId}
              favorites={favorites}
              onSelectChannel={tuneChannelById}
              onToggleFavorite={toggleFavorite}
              nowMs={nowMs}
              loading={loading}
            />
          </div>
        </main>
      )}

      {activeView === "guide" && (
        <EpgGuide
          channels={channels}
          schedules={schedules}
          globalAnchor={globalAnchor}
          activeChannelId={activeChannelId}
          onTuneChannel={tuneChannelById}
          nowMs={nowMs}
        />
      )}

      {(activeView === "categories" || activeView === "favorites") && (
        <CategoriesView
          mode={activeView}
          channels={channels}
          schedules={schedules}
          globalAnchor={globalAnchor}
          activeChannelId={activeChannelId}
          favorites={favorites}
          onTuneChannel={tuneChannelById}
          onToggleFavorite={toggleFavorite}
          onBrowseAll={() => setActiveView("categories")}
          nowMs={nowMs}
        />
      )}

      <TvSetupModal
        open={tvSetupOpen}
        onClose={() => setTvSetupOpen(false)}
        onEnterCouchMode={enterCouchMode}
      />

      <OfflineIndicator />
    </div>
  );
}
