"use strict";

// One module per feature (mirrors app/routers/*.py in the backend). Adding a native
// capability later is: a new ipc/<feature>.js + preload-api/<feature>.js pair, plus
// one line here and one line in preload.js — no changes to main.js needed.
function registerAll() {
  require("./shell").register();
  // future: require("./notifications").register();
  // future: require("./tray").register();
}

module.exports = { registerAll };
