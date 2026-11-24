import { useState } from "react";
import { Download, X } from "lucide-react";
import { usePWAInstall } from "../hooks/usePWAInstall.ts";

export function PWAInstallButton() {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) return null;

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={() => void install()}
        className="inline-flex items-center gap-1.5 rounded-full border border-[#35294D] bg-[#161122] px-3.5 py-2 text-sm font-medium text-[#EFECE6] transition-colors hover:border-[#DFBA57]/60 hover:bg-[#211836] whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DFBA57]"
      >
        <Download className="h-4 w-4 text-[#DFBA57]" aria-hidden="true" />
        <span className="hidden md:inline">Install App</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className="inline-flex items-center gap-1.5 rounded-full border border-[#35294D] bg-[#161122] px-3.5 py-2 text-xs font-medium text-[#EFECE6] transition-colors hover:border-[#DFBA57]/60 hover:bg-[#211836] whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Download className="h-3.5 w-3.5 text-[#DFBA57]" aria-hidden="true" />
          <span>Install</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs">
            <div className="w-full max-w-sm rounded-xl border border-[#2B2140] bg-[#110E1A] p-6">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-lg font-bold text-[#F5F3EE]">
                  Install on iPhone / iPad
                </h3>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  aria-label="Close install instructions"
                  className="rounded-md p-1 text-[#A79EB9] hover:text-white cursor-pointer"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
              <ol className="mt-3 space-y-2 text-sm text-[#D7D1E2]">
                <li>1. Tap the Share button in Safari&apos;s toolbar.</li>
                <li>2. Scroll down and tap Add to Home Screen.</li>
                <li>3. Launch BingeRetro fullscreen from your Home Screen.</li>
              </ol>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="kings-gold-btn mt-5 w-full rounded-lg py-2.5 text-sm font-semibold cursor-pointer"
              >
                Got it
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
}
