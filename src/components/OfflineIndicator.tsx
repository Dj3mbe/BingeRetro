import { WifiOff } from "lucide-react";
import { useOnlineStatus } from "../hooks/usePWAInstall.ts";

export function OfflineIndicator() {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-lg border border-[#DFBA57]/50 bg-[#110E1A] px-3.5 py-2 text-xs font-medium text-[#F3D98B] shadow-lg"
    >
      <WifiOff className="h-3.5 w-3.5 text-[#DFBA57]" aria-hidden="true" />
      <span>Offline — Cached channel guide loaded</span>
    </div>
  );
}
