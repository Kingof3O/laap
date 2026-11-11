const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  hash,
  validateExecution,
  testPassed,
} = require("./evidence-support.cjs");
test("execution evidence rejects failed, altered and stale source/log artifacts", () => {
  const log = "test domain::roundtrip ... ok\n";
  const record = {
    schemaVersion: 1,
    id: "fixture",
    exitCode: 0,
    sourceUnchanged: true,
    source: { sha256: "current" },
    logSha256: hash(log),
  };
  assert.doesNotThrow(() =>
    validateExecution(record, "fixture", log, "current"),
  );
  for (const changed of [
    { ...record, exitCode: 1 },
    { ...record, sourceUnchanged: false },
    { ...record, source: { sha256: "old" } },
    { ...record, logSha256: "altered" },
  ])
    assert.throws(() => validateExecution(changed, "fixture", log, "current"));
  assert.throws(() => validateExecution(record, "other", log, "current"));
});
test("only actual passing test result records count; ignored or name-only text does not", () => {
  assert(testPassed("test domain::roundtrip ... ok\n", "domain::roundtrip"));
  assert(
    testPassed(
      "ok 1 - original archive roundtrip\n",
      "original archive roundtrip",
    ),
  );
  assert(
    !testPassed("domain::roundtrip exists in source", "domain::roundtrip"),
  );
  assert(
    !testPassed("test domain::roundtrip ... ignored\n", "domain::roundtrip"),
  );
  assert(
    !testPassed(
      "not ok 1 - original archive roundtrip\n",
      "original archive roundtrip",
    ),
  );
});

test("browser result names with punctuation are parsed as actual passes", () => {
  const name = "browser UI + real HTTP: workflow";
  assert(
    testPassed(
      "  ok 1 tests/example.ts:1:1 \u203a " + name + " (1.2s)\n",
      name,
    ),
  );
});
