/* AirLite protocol — shared by sender.html and receiver.html
   Inspired by AirFerry: fountain symbols over a QR video stream, no ACK, no server. */
(function (root) {
  "use strict";

  var MAGIC = [0x41, 0x46, 0x31]; // AF1
  var TYPE_DESC = 0;
  var TYPE_SRC = 1;
  var TYPE_REP = 2;
  var HDR = 16;
  var DESC_EVERY = 8;
  var REPAIR_CAP = 280;
  var MAX_FILE = 12 * 1024 * 1024;

  // QR version → max binary payload (EC-L), bytes
  var QR_CAP_L = [
    0, 17, 32, 53, 78, 106, 134, 154, 192, 230, 271, 321, 367, 425, 458, 520,
    586, 644, 718, 792, 858, 929, 1003, 1091, 1171, 1273, 1367, 1465, 1528,
    1628, 1732, 1840, 1952, 2068, 2188, 2303, 2431, 2563, 2699, 2809, 2953
  ];

  // Tuned for phone-browser decode (jsQR), not theoretical peak.
  // Dense V16/V20 @ 24–30fps looks fast on PC but most frames fail on phone.
  // 2 large codes fill a landscape monitor; 4 tiny codes decode poorly on phones.
  var PRESETS = {
    stable: { label: "稳定", tiles: 1, version: 11, fps: 12, hint: "单码铺满，远一点也稳" },
    fast: { label: "高速", tiles: 2, version: 12, fps: 16, hint: "左右两大码，推荐" },
    rush: { label: "激进", tiles: 2, version: 14, fps: 16, hint: "近距离、手稳" },
    max: { label: "极限", tiles: 2, version: 16, fps: 15, hint: "贴屏、亮屏" }
  };

  var CRC_TABLE = (function () {
    var t = new Uint32Array(256);
    for (var i = 0; i < 256; i++) {
      var c = i;
      for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[i] = c >>> 0;
    }
    return t;
  })();

  function crc32(u8, start, end) {
    start = start || 0;
    end = end == null ? u8.length : end;
    var c = 0xffffffff;
    for (var i = start; i < end; i++) c = CRC_TABLE[(c ^ u8[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  function u32(n) {
    return n >>> 0;
  }

  function writeU16(b, o, v) {
    b[o] = v & 0xff;
    b[o + 1] = (v >>> 8) & 0xff;
  }
  function writeU32(b, o, v) {
    b[o] = v & 0xff;
    b[o + 1] = (v >>> 8) & 0xff;
    b[o + 2] = (v >>> 16) & 0xff;
    b[o + 3] = (v >>> 24) & 0xff;
  }
  function readU16(b, o) {
    return b[o] | (b[o + 1] << 8);
  }
  function readU32(b, o) {
    return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
  }

  function bytesToBinStr(u8) {
    var s = "";
    var n = u8.length;
    var CHUNK = 0x8000;
    for (var i = 0; i < n; i += CHUNK) {
      s += String.fromCharCode.apply(null, u8.subarray(i, Math.min(i + CHUNK, n)));
    }
    return s;
  }

  function binStrToBytes(s) {
    var u8 = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i) & 0xff;
    return u8;
  }

  function utf8Encode(str) {
    return new TextEncoder().encode(str);
  }
  function utf8Decode(u8) {
    return new TextDecoder("utf-8", { fatal: false }).decode(u8);
  }

  function xorInto(dst, src) {
    var n = dst.length;
    for (var i = 0; i < n; i++) dst[i] ^= src[i];
  }

  function cloneBytes(u8) {
    var o = new Uint8Array(u8.length);
    o.set(u8);
    return o;
  }

  // Integer xorshift32 — identical on sender/receiver
  function nextU32(state) {
    var x = state[0] || 1;
    x ^= (x << 13) >>> 0;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= (x << 5) >>> 0;
    x >>>= 0;
    state[0] = x;
    return x;
  }

  function mixIndices(seed, k) {
    if (k <= 1) return [0];
    var st = [seed || 1];
    var r = nextU32(st) % 100;
    var deg = r < 25 ? 1 : r < 75 ? 2 : r < 90 ? 3 : 4;
    if (deg > k) deg = k;
    var set = [];
    var guard = 0;
    while (set.length < deg && guard++ < 4000) {
      var i = nextU32(st) % k;
      if (set.indexOf(i) === -1) set.push(i);
    }
    return set;
  }

  function versionForBytes(n) {
    for (var v = 1; v <= 40; v++) if (QR_CAP_L[v] >= n) return v;
    return 40;
  }

  function chunkSizeForVersion(ver) {
    return QR_CAP_L[ver] - HDR;
  }

  function newSessionId() {
    var a = new Uint8Array(4);
    if (root.crypto && crypto.getRandomValues) crypto.getRandomValues(a);
    else for (var i = 0; i < 4; i++) a[i] = (Math.random() * 256) | 0;
    if ((a[0] | a[1] | a[2] | a[3]) === 0) a[0] = 1;
    return readU32(a, 0);
  }

  function putHeader(buf, type, session, extraU32) {
    buf[0] = MAGIC[0];
    buf[1] = MAGIC[1];
    buf[2] = MAGIC[2];
    buf[3] = type;
    writeU32(buf, 4, session);
    writeU32(buf, 8, extraU32);
  }

  function sealCrc(buf) {
    writeU32(buf, 12, crc32(buf, 16, buf.length));
  }

  function buildDescriptor(meta) {
    var nameBytes = utf8Encode(meta.name || "file.bin");
    if (nameBytes.length > 200) nameBytes = nameBytes.subarray(0, 200);
    var buf = new Uint8Array(HDR + 4 + 4 + 2 + 4 + 1 + 1 + nameBytes.length);
    putHeader(buf, TYPE_DESC, meta.session, 0);
    writeU32(buf, 16, meta.fileSize);
    writeU32(buf, 20, meta.fileCrc);
    writeU16(buf, 24, meta.chunkSize);
    writeU32(buf, 26, meta.numChunks);
    var flags = (meta.flags & 0x0f) | (((meta.tiles || 0) & 7) << 4);
    buf[30] = flags;
    buf[31] = nameBytes.length;
    buf.set(nameBytes, 32);
    sealCrc(buf);
    return buf;
  }

  function buildSource(session, esi, payload) {
    var buf = new Uint8Array(HDR + payload.length);
    putHeader(buf, TYPE_SRC, session, esi);
    buf.set(payload, HDR);
    sealCrc(buf);
    return buf;
  }

  function buildRepair(session, seed, payload) {
    var buf = new Uint8Array(HDR + payload.length);
    putHeader(buf, TYPE_REP, session, seed);
    buf.set(payload, HDR);
    sealCrc(buf);
    return buf;
  }

  function parseFrame(u8) {
    if (!u8 || u8.length < HDR) return null;
    if (u8[0] !== MAGIC[0] || u8[1] !== MAGIC[1] || u8[2] !== MAGIC[2]) return null;
    var got = readU32(u8, 12);
    var expect = crc32(u8, 16, u8.length);
    if (got !== expect) return null;
    var type = u8[3];
    var session = readU32(u8, 4);
    var extra = readU32(u8, 8);
    var payload = u8.subarray(HDR);
    if (type === TYPE_DESC) {
      if (payload.length < 16) return null;
      var nameLen = payload[15];
      if (payload.length < 16 + nameLen) return null;
      return {
        type: type,
        session: session,
        fileSize: readU32(payload, 0),
        fileCrc: readU32(payload, 4),
        chunkSize: readU16(payload, 8),
        numChunks: readU32(payload, 10),
        flags: payload[14],
        tiles: (payload[14] >> 4) & 7,
        name: utf8Decode(payload.subarray(16, 16 + nameLen))
      };
    }
    return { type: type, session: session, extra: extra, payload: payload };
  }

  function splitChunks(data, chunkSize) {
    var n = Math.ceil(data.length / chunkSize) || 1;
    var chunks = new Array(n);
    for (var i = 0; i < n; i++) {
      var c = new Uint8Array(chunkSize);
      var off = i * chunkSize;
      var take = Math.min(chunkSize, Math.max(0, data.length - off));
      if (take > 0) c.set(data.subarray(off, off + take));
      chunks[i] = c;
    }
    return chunks;
  }

  function joinChunks(chunks, fileSize) {
    var out = new Uint8Array(fileSize);
    var left = fileSize;
    var off = 0;
    for (var i = 0; i < chunks.length && left > 0; i++) {
      var take = Math.min(left, chunks[i].length);
      out.set(chunks[i].subarray(0, take), off);
      off += take;
      left -= take;
    }
    return out;
  }

  function makeRepairPayload(chunks, seed) {
    var idxs = mixIndices(seed, chunks.length);
    var out = new Uint8Array(chunks[0].length);
    for (var i = 0; i < idxs.length; i++) xorInto(out, chunks[idxs[i]]);
    return out;
  }

  function FountainRx() {
    this.reset();
  }

  FountainRx.prototype.reset = function () {
    this.ready = false;
    this.session = 0;
    this.fileSize = 0;
    this.fileCrc = 0;
    this.chunkSize = 0;
    this.numChunks = 0;
    this.flags = 0;
    this.tiles = 0;
    this.name = "";
    this.symbols = Object.create(null);
    this.got = 0;
    this.repairs = [];
    this.seenSeeds = Object.create(null);
    this.seenSrc = 0;
    this.seenRep = 0;
    this.seenDesc = 0;
  };

  FountainRx.prototype.applyDesc = function (d) {
    if (this.ready && this.session === d.session) {
      this.seenDesc++;
      return;
    }
    this.reset();
    this.ready = true;
    this.session = d.session;
    this.fileSize = d.fileSize;
    this.fileCrc = d.fileCrc;
    this.chunkSize = d.chunkSize;
    this.numChunks = d.numChunks;
    this.flags = d.flags;
    this.tiles = d.tiles || 0;
    this.name = d.name;
    this.seenDesc = 1;
  };

  FountainRx.prototype.addSource = function (esi, payload) {
    if (!this.ready) return;
    if (esi >= this.numChunks) return;
    if (this.symbols[esi]) return;
    var block = new Uint8Array(this.chunkSize);
    block.set(payload.subarray(0, Math.min(payload.length, this.chunkSize)));
    this.symbols[esi] = block;
    this.got++;
    this.seenSrc++;
    this.peel();
  };

  FountainRx.prototype.addRepair = function (seed, payload) {
    if (!this.ready || this.numChunks <= 0) return;
    if (this.seenSeeds[seed]) return;
    this.seenSeeds[seed] = 1;
    this.seenRep++;
    var data = new Uint8Array(this.chunkSize);
    data.set(payload.subarray(0, Math.min(payload.length, this.chunkSize)));
    this.repairs.push({ idxs: mixIndices(seed, this.numChunks).slice(), data: data });
    if (this.repairs.length > REPAIR_CAP) this.repairs.splice(0, this.repairs.length - REPAIR_CAP);
    this.peel();
  };

  FountainRx.prototype.peel = function () {
    var changed = true;
    var guard = 0;
    while (changed && guard++ < 8000) {
      changed = false;
      var keep = [];
      for (var r = 0; r < this.repairs.length; r++) {
        var item = this.repairs[r];
        var live = [];
        for (var i = 0; i < item.idxs.length; i++) {
          var idx = item.idxs[i];
          if (this.symbols[idx]) xorInto(item.data, this.symbols[idx]);
          else live.push(idx);
        }
        item.idxs = live;
        if (live.length === 1 && !this.symbols[live[0]]) {
          this.symbols[live[0]] = item.data;
          this.got++;
          changed = true;
        } else if (live.length > 1) {
          keep.push(item);
        }
      }
      this.repairs = keep;
    }
  };

  FountainRx.prototype.complete = function () {
    return this.ready && this.got >= this.numChunks && this.numChunks > 0;
  };

  FountainRx.prototype.assemble = function () {
    if (!this.complete()) return null;
    var chunks = new Array(this.numChunks);
    for (var i = 0; i < this.numChunks; i++) {
      if (!this.symbols[i]) return null;
      chunks[i] = this.symbols[i];
    }
    var raw = joinChunks(chunks, this.fileSize);
    if (crc32(raw) !== this.fileCrc) return { error: "crc" };
    return { data: raw, name: this.name, flags: this.flags };
  };

  root.AirLite = {
    MAGIC: MAGIC,
    TYPE_DESC: TYPE_DESC,
    TYPE_SRC: TYPE_SRC,
    TYPE_REP: TYPE_REP,
    HDR: HDR,
    DESC_EVERY: DESC_EVERY,
    MAX_FILE: MAX_FILE,
    QR_CAP_L: QR_CAP_L,
    PRESETS: PRESETS,
    crc32: crc32,
    writeU16: writeU16,
    writeU32: writeU32,
    readU16: readU16,
    readU32: readU32,
    bytesToBinStr: bytesToBinStr,
    binStrToBytes: binStrToBytes,
    utf8Encode: utf8Encode,
    utf8Decode: utf8Decode,
    xorInto: xorInto,
    cloneBytes: cloneBytes,
    mixIndices: mixIndices,
    versionForBytes: versionForBytes,
    chunkSizeForVersion: chunkSizeForVersion,
    newSessionId: newSessionId,
    buildDescriptor: buildDescriptor,
    buildSource: buildSource,
    buildRepair: buildRepair,
    parseFrame: parseFrame,
    splitChunks: splitChunks,
    joinChunks: joinChunks,
    makeRepairPayload: makeRepairPayload,
    FountainRx: FountainRx
  };
})(typeof window !== "undefined" ? window : this);
