import express from "express";
import type { Request, Response } from "express";
import path from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPSTREAM = "https://backwhen.stream";
const PORT = 3000;

interface CacheEntry {
  body: string;
  contentType: string;
  expiresAt: number;
}

interface RawChannel {
  id: string;
  num: number;
  name: string;
  kind: "ia" | "weather" | "pluto" | "board" | "youtube";
  blurb?: string;
  cat?: string;
  fixedName?: boolean;
  pods?: boolean;
  pluto?: string;
  url?: string;
  headline?: string;
  ytVideoId?: string;
  ytPlaylistId?: string;
  ytTitle?: string;
  sourceLabel?: string;
}

interface RawScheduleItem {
  t: string;
  u: string;
  f?: string;
  d: number;
  s?: number;
  e?: number;
  a?: number | boolean;
}

interface RawSchedule {
  id: string;
  anchor?: number;
  items: RawScheduleItem[];
}

const jsonCache = new Map<string, CacheEntry>();
const hlsPlaylistCache = new Map<string, { body: string; expiresAt: number }>();
const inflightMap = new Map<string, Promise<unknown>>();

const ALLOWED_HLS_HOST_SUFFIXES = [
  "jmp2.uk",
  "pluto.tv",
  "plutotv.net",
  "cloudfront.net",
  "akamaized.net",
  "fastly.net",
  "edgesuite.net",
];

// Direct CORS-enabled CDNs for video segments & AES keys — bypass proxy for max speed!
const DIRECT_CORS_MEDIA_HOSTS = ["plutotv.net"];

