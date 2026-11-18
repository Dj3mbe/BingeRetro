"use strict";

const STORAGE_KEY = "bingeretro:v2";
const THEMES = ["classic", "amber", "green"];
// Shared reference point in Unix seconds. Every viewer uses the same value,
// so everyone tuning in sees the same moment of each channel's loop.
const EPOCH = 0;
const BANNER_MS = 3000;
const NUMBER_WAIT_MS = 1500;
const STATIC_MS = 300;
const SLOT_S = 1800;
const GUIDE_SPAN_S = 3 * 3600;
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
  notice: $("notice"),
  up: $("up"),
  down: $("down"),
  guideBtn: $("guideBtn"),
  setupBtn: $("setupBtn"),
  guide: $("guide"),
  guideHead: $("guideHead"),
  guideBody: $("guideBody"),
  setup: $("setup"),
  setupStatus: $("setupStatus"),
  setupClose: $("setupClose"),
  chanList: $("chanList"),
  newChannel: $("newChannel"),
  editor: $("editor"),
  editorTitle: $("editorTitle"),
  fNumber: $("fNumber"),
  fName: $("fName"),
  fItems: $("fItems"),
  addItem: $("addItem"),
  saveChannel: $("saveChannel"),
  cancelChannel: $("cancelChannel"),
  deleteChannel: $("deleteChannel"),
  theme: $("theme"),
  backup: $("backup"),
  exportBtn: $("exportBtn"),
  importBtn: $("importBtn"),
};

let settings = loadSettings();
let currentNumber = null;
let started = false;
let muted = false;
let tuneToken = 0;
let failures = 0;
let active = null; // { entry, offset, token } for the item on screen
let ytPlayer = null;
let ytPlayerReady = false;
let ytApi = null;
let bannerTimer = 0;
let digitBuffer = "";
let digitTimer = 0;
let guideTimer = 0;
let guideSel = 0;
let guideStart = 0;
let editing = null; // channel number being edited, "new", or null when closed

const results = new Map(); // channel item key -> { loaded } or { error }
const inflight = new Map(); // channel item key -> promise

const fmtTime = (sec) =>
  new Date(sec * 1000).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const isOpen = (node) => node.classList.contains("on");
const setOpen = (node, open) => node.classList.toggle("on", open);

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

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

function setupMessage(message) {
  ui.setupStatus.textContent = message;
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

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && Array.isArray(saved.channels)) {
      return {
        theme: THEMES.includes(saved.theme) ? saved.theme : "classic",
        channels: saved.channels,
      };
    }
  } catch {
    // Unreadable settings: start with an empty lineup.
  }
  return { theme: "classic", channels: [] };
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    return true;
  } catch {
    showNotice("Settings could not be saved. Browser storage may be full or disabled.");
    return false;
  }
}

function applyTheme() {
  document.documentElement.dataset.theme = settings.theme;
}

const sortedChannels = () => [...settings.channels].sort((a, b) => a.number - b.number);

function currentChannel() {
  const list = sortedChannels();
  return list.find((c) => c.number === currentNumber) || list[0] || null;
}

