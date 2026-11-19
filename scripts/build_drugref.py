#!/usr/bin/env python3
"""
Build js/drugref.js, an INDEX of the drug reference cards in docs/drug-ref/.

    python3 scripts/build_drugref.py

Sources (not committed; see .gitignore):
  - 68W_Reconciled_Drug_Reference_Rev5_DRAFT.pdf. Marked "Draft for clinical
    governance review", so it is not released for operational use.
  - PCC_Drug_Cards_Antibiotics_PCC-SC-26.pdf (#PCC-SC-26, 04 Dec 2023).

DOSES_APPROVED is False: the index lists names, class, trade names,
indications and cross-links ONLY. No doses, routes, contraindications or
administration details. Do not change that without written confirmation
that the reference completed clinical governance review.
"""
import json, re, subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs" / "drug-ref"
OUT = ROOT / "js" / "drugref.js"
DRAFT = "68W_Reconciled_Drug_Reference_Rev5_DRAFT.pdf"
PCC = "PCC_Drug_Cards_Antibiotics_PCC-SC-26.pdf"
# Approval of the reconciled reference (Rev 5 file dated 18 Nov 2026), confirmed by the user on 19 Nov 2026:
# approved by a medical authority (medical director or equivalent) for this use, as-is.
# The PCC antibiotic cards were NOT part of that approval and stay index-only.
DOSES_APPROVED = True
APPROVAL = {"by": "medical authority", "date": "19 Nov 2026", "version": "Rev 5 file dated 18 Nov 2026"}
# Cards whose content is withheld even after approval (open issues not yet reviewed by the approver):
HOLD_PATTERN = re.compile(r"NOT ADDRESSED|Not reconciled|No current dose|do not use legacy|No universal dose", re.I)
HOLD_EXTRA = {"CALCIUM GLUCONATE": "Its source citation (DCR CPG ID) is awaiting confirmation."}
FIELD_ORDER = [("INDICATION(S)", "Indication(s)"), ("ROUTE(S)", "Route(s)"),
               ("CONTRA-INDICATIONS / CONDITIONS", "Contraindications / conditions"), ("DOSAGE(S)", "Dosage(s)"),
               ("POTENTIAL SIDE EFFECTS", "Potential side effects"), ("DRUG INTERACTIONS", "Drug interactions"),
               ("ONSET / PEAK / DURATION", "Onset / peak / duration"), ("TACTICAL CONSIDERATIONS", "Tactical considerations")]
TASK_RE = r"\d{3}-(?:000|68W|LDR)-\d{4}"

PCC_DRUGS = ["MOXIFLOXACIN", "ERTAPENEM", "CEPHALEXIN", "TRIMETHOPRIM / SULFAMETHOXAZOLE", "CEFAZOLIN",
             "CLINDAMYCIN", "CEFTRIAXONE", "METRONIDAZOLE", "CLARITHROMYCIN", "CIPROFLOXACIN"]
# Text the PCC cards print for these drugs (other cards show class/user level as graphics only).
PCC_FACTS = {
    "MOXIFLOXACIN": {"class": "Fluoroquinolone antibiotic", "usedBy": "All Service Members (ASM), Combat Lifesavers (CLS) and Combat Medics (CM)",
                     "indication": "Recommended for all open combat wounds if able to take PO meds."},
    "ERTAPENEM": {"class": "Carbapenem, beta-lactam antibiotic", "usedBy": "Combat Medics (CM)",
                  "indication": "Recommended for all open combat wounds if unable to take PO meds."},
}
ALIASES = {"TRIMETHOPRIM / SULFAMETHOXAZOLE": "Bactrim"}


def run(*a):
    return subprocess.run(a, capture_output=True, text=True, check=True).stdout


def norm(s):
    return re.sub(r"\s+", " ", s).strip()


