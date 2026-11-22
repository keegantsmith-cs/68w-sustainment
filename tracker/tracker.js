/* 68W Trainer Tracker
 * All data stays in this browser (localStorage), encrypted with the trainer's passphrase
 * (PBKDF2-SHA256 -> AES-GCM-256, Web Crypto). Nothing is sent to any server. Trainees are
 * identified only by initials + last 3 of DoD ID. Tasks and frequencies come from ../js/ictl.js.
 */
(function () {
  "use strict";
  const STORE = "68w-tracker:v1";
  const IDLE_LOCK_MS = 15 * 60 * 1000;
  const SOON_DAYS = 30;
  const FREQ_MONTHS = { Annually: 12, Semiannual: 6, Quarterly: 3 };
  const STATUSES = ["Trained", "GO", "NO-GO"];
  const app = document.getElementById("app");

  /* ---------- tasks ---------- */
  const TASKS = (window.ICTL_DOCUMENTS || []).filter((d) => /^SL\d/.test(d.type)).map((d) => {
    const m = Object.fromEntries(d.meta);
    return { id: d.id, num: m["Task number"], title: d.title.replace(/^\S+\s/, ""), area: d.section,
             sl: m["Skill level"], freq: m["Sustainment frequency"], levels: d.levels };
  });
  const taskById = Object.fromEntries(TASKS.map((t) => [t.id, t]));
  const tasksFor = (sl) => TASKS.filter((t) => t.levels.includes(Number(sl)));

  /* ---------- helpers ---------- */
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const today = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); };
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const parse = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  const addMonths = (d, n) => { const r = new Date(d.getFullYear(), d.getMonth() + n, d.getDate());
    if (r.getDate() !== d.getDate()) r.setDate(0); return r; };              // clamp e.g. 31 Aug + 6 mo
  const days = (a, b) => Math.round((b - a) / 86400000);
  const fmt = (s) => s ? parse(s).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }) : "—";
  const normId = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const showId = (id) => id.replace(/^([A-Z]+)(\d{3})$/, "$1-$2");
  const ID_RE = /^[A-Z]{2,3}\d{3}$/;
  const INI_RE = /^[A-Z]{2,3}$/;

  /* ---------- crypto + storage ---------- */
  const enc = new TextEncoder(), dec = new TextDecoder();
  const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
  const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  let KEY = null, SALT = null, DATA = null, idleTimer = null;

  async function deriveKey(pass, salt) {
    const base = await crypto.subtle.importKey("raw", enc.encode(pass), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: 310000, hash: "SHA-256" },
      base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  }
  const stored = () => { try { return JSON.parse(localStorage.getItem(STORE) || "null"); } catch { return null; } };
  async function save() {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, KEY, enc.encode(JSON.stringify(DATA)));
    localStorage.setItem(STORE, JSON.stringify({ v: 1, salt: b64(SALT), iv: b64(iv), ct: b64(ct) }));
  }
  async function unlock(pass) {
    const s = stored();
    const salt = unb64(s.salt), key = await deriveKey(pass, salt);
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(s.iv) }, key, unb64(s.ct));  // throws if wrong
    KEY = key; SALT = salt; DATA = JSON.parse(dec.decode(pt));
  }
  async function setup(pass) {
    SALT = crypto.getRandomValues(new Uint8Array(16));
    KEY = await deriveKey(pass, SALT);
    DATA = { version: 1, trainees: {}, records: {}, created: iso(today()) };
    await save();
  }
  function lock() {
    KEY = null; DATA = null; SALT = null;
    document.getElementById("topActions").hidden = true;
    location.hash = "#/";
    render();
  }
  function touch() {
    clearTimeout(idleTimer);
    if (KEY) idleTimer = setTimeout(lock, IDLE_LOCK_MS);
  }
  ["click", "keydown", "touchstart"].forEach((e) => document.addEventListener(e, touch, { passive: true }));

  /* ---------- status logic ---------- */
  function taskState(tid, taskId) {
    const t = taskById[taskId];
    const hist = ((DATA.records[tid] || {})[taskId] || []).slice().sort((a, b) => a.date.localeCompare(b.date) || a.ts - b.ts);
    const last = hist[hist.length - 1];
    const lastGo = [...hist].reverse().find((h) => h.status === "GO");
    const due = lastGo && FREQ_MONTHS[t.freq] ? iso(addMonths(parse(lastGo.date), FREQ_MONTHS[t.freq])) : null;
    let state = "none", label = "Not started";
    if (last && last.status === "NO-GO" && (!lastGo || last.date >= lastGo.date)) { state = "nogo"; label = "NO-GO"; }
    else if (due) {
      const left = days(today(), parse(due));
      if (left < 0) { state = "overdue"; label = "Overdue"; }
      else if (left <= SOON_DAYS) { state = "soon"; label = `Due in ${left} d`; }
      else { state = "current"; label = "Current"; }
    } else if (last) { state = "trained"; label = "Trained"; }
    return { hist, last, lastGo, due, state, label };
  }
  function traineeSummary(tr) {
    const tasks = tasksFor(tr.sl);
    const states = tasks.map((t) => taskState(tr.id, t.id));
    const count = (s) => states.filter((x) => x.state === s).length;
    const current = count("current") + count("soon");
    return { tasks, states, total: tasks.length, current, soon: count("soon"), overdue: count("overdue"),
             nogo: count("nogo"), pct: tasks.length ? Math.round((100 * current) / tasks.length) : 0 };
  }
  const pill = (st) => `<span class="pill ${st.state}">${esc(st.label)}</span>`;
  const trainees = () => Object.values(DATA.trainees).filter((t) => !t.archived).sort((a, b) => a.id.localeCompare(b.id));

  /* ---------- views ---------- */
  function viewLock() {
    const exists = !!stored();
    return `<section class="lockbox">
      <p class="eyebrow">Trainers only</p>
      <h1>${exists ? "Unlock tracker" : "Set up tracker"}</h1>
      <p class="meta">Data is stored only in this browser on this device, encrypted with your passphrase.
        ${exists ? "" : "There is no recovery: if you forget the passphrase, the data cannot be read. Export backups from the Data page."}</p>
      <form class="form" id="lockForm" autocomplete="off">
        <label>Passphrase<input type="password" name="p1" minlength="${exists ? 1 : 10}" required autofocus></label>
        ${exists ? "" : `<label>Confirm passphrase<input type="password" name="p2" required>
          <span class="hint">At least 10 characters. Don't reuse your CAC PIN or an Army password.</span></label>`}
        <p class="err" id="lockErr"></p>
        <div class="actions"><button class="btn" type="submit">${exists ? "Unlock" : "Create and unlock"}</button></div>
      </form>
      <p class="note"><b>Rules:</b> identify trainees only by initials + last 3 of DoD ID. Never enter names, full DoD IDs,
        SSNs or medical/health information. This is a trainer's working aid; DTMS remains the system of record.</p>
    </section>`;
  }

  function viewDash(params) {
    const sl = params.get("sl");
    const list = trainees().filter((t) => !sl || String(t.sl) === sl);
    const sums = list.map((t) => ({ t, s: traineeSummary(t) }));
    const tot = (k) => sums.reduce((a, x) => a + x.s[k], 0);
    const byTask = TASKS.map((task) => {
      const rel = list.filter((t) => task.levels.includes(Number(t.sl)));
      const st = rel.map((t) => taskState(t.id, task.id).state);
      return { task, n: rel.length, overdue: st.filter((x) => x === "overdue").length, soon: st.filter((x) => x === "soon").length,
               nogo: st.filter((x) => x === "nogo").length, none: st.filter((x) => x === "none" || x === "trained").length };
    }).filter((r) => r.n && (r.overdue || r.nogo || r.soon)).sort((a, b) => (b.overdue + b.nogo) - (a.overdue + a.nogo) || b.soon - a.soon);
    const chips = ["", "1", "2", "3", "4", "5"].map((v) =>
      `<a class="chip${(sl || "") === v ? " on" : ""}" href="#/${v ? "?sl=" + v : ""}">${v ? "SL" + v : "All"}</a>`).join("");
    return `
      <div class="toolbar"><div class="filter" style="margin:0"><span class="filter-label">Skill level</span>${chips}</div>
        <span class="spacer"></span><a class="btn" href="#/add">+ Add trainee</a></div>
      <div class="trk-grid">
        <div class="stat"><b>${list.length}</b><span>Trainees</span></div>
        <div class="stat good"><b>${sums.length ? Math.round(sums.reduce((a, x) => a + x.s.pct, 0) / sums.length) : 0}%</b><span>Avg tasks current</span></div>
        <div class="stat bad"><b>${tot("overdue") + tot("nogo")}</b><span>Overdue / NO-GO</span></div>
        <div class="stat warn"><b>${tot("soon")}</b><span>Due ≤ ${SOON_DAYS} days</span></div>
      </div>
      <div class="section-head"><h2>Trainees</h2><span>Initials + last 3 of DoD ID</span></div>
      ${list.length ? `<div class="table-wrap"><table class="trk-table">
        <tr><th>Trainee</th><th>SL</th><th class="hide-sm">Group</th><th>Current</th><th class="num">Overdue</th><th class="num">NO-GO</th><th class="num hide-sm">Due ≤${SOON_DAYS}d</th></tr>
        ${sums.map(({ t, s }) => `<tr class="click" data-go="#/t/${t.id}">
          <td><a href="#/t/${t.id}"><b>${esc(showId(t.id))}</b></a></td><td>SL${esc(t.sl)}</td><td class="hide-sm">${esc(t.group || "")}</td>
          <td><div class="bar" title="${s.current} of ${s.total}"><i style="width:${s.pct}%"></i></div><span class="meta" style="margin:0">${s.current}/${s.total} (${s.pct}%)</span></td>
          <td class="num">${s.overdue}</td><td class="num">${s.nogo}</td><td class="num hide-sm">${s.soon}</td></tr>`).join("")}
      </table></div>` : `<div class="empty"><h3>No trainees yet</h3><p>Add a trainee to start tracking ICTL task progression.</p></div>`}
      <div class="section-head"><h2>Tasks needing attention</h2><span>Across ${sl ? "SL" + esc(sl) : "all"} trainees</span></div>
      ${byTask.length ? `<div class="table-wrap"><table class="trk-table">
        <tr><th>Task</th><th class="hide-sm">Frequency</th><th class="num">Overdue</th><th class="num">NO-GO</th><th class="num">Due ≤${SOON_DAYS}d</th><th class="num hide-sm">Not yet GO</th></tr>
        ${byTask.map((r) => `<tr><td><b>${esc(r.task.num)}</b> ${esc(r.task.title)}</td><td class="hide-sm">${esc(r.task.freq)}</td>
          <td class="num">${r.overdue}</td><td class="num">${r.nogo}</td><td class="num">${r.soon}</td><td class="num hide-sm">${r.none}</td></tr>`).join("")}
      </table></div>` : `<p class="meta">Nothing overdue, NO-GO or due soon.</p>`}`;
  }

  function viewAdd(id) {
    const t = id ? DATA.trainees[id] : null;
    return `<a class="back" href="${t ? "#/t/" + t.id : "#/"}">‹ ${t ? esc(showId(t.id)) : "Dashboard"}</a>
      <div class="section-head"><h2>${t ? "Edit trainee" : "Add trainee"}</h2></div>
      <form class="form panel" id="traineeForm" autocomplete="off">
        <div class="row">
          <label>Trainee ID<input name="id" value="${t ? esc(showId(t.id)) : ""}" ${t ? "readonly" : "required"} placeholder="AB-123" maxlength="7">
            <span class="hint">Initials (2–3 letters) + last 3 of DoD ID. Nothing else.</span></label>
          <label>Skill level<select name="sl">${[1, 2, 3, 4, 5].map((n) => `<option value="${n}"${t && Number(t.sl) === n ? " selected" : ""}>SL${n}</option>`).join("")}</select>
            <span class="hint">Sets which ICTL tasks they must sustain.</span></label>
        </div>
        <label>Group (optional)<input name="group" value="${t ? esc(t.group || "") : ""}" maxlength="24" placeholder="e.g. Section A">
          <span class="hint">A generic label only. Not a unit name, location or deployment.</span></label>
        <p class="err" id="formErr"></p>
        <div class="actions"><button class="btn" type="submit">Save</button>
          ${t ? `<button class="btn danger" type="button" data-archive="${t.id}">Remove trainee</button>` : ""}</div>
      </form>`;
  }

  function viewTrainee(id) {
    const t = DATA.trainees[id];
    if (!t || t.archived) return `<div class="empty"><h3>Trainee not found</h3><p><a href="#/">Back to dashboard</a></p></div>`;
    const s = traineeSummary(t);
    const groups = {};
    s.tasks.forEach((task, i) => (groups[task.area] ||= []).push([task, s.states[i]]));
    return `<a class="back" href="#/">‹ Dashboard</a>
      <header class="doc-head"><div><p class="eyebrow">Trainee · SL${esc(t.sl)}${t.group ? " · " + esc(t.group) : ""}</p>
        <h1>${esc(showId(t.id))}</h1></div><a class="btn ghost small" href="#/edit/${t.id}">Edit</a></header>
      <div class="trk-grid">
        <div class="stat good"><b>${s.pct}%</b><span>${s.current} of ${s.total} current</span></div>
        <div class="stat bad"><b>${s.overdue}</b><span>Overdue</span></div>
        <div class="stat bad"><b>${s.nogo}</b><span>NO-GO</span></div>
        <div class="stat warn"><b>${s.soon}</b><span>Due ≤ ${SOON_DAYS} days</span></div>
      </div>
      ${Object.entries(groups).map(([area, rows]) => `
        <div class="section-head"><h2>${esc(area)}</h2><span>${rows.length} tasks</span></div>
        <div class="table-wrap"><table class="trk-table">
          <tr><th>Task</th><th>Status</th><th class="hide-sm">Last GO</th><th>Next due</th><th class="hide-sm">Freq.</th></tr>
          ${rows.map(([task, st]) => `<tr class="click" data-go="#/t/${t.id}/${task.id}">
            <td><a href="#/t/${t.id}/${task.id}"><b>${esc(task.num)}</b> ${esc(task.title)}</a>${st.hist.some((h) => h.note) ? ' <span title="Has notes">✎</span>' : ""}</td>
            <td>${pill(st)}</td><td class="hide-sm">${fmt(st.lastGo && st.lastGo.date)}</td><td>${fmt(st.due)}</td><td class="hide-sm">${esc(task.freq)}</td></tr>`).join("")}
        </table></div>`).join("")}`;
  }

  function viewRecord(id, taskId) {
    const t = DATA.trainees[id], task = taskById[taskId];
    if (!t || !task) return `<div class="empty"><h3>Not found</h3><p><a href="#/">Back to dashboard</a></p></div>`;
    const st = taskState(id, taskId);
    return `<a class="back" href="#/t/${t.id}">‹ ${esc(showId(t.id))}</a>
      <header class="doc-head"><div><p class="eyebrow">${esc(task.num)} · ${esc(task.sl)} · Sustain ${esc(task.freq.toLowerCase())}</p>
        <h1>${esc(task.title)}</h1>
        <p class="meta">${pill(st)} &nbsp; Last GO ${fmt(st.lastGo && st.lastGo.date)} · Next due ${fmt(st.due)} ·
          <a href="../#/d/ictl/${esc(task.id)}" target="_blank" rel="noopener" style="color:var(--tan)">Open task standards ↗</a></p></div></header>
      <form class="form panel" id="recordForm" autocomplete="off">
        <div class="row">
          <label>Result<select name="status">${STATUSES.map((s) => `<option>${s}</option>`).join("")}</select>
            <span class="hint">GO starts the sustainment clock. Trained = taught, not yet evaluated.</span></label>
          <label>Date<input type="date" name="date" value="${iso(today())}" max="${iso(today())}" required></label>
        </div>
        <label>Evaluator initials<input name="evaluator" maxlength="3" placeholder="CD" required></label>
        <label>Note (optional)<textarea name="note" maxlength="1000" placeholder="Performance observations, steps to retrain…"></textarea>
          <span class="hint">No names, full DoD IDs, SSNs, or medical/health information about the trainee.</span></label>
        <p class="err" id="formErr"></p>
        <div class="actions"><button class="btn" type="submit">Add entry</button></div>
      </form>
      <div class="section-head"><h2>History</h2><span>${st.hist.length} entr${st.hist.length === 1 ? "y" : "ies"}</span></div>
      ${st.hist.length ? `<ul class="history">${st.hist.slice().reverse().map((h) => `<li>
          <div><span class="pill ${h.status === "GO" ? "current" : h.status === "NO-GO" ? "nogo" : "trained"}">${esc(h.status)}</span>
            <b>${fmt(h.date)}</b> · evaluator ${esc(h.evaluator)}</div>
          ${h.note ? `<div>${esc(h.note)}</div>` : ""}
          <button class="btn ghost small" data-del="${h.ts}">Delete entry</button></li>`).join("")}</ul>`
        : `<p class="meta">No entries yet.</p>`}`;
  }

  function viewData() {
    return `<a class="back" href="#/">‹ Dashboard</a>
      <div class="section-head"><h2>Data on this device</h2><span>${trainees().length} trainees</span></div>
      <div class="panel prose">
        <p>Everything is stored only in this browser, encrypted with your passphrase. Clearing browser data,
          a private window or a different device means starting empty, so <b>export a backup regularly</b>.</p>
        <div class="actions">
          <button class="btn" id="exportJson">Export backup (encrypted)</button>
          <button class="btn ghost" id="exportCsv">Export CSV for DTMS entry</button>
          <label class="btn ghost" style="cursor:pointer">Import backup<input type="file" id="importFile" accept=".json,application/json" hidden></label>
        </div>
        <p class="meta">The backup file stays encrypted with your current passphrase, so share it only with trainers who know it.
          The CSV is <b>not encrypted</b> and leaves out notes; handle it per your unit's rules and delete it after use.</p>
        <p class="err" id="dataMsg" role="status"></p>
      </div>
      <div class="section-head"><h2>Change passphrase</h2></div>
      <form class="form panel" id="passForm" autocomplete="off">
        <div class="row"><label>New passphrase<input type="password" name="p1" minlength="10" required></label>
          <label>Confirm<input type="password" name="p2" required></label></div>
        <div class="actions"><button class="btn" type="submit">Change passphrase</button></div>
      </form>
      <div class="section-head"><h2>Erase</h2></div>
      <div class="panel"><p>Permanently delete all tracker data from this device.</p>
        <div class="actions"><button class="btn danger" id="eraseAll">Erase all data</button></div></div>`;
  }

  /* ---------- router ---------- */
  function render() {
    const hash = location.hash.replace(/^#\/?/, "");
    const [path, q = ""] = hash.split("?");
    const parts = path.split("/").filter(Boolean).map(decodeURIComponent);
    const params = new URLSearchParams(q);
    let html;
    if (!KEY) html = viewLock();
    else switch (parts[0]) {
      case "add": html = viewAdd(); break;
      case "edit": html = viewAdd(parts[1]); break;
      case "t": html = parts[2] ? viewRecord(parts[1], parts[2]) : viewTrainee(parts[1]); break;
      case "data": html = viewData(); break;
      default: html = viewDash(params);
    }
    document.getElementById("topActions").hidden = !KEY;
    app.innerHTML = `<div class="view">${html}</div>`;
    window.scrollTo(0, 0);
  }
  window.addEventListener("hashchange", render);

  /* ---------- events ---------- */
  const NOTE_FLAGS = [
    [/\b\d{10}\b/, "a 10-digit number (looks like a full DoD ID)"],
    [/\b\d{3}-?\d{2}-?\d{4}\b/, "a number shaped like an SSN"],
    [/\b(diagnos|prescri|medication|pregnan|injur(y|ed)|profile|psych|behavioral health|surgery|illness)\w*/i, "words that may describe the trainee's health"],
  ];
  const download = (name, text, type) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const csvCell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;

  document.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target, fd = new FormData(f);
    if (f.getAttribute("id") === "lockForm") {
      const err = document.getElementById("lockErr");
      try {
        if (stored()) await unlock(fd.get("p1"));
        else {
          if (fd.get("p1").length < 10) throw new Error("Use at least 10 characters.");
          if (fd.get("p1") !== fd.get("p2")) throw new Error("Passphrases don't match.");
          await setup(fd.get("p1"));
        }
        touch(); render();
      } catch (x) { err.textContent = x.message && !/operation/i.test(x.message) ? x.message : "Wrong passphrase."; }
    }
    if (f.getAttribute("id") === "traineeForm") {
      const err = document.getElementById("formErr");
      const id = normId(fd.get("id"));
      if (!ID_RE.test(id)) return (err.textContent = "Use initials (2–3 letters) + the last 3 digits of the DoD ID, e.g. AB-123.");
      const adding = location.hash.startsWith("#/add");
      if (adding && DATA.trainees[id] && !DATA.trainees[id].archived) return (err.textContent = "That ID already exists.");
      const group = String(fd.get("group") || "").trim();
      DATA.trainees[id] = { ...(DATA.trainees[id] || { created: iso(today()) }), id, sl: Number(fd.get("sl")), group, archived: false };
      await save(); location.hash = `#/t/${id}`;
    }
    if (f.getAttribute("id") === "recordForm") {
      const err = document.getElementById("formErr");
      const [, tid, taskId] = location.hash.replace(/^#\/?/, "").split("/");
      const evaluator = normId(fd.get("evaluator"));
      if (!INI_RE.test(evaluator)) return (err.textContent = "Evaluator initials: 2–3 letters.");
      const note = String(fd.get("note") || "").trim();
      const hits = NOTE_FLAGS.filter(([re]) => re.test(note)).map(([, why]) => why);
      if (hits.length && !confirm(`This note contains ${hits.join(" and ")}.\n\nTracker notes must not include full IDs, SSNs or health information. Save anyway?`)) return;
      ((DATA.records[tid] ||= {})[taskId] ||= []).push({ status: fd.get("status"), date: fd.get("date"), evaluator, note, ts: Date.now() });
      await save(); render();
    }
    if (f.getAttribute("id") === "passForm") {
      const p1 = fd.get("p1");
      if (p1.length < 10 || p1 !== fd.get("p2")) return alert("Passphrases must match and be at least 10 characters.");
      SALT = crypto.getRandomValues(new Uint8Array(16)); KEY = await deriveKey(p1, SALT);
      await save(); alert("Passphrase changed. Export a new backup: older backups still use the old passphrase.");
      f.reset();
    }
  });

  document.addEventListener("click", async (e) => {
    const row = e.target.closest("tr[data-go]");
    if (row && !e.target.closest("a")) location.hash = row.dataset.go;
    if (e.target.id === "lockBtn") lock();
    const del = e.target.closest("[data-del]");
    if (del && confirm("Delete this entry?")) {
      const [, tid, taskId] = location.hash.replace(/^#\/?/, "").split("/");
      DATA.records[tid][taskId] = DATA.records[tid][taskId].filter((h) => String(h.ts) !== del.dataset.del);
      await save(); render();
    }
    const arch = e.target.closest("[data-archive]");
    if (arch && confirm("Remove this trainee and all of their records from this device?")) {
      delete DATA.trainees[arch.dataset.archive]; delete DATA.records[arch.dataset.archive];
      await save(); location.hash = "#/";
    }
    if (e.target.id === "exportJson") {
      download(`68w-tracker-backup-${iso(today())}.json`, localStorage.getItem(STORE), "application/json");
    }
    if (e.target.id === "exportCsv") {
      const rows = [["Trainee", "Skill level", "Group", "Task number", "Task title", "Status", "Date", "Evaluator", "Next due"]];
      trainees().forEach((t) => tasksFor(t.sl).forEach((task) => {
        const st = taskState(t.id, task.id);
        rows.push([showId(t.id), "SL" + t.sl, t.group || "", task.num, task.title, st.label,
                   st.last ? st.last.date : "", st.last ? st.last.evaluator : "", st.due || ""]);
      }));
      download(`68w-tracker-${iso(today())}.csv`, rows.map((r) => r.map(csvCell).join(",")).join("\r\n"), "text/csv");
    }
    if (e.target.id === "eraseAll" && confirm("Erase ALL tracker data on this device? This cannot be undone.")
        && prompt('Type ERASE to confirm') === "ERASE") {
      localStorage.removeItem(STORE); lock();
    }
  });

  document.addEventListener("change", async (e) => {
    if (e.target.id !== "importFile" || !e.target.files[0]) return;
    const msg = document.getElementById("dataMsg");
    try {
      const blob = JSON.parse(await e.target.files[0].text());
      if (!blob.ct || !blob.iv || !blob.salt) throw new Error("Not a tracker backup file.");
      const pass = prompt("Passphrase this backup was saved with:");
      if (pass == null) return;
      const key = await deriveKey(pass, unb64(blob.salt));
      const incoming = JSON.parse(dec.decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(blob.iv) }, key, unb64(blob.ct))));
      const replace = confirm("OK = MERGE the backup into this device's data.\nCancel = choose whether to replace instead.") ? false
        : confirm("Replace ALL data on this device with the backup?");
      if (replace) DATA = incoming;
      else {
        Object.assign(DATA.trainees, incoming.trainees);
        for (const [tid, tasks] of Object.entries(incoming.records || {}))
          for (const [taskId, hist] of Object.entries(tasks)) {
            const mine = ((DATA.records[tid] ||= {})[taskId] ||= []);
            hist.forEach((h) => { if (!mine.some((m) => m.ts === h.ts && m.date === h.date)) mine.push(h); });
          }
      }
      await save(); msg.textContent = `Imported ${Object.keys(incoming.trainees || {}).length} trainees.`;
    } catch (x) { msg.textContent = x.message && !/operation/i.test(x.message) ? x.message : "Couldn't read that backup (wrong passphrase?)."; }
    e.target.value = "";
  });

  render();
})();
