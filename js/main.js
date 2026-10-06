(function () {
  'use strict';
  var root = document.documentElement;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── Theme toggle ── */
  var btn = document.getElementById('theme');
  function isDark() {
    var t = root.getAttribute('data-theme');
    return t ? t === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
  }
  function syncBtn() {
    btn.setAttribute('aria-label', isDark() ? 'Switch to light theme' : 'Switch to dark theme');
  }
  btn.addEventListener('click', function () {
    var next = isDark() ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem('theme', next); } catch (e) {}
    syncBtn();
    if (wave) wave.redraw(true);
  });
  syncBtn();

  var yr = document.getElementById('yr');
  if (yr) yr.textContent = new Date().getFullYear();

  /* ── Scroll reveal ── */
  var rv = document.querySelectorAll('.rv');
  if ('IntersectionObserver' in window && !reduce) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    rv.forEach(function (el) { io.observe(el); });
  } else {
    rv.forEach(function (el) { el.classList.add('in'); });
  }

  /* ── Hero waveform: 30 traces, noise clears left to right with scroll ── */
  var wave = null;
  var cv = document.getElementById('wave');
  if (cv && cv.getContext) {
    var ctx = cv.getContext('2d');
    var werEl = document.getElementById('wer');
    var FAM = 5, PER = 6, TOTAL = 30, ACCENT_TRACE = 17;
    var W = 0, H = 0, N = 0, base = [], jit = [], env = [];
    var p = reduce ? 0.55 : 0;
    var shift = 0, visible = true, raf = 0, last = 0;

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

    function build() {
      var rect = cv.getBoundingClientRect();
      W = Math.max(1, Math.round(rect.width)); H = Math.max(1, Math.round(rect.height));
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv.width = W * dpr; cv.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      N = Math.max(160, Math.min(520, Math.round(W / 2.2)));
      var r = mulberry(3);
      env = new Float32Array(N);
      var bumps = [];
      for (var b = 0; b < 9; b++) bumps.push([0.05 + r() * 0.9, 0.012 + r() * 0.04, 0.5 + r() * 0.5]);
      var mx = 0, i, n;
      for (i = 0; i < N; i++) {
        var x = i / (N - 1), e = 0;
        for (b = 0; b < 9; b++) e += bumps[b][2] * Math.exp(-Math.pow(x - bumps[b][0], 2) / (2 * bumps[b][1] * bumps[b][1]));
        env[i] = e; if (e > mx) mx = e;
      }
      for (i = 0; i < N; i++) env[i] /= mx;
      base = []; jit = [];
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
    }

    var cInk = '', cAcc = '';
    function readColors() { var cs = getComputedStyle(root); cInk = cs.getPropertyValue('--ink').trim(); cAcc = cs.getPropertyValue('--accent').trim(); }
    var small = window.matchMedia('(max-width: 700px)').matches;

    function draw() {
      raf = 0;
      var ink = cInk, acc = cAcc;
      ctx.clearRect(0, 0, W, H);
      var padL = 26, padR = 2, x0 = padL, x1 = W - padR;
      var famGap = H < 300 ? 10 : 14, padY = 8;
      var gap = (H - padY * 2 - (FAM - 1) * famGap) / ((FAM) * (PER - 1) + 1);
      var sigA = gap * 1.35, nzA = gap * 0.6;
      var front = -0.14 + p * 1.32;
      var wer = 5.7 - 3.1 * smooth(0.04, 0.96, p);
      if (werEl) werEl.textContent = wer.toFixed(1);

      ctx.lineJoin = 'round';
      ctx.font = '11px "Geist Mono", ui-monospace, monospace';
      ctx.textBaseline = 'middle';
      var roman = ['I', 'II', 'III', 'IV', 'V'];
      for (var f = 0; f < FAM; f++) {
        var yTop = padY + f * ((PER - 1) * gap + famGap + gap * 0);
        ctx.globalAlpha = 0.6; ctx.fillStyle = ink;
        ctx.fillText(roman[f], 0, yTop + ((PER - 1) * gap) / 2 + gap * 0.5);
      }
      for (var n = 0; n < TOTAL; n++) {
        var fam = (n / PER) | 0, k = n % PER;
        var y0 = padY + gap * 0.5 + fam * ((PER - 1) * gap + famGap) + k * gap;
        var s = base[n], j = jit[n];
        var hot = n === ACCENT_TRACE;
        ctx.beginPath();
        for (var i = 0; i < N; i++) {
          var x = i / (N - 1);
          var noisy = smooth(front - 0.1, front + 0.1, x);
          var amp = 0.1 + 0.9 * noisy;
          var nz = j[(i + shift) % (N + 32)] * nzA * amp * (0.45 + 0.55 * (1 - env[i] * 0.6));
          var y = y0 - (s[i] * sigA + nz);
          var px = x0 + x * (x1 - x0);
          if (i) ctx.lineTo(px, y); else ctx.moveTo(px, y);
        }
        ctx.globalAlpha = hot ? 1 : 0.5 + 0.35 * (k / (PER - 1));
        ctx.strokeStyle = hot ? acc : ink;
        ctx.lineWidth = hot ? 1.5 : 1;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    function schedule() { if (!raf) raf = requestAnimationFrame(draw); }

    function onScroll() {
      if (reduce) return;
      var np = Math.min(1, Math.max(0, window.scrollY / (window.innerHeight * 0.75)));
      if (np !== p) { p = np; schedule(); }
    }
    function tick(t) {
      if (!visible || reduce) return;
      if (t - last > 140) { last = t; shift = (shift + 3) % 32; schedule(); }
      requestAnimationFrame(tick);
    }

    readColors(); build(); draw();
    wave = { redraw: function () { readColors(); draw(); } };
    if (!reduce) {
      window.addEventListener('scroll', onScroll, { passive: true });
      onScroll();
      if ('IntersectionObserver' in window) {
        new IntersectionObserver(function (es) {
          var v = es[0].isIntersecting;
          if (v && !visible) { visible = true; if (!small) requestAnimationFrame(tick); } else visible = v;
        }).observe(cv);
      }
      if (!small) requestAnimationFrame(tick);
    }
    var rt;
    window.addEventListener('resize', function () {
      clearTimeout(rt); rt = setTimeout(function () { build(); draw(); }, 120);
    });
  }
})();
