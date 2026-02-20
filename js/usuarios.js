/**
 * usuarios.js — Gestión de usuarios del sistema
 */
import Store from './state.js';
import { getEl, toast, fechaHora } from './ui.js';
import { db, ref, set, onValue } from './firebase.js';
import { registrarActividad } from './actividad.js';

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

const saveUsuarios = async () => {
  try {
    await set(ref(db, 'usuarios'), Store.get('usuarios'));
  } catch (e) {
    console.error('Error guardando usuarios:', e);
    toast('⚠ Error al guardar usuarios.');
  }
};

/* ── Render lista de usuarios ───────────────── */
export function renderUsersList() {
  const list = getEl('users-list');
  if (!list) return;

  const usuarios = (Store.get('usuarios') || []).filter(Boolean);

  let h = `<div class="user-item">
    <div class="user-info">
      <div class="uname"><svg class="icon icon-sm"><use href="#icon-crown"/></svg> Administrador</div>
      <div class="ufull">ADMIN · <span style="color:var(--gold);font-weight:600">Admin Principal</span></div>
    </div>
    <span class="role-badge admin">Admin</span>
  </div>`;

  if (!usuarios.length) {
    h += '<div style="color:var(--text-muted);font-size:0.9rem;text-align:center;padding:16px;">Sin usuarios creados.</div>';
  } else {
    h += usuarios.map(u => {
      const isCocinero = u.role === 'cocinero';
      const badgeClass = isCocinero ? 'cocinero' : 'mesero';
      const badgeLabel = isCocinero ? 'Cocinero/a' : 'Mesero';
      const iconClass  = isCocinero ? 'icon-chef' : 'icon-user';
      return `<div class="user-item">
        <div class="user-info">
          <div class="uname"><svg class="icon icon-sm"><use href="#${iconClass}"/></svg> ${u.nombre}</div>
          <div class="ufull">${u.username} · ${u.creadoEn || '—'}</div>
        </div>
        <div class="user-item-actions">
          <span class="role-badge ${badgeClass}">${badgeLabel}</span>
          <button class="icon-btn" onclick="abrirCambiarPass('${u.id}')" title="Cambiar contraseña">
            <svg class="icon"><use href="#icon-key"/></svg>
          </button>
          <button class="icon-btn" onclick="eliminarUsuario('${u.id}')" title="Eliminar">
            <svg class="icon"><use href="#icon-trash"/></svg>
          </button>
        </div>
      </div>`;
    }).join('');
  }
  list.innerHTML = h;
}

/* ── Render presencia (usuarios conectados) ─── */
export function renderPresencia() {
  const panel = getEl('presencia-panel');
  if (!panel) return;

  const presencia = Store.get('presencia') || {};
  const sesion    = Store.get('sesion');
  // Filtrar el usuario actual
  const otros = Object.values(presencia).filter(p => p && p.nombre !== (sesion?.nombre || sesion?.username));

  if (!otros.length) {
    panel.innerHTML = '<div style="color:var(--text-muted);font-size:0.85rem;">No hay otros usuarios conectados.</div>';
    return;
  }

  panel.innerHTML = otros.map(p => {
    const roleLabel = p.rol === 'admin' ? 'Admin' : p.rol === 'cocinero' ? 'Cocinero/a' : 'Mesero';
    const badgeClass = p.rol === 'admin' ? 'admin' : p.rol === 'cocinero' ? 'cocinero' : 'mesero';
    return `<div class="user-item">
      <div class="user-info">
        <div class="uname"><svg class="icon icon-sm"><use href="#icon-user"/></svg> ${p.nombre}</div>
      </div>
      <span class="role-badge ${badgeClass}">${roleLabel}</span>
    </div>`;
  }).join('');
}

/* ── Suscribir presencia en tiempo real ─────── */
export function suscribirPresencia() {
  onValue(ref(db, 'presencia'), snap => {
    Store.set('presencia', snap.val() || {});
    renderPresencia();
  });
}

