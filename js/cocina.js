/**
 * cocina.js — Vista de cocina (modo cocinero)
 */
import Store from './state.js';
import { getEl, html, fmt, hora } from './ui.js';
import { registrarActividad } from './actividad.js';
import { registrarPresencia } from './auth.js';

const TOTAL_MESAS   = 12;
const CAT_LABELS    = { bebida: 'Bebida', comida: 'Comida', postre: 'Postre' };

let cocinaTimerInterval = null;
let historialCocinaLocal = [];

/* ── Mostrar vista cocina ───────────────────── */
export function mostrarCocina() {
  const sesion = Store.get('sesion');
  const app    = getEl('cocina-app');
  if (!app) return;

  app.classList.add('show');
  const lbl = getEl('cocina-user-lbl');
  if (lbl) lbl.innerHTML = `<svg class="icon icon-sm"><use href="#icon-chef"/></svg> ${sesion.nombre || sesion.username}`;

  renderCocina();
  iniciarTimersCocina();
  registrarActividad('accion-login', 'Ingresó como Cocinero/a');
  registrarPresencia();
}

/* ── Render tarjetas cocina ─────────────────── */
export function renderCocina() {
  const mesas     = Store.get('mesas') || {};
  const productos = Store.get('productos') || [];

  const mesasConComida = [];

  for (let i = 1; i <= TOTAL_MESAS; i++) {
    const m = mesas[i];
    if (!m?.ocupada || !m.pedidoActual) continue;

    const itemsComida = Object.entries(m.pedidoActual).filter(([pid, qty]) => {
      const p = productos.find(p => String(p.id) === String(pid));
      return p && (p.cat || 'comida') === 'comida' && qty > 0;
    });

    if (itemsComida.length > 0) {
      mesasConComida.push({ num: i, mesa: m, items: itemsComida, ts: m.tsOcupada || 0 });
    }
  }

  // Ordenar de más reciente a más antiguo
  mesasConComida.sort((a, b) => b.ts - a.ts);
  const visibles = mesasConComida.slice(0, 5);
  const ocultas  = mesasConComida.slice(5);

  // Registrar ocultas en historial local de cocina
  ocultas.forEach(({ num, mesa, items }) => {
    const yaEsta = historialCocinaLocal.some(h => h.mesaNum === num && h.tipo === 'oculta');
    if (!yaEsta) {
      historialCocinaLocal.unshift({
        mesaNum: num, mesero: mesa.mesero || '—', hora: hora(), tipo: 'oculta',
        items: items.map(([pid, qty]) => {
          const p = productos.find(p => String(p.id) === String(pid));
          return { nombre: p ? p.nombre : '?', qty };
        })
      });
    }
  });

  // Limpiar ocultas que volvieron a ser visibles
  const numsVisibles = visibles.map(v => v.num);
  historialCocinaLocal = historialCocinaLocal.filter(h =>
    !(h.tipo === 'oculta' && numsVisibles.includes(h.mesaNum))
  );

  // Badge
  const badge = getEl('cocina-badge');
  if (badge) {
    const total = mesasConComida.length;
    const oculN = ocultas.length;
    badge.textContent = total === 0
      ? 'Sin pedidos'
      : `${total} pedido${total !== 1 ? 's' : ''}${oculN > 0 ? ` · ${oculN} oculto${oculN !== 1 ? 's' : ''}` : ''}`;
  }

  if (!visibles.length) {
    html('cocina-grid', `<div class="cocina-empty">
      <svg class="icon cocina-empty-icon" viewBox="0 0 24 24" fill="none" stroke="#a0a0b0" stroke-width="1">
        <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/>
        <path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>
      </svg>
      <div class="cocina-empty-txt">Sin pedidos de comida activos</div>
    </div>`);
    return;
  }

  html('cocina-grid', visibles.map(({ num, mesa, items }, idx) => {
    const itemsHtml = items.map(([pid, qty]) => {
      const p = productos.find(p => String(p.id) === String(pid));
      if (!p) return '';
      return `<div class="cocina-item">
        <div class="cocina-item-qty">${qty}</div>
        <div>
          <div class="cocina-item-name">${p.nombre}</div>
          <div class="cocina-item-cat">${CAT_LABELS[p.cat || 'comida']}</div>
        </div>
      </div>`;
    }).join('');

    const esNuevo     = idx === 0;
    const borderColor = esNuevo ? '#e94560' : '#2a2a4a';
    const extraClass  = esNuevo ? 'nueva' : '';

    return `<div class="cocina-card ${extraClass}" style="border-color:${borderColor};">
      <div class="cocina-card-header">
        <div style="display:flex;align-items:flex-start;gap:12px;">
          <div style="background:${esNuevo ? '#e94560' : 'rgba(255,255,255,0.1)'};color:${esNuevo ? '#fff' : '#a0a0b0'};font-family:'DM Sans',sans-serif;font-size:0.75rem;font-weight:800;padding:4px 12px;border-radius:20px;margin-top:4px;letter-spacing:0.08em;white-space:nowrap;">
            ${esNuevo ? 'NUEVO' : '#' + (idx + 1)}
          </div>
          <div>
            <div class="cocina-mesa-lbl">Mesa</div>
            <div class="cocina-mesa-num">${num}</div>
          </div>
        </div>
        <div>
          <div class="cocina-timer-big" id="cocina-timer-${num}"></div>
        </div>
      </div>
      <div class="cocina-card-body">
        <div class="cocina-items-list">${itemsHtml}</div>
      </div>
      <div class="cocina-card-footer">
        <div class="cocina-mesero">
          <svg class="icon icon-sm" style="stroke:#a0a0b0"><use href="#icon-user"/></svg>
          ${mesa.mesero || '—'}
        </div>
      </div>
    </div>`;
  }).join(''));
}

