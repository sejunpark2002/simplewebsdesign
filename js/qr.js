/* ============================================================
   SimpleWebs — QR generator UI
   Live preview on <canvas>, PNG + SVG download. Encoding is done
   in js/qrcode.js — nothing leaves the browser.
   ============================================================ */
(function () {
  "use strict";

  var form = document.getElementById("qrForm");
  if (!form || !window.SWQR) return;

  var content = document.getElementById("qrContent");
  var eclSel = document.getElementById("qrEcc");
  var sizeSel = document.getElementById("qrSize");
  var darkIn = document.getElementById("qrDark");
  var lightIn = document.getElementById("qrLight");
  var clearBg = document.getElementById("qrTransparent");
  var canvas = document.getElementById("qrCanvas");
  var canvasWrap = canvas.parentNode;
  var meta = document.getElementById("qrMeta");
  var note = document.getElementById("qrNote");
  var pngBtn = document.getElementById("qrPng");
  var svgBtn = document.getElementById("qrSvg");
  var ctx = canvas.getContext("2d");

  var QUIET = 4;          // quiet zone, in modules — the spec minimum
  var current = null;     // last successful { qr, dark, light, transparent }
  var timer = null;

  /* ---------- helpers ---------- */
  function setNote(msg, kind) {
    note.textContent = msg || "";
    note.classList.remove("is-error", "is-warn");
    if (msg && kind) note.classList.add(kind);
  }

  function channel(c) {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }

  function luminance(hex) {
    var n = parseInt(hex.slice(1), 16);
    return 0.2126 * channel((n >> 16) & 255) +
           0.7152 * channel((n >> 8) & 255) +
           0.0722 * channel(n & 255);
  }

  function contrast(a, b) {
    var l1 = luminance(a), l2 = luminance(b);
    if (l1 < l2) { var t = l1; l1 = l2; l2 = t; }
    return (l1 + 0.05) / (l2 + 0.05);
  }

  function setButtons(enabled) {
    pngBtn.disabled = !enabled;
    svgBtn.disabled = !enabled;
  }

  /* ---------- draw ---------- */
  function draw() {
    var text = content.value.trim();

    if (!text) {
      current = null;
      setButtons(false);
      canvas.width = canvas.height = 0;
      canvas.classList.add("is-empty");
      meta.textContent = "";
      setNote("");
      return;
    }

    var qr;
    try {
      qr = window.SWQR.encode(text, eclSel.value);
    } catch (err) {
      current = null;
      setButtons(false);
      canvas.classList.add("is-empty");
      canvas.width = canvas.height = 0;
      meta.textContent = "";
      setNote("That's too much data for one QR code — shorten the text, or drop the error correction to L.", "is-error");
      return;
    }

    var dark = darkIn.value;
    var light = lightIn.value;
    var transparent = clearBg.checked;

    var target = parseInt(sizeSel.value, 10);
    var span = qr.size + QUIET * 2;
    var scale = Math.max(1, Math.floor(target / span)); // whole pixels per module = crisp edges
    var px = span * scale;

    canvas.width = px;
    canvas.height = px;
    canvas.classList.remove("is-empty");

    ctx.clearRect(0, 0, px, px);
    if (!transparent) {
      ctx.fillStyle = light;
      ctx.fillRect(0, 0, px, px);
    }
    ctx.fillStyle = dark;
    for (var y = 0; y < qr.size; y++) {
      for (var x = 0; x < qr.size; x++) {
        if (qr.get(x, y)) {
          ctx.fillRect((x + QUIET) * scale, (y + QUIET) * scale, scale, scale);
        }
      }
    }

    canvasWrap.classList.toggle("is-alpha", transparent);
    current = { qr: qr, dark: dark, light: light, transparent: transparent, scale: scale };
    setButtons(true);

    meta.textContent = "Version " + qr.version + " · " + qr.size + "×" + qr.size +
      " modules · error correction " + qr.ecl + " · " + px + "×" + px + " px";

    if (contrast(dark, light) < 4 && !transparent) {
      setNote("Those two colours are close in brightness — some scanners will struggle. Keep the dark colour clearly darker than the background.", "is-warn");
    } else if (transparent) {
      setNote("Transparent background: make sure you place it on a light, plain surface.");
    } else {
      setNote("");
    }
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(draw, 120);
  }

  /* ---------- downloads ---------- */
  function save(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function toSvg(state) {
    var qr = state.qr;
    var span = qr.size + QUIET * 2;
    var parts = [];
    // one <rect> per horizontal run of dark modules keeps the file small
    for (var y = 0; y < qr.size; y++) {
      var run = 0;
      for (var x = 0; x <= qr.size; x++) {
        if (x < qr.size && qr.get(x, y)) { run++; continue; }
        if (run) {
          parts.push('<rect x="' + (x - run + QUIET) + '" y="' + (y + QUIET) +
                     '" width="' + run + '" height="1"/>');
          run = 0;
        }
      }
    }
    var px = span * state.scale;
    return '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<svg xmlns="http://www.w3.org/2000/svg" width="' + px + '" height="' + px +
      '" viewBox="0 0 ' + span + ' ' + span + '" shape-rendering="crispEdges">' +
      (state.transparent ? '' : '<rect width="' + span + '" height="' + span + '" fill="' + state.light + '"/>') +
      '<g fill="' + state.dark + '">' + parts.join("") + '</g></svg>';
  }

  pngBtn.addEventListener("click", function () {
    if (!current) return;
    if (canvas.toBlob) {
      canvas.toBlob(function (blob) { save(blob, "simplewebs-qr.png"); }, "image/png");
    } else {
      window.open(canvas.toDataURL("image/png"), "_blank");
    }
  });

  svgBtn.addEventListener("click", function () {
    if (!current) return;
    save(new Blob([toSvg(current)], { type: "image/svg+xml" }), "simplewebs-qr.svg");
  });

  form.addEventListener("submit", function (e) { e.preventDefault(); draw(); });

  content.addEventListener("input", schedule);
  [eclSel, sizeSel, darkIn, lightIn, clearBg].forEach(function (el) {
    el.addEventListener("input", draw);
    el.addEventListener("change", draw);
  });

  clearBg.addEventListener("change", function () {
    lightIn.disabled = clearBg.checked;
  });

  draw();
})();
