#!/usr/bin/env python3
"""
Build js/cpg.js from the Joint Trauma System CPG PDFs in docs/cpg/.

    python3 scripts/build_cpg.py

Needs `pdftotext`/`pdfinfo` (poppler-utils). The CPG PDFs carry no
distribution statement, so they are NOT committed (see .gitignore). The app
shows each guideline's ID, title, publication date and stated purpose, and
links to the official JTS CPG library (the address printed in the CPGs).
It also links CPGs to the ICTL tasks that cite them by CPG ID.
"""
import json, re, subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs" / "cpg"
ICTL = ROOT / "docs" / "ictl"
OUT = ROOT / "js" / "cpg.js"
JTS_LIBRARY = "https://jts.health.mil/index.cfm/PI_CPGs/cpgs"  # as printed in the CPGs themselves
TASK_RE = r"\d{3}-(?:000|68W|LDR)-\d{4}"

# Rapid updates printed at the top of these CPG editions, copied word for word.
# main() verifies every string appears in its PDF and stops if one does not.
RAPID_UPDATES = {
    61: [["01 Sep 2023", "SAVeO2 oxygen parameters"]],
    63: [["Apr 2024", "Levetiracetam dosing (1500 mg loading dose, 1000 mg BID), PaCO2 (35-45 mmHg), SpO2 (>93%), and EtCO2 (35-45 mmHg) parameters updated to match parameters in Traumatic Brain Injury Management and Basic Neurosurgery in the Deployed Environment CPG."]],
    73: [["01 Sep 2023", "SAVeO2 oxygen parameters"],
         ["Jun 2023", "Calcium administration changed to 1 gram calcium"],
         ["Jun 2023", "Tranexamic acid (TXA) 2gm bolus is now favored over the traditional 1gm prehospital bolus followed by 1gm infusion over 8 hours. The 2gm TXA bolus should be given as close to the time of injury as possible and not outside of the 3 hours window."]],
    82: [["Jun 2023", "Calcium administration changed to 1 gram calcium"]],
    83: [["01 Sep 2023", "SAVeO2 oxygen parameters"]],
    92: [["01 Sep 2023", "SAVeO2 oxygen parameters"],
         ["Nov 2022", "Safety statement. CAUTION: The Hamilton T1 as fielded by the Department of Defense DOES NOT support noninvasive ventilation (NIV). In environments where there is a risk of patients requiring NIV, a different ventilator should be fielded."]],
}

SERIES_PFC = "Prolonged Field Care Series"
SERIES_OTHER = "Prehospital, En Route & Deployed Care"


def run(*args):
    return subprocess.run(args, capture_output=True, text=True, check=True).stdout


def clean(s):
    s = re.sub(r"-\n(?=[a-z])", "-", s)
    s = re.sub(r"\s*\n\s*", " ", s)
    return re.sub(r"\s{2,}", " ", s).strip()


def parse_cpg(pdf):
    full = run("pdftotext", str(pdf), "-")
    page1 = run("pdftotext", "-l", "1", str(pdf), "-")
    cid = int(re.search(r"CPG ID:\s*(\d+)", full).group(1))
    date = re.search(r"Publication Date:?\s*(\d{1,2} [A-Za-z]+ \d{4})", full).group(1)
    date = re.sub(r"(\d{1,2}) ([A-Za-z]{3})[a-z]+ (\d{4})", r"\1 \2 \3", date)  # "28 December 2016" -> "28 Dec 2016"
    pages = int(re.search(r"Pages:\s+(\d+)", run("pdfinfo", str(pdf))).group(1))

    lines = [l.strip() for l in page1.splitlines() if l.strip()]
    i = next(i for i, l in enumerate(lines) if "CLINICAL PRACTICE GUIDELINE" in l) + 1
    # Title runs until the intent sentence ("The intent...", "This CPG...", "The purpose...")
    title_lines, intent_lines = [], []
    while i < len(lines) and not re.match(r"(The (intent|purpose)|This (CPG|Role|guideline|guide)|The CPG)", lines[i]):
        title_lines.append(lines[i]); i += 1
    while i < len(lines) and not lines[i].lower().startswith("contributors"):
        intent_lines.append(lines[i]); i += 1
    title = re.sub(r"\s*\(CPG ID: ?\d+\)", "", " ".join(title_lines)).strip()
    flat = re.sub(r"\s+", " ", full)
    for _, text in RAPID_UPDATES.get(cid, []):
        body = text.replace("Safety statement. ", "")
        if re.sub(r"\s+", " ", body) not in flat:
            raise SystemExit(f"CPG {cid}: rapid update text not found verbatim in {pdf.name}: {body[:60]}...")
    return dict(id=cid, title=title, date=date, pages=pages, intent=clean("\n".join(intent_lines)),
                updates=RAPID_UPDATES.get(cid, []))


