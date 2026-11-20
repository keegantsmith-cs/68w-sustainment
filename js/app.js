(function () {
  "use strict";

  const RES = window.RESOURCES || [];
  const ART = window.ART || {};
  const app = document.getElementById("app");

  /* ---------- helpers ---------- */
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const store = {
    get(key, fallback) {
      try { const v = localStorage.getItem("68w:" + key); return v ? JSON.parse(v) : fallback; }
      catch { return fallback; }
    },
    set(key, val) { try { localStorage.setItem("68w:" + key, JSON.stringify(val)); } catch {} }
  };

  const findRes = (id) => RES.find((r) => r.id === id);
  const findDoc = (rid, did) => (findRes(rid)?.documents || []).find((d) => d.id === did);
  const allDocs = () => RES.flatMap((r) => (r.documents || []).map((d) => ({ ...d, resource: r })));

  const savedList = () => store.get("saved", []);
  const isSaved = (key) => savedList().includes(key);
  function toggleSaved(key) {
    const list = savedList();
    const i = list.indexOf(key);
    i >= 0 ? list.splice(i, 1) : list.unshift(key);
    store.set("saved", list);
    return i < 0;
  }

  // Open PDFs without the viewer's page-thumbnail side panel; keep any #page=N anchor.
  const pdfView = (file) => {
    const [path, frag = ""] = file.split("#");
    const params = frag.split("&").filter((p) => p && !/^navpanes=/.test(p));
    return `${path}#${["navpanes=0", ...params].join("&")}`;
  };

  /* In-app PDF viewer (pdf.js): no browser side panel, works on iPhone, opens at #page=N. */
  let pdfjsReady;
  function loadPdfJs() {
    pdfjsReady ||= new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "assets/vendor/pdfjs/pdf.min.js";
      s.onload = () => {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = "assets/vendor/pdfjs/pdf.worker.min.js";
        resolve(window.pdfjsLib);
      };
      s.onerror = reject;
      document.head.appendChild(s);
    });
    return pdfjsReady;
  }

  function initPdfViewers() {
    document.querySelectorAll(".pdf-viewer").forEach(async (box) => {
      const pagesEl = box.querySelector(".pdf-pages");
      const count = box.querySelector(".pdf-count");
      const src = box.dataset.src;
      try {
        const lib = await loadPdfJs();
        const pdf = await lib.getDocument(src).promise;
        if (!box.isConnected) return;
        const first = await pdf.getPage(1);
        const ratio = first.getViewport({ scale: 1 }).height / first.getViewport({ scale: 1 }).width;
        const slots = [];
        for (let n = 1; n <= pdf.numPages; n++) {
          const slot = document.createElement("div");
          slot.className = "pdf-page";
          slot.dataset.n = n;
          slot.style.aspectRatio = `1 / ${ratio}`;
          pagesEl.appendChild(slot);
          slots.push(slot);
        }
        const render = async (slot) => {
          if (slot.dataset.done) return;
          slot.dataset.done = "1";
          const page = await pdf.getPage(Number(slot.dataset.n));
          const width = slot.clientWidth || pagesEl.clientWidth;
          const base = page.getViewport({ scale: 1 });
          const scale = (width / base.width) * Math.min(window.devicePixelRatio || 1, 2);
          const vp = page.getViewport({ scale });
          const canvas = document.createElement("canvas");
          canvas.width = vp.width; canvas.height = vp.height;
          canvas.setAttribute("aria-label", `Page ${slot.dataset.n}`);
          slot.style.aspectRatio = `${vp.width} / ${vp.height}`;
          slot.appendChild(canvas);
          await page.render({ canvasContext: canvas.getContext("2d"), viewport: vp }).promise;
        };
        const io = new IntersectionObserver((entries) => entries.forEach((e) => e.isIntersecting && render(e.target)),
          { root: pagesEl, rootMargin: "800px 0px" });
        slots.forEach((sl) => io.observe(sl));
        const start = Math.min(Math.max(Number(box.dataset.page) || 1, 1), pdf.numPages);
        const setCount = () => {
          const top = pagesEl.scrollTop + 40;
          const cur = slots.findIndex((sl) => sl.offsetTop + sl.offsetHeight > top) + 1 || 1;
          count.textContent = `Page ${cur} of ${pdf.numPages}`;
        };
        pagesEl.addEventListener("scroll", setCount, { passive: true });
        requestAnimationFrame(() => {
          pagesEl.scrollTop = Math.max(slots[start - 1].offsetTop - 12, 0);   // .pdf-pages is the offsetParent
          setCount();
        });
      } catch (err) {
        count.textContent = "This PDF couldn't be displayed here.";
        pagesEl.innerHTML = `<p class="pdf-fallback">Use <a href="${esc(src)}" target="_blank" rel="noopener">Open</a> to view it in your browser.</p>`;
      }
    });
  }

  const docHref = (rid, did) => `#/d/${encodeURIComponent(rid)}/${encodeURIComponent(did)}`;
  const resHref = (rid) => `#/r/${encodeURIComponent(rid)}`;

  function cardArt(r) {
    return r.image
      ? `<img class="card-img" src="${esc(r.image)}" alt="">`
      : `<div class="card-art">${ART[r.art] || ""}</div>`;
  }

  function saveBtn(key, label) {
    const on = isSaved(key);
    return `<button class="save-btn${on ? " on" : ""}" data-save="${esc(key)}" aria-pressed="${on}"
      aria-label="${on ? "Remove from" : "Add to"} saved: ${esc(label)}">${on ? "★" : "☆"}</button>`;
  }

  function docRow(d, r) {
    const kind = d.file ? "file" : d.url ? "link" : "page";
    const pending = !d.file && !d.url && !d.content && !d.refOnly;
    return `
      <li class="doc-row${pending ? " pending" : ""}">
        <a class="doc-link" href="${docHref(r.id, d.id)}">
          <span class="doc-type">${esc(d.type || kind.toUpperCase())}</span>
          <span class="doc-main">
            <strong>${esc(d.title)}</strong>
            ${d.description ? `<span>${esc(d.description)}</span>` : ""}
            <em>${pending ? "Not yet added · " : ""}${esc(r.title)}${d.updated ? " · Updated " + esc(d.updated) : ""}</em>
          </span>
        </a>
        ${saveBtn(`d:${r.id}/${d.id}`, d.title)}
      </li>`;
  }

  const sectionHead = (title, right = "") =>
    `<div class="section-head"><h2>${esc(title)}</h2>${right ? `<span>${esc(right)}</span>` : ""}</div>`;

  const empty = (title, body) =>
    `<div class="empty"><div class="empty-mark" aria-hidden="true">+</div><h3>${esc(title)}</h3><p>${body}</p></div>`;

  const DISCLAIMER = `<p class="note"><b>Notice:</b> Unofficial training aid. Always follow current command-approved protocols, medical director guidance, and published Army doctrine.
    <b>Dosages:</b> confirm every dose against current, authoritative drug information before giving it, especially for new or unfamiliar drugs and procedures.</p>`;

  /* ---------- views ---------- */
  function viewHome() {
    return `
      <section class="hero">
        <div class="hero-art">${ART.hero || ""}</div>
        <div class="hero-copy">
          <p class="eyebrow">Combat Medic Specialist</p>
          <h1>68W Sustainment</h1>
          <p class="lead">Training, clinical references, and field-care resources organized for rapid access at the point of need.</p>
          <span class="pill"><i></i>Ready Reference Portal</span>
        </div>
      </section>

      ${RES.filter((r) => r.featured).map((r) => `
        <a class="card featured" href="${resHref(r.id)}">
          ${cardArt(r)}
          <span class="tag">${esc(r.tag)}</span>
          <div class="card-body">
            <p class="eyebrow">Featured reference</p>
            <h3><span aria-hidden="true">${esc(r.icon)}</span> ${esc(r.title)}</h3>
            <p>${esc(r.summary)}</p>
            <span class="card-meta">${(r.documents || []).length} items · Open contents ›</span>
          </div>
        </a>`).join("")}

      ${sectionHead("Resource Library", "Select a resource to continue")}
      <div class="grid">
        ${RES.filter((r) => !r.featured).map((r) => `
          <a class="card" href="${resHref(r.id)}">
            ${cardArt(r)}
            <span class="tag">${esc(r.tag)}</span>
            <div class="card-body">
              <span class="card-icon" aria-hidden="true">${esc(r.icon)}</span>
              <h3>${esc(r.title)}</h3>
              <p>${esc(r.summary)}</p>
            </div>
          </a>`).join("")}
      </div>
      ${DISCLAIMER}`;
  }

  function viewResource(rid, params = new URLSearchParams()) {
    const r = findRes(rid);
    if (!r) return viewNotFound();
    const all = r.documents || [];
    const f = r.filter;
    const active = f && params.get(f.param) ? String(params.get(f.param)) : null;
    const docs = active ? all.filter((d) => (d[f.field] || []).map(String).includes(active)) : all;
    const chips = f ? `
      <div class="filter" role="group" aria-label="${esc(f.label)}">
        <span class="filter-label">${esc(f.label)}</span>
        <a class="chip${active ? "" : " on"}" href="${resHref(r.id)}" ${active ? "" : 'aria-current="true"'}>All</a>
        ${f.options.map((o) => `<a class="chip${active === String(o.value) ? " on" : ""}" href="${resHref(r.id)}?${f.param}=${o.value}"
          ${active === String(o.value) ? 'aria-current="true"' : ""}>${esc(o.label)}</a>`).join("")}
      </div>
      ${active && f.hint ? `<p class="meta filter-hint">${esc(f.hint.replaceAll("{v}", active))}</p>` : ""}` : "";
    const groups = {};
    docs.forEach((d) => (groups[d.section || "Documents"] ||= []).push(d));

    return `
      <a class="back" href="#/">‹ Resource Library</a>
      <section class="res-hero">
        ${cardArt(r)}
        <div class="res-hero-copy">
          <span class="tag static">${esc(r.tag)}</span>
          <h1><span aria-hidden="true">${esc(r.icon)}</span> ${esc(r.title)}</h1>
          <p>${esc(r.summary)}</p>
        </div>
        ${saveBtn(`r:${r.id}`, r.title)}
      </section>
      ${chips}
      ${docs.length
        ? Object.entries(groups).map(([sec, list]) => `
            ${sectionHead(sec, `${list.length} item${list.length > 1 ? "s" : ""}`)}
            <ul class="doc-list">${list.map((d) => docRow(d, r)).join("")}</ul>`).join("")
        : empty("Documents coming soon",
            `Add files to <code>docs/${esc(r.id)}/</code> and list them under <code>${esc(r.id)}</code> in <code>js/data.js</code>.`)}
      ${DISCLAIMER}`;
  }

  function viewDoc(rid, did) {
    const r = findRes(rid);
    const d = findDoc(rid, did);
    if (!r || !d) return viewNotFound();
    const isPdf = d.file && /\.pdf$/i.test(d.file.split("#")[0]);

    let body;
    if (d.content) body = `<article class="prose">${d.content}</article>`;
    else if (isPdf) {
      const [path, frag = ""] = d.file.split("#");
      const pg = (frag.match(/page=(\d+)/) || [])[1] || 1;
      body = `<div class="pdf-viewer" data-src="${esc(path)}" data-page="${esc(pg)}" role="region" aria-label="PDF: ${esc(d.title)}">
        <div class="pdf-bar"><span class="pdf-count">Loading PDF…</span></div><div class="pdf-pages"></div></div>`;
    }
    else if (d.file) body = empty("Preview not available", "This file type opens in its own app. Use Download or Open below.");
    else if (d.url) body = d.details?.length ? "" : empty("External resource", "This resource is hosted on another site.");
    else if (d.refOnly) body = "";
    else body = empty("Not yet added", "This item is in the outline, but its file hasn't been uploaded yet. Add a <code>file</code>, <code>url</code>, or <code>content</code> to this entry in <code>js/data.js</code>.");

    const actions = [];
    if (d.file) {
      actions.push(`<a class="btn" href="${esc(isPdf ? pdfView(d.file) : d.file)}" target="_blank" rel="noopener">Open</a>`);
      actions.push(`<a class="btn ghost" href="${esc(d.file.split("#")[0])}" download>Download</a>`);
    }
    if (d.url) actions.push(`<a class="btn" href="${esc(d.url)}" target="_blank" rel="noopener noreferrer">${esc(d.urlLabel || "Open site ↗")}</a>`);

    // Related documents in both directions: ones this doc lists, and ones that list this doc.
    const key = `${r.id}/${d.id}`;
    const related = [
      ...(d.related || []),
      ...allDocs().filter((o) => (o.related || []).includes(key)).map((o) => `${o.resource.id}/${o.id}`)
    ].filter((v, i, a) => a.indexOf(v) === i).map((k) => {
      const [rr, dd] = k.split("/");
      const R = findRes(rr), D = findDoc(rr, dd);
      return R && D && { R, D };
    }).filter(Boolean);

    return `
      <a class="back" href="${resHref(r.id)}">‹ ${esc(r.title)}</a>
      <header class="doc-head">
        <div>
          <p class="eyebrow">${esc(r.tag)} · ${esc(d.type || "Document")}</p>
          <h1>${esc(d.title)}</h1>
          ${d.description ? `<p class="lead">${esc(d.description)}</p>` : ""}
          ${d.updated ? `<p class="meta">Updated ${esc(d.updated)}</p>` : ""}
        </div>
        ${saveBtn(`d:${r.id}/${d.id}`, d.title)}
      </header>
      ${actions.length ? `<div class="actions">${actions.join("")}</div>` : ""}
      ${d.meta?.length ? `<dl class="meta-grid">${d.meta.map(([k, v]) =>
        `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>` : ""}
      ${d.notice ? `<p class="notice" role="note"><b>${esc(d.noticeLabel || "Check currency.")}</b> ${esc(d.notice)}</p>` : ""}
      ${d.details?.length ? `<section class="details">${d.details.map((x) =>
        `<h2>${esc(x.heading)}</h2>${x.items ? `<ul>${x.items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>` : `<p>${esc(x.text)}</p>`}`).join("")}
        ${d.source ? `<p class="cite">Source: ${esc(d.source)}</p>` : ""}</section>` : ""}
      ${related.length ? `${sectionHead("Related", `${related.length} item${related.length > 1 ? "s" : ""}`)}
        <ul class="doc-list">${related.map(({ R, D }) => docRow(D, R)).join("")}</ul>` : ""}
      ${d.details?.length && isPdf ? (r.id === "ictl"
        ? sectionHead("Full task", `${esc(d.type)} · Performance steps & evaluation`)
        : sectionHead("Source document", d.file.includes("#page=") ? `Opens at page ${esc(d.file.split("#page=")[1])} of the PDF part` : "Full PDF")) : ""}
      ${body}
      ${d.details?.length ? DISCLAIMER : ""}`;
  }

  function viewSaved() {
    const items = savedList().map((key) => {
      if (key.startsWith("r:")) {
        const r = findRes(key.slice(2));
        return r && `
          <li class="doc-row">
            <a class="doc-link" href="${resHref(r.id)}">
              <span class="doc-type">${esc(r.tag)}</span>
              <span class="doc-main"><strong>${esc(r.title)}</strong><span>${esc(r.summary)}</span></span>
            </a>${saveBtn(key, r.title)}
          </li>`;
      }
      const [rid, did] = key.slice(2).split("/");
      const r = findRes(rid), d = findDoc(rid, did);
      return r && d && docRow(d, r);
    }).filter(Boolean);

    return `${sectionHead("Saved", "Stored on this device")}
      ${items.length ? `<ul class="doc-list">${items.join("")}</ul>`
        : empty("Nothing saved yet", "Tap ☆ on any resource or document to keep it here for quick access.")}`;
  }

  function viewDownloads() {
    const files = allDocs().filter((d) => d.file && !d.file.includes("#"));
    return `${sectionHead("Downloads", "Files available to save")}
      ${files.length
        ? `<ul class="doc-list">${files.map((d) => `
            <li class="doc-row">
              <a class="doc-link" href="${docHref(d.resource.id, d.id)}">
                <span class="doc-type">${esc(d.type || "FILE")}</span>
                <span class="doc-main"><strong>${esc(d.title)}</strong><em>${esc(d.resource.title)}</em></span>
              </a>
              <a class="save-btn" href="${esc(d.file)}" download aria-label="Download ${esc(d.title)}">⇩</a>
            </li>`).join("")}</ul>`
        : empty("No downloadable files yet", "Documents with a <code>file</code> in data.js will be listed here.")}`;
  }

  function viewSearch(q = "") {
    return `${sectionHead("Search")}
      <form class="search" role="search" id="searchForm">
        <span aria-hidden="true">⌕</span>
        <input id="q" type="search" placeholder="Search tasks, drugs, guidelines…" value="${esc(q)}" autocomplete="off" aria-label="Search">
      </form>
      <div id="results">${searchResults(q)}</div>`;
  }

  function searchResults(q) {
    const terms = q.toLowerCase().trim().split(/\s+/).filter(Boolean);
    if (!terms.length) {
      return `<div class="chips">${RES.map((r) => `<a class="chip" href="${resHref(r.id)}">${esc(r.title)}</a>`).join("")}</div>`;
    }
    const match = (text) => terms.every((t) => text.toLowerCase().includes(t));
    const resHits = RES.filter((r) => match(`${r.title} ${r.tag} ${r.summary}`));
    const docHits = allDocs().filter((d) =>
      match(`${d.title} ${d.description || ""} ${d.section || ""} ${d.type || ""} ${(d.tags || []).join(" ")} ${d.resource.title} ${(d.details || []).map((x) => x.text || (x.items || []).join(" ")).join(" ")}`));
    if (!resHits.length && !docHits.length) return empty("No matches", `Nothing found for “${esc(q)}”.`);
    return `
      ${resHits.length ? `<ul class="doc-list">${resHits.map((r) => `
        <li class="doc-row"><a class="doc-link" href="${resHref(r.id)}">
          <span class="doc-type">${esc(r.tag)}</span>
          <span class="doc-main"><strong>${esc(r.title)}</strong><span>${esc(r.summary)}</span></span>
        </a></li>`).join("")}</ul>` : ""}
      ${docHits.length ? `<ul class="doc-list">${docHits.map((d) => docRow(d, d.resource)).join("")}</ul>` : ""}`;
  }

  function viewProfile() {
    const p = store.get("profile", {});
    const field = (id, label, ph) => `
      <label class="field"><span>${label}</span>
        <input name="${id}" value="${esc(p[id] || "")}" placeholder="${ph}" autocomplete="off"></label>`;
    return `${sectionHead("Profile", "Stored on this device only")}
      <form class="panel" id="profileForm">
        ${field("name", "Name", "SPC Doe")}
        ${field("unit", "Unit", "1-2 IN, C Co")}
        ${field("nremt", "NREMT expiration", "2027-03-31")}
        ${field("tccc", "TCCC / sustainment due", "2027-01-15")}
        <div class="actions"><button class="btn" type="submit">Save profile</button>
        <button class="btn ghost" type="button" id="clearSaved">Clear saved items</button></div>
        <p class="meta" id="profileMsg" role="status"></p>
      </form>
      <p class="note">Do not enter sensitive or personally identifiable information. Nothing here leaves this device.</p>`;
  }

  function viewAbout() {
    return `${sectionHead("About this hub")}
      <div class="panel prose">
        <p>68W Sustainment is a quick-reference portal that collects training, clinical, and field-care resources for Combat Medic Specialists in one place.</p>
        <p>It is an unofficial training aid. Always follow current command-approved protocols, your medical director, and published Army doctrine.</p>
      </div>`;
  }

  const viewNotFound = () => empty("Page not found", `<a href="#/">Return to the Resource Library</a>`);

  /* ---------- router ---------- */
  function route() {
    const hash = location.hash.replace(/^#\/?/, "");
    const [path, query = ""] = hash.split("?");
    const parts = path.split("/").filter(Boolean).map(decodeURIComponent);
    const params = new URLSearchParams(query);
    let html, nav = parts[0] || "home";

    switch (parts[0]) {
      case undefined: html = viewHome(); break;
      case "r": html = viewResource(parts[1], params); nav = "home"; break;
      case "d": html = viewDoc(parts[1], parts[2]); nav = "home"; break;
      case "saved": html = viewSaved(); break;
      case "downloads": html = viewDownloads(); break;
      case "search": html = viewSearch(params.get("q") || ""); break;
      case "profile": html = viewProfile(); break;
      case "about": html = viewAbout(); nav = ""; break;
      default: html = viewNotFound(); nav = "";
    }

    app.innerHTML = `<div class="view">${html}</div>`;
    initPdfViewers();
    document.querySelectorAll("[data-nav]").forEach((a) =>
      a.toggleAttribute("aria-current", a.dataset.nav === nav));
    closeMenu();
    window.scrollTo(0, 0);
    if (parts[0] === "search") {
      const input = document.getElementById("q");
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
    const titles = { r: findRes(parts[1])?.title, d: findDoc(parts[1], parts[2])?.title };
    document.title = (titles[parts[0]] ? titles[parts[0]] + " · " : "") + "68W Sustainment";
  }

  /* ---------- events ---------- */
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-save]");
    if (!btn) return;
    e.preventDefault();
    const on = toggleSaved(btn.dataset.save);
    btn.classList.toggle("on", on);
    btn.textContent = on ? "★" : "☆";
    btn.setAttribute("aria-pressed", on);
    if (location.hash.startsWith("#/saved") && !on) route();
  });

  document.addEventListener("input", (e) => {
    if (e.target.id !== "q") return;
    document.getElementById("results").innerHTML = searchResults(e.target.value);
    history.replaceState(null, "", "#/search" + (e.target.value ? "?q=" + encodeURIComponent(e.target.value) : ""));
  });

  document.addEventListener("submit", (e) => {
    if (e.target.id === "searchForm") { e.preventDefault(); document.getElementById("q").blur(); }
    if (e.target.id === "profileForm") {
      e.preventDefault();
      store.set("profile", Object.fromEntries(new FormData(e.target)));
      document.getElementById("profileMsg").textContent = "Profile saved.";
    }
  });

  document.addEventListener("click", (e) => {
    if (e.target.id === "clearSaved") {
      store.set("saved", []);
      document.getElementById("profileMsg").textContent = "Saved items cleared.";
    }
  });

  /* menu */
  const menu = document.getElementById("menu");
  const menuBtn = document.getElementById("menuBtn");
  document.getElementById("menuResources").innerHTML =
    RES.map((r) => `<a href="${resHref(r.id)}">${esc(r.title)}</a>`).join("");
  function closeMenu() { menu.hidden = true; menuBtn.setAttribute("aria-expanded", "false"); }
  menuBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    menu.hidden = !menu.hidden;
    menuBtn.setAttribute("aria-expanded", String(!menu.hidden));
  });
  document.addEventListener("click", (e) => { if (!menu.hidden && !menu.contains(e.target)) closeMenu(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeMenu(); });

  window.addEventListener("hashchange", route);
  route();

  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
})();
