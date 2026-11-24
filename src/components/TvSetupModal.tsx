import { useState } from "react";
import { Check, Copy, Tv, X } from "lucide-react";

interface TvSetupModalProps {
  open: boolean;
  onClose: () => void;
  onEnterCouchMode: () => void;
}

export function TvSetupModal({
  open,
  onClose,
  onEnterCouchMode,
}: TvSetupModalProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  if (!open) return null;

  const baseUrl =
    typeof window !== "undefined" ? window.location.origin : "";
  const tvUrl = `${baseUrl}/?mode=tv`;

  const copyText = (key: string, value: string) => {
    navigator.clipboard?.writeText(value).catch(() => {});
    setCopiedKey(key);
    window.setTimeout(() => setCopiedKey(null), 1800);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-xl border border-[#2D2345] bg-[#110E1A] p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-[#261E38] pb-4">
          <div className="flex items-center gap-3.5">
            <img
              src="/bingeretro-logo.png"
              alt="BingeRetro crown TV logo"
              referrerPolicy="no-referrer"
              className="h-12 w-12 shrink-0 rounded-xl border border-[#DFBA57]/40 bg-[#1B0B31] object-cover"
            />
            <div>
              <h2 className="font-display text-lg font-bold text-[#F5F3EE]">
                Android APK &amp; TV Downloader Guide
              </h2>
              <p className="text-xs text-[#A79EB9]">
                BingeRetro is PWA-ready for Android TV, Google TV, and Fire TV
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close TV and APK setup guide"
            className="rounded-lg p-1.5 text-[#A79EB9] hover:bg-[#1E1630] hover:text-white cursor-pointer"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-4 space-y-4 text-sm text-[#D7D1E2]">
          <div className="rounded-lg border border-[#2D2345] bg-[#09080D] p-3.5">
            <div className="text-xs font-semibold text-[#DFBA57]">
              Direct TV Mode Launch URL (for Downloader / TV APK)
            </div>
            <div className="mt-2 flex items-center justify-between gap-2">
              <code className="truncate font-mono text-xs text-[#F5F3EE]">
                {tvUrl}
              </code>
              <button
                type="button"
                onClick={() => copyText("tv", tvUrl)}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-[#35294D] bg-[#161122] px-2.5 py-1.5 text-xs font-medium text-[#EFECE6] hover:bg-[#221A36] cursor-pointer"
              >
                {copiedKey === "tv" ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="font-display text-sm font-bold text-[#F5F3EE]">
              Step 1 — Package APK with the BingeRetro Crown TV Icon
            </h3>
            <ol className="space-y-1.5 text-xs leading-relaxed text-[#A79EB9]">
              <li>
                1. Click <strong className="text-[#EFECE6]">Share / Publish</strong> in AI Studio so your app URL works without login.
              </li>
              <li>
                2. Open <strong className="text-[#EFECE6]">pwabuilder.com</strong>, paste your Shared App URL (set Start URL to <code className="text-[#F3D98B]">/?mode=tv</code> for full-screen TV mode), and click <strong className="text-[#EFECE6]">Package for Stores → Android → Download</strong>.
              </li>
              <li>
                3. Your PWA manifest automatically supplies the gold-and-purple crowned TV icon (<code className="text-[#EFECE6]">512×512</code> &amp; maskable) for your TV home screen.
              </li>
            </ol>
          </div>

          <div className="space-y-2">
            <h3 className="font-display text-sm font-bold text-[#F5F3EE]">
              Step 2 — Install with Downloader on Your TV
            </h3>
            <ol className="space-y-1.5 text-xs leading-relaxed text-[#A79EB9]">
              <li>
                1. Upload the <code className="text-[#EFECE6]">.apk</code> to a direct-download link (e.g. GitHub Releases or Dropbox with <code className="text-[#EFECE6]">?dl=1</code>).
              </li>
              <li>
                2. Go to <strong className="text-[#EFECE6]">go.aftvnews.com</strong> and paste that <code className="text-[#EFECE6]">.apk</code> link (or paste your <code className="text-[#F3D98B]">/?mode=tv</code> URL to launch directly in Downloader&apos;s browser) to get a short <strong className="text-[#EFECE6]">6-digit Downloader code</strong>.
              </li>
              <li>
                3. On your TV, open <strong className="text-[#EFECE6]">Downloader</strong>, enter the 6-digit code, and press <strong className="text-[#EFECE6]">Go</strong> to install BingeRetro.
              </li>
            </ol>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-end gap-2.5 border-t border-[#261E38] pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[#35294D] bg-[#161122] px-4 py-2 text-xs font-semibold text-[#EFECE6] hover:bg-[#221A36] cursor-pointer"
          >
            Close
          </button>
          <button
            type="button"
            onClick={() => {
              onClose();
              onEnterCouchMode();
            }}
            className="kings-gold-btn inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold cursor-pointer"
          >
            <Tv className="h-4 w-4" aria-hidden="true" />
            <span>Launch TV Mode Now</span>
          </button>
        </div>
      </div>
    </div>
  );
}