const EXTRA_PLUTO_CHANNELS: RawChannel[] = [
  {
    id: "pluto-extra-mst3k",
    num: 201,
    name: "MST3K (PLUTO)",
    kind: "pluto",
    pluto: "545943f1c9f133a519bbac92",
    blurb: "24/7 Mystery Science Theater 3000 episodes via Pluto TV",
    cat: "Sitcoms & classic TV",
    sourceLabel: "Pluto TV",
  },
  {
    id: "pluto-extra-rifftrax",
    num: 202,
    name: "RIFFTRAX (PLUTO)",
    kind: "pluto",
    pluto: "58d947b9e420d8656ee101ab",
    blurb: "24/7 RiffTrax movie riffing from the creators of MST3K",
    cat: "Sitcoms & classic TV",
    sourceLabel: "Pluto TV",
  },
  {
    id: "pluto-extra-twilight-zone",
    num: 203,
    name: "THE TWILIGHT ZONE",
    kind: "pluto",
    pluto: "67352ed93a61d4000881f9fa",
    blurb: "24/7 Rod Serling's classic anthology series on Pluto TV",
    cat: "Drama, mystery & sci-fi",
    sourceLabel: "Pluto TV",
  },
  {
    id: "pluto-extra-star-trek",
    num: 204,
    name: "STAR TREK",
    kind: "pluto",
    pluto: "5efbd39f8c4ce900075d7698",
    blurb: "24/7 Star Trek: The Original Series & classics on Pluto TV",
    cat: "Drama, mystery & sci-fi",
    sourceLabel: "Pluto TV",
  },
  {
    id: "pluto-extra-star-trek-tng",
    num: 205,
    name: "STAR TREK: TNG",
    kind: "pluto",
    pluto: "695c32e61ca20bb8ca802eb9",
    blurb: "24/7 Star Trek: The Next Generation on Pluto TV",
    cat: "Drama, mystery & sci-fi",
    sourceLabel: "Pluto TV",
  },
  {
    id: "pluto-extra-star-trek-ds9",
    num: 206,
    name: "STAR TREK: DS9",
    kind: "pluto",
    pluto: "65c69bbfd77d450008c7ffee",
    blurb: "24/7 Star Trek: Deep Space Nine on Pluto TV",
    cat: "Drama, mystery & sci-fi",
    sourceLabel: "Pluto TV",
  },
  {
    id: "pluto-extra-star-trek-voyager",
    num: 207,
    name: "STAR TREK: VOYAGER",
    kind: "pluto",
    pluto: "634dacf51d90320007fcd5fa",
    blurb: "24/7 Star Trek: Voyager on Pluto TV",
    cat: "Drama, mystery & sci-fi",
    sourceLabel: "Pluto TV",
  },
  {
    id: "pluto-extra-star-trek-ent",
    num: 208,
    name: "STAR TREK: ENTERPRISE",
    kind: "pluto",
    pluto: "695c32671ca20bb8ca7fd8f7",
    blurb: "24/7 Star Trek: Enterprise on Pluto TV",
    cat: "Drama, mystery & sci-fi",
    sourceLabel: "Pluto TV",
  },
  {
    id: "pluto-extra-star-trek-movies",
    num: 209,
    name: "STAR TREK MOVIES",
    kind: "pluto",
    pluto: "6675c88da1d7ad00084762cb",
    blurb: "Star Trek feature films 24/7 on Pluto TV",
    cat: "Movies",
    sourceLabel: "Pluto TV",
  },
  {
    id: "pluto-extra-classic-comedy",
    num: 210,
    name: "CLASSIC TV COMEDY",
    kind: "pluto",
    pluto: "5f15e32b297f96000768f928",
    blurb: "Classic sitcoms and vintage television comedies on Pluto TV",
    cat: "Sitcoms & classic TV",
    sourceLabel: "Pluto TV",
  },
  {
    id: "pluto-extra-classic-crime",
    num: 211,
    name: "CLASSIC TV CRIME",
    kind: "pluto",
    pluto: "61325c4f982acd000723287e",
    blurb: "Vintage police procedurals, mysteries, and detective dramas",
    cat: "Drama, mystery & sci-fi",
    sourceLabel: "Pluto TV",
  },
  {
    id: "pluto-extra-classic-families",
    num: 212,
    name: "CLASSIC TV FAMILIES",
    kind: "pluto",
    pluto: "61325d18f5166c00081b84e0",
    blurb: "Golden-age family comedies and classic sitcoms",
    cat: "Sitcoms & classic TV",
    sourceLabel: "Pluto TV",
  },
  {
    id: "pluto-extra-doctor-who",
    num: 213,
    name: "DOCTOR WHO CLASSIC",
    kind: "pluto",
    pluto: "5ce4475cd43850831ca91ce7",
    blurb: "Classic BBC Doctor Who serials 24/7 on Pluto TV",
    cat: "Drama, mystery & sci-fi",
    sourceLabel: "Pluto TV",
  },
  {
    id: "pluto-extra-midsomer",
    num: 214,
    name: "MIDSOMER MURDERS",
    kind: "pluto",
    pluto: "5cbf6a868a1bce4a3d52a5e9",
    blurb: "British village detective mystery series 24/7",
    cat: "Drama, mystery & sci-fi",
    sourceLabel: "Pluto TV",
  },
  {
    id: "pluto-extra-unsolved-mysteries",
    num: 215,
    name: "UNSOLVED MYSTERIES",
    kind: "pluto",
    pluto: "5b4e96a0423e067bd6df6901",
    blurb: "Classic Robert Stack mystery & paranormal anthology",
    cat: "Drama, mystery & sci-fi",
    sourceLabel: "Pluto TV",
  },
  {
    id: "pluto-extra-forensic-files",
    num: 216,
    name: "FORENSIC FILES",
    kind: "pluto",
    pluto: "5bb1af6a268cae539bcedb0a",
    blurb: "True-crime science and forensic investigation documentaries",
    cat: "News, nature & science",
    sourceLabel: "Pluto TV",
  },
  {
    id: "pluto-extra-csi",
    num: 217,
    name: "CSI",
    kind: "pluto",
    pluto: "5efbd29e4aa26700076c0d06",
    blurb: "CSI: Crime Scene Investigation 24/7 marathon",
    cat: "Drama, mystery & sci-fi",
    sourceLabel: "Pluto TV",
  },
  {
    id: "pluto-extra-mission-impossible",
    num: 218,
    name: "MISSION: IMPOSSIBLE",
    kind: "pluto",
    pluto: "5f77977bd924d80007eee60c",
    blurb: "Classic 1960s–70s IMF espionage & adventure series",
    cat: "Action & adventure TV",
    sourceLabel: "Pluto TV",
  },
  {
    id: "pluto-extra-western-tv",
    num: 219,
    name: "WESTERN TV",
    kind: "pluto",
    pluto: "5e8df4bc16e34700077e77d3",
    blurb: "Classic television westerns, Gunsmoke-era dramas & frontier tales",
    cat: "Action & adventure TV",
    sourceLabel: "Pluto TV",
  },
  {
    id: "pluto-extra-threes-company",
    num: 220,
    name: "THREE'S COMPANY",
    kind: "pluto",
    pluto: "5ef3977e5d773400077de284",
    blurb: "Classic 1970s–80s sitcom starring John Ritter",
    cat: "Sitcoms & classic TV",
    sourceLabel: "Pluto TV",
  },
  {
    id: "pluto-extra-happy-days",
    num: 221,
    name: "HAPPY DAYS",
    kind: "pluto",
    pluto: "5f7794162a4559000781fc12",
    blurb: "Fonzie, Richie & the Cunningham family in classic sitcom reruns",
    cat: "Sitcoms & classic TV",
    sourceLabel: "Pluto TV",
  },
  {
    id: "pluto-extra-price-is-right",
    num: 222,
    name: "PRICE IS RIGHT: BARKER",
    kind: "pluto",
    pluto: "5f7791b8372da90007fd45e6",
    blurb: "The Bob Barker Era of The Price Is Right 24/7",
    cat: "Sitcoms & classic TV",
    sourceLabel: "Pluto TV",
  },
  {
    id: "pluto-extra-game-show-central",
    num: 223,
    name: "GAME SHOW CENTRAL",
    kind: "pluto",
    pluto: "5e54187aae660e00093561d6",
    blurb: "Classic TV game shows and studio quiz competitions",
    cat: "Sitcoms & classic TV",
    sourceLabel: "Pluto TV",
  },
  {
    id: "pluto-extra-pluto-game-shows",
    num: 224,
    name: "PLUTO GAME SHOWS",
    kind: "pluto",
    pluto: "6036e7c385749f00075dbd3b",
    blurb: "Non-stop vintage and modern television game shows",
    cat: "Sitcoms & classic TV",
    sourceLabel: "Pluto TV",
  },
  {
    id: "pluto-extra-survivor",
    num: 225,
    name: "SURVIVOR",
    kind: "pluto",
    pluto: "5f21e7b24744c60007c1f6fc",
    blurb: "Classic Survivor seasons 24/7 on Pluto TV",
    cat: "Action & adventure TV",
    sourceLabel: "Pluto TV",
  },
  {
    id: "pluto-extra-amazing-race",
    num: 226,
    name: "THE AMAZING RACE",
    kind: "pluto",
    pluto: "5f21e8a6e2f12b000755afdb",
    blurb: "Round-the-world reality competition classic episodes",
    cat: "Action & adventure TV",
    sourceLabel: "Pluto TV",
  },
  {
    id: "pluto-extra-hells-kitchen",
    num: 227,
    name: "HELL'S KITCHEN",
    kind: "pluto",
    pluto: "5b4e99f4423e067bd6df6903",
    blurb: "Gordon Ramsay's Hell's Kitchen 24/7 culinary competition",
    cat: "Home, food & fitness",
    sourceLabel: "Pluto TV",
  },
  {
    id: "pluto-extra-antiques-uk",
    num: 228,
    name: "ANTIQUES ROADSHOW UK",
    kind: "pluto",
    pluto: "5ce44810b421747ae467b7cd",
    blurb: "Classic BBC Antiques Roadshow appraisals & history",
    cat: "Home, food & fitness",
    sourceLabel: "Pluto TV",
  },
  {
    id: "pluto-extra-cops",
    num: 229,
    name: "COPS",
    kind: "pluto",
    pluto: "5e1f7e089f23700009d66303",
    blurb: "Classic COPS ride-along documentary series",
    cat: "Drama, mystery & sci-fi",
    sourceLabel: "Pluto TV",
  },
  {
    id: "pluto-extra-crime-drama",
    num: 230,
    name: "PLUTO CRIME DRAMA",
    kind: "pluto",
    pluto: "5f31fd1b4c510e00071c3103",
    blurb: "24/7 detective series and serialized crime dramas",
    cat: "Drama, mystery & sci-fi",
    sourceLabel: "Pluto TV",
  },
  {
    id: "pluto-extra-crime-movies",
    num: 231,
    name: "PLUTO CRIME MOVIES",
    kind: "pluto",
    pluto: "5f4d8594eb979c0007706de7",
    blurb: "24/7 thriller, noir, and crime feature films",
    cat: "Movies",
    sourceLabel: "Pluto TV",
  },
  {
    id: "pluto-extra-naruto",
    num: 232,
    name: "NARUTO",
    kind: "pluto",
    pluto: "5da0c85bd2c9c10009370984",
    blurb: "Classic Naruto anime episodes 24/7 on Pluto TV",
    cat: "Kids & cartoons",
    sourceLabel: "Pluto TV",
  },
  {
    id: "pluto-extra-one-piece",
    num: 233,
    name: "ONE PIECE",
    kind: "pluto",
    pluto: "5f7790b3ed0c88000720b241",
    blurb: "Classic One Piece anime adventures 24/7 on Pluto TV",
    cat: "Kids & cartoons",
    sourceLabel: "Pluto TV",
  },
  {
    id: "pluto-extra-yugioh",
    num: 234,
    name: "YU-GI-OH!",
    kind: "pluto",
    pluto: "5f4ec10ed9636f00089b8c89",
    blurb: "Classic Yu-Gi-Oh! Duel Monsters animated series 24/7",
    cat: "Kids & cartoons",
    sourceLabel: "Pluto TV",
  },
];

