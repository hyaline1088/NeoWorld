/* Page behaviour: theme, reading progress, contents, scroll story, charts, and small explainers. */
(() => {
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];

  /* Theme switch (remembered per visitor). */
  const themeBtn = $('#theme-toggle');
  const setTheme = t => {
    document.documentElement.dataset.theme = t;
    themeBtn.setAttribute('aria-label', t === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
    themeBtn.querySelector('span').textContent = t === 'dark' ? 'Light' : 'Dark';
    document.querySelector('meta[name="theme-color"]').content = NW.css('--bg');
    try { localStorage.setItem('nw-theme', t); } catch (_) {}
    document.dispatchEvent(new Event('nw-theme'));
  };
  themeBtn.addEventListener('click', () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
  setTheme(document.documentElement.dataset.theme || 'dark');

  /* Contents: highlight the chapter being read. */
  const toc = $$('.toc a');
  const chapters = toc.map(a => $(a.getAttribute('href'))).filter(Boolean);
  const progress = $('.progress i');
  function onScroll() {
    const y = innerHeight * .4; let active = null;
    for (const c of chapters) if (c.getBoundingClientRect().top < y) active = c;
    toc.forEach(a => (a.getAttribute('href') === `#${active?.id}` ? a.setAttribute('aria-current', 'true') : a.removeAttribute('aria-current')));
    const doc = document.documentElement, max = doc.scrollHeight - innerHeight;
    progress.style.transform = `scaleX(${max > 0 ? scrollY / max : 0})`;
    $('.toc').classList.toggle('shown', scrollY > innerHeight * .8);
  }
  addEventListener('scroll', onScroll, { passive: true }); onScroll();

  /* The real-to-sim-to-real loop: steps scroll past a sticky diagram. */
  const steps = $$('.loop-step'), nodes = $$('.loop-node'), arcs = $$('.loop-arc');
  const activate = i => {
    steps.forEach((s, k) => s.classList.toggle('on', k === i));
    nodes.forEach((n, k) => n.classList.toggle('on', k === i));
    arcs.forEach((a, k) => a.classList.toggle('on', k < i));
  };
  const loopIO = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) activate(+e.target.dataset.step); }), { rootMargin: '-45% 0px -45% 0px' });
  steps.forEach(s => loopIO.observe(s)); activate(0);

  /* Evidence strip. The data lives in the page (#evidence-data) so the public build can drop it. */
  const strip = $('#evidence-grid'), dataEl = $('#evidence-data');
  if (strip && dataEl) JSON.parse(dataEl.textContent).forEach(c => {
    const max = Math.max(...c.rows.map(r => r[1])) * 1.06;
    const el = document.createElement('figure'); el.className = 'mini';
    el.innerHTML = `<figcaption><b>${c.t}</b><span>${c.s}</span></figcaption>${c.rows.map(([n, v]) => {
      const txt = v.toFixed(c.d) + (c.pct ? '%' : ''), ours = n === 'NeoWorld-3';
      return `<div class="bar${ours ? ' ours' : ''}" title="${n}: ${txt}"><span>${n}</span><span class="track"><span class="fill" style="--w:${(v / max * 100).toFixed(1)}%"></span></span><span class="val">${txt}</span></div>`;
    }).join('')}`;
    strip.append(el);
  });

  /* Ablation switch: full system vs. without the articulation physics check. Values live in the page. */
  const physics = $('#physics');
  const ab = physics && Object.fromEntries(['on', 'off'].map(k => { const [pen, stab] = physics.dataset[k].split(',').map(Number); return [k, { pen, stab }]; }));
  $$('[data-physics]').forEach(b => b.addEventListener('click', () => {
    const on = b.dataset.physics === 'on', d = on ? ab.on : ab.off;
    $$('[data-physics]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    $('#pen-fill').style.setProperty('--w', `${d.pen}%`); $('#pen-val').textContent = `${Math.round(d.pen)}%`;
    $('#stab-fill').style.setProperty('--w', `${d.stab}%`); $('#stab-val').textContent = `${d.stab}%`;
    $('#physics-note').innerHTML = on
      ? '<b>Full system.</b> A third of articulated objects still have intersecting parts, and three in four stay standing.'
      : '<b>Check switched off.</b> Every articulated object has parts inside each other, and none stays standing. The scene still looks right in a render.';
    $('#physics').classList.toggle('broken', !on);
  }));

  /* Rehearsal rule: a plan is kept only if at least 4 of 5 perturbed rehearsals succeed. */
  const trials = $$('#rehearsal .trial');
  const verdict = () => {
    const ok = trials.filter(t => t.getAttribute('aria-pressed') === 'true').length;
    $('#rehearsal-verdict').innerHTML = ok >= 4
      ? `<b>${ok} of 5 passed → plan kept.</b> It is replayed once on the target, open-loop.`
      : `<b>${ok} of 5 passed → plan rejected.</b> The planner tries the next grasp candidate.`;
    $('#rehearsal').dataset.ok = String(ok >= 4);
  };
  trials.forEach(t => t.addEventListener('click', () => { t.setAttribute('aria-pressed', String(t.getAttribute('aria-pressed') !== 'true')); verdict(); }));
  if (trials.length) verdict();

  /* GSAP: scroll-linked hero and light entrances. The page is complete without it. */
  const { gsap, ScrollTrigger } = window;
  if (!gsap || !ScrollTrigger) return;
  gsap.registerPlugin(ScrollTrigger);
  // Fonts, lazy 3D stages and images change the page height after load; re-measure trigger positions.
  let refreshTimer;
  new ResizeObserver(() => { clearTimeout(refreshTimer); refreshTimer = setTimeout(() => ScrollTrigger.refresh(), 200); }).observe(document.body);
  document.fonts?.ready.then(() => ScrollTrigger.refresh());
  const mm = gsap.matchMedia();
  mm.add('(prefers-reduced-motion: no-preference)', () => {
    ScrollTrigger.create({ trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true, onUpdate: s => NW.heroScroll?.(s.progress) });
    gsap.to('.hero-copy', { yPercent: -14, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true } });
    // Entrances start from a visible state, so the page is complete even if animation never runs.
    $$('.chapter-head').forEach(h => gsap.from(h.children, { y: 22, duration: .8, stagger: .07, ease: 'power3.out', scrollTrigger: { trigger: h, start: 'top 88%', once: true } }));
    $$('.plate').forEach(p => gsap.from(p, { y: 28, duration: .9, ease: 'power2.out', scrollTrigger: { trigger: p, start: 'top 92%', once: true } }));
    $$('.mini .fill').forEach((f, i) => gsap.from(f, { scaleX: 0, transformOrigin: '0 50%', duration: .9, delay: (i % 4) * .06, ease: 'power3.out', scrollTrigger: { trigger: f.closest('.mini'), start: 'top 88%', once: true } }));
  });
})();
