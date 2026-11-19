#!/usr/bin/env python3
"""
Build js/ictl.js from the ICTL PDFs in docs/ictl/.

    python3 scripts/build_ictl.py

Needs `pdftotext` (poppler-utils). Run it again whenever you add or replace
an ICTL PDF. The master list (68W_Combat_Medic_Specialist_Final_ICTL.pdf)
decides which tasks exist and how they're grouped. Each task's own PDF
supplies its official title, report date, conditions and standards.
Text is copied verbatim from the source documents (Distribution A).
"""
import json, re, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs" / "ictl"
OUT = ROOT / "js" / "ictl.js"
MASTER = "68W_Combat_Medic_Specialist_Final_ICTL.pdf"
TASK_RE = r"\d{3}-(?:000|68W|LDR)-\d{4}"


def text(pdf, layout=False):
    args = ["pdftotext"] + (["-layout"] if layout else []) + [str(pdf), "-"]
    return subprocess.run(args, capture_output=True, text=True, check=True).stdout


def clean_para(s):
    s = re.sub(r"-\n(?=[a-z])", "-", s)          # "high-\nstress" -> "high-stress"
    s = re.sub(r"\s*\n\s*", " ", s)
    s = re.sub(r"\s{2,}", " ", s)
    return s.strip()


def between(raw, start, ends):
    m = re.search(start + r"\s*(.*?)\s*(?:" + "|".join(ends) + ")", raw, re.S)
    return clean_para(m.group(1)) if m else ""


def parse_master():
    tasks, area = [], None
    for line in text(DOCS / MASTER, layout=True).splitlines():
        a = re.match(r"\s*Subject Area:\s*(.+)", line)
        if a:
            area = a.group(1).strip()
            continue
        m = re.match(rf"\s*({TASK_RE})\s+(.+?)\s{{2,}}(\d)\s+(Operational|Institutional|Self-Development)\s+(\w+)\s+(\d-\d)\s*$", line)
        if m:
            num, title, sl, loc, freq, sust = m.groups()
            tasks.append(dict(num=num, title=title.strip(), sl=int(sl), location=loc,
                              freq=freq, sust=sust, area=area))
    return tasks


def parse_task(pdf):
    raw = text(pdf)
    lay = text(pdf, layout=True)
    head = [l.strip() for l in lay.splitlines()[:15] if l.strip()]
    num_i = next(i for i, l in enumerate(head) if re.fullmatch(TASK_RE, l))
    return dict(
        title=head[num_i + 1],
        report=(re.search(r"Report Date:\s*(\d{1,2} \w{3} \d{4})", lay) or [None, ""])[1],
        status=(re.search(r"Status:\s*(\w+)", lay) or [None, ""])[1],
        public="approved for public release" in raw.lower(),
        conditions=between(raw, r"Conditions:", [r"Standards:"]),
        standards=between(raw, r"Standards:", [r"Special Conditions:", r"Special Standards:", r"Safety Risk:"]),
        pages=int(re.search(r"Pages:\s+(\d+)", subprocess.run(["pdfinfo", str(pdf)], capture_output=True, text=True).stdout).group(1)),
    )


def list_meta(pdf):
    raw = text(pdf)
    n = re.search(r"Total Number of Tasks:\s*(\d+)", raw)
    eff = re.search(r"Effective Date:\s*(\d{1,2} \w{3} \d{4})", raw)
    return (int(n.group(1)) if n else None), (eff.group(1) if eff else "")


def main():
    master = parse_master()
    if not master:
        sys.exit("Could not parse the master ICTL.")
    files = {re.match(TASK_RE, p.name).group(0): p for p in DOCS.glob("*.pdf") if re.match(TASK_RE, p.name)}

    docs, problems = [], []

    # Task lists first
    lists = [(MASTER, "master", "68W Final Individual Critical Task List",
              "All 68W critical tasks, grouped by subject area, with skill level, training location and sustainment frequency.", [1, 2, 3, 4, 5])]
    for sl in (1, 2, 3, 4):
        lists.append((f"68W_ICTL_SL{sl}.pdf", f"sl{sl}", f"68W ICTL: Skill Level {sl}", None, [sl]))
    for fname, key, title, desc, levels in lists:
        p = DOCS / fname
        if not p.exists():
            problems.append(f"missing list {fname}")
            continue
        n, eff = list_meta(p)
        docs.append(dict(
            id=f"ictl-list-{key}", title=title,
            description=desc or f"Tasks Soldiers are trained on at Skill Level {levels[0]}" + (f" ({n} tasks)." if n else "."),
            section="Task Lists", type="LIST", file=f"docs/ictl/{fname}",
            updated=eff, levels=levels, tags=["ictl", "task list", f"sl{levels[0]}" if len(levels) == 1 else "master"],
        ))

    for t in master:
        p = files.get(t["num"])
        info = parse_task(p) if p else {}
        if p and not info.get("public"):
            problems.append(f"{t['num']}: no public-release statement, not linked")
            p = None
        if not p:
            problems.append(f"{t['num']}: no PDF yet")
        levels = list(range(int(t["sust"][0]), int(t["sust"][-1]) + 1))
        meta = [["Task number", t["num"]], ["Skill level", f"SL{t['sl']}"],
                ["Subject area", t["area"]], ["Initial training", t["location"]],
                ["Sustainment frequency", t["freq"]], ["Sustainment skill levels", f"SL{t['sust'].replace('-', '–SL')}"]]
        details = []
        if info.get("conditions"):
            details.append({"heading": "Conditions", "text": info["conditions"]})
        if info.get("standards"):
            details.append({"heading": "Standards", "text": info["standards"]})
        title = info.get("title") or t["title"]
        docs.append(dict(
            id=t["num"].lower(), title=f"{t['num']} {title}",
            description=f"SL{t['sl']} · {t['location']} · Sustain {t['freq'].lower()} (SL{t['sust'].replace('-', '–')})",
            section=t["area"], type=f"SL{t['sl']}",
            file=f"docs/ictl/{p.name}" if p else None,
            updated=info.get("report", ""), levels=levels, meta=meta, details=details,
            source=f"{t['num']}, {title}. US Army MEDCoE individual task" + (f", report date {info['report']}" if info.get("report") else "") + ". Distribution A.",
            tags=["ictl", t["area"].lower(), t["freq"].lower(), t["location"].lower()] + [f"sl{l}" for l in levels],
        ))

    for d in docs:
        if d.get("file") is None:
            d.pop("file", None)

    js = ("/* GENERATED by scripts/build_ictl.py. Do not edit by hand; re-run the script instead. */\n"
          "window.ICTL_DOCUMENTS = " + json.dumps(docs, indent=1, ensure_ascii=False) + ";\n")
    OUT.write_text(js)
    tasks = [d for d in docs if d["type"].startswith("SL")]
    print(f"Wrote {OUT.relative_to(ROOT)}: {len(tasks)} tasks ({sum(1 for d in tasks if d.get('file'))} with PDFs), "
          f"{len(docs) - len(tasks)} lists.")
    for pr in problems:
        print("  note:", pr)
    for d in tasks:
        if d.get("file") and (len(d["details"]) < 2 or any(len(x["text"]) < 40 for x in d["details"])):
            print("  check extraction:", d["id"])


if __name__ == "__main__":
    main()
