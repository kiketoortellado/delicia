/**
 * auth.js — Sesión, Login, Logout, Roles
 * Contraseñas hasheadas con SHA-256 (nunca se guarda texto plano)
 */
import Store from './state.js';
import { getEl, hide, show, setText, toast } from './ui.js';
import { db, ref, set, get, onDisconnect } from './firebase.js';

const SESSION_KEY = 'delicias_sess_v4';

/* ── SHA-256 nativo del navegador ───────────── */
async function sha256(text) {
  const buf    = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/* ── Persistencia de sesión ─────────────────── */
export const saveSession  = s  => localStorage.setItem(SESSION_KEY, JSON.stringify(s));
export const loadSession  = () => { try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; } };
export const clearSession = () => localStorage.removeItem(SESSION_KEY);

/* ── Setup inicial: crea admin en Firebase si no existe ── */
export async function setupAdminInicial() {
  try {
    const snap = await get(ref(db, 'admin_master'));
    if (!snap.exists()) {
      // Primera vez: guarda el hash de la contraseña por defecto
      // ⚠️  Cambia la contraseña desde el panel Admin después del primer login
      const hashPass = await sha256('1234RD');
      await set(ref(db, 'admin_master'), {
        username: 'ADMIN',
        passHash: hashPass,
        nombre:   'Administrador',
        role:     'admin'
      });
      console.log('Admin master creado en Firebase.');
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

  // Verificar admin master desde Firebase
  if (username === 'ADMIN') {
    try {
      const snap = await get(ref(db, 'admin_master'));
      if (snap.exists()) {
        const adminData = snap.val();
        if (adminData.passHash === hashInput) {
          const sesion = { id: 'admin', username: 'ADMIN', nombre: 'Administrador', role: 'admin' };
          Store.set('sesion', sesion);
          saveSession(sesion);
          mostrarSegunRol();
          return;
        }
      }
    } catch (e) {
      console.warn('Error verificando admin:', e);
    }
    if (errEl) errEl.textContent = '❌ Usuario o contraseña incorrectos.';
    return;
  }

  // Buscar en usuarios dinámicos (también hasheados)
  const usuarios = Store.get('usuarios') || [];
  const u = usuarios.find(
    u => u.username.toUpperCase() === username && u.passHash === hashInput
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

/* ── Exponer globalmente ── */
window.doLogin   = doLogin;
window.doLogout  = doLogout;

document.addEventListener('DOMContentLoaded', () => {
  const inp = getEl('inp-pass');
  if (inp) inp.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  const inpU = getEl('inp-user');
  if (inpU) inpU.addEventListener('keydown', e => { if (e.key === 'Enter') getEl('inp-pass')?.focus(); });
});