const RETROFILM_VAULT_SOURCES: Array<{
  channel: RawChannel;
  archiveIds: string[];
}> = [
  {
    channel: {
      id: "rfv-alfred-hitchcock",
      num: 251,
      name: "ALFRED HITCHCOCK PRESENTS",
      kind: "ia",
      blurb: "Broadcast-quality Alfred Hitchcock Presents public domain anthology series",
      cat: "Drama, mystery & sci-fi",
      sourceLabel: "RetroFilm Vault",
    },
    archiveIds: ["the-new-alfred-hitchcock-presents-complete"],
  },
  {
    channel: {
      id: "rfv-beverly-hillbillies",
      num: 252,
      name: "THE BEVERLY HILLBILLIES",
      kind: "ia",
      blurb: "The Beverly Hillbillies classic public domain sitcom episodes",
      cat: "Sitcoms & classic TV",
      sourceLabel: "RetroFilm Vault",
    },
    archiveIds: ["bevhill-s01e01-36", "The_Beverly_Hillbillies"],
  },
  {
    channel: {
      id: "rfv-dragnet",
      num: 253,
      name: "DRAGNET (1950s)",
      kind: "ia",
      blurb: "Jack Webb's classic 1950s police procedural Dragnet",
      cat: "Drama, mystery & sci-fi",
      sourceLabel: "RetroFilm Vault",
    },
    archiveIds: ["Dragnet1951"],
  },
  {
    channel: {
      id: "rfv-lucy-show",
      num: 254,
      name: "THE LUCY SHOW",
      kind: "ia",
      blurb: "The Lucy Show starring Lucille Ball & Vivian Vance",
      cat: "Sitcoms & classic TV",
      sourceLabel: "RetroFilm Vault",
    },
    archiveIds: ["the-lucy-show"],
  },
  {
    channel: {
      id: "rfv-twilight-zone",
      num: 255,
      name: "TWILIGHT ZONE ARCHIVE",
      kind: "ia",
      blurb: "Classic 1959 Twilight Zone anthology archive episodes",
      cat: "Drama, mystery & sci-fi",
      sourceLabel: "RetroFilm Vault",
    },
    archiveIds: ["the-twilight-zone-1959-s-01-e-00-original-pilot"],
  },
];

