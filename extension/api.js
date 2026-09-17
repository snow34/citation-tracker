"use strict";

// Shared by popup.js and options.js. Talks to the live deployment by default;
// options.html lets the user point at a different backend (e.g. localhost).
const DEFAULT_API_BASE = "https://citation-tracker-j9do.onrender.com";

async function getApiBase() {
  const { apiBase } = await browser.storage.local.get("apiBase");
  return apiBase || DEFAULT_API_BASE;
}

async function getSession() {
  const { token, email } = await browser.storage.local.get(["token", "email"]);
  return { token: token || null, email: email || null };
}

async function setSession(token, email) {
  await browser.storage.local.set({ token, email });
}

async function clearSession() {
  await browser.storage.local.remove(["token", "email"]);
}

function errorMessageFrom(body, fallback) {
  if (!body) return fallback;
  if (typeof body === "string") return body;
  if (typeof body.detail === "string") return body.detail;
  if (Array.isArray(body.detail)) {
    return body.detail.map((e) => e.msg || JSON.stringify(e)).join("; ");
  }
  return fallback;
}

// options.json = { method, body (plain object, will be JSON-stringified), auth (default true) }
async function apiFetch(path, options = {}) {
  const base = await getApiBase();
  const headers = { "Content-Type": "application/json" };
  if (options.auth !== false) {
    const { token } = await getSession();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let res;
  try {
    res = await fetch(base + path, {
      method: options.method || "GET",
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch (err) {
    throw new Error(
      `Could not reach ${base}. Check the API URL in Settings and your connection.`
    );
  }

  const text = await res.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch (e) {
      body = text;
    }
  }

  if (!res.ok) {
    const error = new Error(errorMessageFrom(body, `Request failed (${res.status})`));
    error.status = res.status;
    throw error;
  }
  return body;
}
