/**
 * config-publica.js — WiFi + Mensaje visible en el index público
 */
import { db, ref, set, get } from './firebase.js';
import { toast } from './ui.js';
import { registrarActividad } from './actividad.js';

const CONFIG_PATH = 'config/publico';
let _msgVisible = false;

/* ── Cargar al abrir tab Admin ── */
export async function cargarConfigPublica() {
  try {
    const snap = await get(ref(db, CONFIG_PATH));
    if (!snap.exists()) return;
    const c = snap.val();

    if (c.wifi) {
      const ssid = document.getElementById('cfg-wifi-ssid');
      const pass = document.getElementById('cfg-wifi-pass');
      if (ssid) ssid.value = c.wifi.ssid || '';
      if (pass) pass.value = c.wifi.pass || '';
    }

    if (c.mensaje) {
      _msgVisible = !!c.mensaje.visible;
      const txt = document.getElementById('cfg-msg-texto');
      if (txt) txt.value = c.mensaje.texto || '';
    }
    _actualizarToggle(_msgVisible);

  } catch(e) {
    console.warn('cargarConfigPublica error:', e);
  }
}

/* ── Toggle ── */
window.toggleMensaje = function() {
  _msgVisible = !_msgVisible;
  _actualizarToggle(_msgVisible);
};

function _actualizarToggle(visible) {
  const track = document.getElementById('cfg-msg-track');
  const thumb = document.getElementById('cfg-msg-thumb');
  const lbl   = document.getElementById('cfg-msg-lbl');  // ID correcto del HTML
  if (track) track.style.background = visible ? 'var(--gold)' : 'var(--border2)';
  if (thumb) thumb.style.transform  = visible ? 'translateX(20px)' : 'translateX(0)';
  if (lbl)   lbl.textContent        = visible ? 'Visible' : 'Oculto';
}

/* ── Guardar ── */
window.guardarConfigPublica = async function() {
  const ssid  = document.getElementById('cfg-wifi-ssid')?.value.trim()  || '';
  const pass  = document.getElementById('cfg-wifi-pass')?.value.trim()  || '';
  const texto = document.getElementById('cfg-msg-texto')?.value.trim()  || '';

  if (!ssid && !pass && !texto) {
    toast('Completá al menos un campo', 3000, 'warning');
    return;
  }

  try {
    await set(ref(db, CONFIG_PATH), {
      wifi:    { ssid, pass },
      mensaje: { visible: _msgVisible, texto }
    });
    await registrarActividad('accion-admin', 'Actualizó configuración pública (WiFi/Mensaje)');
    toast('Configuración guardada', 3000, 'success');
  } catch(e) {
    console.error('guardarConfigPublica error:', e);
    toast('⚠ Error al guardar', 3000, 'error');
  }
};
