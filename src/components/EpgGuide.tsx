import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Play, Search, X } from "lucide-react";
import type { Channel, ChannelSchedule, ScheduleItem } from "../types/tv.ts";
import {
  buildEpgWindow,
  formatClock,
  formatDuration,
} from "../utils/scheduleEngine.ts";

interface EpgGuideProps {
  channels: Channel[];
  schedules: Record<string, ChannelSchedule>;
  globalAnchor: number;
  activeChannelId: string | null;
  onTuneChannel: (channelId: string) => void;
  nowMs: number;
}

interface GenrePalette {
  blockClass: string;
  labelTextClass: string;
  tabActiveClass: string;
  tabIdleClass: string;
  accentSwatchClass: string;
}

const GENRE_PALETTES: Record<string, GenrePalette> = {
  "Kids & cartoons": {
    blockClass:
      "border-[#38BDF8]/35 bg-gradient-to-br from-[#0F2942] to-[#0B1D30] text-[#E0F2FE] hover:border-[#38BDF8]/70 hover:from-[#143454] hover:to-[#0E263E]",
    labelTextClass: "text-[#7DD3FC]",
    tabActiveClass:
      "border-[#38BDF8] bg-[#0EA5E9] text-[#05131F] font-semibold shadow-sm",
    tabIdleClass:
      "border-[#1E3A5F] bg-[#0D1A2B] text-[#93C5FD] hover:border-[#38BDF8]/60 hover:text-white",
    accentSwatchClass: "bg-[#38BDF8]",
  },
  "Sitcoms & classic TV": {
    blockClass:
      "border-[#A78BFA]/35 bg-gradient-to-br from-[#261645] to-[#1A0F30] text-[#EDE9FE] hover:border-[#A78BFA]/70 hover:from-[#311C59] hover:to-[#22133E]",
    labelTextClass: "text-[#C4B5FD]",
    tabActiveClass:
      "border-[#A78BFA] bg-[#8B5CF6] text-white font-semibold shadow-sm",
    tabIdleClass:
      "border-[#3B2663] bg-[#19102C] text-[#C4B5FD] hover:border-[#A78BFA]/60 hover:text-white",
    accentSwatchClass: "bg-[#A78BFA]",
  },
  "Action & adventure TV": {
    blockClass:
      "border-[#FB7185]/35 bg-gradient-to-br from-[#3D1424] to-[#290D18] text-[#FFE4E6] hover:border-[#FB7185]/70 hover:from-[#4E192E] hover:to-[#35101F]",
    labelTextClass: "text-[#FDA4AF]",
    tabActiveClass:
      "border-[#FB7185] bg-[#F43F5E] text-white font-semibold shadow-sm",
    tabIdleClass:
      "border-[#5B2036] bg-[#260E18] text-[#FDA4AF] hover:border-[#FB7185]/60 hover:text-white",
    accentSwatchClass: "bg-[#FB7185]",
  },
  "Drama, mystery & sci-fi": {
    blockClass:
      "border-[#818CF8]/35 bg-gradient-to-br from-[#1B1D4A] to-[#121436] text-[#E0E7FF] hover:border-[#818CF8]/70 hover:from-[#232661] hover:to-[#181A47]",
    labelTextClass: "text-[#A5B4FC]",
    tabActiveClass:
      "border-[#818CF8] bg-[#6366F1] text-white font-semibold shadow-sm",
    tabIdleClass:
      "border-[#313470] bg-[#141638] text-[#A5B4FC] hover:border-[#818CF8]/60 hover:text-white",
    accentSwatchClass: "bg-[#818CF8]",
  },
  Movies: {
    blockClass:
      "border-[#F59E0B]/35 bg-gradient-to-br from-[#3A200C] to-[#261407] text-[#FEF3C7] hover:border-[#F59E0B]/70 hover:from-[#4C2A10] hover:to-[#321B0A]",
    labelTextClass: "text-[#FCD34D]",
    tabActiveClass:
      "border-[#F59E0B] bg-[#F59E0B] text-[#1A0D02] font-semibold shadow-sm",
    tabIdleClass:
      "border-[#5A3413] bg-[#241408] text-[#FCD34D] hover:border-[#F59E0B]/60 hover:text-white",
    accentSwatchClass: "bg-[#F59E0B]",
  },
  Music: {
    blockClass:
      "border-[#E879F9]/35 bg-gradient-to-br from-[#391240] to-[#260B2B] text-[#FAE8FF] hover:border-[#E879F9]/70 hover:from-[#4B1854] hover:to-[#320F38]",
    labelTextClass: "text-[#F0ABFC]",
    tabActiveClass:
      "border-[#E879F9] bg-[#D946EF] text-white font-semibold shadow-sm",
    tabIdleClass:
      "border-[#591F63] bg-[#240D29] text-[#F0ABFC] hover:border-[#E879F9]/60 hover:text-white",
    accentSwatchClass: "bg-[#E879F9]",
  },
  "News, nature & science": {
    blockClass:
      "border-[#34D399]/35 bg-gradient-to-br from-[#0E3329] to-[#09231C] text-[#D1FAE5] hover:border-[#34D399]/70 hover:from-[#134537] hover:to-[#0D3026]",
    labelTextClass: "text-[#6EE7B7]",
    tabActiveClass:
      "border-[#34D399] bg-[#10B981] text-[#031F15] font-semibold shadow-sm",
    tabIdleClass:
      "border-[#1C5444] bg-[#0B241D] text-[#6EE7B7] hover:border-[#34D399]/60 hover:text-white",
    accentSwatchClass: "bg-[#34D399]",
  },
  "Home, food & fitness": {
    blockClass:
      "border-[#FB923C]/35 bg-gradient-to-br from-[#3B1F0F] to-[#271409] text-[#FFEDD5] hover:border-[#FB923C]/70 hover:from-[#4D2914] hover:to-[#331A0C]",
    labelTextClass: "text-[#FDBA74]",
    tabActiveClass:
      "border-[#FB923C] bg-[#F97316] text-[#1D0B02] font-semibold shadow-sm",
    tabIdleClass:
      "border-[#5C3118] bg-[#24130A] text-[#FDBA74] hover:border-[#FB923C]/60 hover:text-white",
    accentSwatchClass: "bg-[#FB923C]",
  },
  Sports: {
    blockClass:
      "border-[#A3E635]/35 bg-gradient-to-br from-[#23330E] to-[#172208] text-[#ECFCCB] hover:border-[#A3E635]/70 hover:from-[#2E4313] hover:to-[#1F2D0B]",
    labelTextClass: "text-[#BEF264]",
    tabActiveClass:
      "border-[#A3E635] bg-[#84CC16] text-[#0E1703] font-semibold shadow-sm",
    tabIdleClass:
      "border-[#3A5218] bg-[#18230A] text-[#BEF264] hover:border-[#A3E635]/60 hover:text-white",
    accentSwatchClass: "bg-[#A3E635]",
  },
  "Soap operas & novelas": {
    blockClass:
      "border-[#F472B6]/35 bg-gradient-to-br from-[#3B142B] to-[#270C1C] text-[#FCE7F3] hover:border-[#F472B6]/70 hover:from-[#4D1A38] hover:to-[#331025]",
    labelTextClass: "text-[#F9A8D4]",
    tabActiveClass:
      "border-[#F472B6] bg-[#EC4899] text-white font-semibold shadow-sm",
    tabIdleClass:
      "border-[#5C2043] bg-[#240D1B] text-[#F9A8D4] hover:border-[#F472B6]/60 hover:text-white",
    accentSwatchClass: "bg-[#F472B6]",
  },
  Holiday: {
    blockClass:
      "border-[#F87171]/35 bg-gradient-to-br from-[#3C1418] to-[#280C0F] text-[#FEE2E2] hover:border-[#F87171]/70 hover:from-[#4F1A20] hover:to-[#351014]",
    labelTextClass: "text-[#FCA5A5]",
    tabActiveClass:
      "border-[#F87171] bg-[#EF4444] text-white font-semibold shadow-sm",
    tabIdleClass:
      "border-[#5E2026] bg-[#260D10] text-[#FCA5A5] hover:border-[#F87171]/60 hover:text-white",
    accentSwatchClass: "bg-[#F87171]",
  },
  "New Network Additions": {
    blockClass:
      "border-[#60A5FA]/35 bg-gradient-to-br from-[#132544] to-[#0C182E] text-[#DBEAFE] hover:border-[#60A5FA]/70 hover:from-[#193159] hover:to-[#10203D]",
    labelTextClass: "text-[#93C5FD]",
    tabActiveClass:
      "border-[#60A5FA] bg-[#3B82F6] text-white font-semibold shadow-sm",
    tabIdleClass:
      "border-[#233E6E] bg-[#0F1B33] text-[#93C5FD] hover:border-[#60A5FA]/60 hover:text-white",
    accentSwatchClass: "bg-[#60A5FA]",
  },
};

