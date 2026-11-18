"use strict";

// Shared reference point in Unix seconds. Every viewer uses the same value,
// so everyone tuning in sees the same moment of each channel's loop.
const EPOCH = 0;
const BANNER_MS = 3000;
const NUMBER_WAIT_MS = 1500;
const STATIC_MS = 300;
const GUIDE_WINDOW_S = 2 * 3600;
const GUIDE_REFRESH_MS = 30000;
const MAX_CONSECUTIVE_FAILURES = 5;
const VIDEO_FILE = /\.(mp4|m4v|webm|ogv)$/i;

const $ = (id) => document.getElementById(id);
const ui = {
  ytWrap: $("ytWrap"),
  video: $("video"),
  noise: $("static"),
  banner: $("banner"),
  bNum: $("bNum"),
  bTitle: $("bTitle"),
  bMeta: $("bMeta"),
  start: $("start"),
  guide: $("guide"),
  guideBody: $("guideBody"),
  notice: $("notice"),
  up: $("up"),
  down: $("down"),
  guideBtn: $("guideBtn"),
};

let channels = [];
let current = 0;
let started = false;
let muted = false;
let tuneToken = 0;
let failures = 0;
let active = null; // { entry, token, offset } for the item on screen
let ytPlayer = null;
let ytPlayerReady = false;
let ytApi = null;
let bannerTimer = 0;
let digitBuffer = "";
let digitTimer = 0;
let guideTimer = 0;

const fmtTime = (sec) =>
  new Date(sec * 1000).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

const isGuideOpen = () => ui.guide.classList.contains("on");

function parseLength(value) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const parts = String(value).split(":").map(Number);
  if (parts.some((p) => !Number.isFinite(p))) return null;
  return parts.reduce((total, p) => total * 60 + p, 0);
}

function showNotice(message) {
  ui.notice.textContent = message;
  ui.notice.style.display = message ? "block" : "none";
}

function showBanner(number, title, meta, ms = BANNER_MS) {
  ui.bNum.textContent = number;
  ui.bTitle.textContent = title;
  ui.bMeta.textContent = meta;
  ui.banner.classList.add("on");
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => ui.banner.classList.remove("on"), ms);
}

function showEntryBanner(ch, entry, start) {
  const range = `${fmtTime(start)} to ${fmtTime(start + entry.duration)}`;
  const licence = entry.licence ? `  |  ${entry.licence}` : "";
  showBanner(`${ch.number}  ${ch.name}`, entry.title, range + licence);
}

// Archive metadata is cached per identifier so repeat visits skip the network.
async function archiveMeta(identifier) {
  const key = `lineup-meta:${identifier}`;
  try {
    const cached = JSON.parse(localStorage.getItem(key));
    if (cached) return cached;
  } catch {
    // Unreadable cache entry: fetch again below.
  }

  const res = await fetch(`https://archive.org/metadata/${encodeURIComponent(identifier)}`);
  if (!res.ok) throw new Error(`archive.org returned ${res.status} for "${identifier}"`);
  const json = await res.json();
  const meta = {
    title: json.metadata?.title || "",
    licence: json.metadata?.licenseurl || "",
    files: (json.files || [])
      .filter((f) => VIDEO_FILE.test(f.name))
      .map((f) => ({ name: f.name, format: f.format || "", length: parseLength(f.length) })),
  };
  try {
    localStorage.setItem(key, JSON.stringify(meta));
  } catch {
    // Storage full: keep playing without caching.
  }
  return meta;
}

function pickArchiveFile(files) {
  return (
    files.find((f) => /\.mp4$/i.test(f.name) && /h\.?264|mpeg4/i.test(f.format)) ||
    files.find((f) => /\.mp4$/i.test(f.name)) ||
    files[0] ||
    null
  );
}

