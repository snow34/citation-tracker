"use strict";

const form = document.getElementById("settings-form");
const errorEl = document.getElementById("settings-error");
const successEl = document.getElementById("settings-success");
const statusEl = document.getElementById("session-status");
const logoutBtn = document.getElementById("logout-btn");

function hide(el) {
  el.hidden = true;
}
function show(el) {
  el.hidden = false;
}

async function refreshStatus() {
  const { email } = await getSession();
  statusEl.textContent = email ? `Logged in as ${email}` : "Not logged in.";
  logoutBtn.disabled = !email;
}

(async function init() {
  form.apiBase.value = await getApiBase();
  await refreshStatus();
})();

logoutBtn.addEventListener("click", async () => {
  await clearSession();
  await refreshStatus();
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  hide(errorEl);
  hide(successEl);

  let value = form.apiBase.value.trim().replace(/\/+$/, "");
  if (!value) value = DEFAULT_API_BASE;

  let origin;
  try {
    origin = new URL(value).origin;
  } catch (err) {
    errorEl.textContent = "That doesn't look like a valid URL.";
    show(errorEl);
    return;
  }

  try {
    const granted = await browser.permissions.request({ origins: [origin + "/*"] });
    if (!granted) {
      errorEl.textContent = "Permission to contact that URL was not granted.";
      show(errorEl);
      return;
    }
  } catch (err) {
    // Origin already covered by a permanent host_permissions entry — fine.
  }

  await browser.storage.local.set({ apiBase: value });
  successEl.textContent = "Saved.";
  show(successEl);
});
