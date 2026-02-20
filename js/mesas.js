/**
 * mesas.js — Lógica de mesas: render, modal, pedidos, timers
 */
import Store from './state.js';
import { getEl, html, fmt, hora, fechaHoy, toast, setText } from './ui.js';
import { db, ref, set, get } from './firebase.js';
import { registrarActividad } from './actividad.js';

const TOTAL_MESAS = 12;
let mesaAbierta   = null;
let pedidoActual  = {};
let catActiva     = 'todos';
let timerInterval = null;
let tabActivaModal = 'pedido';

const fbKey = n => `mesa_${n}`;

export const mesaDefault = () => ({
  ocupada: false, pedidoActual: {}, mesero: '',
  clientesNoche: [], tsOcupada: null, ultimoUsuario: ''
});

export function calcTotal(pedido) {
  if (!pedido) return 0;
  const productos = Store.get('productos') || [];
  return Object.entries(pedido).reduce((s, [pid, qty]) => {
    const p = productos.find(p => String(p.id) === String(pid));
    return s + (p ? p.precio * qty : 0);
  }, 0);
}

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

window.abrirMesa = function(num) {
  mesaAbierta = num;
  tabActivaModal = 'pedido';
  
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
  renderTabsModal();
  getEl('modal-mesa').classList.add('open');
};

window.cerrarModal = function() {
  getEl('modal-mesa').classList.remove('open');
  mesaAbierta  = null;
  pedidoActual = {};
  tabActivaModal = 'pedido';
};

window.cambiarTabModal = function(tab) {
  tabActivaModal = tab;
  renderTabsModal();
};

function renderTabsModal() {
  const mesas = Store.get('mesas') || {};
  const m = mesas[mesaAbierta] || mesaDefault();
  const numClientes = (m.clientesNoche || []).length;
  
  const tabsHtml = `
    <div class="modal-tabs">
      <button class="modal-tab ${tabActivaModal === 'pedido' ? 'active' : ''}" onclick="cambiarTabModal('pedido')">
        <svg class="icon icon-sm"><use href="#icon-receipt"/></svg>
        Pedido Actual
      </button>
      <button class="modal-tab ${tabActivaModal === 'clientes' ? 'active' : ''}" onclick="cambiarTabModal('clientes')">
        <svg class="icon icon-sm"><use href="#icon-history"/></svg>
        Historial
        ${numClientes > 0 ? `<span class="tab-badge">${numClientes}</span>` : ''}
      </button>
    </div>
  `;
  
  const tabsContainer = getEl('modal-tabs-container');
  if (tabsContainer) tabsContainer.innerHTML = tabsHtml;
  
  const pedidoPanel = getEl('pedido-panel');
  const clientesPanel = getEl('clientes-panel');
  
  if (pedidoPanel) pedidoPanel.style.display = tabActivaModal === 'pedido' ? 'block' : 'none';
  if (clientesPanel) {
    clientesPanel.style.display = tabActivaModal === 'clientes' ? 'block' : 'none';
    if (tabActivaModal === 'clientes') renderClientesPanel();
  }
}

function renderClientesPanel() {
  const mesas = Store.get('mesas') || {};
  const cl = mesas[mesaAbierta]?.clientesNoche || [];

  if (!cl.length) {
    html('clientes-panel-content', `
      <div class="empty-state" style="padding:40px 20px;">
        <svg class="icon" style="width:48px;height:48px;opacity:0.3;margin-bottom:12px;"><use href="#icon-empty"/></svg>
        <p style="color:var(--text-muted);">Sin clientes esta noche</p>
      </div>
    `);
    return;
  }

  let tot = 0;
  const listaHtml = cl.map(c => {
    tot += c.total;
    return `
      <div class="cliente-card">
        <div class="cliente-card-header">
          <span class="cliente-num">Cliente ${c.num}°</span>
          <span class="cliente-total">${fmt(c.total)}</span>
        </div>
        <div class="cliente-detalles">${c.detalles.map(d => `${d.qty}× ${d.nombre}`).join(', ')}</div>
        <div class="cliente-meta">
          <span><svg class="icon icon-sm"><use href="#icon-user"/></svg> ${c.mesero || '—'}</span>
          ${c.tiempoMin ? `<span><svg class="icon icon-sm"><use href="#icon-clock"/></svg> ${c.tiempoMin}min</span>` : ''}
          <span>${c.hora}</span>
        </div>
      </div>
    `;
  }).join('');

  html('clientes-panel-content', `
    <div class="mesa-total-resumen">
      <div class="mesa-total-label">Total Mesa</div>
      <div class="mesa-total-valor">${fmt(tot)}</div>
      <div class="mesa-total-clientes">${cl.length} cliente${cl.length !== 1 ? 's' : ''}</div>
    </div>
    <div class="clientes-lista">${listaHtml}</div>
  `);
}