const YOUTUBE_CHANNELS: RawChannel[] = [
  {
    id: "yt-mst3k-live",
    num: 301,
    name: "MST3K 24/7 MARATHON",
    kind: "youtube",
    ytVideoId: "BT-HPOYZXVE",
    ytTitle: "MST3K Every Episode in Order — 24/7 Live Marathon",
    blurb: "Official Mystery Science Theater 3000 24/7 marathon",
    cat: "Sitcoms & classic TV",
    sourceLabel: "YouTube Live",
  },
  {
    id: "yt-mst3k-forever",
    num: 302,
    name: "MST3K FOREVER-A-THON",
    kind: "youtube",
    ytVideoId: "zwnU3UaUq_k",
    ytTitle: "MST3K FOREVER-a-thon Live Stream",
    blurb: "Official MST3K non-stop classic riffing marathon",
    cat: "Sitcoms & classic TV",
    sourceLabel: "YouTube Live",
  },
  {
    id: "yt-hitchcock",
    num: 303,
    name: "HITCHCOCK PRESENTS PLAYLIST",
    kind: "youtube",
    ytPlaylistId: "PLKgr5XQgGAaFhNL7qH6jZFszCdqT05UCh",
    ytTitle: "Alfred Hitchcock Presents — Classic Anthology Playlist",
    blurb: "Full classic Alfred Hitchcock Presents suspense anthology playlist",
    cat: "Drama, mystery & sci-fi",
    sourceLabel: "YouTube",
  },
  {
    id: "yt-beverly-hillbillies",
    num: 304,
    name: "BEVERLY HILLBILLIES TV",
    kind: "youtube",
    ytVideoId: "jYWh1g_9K1o",
    ytTitle: "The Beverly Hillbillies — Classic Full Episodes",
    blurb: "Classic Clampett family sitcom full episodes",
    cat: "Sitcoms & classic TV",
    sourceLabel: "YouTube",
  },
  {
    id: "yt-dragnet",
    num: 305,
    name: "DRAGNET DETECTIVE TV",
    kind: "youtube",
    ytVideoId: "NzTeqQRt6H0",
    ytTitle: "Dragnet (1950s) — Full Classic Episodes",
    blurb: "Vintage Dragnet police procedural full episodes",
    cat: "Drama, mystery & sci-fi",
    sourceLabel: "YouTube",
  },
  {
    id: "yt-lucy-show",
    num: 306,
    name: "LUCY SHOW CLASSICS",
    kind: "youtube",
    ytVideoId: "9WwPsADzy-c",
    ytTitle: "The Lucy Show — Lucille Ball Comedy Compilation",
    blurb: "Classic Lucy Show comedy full episodes",
    cat: "Sitcoms & classic TV",
    sourceLabel: "YouTube",
  },
  {
    id: "yt-classic-tv-vault",
    num: 307,
    name: "THUNDERBIRDS & SCI-FI TV",
    kind: "youtube",
    ytVideoId: "xYhtOOcDMfs",
    ytTitle: "Thunderbirds & Classic Retro Sci-Fi Episodes",
    blurb: "Classic retro sci-fi & Supermarionation full episodes",
    cat: "Action & adventure TV",
    sourceLabel: "YouTube",
  },
  {
    id: "yt-canadian-throwback",
    num: 308,
    name: "HICCUPS (CANADIAN TV)",
    kind: "youtube",
    ytVideoId: "8Px9BDUeAtI",
    ytTitle: "Classic Canadian TV Showcase — Hiccups Full Episodes",
    blurb: "Full classic Canadian comedy episodes via Encore+ archives",
    cat: "Sitcoms & classic TV",
    sourceLabel: "YouTube",
  },
  {
    id: "yt-red-green",
    num: 309,
    name: "THE RED GREEN SHOW",
    kind: "youtube",
    ytVideoId: "FUXPuYZ4DEQ",
    ytTitle: "The Red Green Show — Classic Canadian Comedy Full Episodes",
    blurb: "Official RedGreenTV Possum Lodge classic comedy episodes",
    cat: "Sitcoms & classic TV",
    sourceLabel: "YouTube",
  },
  {
    id: "yt-kids-in-the-hall",
    num: 310,
    name: "THE KIDS IN THE HALL",
    kind: "youtube",
    ytVideoId: "u36CmFKTdb8",
    ytTitle: "The Kids In The Hall — Classic Canadian Sketch Comedy",
    blurb: "Official full episodes of Canadian cult sketch series Kids in the Hall",
    cat: "Sitcoms & classic TV",
    sourceLabel: "YouTube",
  },
  {
    id: "yt-degrassi",
    num: 311,
    name: "DEGRASSI JUNIOR HIGH",
    kind: "youtube",
    ytVideoId: "wXU-ZHMq8_w",
    ytTitle: "Degrassi Junior High — Classic Canadian Teen Drama",
    blurb: "Official full episodes of the iconic 1980s Canadian teen drama",
    cat: "Drama, mystery & sci-fi",
    sourceLabel: "YouTube",
  },
  {
    id: "yt-carol-burnett",
    num: 312,
    name: "CAROL BURNETT SHOW 24/7",
    kind: "youtube",
    ytVideoId: "fNQGyZJW45c",
    ytTitle: "Best of The Carol Burnett Show — 24/7 Marathon",
    blurb: "Official 24/7 Carol Burnett Show sketch comedy marathon",
    cat: "Sitcoms & classic TV",
    sourceLabel: "YouTube Live",
  },
  {
    id: "yt-dick-van-dyke",
    num: 313,
    name: "THE DICK VAN DYKE SHOW",
    kind: "youtube",
    ytVideoId: "Y0vqwbt0A0w",
    ytTitle: "The Dick Van Dyke Show — Classic Sitcom Full Episodes",
    blurb: "Classic 1960s Rob & Laura Petrie sitcom episodes",
    cat: "Sitcoms & classic TV",
    sourceLabel: "YouTube",
  },
  {
    id: "yt-unsolved-mysteries",
    num: 314,
    name: "UNSOLVED MYSTERIES ARCHIVE",
    kind: "youtube",
    ytVideoId: "5CDcgYH0Ot0",
    ytTitle: "Unsolved Mysteries with Robert Stack — Full Episodes",
    blurb: "Official Unsolved Mysteries classic Robert Stack full episodes",
    cat: "Drama, mystery & sci-fi",
    sourceLabel: "YouTube",
  },
];

