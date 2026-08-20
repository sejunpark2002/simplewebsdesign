/* ============================================================
   SimpleWebs — QR encoder
   Dependency-free QR Code (Model 2) generator: versions 1–40,
   numeric / alphanumeric / byte segments, ECC levels L M Q H,
   full mask selection by penalty score.
   Exposes window.SWQR.encode(text, ecl) -> { size, version, ecl,
   mask, get(x, y) }.
   ============================================================ */
(function (root) {
  "use strict";

  /* ---------- spec tables (index = version, 0 unused) ---------- */
  var ECC_PER_BLOCK = {
    L: [0, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    M: [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
    Q: [0, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    H: [0, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30]
  };
  var NUM_BLOCKS = {
    L: [0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
    M: [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
    Q: [0, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
    H: [0, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81]
  };
  var FORMAT_BITS = { L: 1, M: 0, Q: 3, H: 2 };
  var ALNUM = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";

  var MASKS = [
    function (x, y) { return (x + y) % 2 === 0; },
    function (x, y) { return y % 2 === 0; },
    function (x, y) { return x % 3 === 0; },
    function (x, y) { return (x + y) % 3 === 0; },
    function (x, y) { return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; },
    function (x, y) { return x * y % 2 + x * y % 3 === 0; },
    function (x, y) { return (x * y % 2 + x * y % 3) % 2 === 0; },
    function (x, y) { return ((x + y) % 2 + x * y % 3) % 2 === 0; }
  ];

  function getBit(x, i) { return ((x >>> i) & 1) !== 0; }

  function appendBits(val, len, bb) {
    for (var i = len - 1; i >= 0; i--) bb.push((val >>> i) & 1);
  }

  /* ---------- capacity maths ---------- */
  function rawDataModules(ver) {
    var result = (16 * ver + 128) * ver + 64;
    if (ver >= 2) {
      var numAlign = Math.floor(ver / 7) + 2;
      result -= (25 * numAlign - 10) * numAlign - 55;
      if (ver >= 7) result -= 36;
    }
    return result;
  }

  function dataCodewords(ver, ecl) {
    return Math.floor(rawDataModules(ver) / 8) - ECC_PER_BLOCK[ecl][ver] * NUM_BLOCKS[ecl][ver];
  }

  function alignPositions(ver) {
    if (ver === 1) return [];
    var numAlign = Math.floor(ver / 7) + 2;
    var step = ver === 32 ? 26 : Math.ceil((ver * 4 + 4) / (numAlign * 2 - 2)) * 2;
    var result = [6];
    for (var pos = ver * 4 + 10; result.length < numAlign; pos -= step) result.splice(1, 0, pos);
    return result;
  }

  /* ---------- segments ---------- */
  function toUtf8(str) {
    var esc = encodeURIComponent(str), out = [], i;
    for (i = 0; i < esc.length; i++) {
      if (esc.charAt(i) === "%") { out.push(parseInt(esc.substr(i + 1, 2), 16)); i += 2; }
      else out.push(esc.charCodeAt(i));
    }
    return out;
  }

  function isAlnum(text) {
    for (var i = 0; i < text.length; i++) if (ALNUM.indexOf(text.charAt(i)) < 0) return false;
    return true;
  }

  // Single-segment encoding: pick the tightest mode the whole string fits.
  function makeSegment(text) {
    var bits = [], i;
    if (/^[0-9]*$/.test(text)) {
      for (i = 0; i + 3 <= text.length; i += 3) appendBits(parseInt(text.substr(i, 3), 10), 10, bits);
      var rest = text.length - i;
      if (rest > 0) appendBits(parseInt(text.substr(i), 10), rest * 3 + 1, bits);
      return { mode: 1, chars: text.length, bits: bits };
    }
    if (isAlnum(text)) {
      for (i = 0; i + 2 <= text.length; i += 2) {
        appendBits(ALNUM.indexOf(text.charAt(i)) * 45 + ALNUM.indexOf(text.charAt(i + 1)), 11, bits);
      }
      if (i < text.length) appendBits(ALNUM.indexOf(text.charAt(i)), 6, bits);
      return { mode: 2, chars: text.length, bits: bits };
    }
    var bytes = toUtf8(text);
    for (i = 0; i < bytes.length; i++) appendBits(bytes[i], 8, bits);
    return { mode: 4, chars: bytes.length, bits: bits };
  }

  function charCountBits(mode, ver) {
    var i = ver <= 9 ? 0 : ver <= 26 ? 1 : 2;
    if (mode === 1) return [10, 12, 14][i];
    if (mode === 2) return [9, 11, 13][i];
    return [8, 16, 16][i];
  }

  /* ---------- Reed–Solomon over GF(256), poly 0x11D ---------- */
  function gfMul(x, y) {
    var z = 0;
    for (var i = 7; i >= 0; i--) {
      z = (z << 1) ^ ((z >>> 7) * 0x11D);
      z ^= ((y >>> i) & 1) * x;
    }
    return z;
  }

  function rsGenerator(degree) {
    var result = [], i, j;
    for (i = 0; i < degree - 1; i++) result.push(0);
    result.push(1);
    var root = 1;
    for (i = 0; i < degree; i++) {
      for (j = 0; j < result.length; j++) {
        result[j] = gfMul(result[j], root);
        if (j + 1 < result.length) result[j] ^= result[j + 1];
      }
      root = gfMul(root, 0x02);
    }
    return result;
  }

  function rsRemainder(data, gen) {
    var result = [], i, j;
    for (i = 0; i < gen.length; i++) result.push(0);
    for (i = 0; i < data.length; i++) {
      var factor = data[i] ^ result.shift();
      result.push(0);
      for (j = 0; j < gen.length; j++) result[j] ^= gfMul(gen[j], factor);
    }
    return result;
  }

  // Split into blocks, add ECC, interleave back into the final stream.
  function addEcc(data, ver, ecl) {
    var numBlocks = NUM_BLOCKS[ecl][ver];
    var eccLen = ECC_PER_BLOCK[ecl][ver];
    var rawCodewords = Math.floor(rawDataModules(ver) / 8);
    var numShort = numBlocks - rawCodewords % numBlocks;
    var shortLen = Math.floor(rawCodewords / numBlocks) - eccLen;
    var gen = rsGenerator(eccLen);
    var blocks = [], k = 0, i, j;

    for (i = 0; i < numBlocks; i++) {
      var len = shortLen + (i < numShort ? 0 : 1);
      var dat = data.slice(k, k + len);
      k += len;
      blocks.push({ data: dat, ecc: rsRemainder(dat, gen) });
    }

    var result = [];
    for (j = 0; j <= shortLen; j++) {
      for (i = 0; i < numBlocks; i++) {
        if (j < shortLen || i >= numShort) result.push(blocks[i].data[j]);
      }
    }
    for (j = 0; j < eccLen; j++) {
      for (i = 0; i < numBlocks; i++) result.push(blocks[i].ecc[j]);
    }
    return result;
  }

  /* ---------- matrix ---------- */
  function buildMatrix(ver, ecl, codewords) {
    var size = ver * 4 + 17;
    var modules = [], isFn = [], x, y, i;

    for (y = 0; y < size; y++) {
      var mrow = [], frow = [];
      for (x = 0; x < size; x++) { mrow.push(false); frow.push(false); }
      modules.push(mrow);
      isFn.push(frow);
    }

    function setFn(x, y, dark) {
      modules[y][x] = dark;
      isFn[y][x] = true;
    }

    function drawFinder(cx, cy) {
      for (var dy = -4; dy <= 4; dy++) {
        for (var dx = -4; dx <= 4; dx++) {
          var dist = Math.max(Math.abs(dx), Math.abs(dy));
          var xx = cx + dx, yy = cy + dy;
          if (xx >= 0 && xx < size && yy >= 0 && yy < size) setFn(xx, yy, dist !== 2 && dist !== 4);
        }
      }
    }

    function drawAlign(cx, cy) {
      for (var dy = -2; dy <= 2; dy++) {
        for (var dx = -2; dx <= 2; dx++) {
          setFn(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
        }
      }
    }

    function drawFormatBits(mask) {
      var data = (FORMAT_BITS[ecl] << 3) | mask;
      var rem = data, i;
      for (i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
      var bits = ((data << 10) | rem) ^ 0x5412;

      for (i = 0; i <= 5; i++) setFn(8, i, getBit(bits, i));
      setFn(8, 7, getBit(bits, 6));
      setFn(8, 8, getBit(bits, 7));
      setFn(7, 8, getBit(bits, 8));
      for (i = 9; i < 15; i++) setFn(14 - i, 8, getBit(bits, i));

      for (i = 0; i < 8; i++) setFn(size - 1 - i, 8, getBit(bits, i));
      for (i = 8; i < 15; i++) setFn(8, size - 15 + i, getBit(bits, i));
      setFn(8, size - 8, true); // always-dark module
    }

    function drawVersionBits() {
      if (ver < 7) return;
      var rem = ver, i;
      for (i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
      var bits = (ver << 12) | rem;
      for (i = 0; i < 18; i++) {
        var bit = getBit(bits, i);
        var a = size - 11 + i % 3, b = Math.floor(i / 3);
        setFn(a, b, bit);
        setFn(b, a, bit);
      }
    }

    // timing patterns
    for (i = 0; i < size; i++) {
      setFn(6, i, i % 2 === 0);
      setFn(i, 6, i % 2 === 0);
    }
    drawFinder(3, 3);
    drawFinder(size - 4, 3);
    drawFinder(3, size - 4);

    var pos = alignPositions(ver);
    for (i = 0; i < pos.length; i++) {
      for (var j = 0; j < pos.length; j++) {
        var corner = (i === 0 && j === 0) || (i === 0 && j === pos.length - 1) ||
                     (i === pos.length - 1 && j === 0);
        if (!corner) drawAlign(pos[i], pos[j]);
      }
    }

    drawFormatBits(0); // placeholder — marks the reserved modules
    drawVersionBits();

    /* ---------- data: zigzag, two columns at a time ---------- */
    var bit = 0, total = codewords.length * 8;
    for (var right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5; // skip the vertical timing column
      for (var vert = 0; vert < size; vert++) {
        for (var col = 0; col < 2; col++) {
          var xx = right - col;
          var upward = ((right + 1) & 2) === 0;
          var yy = upward ? size - 1 - vert : vert;
          if (!isFn[yy][xx] && bit < total) {
            modules[yy][xx] = getBit(codewords[bit >>> 3], 7 - (bit & 7));
            bit++;
          }
        }
      }
    }

    function applyMask(mask) {
      var fn = MASKS[mask];
      for (var y = 0; y < size; y++) {
        for (var x = 0; x < size; x++) {
          if (!isFn[y][x] && fn(x, y)) modules[y][x] = !modules[y][x];
        }
      }
    }

    /* ---------- penalty scoring (ISO/IEC 18004 §8.8.2) ---------- */
    function addHistory(runLen, hist) {
      if (hist[0] === 0) runLen += size; // light border before the first run
      hist.pop();
      hist.unshift(runLen);
    }

    function countFinderLike(hist) {
      var n = hist[1];
      var core = n > 0 && hist[2] === n && hist[3] === n * 3 && hist[4] === n && hist[5] === n;
      return (core && hist[0] >= n * 4 && hist[6] >= n ? 1 : 0) +
             (core && hist[6] >= n * 4 && hist[0] >= n ? 1 : 0);
    }

    function terminateAndCount(runColor, runLen, hist) {
      if (runColor) { addHistory(runLen, hist); runLen = 0; }
      runLen += size; // light border after the last run
      addHistory(runLen, hist);
      return countFinderLike(hist);
    }

    function penalty() {
      var score = 0, x, y, i, runColor, runLen, hist;

      for (y = 0; y < size; y++) {
        runColor = false; runLen = 0; hist = [0, 0, 0, 0, 0, 0, 0];
        for (x = 0; x < size; x++) {
          if (modules[y][x] === runColor) {
            runLen++;
            if (runLen === 5) score += 3;
            else if (runLen > 5) score++;
          } else {
            addHistory(runLen, hist);
            if (!runColor) score += countFinderLike(hist) * 40;
            runColor = modules[y][x];
            runLen = 1;
          }
        }
        score += terminateAndCount(runColor, runLen, hist) * 40;
      }

      for (x = 0; x < size; x++) {
        runColor = false; runLen = 0; hist = [0, 0, 0, 0, 0, 0, 0];
        for (y = 0; y < size; y++) {
          if (modules[y][x] === runColor) {
            runLen++;
            if (runLen === 5) score += 3;
            else if (runLen > 5) score++;
          } else {
            addHistory(runLen, hist);
            if (!runColor) score += countFinderLike(hist) * 40;
            runColor = modules[y][x];
            runLen = 1;
          }
        }
        score += terminateAndCount(runColor, runLen, hist) * 40;
      }

      for (y = 0; y < size - 1; y++) {
        for (x = 0; x < size - 1; x++) {
          var c = modules[y][x];
          if (c === modules[y][x + 1] && c === modules[y + 1][x] && c === modules[y + 1][x + 1]) score += 3;
        }
      }

      var dark = 0;
      for (y = 0; y < size; y++) for (x = 0; x < size; x++) if (modules[y][x]) dark++;
      var totalModules = size * size;
      var k = Math.ceil(Math.abs(dark * 20 - totalModules * 10) / totalModules) - 1;
      score += k * 10;

      return score;
    }

    var bestMask = 0, bestScore = Infinity;
    for (i = 0; i < 8; i++) {
      applyMask(i);
      drawFormatBits(i);
      var s = penalty();
      if (s < bestScore) { bestScore = s; bestMask = i; }
      applyMask(i); // undo
    }
    applyMask(bestMask);
    drawFormatBits(bestMask);

    return { size: size, modules: modules, mask: bestMask };
  }

  /* ---------- public API ---------- */
  function encode(text, ecl) {
    text = String(text == null ? "" : text);
    if (!FORMAT_BITS.hasOwnProperty(ecl)) ecl = "M";

    var seg = makeSegment(text);
    var ver, capacity = 0, found = false;
    for (ver = 1; ver <= 40; ver++) {
      capacity = dataCodewords(ver, ecl) * 8;
      if (4 + charCountBits(seg.mode, ver) + seg.bits.length <= capacity) { found = true; break; }
    }
    if (!found) throw new Error("TOO_LONG");

    var bb = [], i, j;
    appendBits(seg.mode, 4, bb);
    appendBits(seg.chars, charCountBits(seg.mode, ver), bb);
    for (i = 0; i < seg.bits.length; i++) bb.push(seg.bits[i]);

    for (i = 0; i < 4 && bb.length < capacity; i++) bb.push(0);       // terminator
    while (bb.length % 8 !== 0) bb.push(0);                            // byte align

    var data = [];
    for (i = 0; i < bb.length; i += 8) {
      var b = 0;
      for (j = 0; j < 8; j++) b = (b << 1) | bb[i + j];
      data.push(b);
    }
    var pad = [0xEC, 0x11], p = 0;
    while (data.length < capacity / 8) data.push(pad[p++ % 2]);

    var m = buildMatrix(ver, ecl, addEcc(data, ver, ecl));

    return {
      size: m.size,
      version: ver,
      ecl: ecl,
      mask: m.mask,
      get: function (x, y) {
        return x >= 0 && x < m.size && y >= 0 && y < m.size ? m.modules[y][x] : false;
      }
    };
  }

  root.SWQR = { encode: encode };
})(window);
