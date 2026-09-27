/* Toy differentiable-refinement explainer that really runs: a 4-knob chair program is fitted to a target
   silhouette by cross-entropy search, and each round is admitted only if silhouette IoU rises by >= 0.002.
   It illustrates the idea at toy scale; it is not a recorded NeoWorld-3 run. */
(() => {
  const root = document.querySelector('#refine');
  if (!root) return;
  const view = root.querySelector('#refine-canvas'), vctx = view.getContext('2d');
  const chart = root.querySelector('#refine-chart'), cctx = chart.getContext('2d');
  const code = root.querySelector('#refine-code');
  const slider = root.querySelector('#refine-step'), playBtn = root.querySelector('#refine-play');
  const iouOut = root.querySelector('#refine-iou'), stepOut = root.querySelector('#refine-step-out'), logOut = root.querySelector('#refine-log');

  const KNOBS = [
    { key: 'seat_depth', lo: .30, hi: .60, unit: 'm' },
    { key: 'back_height', lo: .28, hi: .66, unit: 'm' },
    { key: 'leg_length', lo: .34, hi: .62, unit: 'm', note: 'shared by all four legs' },
    { key: 'back_tilt', lo: -5, hi: 25, unit: '°' },
  ];
  const TARGET = { seat_depth: .46, back_height: .52, leg_length: .47, back_tilt: 12 };
  const START = { seat_depth: .35, back_height: .36, leg_length: .58, back_tilt: 0 };

  // The "construction program": parts are expressions of the knobs.
  function parts(t) {
    const s = t.seat_depth, L = t.leg_length, a = t.back_tilt * Math.PI / 180;
    const rearX = -s / 2;
    return [
      { x: -s / 2, y: L, w: s, h: .045 },                              // seat
      { x: s / 2 - .035, y: 0, w: .03, h: L },                          // front leg
      { x: rearX + .005, y: 0, w: .03, h: L },                          // rear leg
      { x: rearX, y: L + .045, w: .032, h: t.back_height, rot: a, ox: rearX, oy: L + .045 }, // back post
      { x: rearX - .005, y: L + .045 + t.back_height * .5, w: .05, h: t.back_height * .45, rot: a, ox: rearX, oy: L + .045 }, // back pad
    ];
  }
  function drawParts(ctx, t, toPx, mode) {
    for (const p of parts(t)) {
      ctx.save();
      const [ox, oy] = toPx(p.ox ?? 0, p.oy ?? 0);
      if (p.rot) { ctx.translate(ox, oy); ctx.rotate(-p.rot); ctx.translate(-ox, -oy); } // lean backwards
      const [x0, y0] = toPx(p.x, p.y + p.h), [x1, y1] = toPx(p.x + p.w, p.y);
      ctx.beginPath(); ctx.rect(x0, y0, x1 - x0, y1 - y0);
      if (mode !== 'stroke') ctx.fill();
      if (mode !== 'fill') ctx.stroke();
      ctx.restore();
    }
  }
  // Silhouette raster for IoU.
  const N = 128, off = document.createElement('canvas'); off.width = off.height = N;
  const octx = off.getContext('2d', { willReadFrequently: true });
  const mapMask = (x, y) => [N / 2 + x * N / 1.35, N - 4 - y * N / 1.35];
  function mask(t) {
    octx.clearRect(0, 0, N, N); octx.fillStyle = '#000'; drawParts(octx, t, mapMask, 'fill');
    const d = octx.getImageData(0, 0, N, N).data, m = new Uint8Array(N * N);
    for (let i = 0; i < m.length; i++) m[i] = d[i * 4 + 3] > 127 ? 1 : 0;
    return m;
  }
  const targetMask = mask(TARGET);
  // Hard IoU decides admission.
  function iou(t) {
    const m = mask(t); let inter = 0, uni = 0;
    for (let i = 0; i < m.length; i++) { inter += m[i] & targetMask[i]; uni += m[i] | targetMask[i]; }
    return uni ? inter / uni : 0;
  }
  // Search uses a smooth version (box-blurred silhouettes), so thin legs still give a usable signal.
  function blur(m, r = 4) {
    const a = Float32Array.from(m), b = new Float32Array(N * N), w = 2 * r + 1;
    for (let pass = 0; pass < 2; pass++) {
      const src = pass ? b : a, dst = pass ? a : b;
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        let s = 0;
        for (let k = -r; k <= r; k++) {
          const xx = pass ? x : Math.min(N - 1, Math.max(0, x + k)), yy = pass ? Math.min(N - 1, Math.max(0, y + k)) : y;
          s += src[yy * N + xx];
        }
        dst[y * N + x] = s / w;
      }
    }
    return a;
  }
  const targetSoft = blur(targetMask);
  function soft(t) {
    const m = blur(mask(t)); let lo = 0, hi = 0;
    for (let i = 0; i < m.length; i++) { lo += Math.min(m[i], targetSoft[i]); hi += Math.max(m[i], targetSoft[i]); }
    return hi ? lo / hi : 0;
  }
  // Seeded RNG so every visitor sees the same run.
  let seed = 20260926;
  const rand = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let x = Math.imul(seed ^ seed >>> 15, 1 | seed); x = x + Math.imul(x ^ x >>> 7, 61 | x) ^ x; return ((x ^ x >>> 14) >>> 0) / 4294967296; };
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
  const clamp = (k, v) => Math.min(k.hi, Math.max(k.lo, v));

  // Phase 1: cross-entropy search over the four knobs. Phase 2: local polish from the best result
  // Every round passes the same admission rule.
  const SEARCH = 14, POLISH = 10, ROUNDS = SEARCH + POLISH, POP = 24, ELITE = 6;
  const history = [{ theta: { ...START }, iou: iou(START), admitted: true, cands: [] }];
  let mu = { ...START }, sigma = Object.fromEntries(KNOBS.map(k => [k.key, (k.hi - k.lo) * .25]));
  let retained = { ...START }, retainedIoU = history[0].iou;
  const admit = (t, s, cands, phase) => {
    const admitted = s >= retainedIoU + .002;
    if (admitted) { retained = { ...t }; retainedIoU = s; }
    history.push({ theta: { ...retained }, iou: retainedIoU, admitted, best: s, cands, phase });
  };
  for (let r = 1; r <= SEARCH; r++) {
    const cands = [{ t: { ...retained }, s: soft(retained) }]; // keep the retained program in the pool
    for (let i = 1; i < POP; i++) {
      const t = {}; for (const k of KNOBS) t[k.key] = clamp(k, mu[k.key] + sigma[k.key] * gauss());
      cands.push({ t, s: soft(t) });
    }
    cands.sort((a, b) => b.s - a.s);
    const elites = cands.slice(0, ELITE);
    for (const k of KNOBS) {
      const m = elites.reduce((a, e) => a + e.t[k.key], 0) / ELITE;
      const sd = Math.sqrt(elites.reduce((a, e) => a + (e.t[k.key] - m) ** 2, 0) / ELITE);
      mu[k.key] = .7 * m + .3 * mu[k.key]; sigma[k.key] = Math.max(sd, (k.hi - k.lo) * .02);
    }
    admit(cands[0].t, iou(cands[0].t), cands.map(c => c.t), 'search');
  }
  // Per-knob step sizes that grow after success and shrink after failure (a simple adaptive step).
  const step = Object.fromEntries(KNOBS.map(k => [k.key, (k.hi - k.lo) * .06]));
  for (let r = 1; r <= POLISH; r++) {
    let t = { ...retained }, best = soft(t);
    const probes = [];
    for (const k of KNOBS) {
      let moved = false;
      for (const dir of [1, -1]) {
        const c = { ...t, [k.key]: clamp(k, t[k.key] + dir * step[k.key]) }, s = soft(c); probes.push(c);
        if (s > best) { t = c; best = s; moved = true; break; }
      }
      step[k.key] *= moved ? 1.3 : .5;
    }
    admit(t, iou(t), probes, 'polish');
  }
  slider.max = ROUNDS;

  const fmt = (k, v) => k.unit === '°' ? v.toFixed(1) : v.toFixed(3);
  function render(step) {
    const h = history[step], dpr = Math.min(devicePixelRatio, 2);
    const W = view.clientWidth, H = view.clientHeight;
    if (view.width !== Math.round(W * dpr)) { view.width = Math.round(W * dpr); view.height = Math.round(H * dpr); }
    vctx.setTransform(dpr, 0, 0, dpr, 0, 0); vctx.clearRect(0, 0, W, H);
    const scale = Math.min(W, H) / 1.35;
    const toPx = (x, y) => [W / 2 + x * scale, H - 14 - y * scale];
    vctx.strokeStyle = NW.css('--line'); vctx.lineWidth = 1; vctx.beginPath(); vctx.moveTo(0, H - 14); vctx.lineTo(W, H - 14); vctx.stroke();
    // Candidates searched this round (faint), target (dashed), retained program (filled).
    vctx.lineWidth = 1; vctx.strokeStyle = NW.css('--muted') + '33';
    for (const c of h.cands.slice(0, 10)) drawParts(vctx, c, toPx, 'stroke');
    vctx.setLineDash([5, 4]); vctx.strokeStyle = NW.css('--ink'); vctx.lineWidth = 1.5; drawParts(vctx, TARGET, toPx, 'stroke');
    vctx.setLineDash([]); vctx.fillStyle = NW.css('--accent') + '66'; vctx.strokeStyle = NW.css('--accent'); vctx.lineWidth = 2;
    drawParts(vctx, h.theta, toPx, 'both');
    // Program text with live knob values.
    const prev = history[Math.max(0, step - 1)].theta;
    code.innerHTML = [
      '<span class="c"># construction program S · knobs θ are named, bounded constants</span>',
      ...KNOBS.map(k => `<span${step && h.admitted && Math.abs(prev[k.key] - h.theta[k.key]) > 1e-9 ? ' class="hl"' : ''}>${k.key.padEnd(12)}= <b>${fmt(k, h.theta[k.key])}</b>  <i># ${k.lo}…${k.hi} ${k.unit}${k.note ? ' · ' + k.note : ''}</i></span>`),
      '<span>seat  = box(depth=seat_depth, y=leg_length)</span>',
      '<span>legs  = [leg(length=leg_length) for _ in range(4)]</span>',
      '<span>back  = post(height=back_height).tilt(back_tilt)</span>',
    ].join('');
    iouOut.textContent = h.iou.toFixed(3); stepOut.textContent = step;
    const what = h.phase === 'polish' ? 'Polish step' : 'Search round';
    logOut.innerHTML = step === 0 ? 'Start: the agent\'s first guess, written as code.'
      : h.admitted ? `${what} ${step}: candidate IoU ${h.best.toFixed(3)} beats the kept program by ≥ 0.002 → <b>admitted</b>.`
        : `${what} ${step}: candidate IoU ${h.best.toFixed(3)} is not better by 0.002 → <b>refused</b>, program unchanged.`;
    drawChart(step);
  }
  function drawChart(step) {
    const dpr = Math.min(devicePixelRatio, 2), W = chart.clientWidth, H = chart.clientHeight;
    if (chart.width !== Math.round(W * dpr)) { chart.width = Math.round(W * dpr); chart.height = Math.round(H * dpr); }
    cctx.setTransform(dpr, 0, 0, dpr, 0, 0); cctx.clearRect(0, 0, W, H);
    const L = 34, B = 20, top = 8, lo = Math.floor(history[0].iou * 10) / 10;
    const px = i => L + i / ROUNDS * (W - L - 8), py = s => top + (1 - (s - lo) / (1 - lo)) * (H - top - B);
    cctx.font = '10px "JetBrains Mono", monospace'; cctx.fillStyle = NW.css('--muted'); cctx.strokeStyle = NW.css('--line');
    for (const g of [lo, (lo + 1) / 2, 1]) { cctx.beginPath(); cctx.moveTo(L, py(g)); cctx.lineTo(W - 8, py(g)); cctx.stroke(); cctx.fillText(g.toFixed(2), 0, py(g) + 3); }
    cctx.fillText('round', W - 44, H - 5);
    cctx.strokeStyle = NW.css('--accent'); cctx.lineWidth = 2; cctx.beginPath();
    history.forEach((h, i) => { if (i > step) return; i ? cctx.lineTo(px(i), py(h.iou)) : cctx.moveTo(px(i), py(h.iou)); }); cctx.stroke();
    history.forEach((h, i) => {
      if (i > step || i === 0) return;
      cctx.beginPath(); cctx.arc(px(i), py(h.iou), 3.5, 0, Math.PI * 2);
      if (h.admitted) { cctx.fillStyle = NW.css('--accent'); cctx.fill(); } else { cctx.strokeStyle = NW.css('--muted'); cctx.lineWidth = 1.2; cctx.stroke(); }
    });
  }
  let timer = null;
  function stop() { clearInterval(timer); timer = null; playBtn.textContent = 'Run the search'; }
  playBtn.addEventListener('click', () => {
    if (timer) return stop();
    if (+slider.value >= ROUNDS) slider.value = 0;
    playBtn.textContent = 'Pause';
    timer = setInterval(() => { slider.value = +slider.value + 1; render(+slider.value); if (+slider.value >= ROUNDS) stop(); }, NW.reduced.matches ? 60 : 320);
  });
  slider.addEventListener('input', () => { stop(); render(+slider.value); });
  new ResizeObserver(() => render(+slider.value)).observe(view);
  document.addEventListener('nw-theme', () => render(+slider.value));
  const admittedCount = history.filter((h, i) => i && h.admitted).length;
  root.querySelector('#refine-summary').textContent = `${SEARCH} search rounds + ${POLISH} polish steps · ${admittedCount} admitted · final IoU ${history[ROUNDS].iou.toFixed(3)}`;
  render(0);
})();
