import { useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Heart,
  Info,
  Maximize,
  Monitor,
  Pause,
  Play,
  Smartphone,
  Tv,
  Volume2,
  VolumeX,
} from "lucide-react";
import type { Channel, NowNextInfo } from "../types/tv.ts";
import { formatDuration } from "../utils/scheduleEngine.ts";

interface PlayerControlsProps {
  channel: Channel | null;
  nowInfo: NowNextInfo | null;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onChannelStep: (delta: number) => void;
  onJumpToNumber: (num: number) => boolean;
  volume: number;
  muted: boolean;
  onVolumeChange: (val: number) => void;
  onToggleMute: () => void;
  aspect43: boolean;
  onToggleAspect43: () => void;
  scanlines: boolean;
  onToggleScanlines: () => void;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onShowBanner: () => void;
  onFullscreen: () => void;
  onOpenTvSetup: () => void;
}

export function PlayerControls({
  channel,
  nowInfo,
  isPlaying,
  onTogglePlay,
  onChannelStep,
  onJumpToNumber,
  volume,
  muted,
  onVolumeChange,
  onToggleMute,
  aspect43,
  onToggleAspect43,
  scanlines,
  onToggleScanlines,
  isFavorite,
  onToggleFavorite,
  onShowBanner,
  onFullscreen,
  onOpenTvSetup,
}: PlayerControlsProps) {
  const [jumpInput, setJumpInput] = useState("");
  const [jumpError, setJumpError] = useState(false);

  const handleJumpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const num = Number(jumpInput.trim());
    if (!Number.isFinite(num) || num <= 0) return;
    const found = onJumpToNumber(num);
    if (found) {
      setJumpInput("");
      setJumpError(false);
    } else {
      setJumpError(true);
      window.setTimeout(() => setJumpError(false), 1500);
    }
  };

  return (
    <div className="mt-3 rounded-xl border border-[#261E38] bg-[#110E1A] p-4">
      {/* Control Toolbar Row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Channel Surfing + Direct Tune */}
        <div className="flex items-center gap-2">
          <div className="flex items-center overflow-hidden rounded-lg border border-[#2D2345] bg-[#181227]">
            <button
              type="button"
              onClick={() => onChannelStep(-1)}
              title="Channel Down (Down Arrow)"
              aria-label="Channel Down"
              className="flex h-10 items-center gap-1 px-3 text-xs font-semibold text-[#EFECE6] transition-colors hover:bg-[#231A38] hover:text-[#F3D98B] whitespace-nowrap shrink-0 cursor-pointer"
            >
              <ChevronDown className="h-4 w-4" aria-hidden="true" />
              <span>CH</span>
            </button>
            <span className="border-x border-[#2D2345] px-3 font-mono text-sm font-bold text-[#DFBA57] tabular-nums whitespace-nowrap shrink-0">
              {channel ? String(channel.num).padStart(3, "0") : "---"}
            </span>
            <button
              type="button"
              onClick={() => onChannelStep(1)}
              title="Channel Up (Up Arrow)"
              aria-label="Channel Up"
              className="flex h-10 items-center gap-1 px-3 text-xs font-semibold text-[#EFECE6] transition-colors hover:bg-[#231A38] hover:text-[#F3D98B] whitespace-nowrap shrink-0 cursor-pointer"
            >
              <span>CH</span>
              <ChevronUp className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <form onSubmit={handleJumpSubmit} className="hidden sm:flex items-center">
            <input
              type="text"
              inputMode="numeric"
              maxLength={3}
              value={jumpInput}
              onChange={(e) => setJumpInput(e.target.value.replace(/\D/g, ""))}
              placeholder="Ch #"
              aria-label="Jump to channel number"
              className={`h-10 w-16 rounded-l-lg border bg-[#09080D] px-2.5 font-mono text-xs text-white placeholder-[#7B7092] focus:outline-none tabular-nums ${
                jumpError
                  ? "border-red-500 text-red-300"
                  : "border-[#2D2345] focus:border-[#DFBA57]"
              }`}
            />
            <button
              type="submit"
              className="h-10 rounded-r-lg border border-l-0 border-[#2D2345] bg-[#181227] px-3 text-xs font-medium text-[#EFECE6] hover:bg-[#231A38] whitespace-nowrap shrink-0 cursor-pointer"
            >
              Tune
            </button>
          </form>
        </div>

        {/* Audio & Display Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onTogglePlay}
            aria-label={isPlaying ? "Pause broadcast" : "Play broadcast"}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#2D2345] bg-[#181227] text-[#F5F3EE] transition-colors hover:bg-[#231A38] cursor-pointer"
          >
            {isPlaying ? (
              <Pause className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Play className="h-4 w-4" aria-hidden="true" />
            )}
          </button>

          <div className="flex h-10 items-center gap-2 rounded-lg border border-[#2D2345] bg-[#181227] px-3">
            <button
              type="button"
              onClick={onToggleMute}
              title="Mute (M)"
              aria-label={muted ? "Unmute" : "Mute"}
              className="text-[#EFECE6] hover:text-[#F3D98B] cursor-pointer"
            >
              {muted || volume === 0 ? (
                <VolumeX className="h-4 w-4 text-red-400" aria-hidden="true" />
              ) : (
                <Volume2 className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round((muted ? 0 : volume) * 100)}
              onChange={(e) => onVolumeChange(Number(e.target.value) / 100)}
              aria-label="Volume"
              className="w-20 accent-[#DFBA57] cursor-pointer"
            />
          </div>

          <button
            type="button"
            onClick={onToggleAspect43}
            title="Toggle 4:3 / 16:9 Aspect Ratio (A)"
            className={`flex h-10 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              aspect43
                ? "border-[#DFBA57]/60 bg-[#3B186B]/40 text-[#F3D98B]"
                : "border-[#2D2345] bg-[#181227] text-[#D7D1E2] hover:bg-[#231A38]"
            }`}
          >
            <Monitor className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="font-mono">{aspect43 ? "4:3" : "16:9"}</span>
          </button>

          <button
            type="button"
            onClick={onToggleScanlines}
            title="Toggle subtle CRT scanlines"
            className={`hidden md:flex h-10 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              scanlines
                ? "border-[#DFBA57]/60 bg-[#3B186B]/40 text-[#F3D98B]"
                : "border-[#2D2345] bg-[#181227] text-[#D7D1E2] hover:bg-[#231A38]"
            }`}
          >
            <Tv className="h-3.5 w-3.5" aria-hidden="true" />
            <span>CRT</span>
          </button>

          <button
            type="button"
            onClick={onToggleFavorite}
            aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
            className={`flex h-10 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              isFavorite
                ? "border-[#DFBA57]/60 bg-[#3B186B]/40 text-[#F3D98B]"
                : "border-[#2D2345] bg-[#181227] text-[#D7D1E2] hover:bg-[#231A38]"
            }`}
          >
            <Heart
              className={`h-3.5 w-3.5 ${isFavorite ? "fill-[#DFBA57] text-[#DFBA57]" : ""}`}
              aria-hidden="true"
            />
            <span className="hidden lg:inline">{isFavorite ? "Saved" : "Save"}</span>
          </button>

          <button
            type="button"
            onClick={onShowBanner}
            title="Show Channel Info (I)"
            aria-label="Show channel info banner"
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#2D2345] bg-[#181227] text-[#D7D1E2] transition-colors hover:bg-[#231A38] cursor-pointer"
          >
            <Info className="h-4 w-4" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={onOpenTvSetup}
            title="Android APK & TV Downloader Guide"
            aria-label="Android APK and TV Downloader Guide"
            className="flex h-10 items-center gap-1.5 rounded-lg border border-[#2D2345] bg-[#181227] px-3 text-xs font-semibold text-[#D7D1E2] transition-colors hover:bg-[#231A38] hover:text-[#F3D98B] whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Smartphone className="h-3.5 w-3.5 text-[#DFBA57]" aria-hidden="true" />
            <span className="hidden lg:inline">APK / TV</span>
          </button>

          <button
            type="button"
            onClick={onFullscreen}
            title="Fullscreen (F)"
            aria-label="Enter fullscreen"
            className="flex h-10 items-center gap-1.5 rounded-lg border border-[#2D2345] bg-[#181227] px-3 text-xs font-semibold text-[#EFECE6] transition-colors hover:bg-[#231A38] whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Maximize className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">Fullscreen</span>
          </button>
        </div>
      </div>

      {/* Program Details Bar */}
      {channel && nowInfo && (
        <div className="mt-4 flex flex-col gap-2 border-t border-[#261E38] pt-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#A79EB9]">
              <span className="font-mono font-semibold text-[#DFBA57] tabular-nums">
                Ch {channel.num}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-medium text-[#EFECE6]">{channel.name}</span>
              {channel.cat && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{channel.cat}</span>
                </>
              )}
              {nowInfo.durationSec > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">
                    {formatDuration(nowInfo.elapsedSec)} /{" "}
                    {formatDuration(nowInfo.durationSec)}
                  </span>
                </>
              )}
            </div>
            <h1 className="mt-1 truncate font-display text-lg font-bold text-[#F5F3EE] sm:text-xl">
              {nowInfo.currentTitle}
            </h1>
            {channel.blurb && (
              <p className="mt-0.5 text-xs text-[#A79EB9] line-clamp-1">
                {channel.blurb}
              </p>
            )}
          </div>

          {nowInfo.nextTitle && (
            <div className="shrink-0 sm:max-w-[260px] sm:text-right">
              <div className="text-[11px] font-medium text-[#A79EB9]">Up next</div>
              <div className="truncate text-xs font-medium text-[#EFECE6]">
                {nowInfo.nextTitle}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
