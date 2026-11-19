// Keys come from .env (see .env.example). Vite exposes only VITE_* variables.
const URL_ = import.meta.env.VITE_SCRIPT_URL || '';
const CODE = import.meta.env.VITE_EVENT_CODE || '';
const COUPLE = import.meta.env.VITE_COUPLE || 'Irfan & Aisyah';
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
const MAX_VIDEO = 30 * 1024 * 1024, MAX_SECONDS = 10, MAX_SIDE = 2000;

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

// ---- Loading screen -> intro page -> game ----
const seen = (() => { try { return sessionStorage.getItem('intro') === '1'; } catch (e) { return false; } })();
$('mono').textContent = COUPLE.split('&').map(n => n.trim().charAt(0)).join(' & ');
$('introNames').textContent = COUPLE;
$('introEvent').textContent = EVENT_LINE;
function enter() { document.body.classList.remove('locked'); $('intro').hidden = true; window.scrollTo(0, 0); }
$('startBtn').onclick = () => { try { sessionStorage.setItem('intro', '1'); } catch (e) {} enter(); };
Promise.all([
  Promise.race([document.fonts ? document.fonts.ready : 0, new Promise(r => setTimeout(r, 3000))]),
  new Promise(r => setTimeout(r, 1600)),
  new Promise(r => document.readyState === 'complete' ? r() : window.addEventListener('load', r))
]).then(() => {
  const L = $('loader'); L.classList.add('out');
  setTimeout(() => { L.remove(); if (seen) enter(); else $('intro').hidden = false; }, 500);
});
if (!URL_ || URL_.includes('PASTE')) $('warn').hidden = false;

const used = new Set();
const pending = {};

window.addEventListener('beforeunload', e => {
  if (Object.values(pending).some(p => p.state === 'up')) { e.preventDefault(); e.returnValue = ''; }
});

const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text) n.textContent = text; return n; };
const btn = (text, cls, fn) => { const b = el('button', cls, text); b.onclick = fn; return b; };

// ---- In-page video recorder: stops by itself at MAX_SECONDS ----
const RECORDER_OK = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
const css = document.createElement('style');
css.textContent = `.rec{position:fixed;inset:0;z-index:50;background:#000;color:#fff;display:flex;flex-direction:column;gap:12px;padding:calc(12px + env(safe-area-inset-top)) 16px calc(16px + env(safe-area-inset-bottom))}
.rec video{flex:1;min-height:0;width:100%;object-fit:cover;border-radius:12px;background:#111;transform:scaleX(-1)}
.rtime{text-align:center;font-weight:700;font-size:1.3rem}.rhint{text-align:center;color:#bbb;font-size:.9rem}
.rbar{height:8px;background:#333;border-radius:4px;overflow:hidden}.rbar i{display:block;height:100%;width:0;background:#D4AE5A}
.rec .secondary{color:#fff;border-color:#fff}`;
document.head.append(css);

function pickMime() {
  return ['video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp8,opus', 'video/webm']
    .find(t => MediaRecorder.isTypeSupported(t)) || '';
}

function recordVideo(i) {
  return navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: true })
    .then(stream => openRecorder(i, stream), () => nativePick(i)); // permission denied -> normal camera picker
}

function openRecorder(i, stream) {
  const type = pickMime();
  const ov = el('div', 'rec'), v = el('video');
  v.srcObject = stream; v.muted = true; v.playsInline = true; v.autoplay = true;
  const time = el('div', 'rtime', `0 / ${MAX_SECONDS} s`);
  const fill = el('i'), track = el('div', 'rbar'); track.append(fill);
  const hint = el('div', 'rhint', `Berhenti sendiri selepas ${MAX_SECONDS} saat / Stops automatically after ${MAX_SECONDS} seconds`);
  let rec, timer, t0, cancelled = false;
  const chunks = [];
  const close = () => { clearInterval(timer); stream.getTracks().forEach(t => t.stop()); ov.remove(); };
  const finish = () => {
    close();
    if (cancelled) return;
    const mime = (rec.mimeType || type || 'video/webm').split(';')[0];
    const f = new File([new Blob(chunks, { type: mime })], 'wish.' + (mime.includes('mp4') ? 'mp4' : 'webm'), { type: mime });
    if (pending[i] && pending[i].url) URL.revokeObjectURL(pending[i].url);
    pending[i] = { file: f, url: URL.createObjectURL(f), error: '' };
    draw();
  };
  const start = () => {
    rec = new MediaRecorder(stream, Object.assign({ videoBitsPerSecond: 2500000 }, type ? { mimeType: type } : {}));
    rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    rec.onstop = finish;
    rec.start(); t0 = Date.now();
    go.hidden = true; stopB.hidden = false;
    timer = setInterval(() => {
      const s = (Date.now() - t0) / 1000;
      time.textContent = `${Math.min(MAX_SECONDS, Math.floor(s))} / ${MAX_SECONDS} s`;
      fill.style.width = Math.min(100, s / MAX_SECONDS * 100) + '%';
      if (s >= MAX_SECONDS && rec.state === 'recording') rec.stop(); // forced stop
    }, 100);
  };
  const go = btn('Mula rakam / Start', 'primary', start);
  const stopB = btn('Berhenti / Stop', 'primary', () => { if (rec && rec.state === 'recording') rec.stop(); });
  stopB.hidden = true;
  const cancel = btn('Batal / Cancel', 'secondary', () => {
    cancelled = true;
    if (rec && rec.state === 'recording') rec.stop(); else close();
  });
  const row = el('div', 'row'); row.append(go, stopB, cancel);
  ov.append(v, time, track, hint, row);
  document.body.append(ov);
}

