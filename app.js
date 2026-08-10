/* Istwa Ayiti — Phase 0 prototype
   Canvas 2D dot-field timeline · vanilla JS · no build step.
   Data: events.json (curated). Live content: Wikipedia REST summaries + HaitiPAM WordPress API. */
'use strict';

// ---------------------------------------------------------------- constants
const CATS = {
  pol: { label: 'Politics & Power',     color: '#5b8cff' },
  res: { label: 'Resistance & Liberty', color: '#ff4d5e' },
  cul: { label: 'Culture & Arts',       color: '#ffd166' },
  dis: { label: 'Disasters',            color: '#ff8c42' },
  eco: { label: 'Economy & Society',    color: '#3ddc97' },
  wor: { label: 'Diaspora & World',     color: '#b07cff' },
};
const ERAS = [
  { kr: 'Ayiti',       en: 'Before 1492',          from: -4200, to: 1492 },
  { kr: 'Panyòl',      en: 'Spanish Rule',         from: 1492,  to: 1625 },
  { kr: 'Sen Domeng',  en: 'Saint-Domingue',       from: 1625,  to: 1791 },
  { kr: 'Revolisyon',  en: 'The Revolution',       from: 1791,  to: 1805 },
  { kr: 'Fondatè',     en: 'Founders & Kingdoms',  from: 1804,  to: 1843 },
  { kr: '19yèm syèk',  en: 'The 19th Century',     from: 1843,  to: 1915 },
  { kr: 'Okipasyon',   en: 'US Occupation',        from: 1915,  to: 1934 },
  { kr: 'Duvalye',     en: 'Duvalier Era',         from: 1934,  to: 1986 },
  { kr: 'Demokrasi',   en: 'Democratic Era',       from: 1986,  to: 2010 },
  { kr: 'Jodi a',      en: '2010 – Today',         from: 2010,  to: 2027 },
];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const WIKI_UA = 'IstwaAyitiPrototype/0.1 (personal educational project)';
const PAM_API = 'https://public-api.wordpress.com/wp/v2/sites/haitipam.com';
const DOMAIN_MIN = -4500, DOMAIN_MAX = 2032, SPAN_MIN = 2, SPAN_MAX = 6600;
const PAD = 30, BUCKET = 13, GAP = 11;

// ---------------------------------------------------------------- state
const S = {
  events: [], t0: 1480, t1: 2030,
  cats: new Set(Object.keys(CATS)),
  visible: [], hover: null, selected: null,
  anim: null, vx: 0, dragging: false,
  pamPosts: null, W: 0, H: 0, MW: 0,
  pointers: new Map(), pinch: null, moved: 0,
};
const wikiCache = new Map();
const pamCache = new Map();

// ---------------------------------------------------------------- dom
const $ = (id) => document.getElementById(id);
const cv = $('cv'), ctx = cv.getContext('2d');
const mini = $('mini'), mctx = mini.getContext('2d');
const stage = $('stage'), tip = $('tip'), card = $('card'), cursorYear = $('cursor-year');
const panel = $('panel'), panelBody = $('panel-body'), backdrop = $('backdrop');

// ---------------------------------------------------------------- helpers
const eYear = (e) => e.y + (((e.m || 6) - 1) / 12) + ((e.d || 15) / 372);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const norm = (s) => (s || '').normalize('NFD').split('').filter((ch) => ch.charCodeAt(0) < 768 || ch.charCodeAt(0) > 879).join('').toLowerCase();
const fmtYear = (y) => (y < 0 ? `${-y} BCE` : `${y}`);
function fmtDate(e) {
  const c = e.c ? 'c. ' : '';
  if (e.d && e.m) return `${MONTHS[e.m - 1]} ${e.d}, ${fmtYear(e.y)}`;
  if (e.m) return `${MONTHS[e.m - 1]} ${fmtYear(e.y)}`;
  return c + fmtYear(e.y);
}
function eraOf(e) {
  const y = eYear(e);
  for (let i = ERAS.length - 1; i >= 0; i--) if (y >= ERAS[i].from) return ERAS[i];
  return ERAS[0];
}
function esc(s) { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }

