#!/usr/bin/env node
/**
 * Run the bundled test files, one node process per file.
 *
 * `node --test .tmp-tests/*.js` loads every bundle into a single process. In
 * the iSH environment that intermittently SIGSEGVs once the suite grows (a
 * different file each run), which makes the suite untrustworthy: a genuine
 * regression and a memory crash look identical. One process per file removes
 * the shared heap and makes the result deterministic.
 *
 * Usage: node scripts/run-tests.mjs
 */
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";

const dir = ".tmp-tests";
const files = readdirSync(dir)
  .filter((f) => f.endsWith(".test.js"))
  .sort();

let pass = 0;
let fail = 0;
const failures = [];

for (const file of files) {
  const r = spawnSync(process.execPath, ["--test", path.join(dir, file)], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  const out = `${r.stdout || ""}${r.stderr || ""}`;
  const p = Number((out.match(/^# pass (\d+)$/m) || [])[1] || 0);
  const f = Number((out.match(/^# fail (\d+)$/m) || [])[1] || 0);
  const crashed = r.signal || (r.status !== 0 && p === 0 && f === 0);
  pass += p;
  fail += f + (crashed ? 1 : 0);
  const mark = f || crashed ? "FAIL" : "ok  ";
  console.log(`${mark}  ${file.padEnd(30)} pass ${p}  fail ${f}${crashed ? "  (signal " + (r.signal || r.status) + ")" : ""}`);
  if (f || crashed) {
    failures.push(
      `${file}\n` +
        out
          .split("\n")
          .filter((l) => /^not ok|Error|Assertion|expected|actual|signal/i.test(l))
          .slice(0, 20)
          .join("\n"),
    );
  }
}

console.log(`\n${files.length} files | ${pass} passed | ${fail} failed`);
if (failures.length) {
  console.log("\n--- failures ---\n" + failures.join("\n\n"));
  process.exit(1);
}
