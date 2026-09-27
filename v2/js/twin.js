/* Real example player: scan the desk -> rehearse in the twin -> act in the real world.
   100 frames in 10 sheets (media/method/twin-NN.webp); each frame stacks scan (298 px), twin and real (186 px).
   Plays in a loop while visible (not with reduced motion); the slider scrubs. */
(() => {
  const root = document.querySelector('#twin');
  if (!root) return;
  const canvas = root.querySelector('canvas'), ctx = canvas.getContext('2d');
  const playBtn = root.querySelector('.twin-play'), range = root.querySelector('.twin-range');
  const FW = 398, BANDS = [298, 186, 186], FH = 670, PER = 10, SHEETS = 10, N = PER * SHEETS;
  const LABELS = ['1 · Scan the real desk', '2 · Rehearse in the twin', '3 · Act in the real world'];
  const sheets = []; let frame = 0, timer = null, visible = false, userPaused = false;
  const loaded = k => sheets[k]?.complete && sheets[k].naturalWidth;
  function load() {
    if (sheets.length) return;
    for (let k = 0; k < SHEETS; k++) {
      const img = new Image(); img.decoding = 'async';
      img.onload = () => { if (Math.floor(frame / PER) === k) draw(); };
      img.src = `media/method/twin-${String(k).padStart(2, '0')}.webp`; sheets[k] = img;
    }
  }
  function fitCanvas() {
    const dpr = Math.min(devicePixelRatio, 2), w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
    if (w && h && (canvas.width !== w || canvas.height !== h)) { canvas.width = w; canvas.height = h; }
  }
  function draw() {
    fitCanvas();
    const W = canvas.width, H = canvas.height; if (!W || !H) return;
    ctx.fillStyle = '#0c0e0b'; ctx.fillRect(0, 0, W, H);
    let f = frame;
    if (!loaded(Math.floor(f / PER))) { // nearest loaded frame, so the panels never go blank
      for (let d = 1; d < N; d++) { const g = [f - d, f + d].find(x => x >= 0 && x < N && loaded(Math.floor(x / PER))); if (g !== undefined) { f = g; break; } }
    }
    const img = sheets[Math.floor(f / PER)]; if (!loaded(Math.floor(f / PER))) return;
    const k = W / Math.max(canvas.clientWidth, 1), gap = 10 * k;
    // Scan on the left, twin over real on the right, both columns the same height.
    const aL = FW / BANDS[0], aR = FW / BANDS[1];
    let Hs = (W - gap + gap * aR / 2) / (aL + aR / 2); Hs = Math.min(Hs, H * .96);
    const lw = Hs * aL, ph = (Hs - gap) / 2, rw = ph * aR, x0 = (W - (lw + gap + rw)) / 2, y0 = (H - Hs) / 2, xr = x0 + lw + gap;
    const rects = [[x0, y0, lw, Hs], [xr, y0, rw, ph], [xr, y0 + ph + gap, rw, ph]];
    let sy = (f % PER) * FH;
    rects.forEach((r, i) => {
      ctx.drawImage(img, 0, sy, FW, BANDS[i], r[0], r[1], r[2], r[3]); sy += BANDS[i];
      const fs = 11 * k; ctx.font = `600 ${fs}px "JetBrains Mono", Consolas, monospace`;
      const tw = ctx.measureText(LABELS[i]).width;
      ctx.fillStyle = 'rgba(12,14,11,.8)'; ctx.fillRect(r[0] + fs * .6, r[1] + fs * .6, tw + fs * 1.2, fs * 2);
      ctx.fillStyle = i === 1 ? '#b8f34a' : '#e9ece3'; ctx.textBaseline = 'middle'; ctx.fillText(LABELS[i], r[0] + fs * 1.2, r[1] + fs * 1.6);
    });
  }
  function setFrame(f) { frame = (Math.round(f) % N + N) % N; range.value = frame; draw(); }
  function play(on) {
    clearInterval(timer); timer = null;
    if (on) timer = setInterval(() => setFrame(frame + 1), 100); // the recording's own pace
    playBtn.textContent = on ? 'Pause' : 'Play'; playBtn.setAttribute('aria-pressed', String(on));
  }
  playBtn.addEventListener('click', () => { userPaused = !!timer; play(!timer); });
  range.addEventListener('input', () => { userPaused = true; play(false); setFrame(+range.value); });
  new IntersectionObserver(es => {
    visible = es[0].isIntersecting;
    if (visible) { load(); draw(); if (!userPaused && !NW.reduced.matches) play(true); } else play(false);
  }, { rootMargin: '200px 0px', threshold: 0 }).observe(root);
  new ResizeObserver(draw).observe(canvas);
  (NW.debug = NW.debug || {}).twin = { setFrame, load }; // for browser checks
})();
