/**
 * productos.js — CRUD de productos
 */
import Store from './state.js';
import { getEl, html, fmt, toast } from './ui.js';
import { db, ref, set } from './firebase.js';
import { registrarActividad } from './actividad.js';

export const CAT_LABELS = { bebida: 'Bebida', comida: 'Comida', postre: 'Postre' };
export const CAT_ICONS  = { bebida: 'icon-drink', comida: 'icon-food', postre: 'icon-dessert' };

/* ── Guardar productos en Firebase ──────────── */
const saveProductos = async () => {
  try {
    await set(ref(db, 'productos'), Store.get('productos'));
  } catch (e) {
    console.error('Error guardando productos:', e);
    toast('⚠ Error al guardar productos.');
  }
};

/* ── Render lista admin ─────────────────────── */
export function renderProductosAdmin() {
  const sesion    = Store.get('sesion');
  const productos = Store.get('productos') || [];

  if (sesion?.role === 'cocinero') return;

  html('productos-admin-list', productos.length
    ? productos.map(p => `
        <div class="prod-card">
          <div>
            <div class="pname">${p.nombre}</div>
            <div class="pprice">${fmt(p.precio)}</div>
            <span class="pcat ${p.cat || 'comida'}">
              <svg class="icon icon-sm"><use href="#${CAT_ICONS[p.cat || 'comida']}"/></svg>
              ${CAT_LABELS[p.cat || 'comida']}
            </span>
          </div>
          <div class="prod-card-actions">
            ${sesion?.role === 'admin' ? `
              <button class="icon-btn" onclick="abrirEditProd(${p.id})" title="Editar">
                <svg class="icon"><use href="#icon-edit"/></svg>
              </button>
              <button class="icon-btn" onclick="eliminarProd(${p.id})" title="Eliminar">
                <svg class="icon"><use href="#icon-trash"/></svg>
              </button>` : ''}
          </div>
        </div>`).join('')
    : '<div style="color:var(--text-muted)">Sin productos.</div>');
}

/* ── Agregar producto ───────────────────────── */
window.agregarProducto = async function() {
  const sesion = Store.get('sesion');
  if (sesion?.role !== 'admin') { toast('Solo el Admin puede añadir productos.'); return; }

  const nombre = getEl('prod-nombre').value.trim();
  const precio = parseInt(getEl('prod-precio').value);
  const cat    = getEl('prod-cat').value;

  if (!nombre)                  { toast('Ingresa el nombre.'); return; }
  if (isNaN(precio) || precio < 0) { toast('Precio inválido.'); return; }

  const productos = Store.get('productos') || [];
  const id = productos.length ? Math.max(...productos.map(p => p.id)) + 1 : 1;
  productos.push({ id, nombre, precio, cat });
  Store.set('productos', productos);
  await saveProductos();

  getEl('prod-nombre').value = '';
  getEl('prod-precio').value = '';
  await registrarActividad('accion-producto', `Añadió "${nombre}" (${CAT_LABELS[cat]}) — ${fmt(precio)}`);
  toast(`"${nombre}" añadido.`);
};

/* ── Eliminar producto ──────────────────────── */
window.eliminarProd = async function(id) {
  const sesion = Store.get('sesion');
  if (sesion?.role !== 'admin') { toast('Solo el Admin.'); return; }
  if (!confirm('¿Eliminar este producto?')) return;

  const productos = Store.get('productos') || [];
  const p = productos.find(p => p.id === id);
  Store.set('productos', productos.filter(p => p.id !== id));
  await saveProductos();
  await registrarActividad('accion-producto', `Eliminó producto "${p?.nombre}"`);
  toast('Producto eliminado.');
};

/* ── Editar producto ────────────────────────── */
window.abrirEditProd = function(id) {
  const productos = Store.get('productos') || [];
  const p = productos.find(p => p.id === id);
  if (!p) return;
  getEl('edit-prod-id').value     = id;
  getEl('edit-prod-nombre').value = p.nombre;
  getEl('edit-prod-precio').value = p.precio;
  getEl('edit-prod-cat').value    = p.cat || 'comida';
  getEl('modal-edit-prod').classList.add('open');
};

window.guardarEditProd = async function() {
  const sesion = Store.get('sesion');
  if (sesion?.role !== 'admin') { toast('Solo el Admin.'); return; }

  const id     = parseInt(getEl('edit-prod-id').value);
  const nombre = getEl('edit-prod-nombre').value.trim();
  const precio = parseInt(getEl('edit-prod-precio').value);
  const cat    = getEl('edit-prod-cat').value;

  if (!nombre || isNaN(precio)) { toast('Completa los campos.'); return; }

  const productos = Store.get('productos') || [];
  const p = productos.find(p => p.id === id);
  if (p) { p.nombre = nombre; p.precio = precio; p.cat = cat; }
  Store.set('productos', productos);
  await saveProductos();
  window.cerrarEditProd();
  await registrarActividad('accion-producto', `Editó "${nombre}" → ${fmt(precio)} (${CAT_LABELS[cat]})`);
  toast('Producto actualizado.');
};

window.cerrarEditProd = () => getEl('modal-edit-prod')?.classList.remove('open');