function isAllowedHlsUrl(rawUrl: string): URL | null {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    const host = parsed.hostname.toLowerCase();
    const ok = ALLOWED_HLS_HOST_SUFFIXES.some(
      (suffix) => host === suffix || host.endsWith(`.${suffix}`)
    );
    return ok ? parsed : null;
  } catch {
    return null;
  }
}

function shouldServeDirectFromCdn(resolvedUrl: string): boolean {
  try {
    const u = new URL(resolvedUrl);
    const host = u.hostname.toLowerCase();
    const pathLower = u.pathname.toLowerCase();
    const isMediaAsset =
      pathLower.endsWith(".ts") ||
      pathLower.endsWith(".m4s") ||
      pathLower.endsWith(".aac") ||
      pathLower.endsWith(".key") ||
      pathLower.endsWith(".mp4") ||
      pathLower.endsWith(".vtt");
    const isDirectCorsHost = DIRECT_CORS_MEDIA_HOSTS.some(
      (s) => host === s || host.endsWith(`.${s}`)
    );
    return isMediaAsset && isDirectCorsHost;
  } catch {
    return false;
  }
}

function rewriteM3u8(playlistText: string, baseUrl: string): string {
  const toTargetUrl = (rawRef: string): string => {
    const resolved = new URL(rawRef, baseUrl).toString();
    // Point .ts/.m4s/.key segments straight at the fast CORS-enabled edge CDN!
    if (shouldServeDirectFromCdn(resolved)) {
      return resolved;
    }
    return `/api/btv/hls?url=${encodeURIComponent(resolved)}`;
  };

  return playlistText
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (trimmed.startsWith("#")) {
        return line.replace(/URI="([^"]+)"/g, (_match, uri) => {
          try {
            return `URI="${toTargetUrl(uri)}"`;
          } catch {
            return `URI="${uri}"`;
          }
        });
      }
      try {
        return toTargetUrl(trimmed);
      } catch {
        return line;
      }
    })
    .join("\n");
}

async function fetchJsonCached<T>(
  cacheKey: string,
  fetcher: () => Promise<T>,
  ttlMs: number
): Promise<T> {
  const now = Date.now();
  const cached = jsonCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return JSON.parse(cached.body) as T;
  }

  const inflight = inflightMap.get(cacheKey);
  if (inflight) {
    return (await inflight) as T;
  }

  const promise = (async () => {
    try {
      const data = await fetcher();
      jsonCache.set(cacheKey, {
        body: JSON.stringify(data),
        contentType: "application/json; charset=utf-8",
        expiresAt: Date.now() + ttlMs,
      });
      return data;
    } catch (err) {
      if (cached) return JSON.parse(cached.body) as T;
      throw err;
    } finally {
      inflightMap.delete(cacheKey);
    }
  })();

  inflightMap.set(cacheKey, promise);
  return promise;
}

async function checkPlutoStreamPlayable(masterUrl: string): Promise<boolean> {
  try {
    const mRes = await fetch(masterUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        Origin: "https://pluto.tv",
        Referer: "https://pluto.tv/",
      },
      signal: AbortSignal.timeout(3000),
    });
    if (!mRes.ok) return false;
    const mUrl = mRes.url || masterUrl;
    const mTxt = await mRes.text();
    const varRef = mTxt
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => l && !l.startsWith("#"));
    if (!varRef) return false;

    const vUrl = new URL(varRef, mUrl).toString();
    const vRes = await fetch(vUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        Origin: "https://pluto.tv",
        Referer: "https://pluto.tv/",
      },
      signal: AbortSignal.timeout(3000),
    });
    if (!vRes.ok) return false;
    const vTxt = await vRes.text();

    const keyMatch = vTxt.match(/#EXT-X-KEY:[^\n]*URI="([^"]+)"/);
    if (keyMatch) {
      const kUrl = new URL(keyMatch[1], vUrl).toString();
      const kRes = await fetch(kUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0",
          Origin: "https://pluto.tv",
          Referer: "https://pluto.tv/",
        },
        signal: AbortSignal.timeout(3000),
      });
      if (!kRes.ok) return false;
      const buf = await kRes.arrayBuffer();
      if (buf.byteLength !== 16) return false;
    }

    const segRef = vTxt
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => l && !l.startsWith("#"));
    if (!segRef) return false;
    const sUrl = new URL(segRef, vUrl).toString();
    const sRes = await fetch(sUrl, {
      method: "HEAD",
      headers: {
        "User-Agent": "Mozilla/5.0",
        Origin: "https://pluto.tv",
        Referer: "https://pluto.tv/",
      },
      signal: AbortSignal.timeout(3000),
    });
    return sRes.ok;
  } catch {
    return false;
  }
}

