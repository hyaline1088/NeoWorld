/* Anatomy of a folding chair (100520): an X-ray split view plus joint sliders tied to the live URDF text. */
(() => {
  const T = THREE, host = document.querySelector('#anatomy-stage');
  if (!host) return;
  const handle = host.querySelector('.xray-handle');
  const list = document.querySelector('#anatomy-joints');
  const code = document.querySelector('#anatomy-code');
  const foldBtn = document.querySelector('#anatomy-fold');
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  NW.whenNear(host, async () => {
    const v = new NW.Viewer(host, { fov: 30 }); v.addLights();
    let split = .5, model, selected;
    const arrows = [];
    try { model = await NW.loadURDF('100520', v.renderer); }
    catch (e) { console.error(e); host.querySelector('.stage-status').textContent = 'Could not load the chair.'; return; }
    host.querySelector('.stage-status').hidden = true;
    v.scene.add(model.object);
    const r = model.radius;
    for (const j of model.movable) {
      const a = new T.ArrowHelper(j.axis, new T.Vector3(), r * .42, NW.css('--accent'), r * .07, r * .045);
      a.line.material.depthTest = a.cone.material.depthTest = false; a.renderOrder = 9; a.userData.joint = j.name;
      const dot = new T.Mesh(new T.SphereGeometry(r * .022, 16, 12), new T.MeshBasicMaterial({ color: 0xffffff, depthTest: false }));
      dot.renderOrder = 10; a.add(dot); j.origin.add(a); arrows.push(a);
    }
    const grid = new T.GridHelper(r * 4, 20, 0x3b4236, 0x262b23); grid.position.y = -model.size.y / 2 - .002;
    grid.material.transparent = true; grid.material.opacity = .5; v.scene.add(grid);
    v.onResize = () => v.frame(r, new T.Vector3(1.35, .55, 1.25), new T.Vector3(0, 0, 0), 1.02);
    v.resize();
    v.onTheme = () => { arrows.forEach(a => a.setColor(NW.css('--accent'))); paintHandle(); };
    // Two passes: left of the divider shows the textured skin, right shows parts and joints.
    v.render = () => {
      const R = v.renderer, w = v.width, h = v.height, x = Math.round(w * split);
      R.setScissorTest(true);
      model.setLook('skin'); arrows.forEach(a => { a.visible = false; });
      R.setScissor(0, 0, x, h); R.setViewport(0, 0, w, h); R.render(v.scene, v.camera);
      model.setLook('parts'); arrows.forEach(a => { a.visible = !selected || a.userData.joint === selected; });
      R.setScissor(x, 0, w - x, h); R.render(v.scene, v.camera);
      R.setScissorTest(false);
    };
    function paintHandle() { handle.style.left = `${split * 100}%`; handle.setAttribute('aria-valuenow', Math.round(split * 100)); }
    // Dragging the divider must not orbit the camera.
    let dragging = false;
    handle.addEventListener('pointerdown', e => { dragging = true; handle.setPointerCapture(e.pointerId); e.stopPropagation(); });
    handle.addEventListener('pointermove', e => {
      if (!dragging) return;
      const rect = host.getBoundingClientRect(); split = T.MathUtils.clamp((e.clientX - rect.left) / rect.width, .04, .96);
      paintHandle(); v.dirty = true;
    });
    handle.addEventListener('pointerup', () => { dragging = false; });
    handle.addEventListener('keydown', e => {
      const d = e.key === 'ArrowLeft' ? -.05 : e.key === 'ArrowRight' ? .05 : 0;
      if (!d) return; e.preventDefault(); split = T.MathUtils.clamp(split + d, .04, .96); paintHandle(); v.dirty = true;
    });
    paintHandle();

    // Joint list and the URDF panel
    const rows = new Map();
    const partName = link => link.replace(/^link_/, '').replace(/_/g, ' ');
    function showCode(j) {
      const lines = j.xml.replace(/ xmlns="[^"]*"/g, '').split('\n').map(l => l.replace(/^\s{2}/, ''));
      const deg = NW.deg(j.value).toFixed(1), rad = j.value.toFixed(3);
      code.innerHTML = lines.map(l => `<span${/<limit/.test(l) ? ' class="hl"' : ''}>${esc(l)}</span>`).join('')
        + `<span class="hl live">&lt;!-- live: q = <b>${rad}</b> rad = <b>${deg}°</b> --&gt;</span>`;
    }
    function select(name) {
      selected = name; const j = model.joints.get(name);
      rows.forEach((row, n) => row.classList.toggle('on', n === name));
      showCode(j); v.dirty = true;
    }
    for (const j of model.movable) {
      const row = document.createElement('div'); row.className = 'joint-row';
      const lo = NW.deg(j.lower), hi = NW.deg(j.upper);
      row.innerHTML = `<button type="button" class="joint-name"><i style="background:${model.linkColor.get(j.child)}"></i>${j.name}<small>${partName(j.child)}</small></button>
        <input type="range" id="an-${j.name}" min="${lo.toFixed(2)}" max="${hi.toFixed(2)}" step="0.1" value="${NW.deg(j.value).toFixed(2)}" aria-label="${j.name} angle in degrees">
        <span class="joint-range">${lo.toFixed(0)}° … ${hi.toFixed(0)}°</span>`;
      const range = row.querySelector('input');
      row.querySelector('button').addEventListener('click', () => select(j.name));
      range.addEventListener('input', () => { model.apply(j, T.MathUtils.degToRad(+range.value)); select(j.name); });
      j.range = range; rows.set(j.name, row); list.append(row);
    }
    select('seat_fold');
    // Fold the whole chair: seat up, rear frame in.
    let folded = false;
    foldBtn.addEventListener('click', async () => {
      folded = !folded; foldBtn.textContent = folded ? 'Unfold the chair' : 'Fold the chair';
      const seat = model.joints.get('seat_fold'), rear = model.joints.get('rear_frame_fold');
      const s0 = seat.value, r0 = rear.value, s1 = folded ? seat.lower : 0, r1 = folded ? rear.lower : 0;
      select('seat_fold');
      await NW.tween(v, 1100, t => {
        model.apply(seat, s0 + (s1 - s0) * t); model.apply(rear, r0 + (r1 - r0) * t);
        seat.range.value = NW.deg(seat.value); rear.range.value = NW.deg(rear.value); showCode(seat);
      }, t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
    });
  });
})();
