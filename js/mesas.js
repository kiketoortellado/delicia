/**
 * mesas.js — Lógica de mesas: render, modal, pedidos, timers
 */
import Store from './state.js';
import { getEl, html, fmt, hora, fechaHora, fechaHoy, toast, setText } from './ui.js';
import { db, ref, set, runTransaction } from './firebase.js';
import { registrarActividad } from './actividad.js';

const TOTAL_MESAS = 12;
let mesaAbierta   = null;
let pedidoActual  = {};
let catActiva     = 'todos';
let timerInterval = null;

const CAT_LABELS = { bebida: 'Bebida', comida: 'Comida', postre: 'Postre' };

/* ── Mesa default ───────────────────────────── */
export const mesaDefault = () => ({
  ocupada: false, pedidoActual: {}, mesero: '',
  clientesNoche: [], tsOcupada: null, ultimoUsuario: ''
});

/* ── Calcular total de un pedido ────────────── */
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
          <div class="mesa-label">
            <svg class="icon icon-sm"><use href="#icon-table"/></svg> Mesa
          </div>
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
  const mesas = Store.get('mesas') || {};
  const m     = mesas[num] || mesaDefault();
  const sesion = Store.get('sesion');

  pedidoActual = { ...(m.pedidoActual || {}) };

  getEl('modal-title').innerHTML    = `<svg class="icon"><use href="#icon-table"/></svg> Mesa ${num}`;
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
  const items = Object.entries(pedidoActual);
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

  const sesion = Store.get('sesion');
  const mesas  = Store.get('mesas') || {};
  const m      = mesas[mesaAbierta] || mesaDefault();
  const mesero = sesion ? sesion.nombre || sesion.username : '';
  const yaOcupada = m.ocupada;

  m.pedidoActual    = { ...pedidoActual };
  m.mesero          = mesero;
  m.ocupada         = true;
  m.ultimoUsuario   = sesion?.username || '';
  if (!yaOcupada) m.tsOcupada = Date.now();

  const ok = await ocuparMesaConTransaccion(mesaAbierta, mesero);
  if (!ok) return;

  setText('modal-subtitle', 'Ocupada');
  await registrarActividad('accion-pedido', `Confirmó pedido en Mesa ${mesaAbierta} (${fmt(calcTotal(pedidoActual))})`);
  toast(`Pedido confirmado — Mesa ${mesaAbierta}`);
};

/* ── Marcar pagado ──────────────────────────── */
window.marcarPagado = async function() {
  if (!mesaAbierta) return;
  const mesaNum = mesaAbierta;
  const sesion = Store.get('sesion');
  if (sesion?.role !== 'admin') { toast('Solo el Admin puede marcar pagado.'); return; }

  const mesas  = Store.get('mesas') || {};
  const m      = mesas[mesaNum] || mesaDefault();
  const mesero = sesion.nombre || sesion.username;
  let ticketData = null;

  try {
    if (Object.keys(pedidoActual).length > 0) {
      const productos  = Store.get('productos') || [];
      const cn         = m.clientesNoche || [];
      const detalles   = Object.entries(pedidoActual).map(([pid, qty]) => {
        const p = productos.find(p => String(p.id) === String(pid));
        return p ? { nombre: p.nombre, qty, precio: p.precio, sub: p.precio * qty, cat: p.cat || 'comida' } : null;
      }).filter(Boolean);

      const total        = calcTotal(pedidoActual);
      const tiempoOcupada = m.tsOcupada ? Math.floor((Date.now() - m.tsOcupada) / 60000) : null;
      const fechaISO     = fechaHoy();

      cn.push({ num: cn.length + 1, detalles, total, mesero, usuario: sesion.username, hora: hora(), tiempoMin: tiempoOcupada, fecha: fechaISO });
      m.clientesNoche = cn;

      const historial = Store.get('historial') || [];
      historial.push({ mesa: mesaAbierta, clienteNum: cn.length, detalles, total, mesero, usuario: sesion.username, hora: hora(), fecha: fechaISO, ts: Date.now() });
      Store.set('historial', historial);
      await set(ref(db, 'historial'), historial);

      await registrarActividad('accion-pago', `Marcó Mesa ${mesaNum} como pagada — ${fmt(total)}`);
      ticketData = { mesa: mesaNum, clienteNum: cn.length, detalles, total, mesero, hora: hora(), fecha: fechaISO };
    }

    m.ocupada = false; m.pedidoActual = {}; m.mesero = ''; m.ultimoUsuario = ''; m.tsOcupada = null;
    await liberarMesaConTransaccion(mesaNum, m);

    const mesasActualizadas = { ...(Store.get('mesas') || {}), [mesaNum]: { ...m } };
    Store.set('mesas', mesasActualizadas);
    renderMesas();

    pedidoActual = {};
    window.cerrarModal();
    toast(`Mesa ${mesaNum} liberada`);
    if (ticketData) setTimeout(() => manejarTicket(ticketData), 300);
  } catch (err) {
    console.error('Error al liberar mesa:', err);
    toast('⚠ Error al guardar. Verificá la conexión.');
  }
};