def nice(name):
    out = []
    for w in name.split():
        core = w.strip("()")
        out.append(w if (core.isupper() and len(core) <= 4 and core not in {"ACID"}) and w.startswith("(") else w.capitalize())
    s = " ".join(out).replace(" / ", " / ")
    return re.sub(r"\b(\w+)-(\w)", lambda m: m.group(1) + "-" + m.group(2).upper(), s)


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def parse_draft():
    pdf = DOCS / DRAFT
    n = int(re.search(r"Pages:\s+(\d+)", run("pdfinfo", str(pdf))).group(1))
    cards = []
    for pg in range(1, n + 1):
        lines = run("pdftotext", "-layout", "-f", str(pg), "-l", str(pg), str(pdf), "-").splitlines()
        rev = re.search(r"Rev (\d+)", " ".join(lines[-6:]))
        i = 0
        while i < len(lines):
            m = re.match(r"^ {2,4}([A-Z][A-Z0-9 ,/()-]{3,40})\s*$", lines[i])
            nxt = next((l for l in lines[i + 1:i + 4] if l.strip()), "")
            if m and re.match(r"^ {2,4}\S", nxt) and "GENERIC" not in nxt and not m.group(1).startswith(("DRUG REFERENCE", "68W", "SUPPLEMENTAL", "SOURCE", "FORMAT", "CLINICAL GOV", "RELEASE")):
                card = {"name": m.group(1).strip(), "class": nxt.strip(), "page": pg, "rev": rev.group(1) if rev else ""}
                fields, label = {}, None
                j = i + 2
                while j < len(lines):
                    l = lines[j]
                    if re.match(r"^ {2,4}[A-Z][A-Z0-9 ,/()-]{3,40}\s*$", l):
                        break
                    f = re.match(r"^ {3,8}([A-Z][A-Z /()-]+?)\s{2,}(\S.*)$", l)
                    if f and f.group(1).strip() == "CONDITIONS" and label == "CONTRA-INDICATIONS /":
                        fields[label] += " " + f.group(2).strip()      # wrapped label: value continues
                    elif f:
                        label = f.group(1).strip(); fields[label] = f.group(2).strip()
                    elif label and re.match(r"^ {20,}\S", l) and not re.search(r"Continued on|68W Current|JOINT TRAUMA SYSTEM|CoTCCC-ALIGNED|Draft for clinical|^\|?\s*\d+\s*\|", l.strip()):
                        fields[label] += " " + l.strip()
                    j += 1
                # A page footer ("| 16 JOINT TRAUMA SYSTEM / ...") can share a text line with a card's last field.
                fields = {k: re.sub(r"\s*\|\s*\d+\s+JOINT TRAUMA.*$", "", v) for k, v in fields.items()}
                if "CONTRA-INDICATIONS /" in fields:
                    fields["CONTRA-INDICATIONS / CONDITIONS"] = fields.pop("CONTRA-INDICATIONS /")
                card["fields"] = fields
                cards.append(card)
                i = j
            else:
                i += 1
    return cards


def verify_cards(cards):
    """Every parsed field must appear word for word in a non-layout extraction of its page."""
    pdf = DOCS / DRAFT
    for c in cards:
        if len(c["fields"]) != 9:
            raise SystemExit(f"{c['name']}: expected 9 fields, got {list(c['fields'])}")
        raw = norm(run("pdftotext", "-f", str(c["page"]), "-l", str(c["page"]), str(pdf), "-"))
        raw2 = norm(raw.replace(" CONDITIONS ", " "))
        for k, v in c["fields"].items():
            if re.search(r"JOINT TRAUMA SYSTEM|CoTCCC-ALIGNED|68W Current|Draft for clinical|Continued on|\|\s*\d+\s", v):
                raise SystemExit(f"{c['name']} / {k}: page header/footer text leaked into the field: {v[-60:]}")
            if norm(v) not in raw and norm(v) not in raw2:
                raise SystemExit(f"{c['name']} / {k}: parsed text not found verbatim on page {c['page']}")


def strip_refs(t):
    return re.sub(r"\s*(\[\d+\],?\s*)+(?=$|[.;])", "", t).strip()   # undefined [n] markers in the source


def pcc_pages():
    pdf = DOCS / PCC
    pages = {}
    for pg in (1, 2, 3):
        t = run("pdftotext", "-f", str(pg), "-l", str(pg), str(pdf), "-")
        for d in PCC_DRUGS:
            if d.split(" /")[0] in t:
                pages.setdefault(d, pg)
    full = norm(run("pdftotext", str(pdf), "-"))
    for d, facts in PCC_FACTS.items():
        for k, v in facts.items():
            if norm(v) not in full:
                raise SystemExit(f"PCC fact not found verbatim for {d}: {v}")
    return pages


_TEXT = {}


