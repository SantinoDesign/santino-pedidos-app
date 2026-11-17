/* Santino Pedidos · pestaña Otros > Tareas del día (16-nov-2026, migraciones 0106 y 0107).
   Harold (16-nov): para el Black Friday necesita saber cuántas Venecia y estructuras hay en stock, y que Alexis lo cuente
   desde la app: "hazlo tú nomás, piensa en todo lo que conoces porque quítame tiempo".
   Una tarea = texto, fecha, responsable (o cualquiera) y hecha. Cada tarea se despliega. Tipo "conteo_stock": Alexis agrega
   líneas con listas (estructuras, cubiertas en bruto, cubiertas barnizadas) y una cantidad, corrige o borra las suyas y marca
   la tarea hecha; Harold ve el resumen ordenado por grupo, modelo y madera. Las tareas las crea Harold (+ Nueva tarea).
   Se carga antes de app.js y usa sus utilidades (sb, yo, $, $$, esc, aviso, modal, rpc, fecha, fechaHora, hoyISO, barra…). */
'use strict';

const TAR = { pend: 0, abiertas: new Set(), form: {}, verHechas: false, auto: true };
const TAR_ALEXIS = 'fcf7fed2-795c-4d95-8878-1219e8311a48';   // perfil de Alexis (operacion)
const TAR_GRUPOS = [['estructura', 'Estructuras'], ['cubierta_bruto', 'Cubiertas en bruto'], ['cubierta_barnizada', 'Cubiertas barnizadas']];
const TAR_MODELOS = ['Venecia', 'Fiorella', 'Praga', 'Mesa lenga exterior', 'Bancas', 'Otro'];
const TAR_COLORES = ['Negra', 'Blanca', 'En bruto'];
const TAR_TONOS = ['1', '2', '3', '4', '5', 'Negro', 'Nogal'];
// Medidas de catálogo de las cubiertas de 4, 6 y 8 personas (motor_precios.js, Venecia rectangular: pino 3,2 y lenga 3,4)
const TAR_MEDIDAS = { Pino: [[4, 120, 80], [6, 160, 90], [8, 190, 90]], Lenga: [[4, 130, 90], [6, 170, 90], [8, 210, 100]] };
TAR_MEDIDAS['Roble Americano'] = TAR_MEDIDAS.Lenga; TAR_MEDIDAS['Roble Chileno'] = TAR_MEDIDAS.Lenga; // 17-nov: mismas medidas de lenga, más Otra medida
const tarAdmin = () => yo && yo.rol === 'admin';
const tarEsMia = t => !t.responsable || t.responsable === yo.id || tarAdmin();

/* ---------- datos ---------- */
async function tarCargar() {
  const desde = hoyISO(-30);
  const { data, error } = await sb.from('v_tarea_dia').select('*').or(`fecha.gte.${desde},hecha_en.is.null`).order('fecha').order('hora', { nullsFirst: false }).order('id');
  if (error) throw error;
  const tareas = data || [];
  const conteos = tareas.filter(t => t.tipo === 'conteo_stock').map(t => t.id);
  let lineas = [];
  if (conteos.length) {
    const r = await sb.from('v_stock_conteo').select('*').in('tarea_id', conteos).order('grupo_orden').order('creado_en');
    if (r.error) throw r.error; lineas = r.data || [];
  }
  // 17-nov: medidas de referencia de las estructuras por madera de la cubierta (migración 0110); si falla, el conteo sigue igual
  try { const m = await sb.from('estructura_medida').select('modelo, personas, para_madera, largo_cm'); TAR.estMed = m.data || []; } catch (e) { TAR.estMed = []; }
  TAR.pend = tarPendientes(tareas); tarPintarBadge();
  return { tareas, lineas };
}
function tarPendientes(tareas) { const h = hoyISO(); return tareas.filter(t => !t.hecha_en && t.fecha <= h && (tarAdmin() || !t.responsable || t.responsable === yo.id)).length; }
async function tarContarPendientes() {
  try {
    const { data, error } = await sb.from('tarea_dia').select('id, fecha, responsable, hecha_en').is('hecha_en', null).lte('fecha', hoyISO());
    if (error) return; TAR.pend = tarPendientes(data || []); tarPintarBadge();
  } catch (e) { /* sin módulo o sin permiso: no muestra número */ }
}
function tarPintarBadge() { if (typeof vehPintarBadge === 'function') vehPintarBadge(); }

