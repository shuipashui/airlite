/* One ROI per message. Main thread owns a small pool (AirFerry-style). */
try {
  importScripts("vendor/jsQR.js");
} catch (e) {
  postMessage({ type: "noscript", error: String(e) });
}

onmessage = function (ev) {
  var msg = ev.data || {};
  if (msg.type !== "scan" || typeof jsQR !== "function") {
    postMessage({ type: "result", id: msg.id, slot: msg.slot, hits: [] });
    return;
  }
  var code = jsQR(msg.data, msg.w, msg.h, { inversionAttempts: "dontInvert" });
  var hits = [];
  if (code) {
    var loc = code.location;
    hits.push({
      bytes: code.binaryData || [],
      text: code.data || "",
      box: loc ? [
        { x: loc.topLeftCorner.x + (msg.ox || 0), y: loc.topLeftCorner.y + (msg.oy || 0) },
        { x: loc.topRightCorner.x + (msg.ox || 0), y: loc.topRightCorner.y + (msg.oy || 0) },
        { x: loc.bottomRightCorner.x + (msg.ox || 0), y: loc.bottomRightCorner.y + (msg.oy || 0) },
        { x: loc.bottomLeftCorner.x + (msg.ox || 0), y: loc.bottomLeftCorner.y + (msg.oy || 0) }
      ] : null
    });
  }
  postMessage({ type: "result", id: msg.id, slot: msg.slot, hits: hits });
};
