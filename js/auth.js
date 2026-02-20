/**
 * auth.js — Sesión, Login, Logout, Roles
 * Soporta usuarios con password plano (legacy) y passHash (SHA-256)
 * Migra automáticamente al formato nuevo al hacer login
 */
import Store from './state.js';
import { getEl, hide, show, setText, toast } from './ui.js';
import { db, ref, set, get, onDisconnect } from './firebase.js';

const SESSION_KEY = 'delicias_sess_v4';

/* ── SHA-256 ────────────────────────────────── */
async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/* ── Sesión ─────────────────────────────────── */
export const saveSession  = s => localStorage.setItem(SESSION_KEY, JSON.stringify(s));
export const loadSession  = () => { try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; } };
export const clearSession = () => localStorage.removeItem(SESSION_KEY);

/* ── Setup admin inicial en Firebase ────────── */
export async function setupAdminInicial() {
  try {
    const snap = await get(ref(db, 'admin_master'));
    if (!snap.exists()) {
      await set(ref(db, 'admin_master'), {
        username: 'ADMIN',
        passHash: await sha256('1234RD'),
        nombre:   'Administrador',
        role:     'admin'
      });
    }
  } catch (e) {
    console.warn('No se pudo verificar admin master:', e);
  }
}

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

  const hashInput = await sha256(password);

  // ── Admin master ──
  if (username === 'ADMIN') {
    try {
      const snap = await get(ref(db, 'admin_master'));
      if (snap.exists() && snap.val().passHash === hashInput) {
        const sesion = { id: 'admin', username: 'ADMIN', nombre: 'Administrador', role: 'admin' };
        Store.set('sesion', sesion);
        saveSession(sesion);
        mostrarSegunRol();
        return;
      }
    } catch (e) { console.warn('Error verificando admin:', e); }
    if (errEl) errEl.textContent = '❌ Usuario o contraseña incorrectos.';
    return;
  }

  // ── Usuarios dinámicos — soporta password plano (legacy) y passHash ──
  const usuarios = Store.get('usuarios') || [];
  const u = usuarios.find(u => u.username.toUpperCase() === username && (
    u.passHash === hashInput ||       // nuevo formato
    u.password === password           // legacy formato plano
  ));

  if (!u) {
    if (errEl) errEl.textContent = '❌ Usuario o contraseña incorrectos.';
    return;
  }

  // Migrar a passHash si todavía usa password plano
  if (u.password && !u.passHash) {
    u.passHash = hashInput;
    delete u.password;
    const todos = Store.get('usuarios');
    await set(ref(db, 'usuarios'), todos).catch(() => {});
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

/* ── Presencia ──────────────────────────────── */
export async function registrarPresencia() {
  const sesion = Store.get('sesion');
  if (!sesion) return;
  const presRef = ref(db, `presencia/${sesion.username}`);
  try {
    await set(presRef, { online: true, nombre: sesion.nombre || sesion.username, rol: sesion.role, desde: Date.now() });
    await onDisconnect(presRef).remove();
  } catch (e) { console.warn('Presencia no disponible:', e); }
}

export async function quitarPresencia() {
  const sesion = Store.get('sesion');
  if (!sesion) return;
  try { await set(ref(db, `presencia/${sesion.username}`), null); } catch {}
}

/* ── Global ─────────────────────────────────── */
window.doLogin  = doLogin;
window.doLogout = doLogout;

document.addEventListener('DOMContentLoaded', () => {
  getEl('inp-pass')?.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  getEl('inp-user')?.addEventListener('keydown', e => { if (e.key === 'Enter') getEl('inp-pass')?.focus(); });
});