function sanitize(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script,style,iframe,object,embed,link,meta,form,input,button').forEach(n => n.remove());
  doc.querySelectorAll('*').forEach(el => {
    [...el.attributes].forEach(a => {
      if (/^on/i.test(a.name)) el.removeAttribute(a.name);
      if (a.name === 'srcset') el.removeAttribute(a.name);
      if ((a.name === 'href' || a.name === 'src') && /^\s*javascript:/i.test(a.value)) el.removeAttribute(a.name);
    });
  });
  doc.querySelectorAll('a').forEach(a => { a.target = '_blank'; a.rel = 'noopener'; });
  return doc.body.innerHTML;
}

// ---------------------------------------------------------------- glow sprites
const SPRITES = {};
function makeSprite(color) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, color);
  grad.addColorStop(0.25, color + 'aa');
  grad.addColorStop(1, color + '00');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  return c;
}
for (const k of Object.keys(CATS)) SPRITES[k] = makeSprite(CATS[k].color);

// ---------------------------------------------------------------- sizing / layout
function resize() {
  const dpr = window.devicePixelRatio || 1;
  const r = stage.getBoundingClientRect();
  cv.width = Math.max(1, Math.round(r.width * dpr));
  cv.height = Math.max(1, Math.round(r.height * dpr));
  cv.style.width = r.width + 'px'; cv.style.height = r.height + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  S.W = r.width; S.H = r.height;
  const mr = mini.parentElement.getBoundingClientRect();
  mini.width = Math.max(1, Math.round(mr.width * dpr));
  mini.height = Math.round(30 * dpr);
  mini.style.width = mr.width + 'px'; mini.style.height = '30px';
  mctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  S.MW = mr.width;
  layout();
}
const tx = (y) => PAD + (y - S.t0) / (S.t1 - S.t0) * (S.W - PAD * 2);
const xToYear = (x) => S.t0 + (x - PAD) / (S.W - PAD * 2) * (S.t1 - S.t0);

function layout() {
  const buckets = new Map();
  S.visible = [];
  const baseY = S.H - 46;
  for (const e of S.events) {
    e._v = false;
    if (!S.cats.has(e.cat)) continue;
    const y = eYear(e);
    if (y < S.t0 || y > S.t1) continue;
    e._x = tx(y); e._v = true;
    const b = Math.round(e._x / BUCKET);
    (buckets.get(b) || buckets.set(b, []).get(b)).push(e);
    S.visible.push(e);
  }
  for (const arr of buckets.values()) {
    arr.sort((a, b) => a.r - b.r || eYear(b) - eYear(a)); // most important ends on top of the stack visually? place high-rating last (top)
    arr.forEach((e, i) => { e._y = baseY - i * GAP; });
  }
}