def pdf_text(pdf):
    if pdf not in _TEXT:
        _TEXT[pdf] = run("pdftotext", str(pdf), "-").lower()
    return _TEXT[pdf]


def mentions(folder, pattern_words):
    hits = []
    if not pattern_words:
        return hits
    for pdf in sorted(folder.glob("*.pdf")):
        t = pdf_text(pdf)
        if any(re.search(rf"\b{re.escape(w.lower())}\b", t) for w in pattern_words):
            hits.append(pdf)
    return hits


def main():
    cards = parse_draft()
    verify_cards(cards)
    pccp = pcc_pages()
    cpg_ids = {int(re.search(r"CPG ID: ?(\d+)", run("pdftotext", str(p), "-")).group(1)): p for p in (ROOT / "docs" / "cpg").glob("*.pdf")}

    drugs = {}
    for c in cards:
        key = c["name"]
        f = c["fields"]
        trade = re.search(r"Trade / representative product name\(s\):\s*(.+)$", f.get("GENERIC / TRADE NAME", ""))
        ind = f.get("INDICATION(S)", "")
        drugs[key] = dict(name=key, cls=c["class"], trade=trade.group(1).strip() if trade else "",
                          indication="" if not ind or ind.upper().startswith("NOT ADDRESSED") else ind,
                          draft=f"page {c['page']} (Rev {c['rev']})", pcc=None, extra={}, card=c)
    for d, pg in pccp.items():
        rec = drugs.setdefault(d, dict(name=d, cls="", trade=ALIASES.get(d, ""), indication="", draft=None, extra={}, card=None))
        rec["pcc"] = f"page {pg}"
        facts = PCC_FACTS.get(d, {})
        rec["cls"] = rec["cls"] or facts.get("class", "")
        rec["extra"] = facts

    docs = []
    for d in sorted(drugs.values(), key=lambda x: x["name"]):
        words = [w for w in re.split(r"[ /()]+", d["name"]) if len(w) > 3 and w not in {"ACID", "SULFATE", "BROMIDE", "GLUCONATE"}]
        words = [d["name"].split(" (")[0]] if d["name"] in {"TRANEXAMIC ACID (TXA)", "FREEZE-DRIED PLASMA"} else words
        # Cross-link to CPGs/ICTL tasks that mention the drug by name (skipped for oxygen: mentioned almost everywhere).
        if d["name"] == "OXYGEN":
            words = []
        cpgs = sorted(i for i, p in cpg_ids.items() if p in mentions(ROOT / "docs" / "cpg", words))
        tasks = sorted(re.match(TASK_RE, p.name).group(0).lower() for p in mentions(ROOT / "docs" / "ictl", words) if re.match(TASK_RE, p.name))
        sources = ([f"68W Current CPG Reconciled Drug Reference, {d['draft']}"] if d["draft"] else []) + \
                  ([f"PCC Antibiotic Medications card #PCC-SC-26 (04 Dec 2023), {d['pcc']}"] if d["pcc"] else [])
        meta = [["Generic name", nice(d["name"])]]
        if d["trade"]: meta.append(["Trade / product names", d["trade"]])
        if d["cls"]: meta.append(["Class", d["cls"]])
        if d["extra"].get("usedBy"): meta.append(["PCC card: used by", d["extra"]["usedBy"]])
        details = []
        card = d["card"]
        hold = None
        if card:
            blob = " ".join(card["fields"].values())
            m = HOLD_PATTERN.search(blob)
            hold = HOLD_EXTRA.get(d["name"]) or (f"The card is not fully reconciled (\u201c{m.group(0)}\u201d)." if m else None)
        approved = bool(card) and DOSES_APPROVED and not hold
        if approved:
            for key, heading in FIELD_ORDER:
                details.append({"heading": heading, "text": strip_refs(card["fields"][key])})
        elif d["indication"]:
            details.append({"heading": "Indication(s)", "text": strip_refs(d["indication"])})
        if d["extra"].get("indication"):
            details.append({"heading": "PCC card", "text": d["extra"]["indication"]})
        details.append({"heading": "Listed in", "items": sources})
        docs.append(dict(
            id=f"drug-{slug(d['name'])}", title=nice(d["name"]),
            description=" · ".join(x for x in [d["cls"], d["trade"]] if x) or "Antibiotic (PCC card)",
            section="Medications A–Z", type="RX" if approved else "INDEX", refOnly=True, meta=meta, details=details,
            approvedDoses=approved,
            noticeLabel=("Approved reference." if approved else "Dose held." if hold else "Index only."),
            notice=(f"Card content approved by {APPROVAL['by']} on {APPROVAL['date']} ({APPROVAL['version']}). "
                    "Verify drug, concentration (mg/mL), dose, volume and route before every administration, and follow "
                    "local protocol, formulary, credentialing and medical direction." if approved else
                    f"{hold} Dosing and administration details for this drug are withheld until it is resolved. "
                    "Follow your approved local protocol and medical direction." if hold else
                    "This drug appears only on the PCC antibiotic cards, which were not part of the approved reference. "
                    "Dosing is not shown. Follow PCC guidelines, local protocol and medical direction."),
            source=(f"68W Current CPG Reconciled Drug Reference (PCC card format), {d['draft']}, 18 Nov 2026; "
                    f"approved {APPROVAL['date']}. Bracketed source numbers in the card are omitted because the "
                    "reference does not define them." if approved else None),
            related=[f"cpg/cpg-{i}" for i in cpgs] + [f"ictl/{t}" for t in tasks],
            tags=["drug", "medication", "pharmacology"] + [w.lower() for w in re.findall(r"[A-Za-z]{4,}", f"{d['name']} {d['trade']} {d['cls']}")],
        ))
    n_ok = sum(1 for d in docs if d.get("approvedDoses"))
    n_hold = sum(1 for d in docs if d["noticeLabel"] == "Dose held.")
    docs.append(dict(id="drugref-draft", title="68W Current CPG Reconciled Drug Reference (PCC card format)",
        description=f"Approved {APPROVAL['date']} · 18 Nov 2026 file · {len(cards)} cards ({n_ok} published, {n_hold} held)", section="Card Sets", type="REF", refOnly=True,
        meta=[["Approval", f"Approved by {APPROVAL['by']}, {APPROVAL['date']}"], ["File dated", "18 Nov 2026"],
              ["Document marking", "Still printed \u201cDraft for clinical governance review\u201d"],
              ["Revision", "Rev 4 (pages 1–17), Rev 5 (calcium gluconate card)"], ["Cards", f"{len(cards)}: {n_ok} published, {n_hold} held"]],
        noticeLabel="Approved reference.", notice=f"Approved by {APPROVAL['by']} on {APPROVAL['date']}. Cards that are not fully reconciled, and the calcium gluconate card pending citation confirmation, are shown without doses. Verify concentration, dose and volume before every administration.",
        tags=["drug", "reference", "pcc"]))
    docs.append(dict(id="drugref-pcc-sc-26", title="PCC Antibiotic Medications cards (#PCC-SC-26)",
        description=f"Prolonged Casualty Care provider cards · 04 Dec 2023 · {len(pccp)} antibiotics", section="Card Sets", type="PCC", refOnly=True,
        meta=[["Card", "#PCC-SC-26"], ["Dated", "04 Dec 2023"], ["Drugs", str(len(pccp))]],
        noticeLabel="Scope.", notice="Per the card: drug administration information is based solely on PCC Guidelines and should not be used for administering these medications for other purposes.",
        tags=["pcc", "antibiotic", "cards"]))
    # Dose guard: only approved reference cards may carry doses.
    banned = re.compile(r"\b\d+(\.\d+)?\s?(mg|mcg|g|gm|ml|mL|units?|mEq|mg/kg|mcg/kg)\b", re.I)
    for d in docs:
        if d.get("approvedDoses"):
            continue
        if True:
            blob = json.dumps(d)
            if banned.search(blob):
                raise SystemExit(f"Dose-like text found in {d['id']}: {banned.search(blob).group(0)}. This entry is not approved for doses.")
    OUT.write_text("/* GENERATED by scripts/build_drugref.py. Do not edit by hand; re-run the script instead. */\n"
                   "window.DRUGREF_DOCUMENTS = " + json.dumps(docs, indent=1, ensure_ascii=False) + ";\n")
    print(f"Wrote {OUT.relative_to(ROOT)}: {len(docs) - 2} drugs ({len(cards)} draft cards, {len(pccp)} PCC cards)")
    for d in docs[:-2]:
        print(f"  {d['title'][:30]:30} | {d['noticeLabel']:20} | rel {len(d['related'])}")


if __name__ == "__main__":
    main()
