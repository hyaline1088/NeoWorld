/* Shared helpers for the v2 page: theme tokens, a render-on-demand three.js viewer, and a URDF loader.
   Three.js r134 (global build). URDF joint transforms stay in URDF coordinates under a Z-up root. */
(() => {
  'use strict';
  const T = window.THREE;
  const NW = window.NW = window.NW || {};
  NW.ASSETS = '../assets/';
  NW.reduced = matchMedia('(prefers-reduced-motion: reduce)');

  NW.css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  NW.color = name => new T.Color(NW.css(name) || '#888');
  // Part colours for "parts" mode, ordered and fixed so a link keeps its colour.
  NW.partColors = ['#b8f34a', '#6cc4ff', '#ffb45e', '#ff8fb1', '#b69cff', '#5fe3c0', '#f5e663', '#ff7a59'];

  /* Lazily start work when an element comes near the viewport. */
  NW.whenNear = (el, fn, margin = '600px 0px') => {
    const io = new IntersectionObserver(entries => {
      if (!entries[0].isIntersecting) return;
      io.disconnect(); fn();
    }, { rootMargin: margin });
    io.observe(el);
  };

  /* Render-on-demand viewer. Renders only while visible and when marked dirty or animating. */
  NW.Viewer = class Viewer {
    constructor(host, { fov = 35, orbit = true, alpha = false, bg = '--stage', near = .01, far = 200 } = {}) {
      this.host = host; this.bgToken = bg;
      this.renderer = new T.WebGLRenderer({ antialias: true, alpha });
      this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
      this.renderer.outputEncoding = T.sRGBEncoding;
      this.renderer.toneMapping = T.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.05;
      if (!alpha) this.renderer.setClearColor(NW.css(bg) || '#101310');
      host.prepend(this.renderer.domElement);
      this.scene = new T.Scene();
      this.camera = new T.PerspectiveCamera(fov, 1, near, far);
      this.dirty = true; this.visible = false; this.animating = 0; this.ticks = new Set();
      if (orbit) {
        this.orbit = new T.OrbitControls(this.camera, this.renderer.domElement);
        this.orbit.enableDamping = true; this.orbit.dampingFactor = .09;
        this.orbit.addEventListener('change', () => { this.dirty = true; });
      }
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(host);
      new IntersectionObserver(e => { this.visible = e[0].isIntersecting; this.dirty = true; }, { threshold: 0 }).observe(host);
      document.addEventListener('nw-theme', () => { if (!alpha) this.renderer.setClearColor(NW.css(this.bgToken)); this.dirty = true; this.onTheme?.(); });
      this.last = performance.now();
      const loop = now => {
        requestAnimationFrame(loop);
        const dt = Math.min((now - this.last) / 1000, .05); this.last = now;
        if (!this.visible || document.hidden) return;
        for (const fn of this.ticks) if (fn(dt, now) === true) this.dirty = true;
        if (this.orbit) this.orbit.update();
        if (this.dirty) { this.dirty = false; this.render(); }
      };
      requestAnimationFrame(loop);
    }
    resize() {
      const w = Math.max(this.host.clientWidth, 1), h = Math.max(this.host.clientHeight, 1);
      this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
      this.width = w; this.height = h; this.onResize?.(w, h); this.dirty = true;
    }
    render() { this.renderer.render(this.scene, this.camera); }
    addLights(strength = 1) {
      this.scene.add(new T.HemisphereLight(0xffffff, 0x3a3f36, 1.15 * strength));
      for (const [p, s] of [[[3, 5, 4], 1.9], [[-4, 2, -3], .7]]) {
        const l = new T.DirectionalLight(0xffffff, s * strength); l.position.fromArray(p); this.scene.add(l);
      }
    }
    /* Frame a bounding sphere of radius r from a direction. */
    frame(r, dir = new T.Vector3(1.1, .65, 1.6), target = new T.Vector3(), pad = 1.25) {
      const v = T.MathUtils.degToRad(this.camera.fov);
      const hfov = 2 * Math.atan(Math.tan(v / 2) * this.camera.aspect);
      const dist = r * pad / Math.sin(Math.min(v, hfov) / 2);
      this.camera.position.copy(dir.clone().normalize().multiplyScalar(dist).add(target));
      this.camera.near = r / 100; this.camera.far = r * 100; this.camera.updateProjectionMatrix();
      if (this.orbit) { this.orbit.target.copy(target); this.orbit.minDistance = r * .6; this.orbit.maxDistance = r * 8; this.orbit.update(); }
      else this.camera.lookAt(target);
      this.dirty = true;
    }
  };

  /* Simple tween driven by a viewer tick. Returns a promise. */
  NW.tween = (viewer, ms, fn, ease = t => 1 - Math.pow(1 - t, 3)) => new Promise(resolve => {
    if (NW.reduced.matches) { fn(1); viewer.dirty = true; resolve(); return; }
    let t = 0;
    const tick = dt => { t = Math.min(1, t + dt * 1000 / ms); fn(ease(t)); if (t >= 1) { viewer.ticks.delete(tick); resolve(); } return true; };
    viewer.ticks.add(tick);
  });

  /* ---------- URDF loading ---------- */
  const vec = (s, fb = [0, 0, 0]) => s ? s.trim().split(/\s+/).map(Number) : fb;
  function place(group, origin) {
    group.position.fromArray(vec(origin?.getAttribute('xyz')));
    group.quaternion.setFromEuler(new T.Euler(...vec(origin?.getAttribute('rpy')), 'ZYX'));
  }
  const textCache = new Map();
  const text = url => {
    if (!textCache.has(url.href)) textCache.set(url.href, fetch(url).then(r => { if (!r.ok) throw new Error(`${url} (${r.status})`); return r.text(); }));
    return textCache.get(url.href);
  };
  const texCache = new Map();
  const texture = (url, renderer) => {
    if (!texCache.has(url.href)) texCache.set(url.href, new Promise((res, rej) => new T.TextureLoader().load(url.href, m => {
      m.encoding = T.sRGBEncoding; m.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8); res(m);
    }, undefined, () => rej(new Error(`texture ${url}`)))));
    return texCache.get(url.href);
  };
  async function materials(mtlUrl, renderer) {
    const out = new Map(); let rec;
    for (const line of (await text(mtlUrl)).split(/\r?\n/)) {
      const w = line.trim().split(/\s+/);
      if (w[0] === 'newmtl') { rec = {}; out.set(w.slice(1).join(' '), rec); }
      if (!rec) continue;
      if (w[0] === 'Kd') rec.color = w.slice(1, 4).map(Number);
      if (w[0] === 'd') rec.opacity = Number(w[1]);
      if (w[0] === 'map_Kd') rec.mapUrl = new URL(w.slice(1).join(' '), mtlUrl);
    }
    await Promise.all([...out.values()].map(async r => { if (r.mapUrl) r.map = await texture(r.mapUrl, renderer).catch(() => null); }));
    return out;
  }
  async function visual(el, base, linkName, renderer) {
    const mesh = el.querySelector('geometry > mesh'); if (!mesh) return new T.Group();
    const url = new URL(mesh.getAttribute('filename'), base);
    const src = await text(url);
    const mats = new Map();
    for (const m of src.matchAll(/^mtllib\s+(.+)$/gm)) for (const [k, v] of await materials(new URL(m[1].trim(), url), renderer)) mats.set(k, v);
    const obj = new T.OBJLoader().parse(src);
    const rgba = vec(el.querySelector('material > color')?.getAttribute('rgba'), [.66, .66, .66, 1]);
    obj.traverse(child => {
      if (!child.isMesh) return;
      child.userData.linkName = linkName;
      if (!child.geometry.attributes.normal) child.geometry.computeVertexNormals();
      const make = old => {
        const r = mats.get(old.name) || {};
        const color = r.color || (r.map ? [1, 1, 1] : rgba);
        const m = new T.MeshStandardMaterial({ color: new T.Color(...color.slice(0, 3)), map: r.map || null, roughness: .55, metalness: .08, side: T.DoubleSide, opacity: r.opacity ?? 1, transparent: (r.opacity ?? 1) < 1 });
        old.dispose(); return m;
      };
      child.material = Array.isArray(child.material) ? child.material.map(make) : make(child.material);
      child.userData.skin = child.material;
    });
    const wrap = new T.Group(); place(wrap, el.querySelector('origin'));
    wrap.scale.fromArray(vec(mesh.getAttribute('scale'), [1, 1, 1])); wrap.add(obj); return wrap;
  }

  /* Load /assets/batch5_collision_urdf_textured/<id>/<id>.urdf into a Y-up group centred at the origin. */
  NW.loadURDF = async (id, renderer) => {
    const base = new URL(`${NW.ASSETS}batch5_collision_urdf_textured/${id}/`, location.href);
    const source = await text(new URL(`${id}.urdf`, base));
    const xml = new DOMParser().parseFromString(source, 'application/xml');
    const robot = xml.querySelector('robot'); if (!robot) throw new Error('URDF has no <robot>');
    const links = new Map(), joints = new Map(), children = new Set(), jobs = [];
    const root = new T.Group(); root.rotation.x = -Math.PI / 2;
    for (const node of robot.querySelectorAll(':scope > link')) {
      const g = new T.Group(), name = node.getAttribute('name'); g.name = name; links.set(name, g);
      for (const v of node.querySelectorAll(':scope > visual')) jobs.push(visual(v, base, name, renderer).then(m => g.add(m)));
    }
    for (const node of robot.querySelectorAll(':scope > joint')) {
      const name = node.getAttribute('name'), type = node.getAttribute('type');
      const parent = node.querySelector('parent').getAttribute('link'), child = node.querySelector('child').getAttribute('link');
      const origin = new T.Group(), motion = new T.Group(); place(origin, node.querySelector('origin'));
      links.get(parent).add(origin); origin.add(motion); motion.add(links.get(child)); children.add(child);
      const axis = new T.Vector3(...vec(node.querySelector('axis')?.getAttribute('xyz'), [1, 0, 0])).normalize();
      const lim = node.querySelector('limit');
      const lower = type === 'continuous' ? -Math.PI : Number(lim?.getAttribute('lower') ?? 0);
      const upper = type === 'continuous' ? Math.PI : Number(lim?.getAttribute('upper') ?? 0);
      joints.set(name, { name, type, parent, child, origin, motion, axis, lower, upper, value: 0, xml: node.outerHTML });
    }
    for (const [n, g] of links) if (!children.has(n)) root.add(g);
    await Promise.all(jobs);
    const model = { id, root, links, joints, source };
    model.apply = (j, v) => {
      j.value = Math.min(j.upper, Math.max(j.lower, v));
      j.motion.position.set(0, 0, 0); j.motion.quaternion.identity();
      if (j.type === 'prismatic') j.motion.position.copy(j.axis).multiplyScalar(j.value);
      else if (j.type !== 'fixed') j.motion.quaternion.setFromAxisAngle(j.axis, j.value);
    };
    for (const j of joints.values()) model.apply(j, Math.max(j.lower, Math.min(j.upper, 0)));
    const holder = new T.Group(); holder.add(root);
    holder.updateMatrixWorld(true);
    const box = new T.Box3().setFromObject(holder);
    root.position.sub(box.getCenter(new T.Vector3()));
    model.size = box.getSize(new T.Vector3());
    model.radius = box.getBoundingSphere(new T.Sphere()).radius;
    model.object = holder;
    model.movable = [...joints.values()].filter(j => ['revolute', 'continuous', 'prismatic'].includes(j.type));
    // Link-coloured "parts" materials, created once.
    let i = 0; const linkColor = new Map();
    for (const name of links.keys()) linkColor.set(name, NW.partColors[i++ % NW.partColors.length]);
    holder.traverse(c => {
      if (!c.isMesh || !c.userData.skin) return;
      c.userData.part =new T.MeshStandardMaterial({ color: new T.Color(linkColor.get(c.userData.linkName)).convertSRGBToLinear(), roughness: .6, metalness: 0, side: T.DoubleSide });
    });
    model.linkColor = linkColor;
    model.setLook = look => holder.traverse(c => {
      if (!c.isMesh || !c.userData.skin) return; // skip helpers such as joint-axis arrows
      c.material = look === 'parts' ? c.userData.part : c.userData.skin;
      const list = Array.isArray(c.material) ? c.material : [c.material];
      list.forEach(m => { m.wireframe = look === 'wire'; });
    });
    return model;
  };

  NW.jointLabel = j => j.name.replace(/_/g, ' ');
  NW.deg = r => r * 180 / Math.PI;
})();
