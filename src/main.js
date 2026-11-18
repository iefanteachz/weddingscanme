// Keys come from .env (see .env.example). Vite exposes only VITE_* variables.
const URL_ = import.meta.env.VITE_SCRIPT_URL || '';
const CODE = import.meta.env.VITE_EVENT_CODE || '';
const COUPLE = import.meta.env.VITE_COUPLE || 'Irfan & Icha';
const EVENT_LINE = import.meta.env.VITE_EVENT_LINE || 'Majlis Bersanding';

// Edit the missions freely. Keep 5 photos first, then 1 video (the server expects slot 5 = video).
const MISSIONS = [
  { bm: 'Selfie bersama pengantin', en: 'Selfie with the couple', kind: 'photo' },
  { bm: 'Hidangan paling menyelerakan', en: 'The tastiest dish', kind: 'photo' },
  { bm: 'Gambar berkumpulan bersama kawan', en: 'Group shot with your friends', kind: 'photo' },
  { bm: 'Sudut pelamin paling cantik', en: 'Prettiest corner of the pelamin', kind: 'photo' },
  { bm: 'Gelagat paling kelakar', en: 'Funniest moment', kind: 'photo' },
  { bm: 'Video ucapan 10 saat untuk pengantin', en: '10-second video wish for the couple', kind: 'video' }
];
const MAX_VIDEO = 15 * 1024 * 1024, MAX_SIDE = 2000;

const $ = id => document.getElementById(id);
const store = {
  get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} }
};
let device = store.get('device');
if (!device) {
  device = (crypto.randomUUID ? crypto.randomUUID() : Date.now() + '' + Math.random().toString(16).slice(2)).replace(/[^a-zA-Z0-9-]/g, '');
  store.set('device', device);
}
const guestEl = $('guest');
guestEl.value = store.get('guestName') || '';
guestEl.addEventListener('input', () => { store.set('guestName', guestEl.value); guestEl.classList.remove('need'); $('nameMsg').hidden = true; });
$('title').textContent = COUPLE;
$('eventline').textContent = EVENT_LINE;
if (!URL_ || URL_.includes('PASTE')) $('warn').hidden = false;

const used = new Set();
const pending = {};

window.addEventListener('beforeunload', e => {
  if (Object.values(pending).some(p => p.state === 'up')) { e.preventDefault(); e.returnValue = ''; }
});

const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text) n.textContent = text; return n; };
const btn = (text, cls, fn) => { const b = el('button', cls, text); b.onclick = fn; return b; };

function media(p, m) {
  if (m.kind === 'video') { const v = el('video'); v.src = p.url; v.controls = true; v.playsInline = true; v.muted = true; return v; }
  const i = el('img'); i.src = p.url; i.alt = ''; return i;
}

function draw() {
  $('score').textContent = `${used.size} / ${MISSIONS.length} misi selesai / missions done`;
  $('bar').style.width = (used.size / MISSIONS.length * 100) + '%';
  const ol = $('missions'); ol.innerHTML = '';
  MISSIONS.forEach((m, i) => {
    const li = el('li', 'card'), p = pending[i], isV = m.kind === 'video';
    li.append(el('div', 'mt', `${i + 1}. ${m.bm}`), el('small', '', m.en));
    if (used.has(i)) {
      li.classList.add('done');
      if (p && p.url) li.append(media(p, m));
      li.append(el('div', 'ok', '✓ Dihantar / Sent'));
    } else if (p && p.state === 'up') {
      if (p.url) li.append(media(p, m));
      li.append(el('div', '', 'Memuat naik… / Uploading…'));
    } else {
      if (p && p.file) li.append(media(p, m));
      if (p && p.error) li.append(el('div', 'err', p.error));
      const row = el('div', 'row');
      if (p && p.file) {
        row.append(btn('Hantar / Send', 'primary', () => send(i)), btn('Ambil semula / Retake', 'secondary', () => pick(i)));
      } else {
        row.append(btn(isV ? 'Rakam video / Record video' : 'Ambil gambar / Take photo', 'primary', () => pick(i)));
      }
      li.append(row);
    }
    ol.append(li);
  });
  $('finish').hidden = used.size < MISSIONS.length;
  $('lock').hidden = used.size > 0;
  $('grid').hidden = $('refresh').hidden = used.size === 0;
}