const DEFAULT_GENRE_PALETTE: GenrePalette = {
  blockClass:
    "border-[#8B5CF6]/30 bg-gradient-to-br from-[#1E1535] to-[#140E24] text-[#EDE9FE] hover:border-[#8B5CF6]/65 hover:from-[#281C46] hover:to-[#1B1331]",
  labelTextClass: "text-[#C4B5FD]",
  tabActiveClass: "kings-gold-btn border-[#DFBA57] font-semibold",
  tabIdleClass:
    "border-[#2D2345] bg-[#141021] text-[#D7D1E2] hover:border-[#DFBA57]/60 hover:text-white",
  accentSwatchClass: "bg-[#DFBA57]",
};

function getGenrePalette(cat?: string): GenrePalette {
  if (!cat) return DEFAULT_GENRE_PALETTE;
  return GENRE_PALETTES[cat] || DEFAULT_GENRE_PALETTE;
}

const WINDOW_HOURS = 3;
const SLOT_MINUTES = 30;
const PIXELS_PER_MINUTE = 6; // 180px per 30m, 1080px for 3 hours

export function EpgGuide({
  channels,
  schedules,
  globalAnchor,
  activeChannelId,
  onTuneChannel,
  nowMs,
}: EpgGuideProps) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [hourOffset, setHourOffset] = useState(0);
  const [selectedUpcoming, setSelectedUpcoming] = useState<{
    channel: Channel;
    item: ScheduleItem;
    startSec: number;
    endSec: number;
  } | null>(null);

  const nowSec = nowMs / 1000;

  // Align guide start to the current 30-minute boundary + offset
  const windowStartSec = useMemo(() => {
    const baseHalfHour = Math.floor(nowSec / 1800) * 1800;
    return baseHalfHour + hourOffset * 3600;
  }, [Math.floor(nowSec / 60), hourOffset]);

  const windowEndSec = windowStartSec + WINDOW_HOURS * 3600;
  const totalWidthPx = WINDOW_HOURS * 60 * PIXELS_PER_MINUTE;

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const ch of channels) {
      if (ch.cat) set.add(ch.cat);
    }
    return ["All", ...Array.from(set)];
  }, [channels]);

  const filteredChannels = useMemo(() => {
    const q = query.trim().toLowerCase();
    return channels.filter((ch) => {
      if (category !== "All" && ch.cat !== category) return false;
      if (!q) return true;
      return (
        String(ch.num).includes(q) ||
        ch.name.toLowerCase().includes(q) ||
        (ch.blurb && ch.blurb.toLowerCase().includes(q))
      );
    });
  }, [channels, category, query]);

  const timeTicks = useMemo(() => {
    const ticks: number[] = [];
    for (let t = windowStartSec; t < windowEndSec; t += SLOT_MINUTES * 60) {
      ticks.push(t);
    }
    return ticks;
  }, [windowStartSec, windowEndSec]);

  const nowLineLeftPx =
    nowSec >= windowStartSec && nowSec <= windowEndSec
      ? ((nowSec - windowStartSec) / 60) * PIXELS_PER_MINUTE
      : null;

  return (
    <section className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6">
      <div className="flex flex-col gap-4 border-b border-[#2D2345] pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#F5F3EE] sm:text-3xl">
            Channel Guide
          </h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#C7BED8]">
            <span>Synchronized 24/7 broadcast schedule</span>
            <span aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1.5 font-semibold text-[#5EEAD4]">
              <span className="h-2.5 w-2.5 rounded-sm bg-[#14B8A6]" aria-hidden="true" />
              On Now
            </span>
            <span className="inline-flex items-center gap-1.5 font-semibold text-[#F6D265]">
              <span className="h-2.5 w-2.5 rounded-sm bg-[#DFBA57]" aria-hidden="true" />
              Watching Live
            </span>
            <span className="inline-flex items-center gap-1.5 text-[#C4B5FD]">
              <span className="h-2.5 w-2.5 rounded-sm bg-[#8B5CF6]" aria-hidden="true" />
              Upcoming by Genre
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#A79EB9]"
              aria-hidden="true"
            />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter channels..."
              aria-label="Filter guide channels"
              className="h-10 w-56 rounded-lg border border-[#3B2E58] bg-[#130E20] pl-9 pr-8 text-sm text-[#F5F3EE] placeholder-[#8D82A3] focus:border-[#DFBA57] focus:outline-none"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear filter"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#A79EB9] hover:text-white cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="flex items-center overflow-hidden rounded-lg border border-[#3B2E58] bg-[#130E20]">
            <button
              type="button"
              onClick={() => setHourOffset((h) => Math.max(-2, h - 1))}
              className="flex h-10 items-center gap-1 px-3 text-xs font-medium text-[#E5E0EE] hover:bg-[#1E1633] cursor-pointer"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              <span>Earlier</span>
            </button>
            <button
              type="button"
              onClick={() => setHourOffset(0)}
              className={`h-10 border-x border-[#3B2E58] px-3 text-xs font-semibold cursor-pointer ${
                hourOffset === 0
                  ? "bg-[#DFBA57]/15 text-[#F6D265]"
                  : "text-[#E5E0EE] hover:bg-[#1E1633]"
              }`}
            >
              Now
            </button>
            <button
              type="button"
              onClick={() => setHourOffset((h) => Math.min(6, h + 1))}
              className="flex h-10 items-center gap-1 px-3 text-xs font-medium text-[#E5E0EE] hover:bg-[#1E1633] cursor-pointer"
            >
              <span>Later</span>
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      {/* Color-Coded Category Filter Strip */}
      <div className="mt-4 flex items-center gap-2 overflow-x-auto pb-2">
        {categories.map((cat) => {
          const isSelected = category === cat;
          const palette = getGenrePalette(cat === "All" ? undefined : cat);
          return (
            <button
              key={cat}
              type="button"
              onClick={() => setCategory(cat)}
              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                isSelected ? palette.tabActiveClass : palette.tabIdleClass
              }`}
            >
              {cat !== "All" && (
                <span
                  aria-hidden="true"
                  className={`h-2 w-2 rounded-sm ${
                    isSelected ? "bg-current opacity-75" : palette.accentSwatchClass
                  }`}
                />
              )}
              <span>{cat}</span>
            </button>
          );
        })}
      </div>

      {/* Upcoming Program Detail Bar (when user inspects a future slot) */}
      {selectedUpcoming && (
        <div className="mt-4 flex flex-col gap-3 rounded-xl border border-[#2DD4BF]/50 bg-gradient-to-r from-[#0F2A33] via-[#17122B] to-[#1E1535] p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs text-[#5EEAD4]">
              <span className="font-mono font-bold text-[#DFBA57] tabular-nums">
                Ch {selectedUpcoming.channel.num}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-semibold text-[#F5F3EE]">
                {selectedUpcoming.channel.name}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono text-[#99F6E4] tabular-nums">
                {formatClock(selectedUpcoming.startSec * 1000)} –{" "}
                {formatClock(selectedUpcoming.endSec * 1000)}
              </span>
            </div>
            <div className="mt-1 font-display text-base font-bold text-white">
              {selectedUpcoming.item.t}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onTuneChannel(selectedUpcoming.channel.id)}
              className="kings-gold-btn inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold cursor-pointer"
            >
              <Play className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
              <span>Watch Channel Live</span>
            </button>
            <button
              type="button"
              onClick={() => setSelectedUpcoming(null)}
              aria-label="Close program preview"
              className="rounded-lg border border-[#3B2E58] bg-[#140F22] px-3 py-2 text-xs text-[#D7D1E2] hover:text-white cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* EPG Timeline Grid */}
      <div className="mt-4 overflow-hidden rounded-xl border border-[#2F244A] bg-[#0E0B17]">
        <div className="overflow-x-auto">
          <div style={{ minWidth: `${240 + totalWidthPx}px` }}>
            {/* Time Ruler Header */}
            <div className="flex border-b border-[#2F244A] bg-gradient-to-r from-[#1A122C] via-[#151530] to-[#111E32]">
              <div className="sticky left-0 z-20 flex h-11 w-60 shrink-0 items-center justify-between border-r border-[#2F244A] bg-[#19122A] px-4 text-xs font-semibold text-[#F6D265]">
                <span>Channels</span>
                <span className="font-mono text-[#C7BED8] tabular-nums">
                  {filteredChannels.length}
                </span>
              </div>
              <div className="relative flex flex-1" style={{ width: `${totalWidthPx}px` }}>
                {timeTicks.map((tick, idx) => (
                  <div
                    key={tick}
                    style={{ width: `${SLOT_MINUTES * PIXELS_PER_MINUTE}px` }}
                    className={`flex h-11 shrink-0 items-center border-r border-[#2D2345] px-3 font-mono text-xs font-semibold tabular-nums ${
                      idx === 0 && hourOffset === 0
                        ? "bg-[#0F3D3E]/45 text-[#5EEAD4]"
                        : "text-[#E2DCF0]"
                    }`}
                  >
                    {formatClock(tick * 1000)}
                  </div>
                ))}
                {nowLineLeftPx !== null && (
                  <div
                    aria-hidden="true"
                    style={{ left: `${nowLineLeftPx}px` }}
                    className="absolute bottom-0 top-0 z-10 w-0.5 bg-[#2DD4BF] shadow-[0_0_8px_rgba(45,212,191,0.7)]"
                  />
                )}
              </div>
            </div>

            {/* Channel Rows */}
            <div className="max-h-[62vh] overflow-y-auto divide-y divide-[#221A36]">
              {filteredChannels.length === 0 ? (
                <div className="px-6 py-12 text-center text-sm text-[#A79EB9]">
                  No channels match your current filter.
                </div>
              ) : (
                filteredChannels.map((ch) => {
                  const isTuned = ch.id === activeChannelId;
                  const palette = getGenrePalette(ch.cat);
                  const blocks = buildEpgWindow(
                    ch,
                    schedules,
                    globalAnchor,
                    windowStartSec,
                    windowEndSec,
                    nowSec
                  );

                  return (
                    <div key={ch.id} className="flex h-16">
                      {/* Sticky Channel Cell */}
                      <button
                        type="button"
                        onClick={() => onTuneChannel(ch.id)}
                        className={`sticky left-0 z-10 flex w-60 shrink-0 items-center gap-3 border-r border-[#2F244A] px-4 text-left transition-colors cursor-pointer ${
                          isTuned
                            ? "bg-gradient-to-r from-[#3B2608] to-[#231438] text-[#F6E2A0]"
                            : "bg-[#120E1E] text-[#F5F3EE] hover:bg-[#1B1430]"
                        }`}
                      >
                        <span
                          className={`w-9 shrink-0 font-mono text-sm font-bold tabular-nums ${
                            isTuned ? "text-[#FDE047]" : "text-[#DFBA57]"
                          }`}
                        >
                          {String(ch.num).padStart(3, "0")}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold">
                            {ch.name}
                          </div>
                          {ch.cat && (
                            <div
                              className={`truncate text-[11px] font-medium ${
                                isTuned ? "text-[#F6D265]" : palette.labelTextClass
                              }`}
                            >
                              {ch.cat}
                            </div>
                          )}
                        </div>
                      </button>

                      {/* Program Blocks Timeline */}
                      <div
                        className="relative flex-1 bg-[#0A0812]"
                        style={{ width: `${totalWidthPx}px` }}
                      >
                        {nowLineLeftPx !== null && (
                          <div
                            aria-hidden="true"
                            style={{ left: `${nowLineLeftPx}px` }}
                            className="pointer-events-none absolute bottom-0 top-0 z-10 w-px bg-[#2DD4BF]/70"
                          />
                        )}

                        {blocks.length === 0 ? (
                          <div className="flex h-full items-center px-3 text-xs text-[#8D82A3]">
                            Schedule syncing...
                          </div>
                        ) : (
                          blocks.map((block, bIdx) => {
                            const leftPx =
                              ((block.startSec - windowStartSec) / 60) *
                              PIXELS_PER_MINUTE;
                            const widthPx = Math.max(
                              24,
                              ((block.endSec - block.startSec) / 60) *
                                PIXELS_PER_MINUTE
                            );

                            let blockStyleClass = palette.blockClass;
                            let metaTextClass = "text-[#CBD5E1]/85";

                            if (block.isLive && isTuned) {
                              blockStyleClass =
                                "border-[#FDE047] bg-gradient-to-br from-[#F3D98B] via-[#DFBA57] to-[#C28F2C] text-[#09080D] shadow-[0_0_14px_rgba(223,186,87,0.35)]";
                              metaTextClass = "text-[#221905]";
                            } else if (block.isLive) {
                              blockStyleClass =
                                "border-[#2DD4BF]/85 bg-gradient-to-br from-[#0F525C] via-[#134E4A] to-[#0B363C] text-white shadow-[inset_0_1px_0_rgba(94,234,212,0.28)] hover:from-[#136470] hover:to-[#0E444B]";
                              metaTextClass = "text-[#99F6E4]";
                            }

                            return (
                              <button
                                key={`${ch.id}-${block.startSec}-${bIdx}`}
                                type="button"
                                onClick={() => {
                                  if (block.isLive) {
                                    onTuneChannel(ch.id);
                                  } else {
                                    setSelectedUpcoming({
                                      channel: ch,
                                      item: block.item,
                                      startSec: block.startSec,
                                      endSec: block.endSec,
                                    });
                                  }
                                }}
                                style={{
                                  left: `${leftPx}px`,
                                  width: `${widthPx}px`,
                                }}
                                title={`${block.isLive ? "ON NOW: " : ""}${
                                  block.item.t
                                } (${formatClock(block.startSec * 1000)})`}
                                className={`absolute bottom-1 top-1 flex flex-col justify-center overflow-hidden rounded-lg border px-2.5 text-left transition-colors cursor-pointer ${blockStyleClass}`}
                              >
                                <div className="flex items-center gap-1.5 min-w-0">
                                  {block.isLive && widthPx > 85 && (
                                    <span
                                      className={`shrink-0 font-mono text-[10px] font-bold tracking-wide ${
                                        isTuned ? "text-[#09080D]" : "text-[#5EEAD4]"
                                      }`}
                                    >
                                      {isTuned ? "WATCHING" : "ON NOW"}
                                    </span>
                                  )}
                                  {block.isLive && widthPx > 85 && (
                                    <span aria-hidden="true" className={metaTextClass}>
                                      ·
                                    </span>
                                  )}
                                  <span
                                    className={`truncate text-xs ${
                                      block.isLive ? "font-bold" : "font-semibold"
                                    }`}
                                  >
                                    {block.item.t}
                                  </span>
                                </div>
                                {widthPx > 95 && (
                                  <div
                                    className={`mt-0.5 truncate font-mono text-[10px] tabular-nums ${metaTextClass}`}
                                  >
                                    {formatClock(block.startSec * 1000)} ·{" "}
                                    {formatDuration(block.item.d)}
                                  </div>
                                )}
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
