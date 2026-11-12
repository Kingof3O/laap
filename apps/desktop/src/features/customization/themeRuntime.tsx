import "../../styles/customization.css";
import { useEffect, useState } from "react";
import { themes, type ThemeConfig } from "./api";
import { invokeTauri } from "../../lib/api";
const tokens = (t: ThemeConfig): Record<string, string> => ({
  "--bg-canvas": t.canvas,
  "--velvet-canvas": t.canvas,
  "--bg-surface": t.panel,
  "--surface-2": t.panel.slice(0, 7) + Math.round(t.opacity * 255).toString(16).padStart(2, "0"),
  "--bg-surface-elevated": t.surface,
  "--bg-card": t.surface.slice(0, 7) + Math.round(t.opacity * 255).toString(16).padStart(2, "0"),
  "--bg-card-hover": t.panel,
  "--bg-card-selected": t.surface,
  "--bg-surface-hover": t.surface,
  "--bg-surface-active": t.surface,
  "--accent-primary": t.accent,
  "--velvet-accent": t.accent,
  "--accent-hover": t.accentHover,
  "--accent-light": t.accentHover,
  "--accent-secondary": t.accent,
  "--accent-border": t.accent.slice(0, 7) + "66",
  "--accent-surface": t.accent.slice(0, 7) + "14",
  "--accent-gradient": `linear-gradient(135deg,${t.accentHover},${t.accent})`,
  "--text-primary": t.textPrimary,
  "--velvet-text": t.textPrimary,
  "--text-secondary": t.textSecondary,
  "--text-muted": t.textSecondary,
  "--border-default": t.border,
  "--border-card": t.border,
  "--studio-transition": ({ fast: "90ms", slow: "240ms", normal: "150ms", off: "0ms" } as Record<string, string>)[t.animationSpeed] ?? "150ms",
  "--border-subtle": t.border,
  "--color-accent-400": t.accent,
  "--font-body": `${t.fontFamily}, 'Segoe UI', sans-serif`,
});
export function applyThemeToDom(t: ThemeConfig) {
  const root = document.documentElement;
  for (const [k, v] of Object.entries(tokens(t))) root.style.setProperty(k, v);
  root.dataset.studioTheme = t.id;
  root.classList.toggle(
    "studio-reduced-motion",
    t.reducedMotion || t.performanceMode || t.animationSpeed === "off",
  );
}
export function notifyThemeChanged() {
  window.dispatchEvent(new Event("laap:studio-theme"));
}
export function useStudioTheme() {
  const [theme, setTheme] = useState<ThemeConfig | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () =>
      void themes
        .getActive()
        .then((t) => {
          if (alive) {
            applyThemeToDom(t);
            setTheme(t);
          }
        })
        .catch(() => {});
    load();
    window.addEventListener("laap:studio-theme", load);
    return () => {
      alive = false;
      window.removeEventListener("laap:studio-theme", load);
    };
  }, []);
  return theme;
}
export function ThemeBackground({ theme }: { theme: ThemeConfig | null }) {
  const [source, setSource] = useState("");
  const [failed, setFailed] = useState(false);
  const reduced = useReducedMotion();
  useEffect(() => {
    let alive = true;
    setSource("");
    setFailed(false);
    const animated = ['video', 'gif'].includes(theme?.backgroundMediaType ?? '')
    if (animated && (reduced || theme?.reducedMotion || theme?.performanceMode)) return
    if (theme?.backgroundMediaPath)
      void invokeTauri<string>("theme_media_read", {
        path: theme.backgroundMediaPath,
      })
        .then((s) => {
          if (alive) setSource(s);
        })
        .catch(() => {
          if (alive) setFailed(true);
        });
    return () => {
      alive = false;
    };
  }, [theme?.backgroundMediaPath, theme?.backgroundMediaType, theme?.reducedMotion, theme?.performanceMode, reduced]);
  if (failed) return <p role="status" className="studio-theme-media-notice">Theme background could not be loaded. Open Themes to replace or remove the media.</p>;
  if (!source || !theme) return null;
  const animated = ["video", "gif"].includes(theme.backgroundMediaType ?? "");
  if (animated && (reduced || theme.reducedMotion || theme.performanceMode))
    return null;
  return (
    <div className="studio-theme-background" aria-hidden="true">
      {theme.backgroundMediaType === "video" ? (
        <video
          src={source}
          autoPlay
          muted
          loop
          playsInline
          onError={() => setFailed(true)}
        />
      ) : (
        <img alt="" src={source} onError={() => setFailed(true)} />
      )}
    </div>
  );
}
function useReducedMotion() {
  const [value, setValue] = useState(
    () => matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.classList.contains("reduced-motion"),
  );
  useEffect(() => {
    const m = matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => setValue(m.matches || document.documentElement.classList.contains("reduced-motion"));
    m.addEventListener("change", change);
    window.addEventListener("laap:motion-change", change);
    return () => { m.removeEventListener("change", change); window.removeEventListener("laap:motion-change", change); };
  }, []);
  return value;
}
