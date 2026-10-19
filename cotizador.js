/* Santino Pedidos · Cotizador (tanda 36, 18-oct-2026). Primer módulo "ERP": la cotización formal nace en la app, toma su número
   del correlativo de la base, se emite en PDF con el formato oficial (logo, tabla azul, T&C, datos bancarios) y, cuando el cliente
   acepta, se convierte en pedido con un clic (cliente, líneas y abono). Harold: "incorporar el cotizador en la aplicación para ir
   migrando a nuestro ERP en vez de solo base de datos".
   El MOTOR de precios (motor_precios.js: costos, márgenes, mano de obra) NO está en este archivo ni en el repo público: se
   descarga del bucket privado "codigo" solo con sesión de admin (scripts/sincronizar_motor.js lo sube desde OneDrive).
   Este archivo se carga antes de app.js y usa sus utilidades (sb, $, esc, aviso, modal, rpc, pesos…) en tiempo de ejecución. */
'use strict';

const COT = { motor: null, motorVersion: null, params: {}, lista: [], todas: false, buscar: '', actual: null, st: null, ultimoMotor: null };
const CTAS_COT = {
  empresa: { titular: 'Santino Design SpA', rut: '77.551.022-6', banco: 'Banco Santander', tipo: 'Cuenta Corriente', num: '87727157', email: 'hola@santinodesign.cl' },
  harold: { titular: 'Harold Matías Ahumada Yáñez', rut: '18.976.134-1', banco: 'Bci / Banco Crédito e Inversiones', tipo: 'Cuenta Corriente', num: '777918976134', email: 'hola@santinodesign.cl' }
};
const TYC_COT = {
  pago: 'Para comenzar el proyecto al cliente se le solicitará el pago luego de aceptada esta cotización.',
  plazo: 'El plazo de entrega será coordinado con el asesor al confirmar el pedido y puede variar según tipo de producto y carga del taller.',
  mods: 'Modificaciones al pedido solo serán aceptadas dentro de las 48 horas siguientes a la confirmación del pago. Cambios posteriores pueden implicar ajustes de precio y plazo.',
  envios: 'Los envíos a regiones se gestionan como encomienda por operador externo y son de cargo del cliente.',
  garantia: g => `Garantía de ${g} meses contra defectos de fabricación bajo uso normal. No incluye daños por mal uso, humedad excesiva o condiciones inadecuadas de instalación.`
};
/* clave del motor -> código de la tabla modelo (misma tabla que scripts/verificar_modelos_motor.mjs) */
const MODELO_CODIGO_COT = { venecia: 'VEN', roma: 'ROM', mykonos: 'MYKHONOS', exterior: 'MESA EXT', monaco: 'MON', gonqui: 'GONQUI', nothofagus: 'NOTHOFAGUS', praga: 'PRAGA', santorini: 'SANTORINI', montecarlo: 'MONTE.C', fiorella: 'FIO', mesax: 'X', origen: 'ORIGEN', tdf: 'TIERRA DEL FUEGO', tivoli: 'TIVOLI', mesacentro: 'MESA.C', nexo: 'NEXO', remanso: 'REMANSO', trama: 'TRAMA', sobremesa: 'SOBREMESA', amora: 'AMORA', lena: 'LENA' };
const CANALES_COT = [['0', 'Transferencia 0%'], ['0.0127', 'Webpay crédito 1,27%'], ['0.0222', 'GetNet crédito 2,22%'], ['0.0449', 'MercadoPago 4,49% (peor caso)']];
const ZONAS_COT = [['t1', 'Despacho Stgo T1'], ['t2', 'Despacho comunas T2'], ['region', 'Región (por pagar)'], ['retiro', 'Retiro en taller'], ['custom', 'Despacho personalizado']];
const ESTADOS_COT = ['Borrador', 'Emitida', 'Enviada', 'Aceptada', 'Rechazada', 'Vencida', 'Convertida'];
const cotChip = e => `<span class="chip cot-${e}">${esc(e)}</span>`;
const fmtCot = n => '$ ' + Math.round(n || 0).toLocaleString('es-CL');
const fechaLarga = s => { if (!s) return ''; const d = new Date(s.length > 10 ? s : s + 'T12:00:00'); return `${d.getDate()} de ${MESES_L[d.getMonth()]} de ${d.getFullYear()}`; };
const sumarDias = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + Number(n || 0)); return d.toISOString().slice(0, 10); };

/* ---------- motor de precios (privado) ---------- */
async function cargarMotor() {
  if (COT.motor) return COT.motor;
  const [bajada, params, cfg, precios] = await Promise.all([sb.storage.from('codigo').download('motor_precios.js'), rpc('parametros_motor_json', {}), sb.from('config_app').select('valor').eq('clave', 'motor').maybeSingle(), rpc('precios_catalogo_json', { p_detalle: false })]);
  if (bajada.error) throw new Error('No se pudo cargar el motor de precios: ' + errorDe(bajada.error) + '. Hay que correr scripts/sincronizar_motor.js (o tu usuario no es admin).');
  const src = await bajada.data.text();
  // D2: los precios publicados (lista y oferta por variante) vienen de la tabla precio_catalogo, no del motor.
  COT.precios = precios || {};
  const m = new Function('PRECIOS_CATALOGO', src + '\nreturn {VARS, VARS_DEFAULT, VLAB, MODELOS, SILLA_PRICE, SILLA_LABEL, SILLA_RETAIL, DESPACHO, nPers, instalacion, cotizar, vkReferencia, refEstandar};')(COT.precios);
  COT.params = params || {}; COT.motor = m; aplicarParametrosMotor();
  COT.motorVersion = cfg.data && cfg.data.valor ? cfg.data.valor.version : null;
  return m;
}
function aplicarParametrosMotor() {
  const m = COT.motor; if (!m) return;
  for (const k of Object.keys(m.VARS)) delete m.VARS[k];
  Object.assign(m.VARS, m.VARS_DEFAULT);
  for (const [k, v] of Object.entries(COT.params || {})) if (k in m.VARS_DEFAULT && v && v.valor != null) m.VARS[k] = Number(v.valor);
}
function stMotorInicial(model) {
  const m = COT.motor, md = m.MODELOS[model]; const opts = {};
  for (const ax of Object.keys(md.axes || {})) opts[ax] = md.axes[ax][0][0];
  const fmts = md.noTable ? ['1'] : (md.formatos(opts) || []);
  const st = { model, opts, vk: md.noTable ? '6' : fmts[0], largo: '', ancho: '', custom: false, sillas: false, tipoSilla: 'tulip', nSillas: 6, canal: '0.0449', zona: 't1', instalar: true, instCustom: false, instVal: '', cyber: false, despLabel: '', despVal: '' };
  if (!md.noTable) { const d = md.dims(opts, st.vk); st.largo = d.largo; st.ancho = d.ancho; }
  return st;
}
function resultadoMotor() {
  const m = COT.motor, st = COT.st, md = m.MODELOS[st.model];
  const inp = { model: st.model, opts: { ...st.opts }, vk: st.vk, sillas: st.sillas && !!md.sillas, tipoSilla: st.tipoSilla, nSillas: st.sillas ? Number(st.nSillas) || 0 : 0, canal: Number(st.canal), zona: st.zona === 'custom' || st.zona === 'region' ? 'retiro' : st.zona, instalar: st.instalar && !md.noTable };
  if (st.custom && !md.noTable) { inp.largo = Number(st.largo); inp.ancho = Number(st.ancho); }
  const r = m.cotizar(inp);
  r.instalacion = st.instalar && !md.noTable ? (st.instCustom ? Number(st.instVal) || 0 : r.instalacion) : 0;
  r.precioFinal = st.cyber && r.cyber ? r.cyber : r.lista;
  r.dctoPct = st.cyber && r.cyber ? Math.round((r.lista - r.cyber) / r.lista * 100) : 0;
  return r;
}
/* Texto de la línea igual al que Harold conoce del cotizador HTML: "Venecia 6P, 160×90×76 cm · Rectangular · Pino 3.2cm, 6 sillas Tulip" */
function descripcionMotor(r) {
  const m = COT.motor, md = m.MODELOS[r.model], AX = md.axes || {}, o = r.opts || {};
  const axLbl = (ax, v) => { const x = (AX[ax] || []).find(a => a[0] === v); return x ? String(x[1]).replace('★', '').trim() : v; };
  const madLbl = { pino32: 'Pino 3.2cm', lenga34: 'Lenga 3.4cm', lenga: 'Lenga 3.4cm', pino: 'Pino 3.2cm', roble: 'Roble 3.4cm', roble34: 'Roble 3.4cm', nf_lenga34: 'NF Lenga 3.4cm' };
  if (md.noTable) return `${r.nSillas || Number(r.vk) || 1} sillas ${m.SILLA_LABEL[o.tipo || 'tulip']}`;
  const forma = !AX.forma ? '' : o.forma === 'cuad' ? 'Cuadrada' : o.forma === 'rect' ? 'Rectangular' : o.forma === 'circ' ? 'Circular' : '';
  const vidrio = AX.glass && o.glass ? ' · Vidrio templado ' + ({ v12: '12 mm', v15: '15 mm', v19: '19 mm' }[o.glass] || o.glass) : '';
  const extra = ['version', 'acabado'].filter(ax => AX[ax] && o[ax]).map(ax => ' · ' + axLbl(ax, o[ax])).join('');
  const sillas = r.sillas && r.nSillas ? `, ${r.nSillas} sillas ${m.SILLA_LABEL[r.tipoSilla]}` : '';
  const vkShow = r.modified ? r.vkRef : r.vk;
  return `${md.label} ${vkShow}${r.largo ? `, ${r.largo}×${r.ancho}×76 cm` : ''}${forma ? ' · ' + forma : ''}${AX.madera && o.madera ? ' · ' + (madLbl[o.madera] || axLbl('madera', o.madera)) : ''}${vidrio}${extra}${sillas}`;
}
/* Atributos de la pieza para el pedido (misma convención de códigos de la Lista: materiales y colores en código). */
function piezaMotor(r) {
  const m = COT.motor, md = m.MODELOS[r.model], o = r.opts || {}, AX = md.axes || {};
  if (md.noTable) return { tipo_linea: 'Silla', tipo_silla: (m.SILLA_LABEL[o.tipo || 'tulip'] || '').toUpperCase(), area_taller: 'Vidrio/compras' };
  const mad = o.madera || '';
  const material = AX.glass ? 'V.T' : /robleam|roblehualle/.test(mad) ? 'ROBLE AM.' : /roble/.test(mad) ? 'ROBLE' : /lenga/.test(mad) ? 'LENGA' : /pino/.test(mad) ? 'PINO' : /rauli/.test(mad) ? 'RAULÍ' : null;
  const espesor = /34|3\.4/.test(mad) || mad === 'lenga' || mad === 'roble' ? 34 : /32|3\.2/.test(mad) || mad === 'pino' ? 32 : /40|4$/.test(mad) ? 40 : /^v(\d+)/.test(o.glass || '') ? Number(o.glass.slice(1)) : null;
  const forma = o.forma === 'cuad' ? 'CUA' : /praga|roma|amora/.test(r.model) ? 'CIRC' : /trama/.test(r.model) ? 'OVAL' : 'RECT';
  return { tipo_linea: 'Mesa', modelo_cubierta: MODELO_CODIGO_COT[r.model] || md.label.toUpperCase(), modelo_base: MODELO_CODIGO_COT[r.model] || md.label.toUpperCase(), material_cubierta: material, espesor_mm: espesor,
    largo_cm: r.largo, ancho_cm: r.ancho, alto_cm: 76, forma, personas: m.nPers(r.vkRef || r.vk, r.model), color_estructura: o.acabado === 'negro' ? 'NGR' : null,
    tipo_silla: r.sillas && r.nSillas ? (m.SILLA_LABEL[r.tipoSilla] || '').toUpperCase() : null, a_medida: !!r.modified };
}
/* Líneas que agrega el motor a la cotización: producto (+ despacho + instalación según la zona), con el mismo wording del cotizador HTML. */
function lineasDesdeMotor(r) {
  const st = COT.st, m = COT.motor; const out = [];
  const motor = { model: r.model, label: r.label, vk: r.vk, vkRef: r.vkRef, opts: r.opts, largo: r.largo, ancho: r.ancho, modified: r.modified, publicado: r.publicado, sillas: r.sillas, nSillas: r.nSillas, tipoSilla: r.tipoSilla, lista: r.lista, cyber: r.cyber, costLista: Math.round(r.costLista), margenLista: r.margenLista, margenCyber: r.margenCyber, canal: Number(st.canal), zona: st.zona, cyberAplicado: !!(st.cyber && r.cyber), version: COT.motorVersion };
  const costoProd = Math.round(r.costLista);
  out.push({ rol: 'producto', descripcion: descripcionMotor(r), sub: '', precio: r.precioFinal, cantidad: 1, iva_incluido: true, precio_normal: r.dctoPct > 0 ? r.lista : null, costo_estimado: costoProd,
    margen: r.precioFinal ? +((r.precioFinal / 1.19 - r.precioFinal * Number(st.canal) - costoProd) / (r.precioFinal / 1.19 - r.precioFinal * Number(st.canal))).toFixed(4) : null, motor, pieza: piezaMotor(r) });
  if (st.zona === 'custom') { const v = Number(st.despVal) || 0; out.push({ rol: 'despacho', descripcion: 'Despacho ' + (st.despLabel || 'personalizado'), precio: v, cantidad: 1, iva_incluido: true }); }
  else if (st.zona === 'region') out.push({ rol: 'info', descripcion: 'Envío a región por pagar al recibir, valor aproximado $', precio: 0, cantidad: 1, iva_incluido: true });
  else if (st.zona !== 'retiro') { const v = m.DESPACHO[st.zona] || 0; if (v > 0) out.push({ rol: 'despacho', descripcion: 'Despacho ' + (st.zona === 't1' ? 'Stgo T1' : 'comunas T2'), precio: v, cantidad: 1, iva_incluido: true }); }
  if (r.instalacion > 0) out.push({ rol: 'instalacion', descripcion: st.instCustom ? 'Instalación (especial)' : 'Instalación Stgo', precio: r.instalacion, cantidad: 1, iva_incluido: true });
  return out;
}