window.filtrarCat = function(cat, el) {
  catActiva = cat;
  document.querySelectorAll('#cat-tabs-modal .cat-tab')
    .forEach(t => t.classList.toggle('active', t === el));
  renderProductosGrid();
};

function renderProductosGrid() {
  const productos = Store.get('productos') || [];
  const prods = catActiva === 'todos'
    ? productos
    : productos.filter(p => (p.cat || 'comida') === catActiva);

  if (!prods.length) {
    html('productos-grid', '<div style="color:var(--text-muted);grid-column:1/-1;padding:16px 0;font-size:0.9rem">Sin productos.</div>');
    return;
  }
  html('productos-grid', prods.map(p => `
    <button class="producto-btn" onclick="addProd(${p.id})">
      <span class="prod-name">${p.nombre}</span>
      <span class="prod-price">${fmt(p.precio)}</span>
    </button>`).join(''));
}

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

window.confirmarPedido = async function() {
  if (!mesaAbierta) return;
  if (!Object.keys(pedidoActual).length) { toast('Añade al menos un producto.'); return; }

  const sesion = Store.get('sesion');
  const mesero = sesion ? sesion.nombre || sesion.username : '';
  const mesaNum = mesaAbierta;

  try {
    const snap = await get(ref(db, `mesas/${fbKey(mesaNum)}`));
    const mActual = snap.exists() ? snap.val() : mesaDefault();

    await set(ref(db, `mesas/${fbKey(mesaNum)}`), {
      clientesNoche: Array.isArray(mActual.clientesNoche) ? mActual.clientesNoche : [],
      pedidoActual: { ...pedidoActual },
      mesero,
      ocupada: true,
      ultimoUsuario: sesion?.username || '',
      tsOcupada: mActual.tsOcupada || Date.now()
    });

    setText('modal-subtitle', 'Ocupada');
    await registrarActividad('accion-pedido', `Confirmó pedido en Mesa ${mesaNum} (${fmt(calcTotal(pedidoActual))})`);
    toast(`Pedido confirmado — Mesa ${mesaNum}`, 3000, 'success');
  } catch (err) {
    console.error('Error confirmando pedido:', err);
    toast('Error al guardar. Verificá la conexión.', 5000, 'error');
  }
};

