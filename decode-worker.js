/* Latest-frame QR decode. Path is relative to this worker (same folder as vendor/). */
try {
  importScripts("vendor/jsQR.js");
} catch (e) {
  postMessage({ type: "noscript", error: String(e) });
}

onmessage = function (ev) {
  var msg = ev.data || {};
  if (msg.type !== "scan" || typeof jsQR !== "function") {
    postMessage({ type: "result", id: msg.id, hits: [] });
    return;
  }
  var hits = [];
  var jobs = msg.jobs || [];
  for (var i = 0; i < jobs.length; i++) {
    var j = jobs[i];
    var code = jsQR(j.data, j.w, j.h, { inversionAttempts: "dontInvert" });
    if (!code) continue;
    var loc = code.location;
    hits.push({
      bytes: code.binaryData || [],
      text: code.data || "",
      box: loc ? [
        { x: loc.topLeftCorner.x + j.x, y: loc.topLeftCorner.y + j.y },
        { x: loc.topRightCorner.x + j.x, y: loc.topRightCorner.y + j.y },
        { x: loc.bottomRightCorner.x + j.x, y: loc.bottomRightCorner.y + j.y },
        { x: loc.bottomLeftCorner.x + j.x, y: loc.bottomLeftCorner.y + j.y }
      ] : null
    });
  }
  postMessage({ type: "result", id: msg.id, hits: hits });
};
