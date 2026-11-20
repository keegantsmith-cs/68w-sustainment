#!/usr/bin/env python3
"""
Build js/tccc.js from reviewed TCCC Guidelines summaries.

    python3 scripts/build_tccc.py

Input:  content/tccc/tccc-sections.json (content-curator -> clinical-reviewer -> fixes)
Source: docs/guidelines/TCCC_Guidelines_May_2026.pdf (not committed)

Every quote is re-verified against its PDF page. The build fails if a quote is
not on its page, ends mid-phrase, or if a number in an item's text is missing
from that item's quote.
"""
import json, re, subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "content" / "tccc" / "tccc-sections.json"
PDF = ROOT / "docs" / "guidelines" / "TCCC_Guidelines_May_2026.pdf"
OUT = ROOT / "js" / "tccc.js"
EDITION = "01 May 2026"
NAMES = (r"(SpO2|EtCO2|ETCO2|PaCO2|FiO2|DD ?Form ?\d+|DD ?\d+|NDC|CoTCCC|TCCC|CWMP|"
         r"\(\d+[a-z]?\)|Section ?\(?\d+[a-z]?\)?|[Ss]ections? \d+(?:[a-z]| and \d+)?|pp?\. ?\d+(?:–\d+)?|\b(?:19|20)\d{2}\b|"
         r"\d{1,2} \w{3} \d{4}|O2|CO2|K9|Phase \d)")
_pages = {}


def page(n):
    if n not in _pages:
        t = subprocess.run(["pdftotext", "-layout", "-f", str(n), "-l", str(n), str(PDF), "-"],
                           capture_output=True, text=True, check=True).stdout
        _pages[n] = re.sub(r"\s+", " ", t)
    return _pages[n]


def norm(t):
    return re.sub(r"\s+", " ", t).strip()


def check(item, where):
    q = item.get("quote")
    if q:
        if norm(q) not in page(item["page"]):
            raise SystemExit(f"{where}: quote not found on page {item['page']}: {q[:70]}")
        if re.search(r"\b(of|to|at|a|an|the|than|target|by|is|be|from|with|and|or)[\s,]*$", norm(q), re.I):
            raise SystemExit(f"{where}: quote ends mid-phrase: ...{q[-40:]}")
    loose = [n for n in re.findall(r"\d+(?:\.\d+)?", re.sub(NAMES, "", item["text"])) if n not in (q or "")]
    if loose:
        raise SystemExit(f"{where}: number(s) {loose} in text not backed by its quote: {item['text'][:80]}")


def display(q):
    """Display-only cleanup of PDF artifacts inside a verified quote (verification uses the raw quote)."""
    q = re.sub(r"\s+[−§•]\s+", " · ", q)   # list bullet glyphs -> middle dot
    return re.sub(r"(?<=[a-z])- (?=[a-z])", "-", q)                       # "extended- release" line-break artifact


def fmt(item):
    return item["text"] + (f" “{display(item['quote'])}”" if item.get("quote") else "") + f" (p. {item['page']})"


def main():
    data = json.loads(SRC.read_text())
    secs = data["sections"]
    by_id = {s["id"]: s for s in secs}
    docs, changed = [], 0
    for s in secs:
        for i, kp in enumerate(s.get("keyPoints", [])):
            check(kp, f"{s['id']} keyPoints[{i}]")
        for i, kp in enumerate(s.get("newIn2026", [])):
            check(kp, f"{s['id']} newIn2026[{i}]")
        if re.search(r"\d", re.sub(NAMES, "", s.get("summary", ""))):
            raise SystemExit(f"{s['id']}: summary contains a number")
        changed += bool(s.get("changed2026"))
        details = [{"heading": "Summary", "text": s["summary"]}] if s.get("summary") else []
        related = []
        if s.get("sameAs"):
            ref = by_id.get(s["sameAs"])
            details.append({"heading": "Same as Tactical Field Care",
                            "text": f"This TACEVAC section is the same as Tactical Field Care: {ref['title'] if ref else s['sameAs']}."})
            related.append(f"guidelines/tccc-{s['sameAs']}")
        if s.get("newIn2026"):
            details.append({"heading": "New in 2026", "items": [fmt(x) for x in s["newIn2026"]]})
        if s.get("keyPoints"):
            details.append({"heading": "Key points", "items": [fmt(x) for x in s["keyPoints"]]})
        num = f"{s['number']}. " if s.get("number") else ""
        docs.append(dict(
            id=f"tccc-{s['id']}", title=f"{num}{s['title']}",
            description=f"TCCC {EDITION} · {s['phase']}" + (" · Updated in 2026" if s.get("changed2026") else "")
                        + (" · Same as TFC" if s.get("sameAs") else ""),
            section=f"TCCC 2026 · {s['phase']}", type="NEW" if s.get("changed2026") else "TCCC", set=["tccc"],
            updated=EDITION, refOnly=True,
            meta=[["Phase", s["phase"]], ["Section", f"{s.get('number') or '—'}: {s['title']}"],
                  ["Pages", ", ".join(str(p) for p in s.get("pages", []))], ["Edition", f"TCCC Guidelines, {EDITION}"]],
            details=details, related=related,
            file=f"docs/guidelines/TCCC_Guidelines_May_2026.pdf#page={s['pages'][0]}" if s.get("pages") else None,
            noticeLabel="Summary.",
            notice=("Plain-language summary of the TCCC Guidelines with exact quotes for every number. Follow the "
                    "guidelines themselves, your skill level (ASM / CLS / CMC / CPP), unit SOP and medical direction."),
            source=f"Tactical Combat Casualty Care (TCCC) Guidelines, {EDITION}, " + ", ".join(f"p. {p}" for p in s.get("pages", [])) + ".",
            tags=["tccc", "2026", s["phase"].lower(), s["title"].lower()] + (["new in 2026", "changed"] if s.get("changed2026") else [])))
    overview = dict(
        id="tccc-2026", title="Tactical Combat Casualty Care (TCCC) Guidelines, 01 May 2026",
        description=f"{len(secs)} sections · {changed} updated in 2026 · Care Under Fire, Tactical Field Care, TACEVAC",
        section="TCCC 2026 · Overview", type="TCCC", set=["tccc"], updated=EDITION, refOnly=True,
        file="docs/guidelines/TCCC_Guidelines_May_2026.pdf",
        meta=[["Edition", EDITION], ["Sections", str(len(secs))], ["Updated in 2026", str(changed)]],
        details=[{"heading": "Updated in 2026", "items": [d["title"] + f" ({d['description'].split(' · ')[1]})" for d in docs if d["type"] == "NEW"]}]
                + ([{"heading": "Notes on this edition", "items": data["editionNotes"]}] if data.get("editionNotes") else []),
        related=[f"guidelines/{d['id']}" for d in docs if d["type"] == "NEW"],
        noticeLabel="Summary.", notice="Section summaries are linked below. Sections marked NEW contain text added in the 2026 update.",
        source=f"Tactical Combat Casualty Care (TCCC) Guidelines, {EDITION}.", tags=["tccc", "2026", "guidelines", "what's new"])
    OUT.write_text("/* GENERATED by scripts/build_tccc.py. Do not edit by hand; re-run the script instead. */\n"
                   "window.TCCC_DOCUMENTS = " + json.dumps([overview] + docs, indent=1, ensure_ascii=False) + ";\n")
    print(f"Wrote {OUT.relative_to(ROOT)}: {len(secs)} sections ({changed} updated in 2026), "
          f"{sum(len(s.get('keyPoints', [])) + len(s.get('newIn2026', [])) for s in secs)} items, all quotes verified")


if __name__ == "__main__":
    main()
