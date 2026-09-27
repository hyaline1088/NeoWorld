/* Object gallery: ten articulated reconstructions, each next to its source image. */
(() => {
  const T = THREE, host = document.querySelector('#gallery-stage');
  if (!host) return;
  const OBJECTS = [
    ['10449', 'Scissors', 'batch5_collision_references_image3/10449_image_3.png'],
    ['8994', 'Door', 'batch5_collision_references_image3/8994_image_3.png'],
    ['101917', 'Oven', 'batch5_collision_references_image3/101917_image_3.png'],
    ['101463', 'Spray bottle', 'batch5_collision_references_image3/101463_image_3.png'],
    ['103967', 'Globe', 'batch5_collision_references_image3/103967_image_3.png'],
    ['100520', 'Folding chair', 'reference_image_3_5ids/reference_image_3/100520.png'],
    ['100842', 'Suitcase', 'reference_image_3_5ids/reference_image_3/100842.png'],
    ['101052', 'Utility knife', 'reference_image_3_5ids/reference_image_3/101052.png'],
    ['101220', 'Industrial fan', 'reference_image_3_5ids/reference_image_3/101220.png'],
    ['101284', 'Safety glasses', 'reference_image_3_5ids/reference_image_3/101284.png'],
  ];
  const picker = document.querySelector('#gallery-picker');
  const ref = document.querySelector('#gallery-ref');
  const refCap = document.querySelector('#gallery-ref-cap');
  const joints = document.querySelector('#gallery-joints');
  const status = host.querySelector('.stage-status');
  const title = document.querySelector('#gallery-title');
  const playBtn = document.querySelector('#gallery-play');
  const looks = [...document.querySelectorAll('[data-gallery-look]')];
  const axesBtn = document.querySelector('#gallery-axes');
  OBJECTS.forEach(([id, name], i) => {
    const b = document.createElement('button'); b.type = 'button'; b.dataset.id = id;
    b.innerHTML = `<span>${String(i + 1).padStart(2, '0')}</span>${name}`; b.setAttribute('aria-pressed', String(i === 0));
    picker.append(b);
  });
  NW.whenNear(host, () => {
    const v = new NW.Viewer(host, { fov: 36 }); v.addLights();
    const cache = new Map(); let current = null, token = 0, look = 'skin', axes = false, playing = false, clock = 0;
    const grid = new T.GridHelper(1, 20, 0x3b4236, 0x262b23); grid.material.transparent = true; grid.material.opacity = .45; v.scene.add(grid);
    function applyLook() {
      if (!current) return; current.setLook(look);
      current.arrows.forEach(a => { a.visible = axes; }); v.dirty = true;
    }
    function rows() {
      joints.replaceChildren();
      if (!current.movable.length) { joints.textContent = 'No movable joints.'; return; }
      for (const j of current.movable) {
        const slide = j.type === 'prismatic', lo = slide ? j.lower : NW.deg(j.lower), hi = slide ? j.upper : NW.deg(j.upper);
        const row = document.createElement('label'); row.className = 'joint-row compact';
        row.innerHTML = `<span class="joint-name"><i style="background:${current.linkColor.get(j.child)}"></i>${j.name.replace(/_/g, ' ')}<small>${slide ? 'slide' : 'rotate'} · ${lo.toFixed(slide ? 3 : 0)}${slide ? '' : '°'} … ${hi.toFixed(slide ? 3 : 0)}${slide ? '' : '°'}</small></span>
          <input type="range" min="${lo}" max="${hi}" step="${slide ? (hi - lo) / 200 : .5}" value="${slide ? j.value : NW.deg(j.value)}">`;
        const input = row.querySelector('input');
        input.addEventListener('input', () => { setPlay(false); current.apply(j, slide ? +input.value : T.MathUtils.degToRad(+input.value)); v.dirty = true; });
        j.input = input; joints.append(row);
      }
    }
    function sync() { for (const j of current.movable) j.input.value = j.type === 'prismatic' ? j.value : NW.deg(j.value); }
    function setPlay(on) { playing = on && !!current?.movable.length; clock = 0; playBtn.textContent = playing ? 'Pause motion' : 'Play motion'; playBtn.setAttribute('aria-pressed', String(playing)); }
    v.ticks.add(dt => {
      if (!playing || !current) return false;
      clock += dt; let i = 0;
      for (const j of current.movable) { const w = (Math.sin(clock * 1.3 + i++ * .5) + 1) / 2; current.apply(j, j.lower + (j.upper - j.lower) * w); }
      sync(); return true;
    });
    async function load(id) {
      const my = ++token, entry = OBJECTS.find(o => o[0] === id);
      [...picker.children].forEach(b => b.setAttribute('aria-pressed', String(b.dataset.id === id)));
      title.textContent = `${entry[1]} · ${id}`;
      ref.src = NW.ASSETS + entry[2]; ref.alt = `${entry[1]}: source image`; refCap.textContent = `Source image · ${id}`;
      status.hidden = false; status.textContent = `Loading ${entry[1].toLowerCase()}…`; setPlay(false);
      try {
        if (!cache.has(id)) cache.set(id, NW.loadURDF(id, v.renderer).then(m => {
          m.arrows = m.movable.map(j => {
            const a = new T.ArrowHelper(j.axis, new T.Vector3(), m.radius * .4, NW.css('--accent'), m.radius * .07, m.radius * .045);
            a.line.material.depthTest = a.cone.material.depthTest = false; a.renderOrder = 9; j.origin.add(a); return a;
          });
          return m;
        }).catch(e => { cache.delete(id); throw e; }));
        const m = await cache.get(id); if (my !== token) return;
        if (current) v.scene.remove(current.object);
        current = m; v.scene.add(m.object);
        for (const j of m.joints.values()) m.apply(j, Math.max(j.lower, Math.min(j.upper, 0)));
        grid.scale.setScalar(m.radius * 4); grid.position.y = -m.size.y / 2 - m.radius * .01;
        const dir = id === '10449' ? new T.Vector3(.2, 1.8, 1.1) : new T.Vector3(1.1, .6, 1.6);
        v.onResize = () => v.frame(m.radius, dir, new T.Vector3(), 1.05); v.resize();
        rows(); applyLook(); status.hidden = true;
        document.querySelector('#gallery-summary').textContent = `${m.links.size} parts · ${m.movable.length} movable joint${m.movable.length === 1 ? '' : 's'}`;
        if (!NW.reduced.matches) setPlay(true);
      } catch (e) {
        if (my !== token) return; console.error(e); status.textContent = 'Could not load this object. Choose it again to retry.';
      }
    }
    picker.addEventListener('click', e => { const b = e.target.closest('button'); if (b) load(b.dataset.id); });
    looks.forEach(b => b.addEventListener('click', () => { look = b.dataset.galleryLook; looks.forEach(x => x.setAttribute('aria-pressed', String(x === b))); applyLook(); }));
    axesBtn.addEventListener('click', () => { axes = !axes; axesBtn.setAttribute('aria-pressed', String(axes)); applyLook(); });
    playBtn.addEventListener('click', () => setPlay(!playing));
    v.onTheme = () => current?.arrows.forEach(a => a.setColor(NW.css('--accent')));
    load('10449');
  });
})();
