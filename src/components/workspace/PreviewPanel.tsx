/**
 * Live preview panel — renders the connected project's running app in an
 * iframe, with a configurable URL and refresh control.
 *
 * In a real deployment the preview URL would point to the project's dev
 * server. Here it shows the configured URL in an iframe with manual refresh,
 * device width toggle, and open-in-new-tab. The URL persists to localStorage.
 */
import { useState, useCallback, useEffect, useRef } from "react";
import {
  RefreshCw,
  ExternalLink,
  Monitor,
  Smartphone,
  Tablet,
  Loader2,
  Globe,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const PREVIEW_KEY = "aidevteam.preview.v1";

type DeviceWidth = "full" | "desktop" | "tablet" | "mobile";

const DEVICE_WIDTHS: Record<DeviceWidth, string | undefined> = {
  full: undefined,
  desktop: "100%",
  tablet: "768px",
  mobile: "390px",
};

export function PreviewPanel() {
  const [url, setUrl] = useState("http://localhost:3000");
  const [inputUrl, setInputUrl] = useState("http://localhost:3000");
  const [loading, setLoading] = useState(false);
  const [device, setDevice] = useState<DeviceWidth>("full");
  const [reloadKey, setReloadKey] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(PREVIEW_KEY);
      if (saved) {
        setUrl(saved);
        setInputUrl(saved);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const navigate = useCallback(() => {
    const trimmed = inputUrl.trim();
    if (!trimmed) return;
    setUrl(trimmed);
    setLoading(true);
    try {
      localStorage.setItem(PREVIEW_KEY, trimmed);
    } catch {
      /* ignore */
    }
  }, [inputUrl]);

  const reload = useCallback(() => {
    setLoading(true);
    setReloadKey((k) => k + 1);
  }, []);

  const openExternal = useCallback(() => {
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  }, [url]);

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b border-border bg-secondary/30 px-2 py-1.5">
        <Globe className="size-3.5 shrink-0 text-muted-foreground" />
        <Input
          value={inputUrl}
          onChange={(e) => setInputUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && navigate()}
          placeholder="Preview URL..."
          className="h-7 flex-1 font-mono text-[11px]"
          dir="ltr"
        />
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 shrink-0 p-0"
          onClick={navigate}
          title="Go"
        >
          <RefreshCw className="size-3.5" />
        </Button>

        <div className="h-4 w-px bg-border" />

        {/* Device toggles */}
        <div className="flex items-center gap-0.5">
          <DeviceButton active={device === "full"} onClick={() => setDevice("full")} title="Full width">
            <Monitor className="size-3.5" />
          </DeviceButton>
          <DeviceButton active={device === "tablet"} onClick={() => setDevice("tablet")} title="Tablet">
            <Tablet className="size-3.5" />
          </DeviceButton>
          <DeviceButton active={device === "mobile"} onClick={() => setDevice("mobile")} title="Mobile">
            <Smartphone className="size-3.5" />
          </DeviceButton>
        </div>

        <div className="h-4 w-px bg-border" />

        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 shrink-0 p-0"
          onClick={reload}
          title="Reload"
        >
          {loading ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 shrink-0 p-0"
          onClick={openExternal}
          title="Open in new tab"
        >
          <ExternalLink className="size-3.5" />
        </Button>
      </div>

      {/* Iframe container */}
      <div className="flex flex-1 items-center justify-center overflow-hidden p-2">
        <div
          className="h-full transition-all duration-200"
          style={{
            width: DEVICE_WIDTHS[device] ?? "100%",
            maxWidth: "100%",
          }}
        >
          <iframe
            ref={iframeRef}
            key={reloadKey}
            src={url}
            onLoad={() => setLoading(false)}
            className="h-full w-full rounded-md border border-border bg-white"
            title="Live Preview"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          />
        </div>
      </div>
    </div>
  );
}

function DeviceButton({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        "rounded p-1 transition-colors",
        active
          ? "bg-primary/15 text-primary"
          : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
