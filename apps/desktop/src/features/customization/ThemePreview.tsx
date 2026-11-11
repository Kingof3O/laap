import { useEffect, useState, type FormEvent } from "react";
import { errorMessage, themes, type ThemeConfig } from "./api";
import { notifyThemeChanged } from "./themeRuntime";
import { readFileBase64 } from "./packageFiles";
export function ThemePreview() {
  const [list, setList] = useState<ThemeConfig[]>([]);
  const [draft, setDraft] = useState<ThemeConfig | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<ThemeConfig[]>([]);
  const [future, setFuture] = useState<ThemeConfig[]>([]);
  async function load() {
    const [all, current] = await Promise.all([
      themes.list(),
      themes.getActive(),
    ]);
    setList(all);
    setDraft(current);
  }
  useEffect(() => {
    void load().catch((e) => setError(errorMessage(e)));
  }, []);
  function edit(value: Partial<ThemeConfig>) {
    if (!draft) return;
    setHistory((h) => [...h, draft].slice(-30));
    setFuture([]);
    setDraft({ ...draft, ...value });
  }
  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!draft) return;
    await run(async () => {
      const saved = await themes.saveCustom({
        ...draft,
        id: draft.isBuiltin ? "" : draft.id,
        isBuiltin: false,
      });
      await themes.setActive(saved.id);
      notifyThemeChanged();
      await load();
      setStatus("Theme saved and applied to LAAP. It will restore at startup.");
    });
  }
  const fields = [
    "canvas",
    "panel",
    "surface",
    "accent",
    "accentHover",
    "textPrimary",
    "textSecondary",
    "border",
  ] as const;
  return (
    <>
      <div className="customization-heading">
        <div>
          <h2>LAAP theme workshop</h2>
          <p>
            Local app appearance. League-client appearance requires a separately
            approved adapter.
          </p>
        </div>
        <button
          className="btn-secondary"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              await themes.resetDefault();
              notifyThemeChanged();
              await load();
              setStatus("Restored Velvet Amethyst.");
            })
          }
        >
          Reset to Velvet Amethyst
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      {status && <p role="status">{status}</p>}
      <div className="customization-grid">
        {list.map((t) => (
          <button
            key={t.id}
            className="customization-card"
            disabled={busy}
            aria-pressed={draft?.id === t.id}
            style={{
              background: t.panel,
              color: t.textPrimary,
              borderColor: t.accent,
            }}
            onClick={() =>
              void run(async () => {
                await themes.setActive(t.id);
                notifyThemeChanged();
                setDraft(t);
                setHistory([]);
                setFuture([]);
                setStatus("Applied " + t.name);
              })
            }
          >
            {t.name}
            {t.isBuiltin ? " · Included" : ""}
          </button>
        ))}
      </div>
      {draft && (
        <div className="customization-detail">
          <form className="customization-editor" onSubmit={(e) => void save(e)}>
            <label>
              Name
              <input
                required
                maxLength={80}
                value={draft.name}
                onChange={(e) => edit({ name: e.target.value })}
              />
            </label>
            <div className="customization-filters">
              {fields.map((k) => (
                <label key={k}>
                  {k}
                  <input
                    type="color"
                    value={draft[k].slice(0, 7)}
                    onChange={(e) => edit({ [k]: e.target.value })}
                  />
                </label>
              ))}
            </div>
            <label>
              Bundled font
              <select
                value={draft.fontFamily}
                onChange={(e) => edit({ fontFamily: e.target.value })}
              >
                <option>Manrope</option>
                <option>Sora</option>
                <option>Segoe UI</option>
              </select>
            </label>
            <label className="customization-check">
              <input
                type="checkbox"
                checked={draft.reducedMotion}
                onChange={(e) => edit({ reducedMotion: e.target.checked })}
              />
              Reduce motion (OS preference is always respected)
            </label>
            <label className="customization-check">
              <input
                type="checkbox"
                checked={draft.performanceMode}
                onChange={(e) => edit({ performanceMode: e.target.checked })}
              />
              Disable animated media and transitions
            </label>
            <label>
              Original background media · up to 32 MiB
              <input
                type="file"
                accept=".png,.jpg,.jpeg,.webp,.gif,.mp4,.webm"
                disabled={busy}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file)
                    void run(async () => {
                      if (file.size > 32 * 1024 * 1024)
                        throw Error("Media exceeds 32 MiB");
                      const path = await themes.saveMedia(
                        await readFileBase64(file),
                        file.name,
                      );
                      edit({
                        backgroundMediaPath: path,
                        backgroundMediaType: file.type.startsWith("video/")
                          ? "video"
                          : file.type === "image/gif"
                            ? "gif"
                            : "image",
                      });
                      setStatus(
                        "Media validated and stored locally. Save theme to apply.",
                      );
                    });
                }}
              />
            </label>
            <button
              type="button"
              className="btn-secondary"
              onClick={() =>
                edit({ backgroundMediaPath: null, backgroundMediaType: null })
              }
            >
              Remove background media
            </button>
            <div className="customization-actions">
              <button
                type="button"
                disabled={!history.length}
                onClick={() => {
                  const previous = history.at(-1)!;
                  setFuture((f) => [draft, ...f]);
                  setHistory((h) => h.slice(0, -1));
                  setDraft(previous);
                }}
              >
                Undo
              </button>
              <button
                type="button"
                disabled={!future.length}
                onClick={() => {
                  setHistory((h) => [...h, draft]);
                  setDraft(future[0]);
                  setFuture((f) => f.slice(1));
                }}
              >
                Redo
              </button>
              <button className="btn-primary" disabled={busy}>
                Save and apply
              </button>
            </div>
            <div className="customization-actions">
              <button
                type="button"
                onClick={() => {
                  const portable = {
                    ...draft,
                    id: "",
                    isBuiltin: false,
                    backgroundMediaPath: null,
                    backgroundMediaType: null,
                  };
                  const url = URL.createObjectURL(
                    new Blob(
                      [
                        JSON.stringify(
                          { schemaVersion: 1, theme: portable },
                          null,
                          2,
                        ),
                      ],
                      { type: "application/json" },
                    ),
                  );
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "laap-theme.json";
                  a.click();
                  setTimeout(() => URL.revokeObjectURL(url), 1000);
                }}
              >
                Export palette
              </button>
              <label>
                Import palette
                <input
                  type="file"
                  accept=".json"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f)
                      void run(async () => {
                        if (f.size > 16384)
                          throw Error("Theme exceeds metadata limit");
                        const v = JSON.parse(await f.text());
                        if (
                          v.schemaVersion !== 1 ||
                          v.theme.backgroundMediaPath
                        )
                          throw Error("Unsupported portable theme");
                        const saved = await themes.saveCustom({
                          ...v.theme,
                          id: "",
                          isBuiltin: false,
                          backgroundMediaPath: null,
                          backgroundMediaType: null,
                        });
                        await load();
                        setDraft(saved);
                        setStatus(
                          "Palette imported. Save and apply to activate.",
                        );
                      });
                  }}
                />
              </label>
            </div>
          </form>
          <section
            aria-label="Theme preview"
            className="theme-preview"
            style={{
              background: draft.canvas,
              color: draft.textPrimary,
              fontFamily: draft.fontFamily,
              padding: "1.5rem",
            }}
          >
            <h3>{draft.name}</h3>
            <div
              style={{
                background: draft.panel,
                padding: "1rem",
                border: "1px solid " + draft.border,
              }}
            >
              <p style={{ color: draft.textSecondary }}>
                Preview your app palette before saving.
              </p>
              <button style={{ background: draft.accent, color: draft.canvas }}>
                Example action
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