window.marcarPagado = async function() {
  if (!mesaAbierta) return;
  const sesion = Store.get('sesion');
  if (sesion?.role !== 'admin') { toast('Solo el Admin puede marcar pagado.'); return; }

  const mesaNum = mesaAbierta;
  const mesero = sesion.nombre || sesion.username;
  let ticketData = null;

  try {
    const snap = await get(ref(db, `mesas/${fbKey(mesaNum)}`));
    const mFB = snap.exists() ? snap.val() : mesaDefault();
    const cnActual = Array.isArray(mFB.clientesNoche) ? [...mFB.clientesNoche] : [];

    if (Object.keys(pedidoActual).length > 0) {
      const productos = Store.get('productos') || [];
      const detalles = Object.entries(pedidoActual)
        .map(([pid, qty]) => {
          const p = productos.find(p => String(p.id) === String(pid));
          return p ? { nombre: p.nombre, qty, precio: p.precio, sub: p.precio * qty, cat: p.cat || 'comida' } : null;
        }).filter(Boolean);

      const total = calcTotal(pedidoActual);
      const tiempoMin = mFB.tsOcupada ? Math.floor((Date.now() - mFB.tsOcupada) / 60000) : null;
      const fechaISO = fechaHoy();
      const horaActual = hora();

      cnActual.push({
        num: cnActual.length + 1, detalles, total, mesero,
        usuario: sesion.username, hora: horaActual,
        tiempoMin, fecha: fechaISO
      });

      const historial = Store.get('historial') || [];
      historial.push({
        mesa: mesaNum, clienteNum: cnActual.length, detalles, total, mesero,
        usuario: sesion.username, hora: horaActual, fecha: fechaISO, ts: Date.now()
      });
      Store.set('historial', historial);
      await set(ref(db, 'historial'), historial);
      await registrarActividad('accion-pago', `Marcó Mesa ${mesaNum} como pagada — ${fmt(total)}`);
      ticketData = { mesa: mesaNum, clienteNum: cnActual.length, detalles, total, mesero, hora: horaActual, fecha: fechaISO };
    }

    await set(ref(db, `mesas/${fbKey(mesaNum)}`), {
      ocupada: false,
      pedidoActual: {},
      mesero: '',
      ultimoUsuario: '',
      tsOcupada: null,
      clientesNoche: cnActual
    });

    pedidoActual = {};
    window.cerrarModal();
    toast(`Mesa ${mesaNum} liberada`, 3000, 'success');
    if (ticketData) setTimeout(() => manejarTicket(ticketData), 500);
  } catch (err) {
    console.error('Error al liberar mesa:', err);
    toast('Error al guardar. Verificá la conexión.', 5000, 'error');
  }
};

window.limpiarMesa = async function() {
  if (!mesaAbierta) return;
  if (!confirm('¿Limpiar la mesa sin cobrar?')) return;

  const mesaNum = mesaAbierta;
  try {
    const snap = await get(ref(db, `mesas/${fbKey(mesaNum)}`));
    const mFB = snap.exists() ? snap.val() : mesaDefault();

    await set(ref(db, `mesas/${fbKey(mesaNum)}`), {
      ocupada: false,
      pedidoActual: {},
      mesero: '',
      ultimoUsuario: '',
      tsOcupada: null,
      clientesNoche: Array.isArray(mFB.clientesNoche) ? mFB.clientesNoche : []
    });

    pedidoActual = {};
    window.cerrarModal();
    toast(`Mesa ${mesaNum} limpiada`, 3000, 'success');
  } catch (err) {
    console.error('Error limpiando mesa:', err);
    toast('Error. Verificá la conexión.', 5000, 'error');
  }
};

window.verHistorialMesa = function() {
  if (!mesaAbierta) return;
  const mesas = Store.get('mesas') || {};
  const cl = mesas[mesaAbierta]?.clientesNoche || [];

  getEl('hist-mesa-title').innerHTML = `<svg class="icon"><use href="#icon-history"/></svg> Historial — Mesa ${mesaAbierta}`;

  if (!cl.length) {
    html('hist-mesa-body', '<div class="empty-state"><svg class="icon icon-xl"><use href="#icon-empty"/></svg><p>Sin historial esta noche.</p></div>');
  } else {
    let tot = 0;
    let t = '<table class="history-table"><thead><tr><th>Cliente</th><th>Detalle</th><th>Mesero</th><th>Tiempo</th><th>Total</th></tr></thead><tbody>';
    cl.forEach(c => {
      tot += c.total;
      t += `<tr><td>Cliente ${c.num}°</td><td>${c.detalles.map(d => `${d.qty}× ${d.nombre}`).join(', ')}</td><td>${c.mesero || '—'}</td><td>${c.tiempoMin != null ? c.tiempoMin + 'min' : '—'}</td><td>${fmt(c.total)}</td></tr>`;
    });
    t += `<tr class="total-row"><td colspan="4">Total Mesa ${mesaAbierta}</td><td>${fmt(tot)}</td></tr></tbody></table>`;
    html('hist-mesa-body', t);
  }
  getEl('modal-hist-mesa').classList.add('open');
};

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
      (h2 > 0 ? `${h2}h ${String(mn).padStart(2,'0')}m ${String(s).padStart(2,'0')}s`
               : `${String(mn).padStart(2,'0')}m ${String(s).padStart(2,'0')}s`);
    el.className = 'mesa-timer' + (diff >= 5400 ? ' alerta' : '');
  }
}

