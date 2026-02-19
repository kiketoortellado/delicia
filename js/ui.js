/**
 * ui.js — Helpers de interfaz de usuario
 * Toast, DOM helpers, tabs, sincronización visual
 */

export const CURRENCY = 'Gs.';
export const TZ       = 'America/Asuncion';

/* ── DOM helpers ────────────────────────────── */
export const getEl   = id  => document.getElementById(id);
export const qs      = (sel, ctx = document) => ctx.querySelector(sel);
export const qsAll   = (sel, ctx = document) => ctx.querySelectorAll(sel);
export const html    = (id, h) => { const e = getEl(id); if (e) e.innerHTML = h; };
export const show    = el => { if (typeof el === 'string') el = getEl(el); if (el) el.classList.remove('hidden'); };
export const hide    = el => { if (typeof el === 'string') el = getEl(el); if (el) el.classList.add('hidden'); };
export const setText = (id, txt) => { const e = getEl(id); if (e) e.textContent = txt; };

// Compatibilidad con código legado
window.$ = getEl;

/* ── Formato de moneda ──────────────────────── */
export const fmt = n => `${CURRENCY} ${Math.round(n).toLocaleString('es-PY')}`;

/* ── Fechas / horas ─────────────────────────── */
export const hora = () =>
  new Date().toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit', timeZone: TZ });

export const fechaHora = () =>
  new Date().toLocaleString('es-PY', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: TZ
  });

export const fechaHoy = () =>
  new Date()
    .toLocaleDateString('es-PY', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: TZ })
    .split('/')
    .reverse()
    .join('-');  // dd/mm/yyyy → yyyy-mm-dd

/* ── Toast ──────────────────────────────────── */
let _toastTimer = null;
export function toast(msg, duration = 3000) {
  // Remover toast previo si existe
  const prev = document.querySelector('.toast');
  if (prev) prev.remove();
  if (_toastTimer) clearTimeout(_toastTimer);

  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<span>${msg}</span>`;
  document.body.appendChild(el);

  _toastTimer = setTimeout(() => {
    el.style.animation = 'toastSlide 0.3s ease reverse';
    setTimeout(() => el.remove(), 300);
  }, duration);
}

/* ── Sync indicator ─────────────────────────── */
export function setSyncOk(ok) {
  const dot = getEl('sync-dot');
  const txt = getEl('sync-txt');
  if (dot) dot.classList.toggle('offline', !ok);
  if (txt) txt.textContent = ok ? 'En línea' : 'Sin conexión';
}

/* ── Tabs ───────────────────────────────────── */
const TAB_IDS = ['mesas', 'productos', 'historial', 'admin'];

export function setTab(tab) {
  TAB_IDS.forEach(t => {
    const el = getEl(`tab-${t}`);
    if (el) el.classList.toggle('hidden', t !== tab);
  });
  // Desktop tabs
  qsAll('.tab').forEach(t =>
    t.classList.toggle('active', t.dataset.tab === tab)
  );
  // Mobile nav
  qsAll('.bnav-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === tab)
  );
}

// Exponer globalmente para los onclick inline en el HTML
window.setTab = (tab, el) => {
  qsAll('.tab').forEach(t => t.classList.remove('active'));
  if (el) el.classList.add('active');
  setTab(tab);
};
window.setTabMobile = (tab, el) => {
  qsAll('.bnav-btn').forEach(b => b.classList.remove('active'));
  if (el) el.classList.add('active');
  setTab(tab);
};

/* ── Offline/Online banner ──────────────────── */
let _offlineBanner = null;

window.addEventListener('online', () => {
  if (_offlineBanner) { _offlineBanner.remove(); _offlineBanner = null; }
  toast('✅ Conexión restaurada');
  setSyncOk(true);
});

window.addEventListener('offline', () => {
  if (_offlineBanner) return;
  _offlineBanner = document.createElement('div');
  _offlineBanner.style.cssText =
    'position:fixed;top:0;left:0;right:0;background:#c0392b;color:#fff;text-align:center;padding:10px;z-index:9999;font-size:0.9rem;font-weight:700;';
  _offlineBanner.textContent = '📵 Sin conexión — Los cambios se guardarán al reconectar';
  document.body.appendChild(_offlineBanner);
  setSyncOk(false);
});
