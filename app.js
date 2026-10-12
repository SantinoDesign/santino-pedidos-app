/* Santino Pedidos · app mínima del prototipo (Fase 2, T-289).
   Una sola página: Supabase (datos y acceso) más HTML generado aquí.
   Roles: admin (Harold) ve todo; operacion (Alexis) ve la lista de taller sin precios y la ruta. */
'use strict';

const sb = window.supabase.createClient(window.SANTINO_CONFIG.url, window.SANTINO_CONFIG.anon);
const app = document.getElementById('app');
let yo = null;            // {id, nombre, rol}
let cache = { pedidos: [], filtro: 'pendientes', estados: new Set(), tipos: new Set(), bases: new Set(), modelos: null, busqueda: '', opVer: 'pendientes', rutaFecha: null, ordenRuta: [] };
const META = 62;          // pedidos al mes (objetivo de utilidad, DM_Financiero v7.15)
const ESTADOS = ['POR FABRICAR','VISITA TÉCNICA','DIBUJO 3D','DISEÑO APROBADO','EN FABRICACIÓN','LISTO EN TALLER','DESPACHO PROGRAMADO','ENTREGADO','CANCELADO','DEVUELTO'];
const ORDEN_COMUNAS = ['Vitacura','Lo Barnechea','Las Condes','La Reina','Providencia','Ñuñoa','Santiago','Macul','Peñalolén','La Florida','Huechuraba','Colina','San Miguel','Maipú','Puente Alto'];

/* ---------- utilidades ---------- */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => s == null ? '' : String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pesos = n => n == null ? '' : '$' + Math.round(n).toLocaleString('es-CL');
const MESES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
const MESES_L = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const DIAS = ['dom','lun','mar','mié','jue','vie','sáb'];
function fecha(s, conDia) { if (!s) return '-'; const d = new Date(s.length > 10 ? s : s + 'T12:00:00'); return (conDia ? DIAS[d.getDay()] + ' ' : '') + String(d.getDate()).padStart(2, '0') + '-' + MESES[d.getMonth()]; }
function fechaHora(s) { if (!s) return ''; const d = new Date(s); return fecha(s) + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
function hoyISO(dias = 0) { const d = new Date(); d.setDate(d.getDate() + dias); return d.toISOString().slice(0, 10); }
function num(v) { return v == null ? '' : String(Number(v)).replace(/\.0$/, ''); }
function aviso(msg, error) { const a = $('#aviso'); a.textContent = msg; a.className = 'aviso' + (error ? ' error' : ''); clearTimeout(a._t); a._t = setTimeout(() => a.classList.add('oculto'), error ? 6000 : 3000); }
function errorDe(e) { return (e && (e.message || e.error_description || e.hint)) || String(e); }
function modal(html) { const m = $('#modal'); m.innerHTML = `<div class="caja">${html}</div>`; m.classList.remove('oculto'); m.onclick = ev => { if (ev.target === m) cerrarModal(); }; return m; }
function cerrarModal() { $('#modal').classList.add('oculto'); $('#modal').innerHTML = ''; }
function chip(t) {
  const cls = t.startsWith('URGENTE') ? 'urgente' : t.startsWith('ATRASADO') ? 'atrasado' : t.startsWith('SALDO') ? 'saldo' : t.startsWith('PAGO') ? 'pago' : t.startsWith('INSTAL') ? 'inst' : t.startsWith('A MEDIDA') ? 'medida' : t.startsWith('PROPUESTO') ? 'prop' : '';
  return `<span class="chip ${cls}">${esc(t)}</span>`;
}
/* Códigos cortos para la Lista (Harold 12-oct-2026: columnas acotadas). El nombre completo va en el title (pasar el mouse). */
const COD_ESTADO = { 'POR FABRICAR': 'POR FAB', 'VISITA TÉCNICA': 'VIS TEC', 'DIBUJO 3D': 'DIB 3D', 'DISEÑO APROBADO': 'DIS APR', 'EN FABRICACIÓN': 'EN FAB', 'LISTO EN TALLER': 'LISTO T', 'DESPACHO PROGRAMADO': 'DESP PR', 'ENTREGADO': 'ENTREG', 'CANCELADO': 'CANCEL', 'DEVUELTO': 'DEVUEL' };  // opción B, Harold 12-oct
const COD_TIPO = { 'Venta catálogo': 'CATAL', 'Mesa a medida': 'MESA.M', 'Mueble a medida': 'MUEB.M', 'Proyecto': 'PROY', 'Postventa': 'POSTV', 'Repuesto': 'REPU' };
const A_MEDIDA = ['Mesa a medida', 'Mueble a medida', 'Proyecto'];  // opción A, Harold 12-oct
const NOMBRE_TIPO = { 'Mueble a medida': 'Mueble a medida (pieza suelta: repisa, sofá modular, poste)', 'Proyecto': 'Proyecto a medida (cocina, clóset, mueble de muro; antes en VENTAS_Proyectos_medida.xlsx)' };
const COD_MATERIAL = { TRAVERTINO: 'TRAV', 'ROB.HUALLE': 'ROB.H', 'ROB.US': 'ROB.US', MELAMINA: 'MEL', 'PINO OREGON': 'P.OREG', CARVALLO: 'CARV', NEOLITH: 'NEOL', ENCINA: 'ENC', CUARZO: 'CUARZ' };
const codMaterial = m => m ? (COD_MATERIAL[m] || m) : '';
const ES_VIDRIO = m => ['V.T', 'V.C'].includes(m);
const NO_MADERA = ['V.T', 'V.C', 'TRAVERTINO', 'NEOLITH', 'CUARZO', 'MELAMINA', 'RATAN', 'METAL', 'FIERRO', 'ACERO', 'MDF', 'ENCHAPADO'];
const ES_MADERA = m => !!m && !NO_MADERA.includes(String(m).toUpperCase());
const TONOS_VIDRIO = ['INCOLORO', 'HUMO', 'BRONCE', 'ESPEJADO'];   // solo en proyectos; el vidrio de catálogo es incoloro y no lleva tono (Harold 12-oct)
/* Tipo de base. REGLA (Harold 12-oct-2026, error grave corregido): NUNCA deducir "metal" por el color de la estructura.
   Un color NGR puede ser pino pintado (Gonqui). La fuente es material_base de la línea y, si falta, el área de taller
   del modelo en la tabla modelo (Soldadura = metal, Carpintería = madera, Armado muebles = MDF enchapado). Sin dato = vacío. */
async function cargarModelos() {
  if (cache.modelos) return;
  const { data } = await sb.from('modelo').select('codigo,area_base,bultos');
  cache.modelos = Object.fromEntries((data || []).map(m => [m.codigo, m.area_base]));
  cache.modelosBultos = Object.fromEntries((data || []).map(m => [m.codigo, m.bultos]));
}
function tipoBase(cub, base) {
  const mb = base.material_base || cub.material_base;
  if (mb) return ES_VIDRIO(mb) ? 'VIDRIO' : ['METAL', 'FIERRO', 'ACERO'].includes(mb) ? 'METAL' : ['MELAMINA', 'MDF', 'TABLERO', 'ENCHAPADO'].includes(mb) ? 'ENCHAPADO' : 'MADERA';
  const area = (cache.modelos || {})[base.modelo_base || cub.modelo_base || cub.modelo_cubierta];
  return area === 'Soldadura' ? 'METAL' : area === 'Carpintería' ? 'MADERA' : area === 'Armado muebles' ? 'ENCHAPADO' : '';  // ENCHAPADO = MDF enchapado (Montecarlo), Harold 12-oct
}
function estadoHtml(e, corto) { return `<span class="estado e-${e.replace(/ /g, '_')}" title="${esc(e)}">${esc(corto ? (COD_ESTADO[e] || e) : e)}</span>`; }
function tipoHtml(t) { return `<span class="cod" title="${esc(NOMBRE_TIPO[t] || t)}">${esc(COD_TIPO[t] || t)}</span>`; }
function rasgos(p) {
  const pz = p.piezas || [];
  // Pieza principal: cubierta, mesa, mueble o repuesto; si no hay, la banca; si no, el servicio (retapizado, instalación). Nunca tratar una banca como "sillas".
  const cub = pz.find(x => ['Cubierta', 'Mesa', 'Mueble', 'Repuesto'].includes(x.tipo)) || pz.find(x => x.tipo === 'Banca') || pz.find(x => x.tipo === 'Servicio') || {};
  const base = pz.find(x => x.tipo === 'Base') || {};
  const sil = pz.find(x => x.tipo === 'Silla') || (cub.tipo !== 'Banca' ? pz.find(x => x.tipo === 'Banca') : null);
  const modelos = [cub.modelo_cubierta, base.modelo_base].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i);
  // Modelo a la vista siempre (Harold 12-oct): catálogo = código; especial = ESPECIAL más el inicio de la descripción;
  // pedido solo de sillas = código de la silla (WISH, CROSS, S.SANTINO), aunque se repita en la columna Sillas.
  let modeloTxt = modelos.join(' + ');
  const sinMedidas = t => (t || '').replace(/\d+([.,]\d+)?\s*[xX×]\s*\d+([.,]\d+)?(\s*[xX×]\s*\d+([.,]\d+)?)?\s*(cm)?/g, '').replace(/\b(cm|diam|radio)\b/gi, '').replace(/[·,\s]+/g, ' ').trim();
  if (modeloTxt === 'ESPECIAL' || modeloTxt === 'ESPECIAL + ESPECIAL') modeloTxt = cub.tipo === 'Banca' ? 'BANCA ESPECIAL' : cub.tipo === 'Mueble' ? 'MUEBLE ESPECIAL' : 'ESPECIAL';  // sin redundar: material, medidas y tono van en sus columnas (Harold 12-oct)
  else if (cub.tipo === 'Banca' && !modeloTxt) modeloTxt = 'BANCA';
  if (!modeloTxt && !cub.tipo && sil) modeloTxt = sil.tipo_silla || 'Sillas';
  if (!modeloTxt) modeloTxt = sinMedidas(cub.descripcion).slice(0, 28);
  return {
    modelo: ((cub.cantidad || 1) > 1 ? cub.cantidad + ' x ' : '') + modeloTxt, descripcion: cub.descripcion || '',
    color: cub.color || base.color || '-', pers: cub.personas || '-', forma: cub.forma || '-',
    cubierta: cub.material_cubierta || '-', base: base.material_base || '-', esp: cub.espesor_mm || '-',
    // Dos líneas por celda: material arriba, color o tono abajo (Harold 12-oct: distinguir color de base y de cubierta)
    cubierta2: [codMaterial(cub.material_cubierta) || '-', !cub.tono ? '' : ES_VIDRIO(cub.material_cubierta) ? (TONOS_VIDRIO.includes(String(cub.tono).toUpperCase()) ? cub.tono : '') : tonoTxt(cub.tono), cub.tipo !== 'Silla' && cub.color_silla ? 'tapiz ' + cub.color_silla : ''],
    baseTipo: tipoBase(cub, base),
    // Base de madera sin material propio: es la misma madera de la cubierta (Gonqui pino = base pino); solo si la cubierta no es madera queda "MADERA" (Harold 12-oct)
    base2: [codMaterial(base.material_base || cub.material_base) || (tipoBase(cub, base) === 'MADERA' && ES_MADERA(cub.material_cubierta) ? codMaterial(cub.material_cubierta) : tipoBase(cub, base)) || '-', base.color || cub.color || '', ES_VIDRIO(cub.material_cubierta) && cub.tono && ['MADERA', 'ENCHAPADO'].includes(tipoBase(cub, base)) && !TONOS_VIDRIO.includes(String(cub.tono).toUpperCase()) ? tonoTxt(cub.tono) : ''],
    medida: cub.largo_cm ? `${num(cub.largo_cm)} x ${num(cub.ancho_cm)}${cub.alto_cm ? ' x ' + num(cub.alto_cm) : ''}` : '-',
    tono: cub.tono || '-', sillas: sil ? `${sil.cantidad} ${sil.tipo_silla || ''} ${sil.color_silla || ''}`.trim() : '-',
    entrega: (p.tipo_entrega === 'Despacho regiones' ? 'REG' : p.tipo_entrega === 'Retiro en taller' ? 'Retiro' : 'RM') + (p.instalacion ? ' + INS' : ''),
  };
}
function piezasHtml(p, editable) {
  // Piezas del pedido: una fila por cada parte que fabrica el taller, con su área y su estado (Harold 12-oct: los chips sueltos no se entendían)
  const pz = (p.piezas || []).filter(x => x.area);
  if (!pz.length) return '';
  return `<div class="piezas-caja"><div class="piezas-titulo">Piezas del pedido (${pz.length}) · cada una es una parte que fabrica el taller${editable ? ' · toca "Marcar lista" cuando esté terminada' : ''}</div>
    <table class="piezas-tabla"><tbody>${pz.map(x => `<tr>
      <td><strong>${esc(x.tipo === 'Servicio' ? 'Instalación' : x.tipo)}</strong>${x.cantidad > 1 ? ' ×' + x.cantidad : ''}</td>
      <td>${esc(x.descripcion || '')}${x.color || x.tono ? ` <span class="gris">· ${esc([x.color ? 'base ' + x.color : null, x.tono ? tonoTxt(x.tono) : null].filter(Boolean).join(' · '))}</span>` : ''}</td>
      <td class="nw gris">${esc(x.area)}</td>
      <td class="nw">${editable ? `<button class="pieza chica ${x.estado === 'Lista' ? 'lista' : x.estado === 'En proceso' ? 'proceso' : ''}" data-pieza="${x.id}" data-estado="${x.estado}" data-pedido="${p.id}">${x.estado === 'Lista' ? 'Lista ✓' : 'Marcar lista'}</button>` : `<span class="estado-pieza ${x.estado === 'Lista' ? 'lista' : ''}">${esc(x.estado)}</span>`}</td>
    </tr>`).join('')}</tbody></table></div>`;
}
/* Deshacer: pila de los últimos 20 cambios hechos en ESTA sesión (estado, fecha de entrega, urgente, observación).
   Los cambios de sesiones anteriores no se deshacen desde aquí: están en el historial de cada ficha. (Harold 12-oct) */
const deshacer = [];
function anotarCambio(desc, revertir) { deshacer.push({ desc, revertir }); if (deshacer.length > 20) deshacer.shift(); pintarDeshacer(); }
function pintarDeshacer() {
  const eb = $('#extra-barra'); if (!eb) return;
  const u = deshacer[deshacer.length - 1];
  eb.innerHTML = u ? `<button class="btn chico" id="b-deshacer" title="Deshace el último cambio de esta sesión (${deshacer.length} en la pila)">↶ Deshacer: ${esc(u.desc)}</button>` : '';
  const b = $('#b-deshacer'); if (b) b.onclick = async () => { const x = deshacer.pop(); try { await x.revertir(); aviso('Deshecho: ' + x.desc); } catch (e) { aviso(errorDe(e), true); } render(); };
}
async function rpc(nombre, args) { const { data, error } = await sb.rpc(nombre, args); if (error) throw error; return data; }