async function getWorkingPlutoBundle(): Promise<{
  urls: Record<string, string>;
  schedules: Record<string, RawSchedule>;
  workingPlutoIds: Set<string>;
}> {
  const cached = await fetchJsonCached(
    "verified-pluto-bundle-v2",
    async () => {
      const now = Date.now();
      const startIso = new Date(now - 30 * 60_000).toISOString();
      const stopIso = new Date(now + 6 * 3600_000).toISOString();
      const epgUrl = `https://api.pluto.tv/v2/channels?start=${encodeURIComponent(
        startIso
      )}&stop=${encodeURIComponent(stopIso)}`;

      const [bwPlutoRes, epgRes, bwLineupRes] = await Promise.all([
        fetch(`${UPSTREAM}/api/pluto`, {
          headers: { "User-Agent": "BingeTV/1.0", Accept: "application/json" },
        }).catch(() => null),
        fetch(epgUrl, {
          headers: { "User-Agent": "BingeTV/1.0", Accept: "application/json" },
        }).catch(() => null),
        getBackWhenLineup().catch(() => ({ channels: [] as RawChannel[] })),
      ]);

      const bwUrls =
        bwPlutoRes && bwPlutoRes.ok
          ? ((await bwPlutoRes.json()) as { urls?: Record<string, string> }).urls || {}
          : {};

      const bwLineupChannels = bwLineupRes.channels || [];

      const candidateUrls: Record<string, string> = { ...bwUrls };
      for (const ch of EXTRA_PLUTO_CHANNELS) {
        if (ch.pluto && !candidateUrls[ch.pluto]) {
          candidateUrls[ch.pluto] = `https://jmp2.uk/plu-${ch.pluto}.m3u8`;
        }
      }
      for (const ch of bwLineupChannels) {
        if (ch.kind === "pluto" && ch.pluto && !candidateUrls[ch.pluto]) {
          candidateUrls[ch.pluto] = `https://jmp2.uk/plu-${ch.pluto}.m3u8`;
        }
      }

      const allIds = Object.keys(candidateUrls);
      const workingIds: string[] = [];
      for (let i = 0; i < allIds.length; i += 16) {
        const batch = allIds.slice(i, i + 16);
        const results = await Promise.all(
          batch.map(async (id) => ({
            id,
            ok: await checkPlutoStreamPlayable(candidateUrls[id]),
          }))
        );
        for (const r of results) {
          if (r.ok) workingIds.push(r.id);
        }
      }

      const verifiedUrls: Record<string, string> = {};
      for (const id of workingIds) {
        verifiedUrls[id] = candidateUrls[id];
      }

      const plutoSchedules: Record<string, RawSchedule> = {};
      if (epgRes && epgRes.ok) {
        const epgChannels = (await epgRes.json()) as Array<{
          _id: string;
          timelines?: Array<{
            start: string;
            stop: string;
            title?: string;
            episode?: { name?: string };
          }>;
        }>;
        for (const ch of epgChannels) {
          if (!ch._id || !Array.isArray(ch.timelines) || !ch.timelines.length) continue;
          const items: RawScheduleItem[] = ch.timelines
            .map((tl) => {
              const s = Math.floor(Date.parse(tl.start) / 1000);
              const e = Math.floor(Date.parse(tl.stop) / 1000);
              const epName = tl.episode?.name;
              const baseTitle = tl.title || "Pluto TV Live";
              const title =
                epName && epName !== baseTitle ? `${baseTitle} — ${epName}` : baseTitle;
              return {
                t: title,
                u: "",
                d: Math.max(60, e - s),
                s,
                e,
              };
            })
            .filter((it) => Number.isFinite(it.s) && Number.isFinite(it.e) && it.d > 0);
          if (items.length) {
            plutoSchedules[ch._id] = { id: ch._id, items };
          }
        }
      }

      return {
        urls: verifiedUrls,
        schedules: plutoSchedules,
        workingIds,
      };
    },
    10 * 60_000
  );

  return {
    urls: cached.urls,
    schedules: cached.schedules,
    workingPlutoIds: new Set(cached.workingIds),
  };
}

async function getRetroFilmSchedules(): Promise<Record<string, RawSchedule>> {
  return fetchJsonCached(
    "retrofilm-vault-schedules-v1",
    async () => {
      const out: Record<string, RawSchedule> = {};
      await Promise.all(
        RETROFILM_VAULT_SOURCES.map(async ({ channel, archiveIds }) => {
          const items: RawScheduleItem[] = [];
          for (const archiveId of archiveIds) {
            try {
              const res = await fetch(`https://archive.org/metadata/${archiveId}/files`, {
                signal: AbortSignal.timeout(6000),
              });
              if (!res.ok) continue;
              const data = (await res.json()) as {
                result?: Array<{ name?: string; length?: string | number; title?: string }>;
              };
              const mp4s = (data.result || []).filter(
                (f) =>
                  f.name &&
                  f.name.toLowerCase().endsWith(".mp4") &&
                  !f.name.toLowerCase().endsWith(".ia.mp4") &&
                  Number(f.length) > 120
              );
              const fallbackMp4s = mp4s.length
                ? mp4s
                : (data.result || []).filter(
                    (f) =>
                      f.name &&
                      f.name.toLowerCase().endsWith(".mp4") &&
                      Number(f.length) > 120
                  );

              for (const f of fallbackMp4s.slice(0, 40)) {
                if (!f.name) continue;
                const cleanName = f.name
                  .split("/")
                  .pop()!
                  .replace(/\.(ia\.)?mp4$/i, "")
                  .replace(/[_]+/g, " ")
                  .trim();
                const encodedPath = f.name.split("/").map(encodeURIComponent).join("/");
                const url = `https://archive.org/download/${archiveId}/${encodedPath}`;
                items.push({
                  t: cleanName,
                  u: url,
                  f: url,
                  d: Math.round(Number(f.length)),
                });
              }
            } catch {
              // Skip failed archive metadata fetch
            }
          }
          if (items.length > 0) {
            out[channel.id] = {
              id: channel.id,
              anchor: 1704067200,
              items,
            };
          }
        })
      );
      return out;
    },
    6 * 3600_000
  );
}

function isCommercialOrPromoItem(item: RawScheduleItem): boolean {
  if (item.a) return true;
  const title = (item.t || "").toLowerCase();
  const url = (item.u || "").toLowerCase();
  const fallback = (item.f || "").toLowerCase();
  if (
    title.includes("commercial break") ||
    title.includes("backwhen") ||
    url.includes("/clips/") ||
    fallback.includes("/clips/") ||
    url.includes("backwhen.stream/donate")
  ) {
    return true;
  }
  return false;
}

