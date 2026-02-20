/**
 * mesas.js — Lógica de mesas: render, modal, pedidos, timers
 */
import Store from './state.js';
import { getEl, html, fmt, hora, fechaHora, fechaHoy, toast, setText } from './ui.js';
import { db, ref, set, get } from './firebase.js';
import { registrarActividad } from './actividad.js';

const TOTAL_MESAS = 12;
let mesaAbierta   = null;
let pedidoActual  = {};
let catActiva     = 'todos';
let timerInterval = null;

/* ── Key de Firebase para una mesa (siempre string "mesa_1") ── */
const mesaKey = n => `mesa_${n}`;

/* ── Mesa default ───────────────────────────── */
export const mesaDefault = () => ({
  ocupada: false, pedidoActual: {}, mesero: '',
  clientesNoche: [], tsOcupada: null, ultimoUsuario: ''
});

/* ── Calcular total ─────────────────────────── */
export function calcTotal(pedido) {
  if (!pedido) return 0;
  const productos = Store.get('productos') || [];
  return Object.entries(pedido).reduce((s, [pid, qty]) => {
    const p = productos.find(p => String(p.id) === String(pid));
    return s + (p ? p.precio * qty : 0);
  }, 0);
}

/* ── Render mesas ───────────────────────────── */
export function renderMesas() {
  const sesion = Store.get('sesion');
  if (sesion?.role === 'cocinero') return;

  const mesas = Store.get('mesas') || {};
  let markup = '', ocp = 0;

  for (let i = 1; i <= TOTAL_MESAS; i++) {
    const m   = mesas[i] || mesaDefault();
    const tot = calcTotal(m.pedidoActual);
    if (m.ocupada) ocp++;

    markup += `
      <div class="mesa-card ${m.ocupada ? 'ocupada' : ''}" onclick="abrirMesa(${i})">
        <div class="mesa-top">
          <div class="mesa-label"><svg class="icon icon-sm"><use href="#icon-table"/></svg> Mesa</div>
          <div class="mesa-num">${i}</div>
        </div>
        <div class="mesa-bottom">
          <div class="mesa-status ${m.ocupada ? 'ocupada' : 'libre'}">${m.ocupada ? 'Ocupada' : 'Libre'}</div>
          ${m.mesero ? `<div class="mesa-mesero"><svg class="icon icon-sm"><use href="#icon-user"/></svg> ${m.mesero}</div>` : ''}
          ${m.ocupada && tot > 0 ? `<div class="mesa-total">${fmt(tot)}</div>` : ''}
          <div class="mesa-timer" id="timer-mesa-${i}"></div>
        </div>
      </div>`;
  }

  html('mesas-grid', markup);
  const badge = getEl('badge-mesas');
  if (badge) badge.textContent = `${ocp} ocupada${ocp !== 1 ? 's' : ''}`;
  actualizarTimers();
}

/* ── Modal mesa ─────────────────────────────── */
window.abrirMesa = function(num) {
  mesaAbierta = num;
  const mesas  = Store.get('mesas') || {};
  const m      = mesas[num] || mesaDefault();
  const sesion = Store.get('sesion');

  pedidoActual = { ...(m.pedidoActual || {}) };

  getEl('modal-title').innerHTML = `<svg class="icon"><use href="#icon-table"/></svg> Mesa ${num}`;
  setText('modal-subtitle', m.ocupada ? 'Ocupada' : 'Disponible');

  const inp = getEl('inp-mesero');
  if (inp) inp.value = sesion ? sesion.nombre || sesion.username : '';

  const btnPagado = getEl('btn-pagado');
  if (btnPagado) btnPagado.classList.toggle('hidden', sesion?.role !== 'admin');

  catActiva = 'todos';
  document.querySelectorAll('#cat-tabs-modal .cat-tab')
    .forEach(t => t.classList.toggle('active', t.dataset.cat === 'todos'));

  renderProductosGrid();
  renderPedidoActual();
  renderClientesMesa(num);
  getEl('modal-mesa').classList.add('open');
};

window.cerrarModal = function() {
  getEl('modal-mesa').classList.remove('open');
  mesaAbierta = null;
  pedidoActual = {};
};

window.filtrarCat = function(cat, el) {
  catActiva = cat;
  document.querySelectorAll('#cat-tabs-modal .cat-tab')
    .forEach(t => t.classList.toggle('active', t === el));
  renderProductosGrid();
};

/* ── Grid de productos en modal ─────────────── */
function renderProductosGrid() {
  const productos = Store.get('productos') || [];
  const prods = catActiva === 'todos'
    ? productos
    : productos.filter(p => (p.cat || 'comida') === catActiva);

  if (!prods.length) {
    html('productos-grid', '<div style="color:var(--text-muted);grid-column:1/-1;padding:16px 0;font-size:0.9rem">Sin productos en esta categoría.</div>');
    return;
  }
  html('productos-grid', prods.map(p => `
    <button class="producto-btn" onclick="addProd(${p.id})">
      <span class="prod-name">${p.nombre}</span>
      <span class="prod-price">${fmt(p.precio)}</span>
    </button>`).join(''));
}

/* ── Pedido actual ──────────────────────────── */
window.addProd = function(pid) {
  pedidoActual[pid] = (pedidoActual[pid] || 0) + 1;
  renderPedidoActual();
};