/* ── Limpiar mesa ───────────────────────────── */
window.limpiarMesa = async function() {
  if (!mesaAbierta) return;
  const mesaNum = mesaAbierta;
  if (!confirm('¿Limpiar la mesa sin cobrar?')) return;
  const mesas = Store.get('mesas') || {};
  const m     = mesas[mesaNum] || mesaDefault();
  m.ocupada = false; m.pedidoActual = {}; m.mesero = ''; m.tsOcupada = null;
  await liberarMesaConTransaccion(mesaNum, m);

  const mesasActualizadas = { ...(Store.get('mesas') || {}), [mesaNum]: { ...m } };
  Store.set('mesas', mesasActualizadas);
  renderMesas();

  pedidoActual = {};
  window.cerrarModal();
  toast(`Mesa ${mesaNum} limpiada`);
};

/* ── Transacción para ocupar mesa (evita race condition) ── */
async function ocuparMesaConTransaccion(num, meseroNombre) {
  const mesaRef = ref(db, `mesas/${num}`);
  try {
    const result = await runTransaction(mesaRef, (mesaActual) => {
      const mesas = Store.get('mesas') || {};
      if (mesaActual?.ocupada && !mesas[num]?.ocupada) return undefined; // abort
      const nuevo      = mesaActual || mesaDefault();
      nuevo.mesero     = meseroNombre;
      nuevo.ocupada    = true;
      nuevo.ultimoUsuario = Store.get('sesion')?.username || '';
      if (!mesaActual?.ocupada) nuevo.tsOcupada = Date.now();
      nuevo.pedidoActual = { ...pedidoActual };
      return nuevo;
    });
    if (!result.committed) {
      toast('⚠ Esta mesa fue tomada por otro mesero. Actualizando...');
      return false;
    }
    return true;
  } catch (e) {
    console.error('Error en transacción:', e);
    // Fallback a set directo
    const mesas = Store.get('mesas') || {};
    const m     = mesas[num] || mesaDefault();
    m.mesero = meseroNombre; m.ocupada = true;
    m.ultimoUsuario = Store.get('sesion')?.username || '';
    if (!m.tsOcupada) m.tsOcupada = Date.now();
    m.pedidoActual = { ...pedidoActual };
    await set(ref(db, `mesas/${num}`), m);
    return true;
  }
}

async function liberarMesaConTransaccion(num, mesaActualizada) {
  const mesaRef = ref(db, `mesas/${num}`);
  try {
    await runTransaction(mesaRef, (mesaActual) => {
      const base = mesaActual || mesaDefault();
      return { ...base, ...mesaActualizada, ocupada: false, pedidoActual: {} };
    });
  } catch (e) {
    console.error('Error en transacción de liberación:', e);
    await set(mesaRef, { ...mesaActualizada, ocupada: false, pedidoActual: {} });
  }
}

/* ── Render clientes de la mesa ─────────────── */
function renderClientesMesa(num) {
  const mesas = Store.get('mesas') || {};
  const m     = mesas[num];
  const cl    = m?.clientesNoche || [];

  if (!cl.length) {
    html('clientes-mesa-list', '<div style="color:var(--text-muted);font-size:0.85rem;">Sin clientes registrados esta noche.</div>');
    return;
  }
  html('clientes-mesa-list', cl.map(c => `
    <div class="cliente-item">
      <div class="cliente-header">
        <span class="cliente-num"><svg class="icon icon-sm"><use href="#icon-user"/></svg> Cliente ${c.num}°</span>
        <span style="font-size:0.95rem;font-weight:600;color:var(--text-secondary);font-family:'Playfair Display',serif;">${fmt(c.total)}</span>
      </div>
      <div class="cliente-items-list">${c.detalles.map(d => `${d.qty}x ${d.nombre} = ${fmt(d.sub)}`).join(' · ')}</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:6px;">
        ${c.mesero ? `<span class="mesero-badge"><svg class="icon icon-sm"><use href="#icon-user"/></svg> ${c.mesero}</span>` : ''}
        ${c.tiempoMin != null ? `<span class="mesero-badge"><svg class="icon icon-sm"><use href="#icon-clock"/></svg> ${c.tiempoMin}min</span>` : ''}
      </div>
    </div>`).join(''));
}