/* ---------- acceso ---------- */
async function iniciar() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return pantallaLogin();
  try { yo = await rpc('mi_perfil', {}); } catch (e) { yo = null; }
  if (!yo) { app.innerHTML = `<div class="login"><h1>Sin perfil</h1><p>Tu usuario entró, pero no tiene un rol asignado. Pídele a Harold que te active.</p><button class="btn" id="salir">Salir</button></div>`; $('#salir').onclick = salir; return; }
  document.body.classList.toggle('tablet', yo.rol === 'operacion');
  if (!location.hash || location.hash === '#/') location.hash = yo.rol === 'operacion' ? '#/taller' : '#/lista';
  render();
}
function pantallaLogin() {
  document.body.classList.remove('tablet');
  app.innerHTML = `<form class="login" id="f-login">
    <h1>SANTINO · Pedidos</h1>
    <div style="font-size:13px;color:var(--gris-2)">Pedidos reales de Santino Design (desde el 12-oct-2026). Entra con tu correo y clave.</div>
    <label>Correo <input type="email" name="email" required autocomplete="username"></label>
    <label>Clave <input type="password" name="password" required autocomplete="current-password"></label>
    <button class="btn primario" type="submit">Entrar</button>
    <button class="btn" type="button" id="olvide">Olvidé mi clave (te llega un correo)</button>
  </form>`;
  $('#f-login').onsubmit = async ev => {
    ev.preventDefault(); const f = new FormData(ev.target);
    const { error } = await sb.auth.signInWithPassword({ email: f.get('email'), password: f.get('password') });
    if (error) return aviso('No se pudo entrar: ' + errorDe(error), true);
    iniciar();
  };
  $('#olvide').onclick = async () => {
    const email = $('#f-login [name=email]').value; if (!email) return aviso('Escribe tu correo primero', true);
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname + '#/clave' });
    aviso(error ? errorDe(error) : 'Correo enviado. Revisa tu bandeja (máximo 2 por hora en el plan gratis).', !!error);
  };
}
async function salir() { await sb.auth.signOut(); yo = null; location.hash = ''; pantallaLogin(); }

/* ---------- navegación ---------- */
window.addEventListener('hashchange', () => { if (yo) render(); });
function barra(activa) {
  const links = yo.rol === 'operacion'
    ? [['#/taller', 'Lista'], ['#/ruta', 'Ruta']]
    : [['#/lista', 'Lista'], ['#/tablero', 'Tablero'], ['#/panel', 'Panel'], ['#/clientes', 'Clientes'], ['#/bandeja', 'Bandeja']];
  return `<div class="barra"><a class="marca" href="${links[0][0]}">SANTINO</a><nav class="nav">${links.map(([h, t]) => `<a href="${h}" class="${activa === h ? 'activo' : ''}">${t}</a>`).join('')}</nav><div class="espacio"></div><span id="extra-barra" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"></span><button class="avatar" id="btn-salir" title="${esc(yo.nombre)} · salir">${esc(yo.nombre[0])}</button></div>`;
}
async function render() {
  const h = location.hash.split('?')[0];
  const esOp = yo.rol === 'operacion';
  try {
    const est = $('#pagina-guia'); if (est && !h.startsWith('#/guia/')) est.remove();
    if (h.startsWith('#/pedido/')) await vFicha(h.split('/')[2]);
    else if (h.startsWith('#/guia/') && !esOp) await vGuia(h.split('/')[2]);
    else if (h === '#/tablero' && !esOp) await vTablero();
    else if (h === '#/panel' && !esOp) await vPanel();
    else if (h === '#/clientes' && !esOp) await vClientes();
    else if (h === '#/bandeja' && !esOp) await vBandeja();
    else if (h === '#/ruta') await vRuta();
    else if (h === '#/imprimir-listado') await vImprimirListado();
    else if (h === '#/taller' || esOp) await vTaller();
    else if (h === '#/clave') vClave();
    else await vLista();
  } catch (e) { app.innerHTML = barra(h) + `<div class="contenido"><div class="seccion"><h2>Error</h2><p>${esc(errorDe(e))}</p></div></div>`; }
  const bs = $('#btn-salir'); if (bs) bs.onclick = salir;
  pintarDeshacer();
}
function vClave() {
  app.innerHTML = barra('') + `<form class="login" id="f-clave"><h1>Nueva clave</h1><label>Clave nueva <input type="password" name="p" minlength="8" required></label><button class="btn primario">Guardar</button></form>`;
  $('#f-clave').onsubmit = async ev => { ev.preventDefault(); const { error } = await sb.auth.updateUser({ password: new FormData(ev.target).get('p') }); aviso(error ? errorDe(error) : 'Clave guardada', !!error); if (!error) location.hash = '#/'; };
}

/* ---------- datos ---------- */
async function cargarPedidos() {
  await cargarModelos();
  let q = sb.from('v_pedido').select('*');
  if (cache.filtro === 'pendientes') q = q.not('estado', 'in', '("ENTREGADO","CANCELADO","DEVUELTO")').order('fecha_comprometida', { ascending: true, nullsFirst: false }).order('fecha_estimada');
  else if (cache.filtro === 'entregados') q = q.eq('estado', 'ENTREGADO').order('entregado_en', { ascending: false }).limit(200);
  else if (cache.filtro === 'todos') q = q.order('fecha_compra', { ascending: false }).limit(500);
  else q = q.eq('estado', cache.filtro).order('prioridad').order('fecha_comprometida');
  const { data, error } = await q; if (error) throw error;
  if (cache.filtro === 'pendientes') {
    // Manda la fecha de entrega (Harold 12-oct); los pedidos del MISMO CLIENTE van juntos, en el lugar del más próximo (Harold 12-oct, Liliana).
    const clave = p => String(p.fecha_comprometida || p.fecha_estimada || '9');
    const primera = {}; data.forEach(p => { const k = clave(p); if (!primera[p.cliente_id] || k < primera[p.cliente_id]) primera[p.cliente_id] = k; });
    data.sort((a, b) => primera[a.cliente_id].localeCompare(primera[b.cliente_id]) || a.cliente_id - b.cliente_id || clave(a).localeCompare(clave(b)) || ESTADOS.indexOf(a.estado) - ESTADOS.indexOf(b.estado) || (a.prioridad || 999) - (b.prioridad || 999));
  }
  cache.pedidos = data; return data;
}
function filtrar(lista) {
  // Filtros acumulables (Harold 12-oct): estados marcados Y tipos marcados Y texto buscado. Sin marcas = todos.
  let l = lista;
  if (cache.estados.size) l = l.filter(p => cache.estados.has(p.estado));
  if (cache.tipos.size) l = l.filter(p => cache.tipos.has(p.tipo_pedido));
  if (cache.bases.size) l = l.filter(p => cache.bases.has(rasgos(p).baseTipo));
  const b = cache.busqueda.trim().toLowerCase(); if (!b) return l;
  return l.filter(p => [p.numero, p.cliente, p.resumen, p.comuna, p.cotizacion_numero, p.observacion].join(' ').toLowerCase().includes(b));
}

/* ---------- Harold · Lista densa ---------- */
async function vLista() {
  await cargarPedidos();
  if (!['pendientes', 'entregados', 'todos'].includes(cache.filtro)) cache.filtro = 'pendientes';
  const estadosVisibles = cache.filtro === 'pendientes' ? ESTADOS.filter(e => !['ENTREGADO', 'CANCELADO', 'DEVUELTO'].includes(e)) : cache.filtro === 'entregados' ? [] : ESTADOS;
  const setDe = g => g === 'estado' ? cache.estados : g === 'tipo' ? cache.tipos : cache.bases;
  const toggle = (grupo, valor, texto, titulo) => `<button class="ftog ${setDe(grupo).has(valor) ? 'on' : ''}" data-grupo="${grupo}" data-valor="${esc(valor)}" title="${esc(titulo)}">${esc(texto)}</button>`;
  app.innerHTML = barra('#/lista') + `<div class="sub no-imprimir">
      <label>Ver <select id="f-modo"><option value="pendientes" ${cache.filtro === 'pendientes' ? 'selected' : ''}>Pendientes</option><option value="entregados" ${cache.filtro === 'entregados' ? 'selected' : ''}>Entregados (últimos)</option><option value="todos" ${cache.filtro === 'todos' ? 'selected' : ''}>Todos (últimos 500)</option></select></label>
      ${estadosVisibles.length ? `<span class="fgrupo"><span class="fgrupo-t">Estado</span>${estadosVisibles.map(e => toggle('estado', e, COD_ESTADO[e], e)).join('')}</span>` : ''}
      <span class="fgrupo"><span class="fgrupo-t">Tipo</span>${Object.keys(COD_TIPO).map(t => toggle('tipo', t, COD_TIPO[t], NOMBRE_TIPO[t] || t)).join('')}</span>
      <span class="fgrupo"><span class="fgrupo-t">Base</span>${[['METAL', 'Estructura metálica (soldadura)'], ['MADERA', 'Base de madera maciza (carpintería)'], ['ENCHAPADO', 'Base de MDF enchapado (armado de muebles, ej. Montecarlo)']].map(([v, t]) => toggle('base', v, v, t)).join('')}</span>
      <label>Buscar <input type="search" id="f-busca" placeholder="cliente, número, modelo" value="${esc(cache.busqueda)}" style="width:200px"></label>
      <button class="btn" id="b-nuevo">+ Nuevo pedido</button>
      <button class="btn" id="b-export">Exportar a Excel (CSV)</button>
      <a class="btn" href="#/imprimir-listado">Imprimir listado operacional</a>
      <span id="resumen-lista" style="margin-left:auto;color:var(--gris-3)"></span>
    </div><div class="sub no-imprimir leyenda">Se pueden marcar varios estados y tipos a la vez; sin marcar = todos. Estados: ${estadosVisibles.map(e => `${COD_ESTADO[e]} ${e.toLowerCase()}`).join(' · ')}. Tipos: ${Object.keys(COD_TIPO).map(t => `${COD_TIPO[t]} ${t.toLowerCase()}`).join(' · ')}. Base: METAL estructura metálica · MADERA madera maciza · ENCHAPADO MDF enchapado (según el material de la línea o, si falta, el modelo).</div><div class="contenido"><div class="tabla-env" id="tabla"></div></div>`;
  $('#f-modo').onchange = e => { cache.filtro = e.target.value; cache.estados.clear(); vLista(); };
  $$('.ftog').forEach(b => b.onclick = () => { const set = setDe(b.dataset.grupo); set.has(b.dataset.valor) ? set.delete(b.dataset.valor) : set.add(b.dataset.valor); b.classList.toggle('on'); pintarLista(); });
  $('#f-busca').oninput = e => { cache.busqueda = e.target.value; pintarLista(); };
  $('#b-nuevo').onclick = () => formPedido();
  $('#b-export').onclick = exportarCSV;
  pintarLista();
}
function pintarLista() {
  const lista = filtrar(cache.pedidos);
  $('#resumen-lista').textContent = `${lista.length} pedidos`;
  // Columnas acotadas (Harold 12-oct): códigos cortos con el nombre completo al pasar el mouse, celdas en dos líneas, Ficha a la izquierda.
  const cab = [['', 'Abrir la ficha del pedido'], ['Est.', 'Estado (ver leyenda arriba)'], ['N°', ''], ['Cliente', ''], ['Tipo', 'Tipo de pedido (ver leyenda arriba)'], ['Modelo', ''], ['Pers.', 'Personas'], ['Forma', ''], ['Cubierta', 'Material de la cubierta y tono'], ['Base', 'Material de la base y color'], ['Esp.', 'Espesor en mm'], ['Medida', 'Largo x ancho (x alto) en cm'], ['Sillas', ''], ['Compra', ''], ['Entrega', 'Fecha de entrega comprometida; "est." = estimada automática. Clic para cambiarla aquí mismo'], ['Envío', 'RM, REG o Retiro'], ['Comuna', ''], ['Saldo', ''], ['Etiq.', 'Etiquetas automáticas']];
  const dos = (...lineas) => lineas.flat().filter(Boolean).map((t, i) => `<div class="${i ? 'l2' : 'l1'}">${esc(t)}</div>`).join('');
  $('#tabla').innerHTML = `<table class="lista compacta"><thead><tr>${cab.map(([c, t]) => `<th title="${esc(t)}">${c}</th>`).join('')}</tr></thead><tbody>${lista.map(p => {
    const r = rasgos(p);
    return `<tr class="fila ${p.atrasado ? 'atrasado' : ''}" data-id="${p.id}">
      <td><a class="ficha-link" href="#/pedido/${p.id}" title="Abrir ficha">Ficha</a></td><td>${estadoHtml(p.estado, true)}</td><td class="num">${esc(p.numero)}</td><td class="cliente">${esc(p.cliente)}</td><td>${tipoHtml(p.tipo_pedido)}</td>
      <td class="modelo" title="${esc(r.descripcion || '')}">${esc(r.modelo)}</td><td>${esc(r.pers)}</td><td>${esc(r.forma)}</td><td class="celda-lineas">${dos(r.cubierta2)}</td><td class="celda-lineas">${dos(r.base2)}</td><td>${esc(r.esp)}</td><td class="nw">${esc(r.medida)}</td><td class="sillas">${esc(r.sillas)}</td>
      <td class="nw">${fecha(p.fecha_compra)}</td><td class="nw fecha-ent ${p.atrasado ? 'num' : ''}" data-id="${p.id}" title="Clic para cambiar la fecha de entrega" style="${p.atrasado ? 'color:var(--rojo-txt)' : ''}">${p.fecha_comprometida || p.fecha_estimada ? fecha(p.fecha_comprometida || p.fecha_estimada) + (p.fecha_comprometida ? '' : ' <small style="color:var(--gris-3)">est.</small>') : '<span class="sin-fecha">sin fecha</span>'}</td><td class="nw">${esc(r.entrega)}</td><td class="comuna">${esc(p.comuna || '')}</td>
      <td class="nw mono">${pesos(p.saldo)}</td><td class="etiq">${(p.etiquetas || []).filter(t => !t.startsWith('A MEDIDA')).map(chip).join(' ')}</td></tr>`;
  }).join('')}</tbody></table>`;
  $$('#tabla a.ficha-link').forEach(a => a.onclick = ev => ev.stopPropagation());
  activarArrastreHorizontal($('#tabla'));
  if (yo.rol === 'admin') $$('#tabla td.fecha-ent').forEach(td => td.onclick = ev => {
    ev.stopPropagation(); if (td.querySelector('input')) return;
    const p = cache.pedidos.find(x => x.id == td.dataset.id); const antes = td.innerHTML;
    td.innerHTML = `<input type="date" value="${p.fecha_comprometida || p.fecha_estimada || ''}" style="min-height:28px;padding:2px 4px;font-size:12px">`;
    const inp = td.querySelector('input'); inp.focus(); try { inp.showPicker && inp.showPicker(); } catch (e) { /* algunos navegadores no lo permiten */ }
    inp.onclick = e => e.stopPropagation();
    inp.onchange = async () => { const v = inp.value || null; const antesV = p.fecha_comprometida; const { error } = await sb.from('pedido').update({ fecha_comprometida: v }).eq('id', p.id); aviso(error ? errorDe(error) : (v ? 'Entrega comprometida: ' + fecha(v, true) : 'Fecha de entrega borrada'), !!error); if (!error) anotarCambio(`fecha de entrega de ${p.numero}`, () => sb.from('pedido').update({ fecha_comprometida: antesV }).eq('id', p.id).then(r => { if (r.error) throw r.error; })); vLista(); };
    inp.onblur = () => setTimeout(() => { if (td.querySelector('input')) td.innerHTML = antes; }, 200);
  });
  $$('#tabla tr.fila').forEach(tr => tr.onclick = () => abrirDetalleFila(tr));
}
function abrirDetalleFila(tr) {
  const sig = tr.nextElementSibling;
  if (sig && sig.classList.contains('detalle')) { sig.remove(); return; }
  $$('#tabla tr.detalle').forEach(x => x.remove());
  const p = cache.pedidos.find(x => x.id == tr.dataset.id);
  const d = document.createElement('tr'); d.className = 'detalle';
  d.innerHTML = `<td colspan="20"><div style="display:flex;gap:18px;flex-wrap:wrap;align-items:flex-start">
    <a class="btn chico primario" href="#/pedido/${p.id}">Abrir ficha</a>
    ${piezasHtml(p, yo.rol === 'admin')}
    <span style="color:var(--gris-2)">${esc(p.resumen || '')}</span>
    ${p.observacion ? `<span>Obs.: ${esc(p.observacion)}</span>` : ''}
    ${p.nota_entrega ? `<span>Entrega: ${esc(p.nota_entrega)}</span>` : ''}
    ${p.despacho_propuesto && p.estado === 'LISTO EN TALLER' ? `<span class="chip prop">Alexis propone despacho ${fecha(p.despacho_propuesto, true)}</span><button class="btn chico borde" data-confirmar="${p.id}">Cliente confirmó: programar</button><a class="btn chico" target="_blank" href="${waLink(p, 'despacho')}">WhatsApp al cliente</a>` : ''}
    </div></td>`;
  tr.after(d);
  activarPiezas(d, () => vLista());
  const bc = $('[data-confirmar]', d); if (bc) bc.onclick = async () => { try { await rpc('confirmar_despacho', { p_pedido_id: p.id }); aviso('Despacho programado'); vLista(); } catch (e) { aviso(errorDe(e), true); } };
}
const CUENTA_SANTINO = 'Santino Design SpA\nRUT 77.551.022-6\nBanco Santander\nCuenta Corriente 87727157\nhola@santinodesign.cl';
const WEBPAY_LINK = 'https://www.webpay.cl/form-pay/80544';
const NOMBRE_MODELO = { VEN: 'Venecia', ROM: 'Roma', MYKHONOS: 'Mykonos', 'MESA EXT': 'Mesa exterior', MON: 'Mónaco', GONQUI: 'Gonqui', NOTHOFAGUS: 'Nothofagus', PRAGA: 'Praga', SANTORINI: 'Santorini', 'MONTE.C': 'Mesa Monte Carlo', FIO: 'Fiorella', X: 'Mesa X', ORIGEN: 'Origen', 'TIERRA DEL FUEGO': 'Tierra del Fuego', TIVOLI: 'Tivoli', 'MESA.C': 'Mesa de centro', REMANSO: 'Remanso', TRAMA: 'Trama', SOBREMESA: 'Sobremesa', AMORA: 'Amora', DUNA: 'Duna', LENA: 'Lena' };
const NOMBRE_MATERIAL = { PINO: 'pino', LENGA: 'lenga', LENG: 'lenga', 'V.T': 'vidrio templado', 'V.C': 'vidrio', 'ROB.US': 'roble americano', 'ROB US': 'roble americano', 'ROB.HUALLE': 'roble hualle', HAYA: 'haya', TRAVERTINO: 'travertino', METAL: 'metal' };
const NOMBRE_COLOR = { NGR: 'negro', NAT: 'natural', BL: 'blanco', GRIS: 'gris', NOG: 'nogal' };
function nombrePila(p) { return ((p.cliente || '').trim().split(' ')[0] || '').replace(/^./, c => c.toUpperCase()); }
function telWa(p) { return (p.cliente_telefono || '').replace(/\D/g, ''); }
// Mensaje 1 de Mensajes_Despacho_e_Instalacion_v1_0.md (confirmación de despacho)
function mensajeDespacho(p) {
  const f = p.despacho_propuesto || p.fecha_comprometida;
  const dia = f ? 'el ' + fecha(f, true).replace(/^([^ ]+)/, m => ({ lun: 'lunes', mar: 'martes', 'mié': 'miércoles', jue: 'jueves', vie: 'viernes', 'sáb': 'sábado', dom: 'domingo' }[m] || m)) : 'este viernes';
  return `Hola! Confirmamos el despacho 🚚 de tu pedido ${dia} entre las 10 y 20 hrs. No manejamos un horario fijo por la cantidad de pedidos del día, pero los chicos te pueden avisar con al menos 30 minutos de anticipación.\n\n▶️ Importante: confirma que puedes recibir el pedido, o avísanos si prefieres que lo dejen en conserjería. Saludos! 👋`;
}
// Formato exacto de la skill mensajes-saldo-pendiente v1.2
function mensajeSaldo(p, abonos) {
  const pz = p.piezas || []; const cub = pz.find(x => ['Cubierta', 'Mesa', 'Mueble'].includes(x.tipo)) || {}; const sil = pz.find(x => x.tipo === 'Silla' || x.tipo === 'Banca');
  const modelo = NOMBRE_MODELO[cub.modelo_cubierta] || NOMBRE_MODELO[(pz.find(x => x.tipo === 'Base') || {}).modelo_base] || cub.modelo_cubierta || cub.descripcion || '';
  const L = [`${nombrePila(p)}, te dejamos por acá el detalle de tu pedido con el saldo pendiente.`, ''];
  L.push(`${modelo}${cub.personas ? ' ' + cub.personas + ' personas' : ''}`.trim());
  const det = [cub.material_cubierta ? `${NOMBRE_MATERIAL[cub.material_cubierta] || cub.material_cubierta}${cub.espesor_mm ? ' ' + cub.espesor_mm + 'mm' : ''}` : null, cub.largo_cm ? `${num(cub.largo_cm)} x ${num(cub.ancho_cm)}${cub.alto_cm ? ' x ' + num(cub.alto_cm) : ''} cm` : null, cub.color ? (NOMBRE_COLOR[cub.color] || cub.color) : null, cub.tono ? (/^\d$/.test(cub.tono) ? 'barniz ' + ({ 1: 'natural', 2: '2 manos', 4: '4 manos' }[cub.tono] || 'tono ' + cub.tono) : 'barniz ' + (NOMBRE_COLOR[cub.tono] || cub.tono)) : null].filter(Boolean);
  if (det.length) L.push(det.join(' · '));
  if (sil) L.push(`${sil.cantidad} sillas ${(sil.tipo_silla || '').toLowerCase().replace(/^./, c => c.toUpperCase())} ${({ NGR: 'negras', NAT: 'naturales', BL: 'blancas' }[sil.color_silla] || sil.color_silla || '')}`.trim());
  L.push('');
  L.push(`${sil ? 'Valor comedor' : 'Valor mesa'}: ${pesos(p.precio_venta)}`);
  L.push(`Despacho: ${pesos(p.precio_despacho)}`);
  L.push(`Instalación: ${p.precio_instalacion ? pesos(p.precio_instalacion) : 'n/a'}`);
  L.push('');
  L.push(`Total: ${pesos(p.total)}`);
  const positivos = (abonos || []).filter(a => a.monto > 0);
  if (positivos.length > 1) positivos.forEach((a, i) => L.push(`Abono${i + 1}: ${pesos(a.monto)}`)); else L.push(`Abono: ${pesos(p.abonado)}`);
  L.push('');
  if (p.saldo > 0) { L.push(`Saldo pendiente: ${pesos(p.saldo)}`, '', 'Datos para transferencia:', '', CUENTA_SANTINO, '', 'O paga con Webpay (agrega tu correo y el monto):', WEBPAY_LINK); }
  else L.push('Saldo pendiente: $0 ✓ Pagado');
  return L.join('\n');
}
function waLink(p, tipo) { return `https://wa.me/${telWa(p)}?text=${encodeURIComponent(tipo === 'despacho' ? mensajeDespacho(p) : `Hola ${nombrePila(p)}, te escribe Harold de Santino Design por tu pedido ${p.numero}.`)}`; }
async function abrirWaSaldo(p) {
  const { data: abonos } = await sb.from('abono').select('monto').eq('pedido_id', p.id).order('fecha');
  const texto = mensajeSaldo(p, abonos || []);
  const alertas = []; if (p.precio_instalacion > 80000) alertas.push(`Instalación ${pesos(p.precio_instalacion)} parece alta (¿un cero de más?)`); if (p.precio_despacho > 60000) alertas.push(`Despacho ${pesos(p.precio_despacho)} parece alto`);
  if (alertas.length) aviso('Revisa antes de enviar: ' + alertas.join(' · '), true);
  window.open(`https://wa.me/${telWa(p)}?text=${encodeURIComponent(texto)}`, '_blank');
}
function activarPiezas(raiz, despues) {
  $$('[data-pieza]', raiz).forEach(b => b.onclick = async ev => {
    ev.stopPropagation();
    const nuevo = b.dataset.estado === 'Lista' ? 'Pendiente' : 'Lista';
    try { const r = await rpc('marcar_pieza', { p_linea_id: Number(b.dataset.pieza), p_estado: nuevo }); if (r.todas_listas) aviso('Todas las piezas listas: se puede marcar LISTO EN TALLER'); despues && despues(r); }
    catch (e) { aviso(errorDe(e), true); }
  });
}
function exportarCSV() {
  const lista = filtrar(cache.pedidos);
  const cab = ['Estado', 'Numero', 'Cliente', 'Telefono', 'Tipo', 'Origen', 'Modelo', 'Color', 'Personas', 'Forma', 'Cubierta', 'Base', 'Espesor', 'Medida', 'Tono', 'Sillas', 'Entrega', 'Comuna', 'Compra', 'Estimada', 'Comprometida', 'Venta', 'Despacho', 'Total', 'Abonado', 'Saldo', 'Documento', 'Observacion'];
  const filas = lista.map(p => { const r = rasgos(p); return [p.estado, p.numero, p.cliente, p.cliente_telefono, p.tipo_pedido, p.origen, r.modelo, r.color, r.pers, r.forma, r.cubierta, r.base, r.esp, r.medida, r.tono, r.sillas, r.entrega, p.comuna, p.fecha_compra, p.fecha_estimada, p.fecha_comprometida, p.precio_venta, p.precio_despacho, p.total, p.abonado, p.saldo, p.documento_tributario + (p.documento_numero ? ' ' + p.documento_numero : ''), p.observacion]; });
  const csv = [cab, ...filas].map(f => f.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })); a.download = `pedidos_${hoyISO()}.csv`; a.click();
}

