const fs = require("node:fs");
const path = require("node:path");
const {
  root,
  hash,
  fingerprint,
  csv,
  validateExecution,
  testPassed,
} = require("./evidence-support.cjs");
const directory = path.join(root, "docs/implementation-tracking");
const canonical = csv(
  fs.readFileSync(
    path.join(
      root,
      "docs/LAAP_Final_Execution_Queue_v3/BLUEPRINT/01-research/FEATURE_PARITY_MATRIX.csv",
    ),
    "utf8",
  ),
);
const manifest = JSON.parse(
  fs.readFileSync(path.join(directory, "remediation-evidence.json"), "utf8"),
);
const allowed = new Set([
  "VERIFIED",
  "PARTIAL",
  "NOT_IMPLEMENTED",
  "NOT_TESTED",
  "EXTERNAL_BLOCKER",
  "POLICY_EXCLUDED",
]);
const checked = new Map();
function artifact(id) {
  if (checked.has(id)) return checked.get(id);
  const record = JSON.parse(
    fs.readFileSync(path.join(directory, "evidence", id + ".json"), "utf8"),
  );
  const log = fs.readFileSync(
    path.join(directory, "evidence", record.log),
    "utf8",
  );
  validateExecution(record, id, log, fingerprint(record.scope).sha256);
  const value = { record, log };
  checked.set(id, value);
  return value;
}
const ids = new Set(canonical.map((r) => r.ID));
if (
  canonical.length !== 131 ||
  Object.keys(manifest.requirements).length !== 131 ||
  Object.keys(manifest.requirements).some((id) => !ids.has(id))
)
  throw Error("131-row canonical requirement coverage mismatch");
const rows = canonical.map((r) => {
  const e = manifest.requirements[r.ID];
  if (!allowed.has(e.status) || !e.limitation)
    throw Error("Missing status or limitation for " + r.ID);
  if (
    e.status === "POLICY_EXCLUDED" &&
    r.Decision !== "EXCLUDE_AS_DESCRIBED" &&
    !e.policySource
  )
    throw Error("Unsupported policy exclusion " + r.ID);
  const proofs = [];
  for (const claim of e.executions ?? []) {
    const { log } = artifact(claim.run);
    if (!claim.test || !log.includes(claim.test))
      throw Error("Missing executed test ID " + r.ID);
    if (!testPassed(log, claim.test))
      throw Error("No passing result for " + claim.test);
    proofs.push(claim.run + ": " + claim.test);
  }
  for (const build of e.buildEvidence ?? []) {
    artifact(build);
    proofs.push(build + ": build/isolation check (not native UI)");
  }
  if (
    e.status === "VERIFIED" &&
    (!e.implementation?.length ||
      !e.registration?.length ||
      !e.executions?.length ||
      !e.journeyEvidence?.length ||
      !e.realDependency)
  )
    throw Error("Verified status lacks end-to-end proof: " + r.ID);
  if (e.status === "PARTIAL" && !e.implementation?.length)
    throw Error("Partial status lacks implementation: " + r.ID);
  for (const source of [...(e.implementation ?? []), ...(e.registration ?? [])])
    if (!fs.existsSync(path.join(root, source)))
      throw Error("Missing implementation source " + source);
  return [
    r.ID,
    r.Phase,
    r.Feature,
    r.Flavors,
    e.status,
    (e.implementation ?? []).join("; "),
    (e.registration ?? []).join("; "),
    proofs.join("; "),
    e.dependencyClass ?? "not tested",
    e.limitation,
  ];
});
const header = [
  "ID",
  "Phase",
  "Feature",
  "Flavors",
  "Status",
  "Implementation",
  "Registration",
  "Executed evidence",
  "Dependency classification",
  "Limitations",
];
const encode = (v) => '"' + String(v).replaceAll('"', '""') + '"';
const text =
  [header, ...rows].map((r) => r.map(encode).join(",")).join("\n") + "\n";
fs.writeFileSync(path.join(directory, "FEATURE-STATUS.csv"), text);
fs.writeFileSync(
  path.join(root, "docs/LAAP_THREE_EDITION_PARITY_EVIDENCE.csv"),
  text,
);
console.log(
  "Validated 131 requirements against " +
    checked.size +
    " current execution artifacts. Existence alone never proves verification.",
);
console.log(
  rows.reduce(
    (counts, row) => ((counts[row[4]] = (counts[row[4]] ?? 0) + 1), counts),
    {},
  ),
);
