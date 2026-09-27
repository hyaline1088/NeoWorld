/* Capture | reconstruction | code. The source video holds capture and reconstruction side by side under a
   thin label bar; one canvas draws the capture half, the reconstruction half from the first divider, and from
   the second divider the reconstruction, slightly darkened, with each object's code pinned above it.
   Object positions come from data/scene-01-tracks.json (optical-flow tracks through the video). */
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
  const SHOWN = ['microwave', 'stool_left', 'stool_right', 'floor_cabinet', 'coffee_machine'];
  let split = [.34, .68], source = poster, loaded = false, visible = false;

  /* Labels: the object's name line and its two largest parts, written as code from the construction record. */
  let tracks = null, labels = new Map();
  const KEY = ['radius', 'depth', 'thickness', 'length', 'dimensions', 'bevel'];
  const short = v => Array.isArray(v) ? `(${v.map(short).join(', ')})` : typeof v === 'number' ? String(Math.round(v * 1e4) / 1e4) : `"${v}"`;
  const clip = (s, n) => s.length > n ? s.slice(0, n - 1) + '…' : s;
  const volume = p => (p.size || [0, 0, 0]).reduce((a, b) => a * b, 1);
  // The floor cabinet's label sits on the tap, so it shows the tap's parts.
  const FOCUS = { floor_cabinet: /mixer|spout|aerator/ };
  function labelFor(e, id) {
    const name = NW.pretty(e.id).replace(/\s+/g, '_').toLowerCase();
    const pool = FOCUS[id] ? e.parts.filter(p => FOCUS[id].test(p.part)) : e.parts;
    const parts = [...pool].sort((a, b) => (!!b.op - !!a.op) || volume(b) - volume(a)).slice(0, 1);
    const lines = [
      { text: clip(`${name} = scene.object(`, 38), kind: 'head' },
      ...parts.map(p => ({ kind: 'op', text: clip(p.op
        ? `  .${p.op}("${p.part}"${(k => k ? `, ${k}=${short(p.params[k])}` : '')(KEY.find(k => k in p.params))})`
        : `  .mesh("${p.part}")`, 38) })),
    ];
    // Example physical properties (demonstration values) for the material of the part shown.
    const g = parts[0]?.physics;
    if (g) lines.push({ kind: 'phys', text: clip(`  .physics("${g.short}", ρ=${g.density}, μ=${g.friction})`, 38) });
    return lines;
  }
  Promise.all([NW.sceneRecord(), fetch('data/scene-01-tracks.json').then(r => r.json())]).then(([rec, tr]) => {
    const byNode = new Map(rec.entities.map(e => [e.node, e]));
    tracks = tr;
    for (const o of tr.objects) if (SHOWN.includes(o.id) && byNode.has(o.entity)) labels.set(o.id, labelFor(byNode.get(o.entity), o.id));
    draw();
  }).catch(() => {});

  /* Where an object's anchor is at the current video time (normalized to the reconstruction half). */
  function anchorAt(o) {
    const t = source === video ? video.currentTime : 0;
    const k = Math.min(t * tracks.fps / tracks.step, o.anchor.length - 1), i = Math.floor(k), w = k - i;
    const a = o.anchor[i], b = o.anchor[Math.min(i + 1, o.anchor.length - 1)];
    if (!a) return null;
    return b ? [a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w] : a;
  }

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
    if (b < W) region(b, W, () => { half(1); drawCode(f, b, W, H); });
  }
  function drawCode(f, b, W, H) {
    const dpr = W / Math.max(box.clientWidth, 1), mono = '"JetBrains Mono", Consolas, monospace';
    // The reconstruction stays visible: about 75% of its brightness, with a faint green cast.
    ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = 'rgb(222,242,212)'; ctx.fillRect(b, 0, W - b, H);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(2,7,2,.17)'; ctx.fillRect(b, 0, W - b, H);
    if (tracks) {
      const fs = 9.5 * dpr, lh = fs * 1.45, pad = 6 * dpr, lead = 14 * dpr;
      ctx.font = `${fs}px ${mono}`; ctx.textBaseline = 'top';
      const placed = [];
      const hits = (x, y, w, h) => placed.some(q => x < q.x + q.w + 4 * dpr && q.x < x + w + 4 * dpr && y < q.y + q.h + 4 * dpr && q.y < y + h + 4 * dpr);
      for (const o of tracks.objects) {
        const lines = labels.get(o.id), p = lines && anchorAt(o);
        if (!p) continue;
        const ax = f.dx + p[0] * f.dw, ay = f.dy + p[1] * f.dh;
        if (ax < -20 * dpr || ax > W + 20 * dpr || ay < -20 * dpr || ay > H + 20 * dpr) continue;
        const bw = Math.max(...lines.map(l => ctx.measureText(l.text).width)) + pad * 2, bh = lines.length * lh + pad * 2 - (lh - fs);
        // Box above the object; below it when there is no room above (for example the wall cabinet).
        const above = ay - lead - bh > 4 * dpr;
        let by = above ? ay - lead - bh : ay + lead;
        const bx = Math.min(Math.max(ax - bw / 2, 4 * dpr), W - bw - 4 * dpr);
        // If it would cover another label, move it further away from its object until it is clear.
        for (let n = 0; n < 12 && hits(bx, by, bw, bh); n++) by += above ? -(bh * .5) : bh * .5;
        placed.push({ x: bx, y: by, w: bw, h: bh });
        ctx.strokeStyle = 'rgba(184,243,74,.9)'; ctx.lineWidth = 1.2 * dpr;
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax, above ? by + bh : by); ctx.stroke();
        ctx.fillStyle = '#b8f34a'; ctx.beginPath(); ctx.arc(ax, ay, 3 * dpr, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(6,12,4,.8)'; ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(bx, by, bw, bh, 4 * dpr); else ctx.rect(bx, by, bw, bh);
        ctx.fill(); ctx.stroke();
        lines.forEach((l, i) => { ctx.fillStyle = l.kind === 'head' ? '#b8f34a' : l.kind === 'phys' ? '#8fd3ff' : '#e6f5d8'; ctx.fillText(l.text, bx + pad, by + pad + i * lh); });
      }
    }
    // A soft glow along the divider, where the surface peels back.
    const g = ctx.createLinearGradient(b, 0, b + 22 * dpr, 0);
    g.addColorStop(0, 'rgba(184,243,74,.16)'); g.addColorStop(1, 'rgba(184,243,74,0)');
    ctx.fillStyle = g; ctx.fillRect(b, 0, 22 * dpr, H);
  }
  // Labels follow their objects while the video plays; a paused frame is redrawn only when something changes.
  function loop() {
    requestAnimationFrame(loop);
    if (visible && !video.paused) draw();
  }
  function start() {
    if (loaded) return; loaded = true;
    video.src = `${NW.ASSETS}studio/videos/scene-01.mp4`;
    video.addEventListener('loadeddata', () => { source = video; draw(); }, { once: true });
    video.addEventListener('seeked', draw);
    if (!NW.reduced.matches) video.play().then(() => { play.textContent = 'Pause'; }).catch(() => {});
    requestAnimationFrame(loop);
  }
  poster.onload = size;
  if (poster.complete) size(); // the poster may already be loaded from cache
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
  // Each layer name sits at the start of its layer and hides when the layer is too narrow for it.
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
  (NW.debug = NW.debug || {}).compare = { video, draw, setSplit }; // for browser checks
})();