/* ---------- Harold · Tablero ---------- */
async function vTablero() {
  cache.filtro = 'pendientes'; await cargarPedidos();
  const { data: ent } = await sb.from('v_pedido').select('*').eq('estado', 'ENTREGADO').gte('entregado_en', new Date(Date.now() - 7 * 864e5).toISOString()).order('entregado_en', { ascending: false });
  const cols = [
    ['POR FABRICAR', 'var(--panel)', 'var(--gris)', p => ['POR FABRICAR', 'VISITA TÉCNICA', 'DIBUJO 3D', 'DISEÑO APROBADO'].includes(p.estado), 'Arrastra para cambiar la prioridad'],
    ['EN FABRICACIÓN', 'var(--azul-claro)', 'var(--azul-osc)', p => p.estado === 'EN FABRICACIÓN', 'Piezas por área de taller'],
    ['LISTO EN TALLER', 'var(--azul)', '#fff', p => p.estado === 'LISTO EN TALLER', 'Se cobra el saldo antes de programar'],
    ['DESPACHO PROGRAMADO', 'var(--azul-osc)', '#fff', p => p.estado === 'DESPACHO PROGRAMADO', 'Ruta de Alexis'],
    ['ENTREGADO', 'var(--gris)', '#fff', () => false, 'Últimos 7 días'],
  ];
  const mes = resumenMes(cache.pedidos.concat(ent || []));
  app.innerHTML = barra('#/tablero') + `<div class="sub">${mes}<span><span class="chip urgente">URGENTE</span> única etiqueta manual</span><span><span class="chip saldo">SALDO</span><span class="chip pago">PAGO PENDIENTE</span><span class="chip inst">INSTALACIÓN</span> se marcan solas</span></div>
    <div class="contenido"><div class="tablero">${cols.map(([nombre, bg, fg, f, nota]) => {
      const items = nombre === 'ENTREGADO' ? (ent || []) : cache.pedidos.filter(f).sort((a, b) => nombre === 'POR FABRICAR' ? (a.prioridad || 999) - (b.prioridad || 999) : 0);
      return `<div class="col" data-col="${nombre}"><div class="col-cab" style="background:${bg};color:${fg}"><span>${nombre}</span><span class="n">${items.length}</span></div><div style="font-size:11px;color:var(--gris-3);padding:0 4px">${nota}</div>${items.map(tarjeta).join('')}</div>`;
    }).join('')}</div></div>`;
  activarArrastre();
}
function resumenMes(lista) {
  const h = new Date(); const m = h.getMonth(), y = h.getFullYear();
  const del = lista.filter(p => { const d = new Date(p.fecha_compra + 'T12:00:00'); return d.getMonth() === m && d.getFullYear() === y && !['CANCELADO', 'DEVUELTO'].includes(p.estado) && !p.pago_pendiente; });
  const ventas = del.reduce((s, p) => s + p.total, 0); const atr = lista.filter(p => p.atrasado).length;
  return `<span><strong>${MESES_L[m][0].toUpperCase() + MESES_L[m].slice(1)}:</strong> ${del.length} pedidos de ${META} · ${pesos(ventas)} vendidos · ${atr} atrasados</span>`;
}
function tarjeta(p) {
  const r = rasgos(p); const sub = p.estado !== 'POR FABRICAR' && ['VISITA TÉCNICA', 'DIBUJO 3D', 'DISEÑO APROBADO'].includes(p.estado) ? `<span class="chip">${p.estado}</span>` : '';
  const piezas = p.estado === 'EN FABRICACIÓN' ? `<div class="piezas">${(p.piezas || []).filter(x => x.area).map(x => `<span class="chip ${x.estado === 'Lista' ? 'ok' : x.estado === 'En proceso' ? 'inst' : ''}">${esc(x.tipo === 'Servicio' ? 'Inst.' : x.tipo)}${x.estado === 'Lista' ? ' ✓' : ''}</span>`).join('')}</div>` : '';
  return `<div class="tarjeta ${p.atrasado ? 'atrasado' : ''}" draggable="true" data-id="${p.id}" data-estado="${p.estado}">
    <div class="t1"><span class="num">${esc(p.numero)} · ${esc(p.origen)}</span><span>${(p.etiquetas || []).filter(t => /URGENTE|PAGO|SALDO|A MEDIDA/.test(t)).slice(0, 2).map(t => chip(t.replace('SALDO PENDIENTE', 'SALDO ' + pesos(p.saldo)))).join(' ')}</span></div>
    <a class="nombre" href="#/pedido/${p.id}" style="color:inherit;text-decoration:none">${esc(p.cliente)}</a>
    <div class="gris">${esc(p.resumen || r.modelo)}</div>
    <div class="gris ${p.atrasado ? 'num' : ''}" style="${p.atrasado ? 'color:var(--rojo-txt)' : ''}">${esc(p.comuna || '')} · ${p.estado === 'ENTREGADO' ? 'entregado ' + fecha(p.entregado_en) : (p.fecha_comprometida ? 'comprometida ' : 'estimada ') + fecha(p.fecha_comprometida || p.fecha_estimada)}${p.atrasado ? ` · ${p.dias_atraso} días de atraso` : ''}</div>
    ${piezas}${sub ? `<div>${sub}</div>` : ''}
    ${p.despacho_propuesto && p.estado === 'LISTO EN TALLER' ? `<div><span class="chip prop">PROPUESTO ${fecha(p.despacho_propuesto, true)}</span> <button class="btn chico borde" data-confirmar="${p.id}">Confirmar</button> <a class="btn chico" target="_blank" href="${waLink(p, 'despacho')}">WhatsApp</a></div>` : ''}
    ${p.saldo > 0 && !p.pago_pendiente && p.estado !== 'ENTREGADO' ? `<button class="btn chico borde" data-saldo="${p.id}">Mensaje de saldo</button>` : ''}
  </div>`;
}
function activarArrastre() {
  let arrastrado = null;
  $$('.tarjeta').forEach(t => {
    t.ondragstart = ev => { arrastrado = t; t.classList.add('arrastrando'); ev.dataTransfer.effectAllowed = 'move'; };
    t.ondragend = () => { t.classList.remove('arrastrando'); $$('.col').forEach(c => c.classList.remove('sobre')); };
  });
  $$('.col').forEach(col => {
    col.ondragover = ev => { ev.preventDefault(); col.classList.add('sobre'); if (col.dataset.col === 'POR FABRICAR' && arrastrado && arrastrado.dataset.estado === 'POR FABRICAR') { const despues = [...col.querySelectorAll('.tarjeta')].find(t => t !== arrastrado && ev.clientY < t.getBoundingClientRect().top + t.offsetHeight / 2); if (despues) col.insertBefore(arrastrado, despues); else col.appendChild(arrastrado); } };
    col.ondragleave = () => col.classList.remove('sobre');
    col.ondrop = async ev => {
      ev.preventDefault(); col.classList.remove('sobre'); if (!arrastrado) return;
      const destino = col.dataset.col, id = Number(arrastrado.dataset.id), origen = arrastrado.dataset.estado;
      try {
        if (destino === 'POR FABRICAR' && origen === 'POR FABRICAR') { await rpc('reordenar_prioridad', { p_ids: [...col.querySelectorAll('.tarjeta')].map(t => Number(t.dataset.id)) }); aviso('Prioridad guardada'); }
        else if (destino !== origen && destino !== 'POR FABRICAR') { await rpc('cambiar_estado', { p_pedido_id: id, p_estado: destino }); aviso(`${destino}`); anotarCambio(`estado a ${destino} (volver a ${origen})`, () => rpc('cambiar_estado', { p_pedido_id: id, p_estado: origen })); }
        else if (destino === 'POR FABRICAR' && origen !== 'POR FABRICAR') { await rpc('cambiar_estado', { p_pedido_id: id, p_estado: 'POR FABRICAR' }); anotarCambio(`estado a POR FABRICAR (volver a ${origen})`, () => rpc('cambiar_estado', { p_pedido_id: id, p_estado: origen })); }
        vTablero();
      } catch (e) { aviso(errorDe(e), true); vTablero(); }
    };
  });
  $$('[data-confirmar]').forEach(b => b.onclick = async () => { try { await rpc('confirmar_despacho', { p_pedido_id: Number(b.dataset.confirmar) }); aviso('Despacho programado'); vTablero(); } catch (e) { aviso(errorDe(e), true); } });
  $$('[data-saldo]').forEach(b => b.onclick = () => abrirWaSaldo(cache.pedidos.find(p => p.id === Number(b.dataset.saldo))));
}

