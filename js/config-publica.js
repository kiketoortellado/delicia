/**
 * config-publica.js — WiFi + Mensaje de bienvenida en página pública
 */
import { db, ref, set, get } from './firebase.js';
import { toast } from './ui.js';
import { registrarActividad } from './actividad.js';

const CONFIG_REF = 'config/publico';
let _msgVisible = false;

/* ── Cargar config al abrir tab Admin ── */
export async function cargarConfigPublica() {
  try {
    const snap = await get(ref(db, CONFIG_REF));
    if (!snap.exists()) return;
    const c = snap.val();

    if (c.wifi) {
      const s = document.getElementById('cfg-wifi-ssid');
      const p = document.getElementById('cfg-wifi-pass');
      if (s) s.value = c.wifi.ssid || '';
      if (p) p.value = c.wifi.pass || '';
    }

    if (c.mensaje) {
      _msgVisible = !!c.mensaje.visible;
      const t = document.getElementById('cfg-msg-texto');
      if (t) t.value = c.mensaje.texto || '';
      actualizarToggle(_msgVisible);
    }
  } catch(e) {
    console.warn('Error cargando config pública:', e);
  }
}

/* ── Toggle visible/oculto ── */
window.toggleMensaje = function() {
  _msgVisible = !_msgVisible;
  actualizarToggle(_msgVisible);
};

function actualizarToggle(visible) {
  const track = document.getElementById('cfg-msg-track');
  const lbl   = document.getElementById('cfg-msg-visible-lbl');
  if (track) track.classList.toggle('on', visible);
  if (lbl)   lbl.textContent = visible ? 'Visible' : 'Oculto';
}

/* ── Guardar todo ── */
window.guardarConfigPublica = async function() {
  const ssid  = document.getElementById('cfg-wifi-ssid')?.value.trim() || '';
  const pass  = document.getElementById('cfg-wifi-pass')?.value.trim() || '';
  const texto = document.getElementById('cfg-msg-texto')?.value.trim() || '';

  try {
    await set(ref(db, CONFIG_REF), {
      wifi:    { ssid, pass },
      mensaje: { visible: _msgVisible, texto }
    });
    await registrarActividad('accion-admin', 'Actualizó configuración pública (WiFi/Mensaje)');
    toast('✓ Configuración guardada');
  } catch(e) {
    console.error('Error guardando config:', e);
    toast('⚠ Error al guardar');
  }
};