const CAMERA_ICON = '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l1.6-2.4h6.8L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.6"/></svg>';
const VIDEO_ICON = '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="6" width="12" height="12" rx="2"/><path d="M15 10.5l6-3v9l-6-3"/></svg>';
function iconBtn(svg, label, fn) {
  const b = el('button', 'primary iconbtn');
  b.innerHTML = svg; b.setAttribute('aria-label', label); b.title = label; b.onclick = fn;
  return b;
}

function media(p, m) {
  if (m.kind === 'video') { const v = el('video'); v.src = p.url; v.controls = true; v.playsInline = true; v.muted = true; return v; }
  const i = el('img'); i.src = p.url; i.alt = ''; return i;
}

const unlocked = () => used.size > 0 || store.get('played') === '1';

function draw() {
  $('score').textContent = `${used.size} / ${MISSIONS.length} misi selesai / missions done`;
  $('bar').style.width = (used.size / MISSIONS.length * 100) + '%';
  const ol = $('missions'); ol.innerHTML = '';
  MISSIONS.forEach((m, i) => {
    const li = el('li', 'card'), p = pending[i], isV = m.kind === 'video';
    li.append(el('div', 'mt', `${i + 1}. ${m.bm}`), el('small', '', m.en));
    if (p && p.state === 'up') {
      if (p.url) li.append(media(p, m));
      li.append(el('div', '', 'Memuat naik… / Uploading…'));
    } else if (used.has(i) && !(p && !p.sent)) {
      li.classList.add('done');
      if (p && p.url) li.append(media(p, m));
      li.append(el('div', 'ok', '✓ Dihantar / Sent'));
      const again = el('div', 'row'); again.append(btn('Hantar lagi / Send another', 'secondary', () => pick(i)));
      li.append(again);
    } else {
      if (p && p.file) li.append(media(p, m));
      if (p && p.error) li.append(el('div', 'err', p.error));
      const row = el('div', 'row');
      if (p && p.file) {
        row.append(btn('Hantar / Send', 'primary', () => send(i)), btn('Ambil semula / Retake', 'secondary', () => pick(i)));
      } else {
        row.append(iconBtn(isV ? VIDEO_ICON : CAMERA_ICON, isV ? 'Rakam video / Record video' : 'Ambil gambar / Take photo', () => pick(i)));
      }
      li.append(row);
    }
    ol.append(li);
  });
  $('finish').hidden = used.size < MISSIONS.length;
  $('lock').hidden = unlocked();
  $('grid').hidden = $('refresh').hidden = !unlocked();
}

function videoSeconds(file) {
  return new Promise(resolve => {
    const v = document.createElement('video'), u = URL.createObjectURL(file);
    v.preload = 'metadata';
    v.onloadedmetadata = () => { URL.revokeObjectURL(u); resolve(v.duration); };
    v.onerror = () => { URL.revokeObjectURL(u); resolve(NaN); };
    v.src = u;
  });
}

function pick(i) {
  if (!guestEl.value.trim()) { guestEl.classList.add('need'); $('nameMsg').hidden = false; guestEl.focus(); return; }
  if (MISSIONS[i].kind === 'video' && RECORDER_OK) return recordVideo(i);
  nativePick(i);
}

function nativePick(i) {
  const isV = MISSIONS[i].kind === 'video';
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = isV ? 'video/*' : 'image/*'; inp.capture = isV ? 'user' : 'environment';
  inp.onchange = async () => {
    const f = inp.files[0]; if (!f) return;
    if (pending[i] && pending[i].url) URL.revokeObjectURL(pending[i].url);
    if (isV) {
      const sec = await videoSeconds(f);
      if (sec > MAX_SECONDS + 0.5) {
        pending[i] = { error: `Video ${Math.round(sec)} saat. Maksimum ${MAX_SECONDS} saat. / Video is ${Math.round(sec)} seconds. Maximum is ${MAX_SECONDS}.` };
        draw(); return;
      }
      if (f.size > MAX_VIDEO) {
        pending[i] = { error: 'Video terlalu besar. Guna kualiti 1080p. / Video too large. Use 1080p quality, not 4K.' };
        draw(); return;
      }
    }
    pending[i] = { file: f, url: URL.createObjectURL(f), error: '' };
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
    used.add(i); p.state = 'done'; p.sent = true; store.set('played', '1');
    draw(); loadWall();
  } catch (e) {
    if (e.dup) used.add(i);
    p.state = ''; p.error = 'Gagal / Failed: ' + (e.message || ''); draw();
  }
}

async function loadWall() {
  if (!unlocked() || !URL_) return;
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

draw(); loadWall();