/* ---------- Ficha de pedido ---------- */
async function vFicha(id) {
  const esOp = yo.rol === 'operacion';
  const vista = esOp ? 'v_pedido_operacion' : 'v_pedido';
  const { data: p, error } = await sb.from(vista).select('*').eq('id', id).maybeSingle(); if (error) throw error;
  if (!p) { app.innerHTML = barra('') + `<div class="contenido"><div class="seccion">Este pedido no está disponible en tu vista.</div></div>`; return; }
  const [{ data: docs }, { data: hist }, { data: abonos }, { data: guias }] = await Promise.all([
    sb.from('documento').select('*').eq('pedido_id', id).order('subido_en', { ascending: false }),
    esOp ? Promise.resolve({ data: [] }) : sb.from('historial').select('*').eq('pedido_id', id).order('cuando', { ascending: false }).limit(60),
    esOp ? Promise.resolve({ data: [] }) : sb.from('abono').select('*').eq('pedido_id', id).order('fecha'),
    sb.from('guia_despacho').select('*').eq('pedido_id', id).order('numero', { ascending: false }),
  ]);
  const r = rasgos(p); const aMedida = A_MEDIDA.includes(p.tipo_pedido);
  const piezas = (p.piezas || []);
  app.innerHTML = barra(esOp ? '#/taller' : '#/lista') + `<div class="contenido">
    <div class="encabezado"><a href="${esOp ? '#/taller' : '#/lista'}">‹ Volver</a><h1>${esc(p.numero)} · ${esc(p.cliente)}</h1>${estadoHtml(p.estado)}${aMedida ? `<span class="chip medida">${esc(p.tipo_pedido.toUpperCase())}</span>` : ''}${(p.etiquetas || []).filter(t => !t.startsWith('A MEDIDA')).map(chip).join(' ')}
      ${esOp && p.saldo_por_cobrar > 0 ? `<span class="chip saldo">COBRAR ${pesos(p.saldo_por_cobrar)} AL ENTREGAR</span>` : ''}
      <div class="espacio"></div>
      ${esOp ? '' : `<label style="font-size:13px;display:flex;align-items:center;gap:6px"><input type="checkbox" id="c-urgente" ${p.urgente ? 'checked' : ''}> Urgente</label>
      <label style="font-size:13px">Estado <select id="s-estado">${ESTADOS.map(e => `<option ${e === p.estado ? 'selected' : ''}>${e}</option>`).join('')}</select></label>`}
    </div>
    ${aMedida && !esOp ? `<div class="pasos" style="margin-bottom:12px">${['VISITA TÉCNICA', 'DIBUJO 3D', 'DISEÑO APROBADO', 'EN FABRICACIÓN', 'LISTO EN TALLER', 'DESPACHO PROGRAMADO', 'ENTREGADO'].map(e => `<span class="${e === p.estado ? 'activo' : ''}">${e}</span>`).join('')}<span style="background:none">La fabricación solo parte con DISEÑO APROBADO (R-139)</span></div>` : ''}
    <div class="grid-ficha"><div class="columna">
      <section class="seccion"><div class="cab"><h2>Piezas del pedido · toca para marcar lista</h2>${esOp ? '' : `<button class="btn chico" id="b-linea">+ Agregar línea</button>`}</div>
        <div class="tabla-env"><table class="lista"><thead><tr><th>Pieza</th><th>Descripción</th><th>Diseño</th><th>Material</th><th>Medida</th><th title="Color de la base (estructura) y tono de la cubierta, por separado">Color base / tono cubierta</th><th>Área</th><th>Estado</th></tr></thead><tbody>
        ${piezas.map(x => `<tr><td><strong>${esc(x.tipo)}</strong>${x.cantidad > 1 ? ' ×' + x.cantidad : ''}</td><td>${esc(x.descripcion)}${x.nota_acabado ? `<div style="color:var(--gris-2)">${esc(x.nota_acabado)}</div>` : ''}</td><td>${esc([x.modelo_cubierta, x.modelo_base].filter(Boolean).join(' / ') || '-')}</td><td>${esc([x.material_cubierta, x.material_base].filter(Boolean).join(' / ') || '-')}${x.espesor_mm ? ' ' + x.espesor_mm + ' mm' : ''}</td><td class="nw">${x.largo_cm ? `${num(x.largo_cm)} x ${num(x.ancho_cm)}${x.alto_cm ? ' x ' + num(x.alto_cm) : ''}` : '-'}${x.personas ? ` · ${x.personas} pers.` : ''}</td><td>${esc([x.color ? 'base ' + x.color : null, x.tono ? tonoTxt(x.tono) : null, x.color_silla ? 'silla ' + x.color_silla : null].filter(Boolean).join(' · ') || '-')}</td><td class="nw">${esc(x.area || '-')}</td>
          <td>${x.area ? `<button class="pieza ${x.estado === 'Lista' ? 'lista' : x.estado === 'En proceso' ? 'proceso' : ''}" data-pieza="${x.id}" data-estado="${x.estado}">${x.estado}${x.estado === 'Lista' ? ' ✓' : ''}</button>${x.estado === 'Pendiente' ? ` <button class="btn chico" data-proceso="${x.id}">En proceso</button>` : ''}` : '-'}</td></tr>`).join('')}
        </tbody></table></div>
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
          ${['EN FABRICACIÓN', 'POR FABRICAR', 'DISEÑO APROBADO'].includes(p.estado) ? `<button class="btn primario" id="b-listo" ${p.piezas_listas < p.piezas_total ? 'disabled' : ''}>Marcar LISTO EN TALLER</button><span style="font-size:12px;color:var(--gris-2)">${p.piezas_listas} de ${p.piezas_total} piezas listas</span>` : ''}
          ${p.estado === 'LISTO EN TALLER' ? `<label style="font-size:13px">Proponer despacho <input type="date" id="f-prop" value="${p.despacho_propuesto || ''}"></label><button class="btn borde" id="b-prop">Proponer</button>${!esOp ? `<button class="btn primario" id="b-conf">Cliente confirmó: programar</button>` : ''}` : ''}
          ${!esOp && p.cliente_telefono ? `<a class="btn" target="_blank" href="${waLink(p, 'despacho')}" title="Mensaje 1 de las plantillas de despacho">WhatsApp: confirmar despacho</a>${p.saldo > 0 ? `<button class="btn" id="b-wa-saldo">WhatsApp: saldo pendiente</button>` : ''}` : ''}
          ${p.estado === 'DESPACHO PROGRAMADO' ? `<button class="btn primario" id="b-entregar">Marcar ENTREGADO</button>` : ''}
          ${p.cotizacion_numero ? `<span style="font-size:12px;color:var(--gris-2)">Cotización ${esc(p.cotizacion_numero)}</span>` : ''}
        </div>
      </section>
      ${esOp ? '' : `<section class="seccion"><div class="cab"><h2>Pagos</h2><button class="btn chico borde" id="b-abono">+ Registrar abono</button></div>
        <div class="cifras"><div class="cifra"><div>Venta</div><div>${pesos(p.precio_venta)}</div></div><div class="cifra"><div>Despacho + instalación</div><div>${pesos(p.precio_despacho + p.precio_instalacion + p.precio_embalaje)}</div></div><div class="cifra"><div>Abonado</div><div>${pesos(p.abonado)}</div></div><div class="cifra"><div>Saldo (calculado)</div><div style="color:${p.saldo > 0 ? 'var(--ambar-txt)' : 'var(--verde)'}">${pesos(p.saldo)}</div></div></div>
        ${abonos.length ? `<div class="tabla-env"><table class="lista"><thead><tr><th>Fecha</th><th>Monto</th><th>Medio</th><th>Referencia</th><th>Comprobante</th><th>Registró</th></tr></thead><tbody>${abonos.map(a => `<tr><td class="nw">${fecha(a.fecha)}</td><td class="mono">${pesos(a.monto)}</td><td>${esc(a.medio_pago)}</td><td>${esc(a.referencia || '')}</td><td>${a.comprobante_url ? `<a href="${esc(a.comprobante_url)}" target="_blank">ver</a>` : '-'}</td><td>${esc(a.registrado_por)}</td></tr>`).join('')}</tbody></table></div>` : '<div style="color:var(--gris-3);font-size:13px">Sin abonos todavía</div>'}
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;font-size:13px"><span>Documento tributario</span><select id="s-doc"><option ${p.documento_tributario === 'Pendiente' ? 'selected' : ''}>Pendiente</option><option ${p.documento_tributario === 'Boleta emitida' ? 'selected' : ''}>Boleta emitida</option><option ${p.documento_tributario === 'Factura emitida' ? 'selected' : ''}>Factura emitida</option></select><input id="i-docnum" placeholder="N°" value="${esc(p.documento_numero || '')}" style="width:90px"><input type="date" id="i-docfecha" value="${p.documento_fecha || ''}"><button class="btn chico" id="b-doc">Guardar</button></div>
      </section>
      <section class="seccion"><div class="cab"><h2>Guías de despacho</h2><button class="btn chico borde" id="b-guia">+ Nueva guía de despacho</button></div>
        ${(guias || []).length ? `<div class="docs">${guias.map(g => `<div class="doc"><span>Guía N° ${g.numero}${g.anulada ? ' (anulada)' : ''}<div class="tipo">${fecha(g.fecha)} · ${g.bultos} bulto${g.bultos > 1 ? 's' : ''} · ${esc(g.modalidad)} · ${esc(g.estado_pago)} · ${esc(g.emitida_por)}</div></span><a class="btn chico" href="#/guia/${g.id}">Ver / imprimir</a></div>`).join('')}</div>` : '<div style="color:var(--gris-3);font-size:13px">Sin guías emitidas. El correlativo sigue en la base (siguiente: el que muestre el formulario).</div>'}
      </section>
      <section class="seccion"><h2>Historial</h2><div class="historial">${hist.map(h => `<div><time>${fechaHora(h.cuando)}</time><span><strong>${esc(h.quien)}</strong> ${esc(h.campo)}: ${h.valor_anterior ? esc(h.valor_anterior) + ' → ' : ''}${esc(h.valor_nuevo || '')}</span></div>`).join('') || '<span style="color:var(--gris-3)">Sin movimientos</span>'}</div></section>`}
    </div><aside class="columna">
      <section class="seccion"><h2>Cliente</h2><div><strong>${esc(p.cliente)}</strong>${p.tipo_cliente ? ' · ' + esc(p.tipo_cliente) : ''}</div><div>${esc(p.cliente_telefono || '')}${p.cliente_email ? ' · ' + esc(p.cliente_email) : ''}</div><div>${esc(p.direccion || '')}${p.comuna ? ', ' + esc(p.comuna) : ''}</div>${p.cliente_telefono ? `<a href="https://wa.me/${p.cliente_telefono.replace(/\D/g, '')}" target="_blank">WhatsApp</a>` : ''}</section>
      <section class="seccion"><h2>Fechas y entrega</h2>
        <div class="fila-dato"><span>Compra</span><span>${fecha(p.fecha_compra)}</span></div>
        <div class="fila-dato"><span>Estimada (automática)</span><span>${fecha(p.fecha_estimada)}</span></div>
        <div class="fila-dato"><span>Comprometida</span>${esOp ? `<span>${fecha(p.fecha_comprometida, true)}</span>` : `<input type="date" id="i-comp" value="${p.fecha_comprometida || ''}" style="min-height:32px;padding:4px 8px">`}</div>
        <div class="fila-dato"><span>Tipo de entrega</span><span>${esc(p.tipo_entrega)}${p.instalacion ? ' + instalación' : ''}</span></div>
        <div class="fila-dato"><span>Nota de entrega</span><span>${esc(p.nota_entrega || '-')}</span></div>
        ${p.estado === 'POR FABRICAR' ? `<div class="fila-dato"><span>Prioridad</span><span>${p.prioridad || '-'} en cola</span></div>` : ''}
        ${esOp && p.saldo_por_cobrar > 0 ? `<div style="padding:10px;border-radius:8px;background:var(--ambar);color:var(--ambar-txt);font-weight:700">Cobrar ${pesos(p.saldo_por_cobrar)} al entregar</div>` : ''}
      </section>
      <section class="seccion"><div class="cab"><h2>${esOp ? 'Planos y fotos' : 'Documentos'}</h2>${esOp ? '' : `<button class="btn chico" id="b-subir">Subir</button>`}</div>
        <div class="docs">${docs.map(d => `<div class="doc"><span>${esc(d.nombre)}<div class="tipo">${esc(d.tipo)} · ${esc(d.subido_por)} · ${fecha(d.subido_en)}</div></span><span>${d.storage_path ? `<button class="btn chico" data-ver="${esc(d.storage_path)}">Ver / imprimir</button>` : d.url ? `<a class="btn chico" href="${esc(d.url)}" target="_blank">Abrir</a>` : ''}</span></div>`).join('') || '<span style="color:var(--gris-3);font-size:13px">Sin archivos</span>'}</div>
      </section>
      <section class="seccion"><h2>Observación</h2>${esOp ? `<div>${esc(p.observacion || '-')}</div>` : `<textarea id="t-obs">${esc(p.observacion || '')}</textarea><button class="btn chico" id="b-obs">Guardar</button>`}</section>
    </aside></div></div>`;
  // acciones
  const recargar = () => vFicha(id);
  activarPiezas(app, recargar);
  $$('[data-proceso]').forEach(b => b.onclick = async () => { try { await rpc('marcar_pieza', { p_linea_id: Number(b.dataset.proceso), p_estado: 'En proceso' }); recargar(); } catch (e) { aviso(errorDe(e), true); } });
  $$('[data-ver]').forEach(b => b.onclick = async () => { const { data, error } = await sb.storage.from('documentos').createSignedUrl(b.dataset.ver, 3600); if (error) return aviso(errorDe(error), true); window.open(data.signedUrl, '_blank'); });
  const on = (sel, fn) => { const el = $(sel); if (el) el.onclick = fn; };
  on('#b-listo', async () => { try { await rpc('cambiar_estado', { p_pedido_id: Number(id), p_estado: 'LISTO EN TALLER' }); aviso('Listo en taller'); anotarCambio(`${p.numero} listo en taller (volver a ${p.estado})`, () => rpc('cambiar_estado', { p_pedido_id: Number(id), p_estado: p.estado })); recargar(); } catch (e) { aviso(errorDe(e), true); } });
  on('#b-prop', async () => { const f = $('#f-prop').value; if (!f) return aviso('Elige una fecha', true); try { await rpc('proponer_despacho', { p_pedido_id: Number(id), p_fecha: f }); aviso('Propuesta guardada; Harold envía el mensaje'); recargar(); } catch (e) { aviso(errorDe(e), true); } });
  on('#b-conf', async () => { try { await rpc('confirmar_despacho', { p_pedido_id: Number(id), p_fecha: $('#f-prop').value || null }); aviso('Despacho programado'); recargar(); } catch (e) { aviso(errorDe(e), true); } });
  on('#b-entregar', () => formEntregar(p, recargar));
  on('#b-wa-saldo', () => abrirWaSaldo(p));
  if (!esOp) {
    $('#s-estado').onchange = async ev => { try { await rpc('cambiar_estado', { p_pedido_id: Number(id), p_estado: ev.target.value }); aviso('Estado: ' + ev.target.value); anotarCambio(`estado de ${p.numero} (volver a ${p.estado})`, () => rpc('cambiar_estado', { p_pedido_id: Number(id), p_estado: p.estado })); } catch (e) { aviso(errorDe(e), true); } recargar(); };
    $('#c-urgente').onchange = async ev => { const nuevo = ev.target.checked; const { error } = await sb.from('pedido').update({ urgente: nuevo }).eq('id', id); aviso(error ? errorDe(error) : (nuevo ? 'Marcado urgente' : 'Ya no es urgente'), !!error); if (!error) anotarCambio(`urgente de ${p.numero}`, () => sb.from('pedido').update({ urgente: !nuevo }).eq('id', id).then(r => { if (r.error) throw r.error; })); };
    $('#i-comp').onchange = async ev => { const { error } = await sb.from('pedido').update({ fecha_comprometida: ev.target.value || null }).eq('id', id); aviso(error ? errorDe(error) : 'Fecha comprometida guardada (queda en el historial)', !!error); if (!error) anotarCambio(`fecha de entrega de ${p.numero}`, () => sb.from('pedido').update({ fecha_comprometida: p.fecha_comprometida }).eq('id', id).then(r => { if (r.error) throw r.error; })); recargar(); };
    on('#b-obs', async () => { const { error } = await sb.from('pedido').update({ observacion: $('#t-obs').value }).eq('id', id); aviso(error ? errorDe(error) : 'Observación guardada', !!error); if (!error) anotarCambio(`observación de ${p.numero}`, () => sb.from('pedido').update({ observacion: p.observacion }).eq('id', id).then(r => { if (r.error) throw r.error; })); });
    on('#b-doc', async () => { const { error } = await sb.from('pedido').update({ documento_tributario: $('#s-doc').value, documento_numero: $('#i-docnum').value || null, documento_fecha: $('#i-docfecha').value || null }).eq('id', id); aviso(error ? errorDe(error) : 'Documento guardado', !!error); recargar(); });
    on('#b-abono', () => formAbono(p, recargar));
    on('#b-subir', () => formSubir(p, recargar));
    on('#b-linea', () => formLinea(p, recargar));
    on('#b-guia', () => formGuia(p));
  }
}
function formAbono(p, despues) {
  modal(`<h2>Registrar abono · ${esc(p.numero)}</h2><form id="f"><div class="campos">
    <label class="campo">Monto (negativo = devolución) <input name="monto" type="number" required value="${p.saldo > 0 ? p.saldo : ''}"></label>
    <label class="campo">Medio <select name="medio"><option>Transferencia</option><option>Webpay</option><option>MercadoPago</option><option>Getnet</option><option>Efectivo</option><option>Shopify</option></select></label>
    <label class="campo">Fecha <input name="fecha" type="date" value="${hoyISO()}"></label>
    <label class="campo">Referencia <input name="ref" placeholder="N° de operación, NC, nota"></label>
    <label class="campo">Comprobante (imagen o PDF) <input name="archivo" type="file" accept="image/*,.pdf"></label></div>
    <div class="acciones"><button type="button" class="btn" onclick="cerrarModal()">Cancelar</button><button class="btn primario">Guardar</button></div></form>`);
  $('#f').onsubmit = async ev => {
    ev.preventDefault(); const f = new FormData(ev.target); let url = null;
    try {
      const a = f.get('archivo');
      if (a && a.size) { const path = `${p.id}/comprobante_${Date.now()}_${a.name.replace(/[^\w.\-]/g, '_')}`; const { error } = await sb.storage.from('documentos').upload(path, a); if (error) throw error; await sb.from('documento').insert({ pedido_id: p.id, tipo: 'Comprobante', nombre: a.name, storage_path: path, subido_por: yo.nombre }); url = path; }
      const r = await rpc('registrar_abono', { p_pedido_id: p.id, p_monto: Number(f.get('monto')), p_medio: f.get('medio'), p_fecha: f.get('fecha'), p_referencia: f.get('ref') || null, p_comprobante_url: url });
      aviso(`Abono registrado · saldo ${pesos(r.saldo)}`); cerrarModal(); despues();
    } catch (e) { aviso(errorDe(e), true); }
  };
}
function formSubir(p, despues) {
  modal(`<h2>Subir documento · ${esc(p.numero)}</h2><form id="f"><div class="campos">
    <label class="campo">Tipo <select name="tipo"><option>Plano</option><option>Dibujo 3D</option><option>Cotización</option><option>Factura/Boleta</option><option>Comprobante</option><option>Foto de entrega</option><option>Otro</option></select></label>
    <label class="campo">Archivo (hasta 25 MB) <input name="archivo" type="file"></label>
    <label class="campo">o enlace (Drive) <input name="url" type="url" placeholder="https://drive.google.com/..."></label>
    <label class="campo">Nombre <input name="nombre" placeholder="se toma del archivo si va vacío"></label></div>
    <div class="acciones"><button type="button" class="btn" onclick="cerrarModal()">Cancelar</button><button class="btn primario">Guardar</button></div></form>`);
  $('#f').onsubmit = async ev => {
    ev.preventDefault(); const f = new FormData(ev.target); const a = f.get('archivo');
    try {
      const fila = { pedido_id: p.id, tipo: f.get('tipo'), nombre: f.get('nombre') || (a && a.name) || f.get('url'), subido_por: yo.nombre, url: f.get('url') || null };
      if (a && a.size) { const path = `${p.id}/${Date.now()}_${a.name.replace(/[^\w.\-]/g, '_')}`; const { error } = await sb.storage.from('documentos').upload(path, a); if (error) throw error; fila.storage_path = path; }
      else if (!fila.url) throw new Error('Adjunta un archivo o pega un enlace');
      const { error } = await sb.from('documento').insert(fila); if (error) throw error;
      aviso('Documento guardado'); cerrarModal(); despues();
    } catch (e) { aviso(errorDe(e), true); }
  };
}
function formEntregar(p, despues) {
  modal(`<h2>Entregar · ${esc(p.numero)} · ${esc(p.cliente)}</h2><form id="f">
    ${(p.saldo_por_cobrar ?? p.saldo) > 0 ? `<div style="padding:10px;border-radius:8px;background:var(--ambar);color:var(--ambar-txt);font-weight:700">Cobrar ${pesos(p.saldo_por_cobrar ?? p.saldo)} antes de entregar</div>` : ''}
    <label class="campo">Foto de entrega (opcional) <input name="foto" type="file" accept="image/*" capture="environment"></label>
    <div class="acciones"><button type="button" class="btn" onclick="cerrarModal()">Cancelar</button><button class="btn primario">Marcar ENTREGADO</button></div></form>`);
  $('#f').onsubmit = async ev => {
    ev.preventDefault(); const foto = new FormData(ev.target).get('foto'); let url = null;
    try {
      if (foto && foto.size) { const path = `entregas/${p.id}_${Date.now()}.jpg`; const { error } = await sb.storage.from('documentos').upload(path, foto, { contentType: foto.type || 'image/jpeg' }); if (error) throw error; url = path; }
      await rpc('marcar_entregado', { p_pedido_id: p.id, p_foto_url: url });
      aviso('Entregado ✓'); cerrarModal(); despues();
    } catch (e) { aviso(errorDe(e), true); }
  };
}
function camposLinea(prefijo = '') {
  return `<div class="campos">
    <label class="campo">Pieza <select name="${prefijo}tipo_linea"><option>Cubierta</option><option>Base</option><option>Mesa</option><option>Silla</option><option>Banca</option><option>Mueble</option><option>Barniz</option><option>Embalaje</option><option>Servicio</option><option>Repuesto</option></select></label>
    <label class="campo">Descripción para el cliente (sale en la guía de despacho y en los mensajes; ej. "Mesa Lena roble 180x90") <input name="${prefijo}descripcion" required></label>
    <label class="campo">Cantidad <input name="${prefijo}cantidad" type="number" value="1" min="1"></label>
    <label class="campo">Diseño cubierta <input name="${prefijo}modelo_cubierta" placeholder="REMANSO, Especial"></label>
    <label class="campo">Diseño base <input name="${prefijo}modelo_base" placeholder="TIVOLI, Especial"></label>
    <label class="campo">Material cubierta <input name="${prefijo}material_cubierta" placeholder="LENGA, V.T, TRAVERTINO"></label>
    <label class="campo">Material base <input name="${prefijo}material_base" placeholder="LENGA, METAL"></label>
    <label class="campo">Color estructura <input name="${prefijo}color_estructura" placeholder="NGR, BL, NAT, GRIS.MOS.S"></label>
    <label class="campo">Espesor mm <input name="${prefijo}espesor_mm" type="number"></label>
    <label class="campo">Largo cm <input name="${prefijo}largo_cm" type="number" step="0.5"></label>
    <label class="campo">Ancho cm <input name="${prefijo}ancho_cm" type="number" step="0.5"></label>
    <label class="campo">Alto cm <input name="${prefijo}alto_cm" type="number" step="0.5" value="76"></label>
    <label class="campo">Forma <select name="${prefijo}forma"><option value="">-</option><option>RECT</option><option>CUA</option><option>CIRC</option><option>OVAL</option></select></label>
    <label class="campo">Personas <input name="${prefijo}personas" type="number"></label>
    <label class="campo">Tono o barniz <select name="${prefijo}tono"><option value="">-</option>${['1', '2', '3', '4', '5', 'NGR', 'BL', 'GRIS', 'NOG', 'SIN BARNIZ', 'ESPECIAL'].map(t => `<option>${t}</option>`).join('')}</select></label>
    <label class="campo">Nota de acabado <input name="${prefijo}nota_acabado"></label>
    <label class="campo">Tipo silla <input name="${prefijo}tipo_silla" placeholder="TULIP, WISH, CROSS"></label>
    <label class="campo">Color silla <input name="${prefijo}color_silla"></label>
    <label class="campo">Área de taller <select name="${prefijo}area_taller"><option value="">(sin área: no es pieza)</option><option>Carpintería</option><option>Soldadura</option><option>Barniz</option><option>Armado muebles</option><option>Vidrio/compras</option><option>Embalaje</option><option>Despacho</option></select></label>
  </div>`;
}
function leerLinea(f, prefijo = '') {
  const v = k => { const x = f.get(prefijo + k); return x === '' || x == null ? null : x; };
  const n = k => v(k) == null ? null : Number(v(k));
  return { tipo_linea: v('tipo_linea'), descripcion: v('descripcion'), cantidad: n('cantidad') || 1, modelo_cubierta: v('modelo_cubierta'), modelo_base: v('modelo_base'), material_cubierta: v('material_cubierta'), material_base: v('material_base'), color_estructura: v('color_estructura'), espesor_mm: n('espesor_mm'), largo_cm: n('largo_cm'), ancho_cm: n('ancho_cm'), alto_cm: n('alto_cm'), forma: v('forma'), personas: n('personas'), tono: v('tono'), nota_acabado: v('nota_acabado'), tipo_silla: v('tipo_silla'), color_silla: v('color_silla'), area_taller: v('area_taller') };
}
function formLinea(p, despues) {
  modal(`<h2>Agregar línea · ${esc(p.numero)}</h2><form id="f">${camposLinea()}<div class="acciones"><button type="button" class="btn" onclick="cerrarModal()">Cancelar</button><button class="btn primario">Guardar</button></div></form>`);
  $('#f').onsubmit = async ev => { ev.preventDefault(); const l = leerLinea(new FormData(ev.target)); l.pedido_id = p.id; l.orden = (p.piezas || []).length + 1; const { error } = await sb.from('linea_pedido').insert(l); if (error) return aviso(errorDe(error), true); aviso('Línea agregada'); cerrarModal(); despues(); };
}
async function formPedido() {
  const { data: comunas } = await sb.from('comuna').select('nombre').order('nombre');
  const opComunas = (comunas || []).map(c => `<option>${esc(c.nombre)}</option>`).join('');
  let lineas = 1;
  const m = modal(`<h2>Nuevo pedido</h2><form id="f">
    <div class="campos">
      <label class="campo">Cliente existente (busca por nombre o teléfono) <input name="buscar_cliente" list="dl-cli" placeholder="escribe para buscar"><datalist id="dl-cli"></datalist><input type="hidden" name="cliente_id"></label>
      <label class="campo">o cliente nuevo: nombre <input name="c_nombre"></label>
      <label class="campo">Teléfono (+569XXXXXXXX) <input name="c_telefono" placeholder="+56912345678"></label>
      <label class="campo">Correo <input name="c_email" type="email"></label>
      <label class="campo">Tipo de cliente <select name="c_tipo"><option>Particular</option><option>Arquitecto</option><option>Diseñador</option><option>Contratista</option><option>Empresa</option></select></label>
      <label class="campo">Dirección <input name="c_direccion"></label>
      <label class="campo">Comuna <select name="c_comuna"><option value="">-</option>${opComunas}</select></label>
    </div><hr style="border:none;border-top:1px solid var(--linea)">
    <div class="campos">
      <label class="campo">Número (vacío = siguiente W) <input name="numero" placeholder="W3141 o #2090"></label>
      <label class="campo">Tipo de pedido <select name="tipo_pedido"><option>Venta catálogo</option><option>Mesa a medida</option><option>Mueble a medida</option><option>Proyecto</option><option>Postventa</option><option>Repuesto</option></select></label>
      <label class="campo">Origen <select name="origen"><option>WhatsApp</option><option>Instagram</option><option>Shopify</option><option>Fábrica</option><option>Tienda</option><option>Cliente directo</option><option>Correo</option><option>Colaborador</option><option>Interno</option></select></label>
      <label class="campo">Fecha de compra <input name="fecha_compra" type="date" value="${hoyISO()}" required></label>
      <label class="campo">Precio de venta <input name="precio_venta" type="number" required></label>
      <label class="campo">Despacho <input name="precio_despacho" type="number" value="19980"></label>
      <label class="campo">Instalación <input name="precio_instalacion" type="number" value="0"></label>
      <label class="campo">Tipo de entrega <select name="tipo_entrega"><option>Despacho RM</option><option>Despacho regiones</option><option>Retiro en taller</option></select></label>
      <label class="campo" style="flex-direction:row;align-items:center;gap:8px"><input type="checkbox" name="instalacion"> Con instalación</label>
      <label class="campo">Cotización N° <input name="cotizacion_numero" placeholder="Cot 3370"></label>
      <label class="campo">Fecha comprometida <input name="fecha_comprometida" type="date"></label>
      <label class="campo">Nota de entrega <input name="nota_entrega"></label>
      <label class="campo">Abono inicial <input name="abono" type="number" placeholder="0"></label>
      <label class="campo">Medio del abono <select name="abono_medio"><option>Transferencia</option><option>Webpay</option><option>MercadoPago</option><option>Getnet</option><option>Efectivo</option></select></label>
    </div>
    <label class="campo">Observación <textarea name="observacion"></textarea></label>
    <h2>Líneas (piezas)</h2><div id="lineas">${camposLinea('l0_')}</div><button type="button" class="btn chico" id="b-mas">+ otra línea</button>
    <div class="acciones"><button type="button" class="btn" onclick="cerrarModal()">Cancelar</button><button class="btn primario">Crear pedido</button></div></form>`);
  $('#b-mas', m).onclick = () => { const d = document.createElement('div'); d.innerHTML = '<hr style="border:none;border-top:1px solid var(--linea)">' + camposLinea(`l${lineas++}_`); $('#lineas', m).appendChild(d); };
  const bc = $('[name=buscar_cliente]', m);
  bc.oninput = async () => { const t = bc.value.trim(); if (t.length < 2) return; const { data } = await sb.from('v_cliente').select('id,nombre,telefono,comuna').or(`nombre.ilike.%${t}%,telefono.ilike.%${t}%`).limit(8); $('#dl-cli', m).innerHTML = (data || []).map(c => `<option value="${esc(c.nombre)} · ${esc(c.telefono || '')} · ${esc(c.comuna || '')}" data-id="${c.id}"></option>`).join(''); const op = [...$('#dl-cli', m).options].find(o => o.value === bc.value); $('[name=cliente_id]', m).value = op ? op.dataset.id : ''; };
  bc.onchange = bc.oninput;
  $('#f', m).onsubmit = async ev => {
    ev.preventDefault(); const f = new FormData(ev.target);
    try {
      let cliente_id = f.get('cliente_id');
      if (!cliente_id) {
        if (!f.get('c_nombre')) throw new Error('Elige un cliente existente o escribe el nombre del nuevo');
        const { data, error } = await sb.from('cliente').insert({ nombre: f.get('c_nombre'), telefono: f.get('c_telefono') || null, email: f.get('c_email') || null, tipo_cliente: f.get('c_tipo'), direccion: f.get('c_direccion') || null, comuna: f.get('c_comuna') || null }).select('id').single();
        if (error) throw error; cliente_id = data.id;
      }
      const numero = f.get('numero') || await rpc('siguiente_numero_w', {});
      const ped = { numero, cliente_id, tipo_pedido: f.get('tipo_pedido'), origen: f.get('origen'), fecha_compra: f.get('fecha_compra'), precio_venta: Number(f.get('precio_venta')), precio_despacho: Number(f.get('precio_despacho') || 0), precio_instalacion: Number(f.get('precio_instalacion') || 0), tipo_entrega: f.get('tipo_entrega'), instalacion: !!f.get('instalacion'), cotizacion_numero: f.get('cotizacion_numero') || null, fecha_comprometida: f.get('fecha_comprometida') || null, nota_entrega: f.get('nota_entrega') || null, observacion: f.get('observacion') || null, creado_por: yo.nombre };
      if (A_MEDIDA.includes(ped.tipo_pedido)) ped.estado = 'VISITA TÉCNICA';
      const { data: np, error } = await sb.from('pedido').insert(ped).select('id').single(); if (error) throw error;
      const ls = []; for (let i = 0; i < lineas; i++) { if (!f.get(`l${i}_descripcion`)) continue; const l = leerLinea(f, `l${i}_`); l.pedido_id = np.id; l.orden = i + 1; ls.push(l); }
      if (ls.length) { const { error: e2 } = await sb.from('linea_pedido').insert(ls); if (e2) throw e2; }
      if (Number(f.get('abono'))) await rpc('registrar_abono', { p_pedido_id: np.id, p_monto: Number(f.get('abono')), p_medio: f.get('abono_medio'), p_fecha: f.get('fecha_compra') });
      aviso('Pedido ' + numero + ' creado'); cerrarModal(); location.hash = '#/pedido/' + np.id;
    } catch (e) { aviso(errorDe(e), true); }
  };
}

