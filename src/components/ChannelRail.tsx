import { useMemo, useState } from "react";
import { Heart, Search, X } from "lucide-react";
import type { Channel, ChannelSchedule } from "../types/tv.ts";
import { getNowNext } from "../utils/scheduleEngine.ts";

interface ChannelRailProps {
  channels: Channel[];
  schedules: Record<string, ChannelSchedule>;
  globalAnchor: number;
  activeChannelId: string | null;
  favorites: Set<string>;
  onSelectChannel: (channelId: string) => void;
  onToggleFavorite: (channelId: string) => void;
  nowMs: number;
  loading: boolean;
}

export function ChannelRail({
  channels,
  schedules,
  globalAnchor,
  activeChannelId,
  favorites,
  onSelectChannel,
  onToggleFavorite,
  nowMs,
  loading,
}: ChannelRailProps) {
  const [query, setQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("All");

  const categories = useMemo(() => {
    const seen = new Set<string>();
    for (const ch of channels) {
      if (ch.cat) seen.add(ch.cat);
    }
    return ["All", "Favorites", ...Array.from(seen)];
  }, [channels]);

  const nowSec = nowMs / 1000;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return channels.filter((ch) => {
      if (selectedCategory === "Favorites" && !favorites.has(ch.id)) return false;
      if (
        selectedCategory !== "All" &&
        selectedCategory !== "Favorites" &&
        ch.cat !== selectedCategory
      ) {
        return false;
      }
      if (!q) return true;
      const nowInfo = getNowNext(ch, schedules, globalAnchor, nowSec);
      return (
        String(ch.num).includes(q) ||
        ch.name.toLowerCase().includes(q) ||
        (ch.cat && ch.cat.toLowerCase().includes(q)) ||
        nowInfo.currentTitle.toLowerCase().includes(q)
      );
    });
  }, [channels, selectedCategory, favorites, query, schedules, globalAnchor, nowSec]);

  return (
    <aside
      aria-label="Live channel lineup"
      className="flex h-[560px] flex-col overflow-hidden rounded-xl border border-[#261E38] bg-[#110E1A] lg:h-[calc(100vh-116px)] lg:min-h-[600px]"
    >
      <div className="border-b border-[#261E38] p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-base font-bold text-[#F5F3EE]">
            Live Channels
          </h2>
          <span className="font-mono text-xs text-[#A79EB9] tabular-nums">
            {filtered.length} of {channels.length}
          </span>
        </div>

        {/* Search Input */}
        <div className="relative mt-3">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8D82A3]"
            aria-hidden="true"
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search channels or shows..."
            aria-label="Search channels or currently airing shows"
            className="h-10 w-full rounded-lg border border-[#2D2345] bg-[#09080D] pl-9 pr-8 text-sm text-[#F5F3EE] placeholder-[#7B7092] focus:border-[#DFBA57] focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#A79EB9] hover:text-white cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Category Filter Tabs */}
        <div className="mt-3 flex items-center gap-1.5 overflow-x-auto pb-1">
          {categories.map((cat) => {
            const active = selectedCategory === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`rounded-md px-2.5 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  active
                    ? "kings-gold-btn font-semibold"
                    : "bg-[#181227] text-[#A79EB9] hover:bg-[#231A38] hover:text-[#F5F3EE]"
                }`}
              >
                {cat}
              </button>
            );
          })}
        </div>
      </div>

      {/* Scrollable Channel Rows */}
      <div className="flex-1 overflow-y-auto divide-y divide-[#1E1730]">
        {loading && channels.length === 0 ? (
          Array.from({ length: 10 }).map((_, idx) => (
            <div key={idx} className="flex items-center gap-3 px-4 py-3 animate-pulse">
              <div className="h-5 w-9 rounded bg-[#211936]" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3.5 w-2/3 rounded bg-[#211936]" />
                <div className="h-3 w-4/5 rounded bg-[#181227]" />
              </div>
            </div>
          ))
        ) : filtered.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <p className="text-sm font-medium text-[#D7D1E2]">
              No matching channels found
            </p>
            <p className="text-xs text-[#A79EB9]">
              {selectedCategory === "Favorites"
                ? "Save channels with the heart icon to build your personal lineup."
                : "Try clearing your search filter or switching categories."}
            </p>
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setSelectedCategory("All");
              }}
              className="rounded-lg border border-[#2D2345] bg-[#181227] px-3.5 py-2 text-xs font-medium text-[#F5F3EE] hover:bg-[#231A38] cursor-pointer"
            >
              Show All Channels
            </button>
          </div>
        ) : (
          filtered.map((ch) => {
            const isTuned = ch.id === activeChannelId;
            const isFav = favorites.has(ch.id);
            const nowInfo = getNowNext(ch, schedules, globalAnchor, nowSec);

            return (
              <div
                key={ch.id}
                className={`group flex items-stretch transition-colors ${
                  isTuned
                    ? "bg-gradient-to-r from-[#3B2608]/85 via-[#2C184A]/85 to-[#18112A]"
                    : "hover:bg-[#171229]"
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelectChannel(ch.id)}
                  className="flex min-w-0 flex-1 items-start gap-3 px-4 py-3 text-left cursor-pointer"
                >
                  <span
                    className={`mt-0.5 w-9 shrink-0 font-mono text-sm font-bold tabular-nums ${
                      isTuned
                        ? "text-[#FDE047]"
                        : "text-[#DFBA57]/85 group-hover:text-[#F6D265]"
                    }`}
                  >
                    {String(ch.num).padStart(3, "0")}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`truncate text-sm font-semibold ${
                          isTuned ? "text-[#FFF6D6]" : "text-[#F5F3EE]"
                        }`}
                      >
                        {ch.name}
                      </span>
                    </div>
                    <div
                      className={`mt-0.5 truncate text-xs font-medium ${
                        isTuned ? "text-[#F6D265]" : "text-[#5EEAD4]"
                      }`}
                    >
                      {nowInfo.currentTitle}
                    </div>
                    {nowInfo.durationSec > 0 && (
                      <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-[#241C38]">
                        <div
                          className={`h-full ${
                            isTuned
                              ? "bg-[#DFBA57]"
                              : "bg-gradient-to-r from-[#14B8A6] to-[#38BDF8]"
                          }`}
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
                  className="flex w-10 shrink-0 items-center justify-center text-[#7B7092] transition-colors hover:text-[#DFBA57] cursor-pointer"
                >
                  <Heart
                    className={`h-3.5 w-3.5 ${
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
    </aside>
  );
}