const CONFIG_KEY = 'ticket_config';
let _ticketConfig = { header: '', footer: '' };

export async function cargarConfigTicket() {
  try {
    const snap = await get(ref(db, CONFIG_KEY));
    if (snap.exists()) _ticketConfig = snap.val();
    const h = document.getElementById('ticket-header');
    const f = document.getElementById('ticket-footer');
    if (h) h.value = _ticketConfig.header || '';
    if (f) f.value = _ticketConfig.footer || '';
  } catch(e) { console.warn('Config ticket no disponible:', e); }
}

window.guardarConfigTicket = async function() {
  const header = document.getElementById('ticket-header')?.value.trim() || '';
  const footer = document.getElementById('ticket-footer')?.value.trim() || '';
  _ticketConfig = { header, footer };
  try {
    await set(ref(db, CONFIG_KEY), _ticketConfig);
    toast('Configuración guardada', 3000, 'success');
  } catch(e) {
    toast('Error al guardar', 5000, 'error');
  }
};

async function manejarTicket(t) {
  try {
    const snap = await get(ref(db, CONFIG_KEY));
    if (snap.exists()) _ticketConfig = snap.val();
  } catch(e) {}

  const esMobile = /Mobi|Android|iPhone|iPad|IEMobile/i.test(navigator.userAgent);
  if (esMobile) mostrarMensajeTicket(t);
  else imprimirTicketPOS(t);
}