/* ---------- Harold · Panel ---------- */
async function vPanel() {
  const [{ data: meses }, { data: atrasados }, { data: delMes }] = await Promise.all([
    sb.from('v_panel_mes').select('*').order('mes'),
    sb.from('v_pedido').select('id,numero,cliente,dias_atraso,saldo,estado,tipo_entrega').eq('atrasado', true).order('dias_atraso', { ascending: false }),
    sb.from('v_pedido').select('origen,tipo_cliente,total,tipo_pedido,pago_pendiente,estado').gte('fecha_compra', hoyISO().slice(0, 8) + '01'),
  ]);
  const h = new Date(); const y = h.getFullYear(), m = h.getMonth();
  const porMes = {}; (meses || []).forEach(r => porMes[r.mes.slice(0, 7)] = r);
  const k = `${y}-${String(m + 1).padStart(2, '0')}`, kAnt = `${y - 1}-${String(m + 1).padStart(2, '0')}`;
  const act = porMes[k] || { pedidos: 0, ventas: 0, pedidos_a_medida: 0, ventas_a_medida: 0 }, ant = porMes[kAnt];
  const dia = h.getDate(), diasMes = new Date(y, m + 1, 0).getDate(); const ritmo = Math.round(act.pedidos / dia * diasMes);
  const validos = (delMes || []).filter(p => !['CANCELADO', 'DEVUELTO'].includes(p.estado) && !p.pago_pendiente);
  const agrupar = campo => { const g = {}; validos.forEach(p => { const kk = p[campo] || '-'; g[kk] = g[kk] || { n: 0, v: 0 }; g[kk].n++; g[kk].v += p.total; }); return Object.entries(g).sort((a, b) => b[1].n - a[1].n); };
  const maxP = Math.max(1, ...Object.values(porMes).map(r => r.pedidos));
  app.innerHTML = barra('#/panel') + `<div class="sub">${MESES_L[m][0].toUpperCase() + MESES_L[m].slice(1)} ${y}, al día ${dia}. Los tres números primero; abajo, el mismo mes del año pasado.</div><div class="contenido" style="display:flex;flex-direction:column;gap:14px">
    <div class="cifras">
      <div class="cifra grande seccion"><div>Pedidos del mes · meta ${META}</div><div>${act.pedidos}</div><div class="progreso"><div style="width:${Math.min(100, act.pedidos / META * 100)}%"></div></div><div style="font-size:12px;color:var(--gris-2)">${Math.round(act.pedidos / META * 100)}% de la meta · ritmo para cerrar en ${ritmo}</div>${ant ? `<div style="font-size:12px;color:var(--gris-2)">${MESES_L[m]} ${y - 1}: cerró en ${ant.pedidos}</div>` : ''}</div>
      <div class="cifra grande seccion"><div>Ventas del mes (con IVA)</div><div>${pesos(act.ventas)}</div><div style="font-size:12px;color:var(--gris-2)">Catálogo ${pesos(act.ventas - (act.ventas_a_medida || 0))} · a medida ${pesos(act.ventas_a_medida || 0)}</div>${ant ? `<div style="font-size:12px;color:var(--gris-2)">${MESES_L[m]} ${y - 1}: ${pesos(ant.ventas)}</div>` : ''}</div>
      <div class="cifra grande seccion"><div>Pedidos atrasados</div><div style="color:${atrasados.length ? 'var(--rojo-txt)' : 'var(--azul)'}">${atrasados.length}</div><div style="font-size:12px;color:var(--gris-2)">${atrasados.slice(0, 4).map(p => `<a href="#/pedido/${p.id}">${esc(p.numero)}</a> ${esc(p.cliente)} (${p.dias_atraso} días)`).join(' · ')}</div></div>
    </div>
    <section class="seccion"><h2>Pedidos por mes · ${y} contra ${y - 1}</h2><div class="barras">${MESES.map((mm, i) => { const a = porMes[`${y}-${String(i + 1).padStart(2, '0')}`], b = porMes[`${y - 1}-${String(i + 1).padStart(2, '0')}`]; return `<div class="barra-mes"><div class="par"><div class="b" style="height:${(b ? b.pedidos : 0) / maxP * 100}%" title="${y - 1}: ${b ? b.pedidos : 0}"></div><div class="b actual" style="height:${(a ? a.pedidos : 0) / maxP * 100}%" title="${y}: ${a ? a.pedidos : 0}"></div></div><span>${mm}</span><span style="font-size:10px">${a ? a.pedidos : '·'} / ${b ? b.pedidos : '·'}</span></div>`; }).join('')}</div><div style="font-size:12px;color:var(--gris-2)">Barra gris ${y - 1}, barra azul ${y}. Datos de prueba en el prototipo.</div></section>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:14px">
      <section class="seccion"><h2>Por origen · mes actual</h2><table class="lista"><thead><tr><th>Origen</th><th>Pedidos</th><th>Ventas</th></tr></thead><tbody>${agrupar('origen').map(([kk, v]) => `<tr><td>${esc(kk)}</td><td>${v.n}</td><td class="mono">${pesos(v.v)}</td></tr>`).join('')}</tbody></table></section>
      <section class="seccion"><h2>Por tipo de cliente · mes actual</h2><table class="lista"><thead><tr><th>Tipo</th><th>Pedidos</th><th>Ventas</th><th>Margen $ ; %</th></tr></thead><tbody>${agrupar('tipo_cliente').map(([kk, v]) => `<tr><td>${esc(kk)}</td><td>${v.n}</td><td class="mono">${pesos(v.v)}</td><td style="color:var(--gris-3)">Fase 6</td></tr>`).join('')}</tbody></table></section>
    </div></div>`;
}