function pick(i) {
  if (!guestEl.value.trim()) { guestEl.classList.add('need'); $('nameMsg').hidden = false; guestEl.focus(); return; }
  const isV = MISSIONS[i].kind === 'video';
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = isV ? 'video/*' : 'image/*'; inp.capture = isV ? 'user' : 'environment';
  inp.onchange = () => {
    const f = inp.files[0]; if (!f) return;
    if (pending[i] && pending[i].url) URL.revokeObjectURL(pending[i].url);
    if (isV && f.size > MAX_VIDEO) { pending[i] = { error: 'Video terlalu besar. Rakam sekitar 10 saat. / Video too large. Keep it to about 10 seconds.' }; }
    else pending[i] = { file: f, url: URL.createObjectURL(f), error: '' };
    draw();
  };
  inp.click();
}

function jpegB64(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file), im = new Image();
    im.onload = () => {
      const s = Math.min(1, MAX_SIDE / Math.max(im.width, im.height)), c = document.createElement('canvas');
      c.width = Math.round(im.width * s); c.height = Math.round(im.height * s);
      c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.85).split(',')[1]);
    };
    im.onerror = () => reject(new Error('Tidak dapat baca gambar / Could not read image'));
    im.src = url;
  });
}
const fileB64 = f => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result).split(',')[1]);
  r.onerror = () => rej(new Error('Could not read file'));
  r.readAsDataURL(f);
});

async function post(payload) {
  let last;
  for (let t = 1; t <= 3; t++) {
    try {
      const r = await fetch(URL_, { method: 'POST', body: JSON.stringify({ ...payload, device, guest: guestEl.value.trim(), code: CODE }) });
      const j = await r.json();
      if (j.ok) return j;
      last = Object.assign(new Error(j.error || 'Gagal / Failed'), { fatal: j.fatal, dup: j.dup });
      if (j.fatal) throw last;
    } catch (e) { last = e; if (e.fatal) throw e; }
    await new Promise(r => setTimeout(r, 1500 * t));
  }
  throw last;
}

async function send(i) {
  const p = pending[i], isV = MISSIONS[i].kind === 'video';
  p.state = 'up'; p.error = ''; draw();
  try {
    const data = isV ? await fileB64(p.file) : await jpegB64(p.file);
    await post({ action: 'submit', slot: i, mime: isV ? (p.file.type || 'video/mp4') : 'image/jpeg', data });
    used.add(i); p.state = 'done';
    draw(); loadWall();
  } catch (e) {
    if (e.dup) used.add(i);
    p.state = ''; p.error = 'Gagal / Failed: ' + (e.message || ''); draw();
  }
}

async function loadWall() {
  if (!used.size || !URL_) return;
  try {
    const j = await (await fetch(`${URL_}?action=list`)).json(), g = $('grid');
    g.innerHTML = '';
    (j.photos || []).forEach(x => {
      const a = el('a'); a.href = `https://drive.google.com/file/d/${x.id}/view`; a.target = '_blank'; a.rel = 'noopener';
      const im = new Image(); im.loading = 'lazy'; im.alt = ''; im.src = `https://drive.google.com/thumbnail?id=${x.id}&sz=w400`;
      a.append(im, el('span', '', (x.kind === 'video' ? '▶ ' : '') + x.guest));
      g.append(a);
    });
  } catch (e) {}
}
$('refresh').onclick = loadWall;
setInterval(() => { if (!document.hidden) loadWall(); }, 30000);

(async () => {
  if (URL_) {
    try { (await (await fetch(`${URL_}?action=me&device=${device}`)).json()).used.forEach(n => used.add(n)); } catch (e) {}
  }
  draw(); loadWall();
})();
