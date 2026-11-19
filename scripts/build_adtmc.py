#!/usr/bin/env python3
"""
Build js/adtmc.js, an index of MEDCOM Pam 40-7-21, Algorithm-Directed Troop
Medical Care (ADTMC), from the PDFs in docs/adtmc/ (adtmc-part1..3.pdf).

    python3 scripts/build_adtmc.py

The pamphlet has no public-release statement. It is distributed through the
MEDCOM OTSG publications portal (CAC). So this index lists the protocols
(code, title, category, page) and their related ICTL tasks, but does NOT
reproduce protocol text, and the PDFs are not committed.

If the PDFs are later hosted somewhere access-controlled, set ADTMC_BASE_URL
to the folder holding adtmc-part1.pdf etc. Every protocol will then deep-link
to its page.
"""
import json, re, subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs" / "adtmc"
ICTL = ROOT / "docs" / "ictl"
OUT = ROOT / "js" / "adtmc.js"
ADTMC_BASE_URL = ""   # e.g. "https://<access-controlled host>/adtmc/". Leave "" for index-only.
PUB = "MEDCOM Pam 40-7-21, Algorithm-Directed Troop Medical Care, 13 November 2019"
TASK_RE = r"\d{3}-(?:000|68W|LDR)-\d{4}"
PARTS = [("adtmc-part1.pdf", 1, 100), ("adtmc-part2.pdf", 101, 200), ("adtmc-part3.pdf", 201, 292)]


def text(pdf, layout=True, first=None, last=None):
    args = ["pdftotext"] + (["-layout"] if layout else [])
    if first:
        args += ["-f", str(first), "-l", str(last or first)]
    return subprocess.run(args + [str(pdf), "-"], capture_output=True, text=True, check=True).stdout


def locate(page):
    """Pamphlet page number -> (part file, page within that PDF)."""
    for fname, lo, hi in PARTS:
        if lo <= page <= hi:
            return fname, page - lo + 1
    raise ValueError(page)


def title_case(s):
    small = {"and", "or", "of", "the", "for", "to", "in", "on", "not"}
    s = s.rstrip(".").replace("(GI)", "(GI)")
    words = s.lower().split()
    return " ".join(w if (i and w in small) else (w.upper() if w in {"(gi)"} else w.capitalize()) for i, w in enumerate(words))


def parse_contents():
    lay = text(DOCS / "adtmc-part1.pdf")
    block = lay[lay.index("CONTENT\n") if "CONTENT\n" in lay else lay.index("CONTENT"):]
    cats, protos, cur = [], [], None
    for line in block.splitlines():
        s = line.strip()
        if not s or s.startswith(("*MEDCOM", "Page")) or re.fullmatch(r"\d+", s):
            continue
        c = re.match(r"([a-m])\.\s+(.+?)\s*(Page)?$", s)
        if c and c.group(2).isupper():
            cur = dict(letter=c.group(1).upper(), name=title_case(c.group(2)))
            cats.append(cur)
            continue
        p = re.match(r"([A-M]-\d+)\s+(.+?)\s{2,}(\d+)$", s) or re.match(r"([A-M]-\d+)\s+(.+?)$", s)
        if p and cur:
            protos.append(dict(code=p.group(1), title=p.group(2).strip(),
                               page=int(p.group(3)) if p.lastindex == 3 else None, cat=cur))
            continue
        if protos and protos[-1]["cat"] is cur:          # wrapped title line, e.g. J-3, J-8, K-1
            w = re.match(r"(.+?)\s{2,}(\d+)$", s)
            protos[-1]["title"] += " " + (w.group(1) if w else s).strip()
            if w:
                protos[-1]["page"] = int(w.group(2))
        if protos and protos[-1]["code"] == "M-2" and protos[-1]["page"]:
            break
    return cats, protos


def parse_appendices():
    lay = text(DOCS / "adtmc-part1.pdf", first=1, last=3)
    apps = []
    for m in re.finditer(r"^\s*(Appendix ([A-H])\.\s+(.+?)|Glossary)\s{2,}(\d+)\s*$", lay, re.M):
        apps.append(dict(code=m.group(2) or "Glossary", title=(m.group(3) or "Glossary").strip(), page=int(m.group(4))))
    return apps


def verify_pages(protos):
    """Each protocol's page should carry its heading, e.g. 'SORE THROAT/HOARSENESS, A-1'."""
    bad = []
    for p in protos:
        fname, pg = locate(p["page"])
        t = text(DOCS / fname, first=pg, last=pg + 1)
        if not re.search(rf",\s*{re.escape(p['code'])}\b", t):
            bad.append(f"{p['code']} (page {p['page']})")
    return bad