/* ---------- Harold · Clientes y Bandeja ---------- */
async function vClientes() {
  const { data } = await sb.from('v_cliente').select('*').order('ultima_compra', { ascending: false, nullsFirst: false }).limit(300);
  app.innerHTML = barra('#/clientes') + `<div class="sub"><label>Buscar <input type="search" id="b" style="width:240px"></label><span style="color:var(--gris-3)">${data.length} clientes</span></div><div class="contenido"><div class="tabla-env"><table class="lista"><thead><tr><th>Nombre</th><th>Tipo</th><th>Teléfono</th><th>Correo</th><th>Comuna</th><th>Pedidos</th><th>Total comprado</th><th>Última compra</th></tr></thead><tbody id="tb"></tbody></table></div></div>`;
  const pintar = () => { const t = $('#b').value.toLowerCase(); $('#tb').innerHTML = data.filter(c => !t || [c.nombre, c.telefono, c.email, c.empresa].join(' ').toLowerCase().includes(t)).map(c => `<tr><td class="nw"><strong>${esc(c.nombre)}</strong>${c.empresa && c.empresa !== c.nombre ? ' · ' + esc(c.empresa) : ''}</td><td>${esc(c.tipo_cliente)}</td><td class="nw">${esc(c.telefono || '')}</td><td>${esc(c.email || '')}</td><td>${esc(c.comuna || '')}</td><td>${c.pedidos}</td><td class="mono">${pesos(c.total_comprado)}</td><td class="nw">${fecha(c.ultima_compra)}</td></tr>`).join(''); };
  $('#b').oninput = pintar; pintar();
}
async function vBandeja() {
  const { data } = await sb.from('v_bandeja').select('*').order('creado_en', { ascending: false });
  app.innerHTML = barra('#/bandeja') + `<div class="sub">Pedidos de Shopify sin pago, propuestas de Claude y productos que no se reconocieron. Se resuelven uno por uno.</div><div class="contenido"><div class="columna">${(data || []).map(b => `<div class="seccion"><div class="cab"><div><strong>${esc(b.titulo)}</strong><div style="font-size:12px;color:var(--gris-2)">${esc(b.tipo)} · ${fechaHora(b.creado_en)}${b.numero ? ` · <a href="#/pedido/${b.pedido_id}">${esc(b.numero)}</a> ${esc(b.cliente || '')}` : ''}</div>${b.detalle ? `<pre style="font-size:11px;color:var(--gris-3);white-space:pre-wrap;margin:6px 0 0">${esc(JSON.stringify(b.detalle, null, 1)).slice(0, 600)}</pre>` : ''}</div><button class="btn chico" data-res="${b.id}">Resuelto</button></div></div>`).join('') || '<div class="seccion">Bandeja vacía</div>'}</div></div>`;
  $$('[data-res]').forEach(b => b.onclick = async () => { await sb.from('bandeja').update({ resuelta: true }).eq('id', b.dataset.res); vBandeja(); });
}

