/* Capture | reconstruction | code. The source video holds capture and reconstruction side by side under a
   thin label bar; one canvas draws the capture half, the reconstruction half from the first divider, and from
   the second divider the reconstruction, slightly darkened, with the scene's real code floating over it. */
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
  let split = [.34, .68], source = poster, loaded = false, visible = false, last = 0;

  /* The code layer lies under the whole picture; the second divider only reveals it.
     Floating fragments are real lines from the scene's construction record, and the rain is built
     from characters of those same lines. */
  let fragLines = [], glyphs = '', frags = [], rain = [];
  const rand = (a, b) => a + Math.random() * (b - a);
  const pickLine = () => fragLines[Math.floor(Math.random() * fragLines.length)] || ['', ''];
  // Short two-line fragments: object and recorded operation, then the part and one real measurement.
  const KEY = ['radius', 'depth', 'thickness', 'length', 'dimensions', 'bevel'];
  const short = v => Array.isArray(v) ? `(${v.map(short).join(', ')})` : typeof v === 'number' ? String(Math.round(v * 1e5) / 1e5) : `"${v}"`;
  function fragmentsFrom(rec) {
    const out = [];
    for (const e of rec.entities) {
      if (e.node === 'Background') continue;
      const name = NW.pretty(e.id).replace(/\s+/g, '_').toLowerCase();
      out.push([`${name} =`, `  scene.object("${e.id}")`]);
      for (const p of e.parts) {
        if (!p.op) continue;
        const key = KEY.find(k => k in p.params);
        out.push([`${name}.${p.op}(`, `  "${p.part}"${key ? `, ${key}=${short(p.params[key])}` : ''})`]);
      }
    }
    return out.filter(([a, b]) => Math.max(a.length, b.length) <= 46);
  }
  function spawn(f, fresh) {
    f.text = pickLine(); f.depth = Math.random() ** 1.4; // most fragments sit far away, a few come close
    // Most new fragments appear where the code layer is showing; some anywhere, ready to be uncovered.
    // Lines start inside the layer and may run off the right edge, like text continuing out of frame.
    const inside = !fresh && Math.random() < .8;
    f.x = inside ? rand(split[1] + .015, Math.max(split[1] + .03, .8)) : rand(-.05, .8);
    f.y = fresh ? rand(0, 1.05) : rand(1.02, 1.15);
    f.vy = rand(.018, .04) * (.55 + f.depth); f.vx = rand(-.004, .004);
    f.life = rand(7, 13); f.age = fresh ? rand(0, f.life * .8) : 0;
    return f;
  }
  function seedRain() {
    const dpr = canvas.width / Math.max(box.clientWidth, 1), col = 14 * dpr, H = canvas.height;
    rain = Array.from({ length: Math.ceil(canvas.width / col) }, (_, i) => ({
      x: i * col, y: rand(-H, H), speed: rand(60, 170) * dpr, len: Math.floor(rand(8, 22)),
      chars: Array.from({ length: 22 }, () => glyphs[Math.floor(Math.random() * glyphs.length)] || '0'),
    }));
  }
  NW.sceneRecord().then(rec => {
    fragLines = fragmentsFrom(rec);
    glyphs = fragLines.flat().join('').replace(/\s+/g, '');
    // Start with most fragments already inside the default code layer, a few elsewhere to be uncovered.
    frags = Array.from({ length: 15 }, (_, i) => { const f = spawn({}, true); if (i % 3) f.x = rand(split[1] + .015, .8); return f; });
    seedRain(); draw();
  }).catch(() => {});

  function size() {
    const w = box.clientWidth, dpr = Math.min(devicePixelRatio, 2);
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(w * 1.25 * dpr);
    canvas.style.height = `${canvas.height / dpr}px`; if (glyphs) seedRain(); layoutTags(); draw();
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
    if (b < W) region(b, W, () => { half(1); drawCode(b, W, H); });
  }
  function drawCode(b, W, H) {
    const dpr = W / Math.max(box.clientWidth, 1), mono = '"JetBrains Mono", Consolas, monospace';
    // The reconstruction stays visible: a slight darkening with a green cast.
    // About 75% of the original brightness, with a faint green cast.
    ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = 'rgb(222,242,212)'; ctx.fillRect(b, 0, W - b, H);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(2,7,2,.17)'; ctx.fillRect(b, 0, W - b, H);
    // Rain: faint falling columns of characters taken from the code.
    const lh = 14 * dpr; ctx.font = `${12 * dpr}px ${mono}`; ctx.textBaseline = 'top';
    for (const c of rain) {
      if (c.x < b - lh || c.x > W) continue;
      for (let k = 0; k < c.len; k++) {
        const y = c.y - k * lh; if (y < -lh || y > H) continue;
        ctx.fillStyle = `rgba(170,240,95,${((k === 0 ? .55 : .3) * (1 - k / c.len)).toFixed(3)})`;
        ctx.fillText(c.chars[k % c.chars.length], c.x + 2 * dpr, y);
      }
    }
    // Floating fragments: real lines of the construction record, drifting upward at different depths.
    for (const f of [...frags].sort((p, q) => p.depth - q.depth)) {
      const fs = (8 + f.depth * 3.5) * dpr, y = f.y * H;
      let x = f.x * W;
      const t = f.age / f.life, fade = Math.min(1, t / .18, (1 - t) / .25);
      const alpha = Math.max(0, fade) * (.35 + f.depth * .65);
      if (alpha <= .01 || x > W || y < -fs || y > H) continue;
      ctx.font = `${fs}px ${mono}`;
      const [head, tail] = f.text, lh2 = fs * 1.35;
      const wAll = Math.max(ctx.measureText(head).width, ctx.measureText(tail).width);
      // Fragments inside the layer stay within the picture; ones behind the reconstruction wait to be uncovered.
      if (x + wAll > W - 8 * dpr && x >= b) x = Math.max(b + 8 * dpr, W - wAll - 8 * dpr);
      if (x + wAll < b) continue;
      ctx.fillStyle = `rgba(4,10,3,${(.32 * alpha).toFixed(3)})`;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x - 6 * dpr, y - 4 * dpr, wAll + 12 * dpr, lh2 + fs + 8 * dpr, 3 * dpr);
      else ctx.rect(x - 6 * dpr, y - 4 * dpr, wAll + 12 * dpr, lh2 + fs + 8 * dpr);
      ctx.fill();
      ctx.shadowColor = 'rgba(184,243,74,.9)'; ctx.shadowBlur = (3 + 9 * f.depth) * dpr;
      ctx.fillStyle = `rgba(184,243,74,${alpha.toFixed(3)})`; ctx.fillText(head, x, y);
      ctx.fillStyle = `rgba(233,255,214,${(alpha * .92).toFixed(3)})`; ctx.fillText(tail, x, y + lh2);
      ctx.shadowBlur = 0;
    }
    // A soft glow along the divider, where the surface peels back.
    const g = ctx.createLinearGradient(b, 0, b + 22 * dpr, 0);
    g.addColorStop(0, 'rgba(184,243,74,.16)'); g.addColorStop(1, 'rgba(184,243,74,0)');
    ctx.fillStyle = g; ctx.fillRect(b, 0, 22 * dpr, H);
  }
  function step(dt) {
    for (const f of frags) {
      f.age += dt; f.y -= f.vy * dt; f.x += f.vx * dt;
      if (f.age > f.life || f.y < -.06) spawn(f, false);
    }
    const H = canvas.height;
    for (const c of rain) {
      c.y += c.speed * dt;
      if (c.y - c.len * 14 * (canvas.width / Math.max(box.clientWidth, 1)) > H) c.y = rand(-H * .6, 0);
      if (Math.random() < dt * 3) c.chars[Math.floor(Math.random() * c.chars.length)] = glyphs[Math.floor(Math.random() * glyphs.length)] || '0';
    }
  }
  // The code layer keeps moving even when the video is paused; everything stops for reduced motion.
  function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min((now - last) / 1000, .1); last = now;
    if (!visible || NW.reduced.matches) return;
    if (frags.length && split[1] < .995) step(dt);
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
