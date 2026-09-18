"use strict";

const path = require("path");
const { protocol, net } = require("electron");
const { pathToFileURL } = require("url");

// Must run before app.whenReady() / app 'ready'. A privileged scheme (not file://)
// gives the renderer a fixed, version-independent origin — process.resourcesPath
// varies by OS/installer and can shift between app versions, and file:// storage
// partitioning is inconsistent across Chromium versions. Pinning to app://app/...
// keeps app.js's existing localStorage usage (ct_token, ct_api_base, ...) reliable
// across relaunches and auto-updates.
protocol.registerSchemesAsPrivileged([
  {
    scheme: "app",
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
  },
]);

// The host segment must be a fixed, constant string (e.g. always "app"), NOT the
// filename — for a "standard" scheme, the host is the origin's authority and stays
// constant across same-origin relative navigation/resource loads. Loading
// app://app/index.html and then resolving a relative "app.js" reference against it
// correctly yields app://app/app.js (same host, new path) — using the filename
// itself as the host (as an earlier version of this file did) breaks that: relative
// URLs resolve to app://index.html/app.js, treating "index.html" as the host and
// silently 404ing every sibling resource.
const APP_HOST = "app";

function registerAppProtocol(frontendDir) {
  protocol.handle("app", (request) => {
    const requestUrl = new URL(request.url);
    if (requestUrl.hostname !== APP_HOST) {
      return new Response("Not Found", { status: 404 });
    }

    const relativePath = decodeURIComponent(requestUrl.pathname).replace(/^\/+/, "") || "index.html";
    const target = path.join(frontendDir, relativePath);

    // Guard against the resolved path escaping frontendDir (defense in depth —
    // nothing in the app currently constructs app:// URLs from untrusted input).
    if (!target.startsWith(frontendDir)) {
      return new Response("Forbidden", { status: 403 });
    }
    return net.fetch(pathToFileURL(target).toString());
  });
}

module.exports = { registerAppProtocol, APP_HOST };
