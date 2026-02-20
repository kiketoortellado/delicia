/**
 * reportes.js — Exportación XLSX y Cierre de Caja
 * Usa SheetJS (XLSX) cargado dinámicamente desde CDN
 */
import Store from './state.js';
import { fmt, toast, fechaHoy } from './ui.js';
import { registrarActividad } from './actividad.js';

const TZ = 'America/Asuncion';
const CAT_LABELS = { bebida: 'Bebida', comida: 'Comida', postre: 'Postre' };

/* ── Cierre de Caja ─────────────────────────── */
window.cierreCaja = async function() {
  const sesion = Store.get('sesion');
  if (sesion?.role !== 'admin') { toast('Solo el Admin puede hacer cierre de caja.'); return; }

  const h     = Store.get('historial') || [];
  const hoy   = fechaHoy();
  const hHoy  = h.filter(r => (r.fecha || hoy) === hoy);

  if (!hHoy.length) { toast('No hay ventas registradas hoy.'); return; }

  const total = hHoy.reduce((s, r) => s + r.total, 0);
  const ok    = confirm(
    `¿Confirmar Cierre de Caja?\n\n` +
    `• Clientes atendidos: ${hHoy.length}\n` +
    `• Total a cerrar: ${fmt(total)}\n\n` +
    `Se descargará el Excel del día.`
  );
  if (!ok) return;

  await registrarActividad('accion-admin', 'Ejecutó Cierre de Caja — descargó XLSX del día');
  cargarYExportar(hHoy, true);
};

/* ── Exportar Excel general ─────────────────── */
export function exportarExcel(esCierre = false) {
  const h = Store.get('historial') || [];
  if (!h.length) { toast('No hay ventas para exportar.'); return; }
  cargarYExportar(h, esCierre);
}

window.exportCSV = function() { exportarExcel(false); };

/* ── Carga SheetJS dinámicamente ────────────── */
function cargarYExportar(hist, esCierre) {
  if (window.XLSX) { generarXLSX(hist, esCierre); return; }
  const script = document.createElement('script');
  script.src   = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
  script.onload  = () => generarXLSX(hist, esCierre);
  script.onerror = () => toast('⚠ Error cargando librería XLSX. Verificá tu conexión.');
  document.head.appendChild(script);
}

