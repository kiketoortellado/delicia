/**
 * actividad.js — Log de actividad de usuarios
 */
import Store from './state.js';
import { getEl, html, toast, fechaHora } from './ui.js';
import { db, ref, set } from './firebase.js';

const MAX_ACTIVIDAD = 200;

/* ── Registrar actividad ────────────────────── */
export async function registrarActividad(tipo, msg) {
  const sesion = Store.get('sesion');
  if (!sesion) return;

  const e = {
    tipo,
    msg,
    usuario:   sesion.nombre || sesion.username,
    role:      sesion.role,
    fechaHora: fechaHora(),
    ts:        Date.now()
  };

  const actividad = Store.get('actividad') || [];
  actividad.unshift(e);
  if (actividad.length > MAX_ACTIVIDAD) actividad.splice(MAX_ACTIVIDAD);
  Store.set('actividad', actividad);

  try {
    await set(ref(db, 'actividad'), actividad);
  } catch (err) {
    console.warn('No se pudo guardar actividad en Firebase:', err);
  }
}

/* ── Render actividad ───────────────────────── */
export function renderActividad() {
  const list = getEl('activity-list');
  if (!list) return;

  const actividad = Store.get('actividad') || [];

  if (!actividad.length) {
    list.innerHTML = '<div class="empty-state"><svg class="icon icon-xl"><use href="#icon-empty"/></svg><p>Sin actividad.</p></div>';
    return;
  }

  const roleLabel = { admin: 'Admin', mesero: 'Mesero', cocinero: 'Cocinero/a' };
  const iconMap   = { admin: 'icon-crown', mesero: 'icon-user', cocinero: 'icon-chef' };

  list.innerHTML = actividad.slice(0, 80).map(a => `
    <div class="activity-item">
      <div class="activity-dot ${a.tipo}"></div>
      <div class="activity-content">
        <div class="activity-msg">
          <span class="activity-user">
            <svg class="icon icon-sm"><use href="#${iconMap[a.role] || 'icon-user'}"/></svg>
            ${a.usuario}
          </span>
          — ${a.msg}
        </div>
        <div class="activity-meta">
          <svg class="icon icon-sm"><use href="#icon-clock"/></svg>
          ${a.fechaHora} · ${roleLabel[a.role] || a.role}
        </div>
      </div>
    </div>`).join('');
}

/* ── Limpiar actividad ──────────────────────── */
window.limpiarActividad = async function() {
  if (!confirm('¿Limpiar el registro de actividad?')) return;
  Store.set('actividad', []);
  try {
    await set(ref(db, 'actividad'), []);
    toast('Actividad limpiada.');
  } catch (e) {
    console.error('Error al limpiar actividad:', e);
    toast('⚠ Error al limpiar actividad.');
  }
};
