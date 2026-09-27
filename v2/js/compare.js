/* Capture vs reconstruction wipe. The source video holds both views side by side under a thin label bar;
   one canvas draws the left half, then the right half clipped at the divider. */
(() => {
  const box = document.querySelector('#compare');
  if (!box) return;
  const canvas = box.querySelector('canvas'), ctx = canvas.getContext('2d');
  const handle = box.querySelector('.xray-handle');
  const play = document.querySelector('#compare-play');
  const video = document.createElement('video');
  Object.assign(video, { muted: true, loop: true, playsInline: true, preload: 'none', crossOrigin: 'anonymous' });
  video.setAttribute('aria-hidden', 'true');
  video.style.cssText = 'position:absolute;width:1px;height:1px;opacity:0;pointer-events:none';
  box.append(video);
  const poster = new Image(); poster.src = `${NW.ASSETS}studio/posters/scene-01.jpg`;
  const BAR = 32 / 1472; // label bar height as a fraction of the frame
  let split = .5, source = poster, loaded = false, visible = false, raf;
  function size() {
    const w = box.clientWidth, dpr = Math.min(devicePixelRatio, 2);
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(w * 1.25 * dpr);
    canvas.style.height = `${canvas.height / dpr}px`; draw();
  }
  function draw() {
    const sw = (source.videoWidth || source.naturalWidth) / 2, sh = source.videoHeight || source.naturalHeight;
    if (!sw || !sh) return;
    const top = sh * BAR, h = sh - top, W = canvas.width, H = canvas.height;
    // Cover-fit the half frame into the canvas.
    const scale = Math.max(W / sw, H / h), dw = sw * scale, dh = h * scale, dx = (W - dw) / 2, dy = (H - dh) / 2;
    ctx.drawImage(source, 0, top, sw, h, dx, dy, dw, dh);
    const x = Math.round(W * split);
    ctx.save(); ctx.beginPath(); ctx.rect(x, 0, W - x, H); ctx.clip();
    ctx.drawImage(source, sw, top, sw, h, dx, dy, dw, dh); ctx.restore();
  }
  function loop() {
    raf = requestAnimationFrame(loop);
    if (visible && !video.paused) draw();
  }
  function start() {
    if (loaded) return; loaded = true;
    video.src = `${NW.ASSETS}studio/videos/scene-01.mp4`;
    video.addEventListener('loadeddata', () => { source = video; draw(); }, { once: true });
    if (!NW.reduced.matches) video.play().then(() => { play.textContent = 'Pause'; }).catch(() => {});
    loop();
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
  const setSplit = s => { split = Math.min(.98, Math.max(.02, s)); handle.style.left = `${split * 100}%`; handle.setAttribute('aria-valuenow', Math.round(split * 100)); draw(); };
  let dragging = false;
  const fromEvent = e => { const r = box.getBoundingClientRect(); setSplit((e.clientX - r.left) / r.width); };
  box.addEventListener('pointerdown', e => { dragging = true; box.setPointerCapture(e.pointerId); fromEvent(e); });
  box.addEventListener('pointermove', e => { if (dragging) fromEvent(e); });
  box.addEventListener('pointerup', () => { dragging = false; });
  handle.addEventListener('keydown', e => {
    const d = e.key === 'ArrowLeft' ? -.05 : e.key === 'ArrowRight' ? .05 : 0;
    if (d) { e.preventDefault(); setSplit(split + d); }
  });
  setSplit(.5);
})();
