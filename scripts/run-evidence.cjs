const fs = require("node:fs");
const path = require("node:path");
const cp = require("node:child_process");
const { root, hash, fingerprint } = require("./evidence-support.cjs");
const [id, scope, cwd, ...command] = process.argv.slice(2);
if (
  !/^[a-z0-9-]+$/.test(id) ||
  !["native", "browser", "community", "desktop"].includes(scope) ||
  !command.length
)
  throw Error(
    "Usage: run-evidence ID native|browser|community|desktop CWD EXEC ARGS...",
  );
const directory = path.join(root, "docs/implementation-tracking/evidence");
fs.mkdirSync(directory, { recursive: true });
const before = fingerprint(scope);
const startedAt = new Date().toISOString();
const result = cp.spawnSync(
  command[0] === "node" ? process.execPath : command[0],
  command.slice(1),
  {
    cwd: path.resolve(root, cwd),
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
    windowsHide: true,
  },
);
const log = (result.stdout ?? "") + (result.stderr ?? "");
fs.writeFileSync(path.join(directory, id + ".log"), log);
const after = fingerprint(scope);
const record = {
  schemaVersion: 1,
  id,
  scope,
  cwd,
  command,
  startedAt,
  finishedAt: new Date().toISOString(),
  head: cp
    .execFileSync("git", ["rev-parse", "HEAD"], { cwd: root })
    .toString()
    .trim(),
  source: before,
  sourceUnchanged: before.sha256 === after.sha256,
  exitCode: result.status,
  error: result.error?.message ?? null,
  log: id + ".log",
  logSha256: hash(log),
};
fs.writeFileSync(
  path.join(directory, id + ".json"),
  JSON.stringify(record, null, 2) + "\n",
);
process.stdout.write(log);
process.exitCode = result.status === 0 && record.sourceUnchanged ? 0 : 1;
