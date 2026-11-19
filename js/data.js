/*
 * 68W Sustainment — content file
 * ------------------------------------------------------------------
 * This is the ONLY file you need to edit to add content.
 *
 * Each resource below is one card on the home page. To add a document,
 * put it in the matching docs/<folder>/ directory and add an entry to
 * that resource's `documents` array.
 *
 * Document fields:
 *   id          unique short id, no spaces (used in the page URL)
 *   title       display name
 *   description one-line summary (optional)
 *   section     group heading on the resource page (optional)
 *   type        "PDF", "Link", "Page", etc. — shown as a badge
 *   file        path to a file in /docs (PDF, DOCX, PPTX...)  -- OR --
 *   url         link to an external site                        -- OR --
 *   content     HTML text to render as an in-app page
 *   updated     date string, e.g. "2026-10-01" (optional)
 *   tags        extra search words (optional)
 *
 * Example:
 *   {
 *     id: "ictl-skill-level-1",
 *     title: "ICTL — Skill Level 1",
 *     description: "Individual critical tasks for SL1 Soldiers.",
 *     section: "Skill Level 1",
 *     type: "PDF",
 *     file: "docs/ictl/ictl-sl1.pdf",
 *     updated: "2026-10-01",
 *     tags: ["sl1", "tasks", "sustainment"]
 *   }
 */

/*
 * Textbook chapter helper. When you get a chapter's PDF, put it in
 * docs/fieldcraft/ and add the path as the last argument, e.g.
 *   chapter(3, "Pharmacology", 33, ["drugs"], "docs/fieldcraft/ch03-pharmacology.pdf")
 */
function chapter(num, title, page, tags = [], file) {
  return {
    id: "pt1-ch" + String(num).padStart(2, "0"),
    title: `Chapter ${num}: ${title}`,
    description: `Combat Medic Specialist Fieldcraft, Part 1. Begins on textbook page ${page}.`,
    section: "Part 1 · Limited Primary Care",
    type: "CH " + num,
    file,
    tags: ["fieldcraft", "textbook", "limited primary care", ...tags]
  };
}

window.RESOURCES = [
  {
    id: "fieldcraft",
    featured: true,
    title: "Combat Medic Specialist Fieldcraft",
    tag: "Textbook",
    icon: "▤",
    art: "textbook",
    summary: "The official 68W Combat Medic textbook from the Borden Institute (MEDCoE). It covers limited primary care through tactical combat casualty care in a 3-part, 30-chapter series.",
    documents: [
      {
        id: "pt1-front-matter",
        title: "Part 1 front matter & table of contents",
        description: "Limited Primary Care, 1st edition (2023). Title page, dedication, contents, foreword, preface and introduction.",
        section: "Part 1 · Limited Primary Care",
        type: "PDF",
        // PDFs are not published to the public repo. Once this file is hosted somewhere
        // access-controlled, add  url: "https://..."  here. For local testing only, use:
        // file: "docs/fieldcraft/fieldcraft-pt1-front-matter.pdf",
        updated: "2023-03-14",
        tags: ["borden", "medcoe", "contents", "foreword", "preface", "sebban"]
      },
      chapter(1, "Sick Call and Medical Documentation", 1, ["sick call", "documentation", "records", "charting"]),
      chapter(2, "Infection, Asepsis, and Sterile Technique", 13, ["infection control", "asepsis", "sterile field", "ppe"]),
      chapter(3, "Pharmacology", 33, ["drugs", "medications", "dosage"]),
      chapter(4, "Medication Administration", 47, ["medications", "routes", "dosage"]),
      chapter(5, "Injections", 93, ["im", "subq", "intradermal", "needles"]),
      chapter(6, "Venipuncture", 147, ["blood draw", "iv", "vascular access", "phlebotomy"]),
      chapter(7, "Eyes, Ears, Nose, and Throat Primary Care", 157, ["eent", "ent", "eye", "ear", "throat"]),
      chapter(8, "Respiratory Primary Care", 175, ["respiratory", "lungs", "breathing", "airway"]),
      chapter(9, "Abdominal Primary Care", 183, ["abdomen", "gi", "gastrointestinal"]),
      chapter(10, "Orthopedics Primary Care", 199, ["ortho", "musculoskeletal", "splint", "sprain", "fracture"]),
      chapter(11, "Basic Wound Care", 241, ["wounds", "laceration", "dressing", "suture"]),
      chapter(12, "Skin Diseases Primary Care", 261, ["dermatology", "skin", "rash", "blisters"])
    ]
  },
  {
    id: "ictl",
    title: "68W ICTLs",
    tag: "Training",
    icon: "☑",
    art: "checklist",
    summary: "Individual critical task lists and sustainment requirements.",
    // Generated from the PDFs in docs/ictl/ by scripts/build_ictl.py. Re-run it after adding files.
    documents: window.ICTL_DOCUMENTS || [],
    filter: {
      label: "Sustain at",
      param: "sl",
      field: "levels",
      hint: "Showing tasks Soldiers at Skill Level {v} must sustain, plus the SL{v} task list.",
      options: [1, 2, 3, 4, 5].map((n) => ({ value: n, label: "SL" + n }))
    }
  },
  {
    id: "adtmc",
    title: "ADTMC",
    tag: "Training",
    icon: "⌁",
    art: "mountain",
    summary: "Army-directed training and medical competency resources.",
    documents: []
  },
  {
    id: "cpg",
    title: "Clinical Practice Guidelines",
    tag: "Clinical",
    icon: "✚",
    art: "chart",
    summary: "Clinical decision support and evidence-based care.",
    // Generated from the JTS CPG PDFs in docs/cpg/ by scripts/build_cpg.py. Re-run it after adding files.
    // The PDFs are not published (no distribution statement); entries link to the JTS CPG library.
    documents: window.CPG_DOCUMENTS || []
  },
  {
    id: "drug-ref",
    title: "Drug References",
    tag: "Reference",
    icon: "●",
    art: "meds",
    summary: "Medication information for operational medical care.",
    documents: []
  },
  {
    id: "field-care",
    title: "Ranger & Prolonged Field Care Handbooks",
    tag: "Field Care",
    icon: "▣",
    art: "books",
    summary: "Austere-care and extended-care handbook access.",
    documents: []
  },
  {
    id: "guidelines",
    title: "Guidelines",
    tag: "Reference",
    icon: "⌘",
    art: "compass",
    summary: "Quick-reference policies, standards, and job aids.",
    documents: [
      {
        id: "how-to-add-content",
        title: "How to add documents to this hub",
        description: "Sample in-app page. Delete this entry once real content is loaded.",
        section: "Getting started",
        type: "Page",
        updated: "2026-11-19",
        tags: ["help", "admin"],
        content: `
          <p>This hub reads all of its content from <code>js/data.js</code>.</p>
          <ol>
            <li>Copy the file (PDF, Word, slides) into the matching folder under <code>docs/</code>.</li>
            <li>Open <code>js/data.js</code> and find the resource it belongs to.</li>
            <li>Add an entry to that resource's <code>documents</code> list with a <code>file</code> path.</li>
            <li>Reload the page. The document now shows up on the resource page, in search, and can be saved.</li>
          </ol>
          <p>For a short reference that isn't a file, use <code>content</code> with HTML instead of <code>file</code>, the way this page does.</p>
        `
      }
    ]
  }
];
