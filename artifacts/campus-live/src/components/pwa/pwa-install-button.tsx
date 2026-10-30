"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

type DeviceMode = "ios" | "android" | "mobile" | "other" | "installed";

export function PwaInstallButton() {
  const [deviceMode, setDeviceMode] = useState<DeviceMode | null>(null);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [showInstructions, setShowInstructions] = useState(false);

  useEffect(() => {
    const userAgent = navigator.userAgent;
    const isIOS =
      /iPad|iPhone|iPod/i.test(userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const isAndroid = /Android/i.test(userAgent);
    const isMobileViewport = window.matchMedia("(max-width: 768px)").matches;
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      Boolean((navigator as Navigator & { standalone?: boolean }).standalone);

    setDeviceMode(
      isStandalone
        ? "installed"
        : isIOS
          ? "ios"
          : isAndroid
            ? "android"
            : isMobileViewport
              ? "mobile"
              : "other",
    );

    const handleInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const handleInstalled = () => {
      setInstallPrompt(null);
      setDeviceMode("installed");
      setShowInstructions(false);
    };

    window.addEventListener("beforeinstallprompt", handleInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  if (!deviceMode || deviceMode === "installed") return null;
  if (deviceMode === "other" && !installPrompt) return null;

  const install = async () => {
    if (!installPrompt) {
      setShowInstructions((visible) => !visible);
      return;
    }

    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    setInstallPrompt(null);
    if (choice.outcome === "accepted") setDeviceMode("installed");
  };

  const label = installPrompt
    ? "Install app"
    : deviceMode === "ios"
      ? "Add to Home Screen"
      : "How to install";

  return (
    <div className="mt-5">
      <button
        type="button"
        className="btn btn-muted w-full justify-center"
        onClick={install}
        aria-expanded={showInstructions}
        aria-controls="pwa-install-instructions"
      >
        <Download size={16} aria-hidden="true" />
        {label}
      </button>
      {showInstructions && (
        <div
          id="pwa-install-instructions"
          className="surface mt-3 space-y-2 p-4 text-sm leading-6 text-[hsl(var(--muted-foreground))]"
          aria-live="polite"
        >
          {deviceMode === "ios" ? (
            <p className="m-0">
              In Safari, tap <strong>Share</strong>, then choose <strong>Add to Home Screen</strong>.
              If this page opened inside another app, open it in Safari first.
            </p>
          ) : (
            <p className="m-0">
              Open your browser menu and choose <strong>Install app</strong> or{" "}
              <strong>Add to Home screen</strong>.
            </p>
          )}
          <p className="m-0 text-xs">You’ll need an internet connection to use school features.</p>
        </div>
      )}
    </div>
  );
}