// ---------------------------------------------------------------- drawing
function tickStep() {
  const pxPerYear = (S.W - PAD * 2) / (S.t1 - S.t0);
  for (const s of [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000]) if (s * pxPerYear >= 82) return s;
  return 5000;
}
function draw(now) {
  ctx.clearRect(0, 0, S.W, S.H);
  const baseY = S.H - 46;

  // era boundaries (subtle)
  ctx.save();
  for (const era of ERAS) {
    if (era.from > S.t0 && era.from < S.t1) {
      const x = tx(era.from);
      ctx.strokeStyle = 'rgba(255,255,255,0.055)';
      ctx.beginPath(); ctx.moveTo(x, 12); ctx.lineTo(x, baseY); ctx.stroke();
    }
  }
  ctx.restore();

  // axis + ticks
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.beginPath(); ctx.moveTo(PAD - 12, baseY + 8); ctx.lineTo(S.W - PAD + 12, baseY + 8); ctx.stroke();
  const step = tickStep();
  const first = Math.ceil(S.t0 / step) * step;
  ctx.fillStyle = 'rgba(232,230,223,0.55)';
  ctx.font = '11px system-ui, sans-serif'; ctx.textAlign = 'center';
  for (let y = first; y <= S.t1; y += step) {
    const x = tx(y);
    ctx.fillRect(x - 0.5, baseY + 4, 1, 8);
    ctx.fillText(fmtYear(y), x, baseY + 26);
  }

  // dots
  for (const e of S.visible) {
    const tw = 0.72 + 0.28 * Math.sin(now * 0.0016 + (e._x * 12.9898 + e.y) % 6.283);
    const core = 2.6 + e.r * 0.85;
    const glow = core * 6.5;
    const hot = (e === S.hover || e === S.selected);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = (hot ? 0.95 : 0.5 * tw);
    ctx.drawImage(SPRITES[e.cat], e._x - glow / 2, e._y - glow / 2, glow, glow);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = hot ? 1 : (0.82 + 0.18 * tw);
    ctx.fillStyle = hot ? '#ffffff' : '#f3efe4';
    ctx.beginPath(); ctx.arc(e._x, e._y, hot ? core + 1.2 : core, 0, 6.283); ctx.fill();
    if (hot) {
      ctx.strokeStyle = CATS[e.cat].color; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(e._x, e._y, core + 5, 0, 6.283); ctx.stroke(); ctx.lineWidth = 1;
    }
  }
  ctx.globalAlpha = 1;

  // empty state
  if (S.visible.length < 3) {
    ctx.fillStyle = 'rgba(232,230,223,0.4)';
    ctx.font = '15px Georgia, serif'; ctx.textAlign = 'center';
    ctx.fillText('We know little about this stretch of time.', S.W / 2, S.H / 2 - 12);
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillText('Much of this era’s story is archaeological, oral, or lost.', S.W / 2, S.H / 2 + 12);
  }
  drawMini();
}
function drawMini() {
  const M0 = 1470, M1 = 2030, w = S.MW, h = 30;
  mctx.clearRect(0, 0, w, h);
  const mx = (y) => (y - M0) / (M1 - M0) * w;
  // density bars
  const cols = new Map();
  for (const e of S.events) {
    if (e.y < M0) continue;
    const c = Math.floor(mx(eYear(e)) / 3);
    cols.set(c, (cols.get(c) || 0) + 1);
  }
  mctx.fillStyle = 'rgba(255,209,102,0.5)';
  for (const [c, n] of cols) mctx.fillRect(c * 3, h - Math.min(h - 4, 3 + n * 3.4), 2, Math.min(h - 4, 3 + n * 3.4));
  // window
  const x0 = clamp(mx(S.t0), 0, w), x1 = clamp(mx(S.t1), 0, w);
  mctx.fillStyle = 'rgba(255,255,255,0.10)';
  mctx.fillRect(x0, 0, Math.max(3, x1 - x0), h);
  mctx.strokeStyle = 'rgba(255,255,255,0.45)';
  mctx.strokeRect(x0 + 0.5, 0.5, Math.max(3, x1 - x0) - 1, h - 1);
  if (S.t0 < M0) { mctx.fillStyle = 'rgba(255,255,255,0.6)'; mctx.fillText('◂', 4, 19); }
}

// ---------------------------------------------------------------- animation loop
let paused = false;
function frame(now) {
  if (!paused) {
    if ((S.W < 10 || S.H < 10) && stage.clientWidth > 10) resize(); // recover from 0-size init (hidden tab)
    if (S.anim) {
      const a = S.anim, t = clamp((now - a.start) / a.dur, 0, 1);
      const k = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      S.t0 = a.f0 + (a.g0 - a.f0) * k; S.t1 = a.f1 + (a.g1 - a.f1) * k;
      layout();
      if (t >= 1) S.anim = null;
    } else if (Math.abs(S.vx) > 0.01 && !S.dragging) {
      const dy = -S.vx * (S.t1 - S.t0) / (S.W - PAD * 2) * 16;
      panBy(dy); S.vx *= 0.93;
    }
    draw(now);
  }
  requestAnimationFrame(frame);
}
function panBy(dy) {
  const span = S.t1 - S.t0;
  let n0 = S.t0 + dy, n1 = S.t1 + dy;
  if (n0 < DOMAIN_MIN) { n0 = DOMAIN_MIN; n1 = n0 + span; }
  if (n1 > DOMAIN_MAX) { n1 = DOMAIN_MAX; n0 = n1 - span; }
  S.t0 = n0; S.t1 = n1; layout();
}
function zoomAt(px, factor) {
  const y = xToYear(px);
  let span = clamp((S.t1 - S.t0) * factor, SPAN_MIN, SPAN_MAX);
  const frac = (px - PAD) / (S.W - PAD * 2);
  let n0 = y - frac * span, n1 = n0 + span;
  if (n0 < DOMAIN_MIN) { n0 = DOMAIN_MIN; n1 = n0 + span; }
  if (n1 > DOMAIN_MAX) { n1 = DOMAIN_MAX; n0 = n1 - span; }
  S.t0 = n0; S.t1 = n1; layout();
}
function animateTo(a, b) {
  S.anim = { f0: S.t0, f1: S.t1, g0: a, g1: b, start: performance.now(), dur: 750 };
  S.vx = 0;
  updateEraRail(a, b);
}

