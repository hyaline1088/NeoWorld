/* Scene 01 explorer: the reconstructed coffee corner as named, separable parts, and as code.
   Code mode lists the selected object's construction record and links each line to its part. */
(() => {
  const T = THREE, host = document.querySelector('#scene-stage');
  if (!host) return;
  const tip = host.querySelector('.part-tip');
  const legend = document.querySelector('#scene-legend');
  const status = host.querySelector('.stage-status');
  const body = document.querySelector('#scene-body');
  const codePanel = document.querySelector('#scene-code-panel');
  const codeEl = document.querySelector('#scene-code');
  const codeTitle = document.querySelector('#scene-code-title');
  const buttons = [...document.querySelectorAll('[data-scene-look]')];
  const sanitize = s => T.PropertyBinding.sanitizeNodeName(s);
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
    let gltf, record;
    try { [gltf, record] = await Promise.all([loader.loadAsync(`${NW.ASSETS}studio/scenes/scene-01/scene.glb`), NW.sceneRecord().catch(() => null)]); }
    catch (e) { console.error(e); status.textContent = 'Could not load the scene model.'; return; }
    status.hidden = true;
    const root = gltf.scene; v.scene.add(root);
    // Record lookups by the names three.js gives nodes.
    const partByNode = new Map(), entityRecord = new Map();
    for (const e of record?.entities || []) {
      entityRecord.set(sanitize(e.node), e);
      for (const p of e.parts) partByNode.set(sanitize(p.node), p);
    }
    // Group meshes by their Entity__ ancestor (or "background"), and bind each to its record part.
    const entities = new Map(); const meshes = []; const meshesByNode = new Map();
    root.traverse(o => {
      if (!o.isMesh) return;
      let p = o, ent = 'Background', node = null;
      while (p) {
        if (!node && partByNode.has(p.name)) node = p.name;
        if (/^Entity__/.test(p.name)) { ent = p.name; break; }
        p = p.parent;
      }
      o.userData.entity = ent; o.userData.skin = o.material; o.userData.node = node;
      o.userData.hasOp = !!(node && partByNode.get(node).op);
      if (!entities.has(ent)) entities.set(ent, []);
      entities.get(ent).push(o); meshes.push(o);
      if (node) { if (!meshesByNode.has(node)) meshesByNode.set(node, []); meshesByNode.get(node).push(o); }
    });
    const opsIn = n => entities.get(n).filter(m => m.userData.hasOp).length;
    const names = [...entities.keys()].sort((a, b) => (a === 'Background') - (b === 'Background') || opsIn(b) - opsIn(a) || entities.get(b).length - entities.get(a).length);
    const colorOf = new Map(names.map((n, i) => [n, n === 'Background' ? '#6b7564' : NW.partColors[i % NW.partColors.length]]));
    for (const m of meshes) {
      const col = new T.Color(colorOf.get(m.userData.entity));
      m.userData.part = new T.MeshStandardMaterial({ color: col.clone().convertSRGBToLinear(), roughness: .7, metalness: 0, side: T.DoubleSide, transparent: true });
      m.userData.wire = new T.MeshBasicMaterial({ color: col, wireframe: true, transparent: true, opacity: .55 });
      // Code look: parts built by a recorded operation keep their colour; mesh-only parts are grey.
      m.userData.code = new T.MeshStandardMaterial({ color: new T.Color(m.userData.hasOp ? colorOf.get(m.userData.entity) : '#5c6356').convertSRGBToLinear(), roughness: .75, metalness: 0, side: T.DoubleSide, transparent: true });
    }
    root.updateMatrixWorld(true); // bounds below need final world transforms
    const focus = new T.Box3();
    // Frame on the furniture; room-shell and edge-of-capture fragments would widen the view.
    for (const n of names) if (/cabinet|stool|microwave|coffee-machine/i.test(n)) entities.get(n).forEach(m => focus.expandByObject(m));
    if (focus.isEmpty()) focus.setFromObject(root);
    const c = focus.getCenter(new T.Vector3()), rad = focus.getBoundingSphere(new T.Sphere()).radius;
    v.onResize = () => v.frame(rad, new T.Vector3(.35, .28, 1), c, .95);
    v.resize();
    v.orbit.maxPolarAngle = Math.PI * .52; v.orbit.minAzimuthAngle = -1.1; v.orbit.maxAzimuthAngle = 1.1;

    let look = 'skin', isolated = null, hovered = [], lineEls = new Map(), activeLine = null;
    const glow = new T.Color(NW.css('--accent'));
    const active = m => m.material === m.userData.part || m.material === m.userData.code;
    function paint() {
      for (const m of meshes) {
        m.material = look === 'parts' ? m.userData.part : look === 'wire' ? m.userData.wire : look === 'code' ? m.userData.code : m.userData.skin;
        const dim = isolated && m.userData.entity !== isolated;
        if (look !== 'skin') m.material.opacity = dim ? (look === 'code' ? .08 : .12) : (look === 'wire' ? .55 : 1);
        m.visible = true; // Rendered always shows the whole scene; other views dim instead of hiding
      }
      v.dirty = true;
    }
    function setLook(next) {
      const was = look;
      look = next; buttons.forEach(x => x.setAttribute('aria-pressed', String(x.dataset.sceneLook === look)));
      const coding = look === 'code' && !!record;
      body.classList.toggle('coding', coding); codePanel.hidden = !coding;
      // Switching views starts from the whole scene; Code always shows one object's listing.
      if (was !== look) selectEntity(coding ? (names.find(n => opsIn(n)) || names[0]) : null);
      paint();
    }
    buttons.forEach(b => b.addEventListener('click', () => setLook(b.dataset.sceneLook)));

    // Code listing for one object, each line linked to its part.
    function renderCode(n) {
      const e = entityRecord.get(n);
      lineEls = new Map(); activeLine = null;
      if (!e) { codeTitle.textContent = NW.pretty(n); codeEl.textContent = '# No construction record for this object.'; return; }
      codeTitle.textContent = `${NW.pretty(n)} · ${e.parts.length} parts`;
      codeEl.replaceChildren(...NW.entityLines(e).map(line => {
        const span = document.createElement('span'); span.textContent = line.text; span.className = line.kind;
        if (line.node) {
          const key = sanitize(line.node); span.dataset.node = key; lineEls.set(key, span);
          span.addEventListener('pointerenter', () => glowParts(meshesByNode.get(key) || []));
          span.addEventListener('pointerleave', () => glowParts([]));
        } else if (line.nodes) { // a physics line lights up every part made of that material
          const list = line.nodes.flatMap(n => meshesByNode.get(sanitize(n)) || []);
          span.addEventListener('pointerenter', () => glowParts(list));
          span.addEventListener('pointerleave', () => glowParts([]));
        }
        return span;
      }));
      codeEl.scrollTop = 0;
    }
    function markLine(key, scroll) {
      activeLine?.classList.remove('hl');
      activeLine = key ? lineEls.get(key) || null : null;
      if (!activeLine) return;
      activeLine.classList.add('hl');
      if (scroll) codeEl.scrollTop = activeLine.offsetTop - codeEl.clientHeight / 2;
    }
    function selectEntity(n) {
      isolated = n;
      [...legend.children].forEach(x => x.setAttribute('aria-pressed', String(x.dataset.entity === n)));
      if (look === 'code') renderCode(n);
      paint();
    }
    // Legend chips isolate one object (in code mode, they choose which object's code to show).
    for (const n of names) {
      const chip = document.createElement('button'); chip.type = 'button'; chip.className = 'chip'; chip.dataset.entity = n;
      chip.innerHTML = `<i style="background:${colorOf.get(n)}"></i>${NW.pretty(n)} <small>${entities.get(n).length}</small>`;
      chip.setAttribute('aria-pressed', 'false');
      chip.addEventListener('click', () => {
        if (look === 'code') { selectEntity(n); return; }
        if (look === 'skin') setLook('parts'); // isolating an object needs the Objects view
        selectEntity(isolated === n ? null : n);
      });
      legend.append(chip);
    }
    document.querySelector('#scene-count').textContent = `${meshes.length} named parts in ${names.length - 1} objects plus the room shell`;

    // Hover shows the part's own name; in code mode it also marks its line.
    const ray = new T.Raycaster(), ptr = new T.Vector2();
    function glowParts(list) {
      hovered.forEach(m => { m.userData.part.emissive.setScalar(0); m.userData.code.emissive.setScalar(0); });
      hovered = list;
      hovered.forEach(m => { if (active(m)) m.material.emissive.copy(glow).multiplyScalar(.45); });
      v.dirty = true;
    }
    function pick(e) {
      const rect = v.renderer.domElement.getBoundingClientRect();
      ptr.set((e.clientX - rect.left) / rect.width * 2 - 1, -(e.clientY - rect.top) / rect.height * 2 + 1);
      ray.setFromCamera(ptr, v.camera);
      return ray.intersectObjects(meshes.filter(m => m.visible && m.material.opacity > .5 && m.userData.entity !== 'Background'), false)[0]?.object || null;
    }
    function showTip(m, e) {
      if (!m) { tip.hidden = true; return; }
      const part = m.name.includes('__') ? m.name.split('__').pop() : m.name;
      const rec = m.userData.node && partByNode.get(m.userData.node);
      tip.innerHTML = `<span>${NW.pretty(m.userData.entity)}</span><b>${part.replace(/_/g, ' ')}</b><code>${rec?.op ? rec.op + '(…)' : m.name}</code>`;
      const rect = host.getBoundingClientRect();
      tip.style.left = `${Math.min(e.clientX - rect.left + 14, rect.width - 250)}px`; tip.style.top = `${e.clientY - rect.top + 14}px`;
      tip.hidden = false;
    }
    let pending = null, down = null;
    const canvas = v.renderer.domElement;
    canvas.addEventListener('pointermove', e => { pending = e; });
    canvas.addEventListener('pointerleave', () => { pending = null; glowParts([]); showTip(null); });
    canvas.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; });
    canvas.addEventListener('pointerup', e => {
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5 || look !== 'code') return;
      const m = pick(e); if (!m) return;
      if (m.userData.entity !== isolated) selectEntity(m.userData.entity);
      markLine(m.userData.node, true);
    });
    v.ticks.add(() => {
      if (!pending) return false;
      const e = pending; pending = null;
      const m = pick(e);
      glowParts(m ? (m.userData.node && meshesByNode.get(m.userData.node)) || [m] : []);
      showTip(m, e);
      if (look === 'code' && m && m.userData.entity === isolated) markLine(m.userData.node, false);
      return false;
    });
    paint();
    (NW.debug = NW.debug || {}).scene = { viewer: v, meshes, setLook, selectEntity }; // for browser checks
  });
})();