function isPromoChannel(ch: RawChannel): boolean {
  if (
    ch.kind === "board" ||
    ch.num === 2 ||
    ch.num === 3 ||
    ch.id === "ia-retro-weather" ||
    ch.id === "ia-retro-newswire"
  ) {
    return true;
  }
  const blob = `${ch.id} ${ch.name} ${ch.blurb || ""} ${ch.headline || ""} ${ch.url || ""}`.toLowerCase();
  return (
    blob.includes("backwhen") ||
    blob.includes("donate") ||
    blob.includes("supporter") ||
    blob.includes("patreon") ||
    blob.includes("ko-fi")
  );
}

async function getBackWhenSchedules(): Promise<{
  anchor: number;
  schedules: Record<string, RawSchedule>;
}> {
  return fetchJsonCached(
    "backwhen-schedules-6h-clean",
    async () => {
      const r = await fetch(`${UPSTREAM}/api/schedules?hours=6`, {
        headers: { "User-Agent": "BingeRetro/1.0", Accept: "application/json" },
      });
      if (!r.ok) throw new Error(`Upstream schedules ${r.status}`);
      const data = (await r.json()) as {
        anchor: number;
        schedules: Record<string, RawSchedule>;
      };
      const cleanedSchedules: Record<string, RawSchedule> = {};
      for (const [id, sched] of Object.entries(data.schedules || {})) {
        const cleanItems = (sched.items || []).filter(
          (item) => !isCommercialOrPromoItem(item)
        );
        cleanedSchedules[id] = {
          ...sched,
          items: cleanItems,
        };
      }
      return {
        anchor: data.anchor,
        schedules: cleanedSchedules,
      };
    },
    15 * 60_000
  );
}

async function getBackWhenLineup(): Promise<{
  version: number;
  anchor: number;
  channels: RawChannel[];
}> {
  return fetchJsonCached(
    "backwhen-lineup-clean-v2",
    async () => {
      const r = await fetch(`${UPSTREAM}/api/lineup`, {
        headers: { "User-Agent": "BingeRetro/1.0", Accept: "application/json" },
      });
      if (!r.ok) throw new Error(`Upstream lineup ${r.status}`);
      const data = (await r.json()) as {
        version: number;
        anchor: number;
        channels: RawChannel[];
      };
      return {
        ...data,
        channels: (data.channels || [])
          .filter((ch) => !isPromoChannel(ch))
          .map(({ pods: _pods, ...rest }) => rest),
      };
    },
    10 * 60_000
  );
}

async function buildBootstrapPayload() {
  const [bwLineup, bwSchedules, plutoBundle, retroSchedules] =
    await Promise.all([
      getBackWhenLineup(),
      getBackWhenSchedules(),
      getWorkingPlutoBundle(),
      getRetroFilmSchedules(),
    ]);

  const verifiedBwChannels = (bwLineup.channels || []).filter((ch) => {
    if (isPromoChannel(ch)) return false;
    if (ch.kind === "ia") {
      const sc = bwSchedules.schedules[ch.id];
      return Boolean(sc && sc.items && sc.items.length > 0);
    }
    if (ch.kind === "pluto") {
      return Boolean(ch.pluto && plutoBundle.workingPlutoIds.has(ch.pluto));
    }
    return false;
  });

  const seenPlutoIds = new Set(
    verifiedBwChannels.filter((c) => c.pluto).map((c) => c.pluto!)
  );

  const workingExtraPluto = EXTRA_PLUTO_CHANNELS.filter(
    (ch) =>
      ch.pluto &&
      plutoBundle.workingPlutoIds.has(ch.pluto) &&
      !seenPlutoIds.has(ch.pluto)
  );

  const workingRetroChannels = RETROFILM_VAULT_SOURCES.map((r) => r.channel).filter(
    (ch) => Boolean(retroSchedules[ch.id]?.items.length)
  );

  const allChannels = [
    ...verifiedBwChannels,
    ...workingExtraPluto,
    ...workingRetroChannels,
    ...YOUTUBE_CHANNELS,
  ].sort((a, b) => a.num - b.num);

  return {
    lineup: {
      version: bwLineup.version,
      anchor: bwLineup.anchor,
      channels: allChannels,
    },
    schedules: {
      anchor: bwSchedules.anchor,
      schedules: {
        ...bwSchedules.schedules,
        ...retroSchedules,
      },
    },
    pluto: {
      urls: plutoBundle.urls,
      schedules: plutoBundle.schedules,
    },
  };
}

async function warmAllCaches(): Promise<void> {
  try {
    await buildBootstrapPayload();
    console.log("BingeTV caches pre-warmed and ready");
  } catch (err) {
    console.warn("Cache warmup warning:", err instanceof Error ? err.message : err);
  }
}

async function proxyJson(
  cacheKey: string,
  upstreamUrl: string,
  ttlMs: number,
  res: Response
): Promise<void> {
  const now = Date.now();
  const cached = jsonCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    res.setHeader("Content-Type", cached.contentType);
    res.setHeader("Cache-Control", "public, max-age=60");
    res.send(cached.body);
    return;
  }

  try {
    const upstreamRes = await fetch(upstreamUrl, {
      headers: {
        "User-Agent": "BingeTV/1.0",
        Accept: "application/json",
      },
    });
    if (!upstreamRes.ok) {
      if (cached) {
        res.setHeader("Content-Type", cached.contentType);
        res.send(cached.body);
        return;
      }
      res.status(upstreamRes.status).json({ error: `Upstream ${upstreamRes.status}` });
      return;
    }

    const body = await upstreamRes.text();
    const contentType =
      upstreamRes.headers.get("content-type") || "application/json; charset=utf-8";
    jsonCache.set(cacheKey, {
      body,
      contentType,
      expiresAt: now + ttlMs,
    });
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=60");
    res.send(body);
  } catch (err) {
    if (cached) {
      res.setHeader("Content-Type", cached.contentType);
      res.send(cached.body);
      return;
    }
    res.status(502).json({ error: err instanceof Error ? err.message : "Upstream unreachable" });
  }
}