// ---------------------------------------------------------------- picking / pointer
function pick(mx, my) {
  let best = null, bs = Infinity;
  for (const e of S.visible) {
    const dx = e._x - mx, dy = e._y - my, d = Math.hypot(dx, dy);
    if (d > 26) continue;
    const score = d - e.r * 2.4;
    if (score < bs) { bs = score; best = e; }
  }
  return best;
}
cv.addEventListener('pointerdown', (ev) => {
  try { cv.setPointerCapture(ev.pointerId); } catch (_) { /* synthetic or stale pointer */ }
  S.pointers.set(ev.pointerId, { x: ev.offsetX, y: ev.offsetY });
  if (S.pointers.size === 2) {
    const [p1, p2] = [...S.pointers.values()];
    S.pinch = { y1: xToYear(p1.x), y2: xToYear(p2.x) };
    S.anim = null;
  } else {
    S.dragging = true; S.moved = 0; S.vx = 0; S.anim = null;
    S._lastX = ev.offsetX; S._lastT = performance.now();
  }
});
cv.addEventListener('pointermove', (ev) => {
  const p = S.pointers.get(ev.pointerId);
  if (p) { p.x = ev.offsetX; p.y = ev.offsetY; }
  if (S.pointers.size === 2 && S.pinch) {
    const [p1, p2] = [...S.pointers.values()];
    if (Math.abs(p1.x - p2.x) > 12) {
      const plot = S.W - PAD * 2;
      let span = (S.pinch.y2 - S.pinch.y1) * plot / (p2.x - p1.x);
      if (isFinite(span)) {
        span = clamp(Math.abs(span), SPAN_MIN, SPAN_MAX) * Math.sign(span || 1);
        if (span > 0) {
          let n0 = S.pinch.y1 - (p1.x - PAD) / plot * span;
          S.t0 = clamp(n0, DOMAIN_MIN, DOMAIN_MAX - span); S.t1 = S.t0 + span; layout();
        }
      }
    }
    return;
  }
  if (S.dragging && S.pointers.size === 1) {
    const now = performance.now();
    const dx = ev.offsetX - S._lastX;
    S.moved += Math.abs(dx);
    const dy = -dx * (S.t1 - S.t0) / (S.W - PAD * 2);
    panBy(dy);
    S.vx = dx / Math.max(1, now - S._lastT) * 2.2;
    S._lastX = ev.offsetX; S._lastT = now;
    hideTip();
  } else if (ev.pointerType === 'mouse') {
    const e = pick(ev.offsetX, ev.offsetY);
    S.hover = e;
    cv.style.cursor = e ? 'pointer' : 'crosshair';
    if (e) showTip(e); else hideTip();
  }
  // cursor year readout
  if (ev.offsetX > PAD - 10 && ev.offsetX < S.W - PAD + 10) {
    cursorYear.style.display = 'block';
    cursorYear.style.left = ev.offsetX + 'px';
    cursorYear.textContent = fmtYear(Math.round(xToYear(ev.offsetX)));
  }
});
cv.addEventListener('pointerup', (ev) => {
  S.pointers.delete(ev.pointerId);
  if (S.pointers.size < 2) S.pinch = null;
  if (S.dragging && S.pointers.size === 0) {
    S.dragging = false;
    if (S.moved < 6) { // click, not drag
      const e = pick(ev.offsetX, ev.offsetY);
      if (e) openCard(e); else { closeCard(); }
      S.vx = 0;
    }
  }
});
cv.addEventListener('pointercancel', (ev) => { S.pointers.delete(ev.pointerId); S.pinch = null; S.dragging = false; });
cv.addEventListener('pointerleave', () => { S.hover = null; hideTip(); cursorYear.style.display = 'none'; });
cv.addEventListener('wheel', (ev) => { ev.preventDefault(); S.anim = null; zoomAt(ev.offsetX, Math.pow(1.0015, ev.deltaY)); }, { passive: false });
cv.addEventListener('dblclick', (ev) => zoomAt(ev.offsetX, 0.5));

