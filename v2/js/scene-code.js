/* Scene 01 as code: formats the construction record (data/scene-01-record.json, extracted from the
   glTF extras by scripts/extract-scene-record.py) into readable lines. Operation names and parameters are
   the recorded ones; parts without a recorded operation are listed as meshes with their measured size. */
(() => {
  const NW = window.NW;
  let record;
  // The construction record, with the example physical properties (data/scene-01-physics-example.json)
  // attached per object: parts are grouped by the first material rule their name matches.
  NW.sceneRecord = () => record || (record = Promise.all([
    fetch('data/scene-01-record.json').then(r => { if (!r.ok) throw new Error(`scene record (${r.status})`); return r.json(); }),
    fetch('data/scene-01-physics-example.json').then(r => r.ok ? r.json() : null).catch(() => null),
  ]).then(([rec, phys]) => {
    for (const e of rec.entities) {
      const rules = phys?.objects?.[e.id];
      if (!rules) continue;
      const groups = rules.map(rule => ({ ...rule, re: new RegExp(rule.match, 'i'), nodes: [] }));
      for (const p of e.parts) {
        const g = groups.find(x => x.re.test(p.part));
        if (g) { g.nodes.push(p.node); p.physics = g; }
      }
      e.physics = groups.filter(g => g.nodes.length);
    }
    return rec;
  }));
  // Up to 5 decimals (0.01 mm), so recorded values such as radius 0.01166 are shown unchanged.
  const num = v => {
    const s = (Math.round(v * 1e5) / 1e5).toFixed(5).replace(/\.?0+$/, '');
    return s === '-0' ? '0' : s;
  };
  const val = v => Array.isArray(v) ? (Array.isArray(v[0]) ? `[…${v.length} points]` : `(${v.map(val).join(', ')})`)
    : typeof v === 'number' ? num(v) : typeof v === 'string' ? `"${v}"` : String(v);
  NW.pretty = id => id.replace(/^Entity__/, '').replace(/^s1-|^scene1-/, '').replace(/-measured$/, '').replace(/[-_]+/g, ' ').trim();
  const varName = id => NW.pretty(id).replace(/\s+/g, '_').replace(/[^\w]/g, '').toLowerCase() || 'obj';
  const cm = size => size ? size.map(s => (s * 100).toFixed(s < .1 ? 1 : 0)).join(' × ') + ' cm' : 'size unknown';

  /* Lines for one object: [{ text, kind: 'comment'|'code'|'op'|'mesh', node? }] */
  NW.entityLines = e => {
    const v = varName(e.id), ops = e.parts.filter(p => p.op).length, lines = [];
    lines.push({ kind: 'comment', text: `# ${e.id} · ${e.parts.length} parts · ${ops} built by a recorded SDK operation` });
    if (e.representation) lines.push({ kind: 'comment', text: `# representation: ${e.representation} · frame: scan world, z up, metres` });
    for (const [k, x] of Object.entries(e.notes || {})) lines.push({ kind: 'comment', text: `# ${k}: ${x}` });
    lines.push({ kind: 'code', text: `${v} = scene.object("${e.id}")` });
    if (e.physics?.length) {
      lines.push({ kind: 'comment', text: '# physical properties · example values for illustration' });
      for (const g of e.physics) {
        lines.push({ kind: 'phys', nodes: g.nodes, text: `${v}.physics("${g.material}", density=${g.density}, friction=${g.friction})  # ${g.nodes.length} part${g.nodes.length === 1 ? '' : 's'}` });
      }
      lines.push({ kind: 'comment', text: '# construction' });
    }
    for (const p of e.parts) {
      if (p.op) {
        const args = Object.entries(p.params).map(([k, x]) => `${k}=${val(x)}`).join(', ');
        lines.push({ kind: 'op', node: p.node, text: `${v}.${p.op}("${p.part}", ${args})` });
      } else {
        const note = [p.role && p.role !== 'PHYSICAL_CARRIER' ? p.role : null, ...Object.entries(p.notes || {}).map(([k, x]) => `${k}: ${x}`)].filter(Boolean);
        lines.push({ kind: 'mesh', node: p.node, text: `${v}.mesh("${p.part}")  # no recorded operation · size ≈ ${cm(p.size)}${note.length ? ' · ' + note.join(' · ') : ''}` });
      }
    }
    return lines;
  };
})();
