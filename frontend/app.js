(function () {
  "use strict";

  // Talking to the live deployment by default. Override for local dev by
  // opening the page with ?api=http://localhost:8000 once (it's remembered).
  const DEFAULT_API_BASE = "https://citation-tracker-j9do.onrender.com";
  const qsOverride = new URLSearchParams(location.search).get("api");
  if (qsOverride) localStorage.setItem("ct_api_base", qsOverride);
  const API_BASE = localStorage.getItem("ct_api_base") || DEFAULT_API_BASE;

  const app = document.getElementById("app");
  const modalRoot = document.getElementById("modal-root");
  const toastEl = document.getElementById("toast");

  let currentUser = null;
  let libState = {
    title: "", authors: "", journal: "", year: "", read_status: "",
    sort: "added_at", order: "desc", group: null, page: 1, page_size: 20,
  };
  let importTab = "bibtex";
  let importResult = null;
  let importError = null;
  let selectedIds = new Set(); // survives pagination/filtering so a bibliography can span pages
  let collapsedGroups = new Set(); // survives re-renders, keyed by "<field>:<value>"

  // Columns a user can click to sort, and whether higher/lower (numeric) or
  // alphabetical (string) ordering applies. Also which of those can be grouped.
  const SORT_FIELDS = {
    title: { numeric: false },
    authors: { numeric: false },
    journal: { numeric: false, groupable: true },
    year: { numeric: true, groupable: true },
    read_status: { numeric: false, groupable: true },
  };

  // ---------------------------------------------------------------- utils

  function escapeHtml(str) {
    if (str === null || str === undefined) return "";
    return String(str).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  function fmtDate(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }

  function debounce(fn, ms) {
    let t;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), ms);
    };
  }

  function showToast(message, isError) {
    toastEl.textContent = message;
    toastEl.hidden = false;
    toastEl.classList.toggle("error", !!isError);
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => { toastEl.hidden = true; }, 3500);
  }

  function getToken() { return localStorage.getItem("ct_token"); }
  function setToken(t) {
    if (t) localStorage.setItem("ct_token", t);
    else localStorage.removeItem("ct_token");
  }

  const icon = {
    book: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
    chevronLeft: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
    chevronRight: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>',
    close: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>',
    upload: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4M12 4l-4 4M12 4l4 4"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/></svg>',
  };

  // ----------------------------------------------------------------- API

  async function api(path, options = {}) {
    const headers = Object.assign({}, options.headers);
    if (options.body && !(options.body instanceof FormData)) {
      headers["Content-Type"] = "application/json";
    }
    const token = getToken();
    if (token) headers.Authorization = "Bearer " + token;

    let res;
    try {
      res = await fetch(API_BASE + path, Object.assign({}, options, { headers }));
    } catch (err) {
      throw new Error(
        "Couldn't reach the API at " + API_BASE + ". The live backend may be waking " +
        "from sleep (Render free tier) — wait a few seconds and try again."
      );
    }

    if (res.status === 204) return null;

    const text = await res.text();
    let data = null;
    if (text) { try { data = JSON.parse(text); } catch { /* not JSON */ } }

    if (!res.ok) {
      let detail = "Request failed (" + res.status + ")";
      if (data && data.detail) {
        detail = Array.isArray(data.detail)
          ? data.detail.map((d) => d.msg || JSON.stringify(d)).join("; ")
          : data.detail;
      }
      const err = new Error(detail);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  const Api = {
    register: (email, password) => api("/auth/register", { method: "POST", body: JSON.stringify({ email, password }) }),
    login: (email, password) => api("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
    me: () => api("/auth/me"),
    logout: () => api("/auth/logout", { method: "POST" }),
    forgotPassword: (email) => api("/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) }),
    resetPassword: (token, newPassword) => api("/auth/reset-password", { method: "POST", body: JSON.stringify({ token, new_password: newPassword }) }),
    listCitations: (query) => api("/citations?" + query),
    getCitation: (id) => api("/citations/" + encodeURIComponent(id)),
    createCitation: (data) => api("/citations", { method: "POST", body: JSON.stringify(data) }),
    updateCitation: (id, data) => api("/citations/" + encodeURIComponent(id), { method: "PATCH", body: JSON.stringify(data) }),
    deleteCitation: (id) => api("/citations/" + encodeURIComponent(id), { method: "DELETE" }),
    importFile: (kind, file) => {
      const fd = new FormData();
      fd.append("file", file);
      return api("/citations/import/" + kind, { method: "POST", body: fd });
    },
    importDoi: (doi) => api("/citations/import/doi", { method: "POST", body: JSON.stringify({ doi }) }),
    listCitationStyles: () => api("/citations/styles"),
    formatCitation: (id, style, kind) => api(`/citations/${encodeURIComponent(id)}/format?style=${encodeURIComponent(style)}&kind=${encodeURIComponent(kind)}`),
    formatBibliography: (ids, style) => api(`/citations/bibliography?style=${encodeURIComponent(style)}`, {
      method: "POST", body: JSON.stringify({ citation_ids: ids }),
    }),
  };

  // --------------------------------------------------------- citation styles

  let citationStylesCache = null;

  async function getCitationStyles() {
    if (!citationStylesCache) {
      citationStylesCache = await Api.listCitationStyles();
    }
    return citationStylesCache;
  }

  function getPreferredStyle() { return localStorage.getItem("ct_citation_style") || "apa"; }
  function setPreferredStyle(style) { localStorage.setItem("ct_citation_style", style); }
  function getPreferredKind() { return localStorage.getItem("ct_citation_kind") || "reference"; }
  function setPreferredKind(kind) { localStorage.setItem("ct_citation_kind", kind); }

  async function copyToClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return;
    }
    // Fallback for non-secure contexts (e.g. plain-HTTP local dev).
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try {
      if (!document.execCommand("copy")) throw new Error("execCommand failed");
    } finally {
      document.body.removeChild(ta);
    }
  }

  function handleAuthError(err) {
    if (err && err.status === 401) {
      setToken(null);
      currentUser = null;
      modalRoot.innerHTML = "";
      location.hash = "#/login";
      showToast("Session expired — please log in again.", true);
      return true;
    }
    return false;
  }

  // --------------------------------------------------------------- shell

  function shellHtml(activeNav, innerHtml) {
    return `
      <div class="shell">
        <header class="topbar">
          <div class="brand">${icon.book}<span>Citation Tracker</span></div>
          <div class="topbar-actions">
            <a href="#/library" class="btn btn-ghost btn-sm ${activeNav === "library" ? "active" : ""}">Library</a>
            <a href="#/import" class="btn btn-ghost btn-sm ${activeNav === "import" ? "active" : ""}">Import</a>
            <a href="#/add" class="btn btn-primary btn-sm">+ Add Citation</a>
          </div>
          <div class="topbar-user">
            <span>${escapeHtml(currentUser ? currentUser.email : "")}</span>
            <button class="btn btn-ghost btn-sm" id="logout-btn" type="button">Log out</button>
          </div>
        </header>
        <main class="main" id="main-content">${innerHtml}</main>
      </div>
    `;
  }

  function mountShell(activeNav, innerHtml) {
    app.innerHTML = shellHtml(activeNav, innerHtml);
    document.getElementById("logout-btn").addEventListener("click", async () => {
      try { await Api.logout(); } catch { /* client-side discard regardless */ }
      setToken(null);
      currentUser = null;
      location.hash = "#/login";
    });
  }

  function mainEl() { return document.getElementById("main-content"); }

  // ---------------------------------------------------------------- auth

  function renderAuth(mode, opts = {}) {
    const isLogin = mode !== "register";
    app.innerHTML = `
      <div class="auth-wrap">
        <div class="auth-card">
          <div class="auth-logo">${icon.book}<span>Citation Tracker</span></div>
          <p class="auth-sub">Your personal reference library.</p>
          <div class="auth-tabs">
            <button type="button" data-tab="login" class="${isLogin ? "active" : ""}">Log in</button>
            <button type="button" data-tab="register" class="${!isLogin ? "active" : ""}">Register</button>
          </div>
          <div id="auth-alert"></div>
          <form id="auth-form" novalidate>
            <div class="field">
              <label for="auth-email">Email</label>
              <input id="auth-email" name="email" type="email" autocomplete="username" required value="${escapeHtml(opts.email || "")}">
            </div>
            <div class="field">
              <label for="auth-password">Password</label>
              <input id="auth-password" name="password" type="password"
                autocomplete="${isLogin ? "current-password" : "new-password"}" required minlength="8">
              ${!isLogin ? '<span class="field-hint">At least 8 characters.</span>' : ""}
            </div>
            <div class="form-actions">
              <button type="submit" class="btn btn-primary" id="auth-submit" style="flex:1">
                ${isLogin ? "Log in" : "Create account"}
              </button>
            </div>
          </form>
          ${isLogin ? '<p style="text-align:center;margin:16px 0 0"><a href="#/forgot-password" style="font-size:13px">Forgot password?</a></p>' : ""}
        </div>
      </div>
    `;

    if (opts.notice) {
      document.getElementById("auth-alert").innerHTML =
        `<div class="alert alert-success">${escapeHtml(opts.notice)}</div>`;
    }

    app.querySelectorAll("[data-tab]").forEach((btn) => {
      btn.addEventListener("click", () => { location.hash = "#/" + btn.dataset.tab; });
    });

    document.getElementById("auth-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = document.getElementById("auth-email").value.trim();
      const password = document.getElementById("auth-password").value;
      const alertBox = document.getElementById("auth-alert");
      const submitBtn = document.getElementById("auth-submit");
      alertBox.innerHTML = "";
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span class="spinner"></span> Working…';

      try {
        if (isLogin) {
          const tok = await Api.login(email, password);
          setToken(tok.access_token);
          currentUser = await Api.me();
          location.hash = "#/library";
        } else {
          await Api.register(email, password);
          renderAuth("login", { email, notice: "Account created — log in below." });
        }
      } catch (err) {
        alertBox.innerHTML = `<div class="alert alert-error">${escapeHtml(err.message)}</div>`;
        submitBtn.disabled = false;
        submitBtn.innerHTML = isLogin ? "Log in" : "Create account";
      }
    });
  }

  function renderForgotPassword() {
    app.innerHTML = `
      <div class="auth-wrap">
        <div class="auth-card">
          <div class="auth-logo">${icon.book}<span>Citation Tracker</span></div>
          <p class="auth-sub">We'll email you a link to reset your password.</p>
          <div id="fp-alert"></div>
          <form id="fp-form" novalidate>
            <div class="field">
              <label for="fp-email">Email</label>
              <input id="fp-email" type="email" autocomplete="username" required>
            </div>
            <div class="form-actions">
              <button type="submit" class="btn btn-primary" id="fp-submit" style="flex:1">Send reset link</button>
            </div>
          </form>
          <p style="text-align:center;margin:16px 0 0"><a href="#/login" style="font-size:13px">Back to log in</a></p>
        </div>
      </div>
    `;

    document.getElementById("fp-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = document.getElementById("fp-email").value.trim();
      const alertBox = document.getElementById("fp-alert");
      const submitBtn = document.getElementById("fp-submit");
      alertBox.innerHTML = "";
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span class="spinner"></span> Sending…';

      try {
        const result = await Api.forgotPassword(email);
        document.getElementById("fp-form").hidden = true;
        alertBox.innerHTML = `<div class="alert alert-success">${escapeHtml(result.message)}</div>`;
      } catch (err) {
        alertBox.innerHTML = `<div class="alert alert-error">${escapeHtml(err.message)}</div>`;
        submitBtn.disabled = false;
        submitBtn.innerHTML = "Send reset link";
      }
    });
  }

  function renderResetPassword(token) {
    app.innerHTML = `
      <div class="auth-wrap">
        <div class="auth-card">
          <div class="auth-logo">${icon.book}<span>Citation Tracker</span></div>
          <p class="auth-sub">Choose a new password.</p>
          <div id="rp-alert"></div>
          <form id="rp-form" novalidate>
            <div class="field">
              <label for="rp-password">New password</label>
              <input id="rp-password" type="password" autocomplete="new-password" required minlength="8">
              <span class="field-hint">At least 8 characters.</span>
            </div>
            <div class="field">
              <label for="rp-password-confirm">Confirm new password</label>
              <input id="rp-password-confirm" type="password" autocomplete="new-password" required minlength="8">
            </div>
            <div class="form-actions">
              <button type="submit" class="btn btn-primary" id="rp-submit" style="flex:1">Reset password</button>
            </div>
          </form>
          <p style="text-align:center;margin:16px 0 0"><a href="#/login" style="font-size:13px">Back to log in</a></p>
        </div>
      </div>
    `;

    if (!token) {
      document.getElementById("rp-form").hidden = true;
      document.getElementById("rp-alert").innerHTML =
        '<div class="alert alert-error">This reset link is missing its token. Request a new one from the forgot-password page.</div>';
      return;
    }

    document.getElementById("rp-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const password = document.getElementById("rp-password").value;
      const confirm = document.getElementById("rp-password-confirm").value;
      const alertBox = document.getElementById("rp-alert");
      const submitBtn = document.getElementById("rp-submit");
      alertBox.innerHTML = "";

      if (password !== confirm) {
        alertBox.innerHTML = '<div class="alert alert-error">Passwords don’t match.</div>';
        return;
      }

      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span class="spinner"></span> Resetting…';
      try {
        const result = await Api.resetPassword(token, password);
        document.getElementById("rp-form").hidden = true;
        alertBox.innerHTML = `<div class="alert alert-success">${escapeHtml(result.message)}</div>`;
      } catch (err) {
        alertBox.innerHTML = `<div class="alert alert-error">${escapeHtml(err.message)}</div>`;
        submitBtn.disabled = false;
        submitBtn.innerHTML = "Reset password";
      }
    });
  }

  // ------------------------------------------------------------- library

  function statusBadge(status) {
    const label = { unread: "Unread", reading: "Reading", read: "Read" }[status] || status;
    return `<span class="badge badge-${escapeHtml(status)}">${escapeHtml(label)}</span>`;
  }

  function libraryQueryString() {
    const qs = new URLSearchParams();
    if (libState.title) qs.set("title", libState.title);
    if (libState.authors) qs.set("authors", libState.authors);
    if (libState.journal) qs.set("journal", libState.journal);
    if (libState.year) qs.set("year", libState.year);
    if (libState.read_status) qs.set("read_status", libState.read_status);
    qs.set("sort", libState.sort);
    qs.set("order", libState.order);
    qs.set("page", String(libState.page));
    qs.set("page_size", String(libState.page_size));
    return qs.toString();
  }

  async function renderLibrary() {
    mountShell("library", `<div class="loading-block"><span class="spinner"></span> Loading library…</div>`);

    let data, styles;
    try {
      [data, styles] = await Promise.all([
        Api.listCitations(libraryQueryString()),
        getCitationStyles(),
      ]);
    } catch (err) {
      if (handleAuthError(err)) return;
      mainEl().innerHTML = `<div class="alert alert-error">${escapeHtml(err.message)}</div>`;
      return;
    }

    // Drop selected ids that no longer exist server-side isn't checked here — the
    // bibliography endpoint validates ownership and would 404 on a stale id, which is
    // vanishingly unlikely (only happens if the citation was deleted elsewhere mid-session).
    mainEl().innerHTML = libraryContentHtml(data, styles);
    bindLibraryEvents(data);
  }

  function selectionBarHtml(styles) {
    const preferred = getPreferredStyle();
    const options = styles.map((s) =>
      `<option value="${escapeHtml(s.key)}" ${s.key === preferred ? "selected" : ""}>${escapeHtml(s.label)}</option>`
    ).join("");
    const count = selectedIds.size;
    return `
      <div class="selection-bar">
        <span id="sel-count">${count} selected</span>
        <span class="spacer"></span>
        <label for="f-style" class="cell-muted">Style</label>
        <select id="f-style">${options}</select>
        <button type="button" class="btn btn-sm btn-primary" id="copy-bib-btn" ${count === 0 ? "disabled" : ""}>Copy bibliography</button>
        <button type="button" class="btn btn-sm btn-ghost" id="clear-sel-btn" ${count === 0 ? "disabled" : ""}>Clear selection</button>
      </div>
    `;
  }

  function sortIndicatorHtml(field) {
    if (libState.sort !== field) return '<span class="sort-indicator"></span>';
    return `<span class="sort-indicator active">${libState.order === "asc" ? "▲" : "▼"}</span>`;
  }

  function columnHeaderHtml(field, label) {
    const meta = SORT_FIELDS[field];
    const groupBtn = meta.groupable
      ? `<button type="button" class="col-group-btn ${libState.group === field ? "active" : ""}"
           data-group="${field}" title="Group by ${escapeHtml(label)}">⊞</button>`
      : "";
    return `
      <th class="sortable" data-sort="${field}">
        <span class="th-label">${escapeHtml(label)} ${sortIndicatorHtml(field)}</span>
        ${groupBtn}
      </th>
    `;
  }

  function theadHtml() {
    return `
      <tr>
        <th class="cell-select"><input type="checkbox" id="select-all-visible"></th>
        ${columnHeaderHtml("title", "Title")}
        ${columnHeaderHtml("authors", "Authors")}
        ${columnHeaderHtml("journal", "Journal")}
        ${columnHeaderHtml("year", "Year")}
        ${columnHeaderHtml("read_status", "Status")}
      </tr>
      <tr class="filter-row">
        <th></th>
        <th><input type="search" id="col-f-title" placeholder="Search title…" value="${escapeHtml(libState.title)}"></th>
        <th><input type="search" id="col-f-authors" placeholder="Search authors…" value="${escapeHtml(libState.authors)}"></th>
        <th><input type="search" id="col-f-journal" placeholder="Search journal…" value="${escapeHtml(libState.journal)}"></th>
        <th><input type="number" id="col-f-year" placeholder="Year" value="${escapeHtml(libState.year)}"></th>
        <th>
          <select id="col-f-status">
            <option value="">All</option>
            <option value="unread" ${libState.read_status === "unread" ? "selected" : ""}>Unread</option>
            <option value="reading" ${libState.read_status === "reading" ? "selected" : ""}>Reading</option>
            <option value="read" ${libState.read_status === "read" ? "selected" : ""}>Read</option>
          </select>
        </th>
      </tr>
    `;
  }

  function rowHtml(item) {
    const c = item.citation;
    const authors = (c.authors || []).join(", ") || "—";
    const checked = selectedIds.has(item.id) ? "checked" : "";
    return `
      <tr data-id="${escapeHtml(item.id)}">
        <td class="cell-select"><input type="checkbox" class="row-select" data-id="${escapeHtml(item.id)}" ${checked}></td>
        <td class="cell-title">
          ${escapeHtml(c.title)}${item.notes ? '<span class="note-dot" title="Has notes"></span>' : ""}
          ${c.doi ? `<div class="row-doi">${escapeHtml(c.doi)}</div>` : ""}
        </td>
        <td class="cell-muted">${escapeHtml(authors)}</td>
        <td class="cell-muted">${escapeHtml(c.journal || "—")}</td>
        <td class="cell-muted">${c.year ?? "—"}</td>
        <td>${statusBadge(item.read_status)}</td>
      </tr>
    `;
  }

  function groupLabelFor(field, item) {
    if (field === "journal") return item.citation.journal || "—";
    if (field === "year") return item.citation.year != null ? String(item.citation.year) : "—";
    if (field === "read_status") {
      return { unread: "Unread", reading: "Reading", read: "Read" }[item.read_status] || item.read_status;
    }
    return "—";
  }

  function tbodyHtml(items) {
    if (items.length === 0) return "";
    if (!libState.group) return items.map(rowHtml).join("");

    const field = libState.group;
    // Items already arrive sorted by this field (grouping forces sort=field),
    // so a single pass over the current page groups contiguous runs correctly.
    const groups = [];
    for (const item of items) {
      const label = groupLabelFor(field, item);
      const current = groups[groups.length - 1];
      if (!current || current.label !== label) groups.push({ label, items: [item] });
      else current.items.push(item);
    }

    return groups.map((g) => {
      const key = field + ":" + g.label;
      const collapsed = collapsedGroups.has(key);
      const header = `
        <tr class="group-row">
          <td colspan="6">
            <button type="button" class="group-toggle-btn" data-group-key="${escapeHtml(key)}">
              <span class="group-chevron">${collapsed ? "▶" : "▼"}</span>
              ${escapeHtml(g.label)} <span class="cell-muted">(${g.items.length})</span>
            </button>
          </td>
        </tr>
      `;
      return header + (collapsed ? "" : g.items.map(rowHtml).join(""));
    }).join("");
  }

  function libraryContentHtml(data, styles) {
    const hasFilters = libState.title || libState.authors || libState.journal || libState.year || libState.read_status;

    if (data.items.length === 0) {
      return `
        ${selectionBarHtml(styles)}
        <div class="lib-table-wrap">
          <table class="lib-table">
            <thead>${theadHtml()}</thead>
          </table>
        </div>
        <div class="empty-state">
          <h2>${hasFilters ? "No citations match your filters" : "Your library is empty"}</h2>
          <p>${hasFilters
            ? "Try clearing the column search boxes above."
            : "Import references from BibTeX, RIS, or a DOI, or add one by hand."}</p>
          <div class="empty-actions">
            <a href="#/import" class="btn btn-primary">Import citations</a>
            <a href="#/add" class="btn">Add manually</a>
          </div>
        </div>
      `;
    }

    const totalPages = Math.max(1, Math.ceil(data.total / data.page_size));

    return `
      ${selectionBarHtml(styles)}
      <div class="lib-table-wrap">
        <table class="lib-table">
          <thead>${theadHtml()}</thead>
          <tbody>${tbodyHtml(data.items)}</tbody>
        </table>
      </div>
      <div class="pagination">
        <span class="cell-muted">${data.total} citation${data.total === 1 ? "" : "s"} — page ${data.page} of ${totalPages}</span>
        <div class="pages">
          <select id="f-page-size">
            <option value="10" ${data.page_size === 10 ? "selected" : ""}>10 / page</option>
            <option value="20" ${data.page_size === 20 ? "selected" : ""}>20 / page</option>
            <option value="50" ${data.page_size === 50 ? "selected" : ""}>50 / page</option>
            <option value="100" ${data.page_size === 100 ? "selected" : ""}>100 / page</option>
          </select>
          <button type="button" class="btn btn-sm" id="page-prev" ${data.page <= 1 ? "disabled" : ""}>${icon.chevronLeft} Prev</button>
          <button type="button" class="btn btn-sm" id="page-next" ${data.page >= totalPages ? "disabled" : ""}>Next ${icon.chevronRight}</button>
        </div>
      </div>
    `;
  }

  function bindLibraryEvents(data) {
    const refresh = () => { libState.page = 1; renderLibrary(); };

    const titleInput = document.getElementById("col-f-title");
    if (titleInput) titleInput.addEventListener("input", debounce((e) => {
      libState.title = e.target.value; refresh();
    }, 300));
    const authorsInput = document.getElementById("col-f-authors");
    if (authorsInput) authorsInput.addEventListener("input", debounce((e) => {
      libState.authors = e.target.value; refresh();
    }, 300));
    const journalInput = document.getElementById("col-f-journal");
    if (journalInput) journalInput.addEventListener("input", debounce((e) => {
      libState.journal = e.target.value; refresh();
    }, 300));
    const yearInput = document.getElementById("col-f-year");
    if (yearInput) yearInput.addEventListener("input", debounce((e) => {
      libState.year = e.target.value; refresh();
    }, 300));
    const statusSelect = document.getElementById("col-f-status");
    if (statusSelect) statusSelect.addEventListener("change", (e) => {
      libState.read_status = e.target.value; refresh();
    });

    app.querySelectorAll("th.sortable").forEach((th) => {
      th.addEventListener("click", (e) => {
        if (e.target.closest(".col-group-btn")) return;
        const field = th.dataset.sort;
        if (libState.sort === field) {
          libState.order = libState.order === "asc" ? "desc" : "asc";
        } else {
          libState.sort = field;
          libState.order = SORT_FIELDS[field].numeric ? "desc" : "asc";
          // Grouping only makes sense while rows are actually sorted by the
          // grouped column, since it relies on same-value rows being contiguous.
          if (libState.group && libState.group !== field) libState.group = null;
        }
        libState.page = 1;
        renderLibrary();
      });
    });

    app.querySelectorAll(".col-group-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const field = btn.dataset.group;
        if (libState.group === field) {
          libState.group = null;
        } else {
          libState.group = field;
          libState.sort = field;
          libState.order = "asc";
        }
        libState.page = 1;
        renderLibrary();
      });
    });

    app.querySelectorAll(".group-toggle-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const key = btn.dataset.groupKey;
        if (collapsedGroups.has(key)) collapsedGroups.delete(key); else collapsedGroups.add(key);
        renderLibrary();
      });
    });

    const pageSizeSel = document.getElementById("f-page-size");
    if (pageSizeSel) pageSizeSel.addEventListener("change", (e) => {
      libState.page_size = Number(e.target.value); refresh();
    });
    const prevBtn = document.getElementById("page-prev");
    if (prevBtn) prevBtn.addEventListener("click", () => {
      if (libState.page > 1) { libState.page -= 1; renderLibrary(); }
    });
    const nextBtn = document.getElementById("page-next");
    if (nextBtn) nextBtn.addEventListener("click", () => {
      libState.page += 1; renderLibrary();
    });

    app.querySelectorAll("tr[data-id]").forEach((row) => {
      row.addEventListener("click", (e) => {
        if (e.target.closest("input, button, a")) return; // let checkbox clicks through
        location.hash = "#/citation/" + row.dataset.id;
      });
    });

    const styleSel = document.getElementById("f-style");
    if (styleSel) styleSel.addEventListener("change", (e) => { setPreferredStyle(e.target.value); });

    app.querySelectorAll(".row-select").forEach((cb) => {
      cb.addEventListener("change", (e) => {
        const id = e.target.dataset.id;
        if (e.target.checked) selectedIds.add(id); else selectedIds.delete(id);
        updateSelectionBar(data);
      });
    });

    const selectAll = document.getElementById("select-all-visible");
    if (selectAll) {
      selectAll.checked = data.items.length > 0 && data.items.every((item) => selectedIds.has(item.id));
      selectAll.addEventListener("change", (e) => {
        data.items.forEach((item) => {
          if (e.target.checked) selectedIds.add(item.id); else selectedIds.delete(item.id);
        });
        renderLibrary();
      });
    }

    const clearSelBtn = document.getElementById("clear-sel-btn");
    if (clearSelBtn) clearSelBtn.addEventListener("click", () => {
      selectedIds.clear();
      renderLibrary();
    });

    const copyBibBtn = document.getElementById("copy-bib-btn");
    if (copyBibBtn) copyBibBtn.addEventListener("click", async () => {
      const style = document.getElementById("f-style").value;
      copyBibBtn.disabled = true;
      try {
        const result = await Api.formatBibliography(Array.from(selectedIds), style);
        await copyToClipboard(result.text);
        showToast(`Copied bibliography (${result.count} citation${result.count === 1 ? "" : "s"}) to clipboard.`);
      } catch (err) {
        if (handleAuthError(err)) return;
        showToast(err.message, true);
      } finally {
        copyBibBtn.disabled = selectedIds.size === 0;
      }
    });
  }

  // Cheap in-place refresh of the selection count/buttons without re-rendering the
  // whole table (and losing scroll position) on every single checkbox click.
  function updateSelectionBar(data) {
    const countEl = document.getElementById("sel-count");
    if (countEl) countEl.textContent = `${selectedIds.size} selected`;
    const copyBtn = document.getElementById("copy-bib-btn");
    if (copyBtn) copyBtn.disabled = selectedIds.size === 0;
    const clearBtn = document.getElementById("clear-sel-btn");
    if (clearBtn) clearBtn.disabled = selectedIds.size === 0;
    const selectAll = document.getElementById("select-all-visible");
    if (selectAll) selectAll.checked = data.items.every((item) => selectedIds.has(item.id));
  }

  // -------------------------------------------------------------- detail

  async function renderDetail(id) {
    mountShell("library", `<div class="loading-block"><span class="spinner"></span> Loading citation…</div>`);

    let item, styles;
    try {
      [item, styles] = await Promise.all([Api.getCitation(id), getCitationStyles()]);
    } catch (err) {
      if (handleAuthError(err)) return;
      mainEl().innerHTML = `
        <a href="#/library" class="back-link">${icon.chevronLeft} Back to library</a>
        <div class="alert alert-error">${escapeHtml(err.message)}</div>
      `;
      return;
    }

    mainEl().innerHTML = detailContentHtml(item, styles);
    bindDetailEvents(item, styles);
  }

  function kindOptionsHtml(styles, styleKey, preferredKind) {
    const style = styles.find((s) => s.key === styleKey) || styles[0];
    const kinds = style ? style.kinds : [];
    const validKind = kinds.some((k) => k.key === preferredKind) ? preferredKind : (kinds[0] || {}).key;
    return kinds.map((k) =>
      `<option value="${escapeHtml(k.key)}" ${k.key === validKind ? "selected" : ""}>${escapeHtml(k.label)}</option>`
    ).join("");
  }

  function detailContentHtml(item, styles) {
    const c = item.citation;
    const authorsStr = (c.authors || []).join(", ");
    const preferred = getPreferredStyle();
    const styleOptions = styles.map((s) =>
      `<option value="${escapeHtml(s.key)}" ${s.key === preferred ? "selected" : ""}>${escapeHtml(s.label)}</option>`
    ).join("");
    const kindOptions = kindOptionsHtml(styles, preferred, getPreferredKind());

    return `
      <a href="#/library" class="back-link">${icon.chevronLeft} Back to library</a>
      <div class="detail-grid">
        <div>
          <div class="panel">
            <h3>Citation details</h3>
            <div class="shared-note">
              ⚠️ These fields describe the shared reference record. Editing them may
              also change what other users with this citation in their library see.
            </div>
            <div id="detail-alert"></div>
            <form id="meta-form">
              <div class="field">
                <label for="m-title">Title</label>
                <input id="m-title" required value="${escapeHtml(c.title)}">
              </div>
              <div class="field">
                <label for="m-authors">Authors (comma-separated)</label>
                <input id="m-authors" value="${escapeHtml(authorsStr)}">
              </div>
              <div class="two-col">
                <div class="field">
                  <label for="m-journal">Journal</label>
                  <input id="m-journal" value="${escapeHtml(c.journal || "")}">
                </div>
                <div class="field">
                  <label for="m-year">Year</label>
                  <input id="m-year" type="number" value="${c.year ?? ""}">
                </div>
              </div>
              <div class="two-col">
                <div class="field">
                  <label for="m-doi">DOI</label>
                  <input id="m-doi" value="${escapeHtml(c.doi || "")}">
                </div>
                <div class="field">
                  <label for="m-count">Citation count</label>
                  <input id="m-count" type="number" min="0" value="${c.citation_count ?? ""}">
                </div>
              </div>
              <div class="field">
                <label for="m-abstract">Abstract</label>
                <textarea id="m-abstract" rows="5">${escapeHtml(c.abstract || "")}</textarea>
              </div>
              <div class="form-actions">
                <button type="submit" class="btn btn-primary">Save details</button>
              </div>
            </form>
          </div>

          <div class="panel">
            <h3>Danger zone</h3>
            <div id="delete-zone">
              <button type="button" class="btn btn-danger" id="delete-btn">Delete citation</button>
            </div>
          </div>
        </div>

        <div>
          <div class="panel">
            <h3>Your notes &amp; status</h3>
            <div id="notes-alert"></div>
            <form id="notes-form">
              <div class="field">
                <label for="n-status">Read status</label>
                <select id="n-status">
                  <option value="unread" ${item.read_status === "unread" ? "selected" : ""}>Unread</option>
                  <option value="reading" ${item.read_status === "reading" ? "selected" : ""}>Reading</option>
                  <option value="read" ${item.read_status === "read" ? "selected" : ""}>Read</option>
                </select>
              </div>
              <div class="field">
                <label for="n-notes">Notes</label>
                <textarea id="n-notes" rows="6" placeholder="Your private notes on this reference…">${escapeHtml(item.notes || "")}</textarea>
              </div>
              <div class="form-actions">
                <button type="submit" class="btn btn-primary" style="flex:1">Save notes</button>
              </div>
            </form>
          </div>

          <div class="panel">
            <h3>Cite this</h3>
            <div class="two-col">
              <div class="field">
                <label for="cite-style">Style</label>
                <select id="cite-style">${styleOptions}</select>
              </div>
              <div class="field">
                <label for="cite-kind">Format</label>
                <select id="cite-kind">${kindOptions}</select>
              </div>
            </div>
            <div id="cite-preview" class="cite-preview"></div>
            <div class="form-actions">
              <button type="button" class="btn btn-primary" id="copy-cite-btn" style="flex:1">Copy citation</button>
            </div>
          </div>

          <div class="panel">
            <h3>Record info</h3>
            <div class="detail-meta">
              Added to your library ${fmtDate(item.added_at)}${c.doi ? `<br><a href="https://doi.org/${escapeHtml(c.doi)}" target="_blank" rel="noopener">View at doi.org →</a>` : ""}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function bindDetailEvents(item, styles) {
    document.getElementById("meta-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const alertBox = document.getElementById("detail-alert");
      alertBox.innerHTML = "";
      const authors = document.getElementById("m-authors").value
        .split(",").map((s) => s.trim()).filter(Boolean);
      const payload = {
        title: document.getElementById("m-title").value.trim(),
        authors,
        journal: document.getElementById("m-journal").value.trim() || null,
        year: document.getElementById("m-year").value ? Number(document.getElementById("m-year").value) : null,
        doi: document.getElementById("m-doi").value.trim() || null,
        citation_count: document.getElementById("m-count").value ? Number(document.getElementById("m-count").value) : null,
        abstract: document.getElementById("m-abstract").value.trim() || null,
      };
      try {
        await Api.updateCitation(item.id, payload);
        showToast("Citation details saved.");
        renderDetail(item.id);
      } catch (err) {
        if (handleAuthError(err)) return;
        alertBox.innerHTML = `<div class="alert alert-error">${escapeHtml(err.message)}</div>`;
      }
    });

    document.getElementById("notes-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const alertBox = document.getElementById("notes-alert");
      alertBox.innerHTML = "";
      const payload = {
        read_status: document.getElementById("n-status").value,
        notes: document.getElementById("n-notes").value.trim() || null,
      };
      try {
        await Api.updateCitation(item.id, payload);
        showToast("Notes saved.");
      } catch (err) {
        if (handleAuthError(err)) return;
        alertBox.innerHTML = `<div class="alert alert-error">${escapeHtml(err.message)}</div>`;
      }
    });

    document.getElementById("delete-btn").addEventListener("click", () => {
      document.getElementById("delete-zone").innerHTML = `
        <p class="field-hint" style="margin-bottom:10px">This can't be undone. Delete this citation from your library?</p>
        <div class="form-actions" style="margin-top:0">
          <button type="button" class="btn btn-danger" id="confirm-delete">Confirm delete</button>
          <button type="button" class="btn" id="cancel-delete">Cancel</button>
        </div>
      `;
      document.getElementById("cancel-delete").addEventListener("click", () => renderDetail(item.id));
      document.getElementById("confirm-delete").addEventListener("click", async () => {
        try {
          await Api.deleteCitation(item.id);
          showToast("Citation deleted.");
          location.hash = "#/library";
        } catch (err) {
          if (handleAuthError(err)) return;
          showToast(err.message, true);
        }
      });
    });

    const citeStyleSel = document.getElementById("cite-style");
    const citeKindSel = document.getElementById("cite-kind");
    const citePreview = document.getElementById("cite-preview");
    const copyCiteBtn = document.getElementById("copy-cite-btn");

    async function refreshCitePreview() {
      citePreview.textContent = "Loading…";
      try {
        const result = await Api.formatCitation(item.id, citeStyleSel.value, citeKindSel.value);
        citePreview.textContent = result.text;
      } catch (err) {
        if (handleAuthError(err)) return;
        citePreview.textContent = "";
        showToast(err.message, true);
      }
    }

    citeStyleSel.addEventListener("change", () => {
      setPreferredStyle(citeStyleSel.value);
      citeKindSel.innerHTML = kindOptionsHtml(styles, citeStyleSel.value, citeKindSel.value);
      setPreferredKind(citeKindSel.value);
      refreshCitePreview();
    });
    citeKindSel.addEventListener("change", () => {
      setPreferredKind(citeKindSel.value);
      refreshCitePreview();
    });
    copyCiteBtn.addEventListener("click", async () => {
      if (!citePreview.textContent) return;
      try {
        await copyToClipboard(citePreview.textContent);
        showToast("Citation copied to clipboard.");
      } catch (err) {
        showToast("Couldn't copy to clipboard: " + err.message, true);
      }
    });

    refreshCitePreview();
  }

  // ------------------------------------------------------------ add modal

  function authorRowHtml(value) {
    return `
      <div class="author-row">
        <input type="text" class="author-input" placeholder="Author name" value="${escapeHtml(value || "")}">
        <button type="button" class="btn btn-ghost btn-sm remove-author" title="Remove">${icon.close}</button>
      </div>
    `;
  }

  function openAddModal() {
    let addTab = "doi"; // doi | upload | manual — DOI first: the fastest path for the common case.
    let uploadKind = "bibtex";
    let uploadResult = null;
    let uploadError = null;

    const closeModal = () => { modalRoot.innerHTML = ""; location.hash = "#/library"; };

    function renderShellFrame() {
      modalRoot.innerHTML = `
        <div class="modal-backdrop" id="add-backdrop">
          <div class="modal">
            <div class="modal-header">
              <h2>Add citation</h2>
              <button type="button" class="btn btn-ghost btn-sm" id="add-close">${icon.close}</button>
            </div>
            <div class="tabs">
              <button type="button" data-am-tab="doi" class="${addTab === "doi" ? "active" : ""}">DOI lookup</button>
              <button type="button" data-am-tab="upload" class="${addTab === "upload" ? "active" : ""}">Upload file</button>
              <button type="button" data-am-tab="manual" class="${addTab === "manual" ? "active" : ""}">Manual entry</button>
            </div>
            <div id="add-tab-body"></div>
          </div>
        </div>
      `;
      document.getElementById("add-backdrop").addEventListener("click", (e) => {
        if (e.target.id === "add-backdrop") closeModal();
      });
      document.getElementById("add-close").addEventListener("click", closeModal);
      modalRoot.querySelectorAll("[data-am-tab]").forEach((btn) => {
        btn.addEventListener("click", () => { addTab = btn.dataset.amTab; renderShellFrame(); });
      });
      renderTabBody();
    }

    function renderTabBody() {
      const body = document.getElementById("add-tab-body");
      if (addTab === "doi") { body.innerHTML = doiTabHtml(); bindDoiTab(); }
      else if (addTab === "upload") { body.innerHTML = uploadTabHtml(); bindUploadTab(); }
      else { body.innerHTML = manualTabHtml(); bindManualTab(); }
    }

    // ---- DOI tab: paste a DOI, it's looked up and added immediately ----
    function doiTabHtml() {
      return `
        <div id="am-doi-alert"></div>
        <form id="am-doi-form">
          <div class="field">
            <label for="am-doi-input">DOI</label>
            <input id="am-doi-input" placeholder="10.1000/xyz123" required autofocus>
            <span class="field-hint">Looked up via Crossref and added to your library right away.</span>
          </div>
          <div class="form-actions">
            <button type="submit" class="btn btn-primary" id="am-doi-submit" style="flex:1">Look up &amp; add</button>
          </div>
        </form>
      `;
    }

    function bindDoiTab() {
      document.getElementById("am-doi-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        const alertBox = document.getElementById("am-doi-alert");
        const submitBtn = document.getElementById("am-doi-submit");
        const doi = document.getElementById("am-doi-input").value.trim();
        alertBox.innerHTML = "";
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="spinner"></span> Looking up…';
        try {
          const created = await Api.importDoi(doi);
          closeModal();
          showToast("Citation added.");
          location.hash = "#/citation/" + created.id;
        } catch (err) {
          if (handleAuthError(err)) return;
          alertBox.innerHTML = `<div class="alert alert-error">${escapeHtml(err.message)}</div>`;
          submitBtn.disabled = false;
          submitBtn.innerHTML = "Look up &amp; add";
        }
      });
    }

    // ---- Upload tab: a single BibTeX/RIS file, quick import ----
    function uploadTabHtml() {
      if (uploadResult) {
        return `
          ${fileImportResultsHtml(uploadResult)}
          <div class="form-actions">
            <button type="button" class="btn btn-primary" id="am-upload-done" style="flex:1">Done</button>
          </div>
        `;
      }
      const label = uploadKind === "bibtex" ? ".bib" : ".ris";
      const accept = uploadKind === "bibtex" ? ".bib,.bibtex" : ".ris";
      return `
        <div id="am-upload-alert"></div>
        <div class="toolbar-group" style="margin-bottom:12px">
          <button type="button" class="btn btn-sm ${uploadKind === "bibtex" ? "btn-primary" : ""}" id="am-kind-bibtex">BibTeX</button>
          <button type="button" class="btn btn-sm ${uploadKind === "ris" ? "btn-primary" : ""}" id="am-kind-ris">RIS</button>
        </div>
        <form id="am-file-form">
          <label class="dropzone" id="am-dropzone" for="am-file-input">
            ${icon.upload}
            <div style="margin-top:10px;font-weight:600">Drop a ${label} file here, or click to browse</div>
            <div class="field-hint" style="margin-top:4px">Existing citations (matched by DOI) are skipped, not duplicated.</div>
          </label>
          <input id="am-file-input" type="file" accept="${accept}" style="display:none">
          <div class="form-actions">
            <button type="submit" class="btn btn-primary" id="am-file-submit" disabled style="flex:1">Upload &amp; add</button>
            <span id="am-file-name" class="field-hint"></span>
          </div>
        </form>
      `;
    }

    function bindUploadTab() {
      if (uploadResult) {
        document.getElementById("am-upload-done").addEventListener("click", closeModal);
        return;
      }

      document.getElementById("am-kind-bibtex").addEventListener("click", () => {
        if (uploadKind !== "bibtex") { uploadKind = "bibtex"; renderTabBody(); }
      });
      document.getElementById("am-kind-ris").addEventListener("click", () => {
        if (uploadKind !== "ris") { uploadKind = "ris"; renderTabBody(); }
      });

      const dropzone = document.getElementById("am-dropzone");
      const fileInput = document.getElementById("am-file-input");
      const submitBtn = document.getElementById("am-file-submit");
      const fileNameEl = document.getElementById("am-file-name");
      let selectedFile = null;

      fileInput.addEventListener("change", () => {
        selectedFile = fileInput.files[0] || null;
        fileNameEl.textContent = selectedFile ? selectedFile.name : "";
        submitBtn.disabled = !selectedFile;
      });
      ["dragover", "dragenter"].forEach((evt) => dropzone.addEventListener(evt, (e) => {
        e.preventDefault(); dropzone.classList.add("drag");
      }));
      ["dragleave", "drop"].forEach((evt) => dropzone.addEventListener(evt, (e) => {
        e.preventDefault(); dropzone.classList.remove("drag");
      }));
      dropzone.addEventListener("drop", (e) => {
        const f = e.dataTransfer.files[0];
        if (f) { selectedFile = f; fileNameEl.textContent = f.name; submitBtn.disabled = false; }
      });

      document.getElementById("am-file-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        if (!selectedFile) return;
        const alertBox = document.getElementById("am-upload-alert");
        alertBox.innerHTML = "";
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="spinner"></span> Uploading…';
        try {
          uploadResult = await Api.importFile(uploadKind, selectedFile);
          renderTabBody();
        } catch (err) {
          if (handleAuthError(err)) return;
          alertBox.innerHTML = `<div class="alert alert-error">${escapeHtml(err.message)}</div>`;
          submitBtn.disabled = false;
          submitBtn.innerHTML = "Upload &amp; add";
        }
      });
    }

    // ---- Manual tab: full form for a citation with no DOI ----
    function manualTabHtml() {
      return `
        <div id="am-manual-alert"></div>
        <form id="am-manual-form">
          <div class="field">
            <label for="a-title">Title *</label>
            <input id="a-title" required>
          </div>
          <div class="field">
            <label>Authors</label>
            <div id="authors-list">${authorRowHtml("")}</div>
            <button type="button" class="btn btn-sm" id="add-author">+ Add author</button>
          </div>
          <div class="two-col">
            <div class="field">
              <label for="a-journal">Journal</label>
              <input id="a-journal">
            </div>
            <div class="field">
              <label for="a-year">Year</label>
              <input id="a-year" type="number">
            </div>
          </div>
          <div class="two-col">
            <div class="field">
              <label for="a-doi">DOI</label>
              <input id="a-doi">
            </div>
            <div class="field">
              <label for="a-count">Citation count</label>
              <input id="a-count" type="number" min="0">
            </div>
          </div>
          <div class="field">
            <label for="a-abstract">Abstract</label>
            <textarea id="a-abstract" rows="3"></textarea>
          </div>
          <div class="field">
            <label for="a-status">Read status</label>
            <select id="a-status">
              <option value="unread" selected>Unread</option>
              <option value="reading">Reading</option>
              <option value="read">Read</option>
            </select>
          </div>
          <div class="field">
            <label for="a-notes">Notes</label>
            <textarea id="a-notes" rows="3"></textarea>
          </div>
          <div class="form-actions">
            <button type="submit" class="btn btn-primary" id="add-submit" style="flex:1">Add citation</button>
            <button type="button" class="btn" id="add-cancel">Cancel</button>
          </div>
        </form>
      `;
    }

    function bindManualTab() {
      function wireAuthorRows() {
        document.querySelectorAll(".remove-author").forEach((btn) => {
          btn.onclick = () => {
            const list = document.getElementById("authors-list");
            if (list.children.length > 1) btn.closest(".author-row").remove();
            else btn.closest(".author-row").querySelector("input").value = "";
          };
        });
      }
      wireAuthorRows();

      document.getElementById("add-author").addEventListener("click", () => {
        document.getElementById("authors-list").insertAdjacentHTML("beforeend", authorRowHtml(""));
        wireAuthorRows();
      });

      document.getElementById("add-cancel").addEventListener("click", closeModal);

      document.getElementById("am-manual-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        const alertBox = document.getElementById("am-manual-alert");
        const submitBtn = document.getElementById("add-submit");
        alertBox.innerHTML = "";

        const authors = Array.from(document.querySelectorAll(".author-input"))
          .map((i) => i.value.trim()).filter(Boolean);

        const payload = {
          title: document.getElementById("a-title").value.trim(),
          authors,
          journal: document.getElementById("a-journal").value.trim() || null,
          year: document.getElementById("a-year").value ? Number(document.getElementById("a-year").value) : null,
          doi: document.getElementById("a-doi").value.trim() || null,
          citation_count: document.getElementById("a-count").value ? Number(document.getElementById("a-count").value) : null,
          abstract: document.getElementById("a-abstract").value.trim() || null,
          notes: document.getElementById("a-notes").value.trim() || null,
          read_status: document.getElementById("a-status").value,
        };

        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="spinner"></span> Adding…';
        try {
          const created = await Api.createCitation(payload);
          closeModal();
          showToast("Citation added.");
          location.hash = "#/citation/" + created.id;
        } catch (err) {
          if (handleAuthError(err)) return;
          alertBox.innerHTML = `<div class="alert alert-error">${escapeHtml(err.message)}</div>`;
          submitBtn.disabled = false;
          submitBtn.innerHTML = "Add citation";
        }
      });
    }

    renderShellFrame();
  }

  // --------------------------------------------------------------- import

  function renderImport() {
    mountShell("import", importContentHtml());
    bindImportEvents();
  }

  function importContentHtml() {
    return `
      <div class="page-header"><h1>Import citations</h1></div>
      <div class="tabs">
        <button type="button" data-tab="bibtex" class="${importTab === "bibtex" ? "active" : ""}">BibTeX file</button>
        <button type="button" data-tab="ris" class="${importTab === "ris" ? "active" : ""}">RIS file</button>
        <button type="button" data-tab="doi" class="${importTab === "doi" ? "active" : ""}">DOI lookup</button>
      </div>
      <div id="import-alert"></div>
      <div id="import-body">${importBodyHtml()}</div>
      <div id="import-results">${importResultsHtml()}</div>
    `;
  }

  function importBodyHtml() {
    if (importTab === "doi") {
      return `
        <form id="doi-form" class="panel" style="max-width:480px">
          <div class="field">
            <label for="doi-input">DOI</label>
            <input id="doi-input" placeholder="10.1000/xyz123" required>
            <span class="field-hint">Looked up via Crossref and added to your library.</span>
          </div>
          <div class="form-actions">
            <button type="submit" class="btn btn-primary" id="doi-submit" style="flex:1">Look up &amp; import</button>
          </div>
        </form>
      `;
    }
    const label = importTab === "bibtex" ? ".bib" : ".ris";
    const accept = importTab === "bibtex" ? ".bib,.bibtex" : ".ris";
    return `
      <form id="file-form">
        <label class="dropzone" id="dropzone" for="file-input">
          ${icon.upload}
          <div style="margin-top:10px;font-weight:600">Drop a ${label} file here, or click to browse</div>
          <div class="field-hint" style="margin-top:4px">Existing citations (matched by DOI) are skipped, not duplicated.</div>
        </label>
        <input id="file-input" type="file" accept="${accept}" style="display:none">
        <div class="form-actions">
          <button type="submit" class="btn btn-primary" id="file-submit" disabled>Upload &amp; import</button>
          <span id="file-name" class="field-hint"></span>
        </div>
      </form>
    `;
  }

  function importResultsHtml() {
    if (importError) {
      return `<div class="import-results"><div class="alert alert-error">${escapeHtml(importError)}</div></div>`;
    }
    if (!importResult) return "";

    if (importResult.kind === "doi") {
      const c = importResult.citation;
      return `
        <div class="import-results">
          <div class="alert alert-success">Imported and added to your library.</div>
          <div class="import-item">
            <div>
              <strong>${escapeHtml(c.citation.title)}</strong><br>
              <span class="cell-muted">${escapeHtml((c.citation.authors || []).join(", "))}</span>
            </div>
            <a href="#/citation/${escapeHtml(c.id)}" class="btn btn-sm">View</a>
          </div>
        </div>
      `;
    }

    return fileImportResultsHtml(importResult);
  }

  // Shared by the Import page (bibtex/ris tabs) and the Add-citation modal's upload tab.
  function fileImportResultsHtml(r) {
    const items = r.items.map((it) => {
      if (it.error) {
        return `<div class="import-item"><span class="err-text">${escapeHtml(it.error)}</span></div>`;
      }
      const c = it.citation;
      return `
        <div class="import-item">
          <div>
            <strong>${escapeHtml(c.citation.title)}</strong><br>
            <span class="cell-muted">${escapeHtml((c.citation.authors || []).join(", "))}</span>
          </div>
          <a href="#/citation/${escapeHtml(c.id)}" class="btn btn-sm">View</a>
        </div>
      `;
    }).join("");

    return `
      <div class="import-results">
        <div class="import-summary">
          <span class="stat-chip ok">${r.imported} imported</span>
          <span class="stat-chip skip">${r.skipped} skipped</span>
          <span class="stat-chip err">${r.errors} errors</span>
        </div>
        ${items}
      </div>
    `;
  }

  function bindImportEvents() {
    app.querySelectorAll("[data-tab]").forEach((btn) => {
      btn.addEventListener("click", () => {
        importTab = btn.dataset.tab;
        importResult = null;
        importError = null;
        renderImport();
      });
    });

    if (importTab === "doi") {
      document.getElementById("doi-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        const doi = document.getElementById("doi-input").value.trim();
        const submitBtn = document.getElementById("doi-submit");
        importError = null;
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="spinner"></span> Looking up…';
        try {
          const citation = await Api.importDoi(doi);
          importResult = { kind: "doi", citation };
        } catch (err) {
          if (handleAuthError(err)) return;
          importError = err.message;
        }
        renderImport();
      });
      return;
    }

    const dropzone = document.getElementById("dropzone");
    const fileInput = document.getElementById("file-input");
    const submitBtn = document.getElementById("file-submit");
    const fileNameEl = document.getElementById("file-name");
    let selectedFile = null;

    fileInput.addEventListener("change", () => {
      selectedFile = fileInput.files[0] || null;
      fileNameEl.textContent = selectedFile ? selectedFile.name : "";
      submitBtn.disabled = !selectedFile;
    });

    ["dragover", "dragenter"].forEach((evt) => dropzone.addEventListener(evt, (e) => {
      e.preventDefault(); dropzone.classList.add("drag");
    }));
    ["dragleave", "drop"].forEach((evt) => dropzone.addEventListener(evt, (e) => {
      e.preventDefault(); dropzone.classList.remove("drag");
    }));
    dropzone.addEventListener("drop", (e) => {
      const f = e.dataTransfer.files[0];
      if (f) {
        selectedFile = f;
        fileNameEl.textContent = f.name;
        submitBtn.disabled = false;
      }
    });

    document.getElementById("file-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!selectedFile) return;
      importError = null;
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span class="spinner"></span> Importing…';
      try {
        const result = await Api.importFile(importTab, selectedFile);
        importResult = Object.assign({ kind: "file" }, result);
      } catch (err) {
        if (handleAuthError(err)) return;
        importError = err.message;
      }
      renderImport();
    });
  }

  // --------------------------------------------------------------- router

  async function boot() {
    if (getToken()) {
      try { currentUser = await Api.me(); }
      catch { setToken(null); }
    }
    render();
  }

  window.addEventListener("hashchange", () => { modalRoot.innerHTML = ""; render(); });
  window.addEventListener("DOMContentLoaded", boot);

  async function render() {
    const hash = location.hash.slice(1) || "/login";
    const [pathPart, queryPart] = hash.split("?");
    const parts = pathPart.split("/").filter(Boolean);
    const query = new URLSearchParams(queryPart || "");
    const top = parts[0];

    if (top === "login" || top === "register") {
      if (getToken() && currentUser) { location.hash = "#/library"; return; }
      renderAuth(top);
      return;
    }

    if (top === "forgot-password") { renderForgotPassword(); return; }
    if (top === "reset-password") { renderResetPassword(query.get("token")); return; }

    if (!getToken()) { location.hash = "#/login"; return; }

    if (!currentUser) {
      try { currentUser = await Api.me(); }
      catch { setToken(null); location.hash = "#/login"; return; }
    }

    if (top === "citation" && parts[1]) {
      renderDetail(parts[1]);
    } else if (top === "add") {
      // Open as an overlay on whatever's already showing — don't re-fetch/re-render
      // the page behind it. Only build a page behind it on a cold load straight to #/add.
      if (!document.querySelector(".shell")) await renderLibrary();
      openAddModal();
    } else if (top === "import") {
      importResult = null;
      importError = null;
      renderImport();
    } else {
      renderLibrary();
    }
  }
})();