// minimap interaction
function miniJump(ev) {
  const r = mini.getBoundingClientRect();
  const y = 1470 + (ev.clientX - r.left) / r.width * (2030 - 1470);
  const span = S.t1 - S.t0;
  animateTo(clamp(y - span / 2, DOMAIN_MIN, DOMAIN_MAX - span), clamp(y - span / 2, DOMAIN_MIN, DOMAIN_MAX - span) + span);
}
mini.addEventListener('pointerdown', (ev) => { mini.setPointerCapture(ev.pointerId); S._miniDrag = true; miniJump(ev); });
mini.addEventListener('pointermove', (ev) => { if (S._miniDrag) { S.anim = null; const r = mini.getBoundingClientRect(); const y = 1470 + (ev.clientX - r.left) / r.width * (2030 - 1470); const span = S.t1 - S.t0; S.t0 = clamp(y - span / 2, DOMAIN_MIN, DOMAIN_MAX - span); S.t1 = S.t0 + span; layout(); } });
mini.addEventListener('pointerup', () => { S._miniDrag = false; });

// ---------------------------------------------------------------- tooltip & card
function showTip(e) {
  tip.innerHTML = `<b>${esc(e.t)}</b><span>${esc(fmtDate(e))}</span>`;
  tip.style.display = 'block';
  const tw = tip.offsetWidth;
  tip.style.left = clamp(e._x - tw / 2, 6, S.W - tw - 6) + 'px';
  tip.style.top = Math.max(8, e._y - 54) + 'px';
}
function hideTip() { tip.style.display = 'none'; }

function openCard(e) {
  S.selected = e;
  const era = eraOf(e);
  const hasPam = !!e._pam;
  card.innerHTML = `
    <button class="x" id="card-x" aria-label="Close">×</button>
    <div class="thumb" id="card-thumb"></div>
    <div class="card-body">
      <div class="kicker"><span class="dot" style="background:${CATS[e.cat].color}"></span>${esc(CATS[e.cat].label)} · ${esc(era.en)}</div>
      <div class="date">${esc(fmtDate(e))}</div>
      <h3>${esc(e.t)}</h3>
      <p>${esc(e.b)}</p>
      <div class="actions">
        <button class="btn primary" id="card-read">Read the story</button>
        ${e.wiki ? `<a class="btn" href="https://en.wikipedia.org/wiki/${encodeURIComponent(e.wiki)}" target="_blank" rel="noopener">Wikipedia ↗</a>` : ''}
      </div>
      ${hasPam ? `<div class="pam-badge">★ Full HaitiPAM article available</div>` : ''}
    </div>`;
  card.style.display = 'block';
  positionCard(e);
  $('card-read').addEventListener('click', () => openPanel(e));
  $('card-x').addEventListener('click', closeCard);
  if (e.wiki) {
    fetchWiki(e.wiki).then(s => {
      if (S.selected !== e || !s) return;
      const th = $('card-thumb');
      if (th && s.thumbnail && s.thumbnail.source) {
        th.style.backgroundImage = `url("${s.thumbnail.source}")`;
        th.classList.add('has-img');
        positionCard(e);
      }
    });
  }
}
function positionCard(e) {
  if (window.innerWidth <= 720) { card.classList.add('sheet'); return; }
  card.classList.remove('sheet');
  const cw = card.offsetWidth, ch = card.offsetHeight;
  card.style.left = clamp(e._x + 16, 8, S.W - cw - 8) + 'px';
  card.style.top = clamp(e._y - ch - 16, 62, S.H - ch - 8) + 'px';
}
function closeCard() { card.style.display = 'none'; if (!panel.classList.contains('open')) S.selected = null; }

// ---------------------------------------------------------------- reader panel
function sortedFiltered() { return S.events.filter(e => S.cats.has(e.cat)).sort((a, b) => eYear(a) - eYear(b)); }

