import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { DatabaseSync } from "node:sqlite";
import type { CatalogHandler } from "./catalog.ts";
import { MAX_ARCHIVE, validatePackage } from "./packageValidation.ts";

const HASH = /^[a-f0-9]{64}$/;
class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
const fail = (status: number, message: string): never => {
  throw new HttpError(status, message);
};
const hashToken = (v: string) => createHash("sha256").update(v).digest();
const equal = (a: string, b: string) =>
  timingSafeEqual(hashToken(a), hashToken(b));
const string = (v: unknown, max: number, required = false): string => {
  if (v === undefined && !required) return "";
  if (
    typeof v !== "string" ||
    v.length > max ||
    /[\u0000-\u001f\u007f]/u.test(v) ||
    (required && !v.trim())
  )
    return fail(400, "Invalid text field");
  return v.trim();
};
async function body(
  req: IncomingMessage,
  max: number,
): Promise<Record<string, unknown>> {
  if (!req.headers["content-type"]?.startsWith("application/json"))
    fail(415, "JSON required");
  if (Number(req.headers["content-length"] ?? 0) > max)
    fail(413, "Payload too large");
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > max) fail(413, "Payload too large");
    chunks.push(Buffer.from(chunk));
  }
  let value: unknown;
  try {
    value = JSON.parse(Buffer.concat(chunks).toString());
  } catch {
    return fail(400, "Malformed JSON");
  }
  if (!value || typeof value !== "object" || Array.isArray(value))
    return fail(400, "JSON object required");
  return value as Record<string, unknown>;
}
type Creator = {
  id: string;
  display_name: string;
  auth_token_hash: string;
  bio: string;
  contact: string;
};
type Submission = {
  id: string;
  creator_id: string;
  package_hash: string;
  status: string;
};
export class MarketplaceStore {
  public database: DatabaseSync;
  private adminKey?: string;
  private blocked: (hash: string) => boolean;
  private attempts = new Map<string, { until: number; count: number }>();
  private inFlight = 0;
  constructor(
    databaseOrPath: string | DatabaseSync,
    options: { adminKey?: string; isBlocked?: (hash: string) => boolean } = {},
  ) {
    this.database =
      typeof databaseOrPath === "string"
        ? new DatabaseSync(databaseOrPath)
        : databaseOrPath;
    // Only an explicitly injected 256-bit hex secret enables administrative operations.
    this.adminKey =
      options.adminKey && HASH.test(options.adminKey)
        ? options.adminKey
        : undefined;
    this.blocked = options.isBlocked ?? (() => false);
    this.database.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=3000;
      CREATE TABLE IF NOT EXISTS creator_profiles (id TEXT PRIMARY KEY, display_name TEXT NOT NULL, bio TEXT NOT NULL, contact TEXT NOT NULL, auth_token_hash TEXT NOT NULL, verified INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS submissions (id TEXT PRIMARY KEY, creator_id TEXT NOT NULL, package_hash TEXT NOT NULL UNIQUE, title TEXT NOT NULL, description TEXT NOT NULL, champion TEXT NOT NULL, version TEXT NOT NULL, tags TEXT NOT NULL, status TEXT NOT NULL, moderation_note TEXT, rights_confirmed INTEGER NOT NULL, created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS reviews (id TEXT PRIMARY KEY, package_hash TEXT NOT NULL, author_id TEXT NOT NULL, author_name TEXT NOT NULL, rating INTEGER NOT NULL, comment TEXT NOT NULL, created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS download_stats (package_hash TEXT PRIMARY KEY, count INTEGER NOT NULL DEFAULT 0, last_download INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS marketplace_packages (hash TEXT PRIMARY KEY, creator_id TEXT NOT NULL, manifest TEXT NOT NULL, archive BLOB NOT NULL);
      CREATE TABLE IF NOT EXISTS marketplace_audit (id TEXT PRIMARY KEY, package_hash TEXT NOT NULL, action TEXT NOT NULL, old_status TEXT NOT NULL, new_status TEXT NOT NULL, note TEXT NOT NULL, created_at INTEGER NOT NULL);
      DELETE FROM reviews WHERE rowid NOT IN (SELECT MIN(rowid) FROM reviews GROUP BY package_hash, author_id);
      CREATE UNIQUE INDEX IF NOT EXISTS marketplace_review_owner ON reviews(package_hash, author_id);
      CREATE UNIQUE INDEX IF NOT EXISTS marketplace_creator_token ON creator_profiles(auth_token_hash);`);
  }
  close() {
    this.database.close();
  }
  private transaction<T>(work: () => T): T {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const value = work();
      this.database.exec("COMMIT");
      return value;
    } catch (e) {
      this.database.exec("ROLLBACK");
      throw e;
    }
  }
  private admin(req: IncomingMessage) {
    const provided = req.headers["x-admin-key"];
    if (
      !this.adminKey ||
      typeof provided !== "string" ||
      !equal(this.adminKey, provided)
    )
      fail(401, "Administrator authentication required");
  }
  private creator(req: IncomingMessage): Creator {
    const token = req.headers.authorization?.match(
      /^Bearer ([a-f0-9]{64})$/,
    )?.[1];
    if (!token) return fail(401, "Creator authentication required");
    const creator = this.database
      .prepare("SELECT * FROM creator_profiles WHERE auth_token_hash = ?")
      .get(hashToken(token).toString("hex")) as Creator | undefined;
    if (!creator) return fail(403, "Invalid creator credential");
    return creator;
  }
  private submission(hash: string, published = false): Submission {
    const row = this.database
      .prepare("SELECT * FROM submissions WHERE package_hash = ?")
      .get(hash) as Submission | undefined;
    if (
      !row ||
      (published && (row.status !== "approved" || this.blocked(hash)))
    )
      return fail(404, "Package unavailable");
    return row;
  }
  handler(origins: ReadonlySet<string>): CatalogHandler {
    return (req, res) => {
      if (!req.url?.startsWith("/v1/marketplace/")) return false;
      if (req.headers.origin && !origins.has(req.headers.origin)) {
        res.writeHead(403).end();
        return true;
      }
      if (req.headers.origin)
        res.setHeader("Access-Control-Allow-Origin", req.headers.origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("X-Content-Type-Options", "nosniff");
      if (req.method === "OPTIONS") {
        res
          .writeHead(204, {
            "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
            "Access-Control-Allow-Headers":
              "Content-Type, Authorization, X-Admin-Key",
          })
          .end();
        return true;
      }
      const now = Date.now();
      for (const [k, v] of this.attempts)
        if (v.until < now) this.attempts.delete(k);
      const key = req.socket.remoteAddress ?? ""; // Do not trust spoofable forwarded IP headers.
      const count = this.attempts.get(key) ?? { until: now + 60_000, count: 0 };
      if (
        ++count.count > 180 ||
        this.attempts.size >= 10_000 ||
        this.inFlight >= 4
      ) {
        res
          .writeHead(429, { "Retry-After": "60" })
          .end('{"error":"Request quota exceeded"}');
        return true;
      }
      this.attempts.set(key, count);
      this.inFlight++;
      void this.route(req, res)
        .catch((e) => {
          if (!res.headersSent)
            res.writeHead(e instanceof HttpError ? e.status : 500).end(
              JSON.stringify({
                error:
                  e instanceof HttpError
                    ? e.message
                    : "Marketplace operation failed",
              }),
            );
        })
        .finally(() => {
          this.inFlight--;
        });
      return true;
    };
  }
  private async route(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url!, "http://localhost");
    const path = url.pathname;
    const json = (value: unknown) => res.end(JSON.stringify(value));
    if (req.method === "GET" && path === "/v1/marketplace/mods") {
      const status = url.searchParams.get("status") ?? "approved";
      if (status !== "approved") this.admin(req);
      if (
        !["approved", "pending_review", "rejected", "takedown"].includes(status)
      )
        fail(400, "Invalid status");
      const offset = Number(url.searchParams.get("offset") ?? 0);
      if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100_000)
        fail(400, "Invalid page");
      const query = string(url.searchParams.get("q") ?? "", 120).toLowerCase();
      const rows = this.database
        .prepare(
          `SELECT s.id, s.creator_id AS creatorId, s.package_hash AS packageHash, s.title, s.description, s.champion, s.version, s.tags, s.status, s.moderation_note AS moderationNote, c.display_name AS creatorName,
        length(p.archive) AS bytes, COALESCE(d.count,0) AS downloadCount, COALESCE((SELECT AVG(rating) FROM reviews WHERE package_hash=s.package_hash),0) AS averageRating,
        (SELECT COUNT(*) FROM reviews WHERE package_hash=s.package_hash) AS reviewCount FROM submissions s JOIN marketplace_packages p ON p.hash=s.package_hash JOIN creator_profiles c ON c.id=s.creator_id LEFT JOIN download_stats d ON d.package_hash=s.package_hash WHERE s.status=? AND instr(lower(s.title || ' ' || s.description || ' ' || s.tags),?) > 0 ORDER BY s.created_at DESC LIMIT 50 OFFSET ?`,
        )
        .all(status, query, offset) as Record<string, unknown>[];
      return json(
        rows
          .filter((r) => !this.blocked(String(r.packageHash)))
          .map((r) => ({ ...r, tags: JSON.parse(String(r.tags)) })),
      );
    }
    if (path === "/v1/marketplace/creator" && req.method === "GET") {
      const c = this.creator(req);
      return json({
        id: c.id,
        displayName: c.display_name,
        bio: c.bio,
        contact: c.contact,
      });
    }
    if (path === "/v1/marketplace/creator" && req.method === "POST") {
      const data = await body(req, 8192);
      const displayName = string(data.displayName, 50, true);
      const bio = string(data.bio, 1000);
      const contact = string(data.contact, 200);
      if (data.id !== undefined) {
        const c = this.creator(req);
        if (c.id !== data.id) fail(403, "Profile ownership required");
        this.database
          .prepare(
            "UPDATE creator_profiles SET display_name=?,bio=?,contact=? WHERE id=?",
          )
          .run(displayName, bio, contact, c.id);
        return json({ id: c.id, displayName, bio, contact });
      }
      const count = this.database
        .prepare("SELECT COUNT(*) AS n FROM creator_profiles")
        .get() as { n: number };
      if (count.n >= 10_000) fail(503, "Creator registration capacity reached");
      const id = randomUUID();
      const authToken = randomBytes(32).toString("hex");
      this.database
        .prepare("INSERT INTO creator_profiles VALUES (?,?,?,?,?,0,?)")
        .run(
          id,
          displayName,
          bio,
          contact,
          hashToken(authToken).toString("hex"),
          Date.now(),
        );
      return json({
        id,
        displayName,
        bio,
        contact,
        verified: false,
        authToken,
      });
    }
    if (path === "/v1/marketplace/my-submissions" && req.method === "GET") {
      const c = this.creator(req);
      return json(
        this.database
          .prepare(
            "SELECT package_hash AS packageHash,title,version,status,moderation_note AS moderationNote FROM submissions WHERE creator_id=? ORDER BY created_at DESC LIMIT 100",
          )
          .all(c.id),
      );
    }
    if (path === "/v1/marketplace/submit" && req.method === "POST") {
      const c = this.creator(req);
      const data = await body(req, (MAX_ARCHIVE * 4) / 3 + 512 * 1024);
      if (c.id !== data.creatorId || data.rightsConfirmed !== true)
        fail(403, "Creator ownership and rights confirmation required");
      const title = string(data.title, 160, true);
      const description = string(data.description, 2000);
      const champion = string(data.champion, 120);
      if (
        typeof data.archiveBase64 !== "string" ||
        !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
          data.archiveBase64,
        )
      )
        fail(400, "Archive bytes required");
      const archive = Buffer.from(data.archiveBase64 as string, "base64");
      let manifest;
      try {
        manifest = await validatePackage(archive, data.manifest);
      } catch {
        return fail(
          400,
          "Package failed archive, digest, or rights validation",
        );
      }
      if (data.packageHash !== manifest.sha256)
        fail(400, "Package hash mismatch");
      const tags = data.tags ?? [];
      if (
        !Array.isArray(tags) ||
        tags.length > 10 ||
        tags.some((t) => typeof t !== "string" || !t.trim() || t.length > 40)
      )
        fail(400, "Invalid tags");
      const hash = manifest.sha256;
      const existing = this.database
        .prepare("SELECT * FROM submissions WHERE package_hash=?")
        .get(hash) as Submission | undefined;
      if (existing && existing.creator_id !== c.id)
        fail(403, "Package already belongs to another creator");
      if (existing?.status === "takedown" || this.blocked(hash))
        fail(409, "Taken down packages cannot be resubmitted");
      const quota = this.database
        .prepare(
          "SELECT COUNT(*) AS n, COALESCE(SUM(length(archive)),0) AS bytes FROM marketplace_packages WHERE creator_id=?",
        )
        .get(c.id) as { n: number; bytes: number };
      const total = this.database
        .prepare(
          "SELECT COALESCE(SUM(length(archive)),0) AS bytes FROM marketplace_packages",
        )
        .get() as { bytes: number };
      if (
        (!existing && quota.n >= 50) ||
        quota.bytes + archive.length > 128 * 1024 * 1024 ||
        total.bytes + archive.length > 1024 * 1024 * 1024
      )
        fail(413, "Package storage quota exceeded");
      const id = existing?.id ?? randomUUID();
      this.transaction(() => {
        this.database
          .prepare(
            "INSERT INTO marketplace_packages VALUES (?,?,?,?) ON CONFLICT(hash) DO UPDATE SET manifest=excluded.manifest",
          )
          .run(hash, c.id, JSON.stringify(manifest), archive);
        this.database
          .prepare(
            `INSERT INTO submissions VALUES (?,?,?,?,?,?,?,?,'pending_review',NULL,1,?) ON CONFLICT(package_hash) DO UPDATE SET title=excluded.title,description=excluded.description,champion=excluded.champion,version=excluded.version,tags=excluded.tags,status='pending_review',moderation_note=NULL`,
          )
          .run(
            id,
            c.id,
            hash,
            title,
            description,
            champion,
            manifest.version,
            JSON.stringify(tags),
            Date.now(),
          );
      });
      return json({ id, packageHash: hash, status: "pending_review" });
    }
    const admin = /^\/v1\/marketplace\/admin\/review\/([a-f0-9]{64})$/.exec(
      path,
    );
    if (admin && req.method === "POST") {
      this.admin(req);
      const data = await body(req, 8192);
      const before = this.submission(admin[1]);
      const action = string(data.action, 20, true);
      const note = string(data.note, 2000, true);
      const status = (
        {
          approve: "approved",
          reject: "rejected",
          takedown: "takedown",
          restore: "pending_review",
        } as Record<string, string>
      )[action];
      if (
        !status ||
        (action === "restore"
          ? before.status !== "takedown"
          : action === "approve"
            ? before.status !== "pending_review"
            : action === "reject"
              ? before.status !== "pending_review"
              : before.status !== "approved")
      )
        fail(409, "Invalid moderation transition");
      const pkg = this.database
        .prepare(
          "SELECT archive,manifest FROM marketplace_packages WHERE hash=?",
        )
        .get(admin[1]) as { archive: Uint8Array; manifest: string } | undefined;
      if (!pkg)
        fail(
          409,
          "Legacy metadata has no validated uploaded bytes; creator must resubmit",
        );
      if (action === "approve") {
        if (this.blocked(admin[1]))
          fail(409, "Package is blocked by safety moderation");
        try {
          await validatePackage(
            Buffer.from(pkg!.archive),
            JSON.parse(pkg!.manifest),
          );
        } catch {
          return fail(409, "Stored package failed revalidation");
        }
      }
      const current = this.database
        .prepare("SELECT * FROM submissions WHERE package_hash=?")
        .get(admin[1]);
      const currentPackage = this.database
        .prepare("SELECT manifest FROM marketplace_packages WHERE hash=?")
        .get(admin[1]) as { manifest: string } | undefined;
      if (
        JSON.stringify(current) !== JSON.stringify(before) ||
        currentPackage?.manifest !== pkg!.manifest
      )
        fail(409, "Submission changed during review; reload");
      this.transaction(() => {
        const changed = this.database
          .prepare(
            "UPDATE submissions SET status=?,moderation_note=? WHERE package_hash=? AND status=?",
          )
          .run(status, note, admin[1], before.status);
        if (!changed.changes) fail(409, "Concurrent moderation change; reload");
        this.database
          .prepare("INSERT INTO marketplace_audit VALUES (?,?,?,?,?,?,?)")
          .run(
            randomUUID(),
            admin[1],
            action,
            before.status,
            status,
            note,
            Date.now(),
          );
      });
      return json({ packageHash: admin[1], status });
    }
    const file =
      /^\/v1\/marketplace\/mods\/([a-f0-9]{64})(?:\/(download))?$/.exec(path);
    if (file && req.method === "GET") {
      this.submission(file[1], true);
      const pkg = this.database
        .prepare(
          "SELECT manifest,archive FROM marketplace_packages WHERE hash=?",
        )
        .get(file[1]) as { manifest: string; archive: Uint8Array } | undefined;
      if (!pkg) return fail(404, "Package bytes unavailable");
      if (!file[2]) return json(JSON.parse(pkg.manifest));
      const bytes = Buffer.from(pkg.archive);
      if (createHash("sha256").update(bytes).digest("hex") !== file[1])
        fail(503, "Stored package corrupted");
      this.database
        .prepare(
          "INSERT INTO download_stats VALUES (?,1,?) ON CONFLICT(package_hash) DO UPDATE SET count=count+1,last_download=excluded.last_download",
        )
        .run(file[1], Date.now());
      res
        .writeHead(200, {
          "Content-Type": "application/zip",
          "Content-Length": bytes.length,
          "Content-Disposition": `attachment; filename="${file[1]}.zip"`,
        })
        .end(bytes);
      return;
    }
    if (
      path === "/v1/marketplace/review" &&
      (req.method === "POST" || req.method === "DELETE")
    ) {
      const c = this.creator(req);
      const data = await body(req, 4096);
      const hash = string(data.packageHash, 64, true);
      if (!HASH.test(hash)) fail(400, "Invalid package hash");
      const s = this.submission(hash, true);
      if (s.creator_id === c.id)
        fail(400, "Creators cannot review their own package");
      if (req.method === "DELETE") {
        this.database
          .prepare("DELETE FROM reviews WHERE package_hash=? AND author_id=?")
          .run(hash, c.id);
        return json({ deleted: true });
      }
      const rating = data.rating;
      const comment = string(data.comment, 500);
      if (!Number.isInteger(rating) || Number(rating) < 1 || Number(rating) > 5)
        fail(400, "Rating must be 1–5");
      this.database
        .prepare(
          `INSERT INTO reviews VALUES (?,?,?,?,?,?,?) ON CONFLICT(package_hash,author_id) DO UPDATE SET author_name=excluded.author_name,rating=excluded.rating,comment=excluded.comment,created_at=excluded.created_at`,
        )
        .run(
          randomUUID(),
          hash,
          c.id,
          c.display_name,
          Number(rating),
          comment,
          Date.now(),
        );
      return json({ packageHash: hash, rating, author: c.display_name });
    }
    const reviews = /^\/v1\/marketplace\/reviews\/([a-f0-9]{64})$/.exec(path);
    if (reviews && req.method === "GET") {
      this.submission(reviews[1], true);
      return json(
        this.database
          .prepare(
            "SELECT id,author_name AS author,rating,comment,created_at AS createdAt FROM reviews WHERE package_hash=? ORDER BY created_at DESC LIMIT 50",
          )
          .all(reviews[1]),
      );
    }
    if (path === "/v1/marketplace/admin/audit" && req.method === "GET") {
      this.admin(req);
      return json(
        this.database
          .prepare(
            "SELECT * FROM marketplace_audit ORDER BY created_at DESC LIMIT 200",
          )
          .all(),
      );
    }
    fail(404, "Marketplace route not found");
  }
}
