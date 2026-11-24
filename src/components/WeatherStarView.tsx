import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, CloudSun } from "lucide-react";
import type { WeatherData, WeatherExtraData } from "../types/tv.ts";
import { formatClock } from "../utils/scheduleEngine.ts";

interface WeatherStarViewProps {
  nowMs: number;
}

export function WeatherStarView({ nowMs }: WeatherStarViewProps) {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [extra, setExtra] = useState<WeatherExtraData | null>(null);
  const [pageIdx, setPageIdx] = useState(0);
  const [radarFailed, setRadarFailed] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const [wRes, eRes] = await Promise.all([
          fetch("/api/btv/weather").then((r) => (r.ok ? r.json() : null)),
          fetch("/api/btv/weather-extra")
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null),
        ]);
        if (!active) return;
        if (wRes) setWeather(wRes);
        if (eRes) setExtra(eRes);
      } catch {
        // Keep existing weather state if refresh fails
      }
    }
    load();
    const refreshId = window.setInterval(load, 5 * 60_000);
    return () => {
      active = false;
      window.clearInterval(refreshId);
    };
  }, []);

  const pages = useMemo(() => {
    if (!weather) {
      return [
        {
          id: "loading",
          title: "Local Forecast",
          render: () => (
            <div className="flex h-full flex-col justify-center gap-2 text-[#D8E6FF]">
              <p className="text-xl font-semibold">Connecting to WeatherStar feed...</p>
              <p className="text-sm text-[#9CB7E8]">
                Retrieving regional conditions, forecast periods, and radar imagery.
              </p>
            </div>
          ),
        },
      ];
    }

    const list: { id: string; title: string; render: () => React.ReactNode }[] = [
      {
        id: "current",
        title: "Current Conditions",
        render: () => (
          <div className="flex h-full flex-col justify-between gap-4">
            <div className="flex items-baseline gap-5">
              <span className="font-mono text-6xl font-bold tracking-tight text-amber-300 tabular-nums sm:text-7xl">
                {weather.now.tempF}°
              </span>
              <div>
                <p className="text-2xl font-semibold text-white sm:text-3xl">
                  {weather.now.text}
                </p>
                <p className="mt-1 text-sm text-[#BFD6FF]">
                  {weather.city}, {weather.state}
                  {weather.now.station ? ` · ${weather.now.station}` : ""}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 border-t border-white/15 pt-4 text-sm sm:grid-cols-4">
              <div>
                <div className="text-xs text-[#93B4EB]">Wind</div>
                <div className="font-mono text-base font-semibold text-white tabular-nums">
                  {weather.now.windDir || "CALM"} {weather.now.windMph} mph
                </div>
              </div>
              <div>
                <div className="text-xs text-[#93B4EB]">Humidity</div>
                <div className="font-mono text-base font-semibold text-white tabular-nums">
                  {weather.now.humidity ?? "--"}%
                </div>
              </div>
              <div>
                <div className="text-xs text-[#93B4EB]">Pressure</div>
                <div className="font-mono text-base font-semibold text-white tabular-nums">
                  {weather.now.pressureIn ?? "--"} in
                </div>
              </div>
              <div>
                <div className="text-xs text-[#93B4EB]">Visibility</div>
                <div className="font-mono text-base font-semibold text-white tabular-nums">
                  {weather.now.visibilityMi ?? "--"} mi
                </div>
              </div>
            </div>
          </div>
        ),
      },
      {
        id: "local",
        title: "Local Forecast",
        render: () => (
          <div className="flex flex-col gap-3">
            {weather.periods.slice(0, 3).map((period) => (
              <div
                key={period.name}
                className="border-b border-white/10 pb-2.5 last:border-b-0 last:pb-0"
              >
                <div className="text-sm font-bold text-amber-300">
                  {period.name}
                </div>
                <p className="mt-0.5 text-sm leading-relaxed text-[#E2ECFF] line-clamp-2">
                  {period.detail}
                </p>
              </div>
            ))}
          </div>
        ),
      },
      {
        id: "extended",
        title: "Extended Forecast",
        render: () => (
          <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
            {weather.periods.slice(0, 8).map((period) => (
              <div
                key={period.name}
                className="flex items-center justify-between border-b border-white/10 py-1.5 text-sm"
              >
                <span className="font-semibold text-amber-300 truncate pr-2">
                  {period.name}
                </span>
                <span className="text-[#D4E3FF] truncate pr-3 flex-1 text-right">
                  {period.short}
                </span>
                <span className="font-mono font-bold text-white tabular-nums">
                  {period.tempF}°
                </span>
              </div>
            ))}
          </div>
        ),
      },
    ];

    if (extra?.cities && extra.cities.length > 0) {
      list.push({
        id: "regional",
        title: "Around the Region",
        render: () => (
          <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
            {extra.cities!.slice(0, 8).map((city) => (
              <div
                key={city.name}
                className="flex items-center justify-between border-b border-white/10 py-1.5 text-sm"
              >
                <span className="font-semibold text-white truncate pr-2">
                  {city.name}
                </span>
                <span className="text-[#C7DAFF] truncate pr-2 flex-1 text-right">
                  {city.text}
                </span>
                <span className="font-mono text-amber-300 tabular-nums shrink-0">
                  {city.tempF}° ({city.hi}/{city.lo})
                </span>
              </div>
            ))}
          </div>
        ),
      });
    }

    if (extra?.radar?.loop) {
      list.push({
        id: "radar",
        title: "Regional Radar",
        render: () => (
          <div className="flex h-full items-center justify-center">
            {radarFailed ? (
              <div className="flex flex-col items-center gap-2 text-center text-[#BFD6FF]">
                <CloudSun className="h-10 w-10 text-amber-300" aria-hidden="true" />
                <p className="text-sm font-medium">
                  Radar loop unavailable ({extra.radar?.station || "Regional"})
                </p>
              </div>
            ) : (
              <img
                src={extra.radar!.loop}
                alt={`NWS regional weather radar loop for ${extra.radar?.station || "station"}`}
                referrerPolicy="no-referrer"
                onError={() => setRadarFailed(true)}
                className="max-h-full max-w-full rounded border border-white/20 object-contain"
              />
            )}
          </div>
        ),
      });
    }

    if (extra) {
      list.push({
        id: "alerts",
        title: extra.alerts?.length
          ? "Weather Alerts"
          : extra.briefing?.title || "Forecast Discussion",
        render: () => {
          if (extra.alerts && extra.alerts.length > 0) {
            return (
              <div className="flex flex-col gap-3">
                {extra.alerts.slice(0, 2).map((alert, idx) => (
                  <div key={idx} className="border-b border-white/15 pb-2.5 last:border-b-0">
                    <div className="text-sm font-bold text-red-300">
                      {alert.event || "Weather Advisory"}
                    </div>
                    <p className="mt-1 text-sm text-[#EAF1FF]">{alert.headline}</p>
                  </div>
                ))}
              </div>
            );
          }
          return (
            <div className="text-sm leading-relaxed text-[#E2ECFF] line-clamp-6">
              {extra.briefing?.text || "No active weather alerts in the forecast area."}
            </div>
          );
        },
      });
    }

    return list;
  }, [weather, extra, radarFailed]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setPageIdx((p) => (p + 1) % Math.max(1, pages.length));
    }, 11_000);
    return () => window.clearInterval(timer);
  }, [pages.length]);

  const currentPage = pages[pageIdx % pages.length];

  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-gradient-to-b from-[#0E1E54] via-[#132971] to-[#0A143A] p-4 sm:p-6 select-none">
      <div className="flex items-center justify-between border-b-2 border-amber-400 pb-2.5">
        <div className="flex items-center gap-3">
          <CloudSun className="h-5 w-5 text-amber-300" aria-hidden="true" />
          <h2 className="font-display text-lg font-bold tracking-tight text-amber-300 sm:text-2xl">
            {currentPage.title}
          </h2>
        </div>
        <div className="font-mono text-sm font-semibold text-white tabular-nums sm:text-base">
          {formatClock(nowMs)}
        </div>
      </div>

      <div className="my-4 flex-1 overflow-hidden">{currentPage.render()}</div>

      <div className="flex items-center justify-between border-t border-white/20 pt-2.5 text-xs text-[#B6CCF7]">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPageIdx((p) => (p - 1 + pages.length) % pages.length)}
            aria-label="Previous weather page"
            className="rounded border border-white/20 p-1 text-white hover:bg-white/10 cursor-pointer"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <span className="font-mono tabular-nums">
            Page {(pageIdx % pages.length) + 1} of {pages.length}
          </span>
          <button
            type="button"
            onClick={() => setPageIdx((p) => (p + 1) % pages.length)}
            aria-label="Next weather page"
            className="rounded border border-white/20 p-1 text-white hover:bg-white/10 cursor-pointer"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
        <span className="font-medium tracking-wide text-amber-300">
          WeatherStar 4000 · Smooth Jazz Audio
        </span>
      </div>
    </div>
  );
}
