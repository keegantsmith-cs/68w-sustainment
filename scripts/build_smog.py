#!/usr/bin/env python3
"""
Build js/smog.js, an INDEX of the U.S. Army Aeromedical Evacuation Standard
Medical Operating Guidelines (SMOG), FY27 (published 01 Oct 2026), from
docs/smog/FY27_SMOG_part1..3.pdf.

    python3 scripts/build_smog.py

The SMOG has no public-release statement and is written for Critical Care
Flight Paramedics (CCFPs) and en route care, effective only after unit
medical-director and commander endorsement. So the index lists protocols,
medications and procedures with page numbers only. No protocol text or
doses, and the PDFs are not committed.
"""
import json, re, subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs" / "smog"
OUT = ROOT / "js" / "smog.js"
PARTS = [("FY27_SMOG_part1.pdf", 1, 99), ("FY27_SMOG_part2.pdf", 100, 196), ("FY27_SMOG_part3.pdf", 197, 266)]
EDITION = "FY27 (published 01 Oct 2026)"
CATEGORIES = {"GENERAL PROTOCOLS", "TRAUMA PROTOCOLS", "MEDICAL PROTOCOLS", "ALS PROTOCOLS", "PALS PROTOCOLS",
              "SPECIAL POPULATIONS PROTOCOLS", "MWD PROTOCOLS", "MEDICATIONS", "PROCEDURES", "QUICK REFERENCES"}


def run(*a):
    return subprocess.run(a, capture_output=True, text=True, check=True).stdout


def locate(page):
    for fname, lo, hi in PARTS:
        if lo <= page <= hi:
            return fname, page - lo + 1
    raise ValueError(page)


def page_text(page):
    fname, pg = locate(page)
    return run("pdftotext", "-layout", "-f", str(pg), "-l", str(pg), str(DOCS / fname), "-")


def title_case(s):
    keep = {"TBI", "ARDS", "RASS", "IV", "IO", "MASCAL", "ALS", "PALS", "MWD", "CBRN", "TXA", "BIAD", "REBOA", "CC",
            "MEDEVAC", "K9", "ECG", "12-LEAD", "D5W", "MG/ML", "ML", "MARCHE2", "PCS", "RSI", "NG", "OG", "ZOLL", "T1"}
    small = {"and", "or", "of", "the", "for", "to", "in", "on", "with", "a", "via"}
    out = []
    for i, w in enumerate(s.split()):
        core = w.strip("()/:,")
        if core.upper() in keep or re.fullmatch(r"[0-9%./-]+", core):
            out.append(w.upper() if core.upper() in keep else w)
        elif i and w.lower() in small:
            out.append(w.lower())
        else:
            out.append("/".join(p.capitalize() for p in w.lower().split("/")))
    return " ".join(out).replace("Epinepherine", "Epinephrine")


def parse_toc():
    lay = run("pdftotext", "-layout", "-f", "4", "-l", "10", str(DOCS / "FY27_SMOG_part1.pdf"), "-")
    entries, cat = [], None
    for line in lay.splitlines():
        m = re.match(r"^\s*([A-Z0-9][A-Z0-9 /&(),.%’:+-]{2,}?)\s{2,}([0-9]{1,3})\s*$", line)
        if not m:
            continue
        name, page = m.group(1).strip(), int(m.group(2))
        if name in CATEGORIES:
            cat = dict(name=title_case(name), page=page)
            continue
        if cat:
            entries.append(dict(name=name, page=page, cat=cat))
    return entries


def main():
    entries = parse_toc()
    unverified = []
    for e in entries:
        lines = [l.strip() for l in page_text(e["page"]).splitlines() if l.strip()]
        # placement check: the page must print the TOC page number as its footer
        if not lines or lines[-1] != str(e["page"]):
            unverified.append(f"{e['name']} (p. {e['page']})")
        # record the page's own heading when the TOC words it differently
        heading = next((l for l in lines if l != "TABLE OF CONTENTS"), "")
        heading = re.sub(r"\s{2,}.*$", "", heading)
        key = lambda x: re.sub(r"[^A-Z0-9]", "", x.upper())
        e["heading"] = heading if heading and key(heading) not in key(e["name"]) and key(e["name"]) not in key(heading) else ""
    if unverified:
        raise SystemExit("Page number mismatch for: " + "; ".join(unverified))
    notice = ("The SMOG is written for Critical Care Flight Paramedics and en route care, and takes effect only when a unit "
              "medical director and commander endorse it. This hub indexes it but does not reproduce its protocols or doses. "
              "Use your unit's endorsed copy.")
    docs = [dict(
        id="smog-fy27", title="Standard Medical Operating Guidelines (SMOG), FY27",
        description=f"U.S. Army Aeromedical Evacuation · {EDITION} · {len(entries)} protocols, medications and procedures",
        section="SMOG FY27 · Publication", type="SMOG", refOnly=True, set=["smog"], updated="01 Oct 2026",
        meta=[["Publisher", "U.S. Army Aeromedical Evacuation (Department of Aviation Medicine)"], ["Edition", EDITION],
              ["Audience", "Critical Care Flight Paramedics and en route care providers"],
              ["Effective", "On unit medical-director and commander endorsement"], ["Length", "266 pages"]],
        noticeLabel="Reference only.", notice=notice,
        source="U.S. Army Aeromedical Evacuation Standard Medical Operating Guidelines (SMOG), FY27, published 01 Oct 2026.",
        tags=["smog", "aeromedical", "medevac", "flight paramedic", "ccfp", "en route", "protocols"])]
    for e in entries:
        t = title_case(e["name"])
        docs.append(dict(
            id="smog-" + re.sub(r"[^a-z0-9]+", "-", e["name"].lower()).strip("-"),
            title=t, description=f"SMOG FY27 · {e['cat']['name']} · page {e['page']}",
            section=f"SMOG FY27 · {e['cat']['name']}", type="SMOG", refOnly=True, set=["smog"],
            meta=[["Section", e["cat"]["name"]], ["SMOG page", str(e["page"])], ["Edition", EDITION]]
                 + ([["Heading on page", e["heading"]]] if e["heading"] else []),
            noticeLabel="Reference only.", notice=notice,
            source=f"SMOG FY27, {e['cat']['name']}, “{e['name']}”, page {e['page']}.",
            tags=["smog", "aeromedical", e["cat"]["name"].lower()] + [w.lower() for w in re.findall(r"[A-Za-z]{4,}", e["name"])]))
    OUT.write_text("/* GENERATED by scripts/build_smog.py. Do not edit by hand; re-run the script instead. */\n"
                   "window.SMOG_DOCUMENTS = " + json.dumps(docs, indent=1, ensure_ascii=False) + ";\n")
    cats = {}
    for e in entries:
        cats[e["cat"]["name"]] = cats.get(e["cat"]["name"], 0) + 1
    print(f"Wrote {OUT.relative_to(ROOT)}: {len(entries)} entries")
    print("  " + ", ".join(f"{k}={v}" for k, v in cats.items()))
    diff = [f"{e['name']} \u2192 {e['heading']}" for e in entries if e["heading"]]
    print(f"  {len(diff)} entries whose page heading differs from the TOC (shown on the entry)")


if __name__ == "__main__":
    main()