/* ── Historial por mesa ─────────────────────── */
window.verHistorialMesa = function() {
  if (!mesaAbierta) return;
  const mesas = Store.get('mesas') || {};
  const cl    = mesas[mesaAbierta]?.clientesNoche || [];

  getEl('hist-mesa-title').innerHTML = `<svg class="icon"><use href="#icon-history"/></svg> Historial Completo — Mesa ${mesaAbierta}`;

  if (!cl.length) {
    html('hist-mesa-body', '<div class="empty-state"><svg class="icon icon-xl"><use href="#icon-empty"/></svg><p>Sin historial esta noche.</p></div>');
  } else {
    let tot = 0;
    let t   = '<table class="history-table"><thead><tr><th>Cliente</th><th>Detalle</th><th>Mesero</th><th>Tiempo</th><th>Total</th></tr></thead><tbody>';
    cl.forEach(c => {
      tot += c.total;
      t += `<tr><td>Cliente ${c.num}°</td><td>${c.detalles.map(d => `${d.qty}× ${d.nombre}`).join(', ')}</td><td>${c.mesero || '—'}</td><td>${c.tiempoMin != null ? c.tiempoMin + 'min' : '—'}</td><td>${fmt(c.total)}</td></tr>`;
    });
    t += `<tr class="total-row"><td colspan="4">Total Mesa ${mesaAbierta}</td><td>${fmt(tot)}</td></tr></tbody></table>`;
    html('hist-mesa-body', t);
  }
  getEl('modal-hist-mesa').classList.add('open');
};

/* ── Timers ─────────────────────────────────── */
export function iniciarTimers() {
  detenerTimers();
  timerInterval = setInterval(actualizarTimers, 1000);
}
export function detenerTimers() {
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
}

export function actualizarTimers() {
  const ahora = Date.now();
  const mesas = Store.get('mesas') || {};
  for (let i = 1; i <= TOTAL_MESAS; i++) {
    const el = document.getElementById(`timer-mesa-${i}`);
    if (!el) continue;
    const m = mesas[i];
    if (!m?.ocupada || !m.tsOcupada) { el.textContent = ''; el.className = 'mesa-timer'; continue; }
    const diff = Math.floor((ahora - m.tsOcupada) / 1000);
    const h2 = Math.floor(diff / 3600), mn = Math.floor((diff % 3600) / 60), s = diff % 60;
    el.innerHTML = `<svg class="icon icon-sm"><use href="#icon-clock"/></svg> ` +
      (h2 > 0
        ? `${h2}h ${String(mn).padStart(2,'0')}m ${String(s).padStart(2,'0')}s`
        : `${String(mn).padStart(2,'0')}m ${String(s).padStart(2,'0')}s`);
    el.className = 'mesa-timer' + (diff >= 5400 ? ' alerta' : '');
  }
}

/* ── Ticket ─────────────────────────────────── */
function manejarTicket(t) {
  const esMobile = /Mobi|Android|iPhone|iPad|IEMobile/i.test(navigator.userAgent);
  if (esMobile) mostrarMensajeTicket(t);
  else imprimirTicketPOS(t);
}

