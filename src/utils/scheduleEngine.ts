import type {
  ActiveSlot,
  Channel,
  ChannelSchedule,
  NowNextInfo,
  ScheduleItem,
} from "../types/tv.ts";

const totalDurationCache = new Map<string, number>();

export function clearDurationCache(): void {
  totalDurationCache.clear();
}

export function getTotalDuration(channelId: string, schedule: ChannelSchedule): number {
  const cached = totalDurationCache.get(channelId);
  if (cached && cached > 0) return cached;
  const total = schedule.items.reduce((sum, item) => sum + (item.d || 0), 0);
  if (total > 0) totalDurationCache.set(channelId, total);
  return total;
}

export function slotAt(
  channel: Channel,
  schedules: Record<string, ChannelSchedule>,
  globalAnchor: number,
  nowSec: number
): ActiveSlot | null {
  const schedule = schedules[channel.id];
  if (!schedule || !schedule.items.length) return null;

  // Prefer exact epoch window match when available in the current 6-hour slice
  for (let i = 0; i < schedule.items.length; i++) {
    const it = schedule.items[i];
    if (typeof it.s === "number" && typeof it.e === "number") {
      if (nowSec >= it.s && nowSec < it.e) {
        return {
          index: i,
          item: it,
          startSec: it.s,
          offsetSec: Math.max(0, nowSec - it.s),
        };
      }
    }
  }

  // Fallback modulo calculation matching the broadcast anchor clock
  const total = getTotalDuration(channel.id, schedule);
  if (total <= 0) return null;
  const anchor = schedule.anchor || globalAnchor || 1704067200;
  const pos = (((nowSec - anchor) % total) + total) % total;
  let acc = 0;
  for (let i = 0; i < schedule.items.length; i++) {
    const it = schedule.items[i];
    if (pos < acc + it.d) {
      return {
        index: i,
        item: it,
        startSec: nowSec - (pos - acc),
        offsetSec: pos - acc,
      };
    }
    acc += it.d;
  }

  return null;
}

export function nextProgramOf(
  channelId: string,
  schedules: Record<string, ChannelSchedule>,
  slot: ActiveSlot
): ScheduleItem | null {
  const schedule = schedules[channelId];
  if (!schedule || !schedule.items.length) return null;
  const items = schedule.items;
  let i = slot.index;
  do {
    i = (i + 1) % items.length;
  } while (items[i].a && i !== slot.index);
  return items[i] || null;
}

export function getNowNext(
  channel: Channel,
  schedules: Record<string, ChannelSchedule>,
  globalAnchor: number,
  nowSec: number
): NowNextInfo {
  if (channel.kind === "weather") {
    return {
      currentTitle: "WeatherStar 4000 Local Forecast",
      nextTitle: "Continuous Radar & Smooth Jazz",
      elapsedSec: 0,
      durationSec: 0,
      progressPct: 100,
    };
  }

  if (channel.kind === "youtube") {
    return {
      currentTitle: channel.ytTitle || channel.name,
      nextTitle: channel.blurb || "YouTube Classic TV Stream",
      elapsedSec: 0,
      durationSec: 0,
      progressPct: 100,
    };
  }

  const slot = slotAt(channel, schedules, globalAnchor, nowSec);
  if (!slot) {
    return {
      currentTitle:
        channel.kind === "pluto"
          ? `${channel.name} · Live Stream`
          : "Loading program schedule...",
      nextTitle: "",
      elapsedSec: 0,
      durationSec: 0,
      progressPct: 0,
    };
  }

  const nextItem = nextProgramOf(channel.id, schedules, slot);
  const durationSec = Math.max(1, slot.item.d);
  const elapsedSec = Math.min(durationSec, Math.max(0, slot.offsetSec));

  return {
    currentTitle: slot.item.t,
    nextTitle: nextItem ? nextItem.t : "",
    elapsedSec,
    durationSec,
    progressPct: Math.min(100, Math.max(0, (elapsedSec / durationSec) * 100)),
  };
}

export function formatClock(ms: number): string {
  const d = new Date(ms);
  let h = d.getHours();
  const m = d.getMinutes();
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, "0")} ${ap}`;
}

export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const rem = s % 60;
  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, "0")}:${String(rem).padStart(2, "0")}`;
  }
  return `${mins}:${String(rem).padStart(2, "0")}`;
}

export interface EpgBlock {
  item: ScheduleItem;
  startSec: number;
  endSec: number;
  isLive: boolean;
}

export function buildEpgWindow(
  channel: Channel,
  schedules: Record<string, ChannelSchedule>,
  globalAnchor: number,
  windowStartSec: number,
  windowEndSec: number,
  nowSec: number
): EpgBlock[] {
  if (channel.kind === "weather") {
    return [
      {
        item: {
          t: "WeatherStar 4000 Local Forecast & Smooth Jazz",
          u: "",
          d: windowEndSec - windowStartSec,
        },
        startSec: windowStartSec,
        endSec: windowEndSec,
        isLive: true,
      },
    ];
  }

  if (channel.kind === "youtube") {
    return [
      {
        item: {
          t: channel.ytTitle || channel.name,
          u: "",
          d: windowEndSec - windowStartSec,
        },
        startSec: windowStartSec,
        endSec: windowEndSec,
        isLive: true,
      },
    ];
  }

  const schedule = schedules[channel.id];
  if (!schedule || !schedule.items.length) return [];

  const firstSlot = slotAt(channel, schedules, globalAnchor, windowStartSec);
  if (!firstSlot) return [];

  const blocks: EpgBlock[] = [];
  let cursor = firstSlot.startSec;
  let idx = firstSlot.index;
  let guard = 0;

  while (cursor < windowEndSec && guard < 120) {
    const item = schedule.items[idx];
    const dur = Math.max(30, item.d || 60);
    const end = cursor + dur;
    if (end > windowStartSec) {
      blocks.push({
        item,
        startSec: Math.max(windowStartSec, cursor),
        endSec: Math.min(windowEndSec, end),
        isLive: nowSec >= cursor && nowSec < end,
      });
    }
    cursor = end;
    idx = (idx + 1) % schedule.items.length;
    guard++;
  }

  return blocks;
}
