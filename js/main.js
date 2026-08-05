/* ============================================================
   SimpleWebs — interactions
   Dependency-free: loader, nav, fullscreen menu, count-ups,
   reveal-on-scroll and a rAF scroll-scrub engine that drives the
   pinned hero / work sections.
   ============================================================ */
(function () {
  "use strict";

  var html = document.documentElement;
  var reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  // mobile gets no scroll-driven motion at all — keep in sync with the
  // 760px breakpoint in style.css
  var mobile = matchMedia("(max-width: 760px)").matches;

  var $ = function (sel, ctx) { return (ctx || document).querySelector(sel); };
  var $$ = function (sel, ctx) {
    return Array.prototype.slice.call((ctx || document).querySelectorAll(sel));
  };

  var clamp = function (v, a, b) {
    a = a === undefined ? 0 : a;
    b = b === undefined ? 1 : b;
    return v < a ? a : v > b ? b : v;
  };
  var lerp = function (a, b, t) { return a + (b - a) * t; };

  /* ---------- chrome: year, nav state ---------- */
  function chrome() {
    var y = $("#year");
    if (y) y.textContent = new Date().getFullYear();

    var nav = $("#nav");
    var onScroll = function () {
      if (nav) nav.classList.toggle("scrolled", window.scrollY > 40);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  /* ---------- fullscreen menu ---------- */
  function menu() {
    var btn = $("#menuBtn"), overlay = $("#menuOverlay"), close = $("#menuClose");
    if (!btn || !overlay) return;

    var open = function () {
      overlay.hidden = false;
      requestAnimationFrame(function () { overlay.classList.add("is-open"); });
      btn.setAttribute("aria-expanded", "true");
      document.body.style.overflow = "hidden";
    };
    var shut = function () {
      overlay.classList.remove("is-open");
      btn.setAttribute("aria-expanded", "false");
      document.body.style.overflow = "";
      setTimeout(function () {
        if (!overlay.classList.contains("is-open")) overlay.hidden = true;
      }, 560);
    };

    btn.addEventListener("click", open);
    if (close) close.addEventListener("click", shut);
    $$(".menu-link", overlay).forEach(function (a) { a.addEventListener("click", shut); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && overlay.classList.contains("is-open")) shut();
    });
  }

  /* ---------- nav: clicked link keeps the highlight ---------- */
  function navSelect() {
    var links = $$(".nav-link");
    if (!links.length) return;
    links.forEach(function (link) {
      link.addEventListener("click", function () {
        links.forEach(function (l) {
          l.classList.remove("active");
          l.removeAttribute("aria-current");
        });
        link.classList.add("active");
        link.setAttribute("aria-current", "true");
      });
    });
  }

  /* ---------- count-ups ---------- */
  function countFmt(el, v) {
    var decimal = parseFloat(el.getAttribute("data-count")) % 1 !== 0;
    return (decimal ? v.toFixed(1) : Math.round(v).toLocaleString("en-US")) +
      (el.getAttribute("data-suffix") || "");
  }

  // no animation: land on the final value straight away
  function countSettle(el) {
    el.textContent = countFmt(el, parseFloat(el.getAttribute("data-count")));
  }

  function countUp(el) {
    var target = parseFloat(el.getAttribute("data-count"));
    var dur = 1500, t0 = performance.now();

    var fmt = function (v) { return countFmt(el, v); };
    var frame = function (now) {
      var p = Math.min(1, (now - t0) / dur);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt(target * eased);
      if (p < 1) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  function counters() {
    var nodes = $$("[data-count]");
    if (!("IntersectionObserver" in window)) { nodes.forEach(countUp); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { countUp(en.target); io.unobserve(en.target); }
      });
    }, { threshold: 0.4 });
    nodes.forEach(function (n) { io.observe(n); });
  }

  /* ---------- reveal on scroll ---------- */
  function stagger() {
    // grouped items fade in one after another
    [".logos-list li", ".stat-row", ".footer-col"].forEach(function (sel) {
      $$(sel).forEach(function (el, i) {
        el.style.setProperty("--d", (i % 12) * 0.045 + "s");
      });
    });
  }

  function reveal() {
    var nodes = $$("[data-reveal]");
    if (!("IntersectionObserver" in window)) {
      nodes.forEach(function (n) { n.classList.add("is-in"); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add("is-in"); io.unobserve(en.target); }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });

    nodes.forEach(function (n) {
      var r = n.getBoundingClientRect();
      if (r.top < innerHeight * 0.92 && r.bottom > 0) n.classList.add("is-in");
      else io.observe(n);
    });
  }

  /* ============================================================
     SCRUB ENGINE
     Each entry is a function called with the current scroll frame.
     ============================================================ */
  var scrubs = [];

  // progress while a tall pin-wrap passes its sticky child
  function pinProgress(el) {
    var r = el.getBoundingClientRect();
    var d = r.height - innerHeight;
    return d > 0 ? clamp(-r.top / d) : 0;
  }

  // 0 when el.top === a*vh, 1 when el.bottom === b*vh
  function rangeProgress(el, a, b) {
    var r = el.getBoundingClientRect(), vh = innerHeight;
    var span = (a - b) * vh + r.height;
    return span > 0 ? clamp((a * vh - r.top) / span) : 0;
  }

  // document offset — layout-based, so unaffected by position:sticky
  function docTop(el) {
    var y = 0;
    while (el) { y += el.offsetTop; el = el.offsetParent; }
    return y;
  }

  // 0 when el.top === a*vh, 1 when el.centre === b*vh
  function centreProgress(el, a, b) {
    var r = el.getBoundingClientRect(), vh = innerHeight;
    var span = (a - b) * vh + r.height / 2;
    return span > 0 ? clamp((a * vh - r.top) / span) : 0;
  }

  /* 1 · HERO — the panel shrinks into rounded corners as you scroll off it */
  function heroPanel() {
    var panel = $("#pageMain");
    if (!panel) return;
    var onScroll = function () {
      panel.classList.toggle("shrunk", window.scrollY > 60);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  /* hero headlines wipe up out of their masks on load */
  function heroTitles() {
    var titles = $$(".hero-section .section-title");
    if (!titles.length) return;
    titles.forEach(function (t, i) {
      t.style.transform = "translateY(105%)";
      t.style.transition = "transform 1.1s var(--ease-out) " + (0.35 + i * 0.12) + "s";
    });
    requestAnimationFrame(function () {
      titles.forEach(function (t) { t.style.transform = "translateY(0)"; });
    });
  }

  /* 2 · STATEMENT — lines wipe up, scrubbed, staggered */
  function statementScrub() {
    var sec = $(".statement");
    var lines = $$(".statement-h2 .line");
    if (!sec || !lines.length) return;

    var st = 0.18;
    var denom = 1 + st * (lines.length - 1);
    var span = 1 / denom;

    scrubs.push(function () {
      var p = centreProgress(sec, 0.78, 0.52);
      lines.forEach(function (line, i) {
        var local = clamp((p - (i * st) / denom) / span);
        line.style.transform = "translateY(" + ((1 - local) * 112).toFixed(2) + "%)";
      });
    });
  }

  /* 3 · WORK — four collage columns drift at different speeds */
  function workScrub() {
    var wrap = $("#workPinWrap");
    if (!wrap) return;
    var cols = $$(".collage-col");
    var imgs = $$(".browser-tile img");
    var travel = [[100, -200], [180, -320], [140, -260], [220, -380]];

    scrubs.push(function () {
      var p = pinProgress(wrap);
      cols.forEach(function (col, i) {
        var t = travel[i % travel.length];
        col.style.transform = "translateY(" + lerp(t[0], t[1], p).toFixed(1) + "px)";
      });
      var s = lerp(1, 1.09, p).toFixed(4);
      imgs.forEach(function (img) { img.style.transform = "scale(" + s + ")"; });
    });
  }

  /* ---------- rAF loop ---------- */
  function startLoop() {
    var queued = false;
    var run = function () {
      queued = false;
      for (var i = 0; i < scrubs.length; i++) scrubs[i]();
    };
    var request = function () {
      if (!queued) { queued = true; requestAnimationFrame(run); }
    };
    window.addEventListener("scroll", request, { passive: true });
    window.addEventListener("resize", request);
    run();
  }

  /* ---------- loader ---------- */
  function dismissLoader() {
    var loader = $("#loader");
    if (!loader) return;
    var go = function () {
      setTimeout(function () { loader.classList.add("is-gone"); }, 420);
    };
    if (document.readyState === "complete") go();
    else window.addEventListener("load", go);
    // hard safety net
    setTimeout(function () { loader.classList.add("is-gone"); }, 4000);
  }

  /* ---------- boot ---------- */
  function init() {
    chrome();
    menu();
    navSelect();

    /* mobile / reduced motion: everything is simply there, nothing reacts
       to scrolling — no reveals, no count-ups, no pinning, no parallax */
    if (mobile || reduced) {
      $$("[data-count]").forEach(countSettle);
      $$("[data-reveal]").forEach(function (n) { n.classList.add("is-in"); });
      if (!reduced) dismissLoader();   // under reduced motion the loader is display:none
      return;
    }

    counters();
    stagger();

    html.classList.add("motion");
    reveal();
    heroTitles();
    dismissLoader();

    heroPanel();
    statementScrub();
    workScrub();
    startLoop();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
