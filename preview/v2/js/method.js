/* The method, told by scrolling. A rebuilt copy of the method figure stays pinned while the steps scroll past;
   each step zooms the figure to its blocks and lights them up. */
(() => {
  const root = document.querySelector('#method');
  if (!root) return;
  const stage = root.querySelector('.mstage');
  const board = root.querySelector('.mboard');
  const steps = [...root.querySelectorAll('.mstep')];
  const counter = root.querySelector('.mstage-count');
  const BW = 1690, BH = 1127;
  // Per step: the part of the figure to frame, the blocks and arrows to light up.
  const STEPS = [
    { rect: [10, 110, 300, 310], on: ['obs'] },
    { rect: [10, 110, 1310, 320], on: ['agent', 'mcp'], arrows: ['a-obs'] },
    { rect: [10, 430, 1300, 470], on: ['handoff', 'author', 'refine', 'feedback', 'spec'], arrows: ['a-handoff', 'a-spec', 'a-ar', 'a-rf', 'd-refit'], run: true },
    { rect: [960, 470, 720, 420], on: ['feedback', 'parent'], arrows: ['a-parent'] },
    { rect: [340, 10, 1340, 840], on: ['parent', 'realsim', 'agent'], arrows: ['a-realsim', 'd-matched'] },
    { rect: [10, 880, 1670, 240], on: ['artic', 'robot'], arrows: ['d-artic'] },
    { rect: [0, 0, BW, BH], on: 'all', arrows: 'all' },
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
    counter.textContent = `${String(i + 1).padStart(2, '0')} / ${String(STEPS.length).padStart(2, '0')}`;
    frameTo(st.rect, instant);
  }
  new ResizeObserver(() => { if (current >= 0) frameTo(STEPS[current].rect, true); }).observe(stage);
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) setStep(+e.target.dataset.step); }), { rootMargin: '-45% 0px -50% 0px' });
  steps.forEach(s => io.observe(s));
  setStep(0, true);
  (NW.debug = NW.debug || {}).method = { setStep }; // for browser checks
})();