function mostrarMensajeTicket(t) {
  const TZ = 'America/Asuncion';
  const cats = { comida: [], bebida: [], postre: [] };
  t.detalles.forEach(d => { (cats[d.cat || 'comida'] = cats[d.cat || 'comida'] || []).push(d); });
  
  const catIcons = { comida: '[COMIDA]', bebida: '[BEBIDA]', postre: '[POSTRE]' };
  const cabeza = _ticketConfig.header || '*** RESTAURANTE DELICIAS ***';
  const despedida = _ticketConfig.footer || 'Gracias por su visita';

  const lineas = [
    cabeza,
    `Mesa ${t.mesa} · Cliente ${t.clienteNum}°`,
    `Fecha: ${t.fecha || new Date().toLocaleDateString('es-PY', { timeZone: TZ })}  ${t.hora}`,
    `Mesero: ${t.mesero || '—'}`,
    '------------------------'
  ];
  
  ['comida', 'bebida', 'postre'].forEach(cat => {
    if (!cats[cat]?.length) return;
    lineas.push(`${catIcons[cat]} ${cat.toUpperCase()}S`);
    cats[cat].forEach(d => {
      const n = d.nombre.length > 24 ? d.nombre.slice(0, 23) + '...' : d.nombre;
      lineas.push(`  ${d.qty}× ${n}  ${fmt(d.sub)}`);
    });
  });
  
  lineas.push('------------------------', `TOTAL: ${fmt(t.total)}`, despedida);
  const msg = lineas.join('\n');

  let overlay = document.getElementById('overlay-msg-ticket');
  if (overlay) overlay.remove();
  overlay = document.createElement('div');
  overlay.id = 'overlay-msg-ticket';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.65);z-index:9998;display:flex;align-items:flex-end;justify-content:center;backdrop-filter:blur(4px);';
  overlay.innerHTML = `
    <div style="background:var(--surface);border-radius:24px 24px 0 0;padding:24px 20px 32px;width:100%;max-width:520px;border:1px solid var(--border);box-shadow:0 -8px 32px rgba(0,0,0,0.4);">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
        <div style="font-family:'Playfair Display',serif;font-size:1.15rem;font-weight:700;color:var(--text);display:flex;align-items:center;gap:8px;">
          <svg class="icon"><use href="#icon-receipt"/></svg> Resumen del pedido
        </div>
        <button onclick="document.getElementById('overlay-msg-ticket').remove()" style="background:var(--bg);border:none;border-radius:10px;width:34px;height:34px;cursor:pointer;color:var(--text-muted);">
          <svg class="icon icon-sm"><use href="#icon-x"/></svg>
        </button>
      </div>
      <pre style="font-family:'Courier New',monospace;font-size:0.82rem;color:var(--text-secondary);white-space:pre-wrap;background:var(--bg);border-radius:12px;padding:14px;border:1px solid var(--border);line-height:1.7;margin-bottom:16px;max-height:45vh;overflow-y:auto;">${msg}</pre>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <a href="https://wa.me/?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener"
          style="display:flex;align-items:center;justify-content:center;gap:8px;background:#25d366;color:#fff;border:none;border-radius:12px;padding:14px 10px;font-family:'DM Sans',sans-serif;font-weight:700;font-size:0.88rem;text-decoration:none;">
          WhatsApp
        </a>
        <button id="btn-copiar-ticket"
          style="display:flex;align-items:center;justify-content:center;gap:8px;background:var(--gold);color:#fff;border:none;border-radius:12px;padding:14px 10px;font-family:'DM Sans',sans-serif;font-weight:700;font-size:0.88rem;cursor:pointer;">
          <svg class="icon icon-sm"><use href="#icon-check"/></svg> Copiar
        </button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#btn-copiar-ticket').onclick = function() {
    navigator.clipboard?.writeText(msg).then(() => {
      this.innerHTML = '<svg class="icon icon-sm"><use href="#icon-check"/></svg> Copiado!';
      setTimeout(() => overlay.remove(), 900);
    }).catch(() => toast('No se pudo copiar', 3000, 'error'));
  };
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}

function imprimirTicketPOS(t) {
  const TZ = 'America/Asuncion';
  const now = new Date();
  const fechaTk = now.toLocaleDateString('es-PY', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: TZ });
  const horaTk = now.toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: TZ });
  const cats = { comida: [], bebida: [], postre: [] };
  t.detalles.forEach(d => { (cats[d.cat || 'comida'] = cats[d.cat || 'comida'] || []).push(d); });
  const catNames = { comida: '-- COMIDAS --', bebida: '-- BEBIDAS --', postre: '-- POSTRES --' };
  let itemsHtml = '';
  ['comida', 'bebida', 'postre'].forEach(cat => {
    if (!cats[cat]?.length) return;
    itemsHtml += `<div class="ticket-cat-hdr">${catNames[cat]}</div>`;
    cats[cat].forEach(d => {
      const nombre = d.nombre.length > 20 ? d.nombre.slice(0, 19) + '...' : d.nombre;
      itemsHtml += `<div class="ticket-row"><span class="ticket-item-name">${d.qty}x ${nombre}</span><span class="ticket-item-price">${fmt(d.sub)}</span></div>`;
    });
  });
  const ticketHeader = _ticketConfig.header
    ? `<div class="ticket-title" style="font-size:13pt;letter-spacing:2px;">${_ticketConfig.header}</div>`
    : `<div class="ticket-title">*** RESTAURANTE ***</div><div class="ticket-title" style="font-size:18pt;letter-spacing:5px;margin:2mm 0;">DELICIAS</div>`;

  getEl('ticket-print').innerHTML = `<div class="ticket-wrap">
    ${ticketHeader}
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
    <div class="ticket-center" style="font-size:10pt;font-weight:700;">${_ticketConfig.footer || 'MUCHAS GRACIAS!'}</div>
    <hr class="ticket-corte"/>
  </div>`;
  window.print();
}
