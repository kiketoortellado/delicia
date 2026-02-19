/**
 * mesas.js — Gestión de mesas, pedidos y pagos
 */

import { db, ref, set, runTransaction } from './firebase.js';
import Store from './state.js';
import { html, getEl, setText, fmt, toast, hora, fechaHoy } from './ui.js';
import { registrarActividad } from './actividad.js';

const TOTAL_MESAS = 12;

let mesaAbierta = null;
let pedidoActual = {};
let catActiva = 'todos';
let timerInterval = null;

/* ── Mesa por defecto ───────────────────────── */
function mesaDefault() {
  return {
    ocupada: false,
    pedidoActual: {},
    mesero: '',
    ultimoUsuario: '',
    tsOcupada: null,
    clientesNoche: []
  };
}

/* ── Calcular total ─────────────────────────── */
function calcTotal(pedido) {
  if (!pedido) return 0;
  const productos = Store.get('productos') || [];
  return Object.entries(pedido).reduce((s, [pid, qty]) => {
    const p = productos.find(p => String(p.id) === String(pid));
    return s + (p ? p.precio * qty : 0);
  }, 0);
}