async function openPanel(e) {
  closeCard(); hideTip();
  S.selected = e;
  panel.classList.add('open'); backdrop.classList.add('on');
  document.body.classList.add('no-scroll');
  const era = eraOf(e);
  panelBody.innerHTML = `
    <div class="kicker"><span class="dot" style="background:${CATS[e.cat].color}"></span>${esc(CATS[e.cat].label)} · ${esc(era.en)}</div>
    <div class="date">${esc(fmtDate(e))}</div>
    <h1>${esc(e.t)}</h1>
    <p class="lede">${esc(e.b)}</p>
    <div id="panel-content"><div class="loading">Loading…</div></div>`;
  const slot = $('panel-content');

  if (e._pam) {
    const post = await fetchPamContent(e._pam.id);
    if (S.selected !== e) return;
    if (post) {
      slot.innerHTML = `
        <div class="pam-note">★ From <b>HaitiPAM</b> — <a href="${esc(e._pam.link)}" target="_blank" rel="noopener">original post ↗</a></div>
        <article class="article">${post}</article>`;
      return;
    }
  }
  if (e.wiki) {
    const s = await fetchWiki(e.wiki);
    if (S.selected !== e) return;
    if (s && (s.extract_html || s.extract)) {
      const img = (s.thumbnail && s.thumbnail.source) ? `<img class="wiki-img" src="${s.thumbnail.source}" alt="">` : '';
      slot.innerHTML = `
        ${img}
        <div class="wiki-extract">${s.extract_html || `<p>${esc(s.extract)}</p>`}</div>
        <a class="btn wide" href="${s.content_urls && s.content_urls.desktop ? s.content_urls.desktop.page : 'https://en.wikipedia.org/wiki/' + encodeURIComponent(e.wiki)}" target="_blank" rel="noopener">Read the full article on Wikipedia ↗</a>
        <div class="attribution">Summary from the Wikipedia article
          “<a href="https://en.wikipedia.org/wiki/${encodeURIComponent(e.wiki)}" target="_blank" rel="noopener">${esc((s.titles && s.titles.normalized) || e.wiki.replace(/_/g, ' '))}</a>”,
          licensed <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener">CC BY-SA 4.0</a> (excerpt).</div>`;
      return;
    }
  }
  slot.innerHTML = `<p class="muted">Full sourced story coming in Phase 1 of this project.</p>`;
}
function closePanel() {
  panel.classList.remove('open'); backdrop.classList.remove('on');
  document.body.classList.remove('no-scroll');
  S.selected = null;
}
backdrop.addEventListener('click', closePanel);
$('panel-x').addEventListener('click', closePanel);
$('panel-prev').addEventListener('click', () => stepEvent(-1));
$('panel-next').addEventListener('click', () => stepEvent(1));
function stepEvent(dir) {
  if (!S.selected) return;
  const list = sortedFiltered();
  const i = list.indexOf(S.selected);
  const n = list[i + dir];
  if (n) {
    const span = S.t1 - S.t0, y = eYear(n);
    if (y < S.t0 || y > S.t1) animateTo(clamp(y - span / 2, DOMAIN_MIN, DOMAIN_MAX - span), clamp(y - span / 2, DOMAIN_MIN, DOMAIN_MAX - span) + span);
    openPanel(n);
  }
}
document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape') { closePanel(); closeCard(); }
  if (panel.classList.contains('open')) {
    if (ev.key === 'ArrowRight') stepEvent(1);
    if (ev.key === 'ArrowLeft') stepEvent(-1);
  }
});

