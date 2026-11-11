import { useEffect, useRef, useState } from "react";
import { invokeTauri } from "../../lib/api";
import { errorMessage, mods, type ModPackageData } from "./api";
import {
  CreatorIdentity,
  marketplaceRequest,
  type CreatorCredential,
} from "./CreatorIdentity";
import { catalogOrigin } from "./communityEndpoint";
import { readFileBase64, readResponseBytes } from "./packageFiles";

interface MarketplaceMod {
  id?: string;
  packageHash: string;
  title: string;
  description?: string;
  champion?: string;
  version: string;
  creatorName?: string;
  averageRating?: number;
  downloadCount?: number;
  reviewCount?: number;
  tags?: string[];
  bytes?: number;
  author?: string;
  license?: string;
  displayName?: string;
  favoriteCount?: number;
  previewUrl?: string;
  isFavorite?: boolean;
}

interface ReviewItem {
  id: string;
  author: string;
  rating: number;
  comment: string;
  createdAt: number;
}

const validHash = (value: unknown): value is string =>
  typeof value === "string" && /^[a-f0-9]{64}$/.test(value);

export function Marketplace() {
  const [modsList, setModsList] = useState<MarketplaceMod[] | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [working, setWorking] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  // Report modal
  const [reporting, setReporting] = useState<string | null>(null);
  const [reason, setReason] = useState("broken");
  const [notes, setNotes] = useState("");

  // Reviews modal
  const [viewingReviews, setViewingReviews] = useState<string | null>(null);
  const [reviewsList, setReviewsList] = useState<ReviewItem[]>([]);
  const [newRating, setNewRating] = useState(5);
  const [newComment, setNewComment] = useState("");
  const [credential, setCredential] = useState<CreatorCredential | null>(null);

  // Submit mod modal
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [localPackages, setLocalPackages] = useState<ModPackageData[]>([]);
  const [subHash, setSubHash] = useState("");
  const [subTitle, setSubTitle] = useState("");
  const [subDesc, setSubDesc] = useState("");
  const [subChamp, setSubChamp] = useState("");
  const [subTags, setSubTags] = useState("");
  const [subConfirmed, setSubConfirmed] = useState(false);

  const active = useRef<AbortController | null>(null);
  const [nativeImporting, setNativeImporting] = useState(false);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());

  useEffect(() => () => active.current?.abort(), []);

  useEffect(() => {
    if (!catalogOrigin || !credential?.authToken) {
      setFavorites(new Set());
      return;
    }
    fetch(catalogOrigin + "/v1/marketplace/favorites", {
      headers: { Authorization: `Bearer ${credential.authToken}` },
    })
      .then((r) => (r.ok ? (r.json() as Promise<string[]>) : []))
      .then((hashes) => setFavorites(new Set(hashes)))
      .catch(() => {});
  }, [credential]);

  async function toggleFavorite(hash: string) {
    if (!catalogOrigin || !credential) {
      setError("Sign in with a creator identity to save favorite mods.");
      return;
    }
    const isFav = favorites.has(hash);
    setFavorites((prev) => {
      const next = new Set(prev);
      if (isFav) next.delete(hash);
      else next.add(hash);
      return next;
    });
    setModsList((prev) =>
      prev
        ? prev.map((m) =>
            m.packageHash === hash
              ? {
                  ...m,
                  favoriteCount: Math.max(0, (m.favoriteCount ?? 0) + (isFav ? -1 : 1)),
                }
              : m,
          )
        : null,
    );
    try {
      const res = await marketplaceRequest(
        catalogOrigin + `/v1/marketplace/mods/${hash}/favorite`,
        credential.authToken,
        isFav ? "DELETE" : "POST",
      );
      if (!res.ok) throw new Error("Favorite request failed.");
    } catch (e) {
      setFavorites((prev) => {
        const next = new Set(prev);
        if (isFav) next.add(hash);
        else next.delete(hash);
        return next;
      });
      setError(errorMessage(e));
    }
  }

  async function load() {
    if (!catalogOrigin) return;
    setWorking(true);
    setError("");
    try {
      // Try rich marketplace endpoint first
      let res = await fetch(catalogOrigin + "/v1/marketplace/mods", {
        cache: "no-store",
      });
      if (res.ok) {
        const data = (await res.json()) as MarketplaceMod[];
        setModsList(data);
      } else {
        // Fallback to basic approved catalog
        res = await fetch(catalogOrigin + "/v1/catalog/mods", {
          cache: "no-store",
        });
        if (res.ok) {
          const basic = (await res.json()) as Array<{
            hash: string;
            displayName: string;
            author: string;
            version: string;
            bytes: number;
          }>;
          setModsList(
            basic.map((b) => ({
              packageHash: b.hash,
              title: b.displayName,
              version: b.version,
              creatorName: b.author,
              bytes: b.bytes,
              averageRating: undefined,
              downloadCount: undefined,
              reviewCount: 0,
              tags: [],
            })),
          );
        }
      }
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setWorking(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function add(hash: string) {
    if (!validHash(hash) || !catalogOrigin) return;
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    const timeout = setTimeout(() => controller.abort(), 30_000);
    setWorking(true);
    setError("");
    try {
      const base = "/v1/marketplace/mods/" + hash;
      const res = await fetch(catalogOrigin + base, {
        cache: "no-store",
        signal: controller.signal,
      });
      if (!res.ok) throw new Error("Failed to retrieve package manifest.");
      const manifest = JSON.parse(
        new TextDecoder().decode(await readResponseBytes(res, 256 * 1024)),
      ) as {
        sha256?: string;
        rightToDistribute?: boolean;
        containsPaidRiotContent?: boolean;
      };

      if (
        manifest.sha256 !== hash ||
        manifest.rightToDistribute !== true ||
        manifest.containsPaidRiotContent !== false
      )
        throw new Error(
          "Selected package hash or redistribution rights do not match.",
        );
      const dlRes = await fetch(catalogOrigin + base + "/download", {
        signal: controller.signal,
      });
      if (!dlRes.ok) throw new Error("Failed to download package archive.");
      const bytes = await readResponseBytes(dlRes, 12 * 1024 * 1024);
      const archive = await readFileBase64(new File([bytes], hash + ".zip"));

      if (controller.signal.aborted) throw new Error("Download cancelled.");
      setNativeImporting(true);
      setStatus(
        "Archive received. Native validation and atomic import are finishing…",
      );
      await invokeTauri("mod_import", {
        archive,
        manifest,
        rightsConfirmed: true,
      });

      setSelected(null);
      setStatus("Package verified and added to your mod library.");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      clearTimeout(timeout);
      if (active.current === controller) active.current = null;
      setNativeImporting(false);
      setWorking(false);
    }
  }

  async function submitReport() {
    if (!reporting || !validHash(reporting) || !catalogOrigin) return;
    setWorking(true);
    try {
      const res = await fetch(
        catalogOrigin + "/v1/catalog/mods/" + reporting + "/report",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason, notes }),
        },
      );
      if (!res.ok) throw new Error("Report request failed.");
      setReporting(null);
      setNotes("");
      setStatus("Report submitted to moderation queue.");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setWorking(false);
    }
  }

  async function openReviews(hash: string) {
    if (!catalogOrigin) return;
    setViewingReviews(hash);
    setReviewsList([]);
    try {
      const res = await fetch(
        catalogOrigin + "/v1/marketplace/reviews/" + hash,
      );
      if (res.ok) {
        setReviewsList((await res.json()) as ReviewItem[]);
      } else throw new Error("Reviews unavailable.");
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function submitReview(e: React.FormEvent) {
    e.preventDefault();
    if (!viewingReviews || !catalogOrigin) return;
    setWorking(true);
    try {
      if (!credential)
        throw new Error("Sign in to your community identity before reviewing.");
      await marketplaceRequest(
        catalogOrigin,
        "/review",
        {
          packageHash: viewingReviews,
          rating: newRating,
          comment: newComment.trim(),
        },
        credential,
      );
      setNewComment("");
      await openReviews(viewingReviews);
      await load();
      setStatus("Review submitted successfully.");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setWorking(false);
    }
  }

  async function submitMod(e: React.FormEvent) {
    e.preventDefault();
    if (!catalogOrigin || !subConfirmed || !validHash(subHash)) return;
    setWorking(true);
    try {
      if (!credential)
        throw new Error("Create or recover your community identity first.");
      const pkg = await mods.getPackageData(subHash);
      if (
        !pkg.manifest.rightToDistribute ||
        pkg.manifest.containsPaidRiotContent
      )
        throw new Error("Package license does not permit distribution.");
      await marketplaceRequest(
        catalogOrigin,
        "/submit",
        {
          creatorId: credential.id,
          packageHash: subHash,
          archiveBase64: pkg.archiveBase64,
          manifest: pkg.manifest,
          title: subTitle.trim() || pkg.manifest.displayName,
          description: subDesc.trim(),
          champion: subChamp.trim(),
          tags: subTags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
          rightsConfirmed: true,
        },
        credential,
      );
      setShowSubmitModal(false);
      setSubHash("");
      setSubTitle("");
      setSubDesc("");
      setSubChamp("");
      setSubConfirmed(false);
      await load();
      setStatus(
        "Package uploaded and queued for human review. It is not published yet.",
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setWorking(false);
    }
  }

  return (
    <>
      <div className="customization-heading">
        <div>
          <h2>Community marketplace</h2>
          <p>
            Browse, review, and discover community-published custom skins and
            overlays.
          </p>
        </div>
        <div className="customization-actions">
          <button
            className="btn-primary"
            disabled={!catalogOrigin || !credential || working}
            onClick={() => {
              setError("");
              void mods
                .list()
                .then(async (rows) => {
                  const available = await Promise.all(
                    rows
                      .filter((r) => r.sizeBytes <= 12 * 1024 * 1024)
                      .map((r) => mods.getPackageData(r.sha256)),
                  );
                  setLocalPackages(
                    available.filter((r) => r.manifest.rightToDistribute),
                  );
                  setShowSubmitModal(true);
                })
                .catch((e) => setError(errorMessage(e)));
            }}
          >
            Submit local package
          </button>
          <button
            className="btn-secondary"
            disabled={working}
            onClick={() => void load()}
          >
            {working ? "Loading…" : "Refresh"}
          </button>
        </div>
      </div>

      {!catalogOrigin && (
        <p role="status">This build has no configured community catalog.</p>
      )}
      {catalogOrigin && (
        <CreatorIdentity origin={catalogOrigin} onChange={setCredential} />
      )}
      {error && <p role="alert">{error}</p>}
      {status && <p role="status">{status}</p>}
      {active.current && !nativeImporting && (
        <button
          className="btn-secondary"
          onClick={() => active.current?.abort()}
        >
          Cancel download
        </button>
      )}

      {/* Publish Mod Modal */}
      {showSubmitModal && (
        <form
          className="customization-editor"
          style={{ marginBottom: "1.5rem" }}
          onSubmit={(e) => void submitMod(e)}
        >
          <h3>Submit for moderation</h3>
          <label>
            Redistributable local package (up to 12 MiB)
            <select
              required
              value={subHash}
              onChange={(e) => setSubHash(e.target.value)}
            >
              <option value="">Choose a verified package</option>
              {localPackages.map((p) => (
                <option key={p.sha256} value={p.sha256}>
                  {p.manifest.displayName} · {p.manifest.version}
                </option>
              ))}
            </select>
          </label>
          {localPackages.length === 0 && (
            <p>
              Import a rights-cleared redistributable package in the mod library
              first.
            </p>
          )}
          <label>
            Mod title{" "}
            <input
              required
              placeholder="e.g. Cyberpunk Ahri"
              value={subTitle}
              onChange={(e) => setSubTitle(e.target.value)}
            />
          </label>
          <label>
            Champion{" "}
            <input
              required
              placeholder="e.g. Ahri"
              value={subChamp}
              onChange={(e) => setSubChamp(e.target.value)}
            />
          </label>
          <label>
            Tags (comma separated){" "}
            <input
              placeholder="Sci-Fi, VFX, Audio"
              value={subTags}
              onChange={(e) => setSubTags(e.target.value)}
            />
          </label>
          <label>
            Description{" "}
            <textarea
              rows={2}
              value={subDesc}
              onChange={(e) => setSubDesc(e.target.value)}
            />
          </label>
          <label className="customization-check">
            <input
              type="checkbox"
              required
              checked={subConfirmed}
              onChange={(e) => setSubConfirmed(e.target.checked)}
            />
            I have permission to distribute these assets and confirm this mod
            contains no paid Riot content or executables.
          </label>
          <div className="customization-actions">
            <button
              type="submit"
              className="btn-primary"
              disabled={working || !subConfirmed || !validHash(subHash)}
            >
              Submit package
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setShowSubmitModal(false)}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Reviews Modal */}
      {viewingReviews && (
        <section
          className="customization-editor"
          style={{ marginBottom: "1.5rem" }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <h3>Community reviews ({reviewsList.length})</h3>
            <button
              className="btn-secondary"
              onClick={() => setViewingReviews(null)}
            >
              Close
            </button>
          </div>

          <form
            onSubmit={(e) => void submitReview(e)}
            style={{ margin: "1rem 0" }}
          >
            <h4>Write a review</h4>
            <div style={{ display: "flex", gap: "8px" }}>
              <span>
                Reviews use your authenticated community display name.
              </span>
              <label style={{ width: "120px" }}>
                Rating
                <select
                  value={newRating}
                  onChange={(e) => setNewRating(Number(e.target.value))}
                >
                  <option value={5}>★★★★★ (5)</option>
                  <option value={4}>★★★★☆ (4)</option>
                  <option value={3}>★★★☆☆ (3)</option>
                  <option value={2}>★★☆☆☆ (2)</option>
                  <option value={1}>★☆☆☆☆ (1)</option>
                </select>
              </label>
            </div>
            <label>
              Review comment{" "}
              <textarea
                rows={2}
                required
                maxLength={500}
                placeholder="Share feedback on texture quality, in-game look, or bugs…"
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
              />
            </label>
            <button
              type="submit"
              className="btn-primary"
              disabled={working || !credential || !newComment.trim()}
            >
              Save my review
            </button>
          </form>

          <ul style={{ paddingLeft: 0, listStyle: "none" }}>
            {reviewsList.map((r) => (
              <li
                key={r.id}
                style={{
                  padding: "8px 0",
                  borderBottom: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                <div
                  style={{ display: "flex", justifyContent: "space-between" }}
                >
                  <strong>{r.author}</strong>
                  <span style={{ color: "#f59e0b" }}>
                    {"★".repeat(r.rating)}
                    {"☆".repeat(5 - r.rating)}
                  </span>
                </div>
                <p style={{ margin: "4px 0", fontSize: "0.9rem" }}>
                  {r.comment}
                </p>
              </li>
            ))}
            {reviewsList.length === 0 && (
              <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                No reviews yet. Be the first to review this mod!
              </p>
            )}
          </ul>
        </section>
      )}

      {/* Report Modal */}
      {reporting && (
        <form
          className="customization-editor"
          style={{ marginBottom: "1.5rem" }}
          onSubmit={(event) => {
            event.preventDefault();
            void submitReport();
          }}
        >
          <h3>Report package issue</h3>
          <label>
            Reason{" "}
            <select
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            >
              <option value="broken">Broken package</option>
              <option value="copyright">Rights concern</option>
              <option value="malware">Unsafe content</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label>
            Details{" "}
            <textarea
              maxLength={1000}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </label>
          <div className="customization-actions">
            <button className="btn-primary" disabled={working}>
              Submit report
            </button>
            <button
              type="button"
              className="btn-secondary"
              disabled={working}
              onClick={() => setReporting(null)}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Catalog List */}
      {!modsList && !error && <p role="status">Loading marketplace catalog…</p>}
      {modsList?.length === 0 && (
        <p>No packages found in the community catalog.</p>
      )}

      <ul className="customization-list">
        {modsList?.map((item) => (
          <li key={item.packageHash}>
            {item.previewUrl && catalogOrigin && (
              <img
                src={catalogOrigin + item.previewUrl}
                alt={item.title}
                style={{
                  width: "100%",
                  maxHeight: "160px",
                  objectFit: "cover",
                  borderRadius: "6px",
                  marginBottom: "8px",
                }}
              />
            )}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <strong>
                {item.title} · v{item.version}
              </strong>
              <div
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
              >
                {item.averageRating !== undefined && (
                  <span style={{ color: "#f59e0b", fontSize: "0.85rem" }}>
                    {item.reviewCount
                      ? `★ ${item.averageRating.toFixed(1)} (${item.reviewCount})`
                      : "No ratings yet"}
                  </span>
                )}
                {item.downloadCount !== undefined && (
                  <span
                    style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}
                  >
                    ⬇ {item.downloadCount}
                  </span>
                )}
              </div>
            </div>
            <span>
              By {item.creatorName || item.author || "Community Creator"}
              {item.champion ? ` · Champion: ${item.champion}` : ""}
            </span>
            {item.description && (
              <p
                style={{
                  fontSize: "0.85rem",
                  margin: "4px 0",
                  color: "var(--text-muted)",
                }}
              >
                {item.description}
              </p>
            )}

            {item.tags && item.tags.length > 0 && (
              <div style={{ display: "flex", gap: "4px", margin: "4px 0" }}>
                {item.tags.map((t) => (
                  <span
                    key={t}
                    className="badge"
                    style={{
                      fontSize: "0.7rem",
                      padding: "1px 6px",
                      background: "rgba(255,255,255,0.06)",
                      borderRadius: "4px",
                    }}
                  >
                    {t}
                  </span>
                ))}
              </div>
            )}

            <div
              className="customization-actions"
              style={{ marginTop: "0.5rem" }}
            >
              <button
                className="btn-secondary"
                onClick={() => void toggleFavorite(item.packageHash)}
              >
                {favorites.has(item.packageHash) ? "★ Saved" : "☆ Save"} ({item.favoriteCount ?? 0})
              </button>
              <button
                className="btn-secondary"
                onClick={() => void openReviews(item.packageHash)}
              >
                Reviews ({item.reviewCount ?? 0})
              </button>
              <button
                className="btn-secondary"
                disabled={working}
                onClick={() => {
                  setReporting(item.packageHash);
                  setNotes("");
                }}
              >
                Report
              </button>
              {selected === item.packageHash ? (
                <>
                  <button
                    className="btn-primary"
                    disabled={working}
                    onClick={() => void add(item.packageHash)}
                  >
                    Download & verify
                  </button>
                  <button
                    className="btn-secondary"
                    disabled={working}
                    onClick={() => setSelected(null)}
                  >
                    Back
                  </button>
                </>
              ) : (
                <button
                  className="btn-primary"
                  disabled={working}
                  onClick={() => setSelected(item.packageHash)}
                >
                  Get package
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