/* ── Mostrar / ocultar form nuevo usuario ───── */
window.toggleAddUser = function() {
  const w = getEl('add-user-wrap-panel');
  if (!w) return;
  w.classList.toggle('hidden');
  if (!w.classList.contains('hidden')) {
    ['nu-nombre', 'nu-user', 'nu-pass', 'nu-pass2'].forEach(id => {
      const el = getEl(id); if (el) el.value = '';
    });
    getEl('nu-nombre')?.focus();
  }
};

/* ── Crear usuario ──────────────────────────── */
window.crearUsuario = async function() {
  const nombre   = getEl('nu-nombre')?.value.trim();
  const username = getEl('nu-user')?.value.trim().toUpperCase();
  const pass     = getEl('nu-pass')?.value;
  const pass2    = getEl('nu-pass2')?.value;
  const role     = getEl('nu-role')?.value;

  if (!nombre || !username || !pass)  { toast('Completa todos los campos.'); return; }
  if (pass !== pass2)                 { toast('Las contraseñas no coinciden.'); return; }
  if (username === 'ADMIN')           { toast('Nombre reservado.'); return; }

  const usuarios = Store.get('usuarios') || [];
  if (usuarios.find(u => u.username.toUpperCase() === username)) {
    toast('Usuario ya existe.'); return;
  }

  const sesion   = Store.get('sesion');
  const passHash = await sha256(pass);
  const nu = {
    id: 'u_' + Date.now(),
    nombre, username, passHash, role,
    creadoPor: sesion?.username || 'admin',
    creadoEn:  fechaHora()
  };
  usuarios.push(nu);
  Store.set('usuarios', usuarios);
  await saveUsuarios();
  window.toggleAddUser();
  renderUsersList();
  const roleLbl = role === 'cocinero' ? 'Cocinero/a' : 'Mesero';
  await registrarActividad('accion-admin', `Creó usuario ${roleLbl}: "${nombre}" (${username})`);
  toast(`Usuario "${nombre}" (${roleLbl}) creado.`);
};

/* ── Eliminar usuario ───────────────────────── */
window.eliminarUsuario = async function(id) {
  const usuarios = Store.get('usuarios') || [];
  const u = usuarios.find(u => u.id === id);
  if (!u) return;
  if (!confirm(`¿Eliminar a "${u.nombre}"?`)) return;
  Store.set('usuarios', usuarios.filter(u => u.id !== id));
  await saveUsuarios();
  renderUsersList();
  await registrarActividad('accion-admin', `Eliminó usuario "${u.nombre}"`);
  toast('Usuario eliminado.');
};

/* ── Cambiar contraseña ─────────────────────── */
window.abrirCambiarPass = function(id) {
  const usuarios = Store.get('usuarios') || [];
  const u = usuarios.find(u => u.id === id);
  if (!u) return;
  getEl('cp-user-id').value = id;
  getEl('cp-user-name').innerHTML = `<svg class="icon icon-sm"><use href="#icon-user"/></svg> ${u.nombre} (${u.username})`;
  getEl('cp-pass').value  = '';
  getEl('cp-pass2').value = '';
  getEl('modal-cambiar-pass').classList.add('open');
};

window.guardarNuevaPass = async function() {
  const id    = getEl('cp-user-id').value;
  const pass  = getEl('cp-pass').value;
  const pass2 = getEl('cp-pass2').value;

  if (!pass)          { toast('Ingresa la contraseña.'); return; }
  if (pass !== pass2) { toast('No coinciden.'); return; }

  const usuarios = Store.get('usuarios') || [];
  const u = usuarios.find(u => u.id === id);
  if (u) {
    u.passHash = await sha256(pass);
    delete u.password; // limpiar legacy
  }
  Store.set('usuarios', usuarios);
  await saveUsuarios();
  getEl('modal-cambiar-pass').classList.remove('open');
  await registrarActividad('accion-admin', `Cambió contraseña de "${u?.nombre}"`);
  toast('Contraseña actualizada.');
};