window.cambiarQty = function(pid, d) {
  pedidoActual[pid] = (pedidoActual[pid] || 0) + d;
  if (pedidoActual[pid] <= 0) delete pedidoActual[pid];
  renderPedidoActual();
};

function renderPedidoActual() {
  const items     = Object.entries(pedidoActual);
  const productos = Store.get('productos') || [];

  if (!items.length) {
    html('orden-items', '<div style="color:var(--text-muted);font-size:0.9rem;padding:12px 0">Sin productos</div>');
    setText('pedido-total', fmt(0));
    return;
  }

  let total = 0, markup = '';
  for (const [pid, qty] of items) {
    const p = productos.find(p => String(p.id) === String(pid));
    if (!p) continue;
    const sub = p.precio * qty;
    total += sub;
    markup += `
      <div class="orden-item">
        <span class="orden-item-name">${p.nombre}</span>
        <span class="orden-item-qty">
          <button class="qty-btn" onclick="cambiarQty(${pid},-1)"><svg class="icon icon-sm"><use href="#icon-minus"/></svg></button>
          <span class="qty-num">${qty}</span>
          <button class="qty-btn" onclick="cambiarQty(${pid},1)"><svg class="icon icon-sm"><use href="#icon-plus"/></svg></button>
        </span>
        <span class="orden-item-price">${fmt(sub)}</span>
      </div>`;
  }
  html('orden-items', markup);
  setText('pedido-total', fmt(total));
}

/* ── Confirmar pedido ───────────────────────── */
window.confirmarPedido = async function() {
  if (!mesaAbierta) return;
  if (!Object.keys(pedidoActual).length) { toast('Añade al menos un producto.'); return; }

  const sesion  = Store.get('sesion');
  const mesero  = sesion ? sesion.nombre || sesion.username : '';
  const mesaNum = mesaAbierta;

  try {
    const snap   = await get(ref(db, `mesas/${mesaKey(mesaNum)}`));
    const mActual = snap.exists() ? snap.val() : mesaDefault();

    await set(ref(db, `mesas/${mesaKey(mesaNum)}`), {
      ...mActual,
      pedidoActual:  { ...pedidoActual },
      mesero,
      ocupada:       true,
      ultimoUsuario: sesion?.username || '',
      tsOcupada:     mActual.tsOcupada || Date.now()
    });

    setText('modal-subtitle', 'Ocupada');
    await registrarActividad('accion-pedido', `Confirmó pedido en Mesa ${mesaNum} (${fmt(calcTotal(pedidoActual))})`);
    toast(`Pedido confirmado — Mesa ${mesaNum}`);
  } catch (err) {
    console.error('Error confirmando pedido:', err);
    toast('⚠ Error al guardar. Verificá la conexión.');
  }
};

/* ── Marcar pagado ──────────────────────────── */
window.marcarPagado = async function() {
  if (!mesaAbierta) return;
  const sesion = Store.get('sesion');
  if (sesion?.role !== 'admin') { toast('Solo el Admin puede marcar pagado.'); return; }

  const mesaNum  = mesaAbierta;
  const mesero   = sesion.nombre || sesion.username;
  let ticketData = null;

  try {
    const snap   = await get(ref(db, `mesas/${mesaKey(mesaNum)}`));
    const m      = snap.exists() ? snap.val() : mesaDefault();
    const cnFinal = Array.isArray(m.clientesNoche) ? [...m.clientesNoche] : [];

    if (Object.keys(pedidoActual).length > 0) {
      const productos     = Store.get('productos') || [];
      const detalles      = Object.entries(pedidoActual)
        .map(([pid, qty]) => {
          const p = productos.find(p => String(p.id) === String(pid));
          return p ? { nombre: p.nombre, qty, precio: p.precio, sub: p.precio * qty, cat: p.cat || 'comida' } : null;
        }).filter(Boolean);

      const total         = calcTotal(pedidoActual);
      const tiempoOcupada = m.tsOcupada ? Math.floor((Date.now() - m.tsOcupada) / 60000) : null;
      const fechaISO      = fechaHoy();

      cnFinal.push({
        num: cnFinal.length + 1, detalles, total, mesero,
        usuario: sesion.username, hora: hora(),
        tiempoMin: tiempoOcupada, fecha: fechaISO
      });

      const historial = Store.get('historial') || [];
      historial.push({
        mesa: mesaNum, clienteNum: cnFinal.length, detalles, total, mesero,
        usuario: sesion.username, hora: hora(), fecha: fechaISO, ts: Date.now()
      });
      Store.set('historial', historial);
      await set(ref(db, 'historial'), historial);
      await registrarActividad('accion-pago', `Marcó Mesa ${mesaNum} como pagada — ${fmt(total)}`);
      ticketData = { mesa: mesaNum, clienteNum: cnFinal.length, detalles, total, mesero, hora: hora(), fecha: fechaISO };
    }

    await set(ref(db, `mesas/${mesaKey(mesaNum)}`), {
      clientesNoche: cnFinal,
      ocupada: false, pedidoActual: {}, mesero: '', ultimoUsuario: '', tsOcupada: null
    });

    pedidoActual = {};
    window.cerrarModal();
    toast(`Mesa ${mesaNum} liberada ✓`);
    if (ticketData) setTimeout(() => manejarTicket(ticketData), 300);
  } catch (err) {
    console.error('Error al liberar mesa:', err);
    toast('⚠ Error al guardar. Verificá la conexión.');
  }
};