/* ---------- Alexis · Lista por semana ---------- */
async function cargarOperacion() {
  await cargarModelos();
  const { data, error } = await sb.from('v_pedido_operacion').select('*').order('fecha_entrega', { ascending: true, nullsFirst: false }).order('prioridad'); if (error) throw error; cache.pedidos = data; return data;
}
function lunesDe(s) { const d = new Date(s + 'T12:00:00'); const dia = (d.getDay() + 6) % 7; d.setDate(d.getDate() - dia); return d; }
function etiquetaSemana(lunes) { const v = new Date(lunes); v.setDate(v.getDate() + 4); return `Semana del ${String(lunes.getDate()).padStart(2, '0')} al ${String(v.getDate()).padStart(2, '0')} de ${MESES_L[v.getMonth()]}`; }
async function vTaller() {
  await cargarOperacion();
  app.innerHTML = barra('#/taller') + `<div class="sub no-imprimir">
      <label>Ver <select id="ver"><option value="pendientes" ${cache.opVer === 'pendientes' ? 'selected' : ''}>Pendientes por semana</option><option value="semana" ${cache.opVer === 'semana' ? 'selected' : ''}>Solo esta semana</option><option value="listos" ${cache.opVer === 'listos' ? 'selected' : ''}>Listos y programados</option><option value="entregados" ${cache.opVer === 'entregados' ? 'selected' : ''}>Entregados recientes</option></select></label>
      <label>Buscar <input type="search" id="f-busca" value="${esc(cache.busqueda)}" style="width:200px"></label>
      <a class="btn borde" href="#/imprimir-listado">Imprimir listado</a>
      <span style="color:var(--gris-3)">Toca una fila y se abre ahí mismo. Toca una pieza y queda lista.</span></div>
    <div class="contenido"><div class="tabla-env" id="tabla"></div></div>`;
  $('#ver').onchange = e => { cache.opVer = e.target.value; pintarTaller(); };
  $('#f-busca').oninput = e => { cache.busqueda = e.target.value; pintarTaller(); };
  pintarTaller();
}
function pintarTaller() {
  let lista = filtrar(cache.pedidos);
  const lunesHoy = lunesDe(hoyISO());
  if (cache.opVer === 'pendientes') lista = lista.filter(p => p.estado !== 'ENTREGADO');
  else if (cache.opVer === 'semana') lista = lista.filter(p => p.estado !== 'ENTREGADO' && p.fecha_entrega && lunesDe(p.fecha_entrega) <= lunesHoy);
  else if (cache.opVer === 'listos') lista = lista.filter(p => ['LISTO EN TALLER', 'DESPACHO PROGRAMADO'].includes(p.estado));
  else lista = lista.filter(p => p.estado === 'ENTREGADO');
  const grupos = {}; lista.forEach(p => { const k = p.fecha_entrega ? lunesDe(p.fecha_entrega).toISOString().slice(0, 10) : 'zz'; (grupos[k] = grupos[k] || []).push(p); });
  const cab = ['N°', 'Cliente', 'Modelo', 'Medida', 'Material', 'Color / tono', 'Sillas', 'Entrega', 'Piezas (toca para marcar)'];
  $('#tabla').innerHTML = `<table class="lista"><thead><tr>${cab.map(c => `<th>${c}</th>`).join('')}</tr></thead><tbody>${Object.keys(grupos).sort().map(k => `<tr class="semana"><td colspan="9">${k === 'zz' ? 'Pedidos sin fecha de entrega' : etiquetaSemana(new Date(k + 'T12:00:00'))}</td></tr>` + grupos[k].map(p => {
    const r = rasgos(p); const bloqueado = ['POR FABRICAR', 'VISITA TÉCNICA', 'DIBUJO 3D'].includes(p.estado) && A_MEDIDA.includes(p.tipo_pedido);
    return `<tr class="fila ${p.atrasado ? 'atrasado' : ''}" data-id="${p.id}"><td class="num">${esc(p.numero)}${p.urgente ? ' <span class="chip urgente">URGENTE</span>' : ''}</td><td><strong>${esc(p.cliente)}</strong><br><span style="color:var(--gris-2);font-size:12px">${esc(p.comuna || '')} · ${fecha(p.fecha_entrega, true)}${p.instalacion ? ' · instalación' : ''}${p.tipo_entrega === 'Despacho regiones' ? ' · regiones' : ''}</span></td><td class="nw">${esc(r.modelo)}${r.pers !== '-' ? ' ' + r.pers + 'P' : ''}</td><td class="nw">${esc(r.medida)}</td><td class="nw">${esc(r.cubierta)}${r.esp !== '-' ? ' ' + r.esp : ''}${r.base !== '-' && r.base !== r.cubierta ? ' / ' + esc(r.base) : ''}</td><td class="nw">${esc(r.color)}${r.tono !== '-' ? ' · ' + esc(tonoTxt(r.tono)) : ''}</td><td class="nw">${esc(r.sillas)}</td><td class="nw">${esc(r.entrega)}</td>
      <td class="no-imprimir">${p.estado === 'LISTO EN TALLER' ? `<span class="estado e-LISTO_EN_TALLER">LISTO EN TALLER</span>${p.despacho_propuesto ? ` <span class="chip prop">propuesto ${fecha(p.despacho_propuesto, true)}</span>` : ''}` : p.estado === 'DESPACHO PROGRAMADO' ? `<span class="estado e-DESPACHO_PROGRAMADO">DESPACHO ${fecha(p.fecha_comprometida, true)}</span>` : p.estado === 'ENTREGADO' ? `<span class="estado e-ENTREGADO">ENTREGADO</span>` : bloqueado ? `<span class="chip">${esc(p.estado)} · aún no entra</span>` : piezasHtml(p, true)}</td></tr>`;
  }).join('')).join('')}</tbody></table>`;
  $$('#tabla tr.fila').forEach(tr => tr.onclick = ev => { if (ev.target.closest('button')) return; abrirDetalleTaller(tr); });
  activarPiezas($('#tabla'), r => { const p = cache.pedidos.find(x => x.id === r.pedido_id); if (p) { p.piezas = r.piezas; p.estado = r.estado; p.piezas_listas = r.piezas.filter(x => x.area && x.estado === 'Lista').length; } pintarTaller(); });
}
function abrirDetalleTaller(tr) {
  const sig = tr.nextElementSibling; if (sig && sig.classList.contains('detalle')) { sig.remove(); return; }
  $$('#tabla tr.detalle').forEach(x => x.remove());
  const p = cache.pedidos.find(x => x.id == tr.dataset.id); const acab = (p.piezas || []).filter(x => x.nota_acabado).map(x => x.nota_acabado).join(' · ');
  const d = document.createElement('tr'); d.className = 'detalle no-imprimir';
  d.innerHTML = `<td colspan="9"><div style="display:flex;gap:16px;flex-wrap:wrap;align-items:center;font-size:14px">
    ${acab ? `<span>Acabado: ${esc(acab)}</span>` : ''}
    <span>Entrega: ${esc(p.direccion || '')}${p.nota_entrega ? ' · ' + esc(p.nota_entrega) : ''}</span>
    ${p.cliente_telefono ? `<span>${esc(p.cliente_telefono)}</span>` : ''}
    ${p.saldo_por_cobrar > 0 ? `<span class="chip saldo" style="font-size:13px">COBRAR ${pesos(p.saldo_por_cobrar)}</span>` : ''}
    ${p.observacion ? `<span>Obs.: ${esc(p.observacion)}</span>` : ''}
    <a class="btn" href="#/pedido/${p.id}">Ficha${p.planos ? ` · planos (${p.planos})` : ''}</a>
    ${['EN FABRICACIÓN', 'POR FABRICAR', 'DISEÑO APROBADO'].includes(p.estado) ? `<button class="btn primario" data-listo="${p.id}" ${p.piezas_listas < p.piezas_total ? 'disabled' : ''}>Marcar LISTO EN TALLER</button><span style="font-size:12px;color:var(--gris-2)">se activa con las ${p.piezas_total} piezas listas</span>` : ''}
    ${p.estado === 'LISTO EN TALLER' ? `<label style="font-size:13px">Proponer despacho <input type="date" data-fecha="${p.id}" value="${p.despacho_propuesto || ''}"></label><button class="btn borde" data-prop="${p.id}">Proponer</button>` : ''}
    ${p.estado === 'DESPACHO PROGRAMADO' ? `<button class="btn primario" data-entregar="${p.id}">Entregar</button>` : ''}
  </div></td>`;
  tr.after(d);
  const bl = $('[data-listo]', d); if (bl) bl.onclick = async () => { try { await rpc('cambiar_estado', { p_pedido_id: p.id, p_estado: 'LISTO EN TALLER' }); aviso('Listo en taller ✓'); vTaller(); } catch (e) { aviso(errorDe(e), true); } };
  const bp = $('[data-prop]', d); if (bp) bp.onclick = async () => { const f = $('[data-fecha]', d).value; if (!f) return aviso('Elige la fecha', true); try { await rpc('proponer_despacho', { p_pedido_id: p.id, p_fecha: f }); aviso('Propuesta enviada a Harold'); vTaller(); } catch (e) { aviso(errorDe(e), true); } };
  const be = $('[data-entregar]', d); if (be) be.onclick = () => formEntregar(p, () => vTaller());
}

