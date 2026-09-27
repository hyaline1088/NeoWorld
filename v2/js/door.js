/* The one idea: the same door as a "movie set" (one fused surface) and as a simulation-ready asset. */
(() => {
  const T = THREE, host = document.querySelector('#door-stage');
  if (!host) return;
  const note = document.querySelector('#door-note');
  const buttons = [...document.querySelectorAll('[data-door-mode]')];
  NW.whenNear(host, async () => {
    const v = new NW.Viewer(host, { fov: 32 }); v.addLights();
    v.orbit.enablePan = false; v.orbit.enableZoom = false;
    let model, mode = 'set', open = false;
    const ray = new T.Raycaster(), ptr = new T.Vector2();
    const say = html => { note.innerHTML = html; };
    try { model = await NW.loadURDF('8994', v.renderer); }
    catch (e) { console.error(e); say('Could not load the door. Refresh to try again.'); return; }
    v.scene.add(model.object);
    const hinge = model.joints.get('door_hinge'), knob = model.joints.get('knob_spindle');
    // Hinge axis marker, shown only in sim-ready mode.
    const r = model.radius;
    const axisLine = new T.Line(new T.BufferGeometry().setFromPoints([new T.Vector3(0, 0, -r * .15), new T.Vector3(0, 0, r * 1.9)]),
      new T.LineDashedMaterial({ color: NW.css('--accent'), dashSize: r * .05, gapSize: r * .035, depthTest: false }));
    axisLine.computeLineDistances(); axisLine.renderOrder = 5; hinge.origin.add(axisLine);
    const grid = new T.GridHelper(r * 4, 16, 0x3b4236, 0x262b23); grid.position.y = -model.size.y / 2 - .002;
    grid.material.transparent = true; grid.material.opacity = .5; v.scene.add(grid);
    v.onResize = () => v.frame(r, new T.Vector3(.9, .45, 1.6), new T.Vector3(0, 0, 0), 1.3);
    v.resize();
    v.onTheme = () => axisLine.material.color.set(NW.css('--accent'));
    function setMode(m) {
      mode = m; buttons.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.doorMode === m)));
      axisLine.visible = m === 'sim';
      model.setLook(m === 'sim' ? 'parts' : 'skin');
      if (m === 'set') { open = false; NW.tween(v, 350, t => { model.apply(hinge, hinge.value * (1 - t)); model.apply(knob, knob.value * (1 - t)); }); }
      say(m === 'set'
        ? '<b>Movie set.</b> One fused surface, the way a photo-real scan stores it. Click the door.'
        : '<b>Simulation-ready.</b> Three parts, two joints. Click the door or the handle.');
      v.dirty = true;
    }
    buttons.forEach(b => b.addEventListener('click', () => setMode(b.dataset.doorMode)));
    let down;
    v.renderer.domElement.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; });
    v.renderer.domElement.addEventListener('pointerup', e => {
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
      const rect = v.renderer.domElement.getBoundingClientRect();
      ptr.set((e.clientX - rect.left) / rect.width * 2 - 1, -(e.clientY - rect.top) / rect.height * 2 + 1);
      ray.setFromCamera(ptr, v.camera);
      const hit = ray.intersectObject(model.object, true)[0];
      if (!hit) return;
      poke(hit.object.userData.linkName);
    });
    host.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); poke('link_door_hinge'); } });
    async function poke(link) {
      if (mode === 'set') {
        const x = model.object.position.x;
        await NW.tween(v, 380, t => { model.object.position.x = x + Math.sin(t * Math.PI * 4) * r * .012 * (1 - t); }, t => t);
        say('<b>Nothing moves.</b> The door is painted onto the frame. A robot cannot learn to open it here.');
        return;
      }
      if (link === 'link_knob_spindle') {
        await NW.tween(v, 260, t => model.apply(knob, knob.upper * t));
        await NW.tween(v, 260, t => model.apply(knob, knob.upper * (1 - t)));
        say(`<b>knob_spindle</b> · revolute · ${NW.deg(knob.lower).toFixed(0)}° to ${NW.deg(knob.upper).toFixed(0)}° · a separate part a gripper can turn.`);
        return;
      }
      open = !open; const from = hinge.value, to = open ? hinge.upper : 0;
      NW.tween(v, 700, t => model.apply(hinge, from + (to - from) * t));
      say(open
        ? `<b>door_hinge</b> · revolute · axis z · 0° to ${NW.deg(hinge.upper).toFixed(0)}° (read from 8994.urdf).`
        : '<b>Closed.</b> Click again to open, or try the handle.');
    }
    setMode('set');
  });
})();