/* Tarjeta en Otros */
async function tarTarjeta() {
  let resumen = '';
  try {
    const { tareas } = await tarCargar(); const h = hoyISO();
    const hoy = tareas.filter(t => t.fecha === h), pend = TAR.pend;
    resumen = `<div>${pend ? `<span class="chip urgente">${pend} por hacer</span>` : '<span class="chip ok">todo hecho</span>'}${hoy.length ? ` <span class="gris">${hoy.map(t => esc(t.titulo)).join(' · ')}</span>` : ''}</div>`;
  } catch (e) { resumen = `<div class="gris">${esc(errorDe(e))}</div>`; }
  return `<a class="modulo" href="#/otros/tareas"><div class="modulo-t">✅ Tareas del día</div><div class="gris">Lo que hay que hacer hoy en el taller. Toca una tarea para abrirla.</div>${resumen}</a>`;
}

/* ---------- pantalla ---------- */
async function vTareas() {
  const D = await tarCargar(), h = hoyISO();
  const abiertas = D.tareas.filter(t => !t.hecha_en && t.fecha <= h);
  const hechasHoy = D.tareas.filter(t => t.hecha_en && (t.fecha === h || t.hecha_en.slice(0, 10) === h));   // lo hecho hoy sigue a la vista (Harold ve el resumen)
  const proximas = D.tareas.filter(t => !t.hecha_en && t.fecha > h);
  const hechas = D.tareas.filter(t => t.hecha_en && !hechasHoy.includes(t)).sort((a, b) => b.hecha_en.localeCompare(a.hecha_en));
  const deHoy = abiertas.length ? abiertas : hechasHoy;
  if (TAR.auto && deHoy.length === 1) TAR.abiertas.add(deHoy[0].id);   // la primera vez, si hay una sola, ya viene abierta
  TAR.auto = false;
  app.innerHTML = barra('#/otros') + `<div class="sub"><a href="#/otros">Otros</a> › Tareas del día
      <span class="espacio"></span>${tarAdmin() ? '<button class="btn chico primario" id="tar-nueva">+ Nueva tarea</button>' : ''}</div>
    <div class="contenido tar">
      <h2 class="tar-h">Hoy · ${fecha(h, true)}</h2>
      ${abiertas.length ? abiertas.map(t => tarHtml(t, D)).join('') : hechasHoy.length ? '' : '<div class="seccion gris">No hay tareas pendientes.</div>'}
      ${hechasHoy.map(t => tarHtml(t, D)).join('')}
      ${proximas.length ? `<h2 class="tar-h">Próximas</h2>${proximas.map(t => tarHtml(t, D)).join('')}` : ''}
      ${hechas.length ? `<details class="tar-hechas" ${TAR.verHechas ? 'open' : ''}><summary>Hechas (últimos 30 días) · ${hechas.length}</summary>${hechas.map(t => tarHtml(t, D)).join('')}</details>` : ''}
    </div>`;
  const nueva = $('#tar-nueva'); if (nueva) nueva.onclick = () => tarFormTarea(null);
  const dh = $('.tar-hechas'); if (dh) dh.ontoggle = () => { TAR.verHechas = dh.open; };
  tarEventos(D);
}

function tarHtml(t, D) {
  const h = hoyISO(), hecha = !!t.hecha_en, atrasada = !hecha && t.fecha < h;
  const quien = t.responsable_nombre ? esc(t.responsable_nombre) : 'cualquiera';
  const estado = hecha ? `<span class="chip ok">HECHA</span>` : atrasada ? `<span class="chip urgente">ATRASADA</span>` : '';
  const cuando = (t.fecha === h ? '' : ` · ${fecha(t.fecha, true)}`) + (t.hora ? ` · ${t.hora.slice(0, 5)}` : '');
  const nueva = tarSinLeer(t) ? '<span class="chip tar-nueva">NUEVA</span>' : '';
  const lectura = tarAdmin() && t.responsable && t.responsable !== yo.id && !hecha ? (t.leida_responsable_en ? ` · leída ${fechaHora(t.leida_responsable_en)}` : ' · <b>sin leer</b>') : '';
  const n = t.tipo === 'conteo_stock' ? D.lineas.filter(l => l.tarea_id === t.id).reduce((a, l) => a + l.cantidad, 0) : 0;
  return `<details class="seccion tar-tarea ${hecha ? 'hecha' : ''}" data-tarea="${t.id}" ${TAR.abiertas.has(t.id) ? 'open' : ''}>
    <summary>${nueva}<span class="tar-tit">${esc(t.titulo)}</span> ${estado}<span class="gris">${quien}${cuando}${n ? ` · ${n} contadas` : ''}${lectura}</span></summary>
    <div class="tar-cuerpo">
      ${t.detalle ? `<p class="tar-detalle">${esc(t.detalle)}</p>` : ''}
      ${tarItemsHtml(t)}
      ${t.tipo === 'conteo_stock' ? tarConteoHtml(t, D) : ''}
      <div class="tar-pie">
        ${hecha ? `<span class="gris">Hecha por ${esc(t.hecha_por_nombre || '-')} el ${fechaHora(t.hecha_en)}${t.nota_cierre ? ' · ' + esc(t.nota_cierre) : ''}</span>
            ${tarAdmin() || (t.hecha_por === yo.id && t.hecha_en.slice(0, 10) >= hoyISO(-1)) ? `<button class="btn chico borde" data-reabrir="${t.id}">Reabrir</button>` : ''}`
          : tarEsMia(t) ? `<button class="btn primario" data-hecha="${t.id}">✓ Marcar hecha</button>` : `<span class="gris">Es de ${quien}</span>`}
        <span class="espacio"></span>
        ${tarAdmin() ? `<button class="btn chico borde" data-editar="${t.id}">Editar</button> <button class="btn chico borde" data-borrar="${t.id}">Borrar</button>` : ''}
      </div>
    </div></details>`;
}

