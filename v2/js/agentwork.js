/* Watch the agent work: real edit programs from one Scene 01 session, shown as a timeline of cards.
   Content comes from data/scene-01-agent-edits.json (internal handoff; left out of the public build). */
(() => {
  const host = document.querySelector('#agent-edits');
  if (!host) return;
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const code = lines => `<pre class="code">${lines.map(l => `<span>${esc(l)}</span>`).join('')}</pre>`;
  fetch('data/scene-01-agent-edits.json').then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }).then(d => {
    const stages = [...new Set(d.edits.map(e => e.stage))];
    host.innerHTML = `
      <div class="aw-timeline" aria-hidden="true">${stages.map(s => `<span><b>stage ${s}</b></span>`).join('<i></i>')}</div>
      <div class="aw-grid">${d.edits.map(e => `
        <article class="aw-card aw-${e.kind}${e === d.edits[d.edits.length - 1] ? ' aw-final' : ''}">
          <header><span class="aw-stage">stage ${e.stage}</span><span class="aw-outcome">${esc(e.outcome)}</span></header>
          <h3>${esc(e.title)}</h3>
          <p>${esc(e.plain)}</p>
          ${code(e.code)}
          ${e.code2 ? `<p class="aw-then">Then:</p>${code(e.code2)}` : ''}
        </article>`).join('')}</div>
      <p class="plate-foot">${esc(d.session.programs + ' programs across stages ' + d.session.stages + '. ' + d.session.final)} Excerpts are lightly trimmed for reading.</p>`;
  }).catch(() => { host.innerHTML = '<p class="plate-foot">The edit record could not be loaded.</p>'; });
})();
