import { Shuffle, Tv } from "lucide-react";
import type { ViewMode } from "../types/tv.ts";
import { PWAInstallButton } from "./PWAInstallButton.tsx";

interface TopBarProps {
  activeView: ViewMode;
  onSelectView: (view: ViewMode) => void;
  onShuffleChannel: () => void;
  onEnterCouchMode: () => void;
  favoritesCount: number;
}

const NAV_ITEMS: { id: ViewMode; label: string }[] = [
  { id: "live", label: "Watch Live" },
  { id: "guide", label: "Channel Guide" },
  { id: "categories", label: "Categories" },
  { id: "favorites", label: "Favorites" },
];

export function TopBar({
  activeView,
  onSelectView,
  onShuffleChannel,
  onEnterCouchMode,
  favoritesCount,
}: TopBarProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-[#251D36] bg-[#09080D]/95 backdrop-blur-sm">
      <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between gap-8 px-4 sm:px-6">
        <button
          type="button"
          onClick={() => onSelectView("live")}
          className="inline-flex items-center gap-3 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DFBA57] rounded-md"
        >
          <img
            src="/bingeretro-logo.png"
            alt="BingeRetro crown TV emblem"
            referrerPolicy="no-referrer"
            className="h-10 w-10 rounded-lg border border-[#DFBA57]/35 bg-[#1B0B31] object-cover shadow-sm"
          />
          <span className="font-display text-2xl font-bold tracking-tight text-[#F6F4EF]">
            BingeRetro
          </span>
        </button>

        <nav aria-label="Primary navigation" className="flex items-center gap-6 overflow-x-auto">
          {NAV_ITEMS.map((item) => {
            const isActive = activeView === item.id;
            const label =
              item.id === "favorites" && favoritesCount > 0
                ? `${item.label} (${favoritesCount})`
                : item.label;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectView(item.id)}
                className={`relative py-2 text-sm font-medium whitespace-nowrap shrink-0 transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DFBA57] rounded-sm ${
                  isActive
                    ? "text-[#F6F4EF]"
                    : "text-[#A79EB9] hover:text-[#F6F4EF]"
                }`}
              >
                {label}
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 bottom-0 h-0.5 bg-[#DFBA57]"
                  />
                )}
              </button>
            );
          })}
        </nav>

        <div className="flex items-center gap-2.5 shrink-0">
          <PWAInstallButton />
          <button
            type="button"
            onClick={onEnterCouchMode}
            title="Couch Mode (C) — 10-foot TV & remote view"
            className="inline-flex items-center gap-1.5 rounded-full border border-[#35294D] bg-[#161122] px-3.5 py-2 text-sm font-medium text-[#EFECE6] transition-colors duration-150 hover:border-[#DFBA57]/60 hover:bg-[#211836] hover:text-[#F3D98B] whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DFBA57]"
          >
            <Tv className="h-4 w-4 text-[#DFBA57]" aria-hidden="true" />
            <span className="hidden md:inline">TV Mode</span>
          </button>
          <button
            type="button"
            onClick={onShuffleChannel}
            className="kings-gold-btn inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold shadow-sm transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F3D98B]"
          >
            <Shuffle className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Shuffle</span>
          </button>
        </div>
      </div>
    </header>
  );
}
