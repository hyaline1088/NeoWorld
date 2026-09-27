/* Scene 01 explorer: the reconstructed coffee corner as named, separable parts. */
(() => {
  const T = THREE, host = document.querySelector('#scene-stage');
  if (!host) return;
  const tip = host.querySelector('.part-tip');
  const legend = document.querySelector('#scene-legend');
  const status = host.querySelector('.stage-status');
  const buttons = [...document.querySelectorAll('[data-scene-look]')];
  const pretty = s => s.replace(/^Entity__/, '').replace(/^s1-|^scene1-/, '').replace(/-measured$/, '').replace(/[-_]+/g, ' ').trim();
  NW.whenNear(host, async () => {
    const v = new NW.Viewer(host, { fov: 40 }); v.addLights(.9);
    // A soft studio environment so the glTF's physical materials read correctly.
    const pmrem = new T.PMREMGenerator(v.renderer);
    const env = new T.Scene(); env.background = new T.Color(0x9a9a94);
    const light = (c, p, s) => { const m = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshBasicMaterial({ color: c, side: T.DoubleSide })); m.position.fromArray(p); m.scale.setScalar(s); m.lookAt(0, 0, 0); env.add(m); };
    light(0xffffff, [0, 6, 0], 8); light(0xfff1dc, [6, 2, 4], 5); light(0xdfe9ff, [-6, 2, -3], 5);
    v.scene.environment = pmrem.fromScene(env, .04).texture;
    const draco = new T.DRACOLoader(); draco.setDecoderPath('../vendor/draco/');
    const loader = new T.GLTFLoader(); loader.setDRACOLoader(draco);
    let gltf;
    try { gltf = await loader.loadAsync(`${NW.ASSETS}studio/scenes/scene-01/scene.glb`); }
    catch (e) { console.error(e); status.textContent = 'Could not load the scene model.'; return; }
    status.hidden = true;
    const root = gltf.scene; v.scene.add(root);
    // Group meshes by their Entity__ ancestor (or "background").
    const entities = new Map(); const meshes = [];
    root.traverse(o => {
      if (!o.isMesh) return;
      let p = o, ent = 'Background';
      while (p) { if (/^Entity__/.test(p.name)) { ent = p.name; break; } p = p.parent; }
      o.userData.entity = ent; o.userData.skin = o.material;
      if (!entities.has(ent)) entities.set(ent, []);
      entities.get(ent).push(o); meshes.push(o);
    });
    const names = [...entities.keys()].sort((a, b) => (a === 'Background') - (b === 'Background') || entities.get(b).length - entities.get(a).length);
    const colorOf = new Map(names.map((n, i) => [n, n === 'Background' ? '#6b7564' : NW.partColors[i % NW.partColors.length]]));
    for (const m of meshes) {
      m.userData.part = new T.MeshStandardMaterial({ color: new T.Color(colorOf.get(m.userData.entity)).convertSRGBToLinear(), roughness: .7, metalness: 0, side: T.DoubleSide, transparent: true });
      m.userData.wire = new T.MeshBasicMaterial({ color: new T.Color(colorOf.get(m.userData.entity)), wireframe: true, transparent: true, opacity: .55 });
    }
    // Frame on the furniture, not the whole room shell.
    root.updateMatrixWorld(true); // bounds below need final world transforms
    const focus = new T.Box3();
    // Frame on the furniture; room-shell and edge-of-capture fragments would widen the view.
    for (const n of names) if (/cabinet|stool|microwave|coffee-machine/i.test(n)) entities.get(n).forEach(m => focus.expandByObject(m));
    if (focus.isEmpty()) focus.setFromObject(root);
    const c = focus.getCenter(new T.Vector3()), rad = focus.getBoundingSphere(new T.Sphere()).radius;
    v.onResize = () => v.frame(rad, new T.Vector3(.35, .28, 1), c, .95);
    v.resize();
    v.orbit.maxPolarAngle = Math.PI * .52; v.orbit.minAzimuthAngle = -1.1; v.orbit.maxAzimuthAngle = 1.1;
    let look = 'skin', isolated = null, hovered = null;
    function paint() {
      for (const m of meshes) {
        m.material = look === 'parts' ? m.userData.part : look === 'wire' ? m.userData.wire : m.userData.skin;
        const dim = isolated && m.userData.entity !== isolated;
        if (look !== 'skin') m.material.opacity = dim ? .12 : (look === 'wire' ? .55 : 1);
        m.visible = !(look === 'skin' && dim && m.userData.entity !== 'Background');
      }
      v.dirty = true;
    }
    buttons.forEach(b => b.addEventListener('click', () => { look = b.dataset.sceneLook; buttons.forEach(x => x.setAttribute('aria-pressed', String(x === b))); paint(); }));
    // Legend chips isolate one object.
    for (const n of names) {
      const chip = document.createElement('button'); chip.type = 'button'; chip.className = 'chip';
      chip.innerHTML = `<i style="background:${colorOf.get(n)}"></i>${pretty(n)} <small>${entities.get(n).length}</small>`;
      chip.setAttribute('aria-pressed', 'false');
      chip.addEventListener('click', () => {
        isolated = isolated === n ? null : n;
        [...legend.children].forEach(x => x.setAttribute('aria-pressed', String(x === chip && isolated === n)));
        if (look === 'skin' && isolated) { look = 'parts'; buttons.forEach(x => x.setAttribute('aria-pressed', String(x.dataset.sceneLook === 'parts'))); }
        paint();
      });
      legend.append(chip);
    }
    document.querySelector('#scene-count').textContent = `${meshes.length} named parts in ${names.length - 1} objects plus the room shell`;
    // Hover: show the part's own name from the program.
    const ray = new T.Raycaster(), ptr = new T.Vector2();
    const glow = new T.Color(NW.css('--accent'));
    let pending = null;
    v.renderer.domElement.addEventListener('pointermove', e => { pending = e; });
    v.renderer.domElement.addEventListener('pointerleave', () => { pending = null; setHover(null); });
    function setHover(m, e) {
      // Only per-part materials glow; the original glTF materials may be shared between meshes.
      if (hovered && hovered !== m) hovered.userData.part.emissive.setScalar(0);
      hovered = m;
      if (!m) { tip.hidden = true; v.dirty = true; return; }
      m.userData.part.emissive.copy(glow).multiplyScalar(.45);
      const part = m.name.includes('__') ? m.name.split('__').pop() : m.name;
      tip.innerHTML = `<span>${pretty(m.userData.entity)}</span><b>${part.replace(/_/g, ' ')}</b><code>${m.name}</code>`;
      const rect = host.getBoundingClientRect();
      tip.style.left = `${Math.min(e.clientX - rect.left + 14, rect.width - 250)}px`; tip.style.top = `${e.clientY - rect.top + 14}px`;
      tip.hidden = false; v.dirty = true;
    }
    v.ticks.add(() => {
      if (!pending) return false;
      const e = pending; pending = null;
      const rect = v.renderer.domElement.getBoundingClientRect();
      ptr.set((e.clientX - rect.left) / rect.width * 2 - 1, -(e.clientY - rect.top) / rect.height * 2 + 1);
      ray.setFromCamera(ptr, v.camera);
      const hit = ray.intersectObjects(meshes.filter(m => m.visible && m.userData.entity !== 'Background'), false)[0];
      setHover(hit?.object || null, e); return false;
    });
    paint();
    (NW.debug = NW.debug || {}).scene = { viewer: v, meshes }; // for browser checks
  });
})();
