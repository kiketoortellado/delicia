/**
 * historial.js — Historial de ventas, filtros y exportación
 */
import Store from './state.js';
import { getEl, html, fmt, toast, fechaHoy } from './ui.js';
import { db, ref, set } from './firebase.js';
import { registrarActividad } from './actividad.js';

let histFechaFiltro = null; // null = hoy

/* ── Render historial ───────────────────────── */
export function renderHistorial() {
  const sesion = Store.get('sesion');
  if (sesion?.role === 'cocinero') return;

  const hoy         = fechaHoy();
  const fechaTarget = histFechaFiltro || hoy;
  const esHoy       = fechaTarget === hoy;

  const inp = getEl('hist-fecha-input');
  if (inp && !inp.value) inp.value = hoy;

  const tituloEl = getEl('hist-titulo-lbl');
  if (tituloEl) tituloEl.textContent = esHoy
    ? 'Historial de Ventas — Hoy'
    : `Historial — ${fechaTarget.split('-').reverse().join('/')}`;

  const btnHoy = getEl('btn-hist-hoy');
  if (btnHoy) btnHoy.style.display = esHoy ? 'none' : '';

  const all = Store.get('historial') || [];
  const h   = all.filter(r => (r.fecha || hoy) === fechaTarget);

  let total = 0;
  const mesasSet = new Set();
  const byMesa   = {};
  h.forEach(r => {
    if (!byMesa[r.mesa]) byMesa[r.mesa] = [];
    byMesa[r.mesa].push(r);
    total += r.total;
    mesasSet.add(r.mesa);
  });

  const sc = getEl('stat-clientes'), sm = getEl('stat-mesas-h'), st = getEl('stat-total');
  if (sc) sc.textContent = h.length;
  if (sm) sm.textContent = mesasSet.size;
  if (st) st.textContent = fmt(total);

  if (!h.length) {
    const msg = esHoy ? 'Sin ventas registradas hoy.' : `Sin ventas el ${fechaTarget.split('-').reverse().join('/')}.`;
    html('historial-container', `<div class="empty-state"><svg class="icon icon-xl"><use href="#icon-empty"/></svg><p>${msg}</p></div>`);
    return;
  }

  let t = '<div style="overflow-x:auto"><table class="history-table"><thead><tr><th>Mesa</th><th>Cliente</th><th>Hora</th><th>Productos</th><th>Mesero</th><th>Usuario</th><th>Total</th></tr></thead><tbody>';
  Object.keys(byMesa).sort((a, b) => +a - +b).forEach(mesa => {
    let tm = 0;
    byMesa[mesa].forEach(r => {
      tm += r.total;
      t += `<tr>
        <td><strong>Mesa ${mesa}</strong></td>
        <td>${r.clienteNum}°</td>
        <td>${r.hora}</td>
        <td>${r.detalles.map(d => `${d.qty}× ${d.nombre}`).join(', ')}</td>
        <td>${r.mesero || '—'}</td>
        <td style="color:var(--blue);font-weight:500">${r.usuario || '—'}</td>
        <td>${fmt(r.total)}</td>
      </tr>`;
    });
    t += `<tr class="total-row"><td colspan="6">Subtotal Mesa ${mesa}</td><td>${fmt(tm)}</td></tr>`;
  });
  t += `<tr class="total-row" style="background:rgba(201,168,76,0.08)">
    <td colspan="6">INGRESO TOTAL</td>
    <td style="color:var(--gold-dark);font-size:1.1rem">${fmt(total)}</td>
  </tr></tbody></table></div>`;
  html('historial-container', t);
}

/* ── Cambiar fecha ──────────────────────────── */
window.cambiarFechaHistorial = function(fecha) {
  histFechaFiltro = fecha || null;
  renderHistorial();
};

window.verHistorialHoy = function() {
  histFechaFiltro = null;
  const inp = getEl('hist-fecha-input');
  if (inp) inp.value = fechaHoy();
  renderHistorial();
};

