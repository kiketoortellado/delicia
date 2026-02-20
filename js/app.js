/**
 * app.js — Punto de entrada principal
 */
import { db, ref, get, onValue } from './firebase.js';
import Store                      from './state.js';
import { toast, setSyncOk }       from './ui.js';
import { loadSession, mostrarSegunRol, setupAdminInicial } from './auth.js';
import { renderMesas } from './mesas.js';
import { renderProductosAdmin }           from './productos.js';
import { renderHistorial }                from './historial.js';
import { renderActividad }                from './actividad.js';
import { renderUsersList }                from './usuarios.js';
import { renderCocina }                   from './cocina.js';

const _unsubscribers = [];

/* ── Normalizar mesas desde Firebase ───────── */
function normalizarMesas(raw) {
  const norm = {};
  if (!raw) return norm;
  if (Array.isArray(raw)) {
    raw.forEach((m, i) => { if (m) norm[i + 1] = m; });
  } else {
    Object.entries(raw).forEach(([k, v]) => {
      if (!v) return;
      const num = k.startsWith('mesa_') ? parseInt(k.replace('mesa_', '')) : parseInt(k);
      if (!isNaN(num)) norm[num] = v;
    });
  }
  return norm;
}

/* ── BOOT ───────────────────────────────────── */
async function boot() {
  const loadingEl = document.getElementById('loading-screen');
  if (loadingEl) loadingEl.style.display = 'flex';

  try {
    await setupAdminInicial();
    await cargarDatosIniciales();
    suscribirCambiosRealtime();
    setSyncOk(true);
    if (loadingEl) loadingEl.style.display = 'none';

    const saved = loadSession();
    if (saved) {
      const usuarios = Store.get('usuarios') || [];
      const valido   = saved.id === 'admin' || usuarios.find(u => u.id === saved.id);
      if (valido) {
        Store.set('sesion', saved);
        mostrarSegunRol();
      } else {
        localStorage.removeItem('delicias_sess_v4');
        mostrarLogin();
      }
    } else {
      mostrarLogin();
    }
  } catch (err) {
    console.error('Error de boot:', err);
    if (loadingEl) loadingEl.style.display = 'none';
    mostrarLogin();
    toast('⚠ Error de conexión con Firebase. Verificá tu internet.');
    setSyncOk(false);
  }
}

function mostrarLogin() {
  document.getElementById('login-screen')?.classList.add('show');
}

/* ── Carga inicial ──────────────────────────── */
async function cargarDatosIniciales() {
  const [mesasSnap, prodSnap, histSnap, usersSnap, actSnap] = await Promise.all([
    get(ref(db, 'mesas')),
    get(ref(db, 'productos')),
    get(ref(db, 'historial')),
    get(ref(db, 'usuarios')),
    get(ref(db, 'actividad'))
  ]);

  Store.set('mesas',     normalizarMesas(mesasSnap.val()));
  Store.set('productos', (() => { const r = prodSnap.val();  return r ? (Array.isArray(r) ? r : Object.values(r)) : []; })());
  Store.set('historial', (() => { const r = histSnap.val();  return r ? (Array.isArray(r) ? r : Object.values(r)) : []; })());
  Store.set('usuarios',  (() => { const r = usersSnap.val(); return r ? (Array.isArray(r) ? r : Object.values(r)).filter(Boolean) : []; })());
  Store.set('actividad', (() => { const r = actSnap.val();   return r ? (Array.isArray(r) ? r : Object.values(r)) : []; })());
}

/* ── Realtime ───────────────────────────────── */
function suscribirCambiosRealtime() {
  _unsubscribers.forEach(fn => fn());
  _unsubscribers.length = 0;

  _unsubscribers.push(
    onValue(ref(db, 'mesas'), snap => {
      Store.set('mesas', normalizarMesas(snap.val()));
      const sesion = Store.get('sesion');
      if (!sesion) return;
      if (sesion.role === 'cocinero') renderCocina();
      else renderMesas();
    }),
    onValue(ref(db, 'productos'), snap => {
      const r = snap.val();
      Store.set('productos', r ? (Array.isArray(r) ? r : Object.values(r)) : []);
      if (Store.get('sesion')?.role !== 'cocinero') renderProductosAdmin();
    }),
    onValue(ref(db, 'historial'), snap => {
      const r = snap.val();
      Store.set('historial', r ? (Array.isArray(r) ? r : Object.values(r)) : []);
      if (Store.get('sesion')?.role !== 'cocinero') renderHistorial();
    }),
    onValue(ref(db, 'usuarios'), snap => {
      const r = snap.val();
      Store.set('usuarios', r ? (Array.isArray(r) ? r : Object.values(r)).filter(Boolean) : []);
      if (Store.get('sesion')?.role === 'admin') renderUsersList();
    }),
    onValue(ref(db, 'actividad'), snap => {
      const r = snap.val();
      Store.set('actividad', r ? (Array.isArray(r) ? r : Object.values(r)) : []);
      if (Store.get('sesion')?.role === 'admin') renderActividad();
    })
  );
}

export function limpiarListeners() {
  _unsubscribers.forEach(fn => fn());
  _unsubscribers.length = 0;
}

/* ── PWA ────────────────────────────────────── */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

boot();