async function startServer(): Promise<void> {
  const app = express();

  // Combined fast bootstrap endpoint (1 round-trip from warm RAM)
  app.get("/api/btv/bootstrap", async (_req: Request, res: Response) => {
    try {
      const payload = await buildBootstrapPayload();
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=60");
      res.json(payload);
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : "Failed to bootstrap BingeTV",
      });
    }
  });

  app.get("/api/btv/lineup", async (_req: Request, res: Response) => {
    try {
      const payload = await buildBootstrapPayload();
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=60");
      res.json(payload.lineup);
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : "Failed to build channel lineup",
      });
    }
  });

  app.get("/api/btv/schedules", async (_req: Request, res: Response) => {
    try {
      const payload = await buildBootstrapPayload();
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=60");
      res.json(payload.schedules);
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : "Failed to load schedules",
      });
    }
  });

  app.get("/api/btv/pluto", async (_req: Request, res: Response) => {
    try {
      const bundle = await getWorkingPlutoBundle();
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.json({
        urls: bundle.urls,
        schedules: bundle.schedules,
      });
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : "Failed to load Pluto data",
      });
    }
  });

  app.get("/api/btv/hls", async (req: Request, res: Response) => {
    const rawUrl = String(req.query.url || "");
    const targetUrl = isAllowedHlsUrl(rawUrl);
    if (!targetUrl) {
      res.status(400).json({ error: "Invalid or disallowed HLS URL" });
      return;
    }

    const cacheKey = targetUrl.toString();
    const cachedPlaylist = hlsPlaylistCache.get(cacheKey);
    if (cachedPlaylist && cachedPlaylist.expiresAt > Date.now()) {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Content-Type", "application/vnd.apple.mpegurl; charset=utf-8");
      res.send(cachedPlaylist.body);
      return;
    }

    try {
      const upstreamRes = await fetch(targetUrl.toString(), {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36",
          Origin: "https://pluto.tv",
          Referer: "https://pluto.tv/",
        },
        signal: AbortSignal.timeout(6000),
      });

      if (!upstreamRes.ok) {
        res.status(upstreamRes.status).end();
        return;
      }

      const contentType = upstreamRes.headers.get("content-type") || "";
      const finalUrl = upstreamRes.url || targetUrl.toString();
      const lowerPath = new URL(finalUrl).pathname.toLowerCase();
      const isBinaryAsset =
        lowerPath.endsWith(".key") ||
        lowerPath.endsWith(".ts") ||
        lowerPath.endsWith(".m4s") ||
        lowerPath.endsWith(".mp4") ||
        lowerPath.endsWith(".aac");
      const isPlaylist =
        !isBinaryAsset &&
        (lowerPath.endsWith(".m3u8") ||
          contentType.toLowerCase().includes("mpegurl"));

      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Cache-Control", "no-store");

      if (isPlaylist) {
        const text = await upstreamRes.text();
        if (text.trimStart().startsWith("#EXTM3U")) {
          const rewritten = rewriteM3u8(text, finalUrl);
          // Cache master playlists briefly (15s) & variant live playlists (2s) so prefetching hits instant RAM
          const isMaster = text.includes("#EXT-X-STREAM-INF");
          hlsPlaylistCache.set(cacheKey, {
            body: rewritten,
            expiresAt: Date.now() + (isMaster ? 30_000 : 2_000),
          });
          res.setHeader("Content-Type", "application/vnd.apple.mpegurl; charset=utf-8");
          res.send(rewritten);
          return;
        }
        res.setHeader("Content-Type", contentType || "application/octet-stream");
        res.send(Buffer.from(text, "utf8"));
        return;
      }

      if (lowerPath.endsWith(".key")) {
        res.setHeader("Content-Type", "application/octet-stream");
      } else if (contentType) {
        res.setHeader("Content-Type", contentType);
      }

      if (!upstreamRes.body) {
        res.end();
        return;
      }

      const nodeStream = Readable.fromWeb(
        upstreamRes.body as unknown as import("node:stream/web").ReadableStream
      );
      nodeStream.on("error", () => {
        if (!res.headersSent) res.status(502);
        res.end();
      });
      nodeStream.pipe(res);
    } catch {
      if (!res.headersSent) {
        res.status(502).json({ error: "HLS stream proxy failed" });
      }
    }
  });

  app.get("/api/btv/weather", async (_req: Request, res: Response) => {
    await proxyJson("weather", `${UPSTREAM}/api/weather`, 5 * 60_000, res);
  });

  app.get("/api/btv/weather-extra", async (_req: Request, res: Response) => {
    await proxyJson("weather-extra", `${UPSTREAM}/api/weather/extra`, 5 * 60_000, res);
  });

  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        ws: false,
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, "dist");
    app.use(express.static(distDir));
    app.get("*", (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`BingeTV server listening on http://0.0.0.0:${PORT}`);
    // Warm caches immediately in background and refresh every 9 minutes
    void warmAllCaches();
    setInterval(() => {
      void warmAllCaches();
    }, 9 * 60_000);
  });
}

startServer().catch((err) => {
  console.error("Failed to start BingeTV server:", err);
  process.exit(1);
});
