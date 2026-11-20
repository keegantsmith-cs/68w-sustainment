#!/usr/bin/env node
// Content & safety checks for 68W Sustainment. Run: node scripts/check.js
// Exits non-zero if anything must be fixed before publishing.
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const root = path.join(__dirname, "..");
const errors = [], warnings = [];

global.window = {};
for (const f of ["js/ictl.js", "js/cpg.js", "js/adtmc.js", "js/drugref.js", "js/smog.js"]) if (fs.existsSync(path.join(root, f))) require(path.join(root, f));
require(path.join(root, "js/data.js"));
const RES = window.RESOURCES || [];

const resIds = new Set();
for (const r of RES) {
  if (!r.id || !r.title) errors.push(`Resource missing id/title: ${JSON.stringify(r).slice(0, 80)}`);
  if (resIds.has(r.id)) errors.push(`Duplicate resource id: ${r.id}`);
  resIds.add(r.id);
  const docIds = new Set();
  for (const d of r.documents || []) {
    const where = `${r.id}/${d.id}`;
    if (!d.id || !d.title) errors.push(`Document missing id/title in ${r.id}`);
    if (!/^[a-z0-9-]+$/.test(d.id || "")) errors.push(`${where}: id must be lowercase letters, numbers and dashes`);
    if (docIds.has(d.id)) errors.push(`Duplicate document id: ${where}`);
    docIds.add(d.id);
    if (d.file) {
      if (!fs.existsSync(path.join(root, d.file))) warnings.push(`${where}: file not present locally (${d.file}). It will be a broken link on the public site — use url instead.`);
      if (/\.(pdf|docx?|pptx?|xlsx?)$/i.test(d.file) && !/^docs\/ictl\//.test(d.file)) warnings.push(`${where}: points to a file type that is NOT published to the public repo (${d.file}).`);
    }
    if (d.url && !/^https:\/\//.test(d.url)) errors.push(`${where}: url must start with https://`);
    if (!d.file && !d.url && !d.content && !d.refOnly) warnings.push(`${where}: placeholder (no file/url/content yet)`);
  }
}

// Nothing restricted may be tracked by git.
try {
  const tracked = execSync("git ls-files", { cwd: root }).toString().split("\n");
  for (const f of tracked.filter((f) => /\.(pdf|docx?|pptx?|xlsx?)$/i.test(f))) {
    // A tracked PDF is allowed only if its text says it is approved for public release.
    let ok = false;
    if (/\.pdf$/i.test(f)) {
      try {
        const t = execSync(`pdftotext ${JSON.stringify(path.join(root, f))} -`, { stdio: ["ignore", "pipe", "ignore"] }).toString();
        ok = /approved for public release|distribution restriction:\s*a\b/i.test(t);
      } catch { warnings.push(`${f}: could not read (is pdftotext installed?)`); continue; }
    }
    if (!ok) errors.push(`Tracked file is not marked approved for public release: ${f}`);
  }
} catch { warnings.push("Not a git repo — skipped tracked-file check."); }

// Simple PII patterns in tracked text (DoD ID / SSN shapes).
const textFiles = ["js/data.js", "README.md", "CONTRIBUTING.md"];
for (const f of textFiles) {
  const s = fs.existsSync(path.join(root, f)) ? fs.readFileSync(path.join(root, f), "utf8") : "";
  if (/\b\d{3}-\d{2}-\d{4}\b/.test(s)) errors.push(`${f}: looks like it contains an SSN`);
  if (/\b\d{10}\b/.test(s)) warnings.push(`${f}: contains a 10-digit number (possible DoD ID) — confirm it is not PII`);
}

const placeholders = warnings.filter((w) => w.includes("placeholder")).length;
warnings.filter((w) => !w.includes("placeholder")).forEach((w) => console.log("WARN  " + w));
if (placeholders) console.log(`INFO  ${placeholders} placeholder document(s) awaiting content`);
errors.forEach((e) => console.log("ERROR " + e));
console.log(errors.length ? `\n${errors.length} error(s).` : "\nAll checks passed.");
process.exit(errors.length ? 1 : 0);