/* ---------- casillas y lectura (migración 0108) ---------- */
// Sin leer = no la creé yo, es mía o de cualquiera, no está hecha y no la he abierto
const tarSinLeer = t => !t.hecha_en && !t.leida_en && t.creada_por !== yo.id && (!t.responsable || t.responsable === yo.id);
function tarItemsHtml(t) {
  const items = t.items || []; if (!items.length) return '';
  const puede = tarAdmin() || (tarEsMia(t) && !t.hecha_en);
  return `<ul class="tar-items">${items.map(i => `<li class="${i.hecho_en ? 'hecho' : ''}"><label><input type="checkbox" data-item="${i.id}" ${i.hecho_en ? 'checked' : ''} ${puede ? '' : 'disabled'}>
    <span>${esc(i.texto)}</span>${i.hecho_en ? `<span class="l2">${esc(i.hecho_por || '')} ${fechaHora(i.hecho_en)}</span>` : ''}</label></li>`).join('')}</ul>`;
}
async function tarMarcarLeida(t) {
  if (!tarSinLeer(t)) return;
  t.leida_en = new Date().toISOString();
  try { await sb.rpc('tarea_leer', { p_id: t.id }); } catch (e) { /* si falla, vuelve a salir como nueva */ }
  const d = $(`details[data-tarea="${t.id}"] .tar-nueva`); if (d) d.remove();
  tarAvisoSinLeer(location.hash.split('?')[0]).catch(() => {});
}

/* Aviso a quien tiene tareas sin leer (Harold 16-nov: "cada vez que no haya leído alguna tarea, que le salga un mensaje… que le
   tome atención"): una franja azul fija bajo la barra en todas las pantallas y, una vez por sesión, una ventana con la lista.
   La primera vez (nunca ha leído una tarea) la ventana explica cómo funcionan las tareas. */