/* ---------- totales en pantalla (misma regla que privado.cotizacion_recalcular) ---------- */
function totalesCot(c) {
  const emp = c.tipo_cliente === 'empresa'; let neto = 0, total = 0, ahorro = 0, costo = 0;
  for (const l of c.lineas || []) {
    if (l.rol === 'separador') continue; const p = Number(l.precio) || 0, n = Number(l.cantidad) || 1, pn = Number(l.precio_normal) || 0, ivai = l.iva_incluido !== false;
    if (emp) { neto += ivai ? Math.round(p * n / 1.19) : p * n; if (pn > 0) ahorro += ((ivai ? pn : Math.round(pn * 1.19)) - (ivai ? p : Math.round(p * 1.19))) * n; }
    else { total += p * n; if (pn > 0) ahorro += (pn - p) * n; }
    costo += Number(l.costo_estimado) || 0;
  }
  if (emp) { const iva = Math.round(neto * 0.19); return { neto, iva, total: neto + iva, ahorro: Math.max(ahorro, 0), costo, margen: costo && neto ? (neto - costo) / neto : null }; }
  const neto2 = Math.round(total / 1.19); return { neto: neto2, iva: total - neto2, total, ahorro: Math.max(ahorro, 0), costo, margen: costo && neto2 ? (neto2 - costo) / neto2 : null };
}

/* ---------- lista ---------- */
async function vCotizaciones() {
  if (yo.rol !== 'admin') { location.hash = '#/lista'; return; }
  COT.lista = (await rpc('cotizaciones_json', { p_todas: COT.todas, p_buscar: COT.buscar || null })) || [];
  const proximo = await rpc('proximo_numero_cotizacion', {});
  const fila = c => `<tr data-id="${c.id}" class="fila-cot ${c.vencida ? 'atrasado' : ''}" title="Abrir">
    <td class="num"><b>${esc(c.codigo)}</b></td><td>${cotChip(c.estado)}${c.vencida ? ' <span class="chip atrasado">VENCIDA</span>' : ''}</td><td class="nw">${fecha(c.fecha)}</td>
    <td>${esc(c.cliente_nombre)}${c.proyecto ? `<div class="l2">${esc(c.proyecto)}</div>` : ''}<div class="l2">${c.tipo_cliente === 'empresa' ? 'Empresa (con IVA desglosado)' : 'Persona'}</div></td>
    <td>${esc(c.resumen || '')}</td><td class="num nw">${pesos(c.total)}</td><td class="nw ${c.margen != null && c.margen < 0.15 ? 'rojo' : ''}">${c.margen != null ? Math.round(c.margen * 100) + '%' : '<span class="gris">-</span>'}</td>
    <td class="nw">${c.pedido_id ? `<a href="#/pedido/${c.pedido_id}">${esc(c.pedido_numero)}</a>` : ''}</td><td class="nw">${c.vencida ? '<span class="rojo">' : ''}${fecha(c.valida_hasta)}${c.vencida ? '</span>' : ''}</td></tr>`;
  app.innerHTML = barra('#/cotizador') + `<div class="contenido"><div class="seccion">
    <div class="cab"><h2>Cotizaciones</h2><div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
      <input id="cot-buscar" placeholder="cliente, número o proyecto" value="${esc(COT.buscar)}" style="min-width:220px">
      <label style="display:flex;align-items:center;gap:6px;font-size:13px"><input type="checkbox" id="cot-todas" ${COT.todas ? 'checked' : ''}> ver convertidas, rechazadas y vencidas</label>
      <button class="btn chico" id="cot-params">Precios y parámetros</button>
      <button class="btn chico" id="cot-catalogo" title="Precio de lista y de oferta de cada variante de catálogo; de aquí salen el cotizador y Shopify">Precios de catálogo</button>
      <button class="btn chico" id="cot-correlativo" title="El próximo número que tomará una cotización al emitirse">Próximo N° ${esc(proximo)}</button>
      <a class="btn primario" href="#/cotizacion/nueva">+ Nueva cotización</a></div></div>
    ${COT.lista.length ? `<div style="overflow:auto"><table class="d-tabla cot-tabla"><thead><tr><th>N°</th><th>Estado</th><th>Fecha</th><th>Cliente</th><th>Qué</th><th>Total</th><th title="Margen estimado sobre el neto, según el motor">Margen</th><th>Pedido</th><th>Válida hasta</th></tr></thead><tbody>${COT.lista.map(fila).join('')}</tbody></table></div>`
      : `<p class="gris">${COT.buscar ? 'Nada con ese texto.' : 'Todavía no hay cotizaciones en la app. Crea la primera con + Nueva cotización: toma el número ' + esc(proximo) + ' al emitirse.'}</p>`}
    <p class="gris" style="font-size:12px;margin:0">Las cotizaciones anteriores (hasta la Cot 3374) siguen en OneDrive, carpeta 2.Cotización. Desde aquí el correlativo lo lleva la base.</p>
  </div></div>`;
  $$('.fila-cot').forEach(tr => tr.onclick = () => { location.hash = '#/cotizacion/' + tr.dataset.id; });
  $('#cot-buscar').onkeydown = ev => { if (ev.key === 'Enter') { COT.buscar = ev.target.value.trim(); vCotizaciones(); } };
  $('#cot-todas').onchange = ev => { COT.todas = ev.target.checked; vCotizaciones(); };
  $('#cot-params').onclick = () => modalParametrosMotor().catch(e => aviso(errorDe(e), true));
  $('#cot-catalogo').onclick = () => modalPreciosCatalogo().catch(e => aviso(errorDe(e), true));
  $('#cot-correlativo').onclick = () => formCorrelativo(proximo);
}
function formCorrelativo(actual) {
  const m = modal(`<h2>Correlativo de cotizaciones</h2><p class="gris" style="font-size:13px;margin:0">El próximo número es <b>${esc(actual)}</b>. Puedes saltarlo hacia adelante (como se hizo con la 3258 y la 3360); nunca hacia atrás.</p>
    <form id="f"><label class="campo">Próximo número <input name="n" type="number" min="${Number(actual)}" value="${esc(actual)}" required></label>
    <div class="acciones"><button type="button" class="btn" onclick="cerrarModal()">Cancelar</button><button class="btn primario">Fijar</button></div></form>`);
  $('#f', m).onsubmit = async ev => { ev.preventDefault(); try { await rpc('fijar_correlativo_cotizacion', { p_proximo: Number(new FormData(ev.target).get('n')) }); aviso('Correlativo fijado'); cerrarModal(); vCotizaciones(); } catch (e) { aviso(errorDe(e), true); } };
}