/* ── Limpiar historial ──────────────────────── */
window.limpiarHistorial = async function() {
  const sesion = Store.get('sesion');
  if (sesion?.role !== 'admin') { toast('Solo el Admin puede limpiar el historial.'); return; }
  if (!confirm('¿Limpiar historial de hoy?')) return;

  const hoy = fechaHoy();
  const all = Store.get('historial') || [];
  const filtrado = all.filter(r => (r.fecha || hoy) !== hoy);
  Store.set('historial', filtrado);

  try {
    await set(ref(db, 'historial'), filtrado);
    await registrarActividad('accion-admin', 'Limpió el historial de hoy');
    toast('Historial limpiado.');
    renderHistorial();
  } catch (e) {
    console.error('Error al limpiar historial:', e);
    toast('⚠ Error al limpiar historial.');
  }
};

/* ── Historial días anteriores ──────────────── */
window.abrirHistorialDias = function() {
  const hoy   = fechaHoy();
  const hace7 = new Date();
  hace7.setDate(hace7.getDate() - 7);
  const hace7str = hace7.toISOString().slice(0, 10);

  const inp1 = getEl('dias-ant-desde'), inp2 = getEl('dias-ant-hasta');
  if (inp1) inp1.value = hace7str;
  if (inp2) inp2.value = hoy;

  filtrarDiasAnteriores();
  getEl('modal-dias-anteriores').classList.add('open');
};

window.filtrarDiasAnteriores = function() {
  const desde = getEl('dias-ant-desde')?.value;
  const hasta = getEl('dias-ant-hasta')?.value;
  const hoy   = fechaHoy();
  const all   = Store.get('historial') || [];

  const filtrado = all.filter(r => {
    const f = r.fecha || hoy;
    if (desde && f < desde) return false;
    if (hasta && f > hasta) return false;
    return true;
  });

  // Stats del rango
  const totalGs = filtrado.reduce((s, r) => s + r.total, 0);
  const statsEl = getEl('dias-ant-stats');
  if (statsEl) statsEl.innerHTML = `
    <div class="stat-card" style="padding:16px 20px">
      <div class="stat-val" style="font-size:1.4rem">${filtrado.length}</div>
      <div class="stat-lbl">Ventas</div>
    </div>
    <div class="stat-card" style="padding:16px 20px">
      <div class="stat-val" style="font-size:1.4rem">${fmt(totalGs)}</div>
      <div class="stat-lbl">Total</div>
    </div>`;

  // Agrupar por fecha
  const porFecha = {};
  filtrado.forEach(r => {
    const f = r.fecha || hoy;
    if (!porFecha[f]) porFecha[f] = [];
    porFecha[f].push(r);
  });

  if (!Object.keys(porFecha).length) {
    html('dias-ant-body', '<div class="empty-state"><svg class="icon icon-xl"><use href="#icon-empty"/></svg><p>Sin ventas en ese rango.</p></div>');
    return;
  }

  let body = '';
  Object.keys(porFecha).sort().reverse().forEach(fecha => {
    const regs   = porFecha[fecha];
    const totDia = regs.reduce((s, r) => s + r.total, 0);
    body += `
      <div style="margin-bottom:24px;">
        <div style="font-weight:700;font-size:1rem;color:var(--text);margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;padding:10px 16px;background:var(--bg);border-radius:10px;border:1px solid var(--border);">
          <span>📅 ${fecha.split('-').reverse().join('/')}</span>
          <span style="color:var(--gold-dark)">${fmt(totDia)}</span>
        </div>
        <div style="overflow-x:auto">
          <table class="history-table">
            <thead><tr><th>Mesa</th><th>Hora</th><th>Productos</th><th>Mesero</th><th>Total</th></tr></thead>
            <tbody>
              ${regs.map(r => `<tr>
                <td>Mesa ${r.mesa}</td>
                <td>${r.hora}</td>
                <td>${r.detalles.map(d => `${d.qty}× ${d.nombre}`).join(', ')}</td>
                <td>${r.mesero || '—'}</td>
                <td>${fmt(r.total)}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>`;
  });
  html('dias-ant-body', body);
};

window.exportarDiasAnteriores = function() {
  import('./reportes.js').then(m => m.exportarExcel(false));
};
