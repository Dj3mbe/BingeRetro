import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Heart,
  List,
  Maximize,
  Monitor,
  Shuffle,
  Smartphone,
  Tv,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import type { Channel, ChannelSchedule } from "../types/tv.ts";
import { formatClock, getNowNext } from "../utils/scheduleEngine.ts";

interface CouchModeOverlayProps {
  channels: Channel[];
  schedules: Record<string, ChannelSchedule>;
  globalAnchor: number;
  activeChannelId: string | null;
  favorites: Set<string>;
  guideOpen: boolean;
  onSetGuideOpen: (open: boolean) => void;
  onSelectChannel: (channelId: string) => void;
  onStepChannel: (delta: number) => void;
  onShuffleChannel: () => void;
  onToggleFavorite: (channelId: string) => void;
  volume: number;
  muted: boolean;
  onToggleMute: () => void;
  aspect43: boolean;
  onToggleAspect43: () => void;
  scanlines: boolean;
  onToggleScanlines: () => void;
  onFullscreen: () => void;
  onOpenTvSetup: () => void;
  onExitCouchMode: () => void;
  nowMs: number;
}

export function CouchModeOverlay({
  channels,
  schedules,
  globalAnchor,
  activeChannelId,
  favorites,
  guideOpen,
  onSetGuideOpen,
  onSelectChannel,
  onStepChannel,
  onShuffleChannel,
  onToggleFavorite,
  muted,
  onToggleMute,
  aspect43,
  onToggleAspect43,
  scanlines,
  onToggleScanlines,
  onFullscreen,
  onOpenTvSetup,
  onExitCouchMode,
  nowMs,
}: CouchModeOverlayProps) {
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [hudVisible, setHudVisible] = useState(true);

  const hudTimerRef = useRef<number | null>(null);
  const rowRefs = useRef<Array<HTMLDivElement | null>>([]);
  const nowSec = nowMs / 1000;

  const categories = useMemo(() => {
    const seen = new Set<string>();
    for (const ch of channels) {
      if (ch.cat) seen.add(ch.cat);
    }
    return ["All", "Favorites", ...Array.from(seen)];
  }, [channels]);

  const filteredChannels = useMemo(() => {
    return channels.filter((ch) => {
      if (selectedCategory === "Favorites") return favorites.has(ch.id);
      if (selectedCategory !== "All") return ch.cat === selectedCategory;
      return true;
    });
  }, [channels, selectedCategory, favorites]);

  // Show minimal edge HUD briefly on pointer move/touch when drawer is closed
  useEffect(() => {
    if (guideOpen) {
      setHudVisible(false);
      return;
    }

    const revealHud = () => {
      setHudVisible(true);
      if (hudTimerRef.current) window.clearTimeout(hudTimerRef.current);
      hudTimerRef.current = window.setTimeout(() => {
        setHudVisible(false);
      }, 3200);
    };

    revealHud();
    window.addEventListener("mousemove", revealHud);
    window.addEventListener("touchstart", revealHud);
    return () => {
      if (hudTimerRef.current) window.clearTimeout(hudTimerRef.current);
      window.removeEventListener("mousemove", revealHud);
      window.removeEventListener("touchstart", revealHud);
    };
  }, [guideOpen, activeChannelId]);

  // Snap D-pad focus to the currently playing channel when opening the drawer
  useEffect(() => {
    if (!guideOpen) return;
    const idx = filteredChannels.findIndex((c) => c.id === activeChannelId);
    setFocusedIndex(idx >= 0 ? idx : 0);
  }, [guideOpen, activeChannelId, selectedCategory]);

  // Smoothly scroll D-pad focused row into view
  useEffect(() => {
    if (!guideOpen) return;
    const el = rowRefs.current[focusedIndex];
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [guideOpen, focusedIndex]);

  // D-pad remote keyboard handler while drawer is open
  useEffect(() => {
    if (!guideOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        e.stopPropagation();
        if (filteredChannels.length === 0) return;
        setFocusedIndex((i) => (i + 1) % filteredChannels.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        e.stopPropagation();
        if (filteredChannels.length === 0) return;
        setFocusedIndex(
          (i) => (i - 1 + filteredChannels.length) % filteredChannels.length
        );
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        e.stopPropagation();
        const catIdx = categories.indexOf(selectedCategory);
        const nextCat = categories[(catIdx + 1) % categories.length];
        setSelectedCategory(nextCat);
        setFocusedIndex(0);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        e.stopPropagation();
        const catIdx = categories.indexOf(selectedCategory);
        const prevCat =
          categories[(catIdx - 1 + categories.length) % categories.length];
        setSelectedCategory(prevCat);
        setFocusedIndex(0);
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        e.stopPropagation();
        const target = filteredChannels[focusedIndex];
        if (target) {
          onSelectChannel(target.id);
          onSetGuideOpen(false);
        }
      } else if (e.key === "Escape" || e.key === "Backspace") {
        e.preventDefault();
        e.stopPropagation();
        onSetGuideOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [
    guideOpen,
    filteredChannels,
    focusedIndex,
    categories,
    selectedCategory,
    onSelectChannel,
    onSetGuideOpen,
  ]);

  return (
    <>
      {/* Subtle auto-hiding top edge controls for touch / mouse users in Couch Mode */}
      {!guideOpen && (
        <div
          className={`pointer-events-none fixed inset-x-0 top-0 z-30 flex items-center justify-between gap-3 bg-gradient-to-b from-black/80 via-black/40 to-transparent px-5 py-4 transition-opacity duration-300 ${
            hudVisible ? "opacity-100" : "opacity-0"
          }`}
        >
          <div className="pointer-events-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => onSetGuideOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-[#DFBA57]/30 bg-[#0D0A14]/90 px-4 py-2.5 text-sm font-semibold text-white backdrop-blur-sm hover:border-[#DFBA57] hover:text-[#F3D98B] cursor-pointer"
            >
              <List className="h-4 w-4 text-[#DFBA57]" aria-hidden="true" />
              <span>TV Guide (←)</span>
            </button>
            <div className="flex items-center overflow-hidden rounded-lg border border-white/20 bg-[#0D0A14]/90 backdrop-blur-sm">
              <button
                type="button"
                onClick={() => onStepChannel(-1)}
                aria-label="Channel down"
                className="flex items-center gap-1 px-3 py-2.5 text-sm font-semibold text-white hover:bg-white/10 cursor-pointer"
              >
                <ChevronDown className="h-4 w-4" aria-hidden="true" />
                <span>CH</span>
              </button>
              <button
                type="button"
                onClick={() => onStepChannel(1)}
                aria-label="Channel up"
                className="flex items-center gap-1 border-l border-white/15 px-3 py-2.5 text-sm font-semibold text-white hover:bg-white/10 cursor-pointer"
              >
                <span>CH</span>
                <ChevronUp className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <button
              type="button"
              onClick={onShuffleChannel}
              aria-label="Shuffle channel"
              className="hidden sm:inline-flex items-center gap-1.5 rounded-lg border border-white/20 bg-[#0D0A14]/90 px-3.5 py-2.5 text-sm font-medium text-white backdrop-blur-sm hover:border-[#DFBA57] cursor-pointer"
            >
              <Shuffle className="h-4 w-4 text-[#DFBA57]" aria-hidden="true" />
              <span>Shuffle</span>
            </button>
          </div>

          <div className="pointer-events-auto flex items-center gap-2">
            <button
              type="button"
              onClick={onToggleMute}
              aria-label={muted ? "Unmute" : "Mute"}
              className="rounded-lg border border-white/20 bg-[#0D0A14]/90 p-2.5 text-white backdrop-blur-sm hover:border-[#DFBA57] cursor-pointer"
            >
              {muted ? (
                <VolumeX className="h-4 w-4 text-red-400" aria-hidden="true" />
              ) : (
                <Volume2 className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
            <button
              type="button"
              onClick={onFullscreen}
              aria-label="Toggle fullscreen"
              className="hidden sm:inline-flex rounded-lg border border-white/20 bg-[#0D0A14]/90 p-2.5 text-white backdrop-blur-sm hover:border-[#DFBA57] cursor-pointer"
            >
              <Maximize className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={onExitCouchMode}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/20 bg-[#0D0A14]/90 px-3.5 py-2.5 text-sm font-semibold text-white backdrop-blur-sm hover:border-[#DFBA57] cursor-pointer"
            >
              <X className="h-4 w-4" aria-hidden="true" />
              <span>Exit TV Mode</span>
            </button>
          </div>
        </div>
      )}

      {/* 10-Foot Slide-Out Channel Guide Drawer */}
      {guideOpen && (
        <div
          className="fixed inset-0 z-40 flex bg-black/55 backdrop-blur-[2px]"
          onClick={() => onSetGuideOpen(false)}
        >
          <aside
            aria-label="TV Mode Channel Guide"
            onClick={(e) => e.stopPropagation()}
            className="flex h-full w-full max-w-2xl flex-col border-r border-[#261E38] bg-[#0B0912]/95 shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[#261E38] px-6 py-4">
              <div className="flex items-center gap-3">
                <img
                  src="/bingeretro-logo.png"
                  alt="BingeRetro crown TV emblem"
                  referrerPolicy="no-referrer"
                  className="h-9 w-9 rounded-lg border border-[#DFBA57]/40 bg-[#1B0B31] object-cover"
                />
                <div>
                  <h2 className="font-display text-xl font-bold text-[#F5F3EE]">
                    BingeRetro · TV Mode
                  </h2>
                  <p className="text-xs text-[#A79EB9]">
                    {filteredChannels.length} channels in{" "}
                    <span className="text-[#DFBA57]">{selectedCategory}</span>
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm font-semibold text-[#D7D1E2] tabular-nums">
                  {formatClock(nowMs)}
                </span>
                <button
                  type="button"
                  onClick={() => onSetGuideOpen(false)}
                  aria-label="Close TV Mode guide"
                  className="rounded-lg border border-[#2D2345] bg-[#181227] p-2 text-[#EFECE6] hover:bg-[#231A38] cursor-pointer"
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
            </div>

            {/* Category Strip (← / → D-pad navigable) */}
            <div className="flex items-center gap-2 overflow-x-auto border-b border-[#261E38] px-6 py-3">
              {categories.map((cat) => {
                const active = selectedCategory === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => {
                      setSelectedCategory(cat);
                      setFocusedIndex(0);
                    }}
                    className={`rounded-lg px-3.5 py-2 text-sm font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                      active
                        ? "kings-gold-btn"
                        : "bg-[#141020] text-[#A79EB9] hover:bg-[#1E1630] hover:text-white"
                    }`}
                  >
                    {cat}
                  </button>
                );
              })}
            </div>

            {/* 10-Foot Channel List */}
            <div className="flex-1 overflow-y-auto divide-y divide-[#1E1730] px-3 py-2">
              {filteredChannels.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center p-8 text-center">
                  <p className="text-base font-medium text-[#D7D1E2]">
                    No channels in {selectedCategory}
                  </p>
                  <button
                    type="button"
                    onClick={() => setSelectedCategory("All")}
                    className="kings-gold-btn mt-4 rounded-lg px-4 py-2 text-sm font-semibold cursor-pointer"
                  >
                    Show All Channels
                  </button>
                </div>
              ) : (
                filteredChannels.map((ch, idx) => {
                  const isTuned = ch.id === activeChannelId;
                  const isFocused = idx === focusedIndex;
                  const isFav = favorites.has(ch.id);
                  const nowInfo = getNowNext(ch, schedules, globalAnchor, nowSec);

                  return (
                    <div
                      key={ch.id}
                      ref={(el) => {
                        rowRefs.current[idx] = el;
                      }}
                      className={`my-1 flex items-center gap-3 rounded-xl px-4 py-3.5 transition-all ${
                        isFocused
                          ? "bg-[#4C1D95]/35 ring-2 ring-[#DFBA57]"
                          : isTuned
                          ? "bg-[#1B132B]"
                          : "hover:bg-[#151022]"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          onSelectChannel(ch.id);
                          onSetGuideOpen(false);
                        }}
                        onMouseEnter={() => setFocusedIndex(idx)}
                        className="flex min-w-0 flex-1 items-center gap-4 text-left cursor-pointer"
                      >
                        <span
                          className={`w-12 shrink-0 font-mono text-xl font-bold tabular-nums ${
                            isTuned || isFocused
                              ? "text-[#DFBA57]"
                              : "text-[#A79EB9]"
                          }`}
                        >
                          {String(ch.num).padStart(3, "0")}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate font-display text-lg font-bold text-[#F5F3EE]">
                              {ch.name}
                            </span>
                            {isTuned && (
                              <span className="text-xs font-mono font-semibold text-[#DFBA57]">
                                · LIVE
                              </span>
                            )}
                          </div>
                          <div className="mt-0.5 truncate text-sm text-[#D7D1E2]">
                            {nowInfo.currentTitle}
                          </div>
                          {nowInfo.durationSec > 0 && (
                            <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-[#261E38]">
                              <div
                                className="h-full bg-[#DFBA57]"
                                style={{ width: `${nowInfo.progressPct}%` }}
                              />
                            </div>
                          )}
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => onToggleFavorite(ch.id)}
                        aria-label={
                          isFav
                            ? `Remove ${ch.name} from favorites`
                            : `Save ${ch.name} to favorites`
                        }
                        className="rounded-lg p-2.5 text-[#A79EB9] hover:bg-[#231A38] hover:text-[#DFBA57] cursor-pointer"
                      >
                        <Heart
                          className={`h-5 w-5 ${
                            isFav ? "fill-[#DFBA57] text-[#DFBA57]" : ""
                          }`}
                          aria-hidden="true"
                        />
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            {/* Bottom Quick Settings & Remote Legend */}
            <div className="border-t border-[#261E38] bg-[#0D0A14] px-6 py-3.5">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={onToggleMute}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#2D2345] bg-[#181227] px-3 py-2 text-xs font-semibold text-[#EFECE6] hover:bg-[#231A38] cursor-pointer"
                >
                  {muted ? (
                    <VolumeX className="h-3.5 w-3.5 text-red-400" />
                  ) : (
                    <Volume2 className="h-3.5 w-3.5" />
                  )}
                  <span>{muted ? "Unmute" : "Mute"}</span>
                </button>
                <button
                  type="button"
                  onClick={onToggleAspect43}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold cursor-pointer ${
                    aspect43
                      ? "border-[#DFBA57]/60 bg-[#3B186B]/40 text-[#F3D98B]"
                      : "border-[#2D2345] bg-[#181227] text-[#EFECE6] hover:bg-[#231A38]"
                  }`}
                >
                  <Monitor className="h-3.5 w-3.5" />
                  <span>{aspect43 ? "4:3" : "16:9"}</span>
                </button>
                <button
                  type="button"
                  onClick={onToggleScanlines}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold cursor-pointer ${
                    scanlines
                      ? "border-[#DFBA57]/60 bg-[#3B186B]/40 text-[#F3D98B]"
                      : "border-[#2D2345] bg-[#181227] text-[#EFECE6] hover:bg-[#231A38]"
                  }`}
                >
                  <Tv className="h-3.5 w-3.5" />
                  <span>CRT</span>
                </button>
                <button
                  type="button"
                  onClick={onOpenTvSetup}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#2D2345] bg-[#181227] px-3 py-2 text-xs font-semibold text-[#EFECE6] hover:bg-[#231A38] cursor-pointer"
                >
                  <Smartphone className="h-3.5 w-3.5 text-[#DFBA57]" />
                  <span>APK / TV Setup</span>
                </button>
                <button
                  type="button"
                  onClick={onExitCouchMode}
                  className="kings-gold-btn ml-auto inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold cursor-pointer"
                >
                  <span>Exit TV Mode</span>
                </button>
              </div>
              <p className="mt-2.5 font-mono text-[11px] text-[#A79EB9]">
                Remote D-pad: ↑/↓ Select channel · ←/→ Switch category · OK Watch · Esc Close
              </p>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
