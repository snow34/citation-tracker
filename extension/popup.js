"use strict";

const app = document.getElementById("app");

function mount(templateId) {
  const tpl = document.getElementById(templateId);
  app.innerHTML = "";
  app.appendChild(tpl.content.cloneNode(true));
}

function show(el) {
  el.hidden = false;
}
function hide(el) {
  el.hidden = true;
}

async function getActiveTab() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function extractPageData(tabId) {
  try {
    const results = await browser.scripting.executeScript({
      target: { tabId },
      files: ["extractor.js"],
    });
    return (results && results[0] && results[0].result) || null;
  } catch (err) {
    // Restricted pages (about:, addons.mozilla.org, PDFs, etc.) can't be scripted.
    return null;
  }
}

function renderLogin() {
  mount("tpl-login");

  const openWebApp = document.getElementById("open-web-app");
  openWebApp.addEventListener("click", (e) => {
    e.preventDefault();
    browser.tabs.create({ url: "https://snow34.github.io/citation-tracker/" });
  });

  const form = document.getElementById("login-form");
  const errorEl = document.getElementById("login-error");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    hide(errorEl);
    const submitBtn = form.querySelector("button[type=submit]");
    submitBtn.disabled = true;
    const fd = new FormData(form);
    const email = fd.get("email").trim();
    const password = fd.get("password");

    try {
      const result = await apiFetch("/auth/login", {
        method: "POST",
        auth: false,
        body: { email, password },
      });
      await setSession(result.access_token, email);
      await renderMain();
    } catch (err) {
      errorEl.textContent = err.message;
      show(errorEl);
    } finally {
      submitBtn.disabled = false;
    }
  });
}

async function renderMain() {
  mount("tpl-main");

  document.getElementById("open-settings").addEventListener("click", (e) => {
    e.preventDefault();
    browser.runtime.openOptionsPage();
  });
  document.getElementById("logout").addEventListener("click", async (e) => {
    e.preventDefault();
    await clearSession();
    renderLogin();
  });

  const doiBanner = document.getElementById("doi-banner");
  const doiBannerText = document.getElementById("doi-banner-text");
  const importDoiBtn = document.getElementById("import-doi-btn");
  const formError = document.getElementById("form-error");
  const formSuccess = document.getElementById("form-success");
  const form = document.getElementById("citation-form");

  function setBusy(busy) {
    Array.from(form.elements).forEach((el) => (el.disabled = busy));
    importDoiBtn.disabled = busy;
  }

  function showError(err) {
    hide(formSuccess);
    if (err && err.status === 401) {
      clearSession().then(renderLogin);
      return;
    }
    formError.textContent = err && err.message ? err.message : err;
    show(formError);
  }

  function showSuccess(message) {
    hide(formError);
    formSuccess.textContent = message;
    show(formSuccess);
  }

  const tab = await getActiveTab();
  const data = tab ? await extractPageData(tab.id) : null;

  if (data) {
    if (data.title) form.title.value = data.title;
    if (data.authors && data.authors.length) form.authors.value = data.authors.join(", ");
    if (data.journal) form.journal.value = data.journal;
    if (data.year) form.year.value = data.year;
    if (data.doi) form.doi.value = data.doi;
    if (data.abstract) form.abstract.value = data.abstract;

    if (data.doi) {
      doiBannerText.textContent = `DOI detected: ${data.doi}`;
      show(doiBanner);
    }
  } else {
    showError("Couldn't read this page automatically — fill in the details manually.");
  }

  importDoiBtn.addEventListener("click", async () => {
    setBusy(true);
    hide(formError);
    try {
      await apiFetch("/citations/import/doi", {
        method: "POST",
        body: { doi: form.doi.value.trim() },
      });
      showSuccess("Added to your library via DOI lookup.");
      hide(doiBanner);
    } catch (err) {
      showError(err);
    } finally {
      setBusy(false);
    }
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    setBusy(true);
    hide(formSuccess);
    hide(formError);

    const fd = new FormData(form);
    const authors = fd
      .get("authors")
      .split(",")
      .map((a) => a.trim())
      .filter(Boolean);
    const year = fd.get("year") ? Number(fd.get("year")) : null;

    const payload = {
      title: fd.get("title").trim(),
      authors,
      journal: fd.get("journal").trim() || null,
      year,
      doi: fd.get("doi").trim() || null,
      abstract: fd.get("abstract").trim() || null,
      notes: fd.get("notes").trim() || null,
    };

    try {
      await apiFetch("/citations", { method: "POST", body: payload });
      showSuccess("Added to your library.");
    } catch (err) {
      showError(err);
    } finally {
      setBusy(false);
    }
  });
}

(async function init() {
  const { token } = await getSession();
  if (token) {
    await renderMain();
  } else {
    renderLogin();
  }
})();
