/**
 * app.js — Punto de entrada principal
 *
 * Responsabilidades:
 *   1. Cargar datos iniciales de Firebase
 *   2. Suscribirse a cambios en tiempo real
 *   3. Restaurar sesión guardada
 *   4. Registrar Service Worker (PWA)
 */

import { db, ref, get, onValue }          from './firebase.js';
import Store                               from './state.js';
import { toast, setSyncOk }               from './ui.js';
import { loadSession, mostrarSegunRol, setupAdminInicial } from './auth.js';
import { renderMesas, actualizarTimers }   from './mesas.js';
import { renderProductosAdmin }            from './productos.js';
import { renderHistorial }                 from './historial.js';
import { renderActividad }                 from './actividad.js';
import { renderUsersList }                 from './usuarios.js';
import { renderCocina }                    from './cocina.js';

// Guardar referencias de listeners para cleanup al logout
const _unsubscribers = [];

/* ══════════════════════════════════════════════
   BOOT — Arranque de la aplicación
══════════════════════════════════════════════ */
async function boot() {
  const loadingEl = document.getElementById('loading-screen');
  if (loadingEl) loadingEl.style.display = 'flex';

  try {
    await setupAdminInicial();
    await cargarDatosIniciales();
    suscribirCambiosRealtime();
    setSyncOk(true);

    if (loadingEl) loadingEl.style.display = 'none';

    // Restaurar sesión
    const saved = loadSession();
    if (saved) {
      const usuarios = Store.get('usuarios') || [];
      const valido   = saved.id === 'admin' || usuarios.find(u => u.id === saved.id);
      if (valido) {
        Store.set('sesion', saved);
        mostrarSegunRol();
      } else {
        import('./auth.js').then(m => m.clearSession && m.clearSession());
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

  const mesas    = mesasSnap.val()   || {};
  const prods    = prodSnap.val()    || [];
  const hist     = histSnap.val()    || [];
  const usuarios = usersSnap.val()   || [];
  const actividad = actSnap.val()    || [];

  // Normalizar mesas: asegurar que sea objeto {1: {...}, 2: {...} ...}
  const mesasNorm = {};
  if (Array.isArray(mesas)) {
    mesas.forEach((m, i) => { if (m) mesasNorm[i + 1] = m; });
  } else {
    Object.assign(mesasNorm, mesas);
  }

  Store.set('mesas',     mesasNorm);
  Store.set('productos', Array.isArray(prods) ? prods : Object.values(prods));
  Store.set('historial', Array.isArray(hist)  ? hist  : Object.values(hist));
  Store.set('usuarios',  Array.isArray(usuarios) ? usuarios : Object.values(usuarios));
  Store.set('actividad', Array.isArray(actividad) ? actividad : Object.values(actividad));
}

/* ── Suscripciones realtime ─────────────────── */
function suscribirCambiosRealtime() {
  // Limpiar listeners previos
  _unsubscribers.forEach(fn => fn());
  _unsubscribers.length = 0;

  _unsubscribers.push(
    onValue(ref(db, 'mesas'), snap => {
      const raw = snap.val() || {};
      const mesasNorm = {};
      if (Array.isArray(raw)) {
        raw.forEach((m, i) => { if (m) mesasNorm[i + 1] = m; });
      } else {
        Object.assign(mesasNorm, raw);
      }
      Store.set('mesas', mesasNorm);
      const sesion = Store.get('sesion');
      if (!sesion) return;
      if (sesion.role === 'cocinero') renderCocina();
      else renderMesas();
    }),

    onValue(ref(db, 'productos'), snap => {
      const raw = snap.val() || [];
      Store.set('productos', Array.isArray(raw) ? raw : Object.values(raw));
      if (Store.get('sesion')?.role !== 'cocinero') renderProductosAdmin();
    }),

    onValue(ref(db, 'historial'), snap => {
      const raw = snap.val() || [];
      Store.set('historial', Array.isArray(raw) ? raw : Object.values(raw));
      if (Store.get('sesion')?.role !== 'cocinero') renderHistorial();
    }),

    onValue(ref(db, 'usuarios'), snap => {
      const raw = snap.val() || [];
      Store.set('usuarios', Array.isArray(raw) ? raw : Object.values(raw));
      if (Store.get('sesion')?.role === 'admin') renderUsersList();
    }),

    onValue(ref(db, 'actividad'), snap => {
      const raw = snap.val() || [];
      Store.set('actividad', Array.isArray(raw) ? raw : Object.values(raw));
      if (Store.get('sesion')?.role === 'admin') renderActividad();
    })
  );
}

/* Exportar para uso desde auth.js al logout */
export function limpiarListeners() {
  _unsubscribers.forEach(fn => fn());
  _unsubscribers.length = 0;
}

/* ══════════════════════════════════════════════
   PWA — Service Worker
══════════════════════════════════════════════ */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').then(reg => {
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        nw.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) {
            const b = document.createElement('div');
            b.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:var(--gold);color:var(--bg-deep);padding:12px 20px;border-radius:100px;z-index:9999;font-weight:700;font-size:0.85rem;cursor:pointer;box-shadow:0 4px 20px rgba(0,0,0,0.3);white-space:nowrap;';
            b.textContent = '🔄 Actualización disponible — Toca para recargar';
            b.onclick = () => location.reload();
            document.body.appendChild(b);
          }
        });
      });
    }).catch(() => {});
  });
}

/* ── Arrancar ───────────────────────────────── */
boot();
