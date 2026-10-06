/* Hero signal terrain: 30 traces in depth, raw WebGL (no library). Lazy-loaded; 2D canvas stays as fallback. */
(function () {
  'use strict';
  var RKA = window.RKA, cv = document.getElementById('wave3d');
  if (!RKA || !cv || !RKA.makeSignal) return;
  var host = cv.parentNode, root = document.documentElement;
  var gl = cv.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: false });
  if (!gl) return;

  /* never run on software renderers (no GPU): the 2D canvas is the better experience there */
  var dbgInfo = gl.getExtension('WEBGL_debug_renderer_info'), rname = dbgInfo ? String(gl.getParameter(dbgInfo.UNMASKED_RENDERER_WEBGL)) : '';
  if (/swiftshader|llvmpipe|software|basic render/i.test(rname) && !window.__forceGL) return;

  var ROWS = 30, N = 360, HOT = 17;
  var VS = [
    'attribute vec3 a; attribute vec2 b;',          // a = x, row, signal ; b = jitter, envelope
    'uniform mat4 u_mvp; uniform float u_p, u_t; uniform vec2 u_ext, u_off, u_amp;',
    'varying float v_r, v_x, v_hot;',
    'float sst(float e0,float e1,float x){float t=clamp((x-e0)/(e1-e0),0.,1.);return t*t*(3.-2.*t);}',
    'void main(){',
    '  float x=a.x, row=a.y;',
    '  float front=-0.14+u_p*1.32;',
    '  float amp=0.1+0.9*sst(front-0.1,front+0.1,x);',
    '  float shimmer=0.62+0.38*sin(u_t*2.2+x*977.0+row*13.0);',
    '  float nz=b.x*shimmer*u_amp.y*amp*(0.45+0.55*(1.0-b.y*0.6));',
    '  float y=a.z*u_amp.x+nz;',
    '  vec3 pos=vec3((x-0.5)*u_ext.x*2.0, y, -(29.0-row)*u_ext.y);',
    '  vec4 c=u_mvp*vec4(pos,1.0);',
    '  c.xy+=u_off*c.w;',
    '  gl_Position=c; v_r=row/29.0; v_x=x; v_hot=step(16.5,row)*step(row,17.5);',
    '}'
  ].join('\n');
  var FS = [
    'precision mediump float;',
    'uniform vec3 u_ink, u_acc; varying float v_r, v_x, v_hot;',
    'void main(){',
    '  float edge=smoothstep(0.0,0.05,v_x)*smoothstep(1.0,0.95,v_x);',
    '  vec3 col=mix(u_ink,u_acc,v_hot);',
    '  float al=mix(0.16,0.9,v_r); al=mix(al,1.0,v_hot);',
    '  gl_FragColor=vec4(col,al*edge);',
    '}'
  ].join('\n');

  function sh(type, src) { var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null; }
  var vs = sh(gl.VERTEX_SHADER, VS), fs = sh(gl.FRAGMENT_SHADER, FS);
  if (!vs || !fs) return;
  var prog = gl.createProgram(); gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
  gl.useProgram(prog);

  /* geometry */
  var sig = RKA.makeSignal(N, ROWS), data = new Float32Array(ROWS * N * 5), o = 0;
  for (var r = 0; r < ROWS; r++) for (var i = 0; i < N; i++) {
    data[o++] = i / (N - 1); data[o++] = r; data[o++] = sig.base[r][i];
    data[o++] = sig.jit[r][i]; data[o++] = sig.env[i];
  }
  var buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  var aA = gl.getAttribLocation(prog, 'a'), aB = gl.getAttribLocation(prog, 'b');
  gl.enableVertexAttribArray(aA); gl.vertexAttribPointer(aA, 3, gl.FLOAT, false, 20, 0);
  gl.enableVertexAttribArray(aB); gl.vertexAttribPointer(aB, 2, gl.FLOAT, false, 20, 12);
  var U = {}; ['u_mvp', 'u_p', 'u_t', 'u_ext', 'u_off', 'u_amp', 'u_ink', 'u_acc'].forEach(function (n) { U[n] = gl.getUniformLocation(prog, n); });
  gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.clearColor(0, 0, 0, 0);
  var CFG = RKA.cfg = { ex: 3.1, dz: 0.15, sa: 0.32, na: 0.085, ey: 2.1, ez: 2.9, ty: -0.27, tz: -1.5, fov: 0.55 };

  /* tiny matrix helpers */
  function persp(f, a, n, fa) { var t = 1 / Math.tan(f / 2), nf = 1 / (n - fa); return [t / a, 0, 0, 0, 0, t, 0, 0, 0, 0, (fa + n) * nf, -1, 0, 0, 2 * fa * n * nf, 0]; }
  function look(e, c) {
    var z = [e[0] - c[0], e[1] - c[1], e[2] - c[2]], l = Math.hypot(z[0], z[1], z[2]); z = [z[0] / l, z[1] / l, z[2] / l];
    var x = [z[2], 0, -z[0]], lx = Math.hypot(x[0], x[2]); x = [x[0] / lx, 0, x[2] / lx];
    var y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
    return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0,
      -(x[0] * e[0] + x[1] * e[1] + x[2] * e[2]), -(y[0] * e[0] + y[1] * e[1] + y[2] * e[2]), -(z[0] * e[0] + z[1] * e[1] + z[2] * e[2]), 1];
  }
  function mul(a, b) { var r = new Array(16), i, j, k; for (i = 0; i < 4; i++) for (j = 0; j < 4; j++) { var s = 0; for (k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k]; r[i * 4 + j] = s; } return r; }

  /* colours from CSS tokens */
  function parse(c) {
    c = c.trim(); var m;
    if ((m = /^#([0-9a-f]{6})$/i.exec(c))) return [parseInt(m[1].slice(0, 2), 16) / 255, parseInt(m[1].slice(2, 4), 16) / 255, parseInt(m[1].slice(4, 6), 16) / 255];
    if ((m = /rgba?\((\d+)[ ,]+(\d+)[ ,]+(\d+)/.exec(c))) return [m[1] / 255, m[2] / 255, m[3] / 255];
    return [0.1, 0.1, 0.1];
  }
  function colors() { var cs = getComputedStyle(root); gl.uniform3fv(U.u_ink, parse(cs.getPropertyValue('--ink'))); gl.uniform3fv(U.u_acc, parse(cs.getPropertyValue('--accent'))); }
  colors();
  var mo = new MutationObserver(colors); mo.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
  var mq = matchMedia('(prefers-color-scheme: dark)'); if (mq.addEventListener) mq.addEventListener('change', colors);

  /* sizing */
  var W = 0, H = 0, dpr = 1;
  function size() {
    dpr = Math.min(devicePixelRatio || 1, 2);
    var r = cv.getBoundingClientRect(); W = Math.max(1, Math.round(r.width * dpr)); H = Math.max(1, Math.round(r.height * dpr));
    cv.width = W; cv.height = H; gl.viewport(0, 0, W, H);
  }
  size();
  var ro = 'ResizeObserver' in window ? new ResizeObserver(size) : null; if (ro) ro.observe(cv); else addEventListener('resize', size);

  /* pointer parallax */
  var tx = 0, ty = 0, mx = 0, my = 0;
  addEventListener('pointermove', function (e) {
    var r = host.getBoundingClientRect(); if (r.bottom < 0 || r.top > innerHeight) return;
    tx = Math.max(-1, Math.min(1, (e.clientX - innerWidth / 2) / (innerWidth / 2)));
    ty = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 2)) / innerHeight));
  }, { passive: true });

  /* frame loop: only while on screen and tab visible */
  var raf = 0, onScreen = true, shown = false, t0 = performance.now(), prev = 0, frames = 0, ema = 16, passes = 2;
  function bail() {
    if (raf) cancelAnimationFrame(raf); raf = 0; onScreen = false; cv.hidden = true; host.classList.remove('gl'); RKA.gl = false; RKA.resume2d && RKA.resume2d();
  }
  function frame(now) {
    raf = 0; if (!onScreen || document.hidden) { prev = 0; return; }
    raf = requestAnimationFrame(frame);
    if (prev) { ema += (now - prev - ema) * 0.1; frames++; if (frames > 45 && ema > 34) { if (passes === 2) { passes = 1; frames = 0; ema = 16; } else { bail(); return; } } }
    prev = now;
    var p = RKA.p; mx += (tx - mx) * 0.06; my += (ty - my) * 0.06;
    var eye = [mx * 0.5, CFG.ey - 0.3 * p + my * 0.25, CFG.ez], tgt = [-mx * 0.12, CFG.ty, CFG.tz];
    gl.uniform2f(U.u_ext, CFG.ex, CFG.dz); gl.uniform2f(U.u_amp, CFG.sa, CFG.na);
    var asp = W / H, mvp = mul(persp(CFG.fov, asp, 0.1, 30), look(eye, tgt));
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniformMatrix4fv(U.u_mvp, false, new Float32Array(mvp));
    gl.uniform1f(U.u_p, p); gl.uniform1f(U.u_t, (now - t0) * 0.001);
    var np = dpr >= 1.5 ? passes : 1;
    for (var k = 0; k < np; k++) {
      gl.uniform2f(U.u_off, 0, k * 2 / H);
      for (var r = 0; r < ROWS; r++) gl.drawArrays(gl.LINE_STRIP, r * N, N);
    }
    if (!shown) { shown = true; host.classList.add('gl'); cv.hidden = false; RKA.suspend2d && RKA.suspend2d(); RKA.gl = true; }
  }
  function start() { if (!raf && onScreen && !document.hidden) raf = requestAnimationFrame(frame); }
  if ('IntersectionObserver' in window) new IntersectionObserver(function (es) { onScreen = es[0].isIntersecting; start(); }).observe(host);
  document.addEventListener('visibilitychange', start);
  cv.hidden = false; // needed so the first frame has a size; hidden again if we fail
  start();

  /* context loss -> hand back to the 2D canvas */
  cv.addEventListener('webglcontextlost', function (e) { e.preventDefault(); cv.hidden = true; host.classList.remove('gl'); RKA.resume2d && RKA.resume2d(); });

  /* dispose */
  addEventListener('pagehide', function () {
    if (raf) cancelAnimationFrame(raf); mo.disconnect(); if (ro) ro.disconnect();
    gl.deleteBuffer(buf); gl.deleteProgram(prog); gl.deleteShader(vs); gl.deleteShader(fs);
    var ext = gl.getExtension('WEBGL_lose_context'); if (ext) ext.loseContext();
  });
})();
