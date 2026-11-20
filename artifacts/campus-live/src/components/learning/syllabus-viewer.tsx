"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

/**
 * In-app viewer for syllabus materials. Everything is referenced by link
 * only — nothing is stored. Supports YouTube and Vimeo embeds, PDFs via the
 * Google Docs viewer, and falls back to opening the link in a new tab.
 */

export type ViewerTarget = {
  title: string;
  url: string;
  kind: "document" | "video" | "link";
};

function youtubeId(url: URL): string | null {
  if (url.hostname.includes("youtu.be")) return url.pathname.slice(1) || null;
  if (url.pathname.startsWith("/embed/")) return url.pathname.split("/embed/")[1] || null;
  if (url.pathname.startsWith("/shorts/")) return url.pathname.split("/shorts/")[1] || null;
  if (url.searchParams.get("v")) return url.searchParams.get("v");
  const list = url.searchParams.get("list");
  return list ? `list?list=${list}` : null;
}

function embedUrl(target: ViewerTarget): string | null {
  let url: URL;
  try {
    url = new URL(target.url);
  } catch {
    return null;
  }
  if (url.hostname.includes("youtube.com") || url.hostname.includes("youtu.be")) {
    const id = youtubeId(url);
    if (!id) return null;
    if (id.startsWith("list")) return `https://www.youtube.com/embed/${id}`;
    return `https://www.youtube.com/embed/${id}`;
  }
  if (url.hostname.includes("vimeo.com")) {
    const id = url.pathname.split("/").filter(Boolean)[0];
    if (id && /^\d+$/.test(id)) return `https://player.vimeo.com/video/${id}`;
  }
  if (/\.(pdf|doc|docx|ppt|pptx|xls|xlsx)(\?.*)?$/i.test(url.pathname)) {
    return `https://docs.google.com/viewer?url=${encodeURIComponent(target.url)}&embedded=true`;
  }
  if (target.kind === "document" || target.kind === "link") {
    // Try the Google Docs viewer for any likely-document URL; it shows a
    // graceful message when the file type isn't previewable.
    return `https://docs.google.com/viewer?url=${encodeURIComponent(target.url)}&embedded=true`;
  }
  return null;
}

export function SyllabusMaterialViewer({ target, onClose }: { target: ViewerTarget; onClose: () => void }) {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handler);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const embed = embedUrl(target);
  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-black/70 p-3 md:p-8" role="dialog" aria-modal="true" aria-label={`Viewing ${target.title}`} onClick={onClose}>
      <div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col overflow-hidden rounded-2xl bg-[hsl(var(--background))] shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 border-b border-[hsl(var(--border))] px-4 py-3">
          <div className="min-w-0">
            <p className="m-0 truncate text-sm font-bold">{target.title}</p>
            <p className="m-0 truncate text-[11px] text-[hsl(var(--muted-foreground))]">{target.url}</p>
          </div>
          <div className="flex items-center gap-2">
            <a href={target.url} target="_blank" rel="noopener noreferrer" className="btn btn-muted min-h-8 px-3 text-xs">Open source</a>
            <button type="button" className="btn btn-muted min-h-8 px-3" aria-label="Close viewer" onClick={onClose}><X size={16} /></button>
          </div>
        </div>
        {embed
          ? <iframe src={embed} title={target.title} className="h-full w-full flex-1 bg-white" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
          : <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center text-sm text-[hsl(var(--muted-foreground))]">
              This link cannot be previewed inside the app.
              <a href={target.url} target="_blank" rel="noopener noreferrer" className="btn btn-primary min-h-9 px-4 text-xs">Open in new tab</a>
            </div>}
      </div>
    </div>
  );
}