/* ---------- Listado operacional imprimible (mismo formato que el PDF de auto-pedidodespacho v3.1) ---------- */
async function vImprimirListado() {
  const esOp = yo.rol === 'operacion';
  if (esOp) await cargarOperacion(); else { cache.filtro = 'pendientes'; await cargarPedidos(); }
  const UMBRAL_PLANO = 25;
  const activos = cache.pedidos.filter(p => !['ENTREGADO', 'CANCELADO', 'DEVUELTO'].includes(p.estado) && !p.pago_pendiente);
  const fe = p => p.fecha_comprometida || p.fecha_estimada || null;
  const con = activos.filter(p => fe(p)).sort((a, b) => fe(a).localeCompare(fe(b))), sin = activos.filter(p => !fe(p));
  const hoy = new Date(); const titulo = `LISTADO OPERACIONAL - Santino Design  |  ${String(hoy.getDate()).padStart(2, '0')}/${String(hoy.getMonth() + 1).padStart(2, '0')}/${hoy.getFullYear()}  |  ${activos.length} pedidos activos`;
  const cab = ['Envio', 'Inst.', 'Cliente', 'Cant.', 'Modelo', 'Color Est', 'Formato', 'Forma', 'Material', 'Esp.', 'Med. Esp', 'Barniz', 'Tipo Silla', 'Color Silla', 'Cant. Silla', 'F. Entrega'];
  const fila = p => { const r = rasgos(p); const pz = p.piezas || []; const cub = pz.find(x => ['Cubierta', 'Mesa', 'Mueble', 'Repuesto'].includes(x.tipo)) || {}; const sil = pz.find(x => x.tipo === 'Silla' || x.tipo === 'Banca');
    const envio = p.tipo_entrega === 'Despacho regiones' ? 'REGIONES' : p.tipo_entrega === 'Retiro en taller' ? 'RETIRO' : 'RM';
    return [envio, p.instalacion ? 'SI' : '-', p.cliente, cub.cantidad || 1, r.modelo, r.color, cub.personas ? cub.personas + ' PER' : '-', r.forma, r.cubierta + (r.base !== '-' && r.base !== r.cubierta ? ' / ' + r.base : ''), r.esp, r.medida === '-' ? '-' : r.medida + ' cm', String(r.tono).toUpperCase() === 'SIN BARNIZ' ? 'Sin barniz' : r.tono, sil ? (sil.tipo_silla || '-') : 'n/a', sil ? (sil.color_silla || '-') : 'n/a', sil ? sil.cantidad : 'n/a', fecha(fe(p))]; };
  const tabla = lista => `<table class="lista impresion"><thead><tr>${cab.map(c => `<th>${c}</th>`).join('')}</tr></thead><tbody>${lista.map(p => `<tr class="${p.atrasado ? 'atrasado' : ''}">${fila(p).map(v => `<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  let cuerpo = '';
  if (activos.length < UMBRAL_PLANO) { cuerpo = tabla(con) + (sin.length ? `<h3 class="salto">Pedidos sin fecha de entrega</h3>${tabla(sin)}` : ''); }
  else {
    const grupos = {}; con.forEach(p => { const k = lunesDe(fe(p)).toISOString().slice(0, 10); (grupos[k] = grupos[k] || []).push(p); });
    cuerpo = Object.keys(grupos).sort().map(k => `<h3>${etiquetaSemana(new Date(k + 'T12:00:00'))}</h3>${tabla(grupos[k])}`).join('') + (sin.length ? `<h3 class="salto">Pedidos sin fecha de entrega</h3>${tabla(sin)}` : '');
  }
  app.innerHTML = barra(esOp ? '#/taller' : '#/lista') + `<div class="sub no-imprimir"><a href="${esOp ? '#/taller' : '#/lista'}">‹ Volver</a><button class="btn primario" onclick="window.print()">Imprimir</button><span style="color:var(--gris-3)">Mismo formato que el Listado Operacional en PDF (carta horizontal, ${activos.length < UMBRAL_PLANO ? 'una sola tabla' : 'agrupado por semana'}).</span></div>
    <div class="contenido listado-print"><div class="titulo-print">${esc(titulo)}</div>${cuerpo}</div>`;
}

/* ---------- Ruta ---------- */
async function vRuta() {
  await (yo.rol === 'operacion' ? cargarOperacion() : (cache.filtro = 'pendientes', cargarPedidos()));
  const saldoDe = p => p.saldo_por_cobrar ?? p.saldo;
  if (!cache.rutaFecha) cache.rutaFecha = hoyISO();
  const f = cache.rutaFecha;
  const candidatos = cache.pedidos.filter(p => ['LISTO EN TALLER', 'EN FABRICACIÓN'].includes(p.estado));
  const programados = cache.pedidos.filter(p => p.estado === 'DESPACHO PROGRAMADO' && (p.fecha_comprometida === f || p.despacho_propuesto === f));
  const ordenar = l => l.slice().sort((a, b) => { const ia = ORDEN_COMUNAS.indexOf(a.comuna), ib = ORDEN_COMUNAS.indexOf(b.comuna); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || (a.comuna || '').localeCompare(b.comuna || ''); });
  let ruta = cache.ordenRuta.length ? cache.ordenRuta.map(id => programados.find(p => p.id === id)).filter(Boolean).concat(programados.filter(p => !cache.ordenRuta.includes(p.id))) : ordenar(programados.filter(p => p.tipo_entrega !== 'Despacho regiones'));
  const regiones = programados.filter(p => p.tipo_entrega === 'Despacho regiones');
  app.innerHTML = barra('#/ruta') + `<div class="sub no-imprimir"><label>Fecha <input type="date" id="f-ruta" value="${f}"></label><div class="pasos"><span class="activo">1. Alexis propone</span><span>2. Harold envía mensajes</span><span>3. Cliente confirma</span><span>4. Entra a la ruta</span></div></div>
  <div class="contenido" style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px">
    <section class="seccion no-imprimir"><h2>Propuesta para el ${fecha(f, true)}</h2><div style="font-size:13px;color:var(--gris-2)">Marca lo que se puede despachar ese día. Solo lo confirmado por el cliente entra a la ruta.</div>
      ${candidatos.map(p => { const listo = p.estado === 'LISTO EN TALLER'; const prop = p.despacho_propuesto === f; return `<div class="prop"><input type="checkbox" data-prop="${p.id}" ${prop ? 'checked' : ''} ${listo ? '' : 'disabled'}><span style="flex:1"><strong>${esc(p.numero)}</strong> ${esc(p.cliente)} · ${esc(p.comuna || '')}<br><span style="font-size:12px;color:var(--gris-2)">${esc(p.resumen || '')}${saldoDe(p) > 0 ? ` · cobrar ${pesos(saldoDe(p))}` : ' · pagado'}${p.tipo_entrega === 'Despacho regiones' ? ' · regiones: va por guía' : ''}</span></span><span>${listo ? (prop ? '<span class="chip prop">PROPUESTO · esperando</span>' : '<span class="chip ok">LISTO</span>') : `<span class="chip">EN FABRICACIÓN · ${p.piezas_listas}/${p.piezas_total}</span>`}</span></div>`; }).join('') || '<div style="color:var(--gris-3)">Nada listo en taller</div>'}
      <div style="font-size:12px;color:var(--gris-2)">Harold envía los WhatsApp y marca "confirmado" cuando el cliente responde; el pedido pasa solo a DESPACHO PROGRAMADO.</div></section>
    <section class="seccion"><div class="cab"><h2>Ruta del ${fecha(f, true)} · confirmados</h2><span class="no-imprimir" style="font-size:12px;color:var(--gris-2)">orden propuesto por comuna, ▲▼ para cambiar</span></div>
      ${ruta.map((p, i) => `<div class="parada"><div class="n">${i + 1}</div><div><div class="num">${esc(p.numero)} ${esc(p.cliente)}</div><div class="gris">${esc(p.comuna || '')} · ${esc(p.direccion || '')}${p.nota_entrega ? ' · ' + esc(p.nota_entrega) : ''}</div></div><div><div>${esc(p.resumen || '')}</div><div class="gris">${esc(p.cliente_telefono || '')}</div></div><div>${saldoDe(p) > 0 ? `<span class="chip saldo">COBRAR ${pesos(saldoDe(p))}</span>` : '<span class="chip ok">PAGADO</span>'} ${p.instalacion ? '<span class="chip inst">INSTALACIÓN</span>' : ''}</div><div class="no-imprimir" style="display:flex;gap:4px"><button class="btn chico" data-sube="${i}" aria-label="Subir">▲</button><button class="btn chico" data-baja="${i}" aria-label="Bajar">▼</button><button class="btn chico primario" data-entregar="${p.id}">Entregado</button></div></div>`).join('') || '<div style="color:var(--gris-3)">Sin despachos confirmados para esta fecha</div>'}
      ${regiones.length ? `<div style="font-size:13px"><strong>Regiones (guía y transporte, no van en ruta):</strong> ${regiones.map(p => `${esc(p.numero)} ${esc(p.cliente)} · ${esc(p.comuna || '')}`).join(' · ')}</div>` : ''}
      <div class="acciones no-imprimir" style="justify-content:flex-start"><button class="btn borde" onclick="window.print()">Imprimir ruta</button><button class="btn borde" id="b-etiq" ${ruta.length ? '' : 'disabled'}>Imprimir etiquetas (${ruta.length})</button></div>
      <div class="no-imprimir" style="font-size:12px;color:var(--gris-2)">Al volver, cada parada se marca ENTREGADO con foto opcional.</div></section></div>`;
  $('#f-ruta').onchange = e => { cache.rutaFecha = e.target.value; cache.ordenRuta = []; vRuta(); };
  $$('[data-prop]').forEach(c => c.onchange = async () => { try { await rpc('proponer_despacho', { p_pedido_id: Number(c.dataset.prop), p_fecha: c.checked ? f : null }); aviso(c.checked ? 'Propuesto; Harold avisa al cliente' : 'Propuesta retirada'); vRuta(); } catch (e) { aviso(errorDe(e), true); } });
  $$('[data-sube],[data-baja]').forEach(b => b.onclick = () => { const ids = ruta.map(p => p.id); const i = Number(b.dataset.sube ?? b.dataset.baja); const j = b.dataset.sube != null ? i - 1 : i + 1; if (j < 0 || j >= ids.length) return;[ids[i], ids[j]] = [ids[j], ids[i]]; cache.ordenRuta = ids; vRuta(); });
  $$('[data-entregar]').forEach(b => b.onclick = () => formEntregar(cache.pedidos.find(p => p.id === Number(b.dataset.entregar)), () => vRuta()));
  const be = $('#b-etiq'); if (be) be.onclick = () => imprimirEtiquetas(ruta);
}
function imprimirEtiquetas(lista) {
  const w = window.open('', '_blank');
  w.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Etiquetas</title><style>body{font-family:system-ui,sans-serif;margin:0}.etiqueta{page-break-after:always;border:4px solid #000;margin:10mm;padding:14mm;height:calc(100vh - 28mm);box-sizing:border-box;display:flex;flex-direction:column;justify-content:center;gap:14mm}.fragil{font-size:80px;font-weight:900;text-align:center;letter-spacing:6px}.dato{font-size:30px}.dato small{display:block;font-size:16px;color:#555}.marca{font-size:22px;font-weight:700;color:#0081A6;letter-spacing:2px;text-align:center}</style></head><body>${lista.map(p => `<div class="etiqueta"><div class="marca">SANTINO DESIGN</div><div class="fragil">FRÁGIL</div><div class="dato"><small>Para</small>${esc(p.cliente)}</div><div class="dato"><small>Dirección</small>${esc(p.direccion || '')}, ${esc(p.comuna || '')}</div><div class="dato"><small>Teléfono</small>${esc(p.cliente_telefono || '')}</div><div class="dato"><small>Pedido</small>${esc(p.numero)} · ${esc(p.resumen || '')}</div></div>`).join('')}<script>window.onload=()=>window.print()<\/script></body></html>`);
  w.document.close();
}

iniciar();

/* ---------- Guía de despacho (tanda 3, 12-oct-2026; reemplaza la skill guia-despacho-sd) ---------- */
const EMISOR = { empresa: 'Santino Design SpA', rut: '77.551.022-6', direccion: 'Lo Blanco 1919, La Pintana, R.M.', telefono: '9 5531 6124', email: 'hola@santinodesign.cl' };
const cap = t => t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
const tonoTxt = t => !t ? '' : String(t).toUpperCase() === 'SIN BARNIZ' ? 'sin barniz' : 'tono ' + t;
/* Bultos (Harold 12-oct): 1 base + 1 cubierta = 2 por mesa; Montecarlo y Fiorella 3 (2 bases + 1 cubierta); sillas de a dos;
   Tulip siempre 2 bultos hasta 10 sillas; más de 10, o banca, o modelo sin regla: se confirma a mano (hay que embalar primero). */
function bultosDe(p) {
  const pz = p.piezas || []; let n = 0; const det = []; let seguro = true;
  const principal = pz.find(x => ['Mesa', 'Cubierta', 'Mueble', 'Repuesto'].includes(x.tipo)) || pz.find(x => x.tipo === 'Base');
  if (principal) {
    const cod = principal.modelo_base || principal.modelo_cubierta; const def = (cache.modelosBultos || {})[cod]; const c = principal.cantidad || 1;
    if (def) { n += def * c; det.push(`${c > 1 ? c + ' x ' : ''}${NOMBRE_MODELO[cod] || cod}: ${def * c}`); }
    else { seguro = false; det.push(`${NOMBRE_MODELO[cod] || cod || principal.tipo}: sin regla de bultos, confirmar`); }
  }
  pz.filter(x => x.tipo === 'Silla').forEach(x => {
    const c = x.cantidad || 0; const t = (x.tipo_silla || '').toUpperCase();
    if (t === 'TULIP') { if (c <= 10) { n += 2; det.push(`${c} Tulip: 2`); } else { seguro = false; det.push(`${c} Tulip: más de 10, confirmar`); } }
    else { const b = Math.ceil(c / 2); n += b; det.push(`${c} sillas ${x.tipo_silla || ''}: ${b}`); }
  });
  pz.filter(x => x.tipo === 'Banca').forEach(x => { const c = x.cantidad || 1; n += c; seguro = false; det.push(`${c} banca: ${c} (confirmar)`); });
  return { n, det, seguro };
}
function descProducto(x) {
  if (['Mueble', 'Repuesto', 'Servicio'].includes(x.tipo)) return x.descripcion || x.tipo;
  const cod = x.modelo_cubierta || x.modelo_base; const mat = x.material_cubierta || x.material_base;
  const medida = x.largo_cm ? `${num(x.largo_cm)}x${num(x.ancho_cm)}${x.alto_cm ? 'x' + num(x.alto_cm) : ''} cm` : '';
  const partes = [`${x.tipo === 'Mesa' || x.tipo === 'Cubierta' ? 'Mesa ' : ''}${NOMBRE_MODELO[cod] || cod || ''} ${cap(NOMBRE_MATERIAL[mat] || (mat || '').toLowerCase())}`.trim()];
  const tras = [medida, x.personas ? `[${x.personas} personas]` : ''].filter(Boolean).join(' ');
  if (tras) partes.push(tras);
  let d = partes.join(' · ');
  if (x.color) d += ' / ' + cap(NOMBRE_COLOR[x.color] || x.color) + (x.tono && !ES_VIDRIO(mat) ? ' ' + tonoTxt(x.tono) : '');
  return d;
}
function productosGuia(p) {
  const pz = p.piezas || []; const lineas = [];
  pz.filter(x => !['Silla', 'Banca', 'Servicio'].includes(x.tipo)).forEach((x, i) => lineas.push({ desc: descProducto(x), valor: i === 0 ? pesos(p.precio_venta) : '' }));
  pz.filter(x => ['Silla', 'Banca'].includes(x.tipo)).forEach(x => lineas.push({ desc: `${x.cantidad || 1} ${x.tipo === 'Banca' ? 'banca' : 'sillas'} ${x.tipo_silla || ''} ${x.color_silla ? '/ ' + cap(NOMBRE_COLOR[x.color_silla] || x.color_silla) : ''}`.replace(/\s+/g, ' ').trim(), valor: 'incluidas' }));
  if (!lineas.length) lineas.push({ desc: p.resumen || 'Pedido ' + p.numero, valor: pesos(p.precio_venta) });
  if (p.precio_despacho > 0) lineas.push({ desc: 'Despacho', valor: pesos(p.precio_despacho) });
  if (p.precio_instalacion > 0) lineas.push({ desc: 'Instalación', valor: pesos(p.precio_instalacion) });
  return lineas;
}
async function formGuia(p) {
  await cargarModelos();
  const b = bultosDe(p); const prods = productosGuia(p);
  const modalidad = p.tipo_entrega === 'Despacho regiones' ? 'Encomienda región' : p.tipo_entrega === 'Retiro en taller' ? 'Retiro en taller' : 'Despacho RM';
  const estadoPago = p.saldo <= 0 ? 'PAGADO' : 'PENDIENTE ' + pesos(p.saldo);
  const { data: sig } = await sb.from('guia_despacho').select('numero').order('numero', { ascending: false }).limit(1);
  const { data: com } = p.comuna ? await sb.from('comuna').select('region').eq('nombre', p.comuna).maybeSingle() : { data: null };
  const region = (com && com.region) || (p.tipo_entrega === 'Despacho regiones' ? '' : 'Región Metropolitana');
  const proximo = (sig && sig[0] ? sig[0].numero : 3079) + 1;
  const campo = (n, l, v, extra = '') => `<label class="campo">${l} <input name="${n}" value="${esc(v || '')}" ${extra}></label>`;
  modal(`<h2>Guía de despacho N° ${proximo} · ${esc(p.numero)} ${esc(p.cliente)}</h2>
    <div style="font-size:12px;color:var(--gris-2)">El número lo asigna la base al emitir (correlativo único). Revisa destinatario y bultos antes de emitir.</div>
    <form id="f-guia">
      <div class="campos">${campo('nombre', 'Destinatario', p.cliente, 'required')}${campo('telefono', 'Teléfono', p.cliente_telefono, 'required')}${campo('direccion', 'Dirección', p.direccion, 'required')}${campo('comuna', 'Comuna', p.comuna, 'required')}${campo('region', 'Región', region, 'required')}${campo('email', 'Email', p.cliente_email)}</div>
      <div class="campos">
        <label class="campo">Modalidad <select name="modalidad">${['Encomienda región', 'Despacho RM', 'Retiro en taller'].map(m => `<option ${m === modalidad ? 'selected' : ''}>${m}</option>`).join('')}</select></label>
        <label class="campo">Bultos <input name="bultos" type="number" min="1" value="${b.n || ''}" required style="${b.seguro ? '' : 'border-color:var(--rojo)'}"></label>
        <label class="campo">Estado de pago <input name="estado_pago" value="${esc(estadoPago)}"></label>
      </div>
      <div style="font-size:12px;color:${b.seguro ? 'var(--gris-2)' : 'var(--rojo-txt)'}">${b.seguro ? 'Bultos calculados: ' : 'CONFIRMAR BULTOS (hay una parte sin regla): '}${esc(b.det.join(' · ') || 'sin piezas con regla')}</div>
      <div class="campo"><span>Productos (edita el texto si hace falta)</span>${prods.map((l, i) => `<div style="display:flex;gap:6px"><input name="desc${i}" value="${esc(l.desc)}" style="flex:1"><input name="valor${i}" value="${esc(l.valor)}" style="width:110px"></div>`).join('')}</div>
      <label class="campo">Total <input name="total" value="${esc(pesos(p.total))}" readonly></label>
      <div class="acciones"><button type="button" class="btn" id="g-cancelar">Cancelar</button><button class="btn primario">Emitir guía</button></div>
    </form>`);
  $('#g-cancelar').onclick = cerrarModal;
  $('#f-guia').onsubmit = async ev => {
    ev.preventDefault(); const f = new FormData(ev.target);
    const productos = prods.map((_, i) => ({ desc: f.get('desc' + i), valor: f.get('valor' + i) })).filter(l => l.desc);
    const destinatario = Object.fromEntries(['nombre', 'telefono', 'direccion', 'comuna', 'region', 'email'].map(k => [k, f.get(k) || '']));
    try {
      const g = await rpc('emitir_guia', { p_pedido_id: p.id, p_bultos: Number(f.get('bultos')), p_modalidad: f.get('modalidad'), p_estado_pago: f.get('estado_pago'), p_destinatario: destinatario, p_productos: productos, p_total: p.total });
      cerrarModal(); aviso(`Guía N° ${g.numero} emitida`); location.hash = '#/guia/' + g.id;
    } catch (e) { aviso(errorDe(e), true); }
  };
}
async function vGuia(id) {
  const { data: g, error } = await sb.from('guia_despacho').select('*, pedido:pedido_id(numero)').eq('id', id).maybeSingle(); if (error) throw error;
  if (!g) { app.innerHTML = barra('#/lista') + '<div class="contenido"><div class="seccion">Guía no encontrada</div></div>'; return; }
  if (!$('#pagina-guia')) { const st = document.createElement('style'); st.id = 'pagina-guia'; st.textContent = '@page { size: Letter portrait; margin: 12mm 16mm 12mm 16mm; }'; document.head.appendChild(st); }
  const d = g.destinatario || {}; const prods = g.productos || [];
  const archivo = `GD_${g.numero}_${(d.nombre || '').trim().replace(/\s+/g, '_')}.pdf`;
  const fila = (k, v) => `<div class="party-row"><span class="pf">${k}</span>${esc(v || '—')}</div>`;
  app.innerHTML = barra('#/lista') + `<div class="sub no-imprimir"><a class="btn" href="#/pedido/${g.pedido_id}">‹ Volver a la ficha ${esc(g.pedido ? g.pedido.numero : '')}</a><button class="btn primario" id="b-print">Imprimir o guardar PDF</button><span style="color:var(--gris-3)">Nombre sugerido del archivo: ${esc(archivo)} · carpeta 05_Guias_de_despacho/${new Date(g.fecha + 'T12:00:00').getFullYear()}/</span></div>
  <div class="guia">
    <div class="header"><img class="logo" src="logo-guia.png" alt="Santino Design"><div class="header-right"><span class="doc-type">Guía de Despacho</span><span class="doc-number">N° ${g.numero}</span><span class="doc-fecha">Fecha: ${new Date(g.fecha + 'T12:00:00').toLocaleDateString('es-CL')}</span></div></div>
    <div class="parties">
      <div><div class="party-label">Emisor</div>${fila('Empresa', EMISOR.empresa)}${fila('RUT', EMISOR.rut)}${fila('Dirección', EMISOR.direccion)}${fila('Teléfono', EMISOR.telefono)}${fila('Email', EMISOR.email)}</div>
      <div><div class="party-label">Destinatario</div>${fila('Nombre', d.nombre)}${fila('Teléfono', d.telefono)}${fila('Dirección', d.direccion)}${fila('Comuna', d.comuna)}${fila('Región', d.region)}${fila('Email', d.email)}</div>
    </div>
    <div class="envio-box"><div><div class="envio-label">Modalidad</div><div class="envio-val">${esc(g.modalidad)}</div></div><div><div class="envio-label">Bultos</div><div class="envio-val">${g.bultos}</div></div><div><div class="envio-label">Estado pago</div><div class="envio-val">${esc(g.estado_pago)}</div></div></div>
    <div class="prod-label">Productos</div>
    <table><thead><tr><th style="width:40px">N°</th><th>Descripción</th><th style="width:110px">Valor</th></tr></thead><tbody>
      ${prods.map((l, i) => `<tr class="dr"><td>${i + 1}</td><td>${esc(l.desc)}</td><td>${esc(l.valor)}</td></tr>`).join('')}
      ${Array.from({ length: Math.max(0, 10 - prods.length) }, (_, i) => `<tr class="er"><td>${prods.length + i + 1}</td><td></td><td></td></tr>`).join('')}
      <tr class="total-row"><td colspan="2">Total</td><td>${pesos(g.total)}</td></tr>
    </tbody></table>
    <div class="firma"><div class="firma-line"></div><br><div class="firma-label">Firma receptor</div></div>
  </div>`;
  $('#b-print').onclick = () => { document.title = archivo.replace('.pdf', ''); window.print(); setTimeout(() => { document.title = 'Santino Pedidos'; }, 2000); };
}

/* Mover la tabla hacia el costado (Harold 12-oct): arrastrar con el mouse sobre la tabla (si se mueve más de 6 px no cuenta como clic),
   flechas ← → del teclado, y la barra de desplazamiento siempre visible (styles.css). */
function activarArrastreHorizontal(env) {
  if (!env) return;
  let x0 = null, s0 = 0, movido = false;
  env.addEventListener('mousedown', ev => { if (ev.button !== 0 || ev.target.closest('input,select,button,a')) return; x0 = ev.clientX; s0 = env.scrollLeft; movido = false; });
  env.addEventListener('mousemove', ev => { if (x0 == null) return; const dx = ev.clientX - x0; if (Math.abs(dx) > 6) { movido = true; env.scrollLeft = s0 - dx; env.classList.add('arrastrando'); } });
  const soltar = () => { x0 = null; setTimeout(() => env.classList.remove('arrastrando'), 0); };
  env.addEventListener('mouseup', soltar); env.addEventListener('mouseleave', soltar);
  env.addEventListener('click', ev => { if (movido) { ev.stopPropagation(); ev.preventDefault(); movido = false; } }, true);
  if (!window._flechasTabla) { window._flechasTabla = true; document.addEventListener('keydown', ev => { const t = $('#tabla'); if (!t || ev.target.closest('input,select,textarea') || !['ArrowLeft', 'ArrowRight'].includes(ev.key)) return; t.scrollLeft += ev.key === 'ArrowRight' ? 160 : -160; ev.preventDefault(); }); }
}