def latest(updates):
    from datetime import datetime
    def key(d):
        for fmt in ("%d %b %Y", "%b %Y"):
            try:
                return datetime.strptime(d, fmt)
            except ValueError:
                pass
        return datetime.min
    return max((d for d, _ in updates), key=key)


def ictl_citations():
    """Map CPG ID -> ICTL task numbers that cite it explicitly ('CPG ... ID: n')."""
    cites = {}
    for pdf in sorted(ICTL.glob("*.pdf")):
        m = re.match(TASK_RE, pdf.name)
        if not m:
            continue
        txt = run("pdftotext", str(pdf), "-").replace("\n", " ")
        for grp in re.findall(r"CPG[^.;]{0,40}?ID:? ?(\d+(?:\s?(?:,|and|&)\s?\d+)*)", txt, re.I):
            for n in re.findall(r"\d+", grp):
                cites.setdefault(int(n), set()).add(m.group(0))
    return cites


def main():
    cites = ictl_citations()
    docs = []
    for pdf in sorted(DOCS.glob("*.pdf")):
        c = parse_cpg(pdf)
        pfc = "prolonged field care" in c["title"].lower()
        words = [w for w in re.findall(r"[a-z]+", c["title"].lower()) if len(w) > 3 and w not in {"field", "care", "management", "prolonged", "setting", "during"}]
        related = sorted(cites.get(c["id"], []))
        docs.append(dict(
            id=f"cpg-{c['id']}",
            title=c["title"],
            description=f"JTS CPG ID {c['id']} · Published {c['date']}" + (f" · Rapid update {latest(c['updates'])}" if c["updates"] else ""),
            section=SERIES_PFC if pfc else SERIES_OTHER,
            type=f"CPG {c['id']}",
            url=JTS_LIBRARY,
            urlLabel="JTS CPG library ↗",
            updated=latest(c["updates"]) if c["updates"] else c["date"],
            cpgId=c["id"],
            meta=[["CPG ID", str(c["id"])], ["Publisher", "Joint Trauma System"], ["Published", c["date"]],
                  ["Series", "Prolonged Field Care" if pfc else "Prehospital / Deployed"], ["Length", f"{c['pages']} pages"]],
            details=([{"heading": "Purpose", "text": c["intent"]}] if c["intent"] else [])
                    + ([{"heading": "Rapid updates in this edition", "items": [f"{d}: {t}" for d, t in c["updates"]]}] if c["updates"] else []),
            notice=(f"Published {c['date']}" + (f", with rapid updates through {latest(c['updates'])}" if c["updates"] else "")
                    + f". JTS revises its CPGs. Before relying on this one, find CPG ID {c['id']} in the JTS CPG library and confirm you have the current version."),
            source=f"Joint Trauma System Clinical Practice Guideline, {c['title']} (CPG ID: {c['id']}), {c['date']}.",
            related=[f"ictl/{t.lower()}" for t in related],
            tags=["cpg", "jts", f"cpg {c['id']}", f"cpg{c['id']}", "pfc" if pfc else "prehospital"] + words,
        ))
    docs.sort(key=lambda d: (d["section"] != SERIES_PFC, d["cpgId"]))
    OUT.write_text("/* GENERATED by scripts/build_cpg.py. Do not edit by hand; re-run the script instead. */\n"
                   "window.CPG_DOCUMENTS = " + json.dumps(docs, indent=1, ensure_ascii=False) + ";\n")
    print(f"Wrote {OUT.relative_to(ROOT)}: {len(docs)} CPGs")
    for d in docs:
        print(f"  {d['type']:7} {d['updated']:12} {d['section'][:22]:22} {d['title']}  {('→ ' + ', '.join(d['related'])) if d['related'] else ''}")
        if not d["details"] or len(d["details"][0].get("text", "")) < 60 or len(d["details"][0].get("text", "")) > 500:
            print("    check purpose extraction:", repr(d["details"]))


if __name__ == "__main__":
    main()
