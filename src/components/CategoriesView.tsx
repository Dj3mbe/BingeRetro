import { useMemo } from "react";
import { Heart, Play } from "lucide-react";
import type { Channel, ChannelSchedule } from "../types/tv.ts";
import { getNowNext } from "../utils/scheduleEngine.ts";

interface CategoriesViewProps {
  mode: "categories" | "favorites";
  channels: Channel[];
  schedules: Record<string, ChannelSchedule>;
  globalAnchor: number;
  activeChannelId: string | null;
  favorites: Set<string>;
  onTuneChannel: (channelId: string) => void;
  onToggleFavorite: (channelId: string) => void;
  onBrowseAll: () => void;
  nowMs: number;
}

export function CategoriesView({
  mode,
  channels,
  schedules,
  globalAnchor,
  activeChannelId,
  favorites,
  onTuneChannel,
  onToggleFavorite,
  onBrowseAll,
  nowMs,
}: CategoriesViewProps) {
  const nowSec = nowMs / 1000;

  const grouped = useMemo(() => {
    if (mode === "favorites") {
      const favChannels = channels.filter((ch) => favorites.has(ch.id));
      return favChannels.length
        ? [{ category: "Saved Channels", items: favChannels }]
        : [];
    }

    const map = new Map<string, Channel[]>();
    for (const ch of channels) {
      const key = ch.cat || "General Broadcast";
      const list = map.get(key) || [];
      list.push(ch);
      map.set(key, list);
    }
    return Array.from(map.entries()).map(([category, items]) => ({
      category,
      items,
    }));
  }, [mode, channels, favorites]);

  return (
    <section className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6">
      <div className="flex flex-col gap-3 border-b border-[#261E38] pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#F5F3EE] sm:text-3xl">
            {mode === "favorites" ? "Favorite Channels" : "Browse by Category"}
          </h1>
          <p className="mt-1 text-sm text-[#A79EB9]">
            {mode === "favorites"
              ? "Your saved cable channels · Stored locally in your browser"
              : `${channels.length} verified playable 24/7 channels organized by genre`}
          </p>
        </div>
      </div>

      {grouped.length === 0 ? (
        <div className="mt-10 flex flex-col items-center justify-center rounded-xl border border-[#261E38] bg-[#110E1A] px-6 py-16 text-center">
          <Heart className="h-8 w-8 text-[#7B7092]" aria-hidden="true" />
          <h2 className="mt-4 font-display text-lg font-bold text-[#F5F3EE]">
            No favorite channels saved yet
          </h2>
          <p className="mt-1 max-w-md text-sm text-[#A79EB9]">
            Click the heart icon on any channel in Watch Live or Categories to build your quick-access cable lineup.
          </p>
          <button
            type="button"
            onClick={onBrowseAll}
            className="kings-gold-btn mt-5 rounded-lg px-4 py-2 text-sm font-semibold cursor-pointer"
          >
            Browse All Categories
          </button>
        </div>
      ) : (
        <div className="mt-6 space-y-10">
          {grouped.map((group) => (
            <div key={group.category}>
              <div className="mb-3 flex items-baseline justify-between border-b border-[#261E38] pb-2">
                <h2 className="font-display text-lg font-bold text-[#F5F3EE]">
                  {group.category}
                </h2>
                <span className="font-mono text-xs text-[#A79EB9] tabular-nums">
                  {group.items.length}{" "}
                  {group.items.length === 1 ? "channel" : "channels"}
                </span>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {group.items.map((ch) => {
                  const isTuned = ch.id === activeChannelId;
                  const isFav = favorites.has(ch.id);
                  const nowInfo = getNowNext(ch, schedules, globalAnchor, nowSec);

                  return (
                    <div
                      key={ch.id}
                      className={`flex flex-col justify-between rounded-xl border p-4 transition-colors ${
                        isTuned
                          ? "border-[#DFBA57]/75 bg-[#3B186B]/25"
                          : "border-[#261E38] bg-[#110E1A] hover:border-[#3E2F5E]"
                      }`}
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 text-xs text-[#A79EB9]">
                              <span className="font-mono font-bold text-[#DFBA57] tabular-nums">
                                Ch {ch.num}
                              </span>
                              {ch.cat && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span className="truncate">{ch.cat}</span>
                                </>
                              )}
                            </div>
                            <h3 className="mt-1 truncate font-display text-base font-bold text-[#F5F3EE]">
                              {ch.name}
                            </h3>
                          </div>

                          <button
                            type="button"
                            onClick={() => onToggleFavorite(ch.id)}
                            aria-label={
                              isFav
                                ? `Remove ${ch.name} from favorites`
                                : `Save ${ch.name} to favorites`
                            }
                            className="rounded-md p-1.5 text-[#A79EB9] hover:bg-[#1E1630] hover:text-[#DFBA57] cursor-pointer"
                          >
                            <Heart
                              className={`h-4 w-4 ${
                                isFav ? "fill-[#DFBA57] text-[#DFBA57]" : ""
                              }`}
                              aria-hidden="true"
                            />
                          </button>
                        </div>

                        <p className="mt-2 truncate text-sm font-medium text-[#EFECE6]">
                          {nowInfo.currentTitle}
                        </p>
                        {ch.blurb && (
                          <p className="mt-1 text-xs text-[#A79EB9] line-clamp-2">
                            {ch.blurb}
                          </p>
                        )}
                      </div>

                      <div className="mt-4">
                        {nowInfo.durationSec > 0 && (
                          <div className="mb-3 h-1 w-full overflow-hidden rounded-full bg-[#261E38]">
                            <div
                              className="h-full bg-[#DFBA57]"
                              style={{ width: `${nowInfo.progressPct}%` }}
                            />
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => onTuneChannel(ch.id)}
                          className={`inline-flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors cursor-pointer ${
                            isTuned
                              ? "kings-gold-btn"
                              : "border border-[#2D2345] bg-[#181227] text-[#F5F3EE] hover:bg-[#231A38]"
                          }`}
                        >
                          <Play className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
                          <span>{isTuned ? "Currently Playing" : "Watch Live"}</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