/* ---------- edición ---------- */
function cotNueva() {
  return { id: null, numero: null, estado: 'Borrador', fecha: hoyISO(), validez_dias: 7, tipo_cliente: 'persona', cliente_id: null, cliente_nombre: '', cliente_label: '', cliente_rut: '', cliente_telefono: '', cliente_email: '', cliente_direccion: '', proyecto: '',
    asesor: 'Harold Ahumada', cuenta: 'harold', garantia_meses: 12, forma_pago: '', plazo: '', tyc: null, nota: '', total_label: 'Total', mostrar_total_final: true, ahorro_label: '', canal: null, zona: null, lineas: [], pdf_path: null, pedido_id: null };
}
async function vCotizacion(idTxt) {
  if (yo.rol !== 'admin') { location.hash = '#/lista'; return; }
  app.innerHTML = barra('#/cotizador') + '<div class="contenido"><div class="cargando">Cargando el cotizador…</div></div>';
  await cargarMotor();
  if (idTxt === 'nueva') COT.actual = cotNueva();
  else { const c = await rpc('cotizacion_json', { p_id: Number(idTxt) }); if (!c) throw new Error('Cotización no encontrada'); COT.actual = c; COT.actual.lineas = c.lineas || []; }
  if (!COT.st) COT.st = stMotorInicial('venecia');
  pintarCotizacion();
}
const editable = c => c.estado === 'Borrador' || c.estado === 'Emitida';
function pintarCotizacion() {
  const c = COT.actual, ed = editable(c), t = totalesCot(c), emp = c.tipo_cliente === 'empresa';
  const titulo = c.numero ? `Cot ${c.numero}` : c.id ? 'Borrador (sin número)' : 'Nueva cotización';
  const acciones = [];
  if (ed) acciones.push('<button class="btn primario" id="c-guardar">Guardar</button>');
  if (ed && !c.numero) acciones.push('<button class="btn borde" id="c-emitir" title="Toma el siguiente número del correlativo y deja la cotización lista para enviar">Emitir (tomar número)</button>');
  acciones.push('<button class="btn" id="c-preview">Vista previa</button>');
  if (c.numero) acciones.push('<button class="btn borde" id="c-pdf">PDF</button>');
  if (c.numero && c.estado === 'Emitida') acciones.push('<button class="btn" id="c-enviada">Marcar enviada</button>');
  if (c.numero && ['Emitida', 'Enviada'].includes(c.estado)) acciones.push('<button class="btn" id="c-aceptada">Aceptada</button>', '<button class="btn" id="c-rechazada">Rechazada</button>');
  if (c.numero && ['Rechazada', 'Vencida', 'Aceptada'].includes(c.estado)) acciones.push('<button class="btn" id="c-reabrir">Volver a Enviada</button>');
  if (c.numero && ['Emitida', 'Enviada', 'Aceptada'].includes(c.estado)) acciones.push('<button class="btn primario" id="c-convertir">Convertir en pedido</button>');
  if (c.id) acciones.push('<button class="btn" id="c-duplicar" title="Copia con número nuevo (la enviada no se edita)">Duplicar</button>');
  if (c.id && c.estado === 'Borrador' && !c.numero) acciones.push('<button class="btn peligro" id="c-borrar">Borrar borrador</button>');
  if (c.pedido_id) acciones.push(`<a class="btn" href="#/pedido/${c.pedido_id}">Ver pedido ${esc(c.pedido_numero || '')}</a>`);
  const tyc = Array.isArray(c.tyc) ? c.tyc.join('\n') : '';
  const campo = (lbl, name, val, extra = '') => `<label class="campo">${lbl} <input name="${name}" value="${esc(val == null ? '' : val)}" ${ed ? '' : 'disabled'} ${extra}></label>`;
  app.innerHTML = barra('#/cotizador') + `<div class="contenido cot-grid">
  <div class="seccion cot-doc">
    <div class="cab"><h2>${esc(titulo)} ${cotChip(c.estado)}${c.vencida ? ' <span class="chip atrasado">VENCIDA</span>' : ''}</h2><a href="#/cotizador" class="btn chico">← Cotizaciones</a></div>
    ${!ed ? '<div class="gris" style="font-size:12px">Esta cotización ya se envió al cliente: no se edita. Si cambia algo, Duplicar crea una nueva con número nuevo (regla de la casa).</div>' : ''}
    <form id="f-cot" onsubmit="return false">
    <div class="campos">
      <label class="campo">Tipo de cliente <select name="tipo_cliente" ${ed ? '' : 'disabled'}><option value="persona" ${!emp ? 'selected' : ''}>Persona (solo Total)</option><option value="empresa" ${emp ? 'selected' : ''}>Empresa (neto + IVA 19%)</option></select></label>
      <label class="campo">Buscar cliente existente <input name="buscar_cliente" list="dl-cli-cot" placeholder="nombre, teléfono o RUT" ${ed ? '' : 'disabled'}><datalist id="dl-cli-cot"></datalist><input type="hidden" name="cliente_id" value="${esc(c.cliente_id || '')}"></label>
      ${campo(emp ? 'Razón social' : 'Nombre', 'cliente_nombre', c.cliente_nombre, 'required')}
      ${campo('Etiqueta (ej. Arquitecto; vacío = Nombre / Razón social)', 'cliente_label', c.cliente_label)}
      ${campo('RUT', 'cliente_rut', c.cliente_rut, 'placeholder="12.345.678-9"')}
      ${campo('Teléfono', 'cliente_telefono', c.cliente_telefono, 'placeholder="+56912345678"')}
      ${campo('E-mail (vacío = no sale)', 'cliente_email', c.cliente_email, 'type="email"')}
      ${campo('Dirección', 'cliente_direccion', c.cliente_direccion)}
      ${campo('Proyecto (fila extra, cotizaciones vía arquitecto)', 'proyecto', c.proyecto)}
    </div>
    <div class="campos">
      ${campo('Fecha', 'fecha', c.fecha, 'type="date"')}
      ${campo('Validez (días; 0 = solo hoy, para "compra ahora")', 'validez_dias', c.validez_dias, 'type="number" min="0"')}
      ${campo('Asesor', 'asesor', c.asesor)}
      <label class="campo">Cuenta bancaria en el PDF <select name="cuenta" ${ed ? '' : 'disabled'}><option value="harold" ${c.cuenta === 'harold' ? 'selected' : ''}>Harold · BCI (personas)</option><option value="empresa" ${c.cuenta === 'empresa' ? 'selected' : ''}>Santino Design · Santander (empresas)</option></select></label>
      ${campo('Garantía (meses; 0 = sin cláusula)', 'garantia_meses', c.garantia_meses, 'type="number" min="0"')}
      ${campo('Forma de pago (reemplaza el ítem 1 de T&C)', 'forma_pago', c.forma_pago, 'placeholder="60% anticipo / 30% terminado / 10% instalación"')}
      ${campo('Plazo (reemplaza el ítem 2 de T&C)', 'plazo', c.plazo, 'placeholder="3 semanas de fabricación aproximadas"')}
      ${campo('Nota bajo el total', 'nota', c.nota)}
      ${!emp ? campo('Etiqueta del total', 'total_label', c.total_label || 'Total', 'placeholder="Total"') : ''}
      ${campo('Etiqueta del ahorro', 'ahorro_label', c.ahorro_label, 'placeholder="Ahorro en esta cotización"')}
      <label class="campo" style="flex-direction:row;align-items:center;gap:8px"><input type="checkbox" name="mostrar_total_final" ${c.mostrar_total_final !== false ? 'checked' : ''} ${ed ? '' : 'disabled'}> Mostrar el Total (apagar si las líneas son opciones alternativas)</label>
    </div>
    <label class="campo">T&C completos (una línea por ítem; vacío = los 4 por defecto más la garantía; si escribes aquí, el último ítem debe ser la garantía) <textarea name="tyc" rows="3" ${ed ? '' : 'disabled'}>${esc(tyc)}</textarea></label>
    </form>
    <h2 style="font-size:14px;margin:6px 0 0">Líneas</h2>
    <div style="overflow:auto"><table class="d-tabla cot-lineas"><thead><tr><th>N</th><th>Tipo</th><th>Descripción (** negrita **) y detalle</th><th>Precio${emp ? ' <span class="gris" title="Para empresa: marca IVA incl. si el precio ya trae IVA">(IVA)</span>' : ''}</th><th>Ctd</th><th>Precio normal</th><th>Total</th><th></th></tr></thead>
      <tbody id="cot-tbody">${(c.lineas || []).map((l, i) => filaLineaHtml(l, i, ed, emp)).join('') || '<tr><td colspan="8" class="gris">Sin líneas. Agrega desde el motor (derecha) o con + línea.</td></tr>'}</tbody></table></div>
    ${ed ? `<div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn chico" id="l-mas">+ línea</button><button class="btn chico" id="l-sep">+ separador</button><button class="btn chico" id="l-inst">+ Instalación a domicilio ($0, gris)</button><button class="btn chico" id="l-envio">+ Envío por pagar</button></div>` : ''}
    <div class="cot-totales">${emp ? `<div><span>Sub total neto</span><span>${fmtCot(t.neto)}</span></div><div><span>IVA 19%</span><span>${fmtCot(t.iva)}</span></div>` : ''}<div class="total"><span>${esc(emp ? 'Total' : (c.total_label || 'Total'))}</span><span>${fmtCot(t.total)}</span></div>${t.ahorro > 0 ? `<div class="ahorro"><span>✓ ${esc(c.ahorro_label || 'Ahorro en esta cotización')}</span><span>− ${fmtCot(t.ahorro)}</span></div>` : ''}
      ${t.costo ? `<div class="interno" title="Solo lo ves tú: costo según el motor y margen sobre el neto"><span>Costo estimado · margen</span><span>${fmtCot(t.costo)} · <b class="${t.margen < 0.15 ? 'rojo' : ''}">${Math.round((t.margen || 0) * 100)}%</b></span></div>` : ''}</div>
    <div class="acciones" style="justify-content:flex-start;flex-wrap:wrap">${acciones.join('')}</div>
    ${c.pdf_path ? `<div class="gris" style="font-size:12px">PDF guardado: <a href="#" id="c-verpdf">${esc(c.pdf_nombre || c.pdf_path)}</a></div>` : ''}
  </div>
  <div class="seccion cot-motor"><div class="cab"><h2>Motor de precios</h2><span class="gris" style="font-size:11px">${esc(COT.motorVersion || '')}</span></div>${ed ? motorHtml() : '<p class="gris">La cotización no se edita.</p>'}</div>
  </div>`;
  activarCotizacion(ed);
  if (ed) activarMotor();
}
function filaLineaHtml(l, i, ed, emp) {
  const d = ed ? '' : 'disabled';
  if (l.rol === 'separador') return `<tr data-i="${i}" class="cot-sep"><td class="gris">${i + 1}</td><td colspan="6" class="gris">separador (fila vacía)</td><td>${ed ? `<button class="btn chico" data-del="${i}" title="Quitar">×</button>` : ''}</td></tr>`;
  const p = Number(l.precio) || 0, n = Number(l.cantidad) || 1, ivai = l.iva_incluido !== false;
  const tot = emp ? (ivai ? Math.round(p * n / 1.19) : p * n) : p * n;
  const gris = p === 0 ? 'color:var(--gris-2)' : '';
  return `<tr data-i="${i}" style="${gris}"><td>${i + 1}${l.motor ? ` <span class="gris" title="Calculada por el motor: ${esc(l.motor.label || '')} ${esc(l.motor.vkRef || '')}${l.motor.publicado ? ' (precio publicado)' : ''}">⚙</span>` : ''}</td>
    <td><select data-k="rol" data-i="${i}" ${d}>${['producto', 'despacho', 'instalacion', 'info'].map(r => `<option value="${r}" ${l.rol === r ? 'selected' : ''}>${{ producto: 'Producto', despacho: 'Despacho', instalacion: 'Instalación', info: 'Informativa' }[r]}</option>`).join('')}</select></td>
    <td><input data-k="descripcion" data-i="${i}" value="${esc(l.descripcion)}" ${d} style="width:100%;min-width:260px"><input data-k="sub" data-i="${i}" value="${esc(l.sub || '')}" placeholder="detalle en gris (opcional)" ${d} style="width:100%;min-width:260px;font-size:11px;margin-top:2px"></td>
    <td class="nw"><input data-k="precio" data-i="${i}" type="number" value="${p}" ${d} style="width:110px">${emp ? `<label style="display:block;font-size:11px"><input type="checkbox" data-k="iva_incluido" data-i="${i}" ${ivai ? 'checked' : ''} ${d}> IVA incl.</label>` : ''}</td>
    <td><input data-k="cantidad" data-i="${i}" type="number" min="1" value="${n}" ${d} style="width:56px"></td>
    <td><input data-k="precio_normal" data-i="${i}" type="number" value="${l.precio_normal || ''}" placeholder="sin dcto" ${d} style="width:110px" title="Precio de lista sin descuento: solo alimenta la línea Ahorro y la columna Dcto"></td>
    <td class="num nw">${p ? fmtCot(tot) : '<span class="gris">-</span>'}</td>
    <td class="nw">${ed ? `<button class="btn chico" data-up="${i}" title="Subir">↑</button><button class="btn chico" data-down="${i}" title="Bajar">↓</button><button class="btn chico" data-del="${i}" title="Quitar">×</button>` : ''}</td></tr>`;
}
function leerCabecera() {
  const f = new FormData($('#f-cot')), c = COT.actual, v = k => { const x = f.get(k); return x == null ? null : String(x).trim(); };
  ['tipo_cliente', 'cliente_nombre', 'cliente_label', 'cliente_rut', 'cliente_telefono', 'cliente_email', 'cliente_direccion', 'proyecto', 'fecha', 'asesor', 'cuenta', 'forma_pago', 'plazo', 'nota', 'ahorro_label'].forEach(k => { if (f.has(k)) c[k] = v(k); });
  if (f.has('total_label')) c.total_label = v('total_label') || 'Total';
  c.cliente_id = v('cliente_id') ? Number(v('cliente_id')) : null;
  c.validez_dias = Number(v('validez_dias') || 0); c.garantia_meses = Number(v('garantia_meses') || 0);
  c.mostrar_total_final = !!f.get('mostrar_total_final');
  const tyc = (v('tyc') || '').split('\n').map(s => s.trim()).filter(Boolean); c.tyc = tyc.length ? tyc : null;
  return c;
}
function datosCabecera(c) {
  const o = {}; ['tipo_cliente', 'cliente_id', 'cliente_nombre', 'cliente_label', 'cliente_rut', 'cliente_telefono', 'cliente_email', 'cliente_direccion', 'proyecto', 'fecha', 'validez_dias', 'asesor', 'cuenta', 'garantia_meses', 'forma_pago', 'plazo', 'tyc', 'nota', 'total_label', 'mostrar_total_final', 'ahorro_label', 'canal', 'zona'].forEach(k => o[k] = c[k] == null ? '' : c[k]);
  o.tyc = c.tyc || []; o.motor_version = COT.motorVersion || ''; return o;
}
function activarCotizacion(ed) {
  const c = COT.actual;
  const refrescar = () => { leerCabecera(); pintarCotizacion(); };
  if (ed) {
    $('[name=tipo_cliente]').onchange = ev => { leerCabecera(); c.cuenta = ev.target.value === 'empresa' ? 'empresa' : 'harold'; pintarCotizacion(); };
    const bc = $('[name=buscar_cliente]');
    bc.oninput = async () => { const t = bc.value.trim(); if (t.length < 2) return; const data = await rpc('buscar_clientes_cotizador', { p_texto: t }); const dl = $('#dl-cli-cot'); dl.innerHTML = (data || []).map(x => `<option value="${esc(x.nombre)} · ${esc(x.telefono || '')} · ${esc(x.comuna || '')}" data-id="${x.id}"></option>`).join(''); dl._datos = data || [];
      const op = [...dl.options].find(o => o.value === bc.value); if (op) { const x = (dl._datos || []).find(y => String(y.id) === op.dataset.id); if (x) { leerCabecera(); c.cliente_id = x.id; c.cliente_nombre = c.tipo_cliente === 'empresa' && x.empresa ? x.empresa : x.nombre; c.cliente_rut = x.rut || c.cliente_rut; c.cliente_telefono = x.telefono || c.cliente_telefono; c.cliente_email = x.email || c.cliente_email; c.cliente_direccion = x.direccion || c.cliente_direccion; if (x.tipo_cliente === 'Empresa') c.tipo_cliente = 'empresa'; const cond = aplicarCondicionesCliente(c, x.condiciones); pintarCotizacion(); aviso('Cliente cargado: ' + x.nombre + (cond ? ' · condiciones de convenio aplicadas (' + cond + ')' : '')); } } };
    bc.onchange = bc.oninput;
    $$('#cot-tbody [data-k]').forEach(el => el.onchange = () => { leerCabecera(); const l = c.lineas[Number(el.dataset.i)], k = el.dataset.k; l[k] = el.type === 'checkbox' ? el.checked : el.type === 'number' ? (el.value === '' ? null : Number(el.value)) : el.value; if (k === 'precio' || k === 'cantidad' || k === 'descripcion') { if (l.motor && k !== 'cantidad') l.motor.editado = true; } pintarCotizacion(); });
    $$('#cot-tbody [data-del]').forEach(b => b.onclick = () => { leerCabecera(); c.lineas.splice(Number(b.dataset.del), 1); pintarCotizacion(); });
    $$('#cot-tbody [data-up]').forEach(b => b.onclick = () => { const i = Number(b.dataset.up); if (!i) return; leerCabecera(); [c.lineas[i - 1], c.lineas[i]] = [c.lineas[i], c.lineas[i - 1]]; pintarCotizacion(); });
    $$('#cot-tbody [data-down]').forEach(b => b.onclick = () => { const i = Number(b.dataset.down); if (i >= c.lineas.length - 1) return; leerCabecera(); [c.lineas[i + 1], c.lineas[i]] = [c.lineas[i], c.lineas[i + 1]]; pintarCotizacion(); });
    $('#l-mas').onclick = () => { leerCabecera(); c.lineas.push({ rol: 'producto', descripcion: '', sub: '', precio: 0, cantidad: 1, iva_incluido: true }); pintarCotizacion(); setTimeout(() => { const ins = $$('#cot-tbody [data-k=descripcion]'); if (ins.length) ins[ins.length - 1].focus(); }, 0); };
    $('#l-sep').onclick = () => { leerCabecera(); c.lineas.push({ rol: 'separador', descripcion: '', precio: 0, cantidad: 1 }); pintarCotizacion(); };
    $('#l-inst').onclick = () => { leerCabecera(); c.lineas.push({ rol: 'info', descripcion: 'Instalación a domicilio', precio: 0, cantidad: 1, iva_incluido: true }); pintarCotizacion(); };
    $('#l-envio').onclick = () => { leerCabecera(); c.lineas.push({ rol: 'info', descripcion: 'Envío a región por pagar, valor aprox $', precio: 0, cantidad: 1, iva_incluido: true }); pintarCotizacion(); };
    $('#c-guardar').onclick = () => guardarCotizacion().catch(e => aviso(errorDe(e), true));
    const em = $('#c-emitir'); if (em) em.onclick = () => emitirCotizacion().catch(e => aviso(errorDe(e), true));
  }
  $('#c-preview').onclick = () => { if (ed) leerCabecera(); modal(`<div class="cot-preview">${htmlCotizacion(COT.actual, { paraPantalla: true })}</div><div class="acciones"><button class="btn" onclick="cerrarModal()">Cerrar</button></div>`, 'ancha'); };
  const pdf = $('#c-pdf'); if (pdf) pdf.onclick = async () => { try { if (ed) await guardarCotizacion(true); const r = await pdfCotizacion(COT.actual); aviso(r || 'PDF listo'); pintarCotizacion(); } catch (e) { aviso(errorDe(e), true); } };
  const estadoBtn = (id, estado) => { const b = $(id); if (b) b.onclick = async () => { try { COT.actual = await rpc('cambiar_estado_cotizacion', { p_id: c.id, p_estado: estado }); aviso('Cot ' + c.numero + ' ' + estado.toLowerCase()); pintarCotizacion(); } catch (e) { aviso(errorDe(e), true); } }; };
  estadoBtn('#c-enviada', 'Enviada'); estadoBtn('#c-aceptada', 'Aceptada'); estadoBtn('#c-rechazada', 'Rechazada'); estadoBtn('#c-reabrir', 'Enviada');
  const dup = $('#c-duplicar'); if (dup) dup.onclick = async () => { try { if (ed) await guardarCotizacion(true); const n = await rpc('duplicar_cotizacion', { p_id: c.id }); aviso('Copia creada (borrador)'); location.hash = '#/cotizacion/' + n.id; } catch (e) { aviso(errorDe(e), true); } };
  const bor = $('#c-borrar'); if (bor) bor.onclick = async () => { if (!confirm('¿Borrar este borrador? No tiene número, no queda rastro.')) return; try { await rpc('borrar_borrador_cotizacion', { p_id: c.id }); aviso('Borrador borrado'); location.hash = '#/cotizador'; } catch (e) { aviso(errorDe(e), true); } };
  const conv = $('#c-convertir'); if (conv) conv.onclick = () => formConvertir(c);
  const ver = $('#c-verpdf'); if (ver) ver.onclick = async ev => { ev.preventDefault(); const { data, error } = await sb.storage.from('documentos').createSignedUrl(c.pdf_path, 3600); if (error) return aviso(errorDe(error), true); window.open(data.signedUrl, '_blank'); };
}
/* D5 (18-oct-2026): condiciones del cliente frecuente (cliente.condiciones_cotizacion): cuenta, validez, garantía, asesor, etiqueta, T&C base.
   Devuelve un texto corto con lo aplicado, o null si el cliente no tiene condiciones. Harold puede corregir cualquier campo después. */
function aplicarCondicionesCliente(c, k) {
  if (!k || typeof k !== 'object') return null; const ap = [];
  if (k.tipo_cliente) { c.tipo_cliente = k.tipo_cliente; }
  if (k.cuenta) { c.cuenta = k.cuenta; ap.push('cuenta ' + k.cuenta); }
  if (k.validez_dias != null) { c.validez_dias = Number(k.validez_dias); ap.push('validez ' + k.validez_dias + ' días'); }
  if (k.garantia_meses != null) { c.garantia_meses = Number(k.garantia_meses); ap.push('garantía ' + k.garantia_meses + ' meses'); }
  if (k.asesor) c.asesor = k.asesor;
  if (k.label) { c.cliente_label = k.label; ap.push(k.label); }
  if (k.forma_pago) c.forma_pago = k.forma_pago; if (k.plazo) c.plazo = k.plazo;
  if (Array.isArray(k.tyc_base) && k.tyc_base.length) { c.tyc = k.tyc_base.slice(); if (Number(c.garantia_meses) > 0) c.tyc.push(TYC_COT.garantia(c.garantia_meses)); ap.push('T&C de convenio'); }
  return ap.join(', ') || 'sin cambios';
}
async function guardarCotizacion(silencio) {
  const c = leerCabecera();
  if (!c.cliente_nombre) throw new Error('Falta el nombre del cliente');
  if (JSON.stringify(c).includes('—')) throw new Error('Hay un guion largo en el texto: reemplázalo por coma o punto (regla de la casa)');
  const lineas = c.lineas.map(l => ({ rol: l.rol, descripcion: l.descripcion || '', sub: l.sub || '', precio: Number(l.precio) || 0, cantidad: Number(l.cantidad) || 1, iva_incluido: l.iva_incluido !== false, precio_normal: l.precio_normal || null, costo_estimado: l.costo_estimado || null, margen: l.margen || null, motor: l.motor || null, pieza: l.pieza || null }));
  const r = await rpc('guardar_cotizacion', { p_id: c.id, p_datos: datosCabecera(c), p_lineas: lineas });
  COT.actual = r; COT.actual.lineas = r.lineas || [];
  if (!silencio) { aviso('Cotización guardada'); if (location.hash !== '#/cotizacion/' + r.id) { location.hash = '#/cotizacion/' + r.id; return r; } pintarCotizacion(); }
  else if (location.hash !== '#/cotizacion/' + r.id) history.replaceState(null, '', '#/cotizacion/' + r.id);
  return r;
}
async function emitirCotizacion() {
  await guardarCotizacion(true);
  const c = COT.actual, prox = await rpc('proximo_numero_cotizacion', {});
  const m = modal(`<h2>Emitir cotización</h2><p style="margin:0;font-size:13px">Toma el número <b>${esc(prox)}</b> del correlativo y queda lista para el PDF. Si estás reemitiendo una que ya tenía número en OneDrive, escríbelo aquí (hacia adelante salta el correlativo).</p>
    <form id="f"><label class="campo">Número <input name="n" type="number" value="${esc(prox)}" min="1" required></label>
    <div class="acciones"><button type="button" class="btn" onclick="cerrarModal()">Cancelar</button><button class="btn primario">Emitir</button></div></form>`);
  $('#f', m).onsubmit = async ev => { ev.preventDefault(); const n = Number(new FormData(ev.target).get('n')); try { const r = await rpc('emitir_cotizacion', { p_id: c.id, p_numero: n === Number(prox) ? null : n }); COT.actual = r; COT.actual.lineas = r.lineas || []; cerrarModal(); aviso('Cot ' + r.numero + ' emitida'); pintarCotizacion(); } catch (e) { aviso(errorDe(e), true); } };
}
function formConvertir(c) {
  const emp = c.tipo_cliente === 'empresa', t = totalesCot(c);
  const m = modal(`<h2>Convertir la Cot ${esc(c.numero)} en pedido</h2>
    <p style="margin:0;font-size:13px">Crea el pedido con sus líneas (${c.lineas.filter(l => l.rol === 'producto').length} de producto), ${c.cliente_id ? 'el cliente ya existente' : 'el cliente nuevo (o el que calce por teléfono / RUT / correo)'} y el abono si lo hubo. Total ${fmtCot(t.total)}.</p>
    <form id="f"><div class="campos">
      <label class="campo">Número (vacío = siguiente W) <input name="numero" placeholder="W3160"></label>
      <label class="campo">Tipo de pedido <select name="tipo_pedido"><option value="">según la cotización</option><option>Venta catálogo</option><option>Mesa a medida</option><option>Mueble a medida</option><option>Proyecto</option></select></label>
      <label class="campo">Origen <select name="origen"><option>WhatsApp</option><option>Instagram</option><option>Cliente directo</option><option>Correo</option><option>Colaborador</option><option>Tienda</option><option>Interno</option></select></label>
      <label class="campo">Fecha de compra <input name="fecha_compra" type="date" value="${hoyISO()}" required></label>
      <label class="campo">Tipo de entrega <select name="tipo_entrega"><option value="">según la zona de la cotización</option><option>Despacho RM</option><option>Despacho regiones</option><option>Retiro en taller</option></select></label>
      <label class="campo">Fecha comprometida (vacía = compra + 21 días) <input name="fecha_comprometida" type="date"></label>
      ${!c.cliente_id ? `<label class="campo">Tipo de cliente nuevo <select name="cliente_tipo"><option>${emp ? 'Empresa' : 'Particular'}</option><option>Particular</option><option>Arquitecto</option><option>Diseñador</option><option>Contratista</option><option>Empresa</option></select></label>` : ''}
      <label class="campo">Abono inicial <input name="abono" type="number" placeholder="0"></label>
      <label class="campo">Medio del abono <select name="abono_medio"><option>Transferencia</option><option>Webpay</option><option>MercadoPago</option><option>Getnet</option><option>Efectivo</option></select></label>
      <label class="campo">Cuenta del abono <select name="abono_cuenta">${typeof cuentasOpciones === 'function' ? cuentasOpciones('') : '<option value="">-</option><option>SANTINO.SANTANDER</option><option>HAROLD.BCI</option><option>WEBPAY</option>'}</select></label>
    </div><label class="campo">Observación del pedido <input name="observacion"></label>
    <div class="acciones"><button type="button" class="btn" onclick="cerrarModal()">Cancelar</button><button class="btn primario">Crear pedido</button></div></form>`);
  $('#f', m).onsubmit = async ev => { ev.preventDefault(); const f = new FormData(ev.target); const o = {}; for (const [k, v] of f.entries()) if (String(v).trim() !== '') o[k] = String(v).trim();
    try { const r = await rpc('convertir_cotizacion_en_pedido', { p_id: c.id, p_opciones: o }); cerrarModal(); aviso('Pedido ' + r.numero + ' creado desde la Cot ' + c.numero); location.hash = '#/pedido/' + r.pedido_id; } catch (e) { aviso(errorDe(e), true); } };
}

/* ---------- panel del motor ---------- */
function motorHtml() {
  const m = COT.motor, st = COT.st, md = m.MODELOS[st.model]; let r = null, err = null;
  try { r = resultadoMotor(); } catch (e) { err = errorDe(e); }
  const seg = (name, pares, actual) => `<div class="seg" data-seg="${name}">${pares.map(([v, l]) => `<button type="button" data-v="${esc(v)}" class="${String(v) === String(actual) ? 'on' : ''}">${esc(String(l).replace('★', '').trim())}${String(l).includes('★') ? ' ★' : ''}</button>`).join('')}</div>`;
  let h = `<label class="campo">Modelo <select id="m-model">${Object.keys(m.MODELOS).map(k => `<option value="${k}" ${k === st.model ? 'selected' : ''}>${esc(m.MODELOS[k].label)}</option>`).join('')}</select></label>`;
  for (const ax of Object.keys(md.axes || {})) h += `<div class="campo"><span>${{ forma: 'Forma', madera: 'Madera', glass: 'Vidrio', version: 'Versión', acabado: 'Acabado', tipo: 'Tipo de silla' }[ax] || ax}</span>${seg(ax, md.axes[ax], st.opts[ax])}</div>`;
  if (md.noTable) h += `<label class="campo">Cantidad de sillas <input id="m-cant" type="number" min="1" value="${esc(st.vk)}" style="width:90px"></label>`;
  else {
    const fmts = md.formatos(st.opts) || [];
    h += `<div class="campo"><span>Formato</span>${seg('vk', fmts.map(f => [f, f]), st.vk)}</div>`;
    h += `<div class="campo"><span>Medidas (cm) <span class="gris">largo × ancho</span></span><div style="display:flex;gap:6px;align-items:center"><input id="m-largo" type="number" value="${esc(st.largo)}" style="width:80px"> × <input id="m-ancho" type="number" value="${esc(st.ancho)}" style="width:80px">${st.custom ? `<button type="button" class="btn chico" id="m-reset">↺ catálogo</button>` : ''}</div></div>`;
    if (r && r.modified) h += `<div class="gris" style="font-size:12px">Precio e instalación usan el formato <b>${esc(r.vkRef)}</b>: ${r.contiene ? 'la medida cabe en ese formato y se cobra su precio publicado (una medida intermedia nunca sale más barata).' : 'la medida es más grande que todos los formatos: se escala desde el mayor con su mismo margen.'}</div>`;
    if (md.sillas) h += `<div class="campo"><label style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="m-sillas" ${st.sillas ? 'checked' : ''}> Con sillas</label>${st.sillas ? `<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap"><input id="m-nsillas" type="number" min="1" value="${esc(st.nSillas)}" style="width:64px"><select id="m-tsilla">${Object.entries(m.SILLA_LABEL).map(([k, l]) => `<option value="${k}" ${k === st.tipoSilla ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>` : ''}</div>`;
  }
  h += `<div class="campos"><label class="campo">Canal de pago <select id="m-canal">${CANALES_COT.map(([v, l]) => `<option value="${v}" ${v === String(st.canal) ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <label class="campo">Despacho <select id="m-zona">${ZONAS_COT.map(([v, l]) => `<option value="${v}" ${v === st.zona ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>`;
  if (st.zona === 'custom') h += `<div class="campos"><label class="campo">Nombre del despacho <input id="m-desplbl" value="${esc(st.despLabel)}" placeholder="Rancagua"></label><label class="campo">Valor <input id="m-despval" type="number" value="${esc(st.despVal)}"></label></div>`;
  if (!md.noTable) h += `<div class="campo"><label style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="m-inst" ${st.instalar ? 'checked' : ''}> Instalación${r && st.instalar && !st.instCustom ? ` <span class="gris">(${fmtCot(r.instalacion)} por tabla)</span>` : ''}</label>${st.instalar ? `<label style="display:flex;gap:6px;align-items:center;font-size:12px"><input type="checkbox" id="m-instc" ${st.instCustom ? 'checked' : ''}> valor especial ${st.instCustom ? `<input id="m-instv" type="number" value="${esc(st.instVal)}" style="width:100px">` : ''}</label>` : ''}</div>`;
  h += `<div class="campo"><label style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="m-cyber" ${st.cyber ? 'checked' : ''}> Precio Cyber / oferta (si está apagado, va el precio de lista)</label></div>`;
  if (err) h += `<div class="rojo">${esc(err)}</div>`;
  else if (r) {
    const mg = x => x == null ? '-' : Math.round(x * 100) + '%';
    h += `<div class="motor-res"><div class="fila"><span>Precio de lista</span><b>${fmtCot(r.lista)}</b></div>
      ${r.cyber ? `<div class="fila"><span>Precio Cyber (${Math.round((1 - r.cyber / r.lista) * 100)}%)</span><b>${fmtCot(r.cyber)}</b></div>` : ''}
      <div class="fila interno"><span>Costo (material + MO)</span><span>${fmtCot(r.costLista)}</span></div>
      <div class="fila interno"><span>Margen lista · cyber</span><span class="${(r.margenLista || 0) < 0.15 ? 'rojo' : ''}">${mg(r.margenLista)} · ${mg(r.margenCyber)}</span></div>
      ${r.despacho ? `<div class="fila"><span>Despacho</span><span>${fmtCot(r.despacho)}</span></div>` : ''}${r.instalacion ? `<div class="fila"><span>Instalación</span><span>${fmtCot(r.instalacion)}</span></div>` : ''}
      <div class="fila total"><span>${st.cyber && r.cyber ? 'Total con Cyber' : 'Total lista'}</span><b>${fmtCot(r.precioFinal + (r.despacho || 0) + (r.instalacion || 0))}</b></div>
      <div class="gris" style="font-size:11px">${r.publicado ? 'Variante publicada en Shopify.' : r.mesaSugerida ? 'Sin precio publicado: precio sugerido por margen objetivo.' : r.estandar ? 'Opción no publicada: mismo margen que la variante estándar más parecida.' : 'Precio por el formato de referencia.'}</div>
      <button type="button" class="btn primario" id="m-agregar" style="margin-top:6px">↓ Agregar a la cotización</button></div>`;
  }
  return h;
}
function activarMotor() {
  const m = COT.motor, st = COT.st; const re = () => { const caja = $('.cot-motor'); if (!caja) return; const h = caja.scrollTop; leerCabecera(); pintarCotizacion(); const c2 = $('.cot-motor'); if (c2) c2.scrollTop = h; };
  const on = (id, ev, fn) => { const el = $(id); if (el) el['on' + ev] = fn; };
  on('#m-model', 'change', ev => { const canal = st.canal, zona = st.zona, cyber = st.cyber; COT.st = stMotorInicial(ev.target.value); Object.assign(COT.st, { canal, zona, cyber }); re(); });
  $$('.cot-motor [data-seg] button').forEach(b => b.onclick = () => { const seg = b.closest('[data-seg]').dataset.seg, v = b.dataset.v; if (seg === 'vk') { st.vk = v; st.custom = false; const d = m.MODELOS[st.model].dims(st.opts, v); if (d) { st.largo = d.largo; st.ancho = d.ancho; } } else { st.opts[seg] = v; const md = m.MODELOS[st.model]; if (!md.noTable) { const f = md.formatos(st.opts) || []; if (!f.includes(st.vk)) st.vk = f[0]; if (!st.custom) { const d = md.dims(st.opts, st.vk); if (d) { st.largo = d.largo; st.ancho = d.ancho; } } } } re(); });
  on('#m-cant', 'change', ev => { st.vk = String(Math.max(1, Number(ev.target.value) || 1)); re(); });
  const med = () => { st.largo = Number($('#m-largo').value) || st.largo; st.ancho = Number($('#m-ancho').value) || st.ancho; const d = m.MODELOS[st.model].dims(st.opts, st.vk); st.custom = !d || Number(st.largo) !== d.largo || Number(st.ancho) !== d.ancho; re(); };
  on('#m-largo', 'change', med); on('#m-ancho', 'change', med);
  on('#m-reset', 'click', () => { st.custom = false; const d = m.MODELOS[st.model].dims(st.opts, st.vk); st.largo = d.largo; st.ancho = d.ancho; re(); });
  on('#m-sillas', 'change', ev => { st.sillas = ev.target.checked; if (st.sillas && !st.nSillas) st.nSillas = m.nPers(st.vk, st.model); re(); });
  on('#m-nsillas', 'change', ev => { st.nSillas = Number(ev.target.value) || 0; re(); }); on('#m-tsilla', 'change', ev => { st.tipoSilla = ev.target.value; re(); });
  on('#m-canal', 'change', ev => { st.canal = ev.target.value; re(); }); on('#m-zona', 'change', ev => { st.zona = ev.target.value; re(); });
  on('#m-desplbl', 'change', ev => { st.despLabel = ev.target.value; }); on('#m-despval', 'change', ev => { st.despVal = ev.target.value; re(); });
  on('#m-inst', 'change', ev => { st.instalar = ev.target.checked; re(); }); on('#m-instc', 'change', ev => { st.instCustom = ev.target.checked; re(); }); on('#m-instv', 'change', ev => { st.instVal = ev.target.value; re(); });
  on('#m-cyber', 'change', ev => { st.cyber = ev.target.checked; re(); });
  on('#m-agregar', 'click', () => { try { const r = resultadoMotor(); leerCabecera(); const c = COT.actual; c.canal = Number(st.canal); c.zona = st.zona; c.lineas.push(...lineasDesdeMotor(r)); pintarCotizacion(); aviso('Línea agregada: ' + descripcionMotor(r)); } catch (e) { aviso(errorDe(e), true); } });
}
async function modalParametrosMotor() {
  await cargarMotor(); const m = COT.motor;
  const filas = Object.keys(m.VARS_DEFAULT).map(k => { const o = COT.params[k]; return `<tr><td class="mono" style="font-size:11px">${esc(k)}</td><td>${esc(m.VLAB[k] || '')}</td><td class="num">${Number(m.VARS_DEFAULT[k]).toLocaleString('es-CL')}</td><td><input type="number" step="any" data-p="${esc(k)}" value="${o ? esc(o.valor) : ''}" placeholder="por defecto" style="width:110px"></td><td class="gris" style="font-size:11px">${o ? esc(o.por) + ' ' + fechaHora(o.en) : ''}</td></tr>`; }).join('');
  const mm = modal(`<h2>Precios y parámetros del motor</h2><p class="gris" style="font-size:12px;margin:0">Un valor aquí reemplaza al del motor para TODAS las cotizaciones nuevas (antes se guardaba en el navegador y se perdía al cambiar de versión). Vacío = valor por defecto del motor. Queda historial de quién y cuándo.</p>
    <div style="overflow:auto;max-height:60vh"><table class="d-tabla"><thead><tr><th>Clave</th><th>Qué es</th><th>Motor</th><th>Tu valor</th><th>Cambio</th></tr></thead><tbody>${filas}</tbody></table></div>
    <div class="acciones"><button class="btn" onclick="cerrarModal()">Cerrar</button></div>`, 'ancha');
  $$('[data-p]', mm).forEach(inp => inp.onchange = async () => { try { COT.params = (await rpc('fijar_parametro_motor', { p_clave: inp.dataset.p, p_valor: inp.value === '' ? null : Number(inp.value), p_nota: null })) || {}; aplicarParametrosMotor(); aviso('Parámetro ' + inp.dataset.p + (inp.value === '' ? ' vuelve al valor del motor' : ' = ' + inp.value)); } catch (e) { aviso(errorDe(e), true); } });
}

/* ---------- precios de catálogo (D2): la base manda, Shopify recibe ---------- */
async function modalPreciosCatalogo() {
  const filas = (await rpc('precios_catalogo_json', { p_detalle: true })) || [];
  const estadoChip = e => `<span class="chip ${e === 'igual' ? 'ok' : e === 'sin variante en Shopify' ? '' : 'atrasado'}" title="${esc(e)}">${e === 'igual' ? 'igual' : e === 'sin variante en Shopify' ? 'no está en Shopify' : e === 'distinto' ? 'distinto' : 'colores ≠'}</span>`;
  const porModelo = {}; filas.forEach(f => (porModelo[f.modelo] = porModelo[f.modelo] || []).push(f));
  const resumen = { igual: 0, distinto: 0, sin: 0 }; filas.forEach(f => { if (f.estado === 'igual') resumen.igual++; else if (f.estado === 'sin variante en Shopify') resumen.sin++; else resumen.distinto++; });
  const html = Object.entries(porModelo).map(([mo, fs]) => `<h3 style="margin:12px 0 4px;font-size:14px">${esc(COT.motor && COT.motor.MODELOS[mo] ? COT.motor.MODELOS[mo].label : mo)} <span class="gris" style="font-weight:400">(${fs.length})</span></h3>
    <table class="d-tabla"><thead><tr><th>Variante</th><th>Lista</th><th>Oferta</th><th title="Hoy se vende a precio de oferta">En oferta</th><th>Shopify hoy</th><th></th><th>Cambio</th></tr></thead><tbody>${fs.map(f => `<tr data-clave="${esc(f.clave)}">
      <td>${esc(f.descripcion || f.clave)}</td>
      <td><input type="number" data-k="lista" value="${f.precio_lista}" style="width:110px"></td>
      <td><input type="number" data-k="oferta" value="${f.precio_oferta || ''}" placeholder="sin oferta" style="width:110px"></td>
      <td style="text-align:center"><input type="checkbox" data-k="en_oferta" ${f.en_oferta ? 'checked' : ''} ${f.precio_oferta ? '' : 'disabled'}></td>
      <td class="num nw">${f.variantes_shopify ? (f.shopify_min === f.shopify_max ? pesos(f.shopify_min) : pesos(f.shopify_min) + ' a ' + pesos(f.shopify_max)) + (f.shopify_antes ? ` <span class="gris" style="text-decoration:line-through">${pesos(f.shopify_antes)}</span>` : '') + ` <span class="gris">(${f.variantes_shopify})</span>` : '<span class="gris">-</span>'}</td>
      <td>${estadoChip(f.estado)}</td>
      <td class="gris" style="font-size:11px">${f.origen === 'Harold' ? esc(f.actualizado_por) + ' ' + fecha(f.actualizado_en) : esc(f.origen || '')}</td></tr>`).join('')}</tbody></table>`).join('');
  const m = modal(`<h2>Precios de catálogo</h2><p class="gris" style="font-size:12px;margin:0">Un precio aquí es el que usa el cotizador al instante y el que debe mostrar Shopify. ${resumen.igual} variantes iguales a Shopify, <b class="${resumen.distinto ? 'rojo' : ''}">${resumen.distinto} distintas</b>, ${resumen.sin} sin variante publicada. Para subir las diferencias a Shopify: <span class="mono">node scripts/precios_catalogo.mjs --subir-shopify --aplicar</span>. Cambiar un valor y salir de la casilla lo guarda (con historial).</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn chico" id="pc-oferta-on">Activar oferta en todo el catálogo</button><button class="btn chico" id="pc-oferta-off">Apagar oferta en todo</button></div>
    <div style="overflow:auto;max-height:62vh">${html || '<p class="gris">Sin precios cargados: corre scripts/precios_catalogo.mjs --sembrar.</p>'}</div>
    <div class="acciones"><button class="btn" onclick="cerrarModal()">Cerrar</button></div>`, 'ancha');
  $$('tr[data-clave] input', m).forEach(inp => inp.onchange = async () => {
    const tr = inp.closest('tr'), lista = Number($('[data-k=lista]', tr).value), oferta = $('[data-k=oferta]', tr).value === '' ? null : Number($('[data-k=oferta]', tr).value), en = $('[data-k=en_oferta]', tr).checked;
    try { const r = await rpc('fijar_precio_catalogo', { p_clave: tr.dataset.clave, p_lista: lista, p_oferta: oferta, p_en_oferta: en, p_nota: null }); COT.precios[tr.dataset.clave] = [r.precio_lista, r.precio_oferta || r.precio_lista]; COT.motor = null; aviso('Precio guardado: ' + r.descripcion + ' ' + pesos(r.precio_esperado)); }
    catch (e) { aviso(errorDe(e), true); }
  });
  $('#pc-oferta-on', m).onclick = async () => { if (!confirm('¿Activar el precio de oferta en todas las variantes que lo tienen? El cotizador y Shopify (al subir) pasan a oferta.')) return; try { const n = await rpc('oferta_catalogo', { p_activar: true, p_modelo: null }); aviso('Oferta activada en ' + n + ' variantes'); COT.motor = null; cerrarModal(); modalPreciosCatalogo(); } catch (e) { aviso(errorDe(e), true); } };
  $('#pc-oferta-off', m).onclick = async () => { try { const n = await rpc('oferta_catalogo', { p_activar: false, p_modelo: null }); aviso('Oferta apagada en ' + n + ' variantes'); COT.motor = null; cerrarModal(); modalPreciosCatalogo(); } catch (e) { aviso(errorDe(e), true); } };
}

/* ---------- documento: HTML (vista previa) con el formato oficial del generador Python ---------- */
const SDC_STYLE_COT = `.sdc-doc{background:#fff;margin:0 auto;padding:44px 50px;font-family:Inter,Helvetica,Arial,sans-serif;font-size:12px;color:#1a1a1a;min-height:1010px;max-width:794px;box-sizing:border-box}
.sdc-hdr{display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:6px;padding-bottom:16px;border-bottom:.5px solid #d8d8d8}.sdc-logo{height:54px;width:auto;object-fit:contain}.sdc-right{text-align:right}
.sdc-label{font-size:9px;letter-spacing:2.5px;text-transform:uppercase;color:#0081A6;font-weight:500;margin-bottom:3px}.sdc-num{font-family:Georgia,serif;font-size:20px;color:#1a1a1a;letter-spacing:.5px}
.sdc-meta{font-size:10px;color:#777;margin-top:5px;line-height:1.9;font-weight:300}.sdc-empresa{font-size:11px;color:#888;line-height:1.6;font-weight:300;margin:14px 0 18px}.sdc-cli{margin-bottom:18px}
.sdc-clititle{font-size:9px;letter-spacing:2px;text-transform:uppercase;color:#0081A6;font-weight:500;margin-bottom:9px}.sdc-clirow{display:flex;line-height:1.85;font-size:11.5px}.sdc-clilbl{font-weight:500;width:110px;flex-shrink:0;color:#555}.sdc-clival{font-weight:300;color:#1a1a1a}
.sdc-table{width:100%;border-collapse:collapse;margin-bottom:11px}.sdc-table thead th{padding:7px 8px;font-size:9px;font-weight:600;text-align:center;letter-spacing:1.2px;text-transform:uppercase;white-space:nowrap;background:#0081A6;color:#fff}
.sdc-table tbody tr{border-bottom:1px solid #ececec}.sdc-table tbody td{padding:9px 8px;text-align:center;vertical-align:middle;font-size:11.5px;font-weight:300;color:#1a1a1a}.sdc-table td.sdc-n{font-weight:500;color:#555;font-size:10.5px}.sdc-table td.sdc-desc{text-align:left;padding:9px 14px;line-height:1.6;font-size:11.5px}
.sdc-totwrap{display:flex;justify-content:flex-end;margin-bottom:6px}.sdc-totinner{min-width:262px}.sdc-totrow{display:flex;justify-content:space-between;gap:16px;padding:3px 13px;font-size:11px;font-weight:300;color:#555;white-space:nowrap}
.sdc-totfinal{background:#0081A6;color:#fff;display:flex;justify-content:space-between;padding:7px 13px;font-size:12.5px;font-weight:600;margin-top:3px;letter-spacing:.3px;white-space:nowrap}.sdc-ahorro{color:#0081A6;display:flex;justify-content:space-between;gap:16px;padding:4px 13px;font-size:10.5px;margin-top:3px;font-weight:500;letter-spacing:.2px;white-space:nowrap}
.sdc-spacer{min-height:14px}.sdc-foot{display:flex;gap:22px;margin-top:18px;padding-top:16px;border-top:.5px solid #d8d8d8}.sdc-fcol{flex:1 1 0;min-width:0}.sdc-foottitle{font-size:8.5px;letter-spacing:2px;text-transform:uppercase;font-weight:600;color:#999;margin-bottom:9px}
.sdc-tyc{padding-left:14px;font-size:9.5px;line-height:1.9;color:#777;font-weight:300}.sdc-bank{font-size:10.5px;line-height:2;color:#555;font-weight:300}.sdc-bank strong{font-weight:600;color:#222}`;
const mdBold = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
function tycDe(c) {
  if (Array.isArray(c.tyc) && c.tyc.length) return c.tyc.slice();
  const t = [c.forma_pago || TYC_COT.pago, c.plazo || TYC_COT.plazo, TYC_COT.mods, TYC_COT.envios];
  if (Number(c.garantia_meses) > 0) t.push(TYC_COT.garantia(c.garantia_meses));
  return t;
}
function filasDocumento(c) {
  /* Mismo cálculo que construir_html del generador: para empresa el unitario se muestra neto; con precio_normal aparece la columna Dcto. */
  const emp = c.tipo_cliente === 'empresa', hayDcto = (c.lineas || []).some(l => l.rol !== 'separador' && Number(l.precio_normal) > 0); const filas = []; let rn = 1;
  for (const l of c.lineas || []) {
    if (l.rol === 'separador') { filas.push({ n: rn++, blank: true }); continue; }
    const p = Number(l.precio) || 0, n = Number(l.cantidad) || 1, pn = Number(l.precio_normal) || 0, ivai = l.iva_incluido !== false;
    const unit = emp ? (ivai ? Math.round(p / 1.19) : p) : p, ltot = emp ? (ivai ? Math.round(p * n / 1.19) : p * n) : p * n;
    const unitDisp = pn > 0 ? (emp ? (ivai ? Math.round(pn / 1.19) : pn) : pn) : unit;
    filas.push({ n: rn++, desc: l.descripcion || '', sub: l.sub || '', ctd: n, unit: unitDisp, total: ltot, dcto: pn > 0 ? Math.round((1 - p / pn) * 100) + '%' : '', gris: p === 0 });
  }
  while (rn <= 5) filas.push({ n: rn++, blank: true });
  return { filas, hayDcto, emp };
}
function htmlCotizacion(c, opt = {}) {
  const { filas, hayDcto, emp } = filasDocumento(c), t = totalesCot(c);
  const logo = opt.logo || 'logo.png';
  const rows = filas.map(f => f.blank ? `<tr style="height:40px"><td class="sdc-n" style="color:#ddd">${f.n}</td><td></td><td></td>${hayDcto ? '<td></td>' : ''}<td></td><td></td></tr>`
    : f.gris ? `<tr><td class="sdc-n" style="color:#aaa">${f.n}</td><td class="sdc-desc" style="color:#aaa">${mdBold(f.desc)}${f.sub ? `<br><span style="font-size:9.5px;color:#888;font-weight:300">${mdBold(f.sub)}</span>` : ''}</td><td></td>${hayDcto ? '<td></td>' : ''}<td style="color:#aaa">${f.ctd}</td><td></td></tr>`
    : `<tr><td class="sdc-n">${f.n}</td><td class="sdc-desc">${mdBold(f.desc)}${f.sub ? `<br><span style="font-size:9.5px;color:#888;font-weight:300">${mdBold(f.sub)}</span>` : ''}</td><td>${fmtCot(f.unit)}</td>${hayDcto ? `<td>${f.dcto}</td>` : ''}<td>${f.ctd}</td><td>${fmtCot(f.total)}</td></tr>`).join('');
  let tot = emp ? `<div class="sdc-totrow"><span>Sub total neto</span><span>${fmtCot(t.neto)}</span></div><div class="sdc-totrow"><span>IVA 19%</span><span>${fmtCot(t.iva)}</span></div><div class="sdc-totfinal"><span>Total</span><span>${fmtCot(t.total)}</span></div>`
    : `<div class="sdc-totfinal"><span>${esc(c.total_label || 'Total')}</span><span>${fmtCot(t.total)}</span></div>`;
  if (t.ahorro > 0) tot += `<div class="sdc-ahorro"><span>&#10003; ${esc(c.ahorro_label || 'Ahorro en esta cotización')}</span><span>&minus; ${fmtCot(t.ahorro)}</span></div>`;
  if (c.mostrar_total_final === false) tot = '';
  const cli = [[c.cliente_label || (emp ? 'Razón social' : 'Nombre'), c.cliente_nombre]]; if (c.proyecto) cli.push(['Proyecto', c.proyecto]);
  cli.push(['RUT', c.cliente_rut], ['Teléfono', c.cliente_telefono], ['E-mail', c.cliente_email], ['Dirección', c.cliente_direccion]);
  const ct = CTAS_COT[c.cuenta] || CTAS_COT.empresa, fecha = c.fecha || hoyISO(), val = sumarDias(fecha, c.validez_dias);
  return `<style>${SDC_STYLE_COT}</style><div class="sdc-doc">
    <div class="sdc-hdr"><img src="${logo}" class="sdc-logo" alt="Santino Design"><div class="sdc-right"><div class="sdc-label">Cotización</div><div class="sdc-num">N&deg; ${c.numero ? esc(c.numero) : '<span style="color:#bbb">borrador</span>'}</div>
      <div class="sdc-meta">${esc(fechaLarga(fecha))} &middot; Asesor: ${esc(c.asesor || 'Harold Ahumada')}<br><span style="color:#555;font-weight:400">Válido hasta: ${esc(fechaLarga(val))}</span></div></div></div>
    <div class="sdc-empresa">Santino Design SpA &middot; 77.551.022-6</div>
    <div class="sdc-cli"><div class="sdc-clititle">Cliente</div>${cli.filter(([, v]) => v).map(([l, v]) => `<div class="sdc-clirow"><span class="sdc-clilbl">${esc(l)}</span><span class="sdc-clival">${esc(v)}</span></div>`).join('')}</div>
    <table class="sdc-table"><thead><tr><th style="width:28px">N</th><th>Descripción</th><th style="width:96px">${emp ? 'Precio unit. neto' : 'Precio unit.'}</th>${hayDcto ? '<th style="width:48px">Dcto</th>' : ''}<th style="width:32px">Ctd</th><th style="width:96px">${emp ? 'Total neto' : 'Total'}</th></tr></thead><tbody>${rows}</tbody></table>
    ${tot ? `<div class="sdc-totwrap"><div class="sdc-totinner">${tot}</div></div>` : ''}${c.nota ? `<div class="sdc-totrow" style="justify-content:flex-start;color:#777">${esc(c.nota)}</div>` : ''}
    <div class="sdc-spacer"></div>
    <div class="sdc-foot"><div class="sdc-fcol"><div class="sdc-foottitle">Términos y condiciones</div><ol class="sdc-tyc">${tycDe(c).map(x => `<li>${esc(x)}</li>`).join('')}</ol></div>
    <div class="sdc-fcol"><div class="sdc-foottitle">Datos bancarios</div><div class="sdc-bank"><strong>${esc(ct.titular)}</strong><br>${esc(ct.rut)}<br>${esc(ct.banco)}<br>${esc(ct.tipo)}: ${esc(ct.num)}<br>${esc(ct.email)}</div></div></div></div>`;
}

/* ---------- PDF (jsPDF, texto vectorial; mismo orden y colores del documento oficial) ---------- */
function nombreArchivoCot(c) {
  const partes = String(c.cliente_nombre || '').trim().split(/\s+/); let corto;
  if (c.proyecto) corto = (partes[0] ? partes[0][0].toUpperCase() + partes[0].slice(1) : '') + (partes[1] ? ' ' + partes[1][0].toUpperCase() : '') + ' ' + String(c.proyecto).toUpperCase();
  else corto = partes.slice(0, 3).map(w => w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : '').join(' ');
  return `Cot ${c.numero} ${corto.replace(/[\\/:*?"<>|]/g, '')}.pdf`;
}
/* Escribe un párrafo con **negrita** y salto de línea automático; devuelve el alto usado (mm). */
function textoNegrita(doc, texto, x, y, maxW, tam, lh, color) {
  doc.setFontSize(tam); doc.setTextColor(...color); const partes = String(texto).split(/(\*\*.+?\*\*)/).filter(Boolean);
  const palabras = []; for (const p of partes) { const b = /^\*\*.+\*\*$/.test(p); for (const w of p.replace(/^\*\*|\*\*$/g, '').split(/(\s+)/)) if (w !== '') palabras.push({ w, b }); }
  let cx = x, cy = y, lineas = 1; const sp = doc.getTextWidth(' ');
  for (const { w, b } of palabras) { if (/^\s+$/.test(w)) { cx += sp; continue; } doc.setFont('helvetica', b ? 'bold' : 'normal'); const ww = doc.getTextWidth(w); if (cx + ww > x + maxW && cx > x) { cx = x; cy += lh; lineas++; } doc.text(w, cx, cy); cx += ww; }
  doc.setFont('helvetica', 'normal'); return lineas * lh;
}
async function pdfCotizacion(c) {
  if (!c.numero) throw new Error('Emite la cotización (número) antes del PDF');
  await cargarJsPDF(); const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' }); const W = 210, M = 14, A = W - 2 * M; const AZUL = [0, 129, 166], NEGRO = [26, 26, 26], GRIS = [119, 119, 119], GRIS2 = [85, 85, 85];
  const { filas, hayDcto, emp } = filasDocumento(c), t = totalesCot(c); let y = 16;
  try { doc.addImage(await logoDataUrl(), 'PNG', M, y - 4, 48, 14, 'logo', 'MEDIUM'); } catch (e) { }   // MEDIUM comprime la imagen (sin eso el PDF pesa 1,2 MB)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...AZUL); doc.text('C O T I Z A C I Ó N', W - M, y - 1, { align: 'right' });
  doc.setFont('times', 'normal'); doc.setFontSize(17); doc.setTextColor(...NEGRO); doc.text('N° ' + c.numero, W - M, y + 5.5, { align: 'right' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...GRIS); doc.text(`${fechaLarga(c.fecha || hoyISO())} · Asesor: ${c.asesor || 'Harold Ahumada'}`, W - M, y + 10, { align: 'right' });
  doc.setTextColor(...GRIS2); doc.text('Válido hasta: ' + fechaLarga(sumarDias(c.fecha || hoyISO(), c.validez_dias)), W - M, y + 14, { align: 'right' });
  y += 18; doc.setDrawColor(216); doc.setLineWidth(0.2); doc.line(M, y, W - M, y); y += 6;
  doc.setFontSize(8); doc.setTextColor(136); doc.text('Santino Design SpA · 77.551.022-6', M, y); y += 8;
  doc.setFontSize(6.5); doc.setTextColor(...AZUL); doc.text('C L I E N T E', M, y); y += 4.5;
  const cli = [[c.cliente_label || (emp ? 'Razón social' : 'Nombre'), c.cliente_nombre]]; if (c.proyecto) cli.push(['Proyecto', c.proyecto]);
  cli.push(['RUT', c.cliente_rut], ['Teléfono', c.cliente_telefono], ['E-mail', c.cliente_email], ['Dirección', c.cliente_direccion]);
  doc.setFontSize(8.5); for (const [l, v] of cli) { if (!v) continue; doc.setFont('helvetica', 'bold'); doc.setTextColor(...GRIS2); doc.text(l, M, y); doc.setFont('helvetica', 'normal'); doc.setTextColor(...NEGRO); const tv = doc.splitTextToSize(String(v), A - 34); doc.text(tv, M + 32, y); y += 4.6 * tv.length; }
  y += 4;
  /* tabla */
  const wN = 9, wU = 26, wD = hayDcto ? 12 : 0, wC = 10, wT = 26, wDesc = A - wN - wU - wD - wC - wT;
  const cols = [[M, wN, 'N', 'center'], [M + wN, wDesc, 'Descripción', 'left'], [M + wN + wDesc, wU, emp ? 'Precio unit. neto' : 'Precio unit.', 'center']];
  if (hayDcto) cols.push([M + wN + wDesc + wU, wD, 'Dcto', 'center']);
  cols.push([M + wN + wDesc + wU + wD, wC, 'Ctd', 'center'], [M + wN + wDesc + wU + wD + wC, wT, emp ? 'Total neto' : 'Total', 'center']);
  const cab = () => { doc.setFillColor(...AZUL); doc.rect(M, y, A, 7, 'F'); doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.setTextColor(255); cols.forEach(([x, w, tt, al]) => doc.text(tt.toUpperCase(), al === 'left' ? x + 4 : x + w / 2, y + 4.6, { align: al === 'left' ? 'left' : 'center' })); y += 7; doc.setFont('helvetica', 'normal'); };
  cab(); doc.setDrawColor(236); doc.setLineWidth(0.2);
  for (const f of filas) {
    if (y > 250) { doc.addPage(); y = 18; cab(); }
    if (f.blank) { doc.setFontSize(7.5); doc.setTextColor(221); doc.text(String(f.n), cols[0][0] + wN / 2, y + 6.5, { align: 'center' }); y += 10.5; doc.line(M, y, W - M, y); continue; }
    const col = f.gris ? [170, 170, 170] : NEGRO; const descW = wDesc - 8;
    const alto = textoNegrita(doc, f.desc, cols[1][0] + 4, y + 5.2, descW, 8.5, 4.2, col) + (f.sub ? textoNegrita(doc, f.sub, cols[1][0] + 4, y + 5.2 + 4.2 * Math.ceil(doc.splitTextToSize(f.desc.replace(/\*\*/g, ''), descW).length), descW, 7, 3.6, [136, 136, 136]) : 0);
    const h = Math.max(9, alto + 3.5);
    doc.setFontSize(7.5); doc.setTextColor(f.gris ? 170 : 85); doc.text(String(f.n), cols[0][0] + wN / 2, y + 5.2, { align: 'center' });
    doc.setFontSize(8.5); doc.setTextColor(...col);
    if (!f.gris) { doc.text(fmtCot(f.unit), cols[2][0] + wU / 2, y + 5.2, { align: 'center' }); if (hayDcto) doc.text(f.dcto, cols[3][0] + wD / 2, y + 5.2, { align: 'center' }); doc.text(fmtCot(f.total), cols[cols.length - 1][0] + wT / 2, y + 5.2, { align: 'center' }); }
    doc.text(String(f.ctd), cols[cols.length - 2][0] + wC / 2, y + 5.2, { align: 'center' });
    y += h; doc.line(M, y, W - M, y);
  }
  y += 3;
  /* totales */
  if (c.mostrar_total_final !== false) {
    const bx = W - M - 70, bw = 70; doc.setFontSize(8); doc.setTextColor(...GRIS2);
    if (emp) { doc.text('Sub total neto', bx + 4, y + 3.5); doc.text(fmtCot(t.neto), bx + bw - 4, y + 3.5, { align: 'right' }); y += 4.5; doc.text('IVA 19%', bx + 4, y + 3.5); doc.text(fmtCot(t.iva), bx + bw - 4, y + 3.5, { align: 'right' }); y += 5; }
    doc.setFillColor(...AZUL); doc.rect(bx, y, bw, 7.5, 'F'); doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(255); doc.text(emp ? 'Total' : (c.total_label || 'Total'), bx + 4, y + 5); doc.text(fmtCot(t.total), bx + bw - 4, y + 5, { align: 'right' }); y += 7.5; doc.setFont('helvetica', 'normal');
    // Helvetica estándar no trae el símbolo de check ni el signo menos tipográfico: se usan texto plano y guion.
    if (t.ahorro > 0) { doc.setFontSize(7.5); doc.setTextColor(...AZUL); doc.setFont('helvetica', 'bold'); doc.text(c.ahorro_label || 'Ahorro en esta cotización', bx + 4, y + 4); doc.text('- ' + fmtCot(t.ahorro), bx + bw - 4, y + 4, { align: 'right' }); doc.setFont('helvetica', 'normal'); y += 5; }
  }
  if (c.nota) { doc.setFontSize(8); doc.setTextColor(...GRIS); const tn = doc.splitTextToSize(c.nota, A); doc.text(tn, M, y + 4); y += 4.5 * tn.length + 2; }
  /* pie: T&C y datos bancarios */
  y = Math.max(y + 8, 228); if (y > 262) { doc.addPage(); y = 20; }
  doc.setDrawColor(216); doc.line(M, y, W - M, y); y += 6;
  const colW = (A - 10) / 2; doc.setFont('helvetica', 'bold'); doc.setFontSize(6.3); doc.setTextColor(153); doc.text('T É R M I N O S  Y  C O N D I C I O N E S', M, y); doc.text('D A T O S  B A N C A R I O S', M + colW + 10, y); doc.setFont('helvetica', 'normal');
  let yt = y + 5; doc.setFontSize(7); doc.setTextColor(...GRIS);
  tycDe(c).forEach((tx, i) => { const lin = doc.splitTextToSize(`${i + 1}. ${tx}`, colW - 2); doc.text(lin, M + 2, yt); yt += 3.4 * lin.length + 1; });
  const ct = CTAS_COT[c.cuenta] || CTAS_COT.empresa; let yb = y + 5; const bxx = M + colW + 10; doc.setFontSize(7.8);
  doc.setFont('helvetica', 'bold'); doc.setTextColor(34); doc.text(ct.titular, bxx, yb); doc.setFont('helvetica', 'normal'); doc.setTextColor(...GRIS2);
  [ct.rut, ct.banco, ct.tipo + ': ' + ct.num, ct.email].forEach(tx => { yb += 4.2; doc.text(tx, bxx, yb); });
  /* guardar: bucket privado documentos/cotizaciones + registro en la cotización */
  const blob = doc.output('blob'), nombre = nombreArchivoCot(c), path = `cotizaciones/${c.id}/${nombre}`;
  const { error } = await sb.storage.from('documentos').upload(path, blob, { contentType: 'application/pdf', upsert: true }); if (error) throw error;
  COT.actual = await rpc('registrar_pdf_cotizacion', { p_id: c.id, p_path: path, p_nombre: nombre }); COT.actual.lineas = COT.actual.lineas || [];
  const file = new File([blob], nombre, { type: 'application/pdf' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], title: 'Cot ' + c.numero, text: `Cotización N° ${c.numero} · Santino Design` }); return 'PDF compartido y guardado'; } catch (e) { if (e && e.name === 'AbortError') return 'PDF guardado'; } }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nombre; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  return 'PDF guardado y descargado: ' + nombre;
}