function mostrarMensajeTicket(t) {
  const TZ = 'America/Asuncion';
  const cats = { comida: [], bebida: [], postre: [] };
  t.detalles.forEach(d => { (cats[d.cat || 'comida'] = cats[d.cat || 'comida'] || []).push(d); });
  const catEmoji = { comida: '🍽️', bebida: '🥤', postre: '🍮' };
  const lineas   = [
    '🏪 *RESTAURANTE DELICIAS*',
    `Mesa ${t.mesa} · Cliente ${t.clienteNum}°`,
    `📅 ${t.fecha || new Date().toLocaleDateString('es-PY', { timeZone: TZ })}  ${t.hora}`,
    `👤 Mesero: ${t.mesero || '—'}`,
    '─────────────────────'
  ];
  ['comida', 'bebida', 'postre'].forEach(cat => {
    if (!cats[cat]?.length) return;
    lineas.push(`${catEmoji[cat]} *${cat.toUpperCase()}S*`);
    cats[cat].forEach(d => {
      const n = d.nombre.length > 24 ? d.nombre.slice(0, 23) + '…' : d.nombre;
      lineas.push(`  ${d.qty}× ${n}  ${fmt(d.sub)}`);
    });
  });
  lineas.push('─────────────────────', `💰 *TOTAL: ${fmt(t.total)}*`, '¡Gracias por su visita! 🙏');
  const msg = lineas.join('\n');

  let overlay = document.getElementById('overlay-msg-ticket');
  if (overlay) overlay.remove();
  overlay = document.createElement('div');
  overlay.id = 'overlay-msg-ticket';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.65);z-index:9998;display:flex;align-items:flex-end;justify-content:center;backdrop-filter:blur(4px);';
  overlay.innerHTML = `
    <div style="background:var(--surface);border-radius:24px 24px 0 0;padding:24px 20px 32px;width:100%;max-width:520px;border:1px solid var(--border);box-shadow:0 -8px 32px rgba(0,0,0,0.4);animation:slideUpModal 0.35s cubic-bezier(0.34,1.56,0.64,1);">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
        <div style="font-family:'Playfair Display',serif;font-size:1.15rem;font-weight:700;color:var(--text);display:flex;align-items:center;gap:8px;">
          <svg class="icon"><use href="#icon-receipt"/></svg> Resumen del pedido
        </div>
        <button onclick="document.getElementById('overlay-msg-ticket').remove()" style="background:var(--bg);border:none;border-radius:10px;width:34px;height:34px;cursor:pointer;color:var(--text-muted);font-size:1rem;">✕</button>
      </div>
      <pre style="font-family:'Courier New',monospace;font-size:0.82rem;color:var(--text-secondary);white-space:pre-wrap;background:var(--bg);border-radius:12px;padding:14px;border:1px solid var(--border);line-height:1.7;margin-bottom:16px;max-height:45vh;overflow-y:auto;">${msg.replace(/\*/g, '')}</pre>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <a href="https://wa.me/?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener"
          style="display:flex;align-items:center;justify-content:center;gap:8px;background:#25d366;color:#fff;border:none;border-radius:12px;padding:14px 10px;font-family:'DM Sans',sans-serif;font-weight:700;font-size:0.88rem;text-decoration:none;">
          WhatsApp
        </a>
        <button id="btn-copiar-ticket"
          style="display:flex;align-items:center;justify-content:center;gap:8px;background:var(--gold);color:#fff;border:none;border-radius:12px;padding:14px 10px;font-family:'DM Sans',sans-serif;font-weight:700;font-size:0.88rem;cursor:pointer;">
          📋 Copiar
        </button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#btn-copiar-ticket').onclick = function() {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(msg).then(() => {
        this.textContent = '✓ Copiado!';
        setTimeout(() => overlay.remove(), 900);
      }).catch(() => toast('No se pudo copiar'));
    } else {
      const ta = document.createElement('textarea');
      ta.value = msg; document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); ta.remove();
      this.textContent = '✓ Copiado!';
      setTimeout(() => overlay.remove(), 900);
    }
  };
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}

function imprimirTicketPOS(t) {
  const TZ = 'America/Asuncion';
  const now = new Date();
  const fechaTk = now.toLocaleDateString('es-PY', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: TZ });
  const horaTk  = now.toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: TZ });
  const cats = { comida: [], bebida: [], postre: [] };
  t.detalles.forEach(d => { (cats[d.cat || 'comida'] = cats[d.cat || 'comida'] || []).push(d); });
  const catNames = { comida: '── COMIDAS ──', bebida: '── BEBIDAS ──', postre: '── POSTRES ──' };
  let itemsHtml = '';
  ['comida', 'bebida', 'postre'].forEach(cat => {
    if (!cats[cat]?.length) return;
    itemsHtml += `<div class="ticket-cat-hdr">${catNames[cat]}</div>`;
    cats[cat].forEach(d => {
      const nombre = d.nombre.length > 20 ? d.nombre.slice(0, 19) + '…' : d.nombre;
      itemsHtml += `<div class="ticket-row"><span class="ticket-item-name">${d.qty}x ${nombre}</span><span class="ticket-item-price">${fmt(d.sub)}</span></div>`;
    });
  });
  getEl('ticket-print').innerHTML = `<div class="ticket-wrap">
    <div class="ticket-title">★ RESTAURANTE ★</div>
    <div class="ticket-title" style="font-size:18pt;letter-spacing:5px;margin:2mm 0;">DELICIAS</div>
    <div class="ticket-sub">Asunción, Paraguay</div>
    <div class="ticket-div"></div>
    <div class="ticket-row bold"><span>Mesa:</span><span>${t.mesa}</span></div>
    <div class="ticket-row bold"><span>Cliente:</span><span>${t.clienteNum}°</span></div>
    <div class="ticket-row"><span>Atendido por:</span><span>${t.mesero || '—'}</span></div>
    <div class="ticket-row"><span>Fecha:</span><span>${fechaTk}</span></div>
    <div class="ticket-row"><span>Hora:</span><span>${horaTk}</span></div>
    <div class="ticket-div"></div>
    ${itemsHtml}
    <div class="ticket-div"></div>
    <div class="ticket-row total"><span>TOTAL A PAGAR</span><span>${fmt(t.total)}</span></div>
    <div class="ticket-div"></div>
    <div class="ticket-center" style="font-size:10pt;font-weight:700;">¡MUCHAS GRACIAS!</div>
    <hr class="ticket-corte"/>
  </div>`;
  window.print();
}
