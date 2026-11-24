import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import { Play, Radio, Tv } from "lucide-react";
import type {
  Channel,
  ChannelSchedule,
  NowNextInfo,
} from "../types/tv.ts";
import {
  formatClock,
  formatDuration,
  getNowNext,
  slotAt,
} from "../utils/scheduleEngine.ts";
import { WeatherStarView } from "./WeatherStarView.tsx";

interface VideoStageProps {
  channel: Channel | null;
  schedules: Record<string, ChannelSchedule>;
  globalAnchor: number;
  plutoUrls: Record<string, string>;
  aspect43: boolean;
  scanlines: boolean;
  volume: number;
  muted: boolean;
  isPlaying: boolean;
  onPlayingChange: (playing: boolean) => void;
  showBannerSignal: number;
  digitBuffer: string;
  nowMs: number;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  stageContainerRef: React.RefObject<HTMLDivElement | null>;
  onStageClick: () => void;
  couchMode?: boolean;
}

export function VideoStage({
  channel,
  schedules,
  globalAnchor,
  plutoUrls,
  aspect43,
  scanlines,
  volume,
  muted,
  onPlayingChange,
  showBannerSignal,
  digitBuffer,
  nowMs,
  videoRef,
  stageContainerRef,
  onStageClick,
  couchMode = false,
}: VideoStageProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [needsGesture, setNeedsGesture] = useState(false);
  const [bannerVisible, setBannerVisible] = useState(false);

  const tuneGenRef = useRef(0);
  const badUrlsRef = useRef<Set<string>>(new Set());
  const retryTimerRef = useRef<number | null>(null);
  const bannerTimerRef = useRef<number | null>(null);
  const hlsRef = useRef<Hls | null>(null);

  // Sync volume & mute to video element
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = Math.min(1, Math.max(0, volume));
    video.muted = muted;
  }, [volume, muted, videoRef]);

  // Show OSD banner briefly on channel tune or info trigger
  useEffect(() => {
    if (!channel) return;
    setBannerVisible(true);
    if (bannerTimerRef.current) window.clearTimeout(bannerTimerRef.current);
    bannerTimerRef.current = window.setTimeout(() => {
      setBannerVisible(false);
    }, 4500);
    return () => {
      if (bannerTimerRef.current) window.clearTimeout(bannerTimerRef.current);
    };
  }, [channel?.id, showBannerSignal]);

  // Main tuning effect
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !channel) return;

    const gen = ++tuneGenRef.current;
    if (retryTimerRef.current) window.clearTimeout(retryTimerRef.current);
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    video.onloadedmetadata = null;
    video.onplaying = null;
    video.onended = null;
    video.onerror = null;

    setStatusMessage("");
    setNeedsGesture(false);

    // YouTube embed channel
    if (channel.kind === "youtube") {
      video.pause();
      video.removeAttribute("src");
      video.load();
      setIsLoading(false);
      onPlayingChange(true);
      return;
    }

    // Pluto TV live HLS channels
    if (channel.kind === "pluto") {
      const rawStreamUrl = channel.pluto ? plutoUrls[channel.pluto] : undefined;
      if (!rawStreamUrl) {
        setIsLoading(false);
        setStatusMessage("Pluto stream URL unavailable for this channel.");
        return;
      }

      setIsLoading(true);
      const proxiedHlsUrl = `/api/btv/hls?url=${encodeURIComponent(rawStreamUrl)}`;

      const markReady = () => {
        if (gen !== tuneGenRef.current) return;
        setIsLoading(false);
        setStatusMessage("");
        setNeedsGesture(false);
      };

      video.onloadeddata = markReady;
      video.oncanplay = markReady;
      video.onplaying = () => {
        if (gen !== tuneGenRef.current) return;
        markReady();
        onPlayingChange(true);
      };

      if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: false,
          startLevel: 0,
          capLevelToPlayerSize: true,
          startFragPrefetch: true,
          maxBufferLength: 10,
          maxMaxBufferLength: 20,
          manifestLoadingTimeOut: 6000,
          fragLoadingTimeOut: 8000,
        });
        hlsRef.current = hls;
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          if (gen !== tuneGenRef.current) return;
          video.play().catch((err) => {
            if (gen === tuneGenRef.current && err?.name === "NotAllowedError") {
              setIsLoading(false);
              setNeedsGesture(true);
              onPlayingChange(false);
            }
          });
        });
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (gen !== tuneGenRef.current) return;
          if (data.fatal) {
            if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
              hls.startLoad();
            } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
              hls.recoverMediaError();
            } else {
              setIsLoading(false);
              setStatusMessage("Live Pluto stream unavailable right now.");
              hls.destroy();
            }
          }
        });
        hls.loadSource(proxiedHlsUrl);
        hls.attachMedia(video);
      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = proxiedHlsUrl;
        video.play().catch((err) => {
          if (gen === tuneGenRef.current && err?.name === "NotAllowedError") {
            setIsLoading(false);
            setNeedsGesture(true);
            onPlayingChange(false);
          }
        });
      } else {
        setIsLoading(false);
        setStatusMessage("HLS playback is not supported in this browser.");
      }

      return () => {
        tuneGenRef.current++;
        if (hlsRef.current) {
          hlsRef.current.destroy();
          hlsRef.current = null;
        }
      };
    }

    // Internet Archive & WeatherStar scheduled playback
    const playAudioOrVideo = (targetChannel: Channel, skipCount: number) => {
      if (gen !== tuneGenRef.current) return;
      const nowSec = Date.now() / 1000;
      const slot = slotAt(targetChannel, schedules, globalAnchor, nowSec);
      if (!slot) {
        setIsLoading(false);
        setStatusMessage("Waiting for channel schedule...");
        return;
      }

      const schedule = schedules[targetChannel.id];
      let item = slot.item;
      let offset = slot.offsetSec;

      if (schedule && schedule.items.length > 0) {
        let k = 0;
        while (
          k < skipCount + schedule.items.length &&
          badUrlsRef.current.has(item.u + (item._fb ? "#f" : ""))
        ) {
          item = schedule.items[(slot.index + 1 + k) % schedule.items.length];
          offset = 0;
          k++;
        }
      }

      setIsLoading(targetChannel.kind !== "weather");
      const baseSrc = item._fb && item.f ? item.f : item.u;
      // Use HTML5 media fragment #t= so browser seeks directly without buffering 0s first
      const src =
        targetChannel.kind !== "weather" && offset > 2
          ? `${baseSrc}#t=${Math.floor(offset)}`
          : baseSrc;

      video.onloadedmetadata = () => {
        if (gen !== tuneGenRef.current) return;
        if (
          offset > 2 &&
          Math.abs(video.currentTime - offset) > 3 &&
          offset < (video.duration || 1e9)
        ) {
          video.currentTime = offset;
        }
      };

      video.oncanplay = () => {
        if (gen !== tuneGenRef.current) return;
        setIsLoading(false);
        setStatusMessage("");
      };

      video.onplaying = () => {
        if (gen !== tuneGenRef.current) return;
        setIsLoading(false);
        setStatusMessage("");
        setNeedsGesture(false);
        onPlayingChange(true);
      };

      video.onended = () => {
        if (gen === tuneGenRef.current) {
          playAudioOrVideo(targetChannel, 0);
        }
      };

      video.onerror = () => {
        if (gen !== tuneGenRef.current) return;
        if (item.f && !item._fb) {
          item._fb = true;
          playAudioOrVideo(targetChannel, 0);
        } else {
          badUrlsRef.current.add(item.u + (item._fb ? "#f" : ""));
          setIsLoading(false);
          setStatusMessage("Signal interrupted — switching to next program...");
          retryTimerRef.current = window.setTimeout(() => {
            if (gen === tuneGenRef.current) {
              setStatusMessage("");
              playAudioOrVideo(targetChannel, skipCount + 1);
            }
          }, 900);
        }
      };

      video.src = src;
      video.play().catch((err) => {
        if (gen === tuneGenRef.current && err?.name === "NotAllowedError") {
          setIsLoading(false);
          setNeedsGesture(true);
          onPlayingChange(false);
        }
      });
    };

    playAudioOrVideo(channel, 0);

    return () => {
      tuneGenRef.current++;
      if (retryTimerRef.current) window.clearTimeout(retryTimerRef.current);
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [channel?.id, schedules, globalAnchor, plutoUrls]);

  const nowInfo: NowNextInfo | null = channel
    ? getNowNext(channel, schedules, globalAnchor, nowMs / 1000)
    : null;

  const handleResumeGesture = () => {
    const video = videoRef.current;
    if (!video) return;
    setNeedsGesture(false);
    video
      .play()
      .then(() => {
        onPlayingChange(true);
      })
      .catch(() => {});
  };

  return (
    <div
      ref={stageContainerRef}
      onClick={() => {
        if (needsGesture) {
          handleResumeGesture();
        } else {
          onStageClick();
        }
      }}
      className={
        couchMode
          ? "relative flex h-full w-full items-center justify-center overflow-hidden bg-black cursor-pointer select-none"
          : "relative flex w-full items-center justify-center overflow-hidden rounded-xl border border-[#261E38] bg-black aspect-video cursor-pointer select-none"
      }
    >
      <div
        className={`relative h-full overflow-hidden transition-all duration-200 ${
          aspect43 ? "aspect-[4/3] w-auto max-w-full" : "w-full"
        }`}
      >
        <video
          ref={videoRef}
          playsInline
          className={`h-full w-full bg-black ${
            aspect43 ? "object-fill" : "object-contain"
          }`}
        />

        {channel?.kind === "weather" && <WeatherStarView nowMs={nowMs} />}

        {channel?.kind === "youtube" && (channel.ytVideoId || channel.ytPlaylistId) && (
          <iframe
            key={channel.id}
            src={
              channel.ytPlaylistId
                ? `https://www.youtube-nocookie.com/embed/videoseries?list=${encodeURIComponent(
                    channel.ytPlaylistId
                  )}&autoplay=1&rel=0&modestbranding=1&mute=${muted ? 1 : 0}`
                : `https://www.youtube-nocookie.com/embed/${encodeURIComponent(
                    channel.ytVideoId!
                  )}?autoplay=1&rel=0&modestbranding=1&mute=${muted ? 1 : 0}`
            }
            title={channel.ytTitle || channel.name}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            className="absolute inset-0 z-10 h-full w-full border-0 bg-black"
          />
        )}

        {scanlines && (
          <div
            aria-hidden="true"
            className="crt-scanlines pointer-events-none absolute inset-0 z-20 opacity-60"
          />
        )}

        {/* Loading / Tuning Overlay */}
        {isLoading &&
          channel?.kind !== "weather" &&
          channel?.kind !== "youtube" &&
          !needsGesture && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-[#09080D]/85 text-center">
              <div className="flex h-1.5 w-32 overflow-hidden rounded-full bg-[#261E38]">
                <div className="w-1/5 bg-[#F5F3EE]" />
                <div className="w-1/5 bg-[#DFBA57]" />
                <div className="w-1/5 bg-[#7C3AED]" />
                <div className="w-1/5 bg-emerald-400" />
                <div className="w-1/5 bg-rose-500" />
              </div>
              <div className="font-mono text-sm font-medium text-[#EFECE6]">
                Tuning Ch {channel?.num} · {channel?.name}
              </div>
            </div>
          )}

        {/* Signal Recovery Message */}
        {statusMessage && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-[#09080D]/90 px-6 text-center">
            <Radio className="h-7 w-7 text-[#DFBA57]" aria-hidden="true" />
            <p className="font-mono text-sm text-[#F5F3EE]">{statusMessage}</p>
          </div>
        )}

        {/* Click-to-Tune Unblock Overlay */}
        {needsGesture && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-[#09080D]/80 px-6 text-center backdrop-blur-[2px]">
            <div className="kings-gold-btn flex h-14 w-14 items-center justify-center rounded-full shadow-lg">
              <Play className="ml-0.5 h-6 w-6 fill-current" aria-hidden="true" />
            </div>
            <div>
              <p className="font-display text-xl font-bold text-white">
                Click to Tune In
              </p>
              <p className="mt-1 text-sm text-[#A79EB9]">
                Ch {channel?.num} · {channel?.name}
                {nowInfo?.currentTitle ? ` · ${nowInfo.currentTitle}` : ""}
              </p>
            </div>
          </div>
        )}

        {/* Direct Number Entry OSD */}
        {digitBuffer && (
          <div className="absolute right-6 top-6 z-30 rounded-lg border border-[#DFBA57]/60 bg-[#09080D]/90 px-4 py-2 font-mono text-3xl font-bold tracking-widest text-[#DFBA57] tabular-nums">
            {digitBuffer}
          </div>
        )}

        {/* Channel Banner OSD */}
        {channel && nowInfo && (
          <div
            className={`pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/90 via-black/65 to-transparent transition-opacity duration-200 ${
              couchMode ? "px-8 pb-7 pt-16" : "px-5 pb-4 pt-12"
            } ${bannerVisible ? "opacity-100" : "opacity-0"}`}
          >
            <div className="flex items-end justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div
                  className={`flex items-center gap-2 font-medium text-[#F3D98B] ${
                    couchMode ? "text-sm sm:text-base" : "text-xs"
                  }`}
                >
                  <span className="font-mono font-bold tabular-nums">
                    CH {channel.num}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="truncate text-[#EFECE6]">{channel.name}</span>
                  {channel.cat && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="hidden sm:inline text-[#A79EB9]">
                        {channel.cat}
                      </span>
                    </>
                  )}
                </div>
                <div
                  className={`mt-1 truncate font-display font-bold text-white ${
                    couchMode ? "text-2xl sm:text-3xl" : "text-lg sm:text-xl"
                  }`}
                >
                  {nowInfo.currentTitle}
                </div>
                {nowInfo.nextTitle && (
                  <div
                    className={`mt-0.5 truncate text-[#D7D1E2] ${
                      couchMode ? "text-sm" : "text-xs"
                    }`}
                  >
                    Up next: {nowInfo.nextTitle}
                  </div>
                )}
              </div>

              <div
                className={`shrink-0 text-right font-mono text-[#D7D1E2] tabular-nums ${
                  couchMode ? "text-sm sm:text-base" : "text-xs"
                }`}
              >
                <div>{formatClock(nowMs)}</div>
                {nowInfo.durationSec > 0 && (
                  <div className="mt-0.5 text-[#A79EB9]">
                    {formatDuration(nowInfo.durationSec - nowInfo.elapsedSec)} left
                  </div>
                )}
              </div>
            </div>

            {nowInfo.durationSec > 0 && (
              <div className="mt-2.5 h-1 w-full overflow-hidden rounded-full bg-white/15">
                <div
                  className="h-full bg-[#DFBA57] transition-all duration-300"
                  style={{ width: `${nowInfo.progressPct}%` }}
                />
              </div>
            )}

            {couchMode && (
              <div className="mt-2.5 font-mono text-xs text-[#A79EB9]">
                ↑/↓ Channel · ← Guide · OK Info · M Mute · Esc Exit
              </div>
            )}
          </div>
        )}

        {!channel && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-[#9CA3AF]">
            <Tv className="h-8 w-8" aria-hidden="true" />
            <span className="text-sm">Select a channel to begin watching</span>
          </div>
        )}
      </div>
    </div>
  );
}