/* ── Generar workbook XLSX ──────────────────── */
function generarXLSX(hist, esCierre) {
  const XLSX = window.XLSX;
  const wb   = XLSX.utils.book_new();
  const fecha = new Date().toLocaleDateString('es-PY', { timeZone: TZ });

  // Paleta de colores
  const C = {
    rojo: 'C0392B', rojoMedio: 'E74C3C', rojoClaro: 'FADBD8',
    grisOscuro: '2C241B', grisClaro: 'F5F0EB', blanco: 'FFFFFF',
    naranja: 'C9A84C', naranjaClr: 'F9F5EB',
    verde: '2D6A4F', verdeClr: 'E8F5E9',
    azul: '4A6FA5', azulClr: 'E3F2FD',
    morado: '7B68EE', moradoClr: 'F3E5F5',
    gold: 'C9A84C'
  };

  const st = (bg, fg = '000000', bold = false, sz = 10, border = false, align = 'left', numFmt = '') => ({
    fill: { fgColor: { rgb: bg } },
    font: { color: { rgb: fg }, bold, sz, name: 'Arial' },
    alignment: { horizontal: align, vertical: 'center', wrapText: true },
    border: border ? {
      top: { style: 'thin', color: { rgb: 'D4C4B0' } },
      bottom: { style: 'thin', color: { rgb: 'D4C4B0' } },
      left: { style: 'thin', color: { rgb: 'D4C4B0' } },
      right: { style: 'thin', color: { rgb: 'D4C4B0' } }
    } : {},
    numFmt
  });

  const sc = (r, c) => XLSX.utils.encode_cell({ r, c });

  // Agrupar por mesa
  const byMesa = {};
  let totalGlobal = 0;
  hist.forEach(r => {
    if (!byMesa[r.mesa]) byMesa[r.mesa] = [];
    byMesa[r.mesa].push(r);
    totalGlobal += r.total;
  });
  const mesaKeys = Object.keys(byMesa).sort((a, b) => +a - +b);

  /* ─── Hoja 1: Detalle ─────────────────────── */
  const ws1d = [
    ['RESTAURANTE DELICIAS — HISTORIAL DE VENTAS', ...Array(9).fill('')],
    [`Fecha: ${fecha}   |   ${esCierre ? 'CIERRE DE CAJA' : 'Exportación parcial'}   |   Total: ${fmt(totalGlobal)}`, ...Array(9).fill('')],
    [''],
    ['Mesa', 'Cliente', 'Hora', 'Categoría', 'Producto', 'Cant.', 'Precio Unit.', 'Subtotal', 'Mesero', 'Usuario']
  ];

  mesaKeys.forEach(mesa => {
    byMesa[mesa].forEach(r => {
      r.detalles.forEach(d => {
        ws1d.push([`Mesa ${mesa}`, `${r.clienteNum}°`, r.hora,
          CAT_LABELS[d.cat || 'comida'] || d.cat || '',
          d.nombre, d.qty, Math.round(d.precio), Math.round(d.sub),
          r.mesero || '—', r.usuario || '—'
        ]);
      });
    });
    const totM = byMesa[mesa].reduce((s, r) => s + r.total, 0);
    ws1d.push([`SUBTOTAL MESA ${mesa}`, '', '', '', '', '', '', Math.round(totM), '', '']);
    ws1d.push(['']);
  });
  ws1d.push(['']);
  ws1d.push(['INGRESO TOTAL DE LA NOCHE', '', '', '', '', '', '', Math.round(totalGlobal), '', '']);

  const ws1 = XLSX.utils.aoa_to_sheet(ws1d);
  ws1['!cols'] = [{ wch: 13 }, { wch: 9 }, { wch: 7 }, { wch: 11 }, { wch: 20 }, { wch: 7 }, { wch: 16 }, { wch: 15 }, { wch: 16 }, { wch: 14 }];

  // Merges
  const ms1 = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 9 } }, { s: { r: 1, c: 0 }, e: { r: 1, c: 9 } }];
  let ri = 4;
  mesaKeys.forEach(mesa => {
    const lineas = byMesa[mesa].reduce((s, r) => s + r.detalles.length, 0);
    ri += lineas;
    ms1.push({ s: { r: ri, c: 0 }, e: { r: ri, c: 6 } });
    ri += 2;
  });
  const lastR = ws1d.length - 1;
  ms1.push({ s: { r: lastR, c: 0 }, e: { r: lastR, c: 6 } });
  ws1['!merges'] = ms1;

  // Estilos encabezado
  ws1[sc(0, 0)] = { v: ws1d[0][0], t: 's', s: st(C.gold, C.blanco, true, 14, false, 'center') };
  ws1[sc(1, 0)] = { v: ws1d[1][0], t: 's', s: st(C.rojoMedio, C.blanco, false, 9, false, 'center') };
  ['Mesa', 'Cliente', 'Hora', 'Categoría', 'Producto', 'Cant.', 'Precio Unit.', 'Subtotal', 'Mesero', 'Usuario']
    .forEach((h2, ci) => { ws1[sc(3, ci)] = { v: h2, t: 's', s: st(C.grisOscuro, C.blanco, true, 10, true, 'center') }; });

  // Estilos filas detalle
  let ri2 = 4, alt = false;
  mesaKeys.forEach(mesa => {
    byMesa[mesa].forEach(r => {
      r.detalles.forEach(d => {
        const catC = { comida: C.grisClaro, bebida: C.azulClr, postre: C.moradoClr }[d.cat || 'comida'] || C.blanco;
        const bg = alt ? catC : C.blanco;
        const row = ws1d[ri2];
        row.forEach((v, ci) => {
          const isN = ci === 5 || ci === 6 || ci === 7;
          ws1[sc(ri2, ci)] = { v: isN ? Number(v) : v, t: isN ? 'n' : 's', s: st(bg, '000000', false, 10, true, isN ? 'right' : 'left', isN ? '#,##0' : '') };
        });
        ri2++;
      });
      alt = !alt;
    });
    const stRow = ws1d[ri2];
    ws1[sc(ri2, 0)] = { v: stRow[0], t: 's', s: st(C.naranjaClr, C.naranja, true, 10, true, 'left') };
    for (let ci = 1; ci <= 6; ci++) ws1[sc(ri2, ci)] = { v: '', t: 's', s: st(C.naranjaClr, C.naranja, true, 10, true) };
    ws1[sc(ri2, 7)] = { v: Number(stRow[7]), t: 'n', s: st(C.naranjaClr, C.naranja, true, 10, true, 'right', '#,##0') };
    ws1[sc(ri2, 8)] = { v: '', t: 's', s: st(C.naranjaClr, C.naranja, true, 10, true) };
    ws1[sc(ri2, 9)] = { v: '', t: 's', s: st(C.naranjaClr, C.naranja, true, 10, true) };
    ri2 += 2;
  });
  ws1[sc(lastR, 0)] = { v: 'INGRESO TOTAL DE LA NOCHE', t: 's', s: st(C.verde, C.blanco, true, 12, true, 'left') };
  for (let ci = 1; ci <= 6; ci++) ws1[sc(lastR, ci)] = { v: '', t: 's', s: st(C.verde, C.blanco, true, 12, true) };
  ws1[sc(lastR, 7)] = { v: Math.round(totalGlobal), t: 'n', s: st(C.verde, C.blanco, true, 12, true, 'right', '#,##0') };
  ws1[sc(lastR, 8)] = { v: '', t: 's', s: st(C.verde, C.blanco, true, 12, true) };
  ws1[sc(lastR, 9)] = { v: '', t: 's', s: st(C.verde, C.blanco, true, 12, true) };
  ws1['!rows'] = []; ws1['!rows'][0] = { hpt: 26 }; ws1['!rows'][1] = { hpt: 15 }; ws1['!rows'][3] = { hpt: 18 };
  XLSX.utils.book_append_sheet(wb, ws1, 'Detalle de Ventas');

  /* ─── Hoja 2: Resumen por Mesa ─────────────── */
  const ws2d = [
    ['RESTAURANTE DELICIAS — RESUMEN POR MESA', '', '', '', '', '', ''],
    [`Fecha: ${fecha}`, '', '', '', '', '', ''], [''],
    ['Mesa', 'Clientes', 'Bebidas (Gs.)', 'Comidas (Gs.)', 'Postres (Gs.)', 'Total (Gs.)', '% del Total']
  ];
  mesaKeys.forEach(mesa => {
    const rs  = byMesa[mesa]; const cl = rs.length;
    const tot = rs.reduce((s, r) => s + r.total, 0);
    const beb = rs.reduce((s, r) => s + r.detalles.filter(d => (d.cat || 'comida') === 'bebida').reduce((a, d) => a + d.sub, 0), 0);
    const com = rs.reduce((s, r) => s + r.detalles.filter(d => (d.cat || 'comida') === 'comida').reduce((a, d) => a + d.sub, 0), 0);
    const pos = rs.reduce((s, r) => s + r.detalles.filter(d => (d.cat || 'comida') === 'postre').reduce((a, d) => a + d.sub, 0), 0);
    ws2d.push([`Mesa ${mesa}`, cl, Math.round(beb), Math.round(com), Math.round(pos), Math.round(tot), totalGlobal > 0 ? tot / totalGlobal : 0]);
  });
  ws2d.push(['']);
  ws2d.push(['TOTAL', hist.length,
    Math.round(mesaKeys.reduce((s, m) => s + byMesa[m].reduce((a, r) => a + r.detalles.filter(d => (d.cat || 'comida') === 'bebida').reduce((x, d) => x + d.sub, 0), 0), 0)),
    Math.round(mesaKeys.reduce((s, m) => s + byMesa[m].reduce((a, r) => a + r.detalles.filter(d => (d.cat || 'comida') === 'comida').reduce((x, d) => x + d.sub, 0), 0), 0)),
    Math.round(mesaKeys.reduce((s, m) => s + byMesa[m].reduce((a, r) => a + r.detalles.filter(d => (d.cat || 'comida') === 'postre').reduce((x, d) => x + d.sub, 0), 0), 0)),
    Math.round(totalGlobal), 1
  ]);

  const ws2 = XLSX.utils.aoa_to_sheet(ws2d);
  ws2['!cols'] = [{ wch: 12 }, { wch: 10 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 12 }];
  ws2['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 6 } }, { s: { r: 1, c: 0 }, e: { r: 1, c: 6 } }];
  ws2[sc(0, 0)] = { v: ws2d[0][0], t: 's', s: st(C.gold, C.blanco, true, 13, false, 'center') };
  ws2[sc(1, 0)] = { v: ws2d[1][0], t: 's', s: st(C.rojoMedio, C.blanco, false, 9, false, 'center') };
  ['Mesa', 'Clientes', 'Bebidas (Gs.)', 'Comidas (Gs.)', 'Postres (Gs.)', 'Total (Gs.)', '% del Total']
    .forEach((h2, ci) => { ws2[sc(3, ci)] = { v: h2, t: 's', s: st(C.grisOscuro, C.blanco, true, 10, true, 'center') }; });
  mesaKeys.forEach((mesa, idx) => {
    const ri3 = 4 + idx; const bg = idx % 2 === 0 ? C.azulClr : C.blanco; const row = ws2d[ri3];
    ws2[sc(ri3, 0)] = { v: row[0], t: 's', s: st(bg, '000000', false, 10, true, 'left') };
    ws2[sc(ri3, 1)] = { v: Number(row[1]), t: 'n', s: st(bg, '000000', false, 10, true, 'center') };
    [2, 3, 4, 5].forEach(ci => ws2[sc(ri3, ci)] = { v: Number(row[ci]), t: 'n', s: st(bg, '000000', false, 10, true, 'right', '#,##0') });
    ws2[sc(ri3, 6)] = { v: Number(row[6]), t: 'n', s: st(bg, '000000', false, 10, true, 'center', '0.0%') };
  });
  const totRi = 4 + mesaKeys.length + 1;
  ws2[sc(totRi, 0)] = { v: 'TOTAL', t: 's', s: st(C.verde, C.blanco, true, 11, true, 'left') };
  ws2[sc(totRi, 1)] = { v: hist.length, t: 'n', s: st(C.verde, C.blanco, true, 11, true, 'center') };
  [2, 3, 4, 5].forEach(ci => ws2[sc(totRi, ci)] = { v: Number(ws2d[totRi][ci]), t: 'n', s: st(C.verde, C.blanco, true, 11, true, 'right', '#,##0') });
  ws2[sc(totRi, 6)] = { v: 1, t: 'n', s: st(C.verde, C.blanco, true, 11, true, 'center', '0.0%') };
  ws2['!rows'] = []; ws2['!rows'][0] = { hpt: 24 }; ws2['!rows'][3] = { hpt: 17 };
  XLSX.utils.book_append_sheet(wb, ws2, 'Resumen por Mesa');

  /* ─── Hoja 3: Categorías ──────────────────── */
  const catTotals = { bebida: 0, comida: 0, postre: 0 };
  hist.forEach(r => r.detalles.forEach(d => { catTotals[d.cat || 'comida'] = (catTotals[d.cat || 'comida'] || 0) + d.sub; }));
  const ws3d = [
    ['RESTAURANTE DELICIAS — VENTAS POR CATEGORÍA', '', ''],
    [`Fecha: ${fecha}`, '', ''], [''],
    ['Categoría', 'Total Vendido (Gs.)', '% del Total'],
    ['Bebidas', Math.round(catTotals.bebida), totalGlobal > 0 ? catTotals.bebida / totalGlobal : 0],
    ['Comidas', Math.round(catTotals.comida), totalGlobal > 0 ? catTotals.comida / totalGlobal : 0],
    ['Postres', Math.round(catTotals.postre), totalGlobal > 0 ? catTotals.postre / totalGlobal : 0],
    [''], ['TOTAL', Math.round(totalGlobal), 1]
  ];
  const ws3 = XLSX.utils.aoa_to_sheet(ws3d);
  ws3['!cols'] = [{ wch: 16 }, { wch: 20 }, { wch: 14 }];
  ws3['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 2 } }, { s: { r: 1, c: 0 }, e: { r: 1, c: 2 } }];
  ws3[sc(0, 0)] = { v: ws3d[0][0], t: 's', s: st(C.gold, C.blanco, true, 13, false, 'center') };
  ws3[sc(1, 0)] = { v: ws3d[1][0], t: 's', s: st(C.rojoMedio, C.blanco, false, 9, false, 'center') };
  ['Categoría', 'Total Vendido (Gs.)', '% del Total']
    .forEach((h2, ci) => { ws3[sc(3, ci)] = { v: h2, t: 's', s: st(C.grisOscuro, C.blanco, true, 10, true, 'center') }; });
  const catColors = { 4: C.azulClr, 5: C.grisClaro, 6: C.moradoClr };
  [4, 5, 6].forEach(ri => {
    const row = ws3d[ri]; const bg = catColors[ri];
    ws3[sc(ri, 0)] = { v: row[0], t: 's', s: st(bg, '000000', false, 11, true, 'left') };
    ws3[sc(ri, 1)] = { v: Number(row[1]), t: 'n', s: st(bg, '000000', true, 11, true, 'right', '#,##0') };
    ws3[sc(ri, 2)] = { v: Number(row[2]), t: 'n', s: st(bg, '000000', false, 11, true, 'center', '0.0%') };
  });
  ws3[sc(8, 0)] = { v: 'TOTAL', t: 's', s: st(C.verde, C.blanco, true, 12, true, 'left') };
  ws3[sc(8, 1)] = { v: Math.round(totalGlobal), t: 'n', s: st(C.verde, C.blanco, true, 12, true, 'right', '#,##0') };
  ws3[sc(8, 2)] = { v: 1, t: 'n', s: st(C.verde, C.blanco, true, 12, true, 'center', '0.0%') };
  ws3['!rows'] = []; ws3['!rows'][0] = { hpt: 24 }; ws3['!rows'][3] = { hpt: 18 };
  XLSX.utils.book_append_sheet(wb, ws3, 'Ventas por Categoría');

  /* ─── Hoja 4: Actividad ───────────────────── */
  const actividad = Store.get('actividad') || [];
  const ws4d = [
    ['RESTAURANTE DELICIAS — ACTIVIDAD DE USUARIOS', '', '', ''],
    [`Fecha: ${fecha}`, '', '', ''], [''],
    ['Fecha/Hora', 'Usuario', 'Rol', 'Acción']
  ];
  actividad.slice(0, 500).forEach(a => {
    const roleLbl = { admin: 'Admin', mesero: 'Mesero', cocinero: 'Cocinero/a' }[a.role] || a.role;
    ws4d.push([a.fechaHora || '—', a.usuario || '—', roleLbl, a.msg || '—']);
  });

  const ws4 = XLSX.utils.aoa_to_sheet(ws4d);
  ws4['!cols'] = [{ wch: 17 }, { wch: 18 }, { wch: 12 }, { wch: 52 }];
  ws4['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 3 } }, { s: { r: 1, c: 0 }, e: { r: 1, c: 3 } }];
  ws4[sc(0, 0)] = { v: ws4d[0][0], t: 's', s: st(C.gold, C.blanco, true, 13, false, 'center') };
  ws4[sc(1, 0)] = { v: ws4d[1][0], t: 's', s: st(C.rojoMedio, C.blanco, false, 9, false, 'center') };
  ['Fecha/Hora', 'Usuario', 'Rol', 'Acción']
    .forEach((h2, ci) => { ws4[sc(3, ci)] = { v: h2, t: 's', s: st(C.grisOscuro, C.blanco, true, 10, true, 'center') }; });
  actividad.slice(0, 500).forEach((a, idx) => {
    const ri = 4 + idx; const bg = idx % 2 === 0 ? C.grisClaro : C.blanco;
    const roleLbl = { admin: 'Admin', mesero: 'Mesero', cocinero: 'Cocinero/a' }[a.role] || a.role;
    [a.fechaHora, a.usuario, roleLbl, a.msg].forEach((v, ci) => {
      ws4[sc(ri, ci)] = { v: v || '', t: 's', s: st(bg, ci === 2 && a.role === 'admin' ? C.gold : '000000', ci === 2 && a.role === 'admin', 9, true, 'left') };
    });
  });
  ws4['!rows'] = []; ws4['!rows'][0] = { hpt: 24 }; ws4['!rows'][3] = { hpt: 17 };
  XLSX.utils.book_append_sheet(wb, ws4, 'Actividad de Usuarios');

  /* ─── Descargar ───────────────────────────── */
  const fechaArch = new Date().toISOString().slice(0, 10);
  const nombre    = esCierre
    ? `Cierre_Caja_Delicias_${fechaArch}.xlsx`
    : `Restaurante_Delicias_${fechaArch}.xlsx`;

  XLSX.writeFile(wb, nombre);
  toast(`${esCierre ? 'Cierre de Caja' : 'Excel'} descargado`);
}