async function resolveItem(item) {
  if (item.source === "youtube") {
    if (!item.videoId) throw new Error("YouTube item has no videoId");
    if (!(item.durationSeconds > 0)) {
      throw new Error(`YouTube ${item.videoId} needs durationSeconds`);
    }
    return {
      kind: "youtube",
      videoId: item.videoId,
      duration: item.durationSeconds,
      title: item.title || "YouTube",
      licence: item.licence || "",
    };
  }

  if (item.source === "archive") {
    if (!item.identifier) throw new Error("archive item has no identifier");
    const meta = await archiveMeta(item.identifier);
    const file = item.file
      ? meta.files.find((f) => f.name === item.file)
      : pickArchiveFile(meta.files);
    if (!file) throw new Error(`no playable video file in "${item.identifier}"`);
    const duration = item.durationSeconds > 0 ? item.durationSeconds : file.length;
    if (!(duration > 0)) {
      throw new Error(`no duration for "${item.identifier}"; add durationSeconds`);
    }
    const path = file.name.split("/").map(encodeURIComponent).join("/");
    return {
      kind: "archive",
      url: `https://archive.org/download/${encodeURIComponent(item.identifier)}/${path}`,
      duration,
      title: item.title || meta.title || item.identifier,
      licence: item.licence || meta.licence,
    };
  }

  throw new Error(`unknown source "${item.source}"`);
}

// Resolves every item in a channel once. Items that fail are skipped and logged.
function loadChannel(ch) {
  if (!ch.loading) {
    ch.loading = (async () => {
      const entries = [];
      const skipped = [];
      for (const item of ch.items || []) {
        try {
          entries.push({ ...(await resolveItem(item)), index: entries.length });
        } catch (err) {
          skipped.push(err.message);
          console.warn(`Channel ${ch.number}: ${err.message}`);
        }
      }
      if (!entries.length) throw new Error("no playable items");
      const total = entries.reduce((sum, e) => sum + e.duration, 0);
      ch.error = "";
      ch.loaded = { entries, total, skipped };
      return ch.loaded;
    })();
    ch.loading.catch((err) => {
      ch.error = err.message;
      ch.loading = null;
    });
  }
  return ch.loading;
}

// Where a channel is in its loop at time t (seconds).
function positionAt(loaded, t) {
  const elapsed = (((t - EPOCH) % loaded.total) + loaded.total) % loaded.total;
  let acc = 0;
  for (const entry of loaded.entries) {
    if (elapsed < acc + entry.duration) {
      const offset = elapsed - acc;
      return { entry, offset, start: t - offset };
    }
    acc += entry.duration;
  }
  return { entry: loaded.entries[0], offset: 0, start: t };
}

// Items airing from time t through the next windowS seconds.
function upcoming(loaded, t, windowS) {
  const { entry, start } = positionAt(loaded, t);
  const list = [];
  let i = entry.index;
  let s = start;
  while (s < t + windowS && list.length < 50) {
    const e = loaded.entries[i];
    list.push({ entry: e, start: s });
    s += e.duration;
    i = (i + 1) % loaded.entries.length;
  }
  return list;
}

