(function () {
  'use strict';
  var root = document.documentElement, body = document.body;
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var fine = matchMedia('(pointer: fine)').matches && matchMedia('(hover: hover)').matches;
  var RKA = window.RKA = { p: reduce ? 0.55 : 0, makeSignal: null, suspend2d: null };
  var wave = null;

  /* ───────── shared signal data (used by 2D hero and WebGL terrain) ───────── */
  function mulberry(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function gauss(r) { var u = 0, v = 0; while (!u) u = r(); while (!v) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.2831853 * v); }
  function smooth(a, b, x) { var t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
  RKA.makeSignal = function (N, TOTAL) {
    var r = mulberry(3), env = new Float32Array(N), bumps = [], b, i, n, mx = 0;
    for (b = 0; b < 9; b++) bumps.push([0.05 + r() * 0.9, 0.012 + r() * 0.04, 0.5 + r() * 0.5]);
    for (i = 0; i < N; i++) {
      var x = i / (N - 1), e = 0;
      for (b = 0; b < 9; b++) e += bumps[b][2] * Math.exp(-Math.pow(x - bumps[b][0], 2) / (2 * bumps[b][1] * bumps[b][1]));
      env[i] = e; if (e > mx) mx = e;
    }
    for (i = 0; i < N; i++) env[i] /= mx;
    var base = [], jit = [];
    for (n = 0; n < TOTAL; n++) {
      var rn = mulberry(900 + n), ph = rn() * 6.28;
      var s = new Float32Array(N), j = new Float32Array(N + 64);
      for (i = 0; i < N; i++) {
        var xx = i / (N - 1);
        s[i] = env[i] * (Math.sin(xx * (210 + n * 3.1) + ph) * 0.55 + Math.sin(xx * (97 + n) + ph * 1.7) * 0.45);
      }
      for (i = 0; i < j.length; i++) j[i] = gauss(rn);
      base.push(s); jit.push(j);
    }
    return { env: env, base: base, jit: jit };
  };

  /* ───────── theme toggle, with circular reveal where supported ───────── */
  var btn = document.getElementById('theme');
  function isDark() {
    var t = root.getAttribute('data-theme');
    return t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  }
  function syncBtn() { btn.setAttribute('aria-label', isDark() ? 'Switch to light theme' : 'Switch to dark theme'); }
  btn.addEventListener('click', function () {
    var next = isDark() ? 'light' : 'dark';
    function apply() {
      root.setAttribute('data-theme', next);
      try { localStorage.setItem('theme', next); } catch (e) {}
      syncBtn();
      if (wave) wave.redraw();
    }
    if (document.startViewTransition && !reduce) {
      var r = btn.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
      var rad = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
      var vt = document.startViewTransition(apply);
      vt.ready.then(function () {
        root.animate(
          { clipPath: ['circle(0px at ' + x + 'px ' + y + 'px)', 'circle(' + rad + 'px at ' + x + 'px ' + y + 'px)'] },
          { duration: 450, easing: 'ease-in', pseudoElement: '::view-transition-new(root)' }
        );
      }).catch(function () {});
    } else apply();
  });
  syncBtn();
  var yr = document.getElementById('yr'); if (yr) yr.textContent = new Date().getFullYear();

  /* ───────── reveal on scroll ───────── */
  var rv = document.querySelectorAll('.rv');
  var hasIO = 'IntersectionObserver' in window;
  if (hasIO && !reduce) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    rv.forEach(function (el) { io.observe(el); });
  } else rv.forEach(function (el) { el.classList.add('in'); });

  /* ───────── heading word reveal ───────── */
  function splitNode(node, c) {
    Array.prototype.slice.call(node.childNodes).forEach(function (n) {
      if (n.nodeType === 3) {
        var frag = document.createDocumentFragment();
        n.textContent.split(/(\s+)/).forEach(function (s) {
          if (!s) return;
          if (/^\s+$/.test(s)) { frag.appendChild(document.createTextNode(' ')); return; }
          var sp = document.createElement('span'); sp.className = 'w';
          sp.style.setProperty('--wi', c.i++); sp.textContent = s; frag.appendChild(sp);
        });
        node.replaceChild(frag, n);
      } else if (n.nodeType === 1 && n.childNodes.length) splitNode(n, c);
    });
  }
  var heads = document.querySelectorAll('[data-split]');
  if (!reduce && hasIO) {
    var hio = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); hio.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.2 });
    heads.forEach(function (h) {
      h.setAttribute('aria-label', h.textContent.replace(/\s+/g, ' ').trim());
      splitNode(h, { i: 0 }); hio.observe(h);
    });
  }

  /* ───────── background tone follows the section in view ───────── */
  if (hasIO) {
    var tio = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) body.classList.toggle('tone-2', e.target.getAttribute('data-tone') === '2'); });
    }, { rootMargin: '-48% 0px -48% 0px' });
    document.querySelectorAll('[data-tone]').forEach(function (t) { tio.observe(t); });
  }

  /* ───────── scroll: progress fallback + hero progress ───────── */
  var prog = document.querySelector('.progress');
  var nativeProg = window.CSS && CSS.supports && CSS.supports('animation-timeline', 'scroll()');
  var ticking = false, werEl = document.getElementById('wer');
  function setWer(p) { if (werEl) werEl.textContent = (5.7 - 3.1 * smooth(0.04, 0.96, p)).toFixed(1); }
  function onScroll() {
    if (ticking) return; ticking = true;
    requestAnimationFrame(function () {
      ticking = false;
      if (prog && !nativeProg && !reduce) {
        var h = document.documentElement.scrollHeight - innerHeight;
        prog.style.transform = 'scaleX(' + (h > 0 ? Math.min(1, scrollY / h) : 0) + ')';
      }
      if (!reduce) {
        var np = Math.min(1, Math.max(0, scrollY / (innerHeight * 0.75)));
        if (np !== RKA.p) { RKA.p = np; setWer(np); if (wave) wave.schedule(); }
      }
    });
  }
  if (!reduce) { addEventListener('scroll', onScroll, { passive: true }); onScroll(); }

  /* ───────── hero waveform (2D canvas; fallback for 3D) ───────── */
  var cv = document.getElementById('wave');
  if (cv && cv.getContext) {
    var ctx = cv.getContext('2d');
    var FAM = 5, PER = 6, TOTAL = 30, ACC = 17;
    var W = 0, H = 0, N = 0, sig, shift = 0, visible = true, raf = 0, last = 0, active = true;
    var cInk = '', cAcc = '';
    var small = matchMedia('(max-width: 700px)').matches;
    function readColors() { var cs = getComputedStyle(root); cInk = cs.getPropertyValue('--ink').trim(); cAcc = cs.getPropertyValue('--accent').trim(); }
    function build() {
      var rect = cv.getBoundingClientRect();
      W = Math.max(1, Math.round(rect.width)); H = Math.max(1, Math.round(rect.height));
      var dpr = Math.min(devicePixelRatio || 1, 2);
      cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      N = Math.max(160, Math.min(520, Math.round(W / 2.2)));
      sig = RKA.makeSignal(N, TOTAL);
    }
    function draw() {
      raf = 0; if (!active) return;
      var ink = cInk, acc = cAcc, p = RKA.p, env = sig.env;
      ctx.clearRect(0, 0, W, H);
      var padL = 26, x0 = padL, x1 = W - 2, famGap = H < 300 ? 10 : 14, padY = 8;
      var gap = (H - padY * 2 - (FAM - 1) * famGap) / (FAM * (PER - 1) + 1);
      var sigA = gap * 1.35, nzA = gap * 0.6, front = -0.14 + p * 1.32;
      ctx.lineJoin = 'round'; ctx.font = '11px "Geist Mono", ui-monospace, monospace'; ctx.textBaseline = 'middle';
      var roman = ['I', 'II', 'III', 'IV', 'V'], f, n, i;
      for (f = 0; f < FAM; f++) {
        ctx.globalAlpha = 0.6; ctx.fillStyle = ink;
        ctx.fillText(roman[f], 0, padY + f * ((PER - 1) * gap + famGap) + ((PER - 1) * gap) / 2 + gap * 0.5);
      }
      for (n = 0; n < TOTAL; n++) {
        var fam = (n / PER) | 0, k = n % PER;
        var y0 = padY + gap * 0.5 + fam * ((PER - 1) * gap + famGap) + k * gap;
        var s = sig.base[n], j = sig.jit[n], hot = n === ACC;
        ctx.beginPath();
        for (i = 0; i < N; i++) {
          var x = i / (N - 1), amp = 0.1 + 0.9 * smooth(front - 0.1, front + 0.1, x);
          var nz = j[(i + shift) % (N + 32)] * nzA * amp * (0.45 + 0.55 * (1 - env[i] * 0.6));
          var y = y0 - (s[i] * sigA + nz), px = x0 + x * (x1 - x0);
          if (i) ctx.lineTo(px, y); else ctx.moveTo(px, y);
        }
        ctx.globalAlpha = hot ? 1 : 0.5 + 0.35 * (k / (PER - 1));
        ctx.strokeStyle = hot ? acc : ink; ctx.lineWidth = hot ? 1.5 : 1; ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    function schedule() { if (active && !raf) raf = requestAnimationFrame(draw); }
    function tick(t) {
      if (!visible || reduce || !active) return;
      if (t - last > 140) { last = t; shift = (shift + 3) % 32; schedule(); }
      requestAnimationFrame(tick);
    }
    readColors(); build(); setWer(RKA.p); draw();
    wave = { redraw: function () { readColors(); draw(); }, schedule: schedule };
    RKA.suspend2d = function () { active = false; };
    RKA.resume2d = function () { active = true; build(); draw(); if (!reduce && !small) requestAnimationFrame(tick); };
    if (!reduce) {
      if (hasIO) new IntersectionObserver(function (es) {
        var v = es[0].isIntersecting;
        if (v && !visible) { visible = true; if (!small && active) requestAnimationFrame(tick); } else visible = v;
      }).observe(cv);
      if (!small) requestAnimationFrame(tick);
    }
    var rt;
    addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(function () { if (active) { build(); draw(); } }, 120); });
  }

  /* ───────── lazy 3D terrain: desktop, fine pointer, 4+ cores only ───────── */
  function maybeLoad3D() {
    if (reduce || !fine || innerWidth < 900) return;
    if ((navigator.hardwareConcurrency || 2) < 4) return;
    if (navigator.deviceMemory && navigator.deviceMemory < 4) return;
    var s = document.createElement('script'); s.src = 'js/terrain.js'; s.async = true; document.body.appendChild(s);
  }
  addEventListener('load', function () { (window.requestIdleCallback || function (f) { setTimeout(f, 300); })(maybeLoad3D, { timeout: 1500 }); });

  /* ───────── WER chart: both bars draw to 5.7, then the tuned run drops to 2.6 ───────── */
  var bar1 = document.getElementById('bar1'), bar2 = document.getElementById('bar2');
  var val1 = document.getElementById('val1'), val2 = document.getElementById('val2');
  if (bar1 && bar2 && !reduce && hasIO) {
    var FULL = 296.4, LOW = 135.2;
    var ease = function (t) { t = Math.min(1, Math.max(0, t)); return 1 - Math.pow(1 - t, 3); };
    function setChart(w1, v1, w2, v2) {
      bar1.setAttribute('width', w1.toFixed(1)); val1.setAttribute('x', (w1 + 8).toFixed(1)); val1.textContent = v1.toFixed(1) + '%';
      bar2.setAttribute('width', w2.toFixed(1)); val2.setAttribute('x', (w2 + 8).toFixed(1)); val2.textContent = v2.toFixed(1) + '%';
    }
    bar2.classList.remove('acc'); val2.classList.remove('acc');
    setChart(0, 0, 0, 0);
    new IntersectionObserver(function (es, o) {
      if (!es[0].isIntersecting) return; o.disconnect();
      var t0 = null;
      requestAnimationFrame(function step(t) {
        if (t0 === null) t0 = t;
        var el = t - t0, a = ease(el / 800), b = ease((el - 1200) / 900);
        var w2 = FULL - (FULL - LOW) * b, v2 = 5.7 - 3.1 * b;
        setChart(FULL * a, 5.7 * a, el < 1200 ? FULL * a : w2, el < 1200 ? 5.7 * a : v2);
        if (b > 0.35) { bar2.classList.add('acc'); val2.classList.add('acc'); }
        if (el < 2200) requestAnimationFrame(step); else setChart(FULL, 5.7, LOW, 2.6);
      });
    }, { threshold: 0.6 }).observe(document.querySelector('.chart'));
  }

  /* ───────── pointer effects (mouse only, never with reduced motion) ───────── */
  if (fine && !reduce) {
    /* magnetic buttons */
    document.querySelectorAll('.btn').forEach(function (b) {
      b.classList.add('is-mag'); var pend = 0;
      b.addEventListener('pointermove', function (e) {
        var r = b.getBoundingClientRect(), dx = (e.clientX - r.left - r.width / 2) * 0.22, dy = (e.clientY - r.top - r.height / 2) * 0.3;
        if (pend) cancelAnimationFrame(pend);
        pend = requestAnimationFrame(function () { b.classList.add('is-hot'); b.style.transform = 'translate(' + dx.toFixed(1) + 'px,' + dy.toFixed(1) + 'px)'; });
      });
      b.addEventListener('pointerleave', function () { b.classList.remove('is-hot'); b.style.transform = ''; });
    });

    /* panel tilt (max 4 deg) + soft cursor highlight */
    document.querySelectorAll('.viz').forEach(function (el) {
      var tilt = !el.classList.contains('viz-3d'), pend = 0;
      if (tilt) el.classList.add('is-tilt');
      el.addEventListener('pointermove', function (e) {
        var r = el.getBoundingClientRect(), px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
        if (pend) cancelAnimationFrame(pend);
        pend = requestAnimationFrame(function () {
          el.classList.add('is-hot');
          el.style.setProperty('--mx', (px * 100).toFixed(1) + '%'); el.style.setProperty('--my', (py * 100).toFixed(1) + '%');
          if (tilt) el.style.transform = 'perspective(1000px) rotateX(' + ((0.5 - py) * 4).toFixed(2) + 'deg) rotateY(' + ((px - 0.5) * 6).toFixed(2) + 'deg)';
        });
      });
      el.addEventListener('pointerleave', function () { el.classList.remove('is-hot'); if (tilt) el.style.transform = ''; });
    });
  }

  /* ───────── rubric: squares lift toward the cursor; tap highlights a family on touch ───────── */
  var rub = document.querySelector('.rubric');
  if (rub) {
    var cells = Array.prototype.slice.call(rub.querySelectorAll('.cell')), fams = Array.prototype.slice.call(rub.querySelectorAll('.fam'));
    fams.forEach(function (f) {
      f.addEventListener('click', function (e) {
        if (fine) return;
        var on = f.classList.contains('hot'); fams.forEach(function (x) { x.classList.remove('hot'); }); if (!on) f.classList.add('hot');
      });
    });
    if (fine && !reduce) {
      var pend2 = 0;
      rub.addEventListener('pointermove', function (e) {
        if (pend2) cancelAnimationFrame(pend2);
        pend2 = requestAnimationFrame(function () {
          var R = rub.getBoundingClientRect();
          rub.style.setProperty('--ry', (((e.clientX - R.left) / R.width - 0.5) * 8).toFixed(2) + 'deg');
          rub.style.setProperty('--rx', ((0.5 - (e.clientY - R.top) / R.height) * 6).toFixed(2) + 'deg');
          cells.forEach(function (c) {
            var r = c.getBoundingClientRect(), d = Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2));
            c.style.setProperty('--l', Math.max(0, 1 - d / 80).toFixed(2));
          });
          var f = e.target.closest && e.target.closest('.fam');
          fams.forEach(function (x) { x.classList.toggle('hot', x === f); });
        });
      });
      rub.addEventListener('pointerleave', function () {
        rub.style.setProperty('--rx', '0deg'); rub.style.setProperty('--ry', '0deg');
        cells.forEach(function (c) { c.style.setProperty('--l', 0); });
        fams.forEach(function (x) { x.classList.remove('hot'); });
      });
    }
  }
})();