async function tarAvisoSinLeer(h) {
  const { data, error } = await sb.from('v_tarea_dia').select('id, titulo, fecha, hora, responsable, creada_por, hecha_en, leida_en').is('hecha_en', null).is('leida_en', null).order('fecha').order('hora', { nullsFirst: false });
  const viejo = $('.aviso-tareas'); if (viejo) viejo.remove();
  if (error) return;
  const sin = (data || []).filter(tarSinLeer); if (!sin.length) return;
  const n = sin.length, txtN = `${n} tarea${n > 1 ? 's' : ''} sin leer`;
  const cuando = t => (t.fecha === hoyISO() ? 'hoy' : fecha(t.fecha, true)) + (t.hora ? ' ' + t.hora.slice(0, 5) : '');
  if (h !== '#/otros/tareas') {
    const d = document.createElement('div'); d.className = 'aviso-tareas no-imprimir';
    d.innerHTML = `<span class="tar-campana">📋</span><span><b>Tienes ${txtN}</b> · ${sin.slice(0, 3).map(t => `${esc(t.titulo)} (${cuando(t)})`).join(' · ')}${n > 3 ? ' …' : ''}</span><button class="btn" id="b-ver-tareas">Ver mis tareas</button>`;
    const barraEl = $('.barra'); if (barraEl) barraEl.after(d); else app.prepend(d);
    $('#b-ver-tareas', d).onclick = () => { location.hash = '#/otros/tareas'; };
  }
  const clave = 'tar-ventana-' + sin.map(t => t.id).join(',');
  let vista = false; try { vista = !!sessionStorage.getItem(clave); } catch (e) { }
  if (vista || h === '#/otros/tareas' || !$('#modal').classList.contains('oculto')) return;
  try { sessionStorage.setItem(clave, '1'); } catch (e) { }
  const { count } = await sb.from('tarea_lectura').select('tarea_id', { count: 'exact', head: true }).eq('perfil_id', yo.id);
  const primeraVez = !count;
  modal(`<div class="tar-ventana"><div class="tar-ventana-ico">📋</div><h2>Tienes ${txtN}</h2>
    ${primeraVez ? `<p>Desde ahora, en <b>Otros › Tareas del día</b> vas a tener tareas y objetivos asignados. Cada uno tiene su día, y a veces su hora, para hacerlo.</p>
      <ol><li>Ábrela para leerla completa.</li><li>Si tiene casillas, márcalas a medida que avanzas.</li><li>Al terminar, toca <b>Marcar hecha</b>.</li></ol>
      <p class="gris">Si no puedes hacerla ese día, avísale a Harold.</p>` : ''}
    <ul class="tar-ventana-lista">${sin.map(t => `<li><b>${esc(t.titulo)}</b><span>${cuando(t)}</span></li>`).join('')}</ul>
    <div class="acciones"><button class="btn" id="tv-despues">Después</button><button class="btn primario" id="tv-ver">Ver mis tareas</button></div></div>`);
  $('#tv-despues').onclick = cerrarModal;
  $('#tv-ver').onclick = () => { cerrarModal(); location.hash = '#/otros/tareas'; };
}

/* ---------- conteo de stock ---------- */
const tarPuedeLinea = (l, t) => tarAdmin() || (!t.hecha_en && l.contado_por === yo.nombre.split(' ')[0]);
const tarMedidaTxt = l => l.largo ? `${l.largo} x ${l.ancho}` : '';
// Largo de la estructura según su madera (Venecia 6: pino 142, lenga 152), si Harold ya lo dio
const tarEstMedidaTxt = l => { const m = (TAR.estMed || []).find(x => x.modelo === l.modelo && x.personas === l.personas && x.para_madera === l.madera); return m && m.largo_cm ? `<span class="l2"> · ${esc(m.largo_cm)} de largo</span>` : ''; };
const tarPersonasTxt = l => l.personas ? `${l.personas} personas` : '';

function tarConteoHtml(t, D) {
  const lineas = D.lineas.filter(l => l.tarea_id === t.id);
  const abierta = !t.hecha_en;
  const puedeAgregar = abierta && (tarAdmin() || tarEsMia(t));
  const grupos = TAR_GRUPOS.map(([g, nombre]) => {
    let ls = lineas.filter(l => l.grupo === g);
    if (!ls.length) return '';
    // Hecha: líneas iguales se suman (resumen para Harold). Abierta: cada línea con su ✎ para corregir.
    if (!abierta) { const m = new Map(); ls.forEach(l => { const k = [l.modelo, l.personas, l.color, l.madera, l.largo, l.ancho, l.tono, l.nota].join('|'); m.has(k) ? (m.get(k).cantidad += l.cantidad) : m.set(k, { ...l }); }); ls = [...m.values()]; }
    ls.sort((a, b) => String(a.modelo || a.madera).localeCompare(String(b.modelo || b.madera)) || (a.personas || 99) - (b.personas || 99) || (a.largo || 0) - (b.largo || 0) || String(a.color || a.tono).localeCompare(String(b.color || b.tono)));
    const total = ls.reduce((a, l) => a + l.cantidad, 0), est = g === 'estructura', barn = g === 'cubierta_barnizada';
    const cab = est ? '<th>Modelo</th><th>Personas</th><th>Color</th><th>Para cubierta de</th>' : `<th>Madera</th><th>Medida (cm)</th>${barn ? '<th>Tono</th>' : ''}`;
    const fila = l => `<tr><td><b>${esc(est ? l.modelo : l.madera)}</b>${l.nota ? `<div class="l2">${esc(l.nota)}</div>` : ''}</td>
      ${est ? `<td>${esc(l.personas || '-')}</td><td>${esc(l.color)}</td><td>${l.madera ? esc(l.madera) + tarEstMedidaTxt(l) : '<span class="rojo">sin dato</span>'}</td>` : `<td class="nw">${esc(tarMedidaTxt(l))}${l.personas ? `<span class="l2"> · ${l.personas} p.</span>` : ''}</td>${barn ? `<td>${esc(l.tono)}</td>` : ''}`}
      <td class="num"><b>${l.cantidad}</b></td>
      <td class="nw">${abierta && tarPuedeLinea(l, t) ? `<button class="btn chico borde" data-linea="${l.id}" title="Corregir o borrar">✎</button>` : ''}</td></tr>`;
    return `<h3 class="tar-grupo">${nombre} <span class="gris">· ${total}</span></h3>
      <div class="tabla-env"><table class="lista tar-tabla"><thead><tr>${cab}<th class="num">Cantidad</th><th></th></tr></thead><tbody>${ls.map(fila).join('')}</tbody></table></div>`;
  }).join('');
  return `${puedeAgregar ? tarFormLineaHtml(t.id) : ''}
    ${grupos || `<div class="gris">${abierta ? 'Todavía no hay nada contado.' : 'No se contó nada.'}</div>`}`;
}

