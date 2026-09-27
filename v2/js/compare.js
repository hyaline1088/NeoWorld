/* Capture | reconstruction | code. The source video holds capture and reconstruction side by side under a
   thin label bar; one canvas draws the capture half, the reconstruction half from the first divider, and from
   the second divider the reconstruction dimmed under the scene's real construction record. */
(() => {
  const box = document.querySelector('#compare');
  if (!box) return;
  const canvas = box.querySelector('canvas'), ctx = canvas.getContext('2d');
  const handles = [...box.querySelectorAll('.xray-handle')];
  const tags = [...box.querySelectorAll('.wipe-tag')];
  const play = document.querySelector('#compare-play');
  const video = document.createElement('video');
  Object.assign(video, { muted: true, loop: true, playsInline: true, preload: 'none', crossOrigin: 'anonymous' });
  video.setAttribute('aria-hidden', 'true');
  video.style.cssText = 'position:absolute;width:1px;height:1px;opacity:0;pointer-events:none';
  box.append(video);
  const poster = new Image(); poster.src = `${NW.ASSETS}studio/posters/scene-01.jpg`;
  const BAR = 32 / 1472; // label bar height as a fraction of the frame
  const MIN_GAP = .06;
  let split = [.34, .68], source = poster, loaded = false, visible = false, codeLines = [], scroll = 0, last = 0;

  // The code layer: every object's construction record, objects with recorded operations first.
  NW.sceneRecord().then(rec => {
    codeLines = rec.entities.filter(e => e.node !== 'Background').flatMap(e => [...NW.entityLines(e), { kind: 'blank', text: '' }]);
    draw();
  }).catch(() => {});

  function size() {
    const w = box.clientWidth, dpr = Math.min(devicePixelRatio, 2);
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(w * 1.25 * dpr);
    canvas.style.height = `${canvas.height / dpr}px`; layoutTags(); draw();
  }
  function frameRect() {
    const sw = (source.videoWidth || source.naturalWidth) / 2, sh = source.videoHeight || source.naturalHeight;
    if (!sw || !sh) return null;
    const top = sh * BAR, h = sh - top, W = canvas.width, H = canvas.height;
    const scale = Math.max(W / sw, H / h), dw = sw * scale, dh = h * scale;
    return { sw, top, h, dx: (W - dw) / 2, dy: (H - dh) / 2, dw, dh };
  }
  function region(x0, x1, paint) {
    ctx.save(); ctx.beginPath(); ctx.rect(x0, 0, x1 - x0, canvas.height); ctx.clip(); paint(); ctx.restore();
  }
  function draw() {
    const f = frameRect(); if (!f) return;
    const W = canvas.width, H = canvas.height, a = Math.round(W * split[0]), b = Math.round(W * split[1]);
    const half = side => ctx.drawImage(source, side * f.sw, f.top, f.sw, f.h, f.dx, f.dy, f.dw, f.dh);
    region(0, a, () => half(0));
    region(a, b, () => half(1));
    region(b, W, () => {
      half(1);
      ctx.fillStyle = 'rgba(10,12,9,.88)'; ctx.fillRect(b, 0, W - b, H);
      const dpr = W / box.clientWidth, fs = 11 * dpr, lh = fs * 1.6;
      ctx.font = `${fs}px "JetBrains Mono", Consolas, monospace`; ctx.textBaseline = 'top';
      if (!codeLines.length) { ctx.fillStyle = '#9aa190'; ctx.fillText('loading construction record…', b + 12 * dpr, 44 * dpr); return; }
      const total = codeLines.length * lh, start = -(scroll * dpr % total);
      for (let y = start, i = 0; y < H; y += lh, i++) {
        if (y < -lh) continue;
        const line = codeLines[i % codeLines.length];
        ctx.fillStyle = line.kind === 'op' ? '#b8f34a' : line.kind === 'code' ? '#e9ece3' : line.kind === 'mesh' ? '#c9cfbe' : '#7f8776';
        ctx.fillText(line.text, b + 12 * dpr, y + 40 * dpr);
      }
    });
  }
  function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min((now - last) / 1000, .1); last = now;
    if (!visible || video.paused) return;
    if (!NW.reduced.matches) scroll += dt * 16; // code drifts upward while the scene plays
    draw();
  }
  function start() {
    if (loaded) return; loaded = true;
    video.src = `${NW.ASSETS}studio/videos/scene-01.mp4`;
    video.addEventListener('loadeddata', () => { source = video; draw(); }, { once: true });
    if (!NW.reduced.matches) video.play().then(() => { play.textContent = 'Pause'; }).catch(() => {});
    requestAnimationFrame(loop);
  }
  poster.onload = size;
  new ResizeObserver(size).observe(box);
  new IntersectionObserver(e => {
    visible = e[0].isIntersecting;
    if (visible) start(); else if (!video.paused) video.pause();
    if (visible && loaded && play.textContent === 'Pause') video.play().catch(() => {});
  }, { threshold: .15 }).observe(box);
  play.addEventListener('click', () => {
    start();
    if (video.paused) { video.play().catch(() => {}); play.textContent = 'Pause'; }
    else { video.pause(); play.textContent = 'Play'; }
  });

  // Two dividers that cannot cross.
  function setSplit(i, s) {
    split[i] = i === 0 ? Math.min(Math.max(s, .02), split[1] - MIN_GAP) : Math.max(Math.min(s, .98), split[0] + MIN_GAP);
    handles.forEach((h, k) => { h.style.left = `${split[k] * 100}%`; h.setAttribute('aria-valuenow', Math.round(split[k] * 100)); });
    layoutTags(); draw();
  }
  // Each label sits at the start of its layer and hides when the layer is too narrow for it.
  function layoutTags() {
    const edges = [0, ...split, 1];
    tags.forEach((t, k) => {
      t.style.left = `calc(${edges[k] * 100}% + 12px)`;
      t.hidden = false;
      t.hidden = box.clientWidth > 0 && (edges[k + 1] - edges[k]) * box.clientWidth < t.offsetWidth + 24;
    });
  }
  let dragging = -1;
  const at = e => { const r = box.getBoundingClientRect(); return (e.clientX - r.left) / r.width; };
  box.addEventListener('pointerdown', e => {
    const s = at(e); dragging = Math.abs(s - split[0]) <= Math.abs(s - split[1]) ? 0 : 1;
    box.setPointerCapture(e.pointerId); setSplit(dragging, s);
  });
  box.addEventListener('pointermove', e => { if (dragging >= 0) setSplit(dragging, at(e)); });
  box.addEventListener('pointerup', () => { dragging = -1; });
  handles.forEach((h, i) => h.addEventListener('keydown', e => {
    const d = e.key === 'ArrowLeft' ? -.05 : e.key === 'ArrowRight' ? .05 : 0;
    if (d) { e.preventDefault(); setSplit(i, split[i] + d); }
  }));
  document.fonts?.ready.then(() => { setSplit(0, split[0]); setSplit(1, split[1]); });
  setSplit(0, split[0]); setSplit(1, split[1]);
})();
