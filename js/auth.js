/**
 * auth.js — Sesión, Login, Logout, Roles
 */
import Store from './state.js';
import { getEl, hide, show, setText, toast } from './ui.js';
import { db, ref, set, onDisconnect } from './firebase.js';

const SESSION_KEY = 'delicias_sess_v4';
const MASTER      = { id: 'admin', username: 'ADMIN', nombre: 'Administrador', role: 'admin' };

/* ── Persistencia de sesión ─────────────────── */
export const saveSession  = s  => localStorage.setItem(SESSION_KEY, JSON.stringify(s));
export const loadSession  = () => { try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; } };
export const clearSession = () => localStorage.removeItem(SESSION_KEY);

/* ── Login ──────────────────────────────────── */
export async function doLogin() {
  const username = getEl('inp-user').value.trim().toUpperCase();
  const password = getEl('inp-pass').value;
  const errEl    = getEl('login-err');
  if (errEl) errEl.textContent = '';

  if (!username || !password) {
    if (errEl) errEl.textContent = 'Completa usuario y contraseña.';
    return;
  }

  // Comprobar usuario master (hardcoded solo en memoria)
  // ⚠️  Para producción real usa Firebase Auth
  const ADMIN_PASS = window.ENV?.ADMIN_PASSWORD || 'admin123';
  if (username === 'ADMIN' && password === ADMIN_PASS) {
    const sesion = { ...MASTER };
    Store.set('sesion', sesion);
    saveSession(sesion);
    mostrarSegunRol();
    return;
  }

  // Buscar en usuarios dinámicos
  const usuarios = Store.get('usuarios') || [];
  const u = usuarios.find(
    u => u.username.toUpperCase() === username && u.password === password
  );

  if (!u) {
    if (errEl) errEl.textContent = '❌ Usuario o contraseña incorrectos.';
    return;
  }

  Store.set('sesion', u);
  saveSession(u);
  mostrarSegunRol();
}

/* ── Logout ─────────────────────────────────── */
export async function doLogout() {
  await quitarPresencia();
  clearSession();
  Store.set('sesion', null);
  mostrarLogin();
}

/* ── Routing por rol ────────────────────────── */
export function mostrarSegunRol() {
  const sesion = Store.get('sesion');
  if (!sesion) { mostrarLogin(); return; }

  ocultarLogin();
  if (sesion.role === 'cocinero') {
    hide('app');
    import('./cocina.js').then(m => m.mostrarCocina());
  } else {
    getEl('cocina-app')?.classList.remove('show');
    mostrarApp();
  }
}

function mostrarLogin() {
  getEl('login-screen')?.classList.add('show');
  hide('app');
  getEl('cocina-app')?.classList.remove('show');
}
function ocultarLogin() {
  getEl('login-screen')?.classList.remove('show');
}

function mostrarApp() {
  const sesion = Store.get('sesion');
  show('app');
  setText('header-username', sesion.nombre || sesion.username);

  const roleEl = getEl('header-role');
  if (roleEl) {
    roleEl.textContent = sesion.role === 'admin' ? 'Admin' : 'Mesero';
    roleEl.className   = 'role-badge ' + (sesion.role === 'admin' ? 'admin' : 'mesero');
  }

  const fechaEl = getEl('fecha-lbl');
  if (fechaEl) {
    fechaEl.textContent = new Date().toLocaleDateString('es-PY', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      timeZone: 'America/Asuncion'
    });
  }

  const isAdmin = sesion.role === 'admin';
  getEl('tab-admin-btn')?.classList.toggle('hidden', !isAdmin);
  const btnLimpiar = getEl('btn-limpiar-wrap');
  if (btnLimpiar) btnLimpiar.style.display = isAdmin ? 'block' : 'none';
  const btnCierre  = getEl('btn-cierre');
  if (btnCierre)  btnCierre.style.display  = isAdmin ? 'flex' : 'none';
  const addProd    = getEl('add-prod-wrap');
  if (addProd)    addProd.style.display    = isAdmin ? '' : 'none';
  const bnavAdmin  = getEl('bnav-admin');
  if (bnavAdmin)  bnavAdmin.classList.toggle('hidden', !isAdmin);

  const inp = getEl('inp-mesero');
  if (inp) inp.value = sesion.nombre || sesion.username;

  // Lazy-import de módulos funcionales
  Promise.all([
    import('./mesas.js'),
    import('./productos.js'),
    import('./historial.js'),
    import('./actividad.js')
  ]).then(([mesas, prods, hist, act]) => {
    mesas.renderMesas();
    prods.renderProductosAdmin();
    hist.renderHistorial();
    mesas.iniciarTimers();
    act.registrarActividad('accion-login', 'Ingresó al sistema');
  });

  registrarPresencia();
}

/* ── Presencia Firebase ─────────────────────── */
export async function registrarPresencia() {
  const sesion = Store.get('sesion');
  if (!sesion) return;
  const presRef = ref(db, `presencia/${sesion.username}`);
  try {
    await set(presRef, { online: true, nombre: sesion.nombre || sesion.username, rol: sesion.role, desde: Date.now() });
    await onDisconnect(presRef).remove();
  } catch (e) {
    console.warn('Presencia no disponible:', e);
  }
}

export async function quitarPresencia() {
  const sesion = Store.get('sesion');
  if (!sesion) return;
  try { await set(ref(db, `presencia/${sesion.username}`), null); } catch {}
}

/* ── Exponer globalmente para onclick en HTML ── */
window.doLogin   = doLogin;
window.doLogout  = doLogout;

// Enter en login
document.addEventListener('DOMContentLoaded', () => {
  const inp = getEl('inp-pass');
  if (inp) inp.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  const inpU = getEl('inp-user');
  if (inpU) inpU.addEventListener('keydown', e => { if (e.key === 'Enter') getEl('inp-pass')?.focus(); });
});