// ---------------------------------------------------------------- data fetchers
function fetchWiki(slug) {
  if (wikiCache.has(slug)) return wikiCache.get(slug);
  const p = fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(slug)}`, {
    headers: { 'Api-User-Agent': WIKI_UA, 'Accept': 'application/json' },
  }).then(r => (r.ok ? r.json() : null)).catch(() => null);
  wikiCache.set(slug, p);
  return p;
}
async function fetchPamContent(id) {
  if (pamCache.has(id)) return pamCache.get(id);
  try {
    const r = await fetch(`${PAM_API}/posts/${id}?_fields=title,date,link,content`);
    if (!r.ok) throw 0;
    const j = await r.json();
    const html = sanitize(j.content && j.content.rendered || '');
    pamCache.set(id, html);
    return html;
  } catch { pamCache.set(id, null); return null; }
}
async function loadPam() {
  try {
    const r = await fetch(`${PAM_API}/posts?per_page=50&_fields=id,link,title`);
    if (!r.ok) throw 0;
    S.pamPosts = await r.json();
    let matched = 0;
    for (const e of S.events) {
      if (!e.pam) continue;
      const alts = e.pam.split('|').map(norm);
      e._pam = S.pamPosts.find(p => { const t = norm(p.title && p.title.rendered); return alts.some(a => a && t.includes(a)); }) || null;
      if (e._pam) matched++;
    }
    const el = $('pam-status');
    if (el) el.textContent = `· ${matched} HaitiPAM articles linked`;
  } catch { S.pamPosts = null; }
}

// ---------------------------------------------------------------- ui build
function buildChips() {
  const wrap = $('chips');
  const all = document.createElement('button');
  all.className = 'chip active'; all.id = 'chip-all'; all.textContent = 'All';
  all.addEventListener('click', () => {
    S.cats = new Set(Object.keys(CATS));
    document.querySelectorAll('#chips .chip').forEach(c => c.classList.add('active'));
    layout();
  });
  wrap.appendChild(all);
  for (const [k, c] of Object.entries(CATS)) {
    const b = document.createElement('button');
    b.className = 'chip active'; b.dataset.cat = k;
    b.innerHTML = `<span class="dot" style="background:${c.color}"></span>${c.label}`;
    b.addEventListener('click', () => {
      const allActive = S.cats.size === Object.keys(CATS).length;
      if (allActive) { S.cats = new Set([k]); }
      else if (S.cats.has(k) && S.cats.size === 1) { S.cats = new Set(Object.keys(CATS)); }
      else if (S.cats.has(k)) S.cats.delete(k); else S.cats.add(k);
      document.querySelectorAll('#chips .chip[data-cat]').forEach(c2 => c2.classList.toggle('active', S.cats.has(c2.dataset.cat)));
      $('chip-all').classList.toggle('active', S.cats.size === Object.keys(CATS).length);
      layout();
    });
    wrap.appendChild(b);
  }
}
function buildEraRail() {
  const rail = $('eras');
  ERAS.forEach((era, i) => {
    const b = document.createElement('button');
    b.className = 'era'; b.dataset.i = i;
    b.innerHTML = `<b>${era.en}</b><span>${era.kr}</span>`;
    b.addEventListener('click', () => animateTo(era.from, era.to));
    rail.appendChild(b);
  });
}
function updateEraRail(a, b) {
  document.querySelectorAll('#eras .era').forEach(el => {
    const era = ERAS[+el.dataset.i];
    el.classList.toggle('active', Math.abs(era.from - a) < 2 && Math.abs(era.to - b) < 2);
  });
}
$('lucky').addEventListener('click', () => {
  const list = sortedFiltered();
  const e = list[Math.floor(Math.random() * list.length)];
  if (!e) return;
  const span = Math.min(Math.max(30, (S.t1 - S.t0)), 120);
  const y = eYear(e);
  animateTo(clamp(y - span / 2, DOMAIN_MIN, DOMAIN_MAX - span), clamp(y - span / 2, DOMAIN_MIN, DOMAIN_MAX - span) + span);
  setTimeout(() => openPanel(e), 780);
});
$('hint-x').addEventListener('click', () => $('hint').remove());

// ---------------------------------------------------------------- init
async function init() {
  try {
    const r = await fetch('events.json');
    const data = await r.json();
    S.events = data.events;
  } catch (err) {
    $('count').textContent = 'Could not load events.json — serve this folder over HTTP.';
    return;
  }
  $('count').textContent = `${S.events.length} moments in time`;
  buildChips(); buildEraRail();
  resize();
  updateEraRail(S.t0, S.t1);
  requestAnimationFrame(frame);
  loadPam().then(() => { // resolve HaitiPAM matches, then honor ?open= deep links
    const deepLink = new URLSearchParams(location.search).get('open');
    if (!deepLink) return;
    const target = S.events.find(ev => norm(ev.t).includes(norm(deepLink)));
    if (target) { const hint = $('hint'); if (hint) hint.remove(); openPanel(target); }
  });
}
window.addEventListener('resize', resize);
if (window.ResizeObserver) {
  new ResizeObserver(() => {
    if (stage.clientWidth && (Math.abs(stage.clientWidth - S.W) > 1 || Math.abs(stage.clientHeight - S.H) > 1)) resize();
  }).observe(stage);
}
document.addEventListener('visibilitychange', () => { paused = document.hidden; if (!document.hidden) resize(); });
window.__istwa = S; // debug handle
init();
