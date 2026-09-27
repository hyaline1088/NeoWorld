/* The method, told by scrolling. A rebuilt copy of the method figure stays pinned while the steps scroll past;
   each step zooms the figure to its blocks and lights them up. The last step swaps in the real example
   (scan -> twin -> real action), whose frames follow the scroll position. */
(() => {
  const root = document.querySelector('#method');
  if (!root) return;
  const stage = root.querySelector('.mstage');
  const board = root.querySelector('.mboard');
  const steps = [...root.querySelectorAll('.mstep')];
  const counter = root.querySelector('.mstage-count');
  const finale = root.querySelector('.mfinale');
  const BW = 1690, BH = 1127;
  // Per step: the part of the figure to frame, the blocks and arrows to light up.
  const STEPS = [
    { rect: [10, 110, 300, 310], on: ['obs'] },
    { rect: [10, 110, 640, 320], on: ['obs', 'agent'], arrows: ['a-obs'] },
    { rect: [340, 110, 980, 330], on: ['agent', 'mcp'] },
    { rect: [10, 160, 640, 700], on: ['agent', 'handoff'], arrows: ['a-handoff'] },
    { rect: [10, 470, 1300, 420], on: ['handoff', 'author', 'refine', 'feedback', 'spec'], arrows: ['a-spec', 'a-ar', 'a-rf', 'd-refit'], run: true },
    { rect: [960, 470, 720, 420], on: ['feedback', 'parent'], arrows: ['a-parent'] },
    { rect: [340, 10, 1340, 840], on: ['parent', 'realsim', 'agent'], arrows: ['a-realsim', 'd-matched'] },
    { rect: [10, 880, 1670, 240], on: ['artic', 'robot'], arrows: ['d-artic'] },
    { rect: [0, 0, BW, BH], on: 'all', arrows: 'all' },
    { rect: [0, 0, BW, BH], on: 'all', arrows: 'all', finale: true },
  ];
  let current = -1, view = { x: 0, y: 0, s: 1 }, tween = null;

  function fit(rect) {
    const cw = stage.clientWidth, ch = stage.clientHeight, pad = 28;
    const [x, y, w, h] = rect;
    const base = Math.min(cw / BW, ch / BH);
    const s = Math.min(cw / (w + pad * 2), ch / (h + pad * 2), base * 2.6);
    return { x: cw / 2 - (x + w / 2) * s, y: ch / 2 - (y + h / 2) * s, s };
  }
  const apply = v => { board.style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.s})`; };
  function frameTo(rect, instant) {
    const target = fit(rect);
    tween?.kill();
    if (instant || NW.reduced.matches || !window.gsap) { view = target; apply(view); return; }
    tween = gsap.to(view, { ...target, duration: .95, ease: 'power3.inOut', onUpdate: () => apply(view) });
  }
  function setStep(i, instant) {
    if (i === current && !instant) return;
    current = i;
    const st = STEPS[i];
    steps.forEach((s, k) => s.classList.toggle('on', k === i));
    board.classList.toggle('all', st.on === 'all');
    board.classList.toggle('run', !!st.run);
    board.querySelectorAll('[data-block]').forEach(b => b.classList.toggle('on', st.on === 'all' || st.on.includes(b.dataset.block)));
    board.querySelectorAll('[data-arrow]').forEach(a => a.classList.toggle('on', st.arrows === 'all' || (st.arrows || []).includes(a.dataset.arrow)));
    root.classList.toggle('show-finale', !!st.finale);
    counter.textContent = `${String(i + 1).padStart(2, '0')} / ${String(STEPS.length).padStart(2, '0')}`;
    if (st.finale) Finale.load();
    frameTo(st.rect, instant);
  }
  new ResizeObserver(() => { if (current >= 0) frameTo(STEPS[current].rect, true); }).observe(stage);
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) setStep(+e.target.dataset.step); }), { rootMargin: '-45% 0px -50% 0px' });
  steps.forEach(s => io.observe(s));
  setStep(0);

  /* Finale: 100 frames of the real example in 10 sheets; each frame stacks scan (298 px), twin and real (186 px each). */
  const Finale = (() => {
    const canvas = finale.querySelector('canvas'), ctx = canvas.getContext('2d');
    const playBtn = finale.querySelector('.mfinale-play');
    const FW = 398, BANDS = [298, 186, 186], FH = 670, PER = 10, SHEETS = 10, N = PER * SHEETS;
    const LABELS = ['1 · Scan the real desk', '2 · Rehearse in the twin', '3 · Act in the real world'];
    const sheets = []; let started = false, frame = 0, playing = null;
    function load() {
      if (started) return; started = true;
      for (let k = 0; k < SHEETS; k++) {
        const img = new Image(); img.decoding = 'async';
        img.onload = () => { if (Math.floor(frame / PER) === k) draw(); };
        img.src = `media/method/twin-${String(k).padStart(2, '0')}.webp`; sheets[k] = img;
      }
    }
    // Match the canvas to its on-screen size every time it draws, so it is never stretched or left at 300x150.
    function fitCanvas() {
      const dpr = Math.min(devicePixelRatio, 2), w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
      if (w && h && (canvas.width !== w || canvas.height !== h)) { canvas.width = w; canvas.height = h; }
    }
    function size() { draw(); }
    function draw() {
      fitCanvas();
      const W = canvas.width, H = canvas.height; if (!W || !H) return;
      ctx.fillStyle = '#0c0e0b'; ctx.fillRect(0, 0, W, H);
      // Nearest loaded frame, so scrubbing never shows an empty panel.
      let f = frame, img = sheets[Math.floor(f / PER)];
      for (let d = 1; (!img || !img.complete || !img.naturalWidth) && d < N; d++) {
        const g = [f - d, f + d].find(x => x >= 0 && x < N && sheets[Math.floor(x / PER)]?.naturalWidth);
        if (g !== undefined) { f = g; img = sheets[Math.floor(g / PER)]; }
      }
      if (!img?.naturalWidth) return;
      const oy = (f % PER) * FH, gap = 10 * (W / canvas.clientWidth);
      // Layout: scan on the left, twin over real on the right, both columns the same height Hs.
      const aL = FW / BANDS[0], aR = FW / BANDS[1];            // width per unit height
      let Hs = (W - gap + gap * aR / 2) / (aL + aR / 2);         // fits the width
      Hs = Math.min(Hs, H * .96);                                // and the height
      const lw = Hs * aL, ph = (Hs - gap) / 2, rw = ph * aR;
      const x0 = (W - (lw + gap + rw)) / 2, y0 = (H - Hs) / 2, xr = x0 + lw + gap;
      const rects = [[x0, y0, lw, Hs], [xr, y0, rw, ph], [xr, y0 + ph + gap, rw, ph]];
      let sy = oy;
      rects.forEach((r, k) => {
        ctx.drawImage(img, 0, sy, FW, BANDS[k], r[0], r[1], r[2], r[3]); sy += BANDS[k];
        const fs = 11 * (W / canvas.clientWidth);
        ctx.font = `600 ${fs}px "JetBrains Mono", Consolas, monospace`;
        const tw = ctx.measureText(LABELS[k]).width;
        ctx.fillStyle = 'rgba(12,14,11,.78)'; ctx.fillRect(r[0] + fs * .6, r[1] + fs * .6, tw + fs * 1.2, fs * 2);
        ctx.fillStyle = k === 1 ? '#b8f34a' : '#e9ece3'; ctx.textBaseline = 'middle'; ctx.fillText(LABELS[k], r[0] + fs * 1.2, r[1] + fs * 1.6);
      });
    }
    function setFrame(f) { const n = Math.max(0, Math.min(N - 1, Math.round(f))); if (n !== frame) { frame = n; draw(); } }
    playBtn.addEventListener('click', () => {
      if (playing) { clearInterval(playing); playing = null; playBtn.textContent = 'Play at real speed'; return; }
      playBtn.textContent = 'Pause';
      playing = setInterval(() => { frame = (frame + 1) % N; draw(); }, 100);
    });
    new ResizeObserver(size).observe(canvas);
    return { load, setFrame, stop() { if (playing) playBtn.click(); } };
  })();

  // While the last step is in view, the scroll position chooses the frame.
  const last = steps[steps.length - 1];
  let ticking = false;
  addEventListener('scroll', () => {
    if (ticking || current !== STEPS.length - 1) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      const r = last.getBoundingClientRect(), vh = innerHeight;
      const p = (vh * .55 - r.top) / Math.max(r.height - vh * .45, 1);
      Finale.stop(); Finale.setFrame(p * 99);
    });
  }, { passive: true });
  (NW.debug = NW.debug || {}).method = { setStep, setFrame: f => Finale.setFrame(f) }; // for browser checks
})();