/* Formulario de una línea. En la tarea va abierto y recuerda lo último elegido, para cargar rápido varias parecidas. */
function tarCamposLinea(v) {
  const g = v.grupo || 'estructura', est = g === 'estructura';
  const sel = (name, ops, actual, vacio) => `<select name="${name}">${vacio ? `<option value="">${vacio}</option>` : ''}${ops.map(o => { const [val, txt] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(val)}" ${String(actual) === String(val) ? 'selected' : ''}>${esc(txt)}</option>`; }).join('')}</select>`;
  const madera = v.madera || 'Pino';
  const medOps = TAR_MEDIDAS[madera].map(([p, l, a]) => [`${p}|${l}|${a}`, `${p} personas · ${l} x ${a}`]).concat([['otra', 'Otra medida']]);
  const medAct = v.medida || (v.largo ? (TAR_MEDIDAS[madera].some(([p, l, a]) => p === v.personas && l === v.largo && a === v.ancho) ? `${v.personas}|${v.largo}|${v.ancho}` : 'otra') : medOps[1][0]);
  const modeloAct = v.modelo && !TAR_MODELOS.includes(v.modelo) ? 'Otro' : (v.modelo || 'Venecia');
  return `<div class="tar-segm">${TAR_GRUPOS.map(([k, t]) => `<button type="button" class="btn ${g === k ? 'primario' : 'borde'}" data-grupo="${k}">${t}</button>`).join('')}</div>
    <div class="tar-campos">
      ${est ? `<label>Modelo ${sel('modelo', TAR_MODELOS, modeloAct)}</label>
        <label class="tar-otro ${modeloAct === 'Otro' ? '' : 'oculto'}">¿Cuál? <input name="modelo_otro" value="${esc(modeloAct === 'Otro' ? (v.modelo === 'Otro' ? '' : v.modelo || '') : '')}" placeholder="Ej. Roma"></label>
        <label>Personas ${sel('personas', [4, 6, 8], v.personas ?? (modeloAct === 'Bancas' ? '' : 6), '—')}</label>
        <label>Color ${sel('color', TAR_COLORES, v.color || 'Negra')}</label>
        <label title="La de lenga es más larga (cubierta estándar más grande)">Para cubierta de ${sel('madera_est', ['Pino', 'Lenga'], v.madera_est || (['Pino', 'Lenga'].includes(v.madera) ? v.madera : 'Pino'))}</label>`
      : `<label>Madera ${sel('madera', ['Pino', 'Lenga', 'Roble Americano', 'Roble Chileno'], madera)}</label>
        <label class="tar-med">Medida ${sel('medida', medOps, medAct)}</label>
        <label class="tar-otra ${medAct === 'otra' ? '' : 'oculto'}">Largo x ancho (cm) <span class="tar-lxa"><input type="number" name="largo" min="20" max="400" value="${esc(medAct === 'otra' ? v.largo || '' : '')}" placeholder="170"> x <input type="number" name="ancho" min="20" max="300" value="${esc(medAct === 'otra' ? v.ancho || '' : '')}" placeholder="90"></span></label>
        ${g === 'cubierta_barnizada' ? `<label>Tono ${sel('tono', TAR_TONOS, v.tono || '1')}</label>` : ''}`}
      <label>Cantidad <input type="number" name="cantidad" min="1" max="500" inputmode="numeric" value="${esc(v.cantidad || '')}" required></label>
      <label class="tar-nota">Nota (opcional) <input name="nota" value="${esc(v.nota || '')}" placeholder="Ej. cuadrada, con un detalle"></label>
    </div>`;
}
function tarFormLineaHtml(tareaId) {
  const v = TAR.form[tareaId] || {};
  return `<form class="tar-form" data-form="${tareaId}">${tarCamposLinea(v)}<div class="acciones"><button class="btn primario" type="submit">+ Agregar</button></div></form>`;
}
// Lee el formulario y devuelve la fila para la base (o lanza un error claro)
function tarLeerLinea(f, grupo) {
  const val = n => f.elements[n] ? f.elements[n].value.trim() : '';
  const fila = { grupo, cantidad: Number(val('cantidad')), nota: val('nota') || null, modelo: null, personas: null, color: null, madera: null, largo: null, ancho: null, tono: null };
  if (!(fila.cantidad >= 1)) throw new Error('Falta la cantidad');
  if (grupo === 'estructura') {
    fila.modelo = val('modelo') === 'Otro' ? val('modelo_otro') : val('modelo');
    if (!fila.modelo) throw new Error('Escribe cuál es el modelo');
    fila.personas = val('personas') ? Number(val('personas')) : null; fila.color = val('color');
    fila.madera = val('madera_est') || null;   // 17-nov: para qué cubierta es la estructura (la de lenga es más larga)
  } else {
    fila.madera = val('madera');
    if (val('medida') === 'otra') { fila.largo = Number(val('largo')); fila.ancho = Number(val('ancho')); if (!fila.largo || !fila.ancho) throw new Error('Falta el largo y el ancho'); }
    else { const [p, l, a] = val('medida').split('|').map(Number); fila.personas = p; fila.largo = l; fila.ancho = a; }
    if (fila.largo < fila.ancho) [fila.largo, fila.ancho] = [fila.ancho, fila.largo];
    if (grupo === 'cubierta_barnizada') fila.tono = val('tono');
  }
  return fila;
}
// Recordar lo elegido (sin la cantidad ni la nota) para la siguiente línea
function tarRecordar(f, grupo) {
  const val = n => f.elements[n] ? f.elements[n].value : undefined;
  const v = { grupo };
  ['modelo', 'personas', 'color', 'madera', 'madera_est', 'medida', 'tono'].forEach(n => { if (val(n) !== undefined) v[n] = val(n); });
  if (v.modelo === 'Otro') v.modelo = val('modelo_otro') || 'Otro';
  if (v.personas !== undefined) v.personas = v.personas ? Number(v.personas) : '';
  if (v.medida === 'otra') { v.largo = Number(val('largo')) || ''; v.ancho = Number(val('ancho')) || ''; }
  return v;
}
// Cambios dentro del formulario (grupo, modelo Otro, madera, otra medida) sin perder lo escrito
function tarActivarCampos(cont, getV, setV) {
  $$('[data-grupo]', cont).forEach(b => b.onclick = () => { const v = getV(); setV({ ...v, grupo: b.dataset.grupo, medida: undefined }); });
  const f = cont.closest('form') || cont;
  const m = f.elements && f.elements.modelo; if (m) m.onchange = () => { $('.tar-otro', f).classList.toggle('oculto', m.value !== 'Otro'); if (m.value === 'Bancas') f.elements.personas.value = ''; };
  const md = f.elements && f.elements.madera; if (md) md.onchange = () => { const v = getV(); setV({ ...v, madera: md.value, medida: undefined, largo: undefined, ancho: undefined }); };
  const me = f.elements && f.elements.medida; if (me) me.onchange = () => $('.tar-otra', f).classList.toggle('oculto', me.value !== 'otra');
}

/* ---------- eventos ---------- */
function tarEventos(D) {
  const tarea = id => D.tareas.find(t => t.id === Number(id));
  $$('details.tar-tarea').forEach(d => {
    d.ontoggle = () => { const id = Number(d.dataset.tarea); if (d.open) { TAR.abiertas.add(id); tarMarcarLeida(tarea(id)); } else TAR.abiertas.delete(id); };
    if (d.open) tarMarcarLeida(tarea(d.dataset.tarea));   // la que se abre sola también cuenta como leída
  });
  $$('[data-item]').forEach(c => c.onchange = async () => {
    c.disabled = true;
    try { await rpc('tarea_item_marcar', { p_id: Number(c.dataset.item), p_hecho: c.checked }); await vTareas(); }
    catch (e) { aviso(errorDe(e), true); c.checked = !c.checked; c.disabled = false; }
  });
  $$('form.tar-form').forEach(f => {
    const id = Number(f.dataset.form);
    const getV = () => ({ ...tarRecordar(f, (TAR.form[id] || {}).grupo || 'estructura'), cantidad: f.elements.cantidad.value, nota: f.elements.nota.value });
    const pintar = v => { TAR.form[id] = v; f.innerHTML = tarCamposLinea(v) + '<div class="acciones"><button class="btn primario" type="submit">+ Agregar</button></div>'; tarActivarCampos(f, getV, pintar); };
    tarActivarCampos(f, getV, pintar);
    f.onsubmit = async ev => {
      ev.preventDefault(); const btn = $('button[type=submit]', f); btn.disabled = true;
      const grupo = (TAR.form[id] || {}).grupo || 'estructura';
      try {
        const fila = tarLeerLinea(f, grupo);
        const { error } = await sb.from('stock_conteo_linea').insert({ ...fila, tarea_id: id }); if (error) throw error;
        TAR.form[id] = tarRecordar(f, grupo); TAR.abiertas.add(id);
        aviso('Agregado'); await vTareas();
        const nf = $(`form.tar-form[data-form="${id}"]`); if (nf) nf.elements.cantidad.focus();
      } catch (e) { aviso(errorDe(e), true); btn.disabled = false; }
    };
  });
  $$('[data-linea]').forEach(b => b.onclick = () => { const l = D.lineas.find(x => x.id === Number(b.dataset.linea)); tarFormLinea(l); });
  $$('[data-hecha]').forEach(b => b.onclick = async () => {
    const t = tarea(b.dataset.hecha);
    if (t.tipo === 'conteo_stock' && !t.lineas && !D.lineas.some(l => l.tarea_id === t.id) && !confirm('No hay nada contado. ¿Marcarla hecha igual?')) return;
    const faltan = (t.items || []).filter(i => !i.hecho_en).length;
    if (faltan && !confirm(`Quedan ${faltan} casilla${faltan > 1 ? 's' : ''} sin marcar. ¿Marcarla hecha igual?`)) return;
    b.disabled = true;
    try { await rpc('tarea_marcar', { p_id: t.id, p_hecha: true, p_nota: null }); TAR.abiertas.delete(t.id); aviso('Tarea hecha. Gracias'); await vTareas(); }
    catch (e) { aviso(errorDe(e), true); b.disabled = false; }
  });
  $$('[data-reabrir]').forEach(b => b.onclick = async () => {
    try { await rpc('tarea_marcar', { p_id: Number(b.dataset.reabrir), p_hecha: false, p_nota: null }); TAR.abiertas.add(Number(b.dataset.reabrir)); await vTareas(); }
    catch (e) { aviso(errorDe(e), true); }
  });
  $$('[data-editar]').forEach(b => b.onclick = () => tarFormTarea(tarea(b.dataset.editar)));
  $$('[data-borrar]').forEach(b => b.onclick = async () => {
    const t = tarea(b.dataset.borrar), n = D.lineas.filter(l => l.tarea_id === t.id).length;
    if (!confirm(`¿Borrar la tarea «${t.titulo}»?${n ? ` Se borran también sus ${n} líneas contadas.` : ''}`)) return;
    const { error } = await sb.from('tarea_dia').delete().eq('id', t.id); if (error) return aviso(errorDe(error), true);
    aviso('Tarea borrada'); await vTareas(); tarContarPendientes();
  });
}

/* Corregir o borrar una línea del conteo */
function tarFormLinea(l) {
  let v = { ...l, medida: undefined };
  const pintar = nv => {
    v = nv;
    modal(`<h2>Corregir lo contado</h2><form id="f-tlin">${tarCamposLinea(v)}
      <div class="acciones"><button type="button" class="btn tar-borrar" id="tl-borrar">Borrar</button><span class="espacio"></span><button type="button" class="btn" id="tl-cerrar">Cancelar</button><button class="btn primario" type="submit">Guardar</button></div></form>`, 'ancha');
    const f = $('#f-tlin');
    const getV = () => ({ ...tarRecordar(f, v.grupo), cantidad: f.elements.cantidad.value, nota: f.elements.nota.value });
    tarActivarCampos(f, getV, pintar);
    $('#tl-cerrar').onclick = cerrarModal;
    $('#tl-borrar').onclick = async () => {
      if (!confirm('¿Borrar esta línea?')) return;
      const { error } = await sb.from('stock_conteo_linea').delete().eq('id', l.id); if (error) return aviso(errorDe(error), true);
      cerrarModal(); aviso('Línea borrada'); vTareas();
    };
    f.onsubmit = async ev => {
      ev.preventDefault();
      try {
        const fila = tarLeerLinea(f, v.grupo);
        const { data, error } = await sb.from('stock_conteo_linea').update(fila).eq('id', l.id).select('id'); if (error) throw error;
        if (!data || !data.length) throw new Error('No se pudo guardar: la tarea ya está hecha o la línea es de otra persona');
        cerrarModal(); aviso('Corregido'); vTareas();
      } catch (e) { aviso(errorDe(e), true); }
    };
  };
  pintar(v);
}

/* Nueva tarea o editar (solo Harold) */
function tarFormTarea(t) {
  const PERSONAS = [['', 'Cualquiera'], [yo.id, yo.nombre.split(' ')[0]], [TAR_ALEXIS, 'Alexis']];
  const x = t || { fecha: hoyISO(), tipo: 'texto', responsable: PERSONAS[2][0] };
  modal(`<h2>${t ? 'Editar tarea' : 'Nueva tarea'}</h2><form id="f-tarea" class="campos tar-campos-tarea">
    <label class="campo ancho">Qué hay que hacer <input name="titulo" value="${esc(x.titulo || '')}" required placeholder="Ej. Ordenar las cubiertas de pino"></label>
    <label class="campo ancho">Detalle (opcional) <textarea name="detalle" placeholder="Cómo hacerlo, para qué es">${esc(x.detalle || '')}</textarea></label>
    <label class="campo ancho">Casillas para marcar (opcional, una por línea) <textarea name="items" placeholder="Vesto Morel 18 mm&#10;Durolac">${esc((x.items || []).map(i => i.texto).join('\n'))}</textarea></label>
    <label class="campo">Día <input type="date" name="fecha" value="${esc(x.fecha)}" required></label>
    <label class="campo">Hora (opcional) <input type="time" name="hora" value="${esc((x.hora || '').slice(0, 5))}"></label>
    <label class="campo">Quién <select name="responsable">${PERSONAS.map(([id, n]) => `<option value="${id}" ${String(x.responsable || '') === id ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>
    <label class="campo">Tipo <select name="tipo"><option value="texto" ${x.tipo === 'texto' ? 'selected' : ''}>Tarea simple</option><option value="conteo_stock" ${x.tipo === 'conteo_stock' ? 'selected' : ''}>Conteo de stock de mesas</option></select></label>
    <div class="acciones ancho"><button type="button" class="btn" id="tt-cerrar">Cancelar</button><button class="btn primario" type="submit">Guardar</button></div></form>`, 'ancha');
  const f = $('#f-tarea');
  f.tipo.onchange = () => { if (f.tipo.value === 'conteo_stock' && !f.titulo.value) f.titulo.value = 'Conteo de stock de mesas'; };
  $('#tt-cerrar').onclick = cerrarModal;
  f.onsubmit = async ev => {
    ev.preventDefault();
    const fila = { titulo: f.titulo.value.trim(), detalle: f.detalle.value.trim() || null, fecha: f.fecha.value, hora: f.hora.value || null, responsable: f.responsable.value || null, tipo: f.tipo.value };
    const r = t ? await sb.from('tarea_dia').update(fila).eq('id', t.id).select('id') : await sb.from('tarea_dia').insert(fila).select('id');
    if (r.error) return aviso(errorDe(r.error), true);
    // Casillas: las que siguen igual se mantienen (con su marca), las quitadas se borran y las nuevas se agregan
    const id = t ? t.id : r.data[0].id, nuevas = f.items.value.split('\n').map(x => x.trim()).filter(Boolean), antes = (t && t.items) || [];
    const borrar = antes.filter(i => !nuevas.includes(i.texto)).map(i => i.id);
    if (borrar.length) { const e = await sb.from('tarea_item').delete().in('id', borrar); if (e.error) return aviso(errorDe(e.error), true); }
    const agregar = nuevas.map((texto, k) => ({ tarea_id: id, texto, orden: k + 1 })).filter(x => !antes.some(i => i.texto === x.texto));
    if (agregar.length) { const e = await sb.from('tarea_item').insert(agregar); if (e.error) return aviso(errorDe(e.error), true); }
    cerrarModal(); aviso(t ? 'Tarea guardada' : 'Tarea creada'); await vTareas(); tarContarPendientes();
  };
}