/* ── Historial cocina (pedidos anteriores) ── */
window.abrirHistCocina = function() {
  const cuerpo = getEl('hist-cocina-body');
  if (!cuerpo) return;

  if (!historialCocinaLocal.length) {
    cuerpo.innerHTML = '<div class="empty-state" style="color:#a0a0b0;"><p>Sin pedidos anteriores.</p></div>';
  } else {
    cuerpo.innerHTML = historialCocinaLocal.slice(0, 30).map(h => `
      <div style="background:rgba(255,255,255,0.05);border:1px solid #2a2a4a;border-radius:12px;padding:16px;margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <span style="font-family:'Playfair Display',serif;font-size:1.1rem;color:#eaeaea;font-weight:700;">Mesa ${h.mesaNum}</span>
          <span style="font-size:0.8rem;color:#a0a0b0;">${h.hora}</span>
        </div>
        <div style="font-size:0.9rem;color:#c0c0d0;">
          ${h.items.map(i => `<span style="margin-right:12px;">${i.qty}× ${i.nombre}</span>`).join('')}
        </div>
        ${h.mesero ? `<div style="font-size:0.8rem;color:#a0a0b0;margin-top:6px;">Mesero: ${h.mesero}</div>` : ''}
      </div>`).join('');
  }
  getEl('modal-hist-cocina').classList.add('open');
};

/* ── Logout cocina ──────────────────────────── */
window.logoutCocina = async function() {
  const { doLogout } = await import('./auth.js');
  await doLogout();
};

/* ── Timers cocina ──────────────────────────── */
export function iniciarTimersCocina() {
  detenerTimersCocina();
  cocinaTimerInterval = setInterval(actualizarTimersCocina, 1000);
}
export function detenerTimersCocina() {
  if (cocinaTimerInterval) { clearInterval(cocinaTimerInterval); cocinaTimerInterval = null; }
}

function actualizarTimersCocina() {
  const ahora = Date.now();
  const mesas = Store.get('mesas') || {};

  for (let i = 1; i <= TOTAL_MESAS; i++) {
    const el = document.getElementById(`cocina-timer-${i}`);
    if (!el) continue;
    const m = mesas[i];
    if (!m?.ocupada || !m.tsOcupada) { el.textContent = ''; el.className = 'cocina-timer-big'; continue; }

    const diff = Math.floor((ahora - m.tsOcupada) / 1000);
    const h2 = Math.floor(diff / 3600), mn = Math.floor((diff % 3600) / 60), s = diff % 60;
    el.innerHTML = `<svg class="icon icon-sm" style="stroke:currentColor"><use href="#icon-clock"/></svg> ` +
      (h2 > 0
        ? `${h2}h ${String(mn).padStart(2,'0')}m ${String(s).padStart(2,'0')}s`
        : `${String(mn).padStart(2,'0')}m ${String(s).padStart(2,'0')}s`);
    el.className = 'cocina-timer-big' + (diff >= 5400 ? ' alerta' : '');
  }
}