// Archive metadata is cached per identifier so repeat visits skip the network.
async function archiveMeta(identifier) {
  const key = `bingeretro-meta:${identifier}`;
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
    if (!item.videoId) throw new Error("YouTube item has no video ID");
    if (!(item.durationSeconds > 0)) {
      throw new Error(`YouTube ${item.videoId} needs a duration`);
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
      throw new Error(`no duration for "${item.identifier}"; add one in Setup`);
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

async function resolveChannel(items) {
  if (!items.length) throw new Error("no items yet");
  const entries = [];
  for (const item of items) {
    try {
      entries.push({ ...(await resolveItem(item)), index: entries.length });
    } catch (err) {
      console.warn(err.message);
    }
  }
  if (!entries.length) throw new Error("no playable items");
  const total = entries.reduce((sum, e) => sum + e.duration, 0);
  return { entries, total };
}

const keyOf = (ch) => JSON.stringify(ch.items);

function loadChannel(ch) {
  const key = keyOf(ch);
  if (!inflight.has(key)) {
    const promise = resolveChannel(ch.items).then(
      (loaded) => {
        results.set(key, { loaded });
        return loaded;
      },
      (err) => {
        results.set(key, { error: err.message });
        inflight.delete(key);
        throw err;
      },
    );
    inflight.set(key, promise);
  }
  return inflight.get(key);
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
    showNotice("Several items in this channel failed to play. Check the console or the lineup in Setup.");
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
  const ch = currentChannel();
  if (!ch) {
    stopPlayback();
    showBanner("", "No channels yet", "Press S or tap Setup to add one");
    return;
  }
  currentNumber = ch.number;
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
  const list = sortedChannels();
  if (!list.length) return;
  const index = Math.max(0, list.findIndex((c) => c.number === currentNumber));
  currentNumber = list[(index + step + list.length) % list.length].number;
  failures = 0;
  tune();
  if (isOpen(ui.guide)) renderGuide();
}

function tuneNumber(number) {
  const match = settings.channels.find((c) => c.number === number);
  if (!match) {
    showNotice(`No channel ${number}`);
    return;
  }
  currentNumber = number;
  failures = 0;
  tune();
  if (isOpen(ui.guide)) renderGuide();
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
  const ch = currentChannel();
  const loaded = ch && results.get(keyOf(ch))?.loaded;
  if (!loaded) return;
  const { entry, start } = positionAt(loaded, Date.now() / 1000);
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

function renderGuide() {
  const now = Date.now() / 1000;
  const list = sortedChannels();
  const windowEnd = guideStart + GUIDE_SPAN_S;
  guideSel = Math.min(guideSel, Math.max(0, list.length - 1));

  const head = el("div", "track");
  for (let t = guideStart; t < windowEnd; t += SLOT_S) {
    const tick = el("div", "tick", fmtTime(t));
    tick.style.left = `${((t - guideStart) / GUIDE_SPAN_S) * 100}%`;
    head.append(tick);
  }
  ui.guideHead.replaceChildren(el("div", "label", "Channel"), head);

  ui.guideBody.replaceChildren();
  if (!list.length) {
    ui.guideBody.append(el("p", "hint", "No channels yet. Open Setup to add some."));
    return;
  }

  list.forEach((ch, i) => {
    const row = el("div", i === guideSel ? "grow sel" : "grow");
    row.append(el("div", "label", `${ch.number}  ${ch.name}`));
    const track = el("div", "track");
    const result = results.get(keyOf(ch));

    if (result?.loaded) {
      for (const slot of upcoming(result.loaded, guideStart, GUIDE_SPAN_S)) {
        const start = Math.max(slot.start, guideStart);
        const end = Math.min(slot.start + slot.entry.duration, windowEnd);
        if (end <= start) continue;
        const prog = el("div", "prog", slot.entry.title);
        prog.style.left = `${((start - guideStart) / GUIDE_SPAN_S) * 100}%`;
        prog.style.width = `${((end - start) / GUIDE_SPAN_S) * 100}%`;
        prog.title = `${fmtTime(slot.start)} to ${fmtTime(slot.start + slot.entry.duration)}`;
        track.append(prog);
      }
    } else {
      const text = result?.error ? `Unavailable: ${result.error}` : "Loading...";
      track.append(el("div", "prog msg", text));
    }

    if (now >= guideStart && now < windowEnd) {
      const line = el("div", "nowline");
      line.style.left = `${((now - guideStart) / GUIDE_SPAN_S) * 100}%`;
      track.append(line);
    }
    row.append(track);
    ui.guideBody.append(row);
  });
}

function openGuide() {
  const list = sortedChannels();
  if (!list.length) {
    showNotice("Add a channel in Setup first.");
    return;
  }
  guideSel = Math.max(0, list.findIndex((c) => c.number === currentNumber));
  guideStart = Math.floor(Date.now() / 1000 / SLOT_S) * SLOT_S;
  setOpen(ui.guide, true);
  list.forEach((ch) => loadChannel(ch).catch(() => {}));
  renderGuide();
  clearInterval(guideTimer);
  guideTimer = setInterval(renderGuide, GUIDE_REFRESH_MS);
}

function closeGuide() {
  setOpen(ui.guide, false);
  clearInterval(guideTimer);
}

function toggleGuide() {
  if (isOpen(ui.guide)) closeGuide();
  else openGuide();
}

function guideKey(e) {
  const list = sortedChannels();
  switch (e.key) {
    case "ArrowUp":
      e.preventDefault();
      guideSel = Math.max(0, guideSel - 1);
      renderGuide();
      break;
    case "ArrowDown":
      e.preventDefault();
      guideSel = Math.min(list.length - 1, guideSel + 1);
      renderGuide();
      break;
    case "ArrowLeft":
      e.preventDefault();
      guideStart -= SLOT_S;
      renderGuide();
      break;
    case "ArrowRight":
      e.preventDefault();
      guideStart += SLOT_S;
      renderGuide();
      break;
    case "Enter":
      if (list[guideSel]) {
        currentNumber = list[guideSel].number;
        failures = 0;
        closeGuide();
        tune();
      }
      break;
    case "g":
    case "G":
      closeGuide();
      break;
    default:
  }
}

// Setup panel

function openSetup() {
  setOpen(ui.setup, true);
  closeEditor();
  setupMessage("");
  ui.theme.value = settings.theme;
  renderChannelList();
}

function closeSetup() {
  setOpen(ui.setup, false);
  closeEditor();
}

function toggleSetup() {
  if (isOpen(ui.setup)) closeSetup();
  else openSetup();
}

function renderChannelList() {
  ui.chanList.replaceChildren();
  const list = sortedChannels();
  if (!list.length) ui.chanList.append(el("p", "hint", "No channels yet."));
  for (const ch of list) {
    const row = el("div", "item-row");
    const count = ch.items.length;
    row.append(el("span", "", `${ch.number}  ${ch.name}  (${count} item${count === 1 ? "" : "s"})`));
    const edit = el("button", "", "Edit");
    edit.type = "button";
    edit.addEventListener("click", () => openEditor(ch.number));
    row.append(edit);
    ui.chanList.append(row);
  }
}

function nextFreeNumber() {
  return settings.channels.length ? Math.max(...settings.channels.map((c) => c.number)) + 1 : 1;
}

function addItemRow(item = {}) {
  const row = el("div", "item-edit");
  const source = el("select");
  source.append(new Option("archive.org", "archive"), new Option("YouTube", "youtube"));
  source.value = item.source === "youtube" ? "youtube" : "archive";

  const id = el("input");
  id.type = "text";
  id.placeholder = "identifier or video ID";
  id.value = item.identifier || item.videoId || "";

  const duration = el("input");
  duration.type = "number";
  duration.min = "1";
  duration.placeholder = "seconds";
  duration.value = item.durationSeconds ?? "";

  const title = el("input");
  title.type = "text";
  title.placeholder = "title (optional)";
  title.value = item.title || "";

  const remove = el("button", "", "Remove");
  remove.type = "button";
  remove.addEventListener("click", () => row.remove());

  row.append(source, id, duration, title, remove);
  ui.fItems.append(row);
}

function openEditor(number) {
  const ch = number === null ? null : settings.channels.find((c) => c.number === number);
  editing = ch ? ch.number : "new";
  ui.editorTitle.textContent = ch ? `Edit channel ${ch.number}` : "New channel";
  ui.fNumber.value = ch ? ch.number : nextFreeNumber();
  ui.fName.value = ch ? ch.name : "";
  ui.fItems.replaceChildren();
  (ch ? ch.items : [{}]).forEach((item) => addItemRow(item));
  ui.deleteChannel.hidden = !ch;
  ui.deleteChannel.dataset.armed = "";
  ui.deleteChannel.textContent = "Delete channel";
  ui.editor.hidden = false;
}

function closeEditor() {
  editing = null;
  ui.editor.hidden = true;
}

function readItemRows() {
  const items = [];
  for (const row of ui.fItems.children) {
    const [source, id, duration, title] = row.querySelectorAll("select, input");
    const value = id.value.trim();
    if (!value) continue;
    const item =
      source.value === "youtube"
        ? { source: "youtube", videoId: value }
        : { source: "archive", identifier: value };
    if (Number(duration.value) > 0) item.durationSeconds = Number(duration.value);
    if (title.value.trim()) item.title = title.value.trim();
    items.push(item);
  }
  return items;
}

function saveChannel() {
  const previous = editing;
  const number = Number(ui.fNumber.value);
  const name = ui.fName.value.trim();
  const items = readItemRows();

  if (!Number.isInteger(number) || number < 1) {
    setupMessage("Channel number must be a whole number of 1 or more.");
    return;
  }
  if (!name) {
    setupMessage("Give the channel a name.");
    return;
  }
  if (settings.channels.some((c) => c.number === number && c.number !== previous)) {
    setupMessage(`Channel ${number} is already in use.`);
    return;
  }
  if (!items.length) {
    setupMessage("Add at least one item with an ID.");
    return;
  }

  const channel = { number, name, items };
  if (previous === "new") {
    settings.channels.push(channel);
  } else {
    settings.channels = settings.channels.map((c) => (c.number === previous ? channel : c));
  }
  if (!persist()) return;

  if (currentNumber === null || currentNumber === previous) currentNumber = number;
  closeEditor();
  renderChannelList();
  setupMessage("Saved.");
}

function deleteChannel() {
  if (editing === "new") return;
  if (ui.deleteChannel.dataset.armed !== "yes") {
    ui.deleteChannel.dataset.armed = "yes";
    ui.deleteChannel.textContent = "Click again to delete";
    return;
  }
  settings.channels = settings.channels.filter((c) => c.number !== editing);
  if (currentNumber === editing) currentNumber = null;
  if (!persist()) return;
  closeEditor();
  renderChannelList();
  setupMessage("Channel deleted.");
}

function exportBackup() {
  ui.backup.value = JSON.stringify({ theme: settings.theme, channels: settings.channels }, null, 2);
  ui.backup.select();
  setupMessage("Copy the text above to keep a backup.");
}

function importBackup() {
  let data;
  try {
    data = JSON.parse(ui.backup.value);
  } catch {
    setupMessage("That text is not valid JSON.");
    return;
  }
  if (!data || !Array.isArray(data.channels)) {
    setupMessage("Expected an object with a channels list.");
    return;
  }
  const channels = data.channels.filter(
    (c) => Number.isInteger(c?.number) && typeof c?.name === "string" && Array.isArray(c?.items),
  );
  settings = {
    theme: THEMES.includes(data.theme) ? data.theme : settings.theme,
    channels,
  };
  if (!persist()) return;
  applyTheme();
  ui.theme.value = settings.theme;
  currentNumber = null;
  closeEditor();
  renderChannelList();
  setupMessage(`Imported ${channels.length} channel${channels.length === 1 ? "" : "s"}.`);
}

function startViewing() {
  if (started) return;
  started = true;
  ui.start.style.display = "none";
  if (!settings.channels.length) openSetup();
  else tune();
}

document.addEventListener("keydown", (e) => {
  if (!started) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      startViewing();
    }
    return;
  }

  if (e.key === "Escape") {
    if (isOpen(ui.guide)) closeGuide();
    else if (isOpen(ui.setup)) closeSetup();
    return;
  }

  const typing =
    e.target instanceof HTMLInputElement ||
    e.target instanceof HTMLTextAreaElement ||
    e.target instanceof HTMLSelectElement;
  if (typing) return;
  if (e.target instanceof HTMLButtonElement && (e.key === "Enter" || e.key === " ")) return;
  if (isOpen(ui.setup)) return;
  if (isOpen(ui.guide)) {
    guideKey(e);
    return;
  }

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
    case "s":
    case "S":
      toggleSetup();
      break;
    case "m":
    case "M":
      toggleMute();
      break;
    case "Enter":
      showInfo();
      break;
    default:
      if (/^[0-9]$/.test(e.key)) pushDigit(e.key);
  }
});

ui.start.addEventListener("click", startViewing);
ui.up.addEventListener("click", () => changeChannel(1));
ui.down.addEventListener("click", () => changeChannel(-1));
ui.guideBtn.addEventListener("click", toggleGuide);
ui.setupBtn.addEventListener("click", toggleSetup);
ui.setupClose.addEventListener("click", closeSetup);
ui.newChannel.addEventListener("click", () => openEditor(null));
ui.addItem.addEventListener("click", () => addItemRow());
ui.saveChannel.addEventListener("click", saveChannel);
ui.cancelChannel.addEventListener("click", closeEditor);
ui.deleteChannel.addEventListener("click", deleteChannel);
ui.theme.addEventListener("change", () => {
  settings.theme = ui.theme.value;
  persist();
  applyTheme();
});
ui.exportBtn.addEventListener("click", exportBackup);
ui.importBtn.addEventListener("click", importBackup);

applyTheme();
