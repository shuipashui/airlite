// Fountain encode/decode self-test (no QR, no DOM)
var window = global;
require("./protocol.js");
var P = global.AirLite;
if (!P) throw new Error("AirLite not loaded");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

var raw = new Uint8Array(50 * 1024);
for (var i = 0; i < raw.length; i++) raw[i] = (i * 17 + 3) & 0xff;
var chunkSize = P.chunkSizeForVersion(16);
var chunks = P.splitChunks(raw, chunkSize);
var session = 0x12345678;
var desc = P.buildDescriptor({
  session: session,
  name: "probe.bin",
  fileSize: raw.length,
  fileCrc: P.crc32(raw),
  chunkSize: chunkSize,
  numChunks: chunks.length,
  flags: 0
});

var rx = new P.FountainRx();
assert(P.parseFrame(desc).type === P.TYPE_DESC, "desc type");
rx.applyDesc(P.parseFrame(desc));

// Drop ~18% of source symbols, fill with repairs
var dropped = {};
for (var esi = 0; esi < chunks.length; esi++) {
  if (esi % 6 === 0) {
    dropped[esi] = true;
    continue;
  }
  var src = P.buildSource(session, esi, chunks[esi]);
  var f = P.parseFrame(src);
  rx.addSource(f.extra, f.payload);
}

var seed = 1;
var guard = 0;
while (!rx.complete() && guard++ < 4000) {
  var pay = P.makeRepairPayload(chunks, seed);
  var rep = P.buildRepair(session, seed, pay);
  var fr = P.parseFrame(rep);
  rx.addRepair(fr.extra, fr.payload);
  seed++;
}

assert(rx.complete(), "should complete after repairs, got " + rx.got + "/" + rx.numChunks + " after " + (seed - 1) + " repairs");
var out = rx.assemble();
assert(out && !out.error, "assemble crc");
assert(out.data.length === raw.length, "size");
for (var j = 0; j < raw.length; j++) {
  if (out.data[j] !== raw[j]) throw new Error("mismatch at " + j);
}

// CRC should reject bit flips
var bad = P.buildSource(session, 1, chunks[1]);
bad[20] ^= 0xff;
assert(P.parseFrame(bad) === null, "crc drop");

console.log("OK  chunks=" + chunks.length + "  dropped=" + Object.keys(dropped).length + "  repairs=" + (seed - 1) + "  chunk=" + chunkSize);