def ictl_links(codes):
    links = {}
    for pdf in sorted(ICTL.glob("*.pdf")):
        m = re.match(TASK_RE, pdf.name)
        if not m:
            continue
        t = text(pdf, layout=False).replace("\n", " ")
        if not re.search(r"40-7-21|ADTMC", t):
            continue
        for code in set(re.findall(r"\b([A-M]-\d{1,2})\b", t)) & codes:
            links.setdefault(code, set()).add(m.group(0).lower())
    return links


def main():
    cats, protos = parse_contents()
    apps = parse_appendices()
    missing = [p["code"] for p in protos if not p["page"]]
    if missing:
        raise SystemExit(f"No page number parsed for: {missing}")
    bad = verify_pages(protos)
    links = ictl_links({p["code"] for p in protos})

    def access(page):
        if not ADTMC_BASE_URL:
            return {}
        fname, pg = locate(page)
        return {"url": f"{ADTMC_BASE_URL}{fname}#page={pg}", "urlLabel": f"Open page {page} ↗"}

    notice = ("The ADTMC is distributed through the MEDCOM OTSG publications portal (CAC required). This hub indexes its "
              "protocols but does not reproduce them. Use your unit's copy, and confirm it is the current edition.")
    docs = [dict(
        id="adtmc-pam-40-7-21", title="MEDCOM Pam 40-7-21: Algorithm-Directed Troop Medical Care",
        description=f"13 November 2019 · 292 pages · {len(protos)} screening protocols in {len(cats)} categories",
        section="Publication & Appendices", type="PAM", updated="13 Nov 2019", refOnly=True,
        meta=[["Publication", "MEDCOM Pam 40-7-21"], ["Date", "13 November 2019"], ["Supersedes", "MEDCOM Pam 40-7-21, 23 June 2006"],
              ["Length", "292 pages"], ["Protocols", f"{len(protos)} in {len(cats)} categories"]],
        notice=notice, noticeLabel="Reference only.", source=PUB + ".", tags=["adtmc", "40-7-21", "sick call", "screening", "protocols"],
        **access(1))]
    for a in apps:
        docs.append(dict(
            id=f"adtmc-app-{a['code'].lower()}", title=(f"Appendix {a['code']}. " if a["code"] != "Glossary" else "") + a["title"],
            description=f"Begins on page {a['page']}", section="Publication & Appendices",
            type=f"APP {a['code']}" if a["code"] != "Glossary" else "GLOSS", refOnly=True,
            meta=[["Publication", "MEDCOM Pam 40-7-21"], ["Page", str(a["page"])]],
            notice=notice, noticeLabel="Reference only.", source=PUB + f", page {a['page']}.", tags=["adtmc", "appendix", a["title"].lower()], **access(a["page"])))
    for p in protos:
        cat = p["cat"]
        docs.append(dict(
            id=f"adtmc-{p['code'].lower()}", title=f"{p['code']} {p['title']}",
            description=f"{cat['name']} · Screener's Manual, page {p['page']}",
            section=f"{cat['letter']}. {cat['name']}", type=p["code"], refOnly=True,
            meta=[["Protocol", p["code"]], ["Category", f"{cat['letter']}. {cat['name']}"],
                  ["Pamphlet page", str(p["page"])], ["Publication", "MEDCOM Pam 40-7-21 (13 Nov 2019)"]],
            notice=notice, noticeLabel="Reference only.", source=PUB + f", Appendix B (Screener's Manual), protocol {p['code']}, page {p['page']}.",
            related=[f"ictl/{t}" for t in sorted(links.get(p["code"], []))],
            tags=["adtmc", "sick call", "screening", p["code"].lower(), cat["name"].lower()] +
                 [w for w in re.findall(r"[a-z]+", p["title"].lower()) if len(w) > 3],
            **access(p["page"])))

    docs.sort(key=lambda d: d["section"] == "Publication & Appendices")   # protocols first
    OUT.write_text("/* GENERATED by scripts/build_adtmc.py. Do not edit by hand; re-run the script instead. */\n"
                   "window.ADTMC_DOCUMENTS = " + json.dumps(docs, indent=1, ensure_ascii=False) + ";\n")
    print(f"Wrote {OUT.relative_to(ROOT)}: {len(protos)} protocols in {len(cats)} categories, {len(apps)} appendices")
    print("  categories:", ", ".join(f"{c['letter']}={sum(1 for p in protos if p['cat'] is c)}" for c in cats))
    print("  ICTL links:", sum(len(v) for v in links.values()), "across", len(links), "protocols")
    if bad:
        print("  WARNING page heading not found for:", ", ".join(bad))


if __name__ == "__main__":
    main()
