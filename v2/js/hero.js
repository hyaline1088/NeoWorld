/* Hero: the prebaked Scene 01 feature edges. The camera turns with the pointer and with scroll. */
(() => {
  const T = THREE, host = document.querySelector('#hero-world');
  if (!host) return;
  let v;
  try { v = new NW.Viewer(host, { orbit: false, alpha: true }); } catch (e) { host.dataset.state = 'no-webgl'; return; }
  const cam = new T.OrthographicCamera(-6, 6, 5, -5, .1, 80); v.camera = cam;
  const edgeMat = new T.LineBasicMaterial({ transparent: true, opacity: .85 });
  const structMat = new T.LineBasicMaterial({ transparent: true, opacity: .38 });
  const paint = () => { edgeMat.color.set(NW.css('--accent-line')); structMat.color.set(NW.css('--hero-wire')); v.dirty = true; };
  paint(); v.onTheme = paint;
  const target = new T.Vector3(), pointer = new T.Vector2(), eased = new T.Vector2();
  let focus, scrollTurn = 0, baseH = 10, ready = false;
  function pose() {
    const az = T.MathUtils.degToRad(6 + eased.x * 10 + scrollTurn * 38), el = T.MathUtils.degToRad(16 - eased.y * 5 + scrollTurn * 10);
    cam.position.set(20 * Math.cos(el) * Math.sin(az), 20 * Math.sin(el), 20 * Math.cos(el) * Math.cos(az)).add(target);
    cam.lookAt(target); cam.updateMatrixWorld(true);
  }
  function fit() {
    if (!focus) return;
    let hw = 0, hh = 0; const p = new T.Vector3();
    for (const x of [-1, 0, 1]) for (const s of [0, 1]) {
      eased.set(x, 0); scrollTurn = s; pose();
      for (const bx of [focus.min.x, focus.max.x]) for (const by of [focus.min.y, focus.max.y]) for (const bz of [focus.min.z, focus.max.z]) {
        p.set(bx, by, bz).applyMatrix4(cam.matrixWorldInverse); hw = Math.max(hw, Math.abs(p.x)); hh = Math.max(hh, Math.abs(p.y));
      }
    }
    eased.set(0, 0); scrollTurn = 0; pose();
    const aspect = v.width / v.height, wide = aspect > 1.2;
    baseH = Math.max(hh * 2, hw * 2 / aspect) / (wide ? .92 : 1.05);
    // On wide screens push the model right so the headline keeps the left half.
    const shiftX = wide ? -baseH * aspect * .26 : 0, shiftY = wide ? 0 : baseH * .18;
    cam.top = baseH / 2 + shiftY; cam.bottom = -baseH / 2 + shiftY;
    cam.right = baseH * aspect / 2 + shiftX; cam.left = -baseH * aspect / 2 + shiftX;
    cam.updateProjectionMatrix(); v.dirty = true;
  }
  v.onResize = fit;
  host.closest('.hero').addEventListener('pointermove', e => {
    if (e.pointerType === 'touch' || NW.reduced.matches) return;
    const r = host.getBoundingClientRect();
    pointer.set(T.MathUtils.clamp((e.clientX - r.left) / r.width * 2 - 1, -1, 1), T.MathUtils.clamp((e.clientY - r.top) / r.height * 2 - 1, -1, 1));
  });
  host.closest('.hero').addEventListener('pointerleave', () => pointer.set(0, 0));
  v.ticks.add(() => {
    if (!ready || eased.distanceToSquared(pointer) < 1e-6) return false;
    eased.lerp(pointer, .05); pose(); return true;
  });
  NW.heroScroll = t => { scrollTurn = t; if (ready) { pose(); v.dirty = true; } };
  (async () => {
    try {
      const buf = await (await fetch(`${NW.ASSETS}studio/scenes/scene-01/scene-wireframe.bin`)).arrayBuffer();
      const dv = new DataView(buf);
      if (dv.getUint32(0, false) !== 0x4e574631) throw new Error('bad wireframe header');
      const a = dv.getUint32(4, true), b = dv.getUint32(8, true);
      const pa = new Float32Array(buf, 12, a * 3), pb = new Float32Array(buf, 12 + pa.byteLength, b * 3);
      const geo = arr => { const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(arr, 3)); g.computeBoundingBox(); return g; };
      const ga = geo(pa), gb = geo(pb);
      v.scene.add(new T.LineSegments(ga, edgeMat), new T.LineSegments(gb, structMat));
      focus = ga.boundingBox.clone(); focus.getCenter(target);
      const all = ga.boundingBox.clone().union(gb.boundingBox);
      const grid = new T.GridHelper(11, 22, 0x42483c, 0x292c27); grid.position.y = all.min.y - .02;
      grid.material.transparent = true; grid.material.opacity = .45; v.scene.add(grid);
      ready = true; host.dataset.state = 'ready'; fit();
    } catch (e) { console.error('hero', e); host.dataset.state = 'error'; }
  })();
})();