function staticNoise(ms) {
  return new Promise((resolve) => {
    const c = ui.noise;
    const ctx = c.getContext("2d");
    c.width = Math.max(1, Math.floor(window.innerWidth / 4));
    c.height = Math.max(1, Math.floor(window.innerHeight / 4));
    const img = ctx.createImageData(c.width, c.height);
    const px = img.data;
    const end = performance.now() + ms;
    c.classList.add("on");
    const frame = () => {
      for (let i = 0; i < px.length; i += 4) {
        const v = Math.random() * 255;
        px[i] = v;
        px[i + 1] = v;
        px[i + 2] = v;
        px[i + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
      if (performance.now() < end) {
        requestAnimationFrame(frame);
      } else {
        c.classList.remove("on");
        resolve();
      }
    };
    frame();
  });
}

function loadYouTubeApi() {
  if (!ytApi) {
    ytApi = new Promise((resolve) => {
      if (window.YT && window.YT.Player) return resolve(true);
      window.onYouTubeIframeAPIReady = () => resolve(true);
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      script.onerror = () => {
        ytApi = null;
        resolve(false);
      };
      document.head.appendChild(script);
    });
  }
  return ytApi;
}

function stopPlayback() {
  ui.video.pause();
  ui.video.removeAttribute("src");
  ui.video.load();
  ui.video.classList.remove("on");
  ui.ytWrap.classList.remove("on");
  if (ytPlayerReady) ytPlayer.stopVideo();
  active = null;
}

function itemEnded(token) {
  if (token !== tuneToken || !active) return;
  tune(active.entry.index);
}

function itemFailed(token, reason) {
  if (token !== tuneToken || !active) return;
  failures += 1;
  console.warn(`Playback failed (${reason}): ${active.entry.title}`);
  if (failures > MAX_CONSECUTIVE_FAILURES) {
    stopPlayback();
    showNotice("Several items in this channel failed to play. Check the console or channels.json.");
    return;
  }
  tune(active.entry.index);
}

function playArchive(entry, offset, token) {
  const v = ui.video;
  v.muted = muted;
  v.classList.add("on");
  v.onloadedmetadata = () => {
    if (offset > 0) v.currentTime = offset;
  };
  v.onplaying = () => {
    failures = 0;
  };
  v.onended = () => itemEnded(token);
  v.onerror = () => itemFailed(token, "video error");
  v.src = entry.url;
  v.play().catch((err) => {
    if (err.name === "NotAllowedError") showNotice("Playback was blocked. Press Enter to resume.");
  });
}

function loadActiveYouTube() {
  if (!active || active.entry.kind !== "youtube") return;
  ytPlayer.loadVideoById({ videoId: active.entry.videoId, startSeconds: active.offset });
  if (muted) ytPlayer.mute();
  else ytPlayer.unMute();
}

async function playYouTube(token) {
  ui.ytWrap.classList.add("on");
  const apiReady = await loadYouTubeApi();
  if (token !== tuneToken) return;
  if (!apiReady || !window.YT || !window.YT.Player) {
    showNotice("The YouTube player could not load. Check your connection.");
    return;
  }
  if (!ytPlayer) {
    ytPlayer = new window.YT.Player("ytHost", {
      playerVars: { autoplay: 1, controls: 0, rel: 0, modestbranding: 1, playsinline: 1 },
      events: {
        onReady: () => {
          ytPlayerReady = true;
          loadActiveYouTube();
        },
        onStateChange: (e) => {
          if (e.data === window.YT.PlayerState.PLAYING) failures = 0;
          if (e.data === window.YT.PlayerState.ENDED && active) itemEnded(active.token);
        },
        onError: () => {
          if (active) itemFailed(active.token, "YouTube error");
        },
      },
    });
  } else if (ytPlayerReady) {
    loadActiveYouTube();
  }
}

function play(entry, offset, token) {
  stopPlayback();
  active = { entry, offset, token };
  if (entry.kind === "youtube") playYouTube(token);
  else playArchive(entry, offset, token);
}

async function tune(skipIndex = null) {
  const ch = channels[current];
  if (!ch) return;
  const token = ++tuneToken;
  showNotice("");
  const noise = staticNoise(STATIC_MS);

  let loaded;
  try {
    loaded = await loadChannel(ch);
  } catch (err) {
    await noise;
    if (token !== tuneToken) return;
    stopPlayback();
    showNotice(`Channel ${ch.number} (${ch.name}): ${err.message}`);
    showBanner(`${ch.number}  ${ch.name}`, "No signal", "");
    return;
  }

  await noise;
  if (token !== tuneToken) return;

  let { entry, offset, start } = positionAt(loaded, Date.now() / 1000);
  if (skipIndex !== null && entry.index === skipIndex) {
    entry = loaded.entries[(skipIndex + 1) % loaded.entries.length];
    offset = 0;
    start = Date.now() / 1000;
  }

  play(entry, offset, token);
  showEntryBanner(ch, entry, start);
}

function changeChannel(step) {
  current = (current + step + channels.length) % channels.length;
  failures = 0;
  tune();
  if (isGuideOpen()) renderGuide();
}

function tuneNumber(number) {
  const index = channels.findIndex((c) => c.number === number);
  if (index === -1) {
    showNotice(`No channel ${number}`);
    return;
  }
  current = index;
  failures = 0;
  tune();
  if (isGuideOpen()) renderGuide();
}

function pushDigit(digit) {
  digitBuffer = (digitBuffer + digit).slice(-4);
  ui.bNum.textContent = digitBuffer;
  ui.bTitle.textContent = "";
  ui.bMeta.textContent = "";
  ui.banner.classList.add("on");
  clearTimeout(digitTimer);
  digitTimer = setTimeout(() => {
    const number = Number(digitBuffer);
    digitBuffer = "";
    tuneNumber(number);
  }, NUMBER_WAIT_MS);
}

function showInfo() {
  const ch = channels[current];
  if (!ch || !ch.loaded) return;
  const { entry, start } = positionAt(ch.loaded, Date.now() / 1000);
  showEntryBanner(ch, entry, start);
}

function toggleMute() {
  muted = !muted;
  ui.video.muted = muted;
  if (ytPlayerReady) {
    if (muted) ytPlayer.mute();
    else ytPlayer.unMute();
  }
  showBanner("", muted ? "Muted" : "Sound on", "", 1200);
}

function cell(text, className) {
  const td = document.createElement("td");
  td.textContent = text;
  if (className) td.className = className;
  return td;
}

function renderGuide() {
  const now = Date.now() / 1000;
  ui.guideBody.replaceChildren();

  channels.forEach((ch, i) => {
    const tr = document.createElement("tr");
    if (i === current) tr.className = "current";
    tr.append(cell(String(ch.number)), cell(ch.name));

    if (ch.loaded) {
      const slots = upcoming(ch.loaded, now, GUIDE_WINDOW_S).slice(0, 3);
      for (let k = 0; k < 3; k++) {
        const slot = slots[k];
        if (!slot) {
          tr.append(cell(""));
          continue;
        }
        const td = document.createElement("td");
        const time = document.createElement("div");
        time.className = "time";
        time.textContent = fmtTime(slot.start);
        td.append(time, slot.entry.title);
        tr.append(td);
      }
    } else {
      const td = cell(ch.error ? `Unavailable: ${ch.error}` : "Loading...");
      td.colSpan = 3;
      tr.append(td);
    }
    ui.guideBody.append(tr);
  });
}

function toggleGuide(force) {
  const open = force ?? !isGuideOpen();
  ui.guide.classList.toggle("on", open);
  clearInterval(guideTimer);
  if (open) {
    channels.forEach((ch) => loadChannel(ch).catch(() => {}));
    renderGuide();
    guideTimer = setInterval(renderGuide, GUIDE_REFRESH_MS);
  }
}

function startViewing() {
  if (started || !channels.length) return;
  started = true;
  ui.start.style.display = "none";
  tune();
}

document.addEventListener("keydown", (e) => {
  if (!started) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      startViewing();
    }
    return;
  }
  if (e.target instanceof HTMLButtonElement && (e.key === "Enter" || e.key === " ")) return;

  switch (e.key) {
    case "ArrowUp":
    case "PageUp":
    case "ChannelUp":
      e.preventDefault();
      changeChannel(1);
      break;
    case "ArrowDown":
    case "PageDown":
    case "ChannelDown":
      e.preventDefault();
      changeChannel(-1);
      break;
    case "g":
    case "G":
      toggleGuide();
      break;
    case "Escape":
      toggleGuide(false);
      break;
    case "m":
    case "M":
      toggleMute();
      break;
    case "Enter":
      if (isGuideOpen()) toggleGuide(false);
      else showInfo();
      break;
    default:
      if (/^[0-9]$/.test(e.key)) pushDigit(e.key);
  }
});

ui.start.addEventListener("click", startViewing);
ui.up.addEventListener("click", () => changeChannel(1));
ui.down.addEventListener("click", () => changeChannel(-1));
ui.guideBtn.addEventListener("click", () => toggleGuide());

async function init() {
  const res = await fetch("channels.json", { cache: "no-cache" });
  if (!res.ok) throw new Error(`channels.json returned ${res.status}`);
  const data = await res.json();
  channels = [...(data.channels || [])].sort((a, b) => a.number - b.number);
  if (!channels.length) throw new Error("channels.json has no channels");
}

init().catch((err) => showNotice(`Could not load channels: ${err.message}`));
