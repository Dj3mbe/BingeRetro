export type ChannelKind = "ia" | "weather" | "pluto" | "youtube";

export interface Channel {
  id: string;
  num: number;
  name: string;
  kind: ChannelKind;
  blurb?: string;
  cat?: string;
  fixedName?: boolean;
  pluto?: string;
  url?: string;
  headline?: string;
  ytVideoId?: string;
  ytPlaylistId?: string;
  ytTitle?: string;
  sourceLabel?: string;
}

export interface LineupResponse {
  version: number;
  anchor: number;
  channels: Channel[];
}

export interface ScheduleItem {
  t: string;
  u: string;
  f?: string;
  d: number;
  s?: number;
  e?: number;
  a?: number | boolean;
  _fb?: boolean;
}

export interface ChannelSchedule {
  id: string;
  anchor?: number;
  version?: string;
  gen_ts?: number;
  valid_until?: number;
  items: ScheduleItem[];
}

export interface SchedulesResponse {
  anchor: number;
  schedules: Record<string, ChannelSchedule>;
}

export interface PlutoBundleResponse {
  urls: Record<string, string>;
  schedules: Record<string, ChannelSchedule>;
}

export interface ActiveSlot {
  index: number;
  item: ScheduleItem;
  startSec: number;
  offsetSec: number;
}

export interface NowNextInfo {
  currentTitle: string;
  nextTitle: string;
  elapsedSec: number;
  durationSec: number;
  progressPct: number;
}

export interface WeatherPeriod {
  name: string;
  short: string;
  detail: string;
  tempF: number;
}

export interface WeatherData {
  city: string;
  state: string;
  tz?: string;
  updated?: string;
  now: {
    tempF: number;
    text: string;
    windMph: number;
    windDir?: string;
    humidity?: number | null;
    pressureIn?: number | null;
    visibilityMi?: number | null;
    station?: string;
  };
  periods: WeatherPeriod[];
}

export interface WeatherCity {
  name: string;
  text: string;
  tempF: number;
  hi: number;
  lo: number;
}

export interface WeatherAlert {
  event?: string;
  headline?: string;
}

export interface WeatherExtraData {
  radar?: {
    station?: string;
    loop?: string;
    still?: string;
  };
  cities?: WeatherCity[];
  alerts?: WeatherAlert[];
  briefing?: {
    title?: string;
    text?: string;
  };
}

export type ViewMode = "live" | "guide" | "categories" | "favorites";
