const fs = require("node:fs");
const path = require("node:path");
const cp = require("node:child_process");
const crypto = require("node:crypto");

const root = path.resolve(__dirname, "..");

const hash = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");

const scopes = {
  native: [
    "apps/desktop/src-tauri/src/",
    "apps/desktop/src-tauri/Cargo.toml",
    "apps/desktop/src-tauri/Cargo.lock",
    "apps/desktop/src-tauri/build.rs",
  ],

  community: [
    "apps/community-api/src/",
    "apps/community-api/tests/",
    "apps/community-api/package.json",
    "package-lock.json",
  ],

  browser: [
    "apps/desktop/src/",
    "apps/desktop/tests/",
    "apps/desktop/playwright",
    "apps/community-api/src/",
    "apps/community-api/tests/",
    "package-lock.json",
    "scripts/check-edition-isolation.mjs",
  ],
};

function fingerprint(scope) {
  const paths = cp
    .execFileSync(
      "git",
      ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
      { cwd: root },
    )
    .toString()
    .split("\0")
    .filter(Boolean);

  const files = [...new Set(paths)]
    .filter((p) => scopes[scope].some((prefix) => p.startsWith(prefix)))
    .sort();

  const entries = files.map((p) => [
    p,
    hash(fs.readFileSync(path.join(root, p))),
  ]);

  return { sha256: hash(JSON.stringify(entries)), files: entries };
}

function csv(text) {
  const rows = [];
  let row = [],
    cell = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  const header = rows.shift();
  return rows.map((r) =>
    Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])),
  );
}

function validateExecution(record, id, log, current) {
  if (
    record.schemaVersion !== 1 ||
    record.id !== id ||
    record.exitCode !== 0 ||
    !record.sourceUnchanged ||
    record.source?.sha256 !== current
  )
    throw Error("Failed or stale execution artifact: " + id);

  if (hash(log) !== record.logSha256)
    throw Error("Execution log checksum mismatch: " + id);
}

function testPassed(log, test) {
  const escaped = test.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  return (
    new RegExp("^test " + escaped + " \\.\\.\\. ok$", "m").test(log) ||
    new RegExp("^ok \\d+ - " + escaped + "$", "m").test(log) ||
    new RegExp("^\\s*ok \\d+ [^\\n]*\\u203a " + escaped + " \\(", "m").test(log)
  );
}

module.exports = {
  root,
  hash,
  fingerprint,
  csv,
  validateExecution,
  testPassed,
};
