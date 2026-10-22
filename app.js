/* Santino Pedidos · app mínima del prototipo (Fase 2, T-289).
   Una sola página: Supabase (datos y acceso) más HTML generado aquí.
   Roles: admin (Harold) ve todo; operacion (Alexis) ve la lista de taller sin precios y la ruta. */
'use strict';

const sb = window.supabase.createClient(window.SANTINO_CONFIG.url, window.SANTINO_CONFIG.anon);
const app = document.getElementById('app');
let yo = null;            // {id, nombre, rol}
// Versión que corre (el ?v= que publicar_app.js pone en index.html); sirve para avisar cuando hay una nueva (vigilarVersion)
const MI_VERSION = (document.currentScript && (String(document.currentScript.src).match(/[?&]v=(\d+)/) || [])[1]) || null;
let cache = { pedidos: [], filtro: 'pendientes', estados: new Set(), tipos: new Set(), bases: new Set(), etapas: new Set(), mios: new Set(), modelos: null, busqueda: '', opVer: 'pendientes', rutaFecha: null, rutaSalida: null };
const META = 62;          // pedidos al mes (objetivo de utilidad, DM_Financiero v7.15)
const ESTADOS = ['POR FABRICAR','VISITA TÉCNICA','DIBUJO 3D','DISEÑO APROBADO','EN FABRICACIÓN','LISTO EN TALLER','DESPACHO PROGRAMADO','ENTREGADO','CANCELADO','DEVUELTO'];
const ORDEN_COMUNAS = ['Vitacura','Lo Barnechea','Las Condes','La Reina','Providencia','Ñuñoa','Santiago','Macul','Peñalolén','La Florida','Huechuraba','Colina','San Miguel','Maipú','Puente Alto'];

/* ---------- utilidades ---------- */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => s == null ? '' : String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pesos = n => n == null ? '' : '$' + Math.round(n).toLocaleString('es-CL');
/* Proyectos (tipo Proyecto, los P2x): Alexis no ve total, abonos ni saldo (Harold 20-oct, Sofía Zegers y Sara Cerda); la base los entrega vacíos y aquí se dice quién los lleva */
const sinMontos = p => p && p.tipo_pedido === 'Proyecto' && p.total == null;
const TXT_SIN_MONTOS = 'lo lleva Harold';
const MESES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
const MESES_L = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const DIAS = ['dom','lun','mar','mié','jue','vie','sáb'];
function fecha(s, conDia) { if (!s) return '-'; const d = new Date(s.length > 10 ? s : s + 'T12:00:00'); return (conDia ? DIAS[d.getDay()] + ' ' : '') + String(d.getDate()).padStart(2, '0') + '-' + MESES[d.getMonth()]; }
function fechaHora(s) { if (!s) return ''; const d = new Date(s); return fecha(s) + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
function hoyISO(dias = 0) { const d = new Date(); d.setDate(d.getDate() + dias); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }  // hora local (toISOString es UTC: de noche decía mañana)
function num(v) { return v == null ? '' : String(Number(v)).replace(/\.0$/, ''); }
function aviso(msg, error) { const a = $('#aviso'); a.textContent = msg; a.className = 'aviso' + (error ? ' error' : ''); clearTimeout(a._t); a._t = setTimeout(() => a.classList.add('oculto'), error ? 6000 : 3000); }
function errorDe(e) { return (e && (e.message || e.error_description || e.hint)) || String(e); }
function modal(html, clase = '') { const m = $('#modal'); m.innerHTML = `<div class="caja ${clase}">${html}</div>`; m.classList.remove('oculto'); m.onclick = ev => { if (ev.target === m) cerrarModal(); }; return m; }
function cerrarModal() { $('#modal').classList.add('oculto'); $('#modal').innerHTML = ''; }
function chip(t) {
  const cls = t.startsWith('URGENTE') || t === 'ENTREGA HOY' ? 'urgente' : t === 'ENTREGA MAÑANA' ? 'prop' : t === 'CONFIRMADO' ? 'ok' : t.startsWith('ATRASADO') ? 'atrasado' : t.startsWith('SALDO') ? 'saldo' : t.startsWith('PAGO') ? 'pago' : t.startsWith('INSTAL') ? 'inst' : t.startsWith('A MEDIDA') ? 'medida' : t.startsWith('PROPUESTO') ? 'prop' : /^(RETIRO|VISITA|ENTREGA|INSTALACIÓN|OTRO) /.test(t) ? 'inst' : '';
  return `<span class="chip ${cls}">${esc(t)}</span>`;
}
/* Códigos cortos para la Lista (Harold 12-oct-2026: columnas acotadas). El nombre completo va en el title (pasar el mouse). */
const COD_ESTADO = { 'POR FABRICAR': 'POR FAB', 'VISITA TÉCNICA': 'VIS TEC', 'DIBUJO 3D': 'DIB 3D', 'DISEÑO APROBADO': 'DIS APR', 'EN FABRICACIÓN': 'EN FAB', 'LISTO EN TALLER': 'LISTO T', 'DESPACHO PROGRAMADO': 'DESP PR', 'ENTREGADO': 'ENTREG', 'CANCELADO': 'CANCEL', 'DEVUELTO': 'DEVUEL' };  // opción B, Harold 12-oct
const COD_TIPO = { 'Venta catálogo': 'CATAL', 'Mesa a medida': 'MESA.M', 'Mueble a medida': 'MUEB.M', 'Proyecto': 'PROY', 'Postventa': 'POSTV', 'Repuesto': 'REPU' };
const A_MEDIDA = ['Mesa a medida', 'Mueble a medida', 'Proyecto'];  // opción A, Harold 12-oct
const NOMBRE_TIPO = { 'Mueble a medida': 'Mueble a medida (pieza suelta: repisa, sofá modular, poste)', 'Proyecto': 'Proyecto a medida (cocina, clóset, mueble de muro; antes en VENTAS_Proyectos_medida.xlsx)' };
const COD_MATERIAL = { TRAVERTINO: 'TRAV', 'ROB.HUALLE': 'ROB.H', 'ROB.US': 'ROB.US', MELAMINA: 'MEL', 'PINO OREGON': 'P.OREG', CARVALLO: 'CARV', NEOLITH: 'NEOL', ENCINA: 'ENC', CUARZO: 'CUARZ' };
const codigoDe = (tipo, c) => ((cache.codigos || {})[tipo] || {})[String(c || '').toUpperCase()];
const codMaterial = m => m ? ((codigoDe('material', m) || {}).abreviatura || COD_MATERIAL[m] || m) : '';  // tabla codigo manda
const ES_VIDRIO = m => ['V.T', 'V.C'].includes(m);
const NO_MADERA = ['V.T', 'V.C', 'TRAVERTINO', 'NEOLITH', 'CUARZO', 'MELAMINA', 'RATAN', 'METAL', 'FIERRO', 'ACERO', 'MDF', 'ENCHAPADO'];
const ES_MADERA = m => !!m && (codigoDe('material', m) ? codigoDe('material', m).es_madera : !NO_MADERA.includes(String(m).toUpperCase()));
/* Base de madera cuando la línea no trae material propio: la misma madera de la cubierta, salvo los modelos que en NEGRO
   llevan otra base (tabla modelo.base_negro, fuente motor_precios.js: Gonqui y Trama = pino pintado). */
function maderaBase(cub, base) {
  const mod = base.modelo_base || cub.modelo_base || cub.modelo_cubierta; const col = String(base.color || cub.color || '').toUpperCase();
  const bn = (cache.modelosBaseNegro || {})[mod]; if (bn && col.startsWith('NGR')) return bn;
  return ES_MADERA(cub.material_cubierta) ? codMaterial(cub.material_cubierta) : '';
}
const TONOS_VIDRIO = ['INCOLORO', 'HUMO', 'BRONCE', 'ESPEJADO'];   // solo en proyectos; el vidrio de catálogo es incoloro y no lleva tono (Harold 12-oct)
/* Tipo de base. REGLA (Harold 12-oct-2026, error grave corregido): NUNCA deducir "metal" por el color de la estructura.
   Un color NGR puede ser pino pintado (Gonqui). La fuente es material_base de la línea y, si falta, el área de taller
   del modelo en la tabla modelo: primero modelo.material_base (Montecarlo = ENCHAPADO, aunque su base la fabrica el carpintero,
   Harold 12-oct) y si no, el área (Soldadura = metal, Carpintería = madera, Armado muebles = MDF enchapado). Sin dato = vacío. */
async function cargarModelos() {
  if (cache.modelos) return;
  const { data: cods } = await sb.from('codigo').select('*');
  cache.codigos = { material: {}, color: {}, cuenta: {} }; (cods || []).forEach(c => { (cache.codigos[c.tipo] = cache.codigos[c.tipo] || {})[c.codigo] = c; });  // 'cuenta' = a qué cuenta abona el cliente (0033)
  const { data } = await sb.from('modelo').select('codigo,nombre,area_base,bultos,base_negro,material_base');
  cache.modelos = Object.fromEntries((data || []).map(m => [m.codigo, m.area_base]));
  cache.modelosBultos = Object.fromEntries((data || []).map(m => [m.codigo, m.bultos]));
  cache.modelosBaseNegro = Object.fromEntries((data || []).filter(m => m.base_negro).map(m => [m.codigo, m.base_negro]));
  cache.modelosNombre = Object.fromEntries((data || []).map(m => [m.codigo, m.nombre]));  // nombre del modelo desde la tabla, no desde el código
  cache.modelosMaterialBase = Object.fromEntries((data || []).filter(m => m.material_base).map(m => [m.codigo, m.material_base]));  // Montecarlo = ENCHAPADO aunque la haga el carpintero (Harold 12-oct)
}
function tipoBase(cub, base) {
  const mb = base.material_base || cub.material_base;
  if (mb) return ES_VIDRIO(mb) ? 'VIDRIO' : ['METAL', 'FIERRO', 'ACERO'].includes(mb) ? 'METAL' : ['MELAMINA', 'MDF', 'TABLERO', 'ENCHAPADO'].includes(mb) ? 'ENCHAPADO' : 'MADERA';
  const mod = base.modelo_base || cub.modelo_base || cub.modelo_cubierta;
  const mm = (cache.modelosMaterialBase || {})[mod]; if (mm) return ['MELAMINA', 'MDF', 'TABLERO', 'ENCHAPADO'].includes(mm) ? 'ENCHAPADO' : ['METAL', 'FIERRO', 'ACERO'].includes(mm) ? 'METAL' : 'MADERA';
  const area = (cache.modelos || {})[mod];
  return area === 'Soldadura' ? 'METAL' : area === 'Carpintería' ? 'MADERA' : area === 'Armado muebles' ? 'ENCHAPADO' : '';  // ENCHAPADO = MDF enchapado (Montecarlo), Harold 12-oct
}
function estadoHtml(e, corto) { return `<span class="estado e-${e.replace(/ /g, '_')}" title="${esc(e)}">${esc(corto ? (COD_ESTADO[e] || e) : e)}</span>`; }
function tipoHtml(t) { return `<span class="cod" title="${esc(NOMBRE_TIPO[t] || t)}">${esc(COD_TIPO[t] || t)}</span>`; }
function rasgos(p) {
  const pz = p.piezas || [];
  // Pieza principal: cubierta, mesa, mueble o repuesto; si no hay, la banca; si no, el servicio (retapizado, instalación). Nunca tratar una banca como "sillas".
  const base = pz.find(x => x.tipo === 'Base') || {};
  const cubReal = pz.find(x => ['Cubierta', 'Mesa', 'Mueble', 'Repuesto'].includes(x.tipo));
  // Solo bases o solo cubierta (Harold 12-oct, Francisco Martínez): se avisa bajo el modelo, para cualquier modelo
  const parcial = base.tipo && !cubReal ? 'solo bases' : cubReal && ['Cubierta', 'Mesa'].includes(cubReal.tipo) && !base.tipo && cubReal.tipo === 'Cubierta' ? 'solo cubierta' : '';
  const cub = cubReal || (base.tipo ? base : null) || pz.find(x => x.tipo === 'Banca') || pz.find(x => x.tipo === 'Servicio') || {};
  const sil = pz.find(x => x.tipo === 'Silla') || (cub.tipo !== 'Banca' ? pz.find(x => x.tipo === 'Banca') : null);
  const modelos = [cub.modelo_cubierta, base.modelo_base].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i);
  // Modelo a la vista siempre (Harold 12-oct): catálogo = código; especial = ESPECIAL más el inicio de la descripción;
  // pedido solo de sillas = código de la silla (WISH, CROSS, S.SANTINO), aunque se repita en la columna Sillas.
  let modeloTxt = modelos.join(' + ');
  const sinMedidas = t => (t || '').replace(/\d+([.,]\d+)?\s*[xX×]\s*\d+([.,]\d+)?(\s*[xX×]\s*\d+([.,]\d+)?)?\s*(cm)?/g, '').replace(/\b(cm|diam|radio)\b/gi, '').replace(/[·,\s]+/g, ' ').trim();
  if (modeloTxt === 'ESPECIAL' || modeloTxt === 'ESPECIAL + ESPECIAL') modeloTxt = aMedidaTxt(cub) || aMedidaTxt(base) || (cub.tipo === 'Banca' ? 'BANCA ESPECIAL' : cub.tipo === 'Mueble' ? 'MUEBLE ESPECIAL' : 'ESPECIAL');  // sin redundar: material, medidas y tono van en sus columnas (Harold 12-oct)
  else if (cub.tipo === 'Banca' && !modeloTxt) modeloTxt = 'BANCA';
  if (!modeloTxt && !cub.tipo && sil) modeloTxt = sil.tipo_silla || 'Sillas';
  if (!modeloTxt) modeloTxt = sinMedidas(cub.descripcion).slice(0, 28);
  return {
    modelo: ((cub.cantidad || 1) > 1 ? cub.cantidad + ' x ' : '') + modeloTxt, parcial, descripcion: cub.descripcion || '',
    color: cub.color || base.color || '-', pers: cub.personas || '-', forma: cub.forma || '-',
    cubierta: cub.material_cubierta || '-', base: base.material_base || '-', esp: cub.espesor_mm || '-',
    // Dos líneas por celda: material arriba, color o tono abajo (Harold 12-oct: distinguir color de base y de cubierta)
    cubierta2: [parcial === 'solo bases' ? '-' : codMaterial(cub.material_cubierta) || '-', !cub.tono ? '' : ES_VIDRIO(cub.material_cubierta) ? (TONOS_VIDRIO.includes(String(cub.tono).toUpperCase()) ? cub.tono : '') : tonoTxt(cub.tono), cub.tipo !== 'Silla' && cub.color_silla ? 'tapiz ' + cub.color_silla : ''],
    baseTipo: tipoBase(cub, base),
    // Base de madera sin material propio: es la misma madera de la cubierta (Gonqui pino = base pino); solo si la cubierta no es madera queda "MADERA" (Harold 12-oct)
    base2: [codMaterial(base.material_base || cub.material_base) || (tipoBase(cub, base) === 'MADERA' ? (maderaBase(cub, base) || 'MADERA') : tipoBase(cub, base)) || '-', base.color || cub.color || '', ES_VIDRIO(cub.material_cubierta) && cub.tono && ['MADERA', 'ENCHAPADO'].includes(tipoBase(cub, base)) && !TONOS_VIDRIO.includes(String(cub.tono).toUpperCase()) ? tonoTxt(cub.tono) : ''],
    medida: medidaTxt(cub) || '-',
    tono: cub.tono || '-', sillas: sil ? `${sil.cantidad} ${sil.tipo_silla || ''} ${sil.color_silla || ''}`.trim() : '-',
    // Lista v2 (Harold 13-oct): columna Sillas propia, "8 × Santino" y debajo "Cueromix beige · pata NGR"; piezas extra (otros muebles, bancas) para la celda Cubierta / pieza
    sil, cub, base, extras: pz.filter(x => x.area && x !== cub && x !== base && x !== sil),
    sillasL1: sil ? `${sil.cantidad} × ${NOMBRE_SILLA[sil.tipo_silla] || sil.tipo_silla || 'por definir'}` : '',
    sillasL2: sil ? [sil.tapiz ? sil.tapiz + (sil.color_silla ? ' ' + sil.color_silla : '') : (sil.color_silla ? 'tapiz ' + sil.color_silla : 'tapiz por definir'), sil.color ? 'pata ' + sil.color : ''].filter(Boolean).join(' · ') : '',
    entrega: (p.tipo_entrega === 'Despacho regiones' ? 'REG' : p.tipo_entrega === 'Retiro en taller' ? 'Retiro' : 'RM') + (p.instalacion ? ' + INS' : ''),
  };
}
const NOMBRE_SILLA = { 'S.SANTINO': 'Santino', WISH: 'Wish', CROSS: 'Cross', TULIP: 'Tulip', WIND: 'Windsor' };
// Nombre abreviado para la columna Cliente (Harold 13-oct: ancho estándar, el completo en el despliegue y la ficha)
function abrev(n) { n = (n || '').trim(); if (n.length <= 22) return n; const t = n.split(/\s+/); const empresa = /spa|ltda|eirl|s\.a\.|inmobiliaria|estudio|sociedad|empresa|constructora|comercial/i.test(n); if (empresa || t.length < 3) return n.slice(0, 21) + '…'; const corto = t[0] + ' ' + t[t.length >= 4 ? 2 : 1]; return corto.length > 22 ? corto.slice(0, 21) + '…' : corto; }
/* Etapa por pieza (Harold 12-oct): cada pieza avanza por las etapas de su área (carpintería: En cola → Fabricación → Barniz → Por embalar → Embalado (Por embalar desde el 19-oct, migración 0055); "En cola" = cola de producción, Harold 13-oct;
   soldadura: → Soldadura → Pintura → Embalado; compras: Por pedir → Pedido → Recibido → Embalado...). Un toque avanza; clic derecho
   o mantener apretado vuelve atrás. Embalado = pieza lista. Las etapas las define la base (privado.etapas_de). */
/* Medida de una pieza; las extensibles muestran el largo abierta: "130 x 90 a 180 ext" (Harold 13-oct, Sandra W3149) */
const medidaTxt = (x, sep = ' x ', cm = '') => !x.largo_cm ? '' : `${num(x.largo_cm)}${sep}${num(x.ancho_cm)}${x.alto_cm ? sep + num(x.alto_cm) : ''}${x.largo_ext_cm ? ` a ${num(x.largo_ext_cm)}` : ''}${cm}${x.largo_ext_cm ? ' ext' : ''}`;
function etapaChip(x, pedidoId) {
  const et = x.etapas || []; const devuelta = x.etapa === 'Devuelta al proveedor'; const i = et.indexOf(x.etapa); const ultima = i >= 0 && i === et.length - 1;
  const cls = devuelta ? 'devuelta' : ultima ? 'lista' : i > 0 ? 'proceso' : '';
  const sig = devuelta ? et[2] : !ultima ? et[i + 1] : null;   // devuelta al proveedor: tocar = volvió conforme (Recibido)
  const faltaAcabado = x.area && x.area !== 'Vidrio/compras' && x.area !== 'Barniz' && !x.acabado;
  return `<button class="etapa-chip ${cls}${faltaAcabado ? ' falta-acabado' : ''}" data-etapa="${x.id}" data-pedido="${pedidoId}" title="${esc((x.descripcion || '') + (x.area ? ' · ' + x.area : ''))}. ${devuelta ? 'Está en el proveedor. Toca: volvió conforme (Recibido).' : sig ? 'Toca: pasa a ' + esc(sig) + '.' : 'Pieza lista.'} Clic derecho o mantener apretado: vuelve atrás.">${esc(x.tipo === 'Servicio' ? 'Instalación' : x.tipo)}${x.cantidad > 1 ? ' ×' + x.cantidad : ''}<small>${esc(x.etapa || et[0] || '')}${ultima ? ' ✓' : ''}${faltaAcabado ? ' · ¿acabado?' : ''}</small></button>`;
}
function etapasHtml(p) { return `<div class="etapas">${(p.piezas || []).filter(x => x.area).map(x => etapaChip(x, p.id)).join('')}</div>`; }
function piezasHtml(p) {
  const pz = (p.piezas || []).filter(x => x.area);
  if (!pz.length) return '';
  return `<div class="piezas-caja"><div class="piezas-titulo">Piezas (${pz.length}) · toca una para pasarla a la etapa siguiente · clic derecho o mantener apretado para volver · el acabado define si pasa por Barniz o Pintura</div>
    <table class="piezas-tabla"><tbody>${pz.map(x => `<tr>
      <td>${etapaChip(x, p.id)}</td>
      <td>${esc(x.descripcion || '')}${x.color || x.tono ? ` <span class="gris">· ${esc([x.color ? 'base ' + x.color : null, x.tono ? tonoTxt(x.tono) : null].filter(Boolean).join(' · '))}</span>` : ''}</td>
      <td class="nw gris">${esc(x.area === 'Vidrio/compras' ? 'compra a proveedor' : x.area)}</td>
      <td>${acabadoHtml(x)}</td>
      ${yo.rol === 'admin' ? `<td><button class="btn chico borde" data-editar-pieza="${x.id}" title="Cambiar tipo, descripción, área o acabado, o borrar la pieza">Editar</button></td>` : ''}
    </tr>`).join('')}</tbody></table></div>`;
}
function activarEtapas(raiz, despues) {
  $$('[data-etapa]', raiz).forEach(b => {
    let timer = null, largo = false;
    const mover = async atras => {
      try {
        const lid = Number(b.dataset.etapa);
        const p0 = cache.pedidos.find(x => x.id === Number(b.dataset.pedido)); const x0 = p0 && (p0.piezas || []).find(y => y.id === lid);
        const antes = x0 ? x0.etapa : null;
        const r = await rpc('avanzar_etapa', { p_linea_id: lid, p_atras: atras });
        const p = cache.pedidos.find(x => x.id === r.pedido_id);
        if (p) { p.piezas = r.piezas; p.estado = r.estado; p.piezas_listas = r.piezas.filter(x => x.area && x.estado === 'Lista').length; }
        if (r.todas_listas) aviso('Todas las piezas embaladas: se puede marcar LISTO EN TALLER');
        if (despues) await despues(r);
        // Deshacer también para las piezas (Harold 13-oct: en ODT la pieza desaparece de la lista al avanzar): vuelve un paso atrás
        const x1 = (r.piezas || []).find(y => y.id === lid);
        if (x1 && antes && x1.etapa !== antes) anotarCambio(`${p ? p.numero + ' ' : ''}${x1.tipo} ${x1.etapa} (volver a ${antes})`, async () => { await rpc('avanzar_etapa', { p_linea_id: lid, p_atras: !atras }); });
      } catch (e) { aviso(errorDe(e), true); }
    };
    b.onclick = ev => { ev.stopPropagation(); if (largo) { largo = false; return; } mover(false); };
    b.oncontextmenu = ev => { ev.preventDefault(); ev.stopPropagation(); mover(true); };
    b.ontouchstart = () => { largo = false; timer = setTimeout(() => { largo = true; mover(true); }, 600); };
    b.ontouchend = b.ontouchcancel = () => clearTimeout(timer);
  });
}
/* Acabado por pieza (Harold 12-oct, tanda 19): define si la pieza pasa por Barniz o Pintura. Solo se barniza la madera, lo pintado/lacado
   y la encina; el metal va a Pintura; "sin barniz", melamina y tapicería no tienen acabado; lo comprado a proveedor no lleva acabado.
   Sin dato queda "por definir" en rojo y la pieza no se puede embalar: nunca se supone. */
const ACABADOS = ['Barniz', 'Pintura', 'Sin acabado'];
const AREAS_TALLER = ['Carpintería', 'Soldadura', 'Armado muebles', 'Vidrio/compras', 'Barniz'];
/* Cómo se graba una mesa (Harold 20-oct, Pablo Vergara W3148): la pieza la define cómo se fabrica. Cubierta y base por separado = 2 piezas;
   un solo cuerpo ensamblado del mismo espesor = 1 pieza Mueble con su tipo de mueble (Mesa de centro). Elegir Mesa la divide en cubierta + base. */
const TXT_TIPO_PIEZA = { Mesa: 'Mesa (se divide en cubierta + base)', Mueble: 'Mueble o pieza única (un solo cuerpo)' };
const TIPOS_LINEA = ['Mesa', 'Base', 'Cubierta', 'Silla', 'Banca', 'Mueble', 'Servicio', 'Repuesto', 'Embalaje', 'Barniz'];
/* Tipo de mueble de la pieza (Harold 20-oct, Pablo Vergara W3148): con modelo ESPECIAL se muestra "<tipo> a medida", nunca "ESPECIAL" ni "solo bases" */
const TIPOS_MUEBLE = ['Mesa de comedor', 'Mesa de centro', 'Mesa lateral', 'Mesa de bar', 'Mesa de terraza', 'Escritorio', 'Consola', 'Velador', 'Banca', 'Pedestal', 'Rack TV', 'Closet', 'Cocina', 'Mueble de baño', 'Repisa', 'Otro mueble'];
/* Madera y espesor en Editar pieza (Harold 20-oct): espesores sacados de los usados en los pedidos reales, por grupo de material; "Otro…" para un valor distinto */
const GRUPOS_MATERIAL = [['Madera', ['LENGA', 'PINO', 'ROB.US', 'ROB.HUALLE', 'ENCINA', 'HAYA', 'CARVALLO', 'PINO OREGON', 'KIRI']], ['Tablero', ['ENCHAPADO', 'MDF', 'MELAMINA']], ['Vidrio y piedra', ['V.T', 'V.C', 'TRAVERTINO', 'CUARZO', 'NEOLITH']], ['Otro', ['METAL', 'RATAN']]];
const ESPESORES = { Madera: [18, 20, 22, 27, 32, 34, 35, 40, 50], Tablero: [15, 18], Vidrio: [12, 15, 19], Piedra: [20, 30, 40] };
const espesoresDe = m => { m = String(m || '').toUpperCase(); return ['V.T', 'V.C'].includes(m) ? ESPESORES.Vidrio : ['TRAVERTINO', 'CUARZO', 'NEOLITH'].includes(m) ? ESPESORES.Piedra : ['ENCHAPADO', 'MDF', 'MELAMINA'].includes(m) ? ESPESORES.Tablero : ESPESORES.Madera; };
const aMedidaTxt = x => x && x.tipo_mueble && (x.modelo_cubierta || x.modelo_base || 'ESPECIAL') === 'ESPECIAL' ? x.tipo_mueble + (x.largo_ext_cm || /extensible/i.test(x.descripcion || '') ? ' extensible' : '') + ' a medida' : '';  // Harold 20-oct: Ignacio W3137 es una mesa de comedor extensible
/* Detalle de una pieza a medida para la ODT y la ficha (Harold 20-oct: "en lista, pero detallar en ODT; esos siempre van con plano la mayoría de las veces"):
   la descripción sin medidas ("Especial en base a Origen", "Extensible redonda") y la marca de plano: "con plano" si el pedido tiene planos, "¿plano?" en rojo si no. En la Lista va solo el nombre corto. */
/* Enlace al plano (Harold 20-oct: "algo mejor hecho, quizás PLANOS OK con formato de link, subrayado"): mayúscula, negrita y subrayado */
const planoLinkHtml = p => p && p.planos ? `<a class="plano-ok" data-abrir-plano="${p.id}" title="Abrir el plano para imprimirlo">${p.planos > 1 ? 'PLANOS' : 'PLANO'} OK${p.planos > 1 ? ' (' + p.planos + ')' : ''}</a>` : '';
function detalleAMedidaHtml(x, p) {
  // Harold 20-oct: la pieza de un proyecto (ej. P26-018 Ulriksen, sin tipo de mueble) también muestra el enlace al plano si el pedido lo tiene
  if (!aMedidaTxt(x)) return planoLinkHtml(p);
  let d = (x.descripcion || '').replace(/\d+([.,]\d+)?\s*[xX×]\s*\d+([.,]\d+)?(\s*[xX×]\s*\d+([.,]\d+)?)?\s*(cm)?/g, '').replace(/^[\s·,]+|[\s·,]+$/g, '').trim();
  d = d.replace(/^(base|cubierta)\s+(de\s+)?/i, '');  // "Cubierta mesa de centro a medida" no repite el nombre
  if (d) d = d.charAt(0).toUpperCase() + d.slice(1);
  if (d && aMedidaTxt(x).toLowerCase().includes(d.toLowerCase())) d = '';
  const plano = p && p.planos ? planoLinkHtml(p) : '<span class="falta-dato">¿plano?</span>';
  return [d ? esc(d) : '', plano].filter(Boolean).join(' · ');
}
function acabadoHtml(x) {
  if (!x.area) return '';
  if (x.area === 'Vidrio/compras') return '<span class="gris">sin acabado (se compra)</span>';
  return `<select class="sel-acabado ${x.acabado ? '' : 'falta'}" data-acabado="${x.id}" title="Acabado: define si la pieza pasa por Barniz o Pintura">${x.acabado ? '' : '<option value="" selected>¿Acabado?</option>'}${ACABADOS.map(a => `<option ${a === x.acabado ? 'selected' : ''}>${a}</option>`).join('')}</select>`;
}
function actualizarPiezas(r) {
  const p = cache.pedidos.find(x => x.id === r.pedido_id); if (!p) return;
  p.piezas = r.piezas; p.piezas_total = r.piezas.filter(x => x.area).length; p.piezas_listas = r.piezas.filter(x => x.area && x.estado === 'Lista').length;
}
function activarPiezasEdicion(raiz, despues) {
  $$('[data-acabado]', raiz).forEach(s => {
    s.onclick = ev => ev.stopPropagation();
    s.onchange = async () => {
      try { const r = await rpc('editar_pieza', { p_linea_id: Number(s.dataset.acabado), p_cambios: { acabado: s.value || null } }); actualizarPiezas(r); aviso('Acabado: ' + (s.value || 'por definir')); despues && despues(r); }
      catch (e) { aviso(errorDe(e), true); }
    };
  });
  $$('[data-editar-pieza]', raiz).forEach(b => b.onclick = ev => { ev.stopPropagation(); formEditarPieza(Number(b.dataset.editarPieza), despues); });
  // Indicaciones del maestro editables con un clic en la celda (Harold 16-oct: "debería poder hacerlo desde acá o desde la ODT, solo clickear"):
  // Enter o salir de la celda guarda, Esc cancela; en el historial del pedido queda el cambio (editar_pieza).
  $$('[data-ind]', raiz).forEach(td => td.onclick = ev => {
    ev.stopPropagation(); if (td.querySelector('textarea')) return;
    const id = Number(td.dataset.ind), antesHtml = td.innerHTML, antes = (td.dataset.valor != null ? td.dataset.valor : td.textContent.replace(/^agregar…$/, '')).trim();
    td.innerHTML = `<textarea rows="2" style="width:100%;min-width:220px;font:inherit;padding:4px 6px">${esc(antes)}</textarea>`;
    const ta = td.querySelector('textarea'); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); ta.onclick = e => e.stopPropagation();
    let listo = false;
    const cerrar = () => { listo = true; td.innerHTML = antesHtml; };
    const guardar = async () => { if (listo) return; listo = true; const v = ta.value.trim(); if (v === antes) { td.innerHTML = antesHtml; return; }
      try { const r = await rpc('editar_pieza', { p_linea_id: id, p_cambios: { indicaciones: v || null } }); actualizarPiezas(r); aviso(v ? 'Indicaciones guardadas' : 'Indicaciones borradas');
        anotarCambio('indicaciones de la pieza (volver a lo anterior)', async () => { actualizarPiezas(await rpc('editar_pieza', { p_linea_id: id, p_cambios: { indicaciones: antes || null } })); }); despues && despues(r); }
      catch (e) { aviso(errorDe(e), true); td.innerHTML = antesHtml; } };
    ta.onkeydown = e => { if (e.key === 'Escape') { e.preventDefault(); cerrar(); } else if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); guardar(); } };
    ta.onblur = () => setTimeout(guardar, 150);
  });
}
/* Editar una pieza desde la app (Harold 12-oct: Capponi era un velador, no mesa de centro). Queda en el historial del pedido. */
function formEditarPieza(lineaId, despues) {
  const p = cache.pedidos.find(q => (q.piezas || []).some(y => y.id === lineaId)); if (!p) return;
  const x = p.piezas.find(y => y.id === lineaId);
  const esOp = yo.rol === 'operacion';
  const op = (lista, actual) => lista.map(v => `<option ${v === actual ? 'selected' : ''}>${esc(v)}</option>`).join('');
  const nv = v => v == null ? '' : String(Number(v));
  // Modelo de catálogo o "A medida" (ESPECIAL) más el tipo de mueble (Harold 20-oct, Pablo Vergara W3148); no aplica a sillas ni servicios
  const conModelo = !['Silla', 'Servicio', 'Embalaje', 'Barniz'].includes(x.tipo);
  const modActual = (x.tipo === 'Base' ? x.modelo_base || x.modelo_cubierta : x.modelo_cubierta || x.modelo_base) || '';
  const modelosOp = Object.entries(cache.modelosNombre || {}).filter(([c]) => !['CROSS', 'S.SANTINO', 'WIND', 'WISH'].includes(c)).sort((a, b) => a[1].localeCompare(b[1], 'es'));
  if (modActual && modActual !== 'ESPECIAL' && !modelosOp.some(([c]) => c === modActual)) modelosOp.push([modActual, modActual]);
  const tiposMueble = x.tipo_mueble && !TIPOS_MUEBLE.includes(x.tipo_mueble) ? [...TIPOS_MUEBLE, x.tipo_mueble] : TIPOS_MUEBLE;
  // Madera: la base guarda material_base; cubierta, mesa, mueble y banca guardan material_cubierta (Harold 20-oct)
  const matActual = (x.tipo === 'Base' ? x.material_base || x.material_cubierta : x.material_cubierta || x.material_base) || '';
  const codsMat = Object.keys((cache.codigos || {}).material || {});
  const gruposMat = GRUPOS_MATERIAL.map(([g, l]) => [g, l.filter(c => codsMat.includes(c) || c === matActual)]).concat([['Otros', codsMat.filter(c => !GRUPOS_MATERIAL.some(([, l]) => l.includes(c)))]]).filter(([, l]) => l.length);
  if (matActual && !gruposMat.some(([, l]) => l.includes(matActual))) gruposMat.push(['Actual', [matActual]]);
  const nomMat = c => { const n = ((cache.codigos || {}).material || {})[c] ? cache.codigos.material[c].nombre : c; return n.charAt(0).toUpperCase() + n.slice(1); };
  const opcEsp = (m, actual) => { const l = [...espesoresDe(m)]; if (actual && !l.includes(Number(actual))) l.push(Number(actual)); l.sort((a, b) => a - b); return `<option value="">-</option>${l.map(v => `<option value="${v}" ${Number(actual) === v ? 'selected' : ''}>${v} mm</option>`).join('')}<option value="otro">Otro…</option>`; };
  modal(`<h2>Editar pieza · ${esc(p.numero)} ${esc(p.cliente)}</h2><form id="f-pz"><div class="campos">
    ${esOp ? '' : `<label class="campo">Tipo de pieza <select name="tipo_linea">${TIPOS_LINEA.map(v => `<option value="${v}" ${v === x.tipo ? 'selected' : ''}>${esc(TXT_TIPO_PIEZA[v] || v)}</option>`).join('')}</select></label>
    <label class="campo">Cantidad <input name="cantidad" inputmode="numeric" value="${x.cantidad || 1}" style="width:70px"></label>
    ${conModelo ? `<label class="campo">Modelo <select name="modelo"><option value="">(sin modelo)</option><option value="ESPECIAL" ${modActual === 'ESPECIAL' ? 'selected' : ''}>A medida</option>${modelosOp.map(([c, n]) => `<option value="${esc(c)}" ${c === modActual ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>
    <label class="campo">Tipo de mueble <select name="tipo_mueble"><option value="">(sin definir)</option>${op(tiposMueble, x.tipo_mueble)}</select></label>` : ''}
    <label class="campo">Descripción <input name="descripcion" value="${esc(x.descripcion || '')}"></label>
    <label class="campo">Dónde se hace <select name="area_taller"><option value="">(no pasa por el taller)</option>${AREAS_TALLER.map(a => `<option value="${esc(a)}" ${a === x.area ? 'selected' : ''}>${esc(a === 'Vidrio/compras' ? 'Compra a proveedor (vidrio, sillas, sofás)' : a)}</option>`).join('')}</select></label>`}
    <label class="campo">Acabado <select name="acabado"><option value="">Por definir</option>${op(ACABADOS, x.acabado)}</select></label>
    <label class="campo">Fecha comprometida para el maestro <input type="date" name="fecha_taller" value="${x.fecha_taller || ''}"></label></div>
    ${esOp ? '' : `<div class="campos">
    <label class="campo">Largo cm <input name="largo_cm" inputmode="decimal" value="${nv(x.largo_cm)}"></label>
    <label class="campo">Ancho cm <input name="ancho_cm" inputmode="decimal" value="${nv(x.ancho_cm)}"></label>
    <label class="campo">Alto cm <input name="alto_cm" inputmode="decimal" value="${nv(x.alto_cm)}"></label>
    ${conModelo ? `<label class="campo">Madera / material <select name="material"><option value="">Por definir</option>${gruposMat.map(([g, l]) => `<optgroup label="${esc(g)}">${l.map(c => `<option value="${esc(c)}" ${c === matActual ? 'selected' : ''}>${esc(nomMat(c))}</option>`).join('')}</optgroup>`).join('')}</select></label>` : ''}
    <label class="campo">Espesor ${x.tipo === 'Cubierta' ? '(de la cubierta)' : x.tipo === 'Base' ? '(de la pata o tablero de la base)' : '(del tablero del mueble)'} <select name="espesor_mm">${opcEsp(matActual, x.espesor_mm)}</select></label>
    <label class="campo">Forma <select name="forma"><option value="">-</option>${op(['RECT', 'CUA', 'CIRC', 'OVAL'], x.forma)}</select></label></div>`}
    ${x.tipo === 'Silla' || x.tipo === 'Banca' ? `<div class="campos"><label class="campo">Modelo de silla <input name="tipo_silla" value="${esc(x.tipo_silla || '')}" placeholder="TULIP, WISH, CROSS, S.SANTINO" ${esOp ? 'disabled' : ''}></label><label class="campo">Tapiz (material) <input name="tapiz" value="${esc(x.tapiz || '')}" placeholder="Cueromix, Velvet, Lino"></label><label class="campo">Color silla o del tapiz <input name="color_silla" value="${esc(x.color_silla || '')}" placeholder="NGR, BL, BEIGE"></label></div>` : ''}
    <label class="campo" style="display:block;margin-top:8px">Medidas escritas para el maestro (manda sobre largo × ancho × alto; ej. "cruz arriba 40, cruz abajo 60, alto 71" o "Plano por definir") <input name="medida_texto" style="width:100%" value="${esc(x.medida_texto || '')}"></label>
    <label class="campo" style="display:block;margin-top:8px">Indicaciones del maestro (requerimientos especiales: radio, bisel, cabezales, plano impreso, madera clara...) <textarea name="indicaciones" rows="2" style="width:100%">${esc(x.indicaciones || '')}</textarea></label>
    <p style="font-size:12px;color:var(--gris-2);margin:6px 0">Barniz: madera, pintado o lacado, encina. Pintura: metal. Sin acabado: sin barniz, melamina, tapicería. Lo comprado a proveedor solo se pide, se recibe y se embala. Medidas de una base: largo × ancho × alto. Un mueble de un solo cuerpo (cajón, velador, repisa, o una mesa ensamblada en una sola pieza del mismo espesor) es UNA pieza: Mueble o pieza única, con su tipo de mueble. Si la cubierta y la base se hacen por separado, elige Mesa (se divide sola en cubierta + base) o agrega las dos piezas desde la ficha.</p>
    <div class="acciones">${esOp ? '' : '<button type="button" class="btn borde" id="b-borrar-pz" style="margin-right:auto;color:var(--rojo-txt)">Borrar pieza</button>'}<button type="button" class="btn" onclick="cerrarModal()">Cancelar</button><button class="btn primario">Guardar</button></div></form>`);
  const selMat = $('#f-pz [name=material]'), selEsp = $('#f-pz [name=espesor_mm]');
  if (selEsp) {
    if (selMat) selMat.onchange = () => { const v = selEsp.value; selEsp.innerHTML = opcEsp(selMat.value, v === 'otro' ? '' : v); };
    selEsp.onchange = () => { if (selEsp.value !== 'otro') return; const v = (prompt('Espesor en mm') || '').replace(',', '.').trim();
      selEsp.innerHTML = opcEsp(selMat ? selMat.value : matActual, Number(v) > 0 ? v : x.espesor_mm); };
  }
  $('#f-pz').onsubmit = async ev => {
    ev.preventDefault(); const f = new FormData(ev.target);
    const cambios = esOp
      ? { acabado: f.get('acabado') || null, fecha_taller: f.get('fecha_taller') || null, indicaciones: f.get('indicaciones'), medida_texto: f.get('medida_texto'), ...(f.has('tapiz') ? { tapiz: f.get('tapiz'), color_silla: f.get('color_silla') } : {}) }
      : { tipo_linea: f.get('tipo_linea'), descripcion: f.get('descripcion'), area_taller: f.get('area_taller') || null, acabado: f.get('area_taller') === 'Vidrio/compras' ? null : (f.get('acabado') || null),
          fecha_taller: f.get('fecha_taller') || null, indicaciones: f.get('indicaciones'), medida_texto: f.get('medida_texto'), ...(f.has('tapiz') ? { tipo_silla: f.get('tipo_silla'), tapiz: f.get('tapiz'), color_silla: f.get('color_silla') } : {}), largo_cm: f.get('largo_cm').replace(',', '.'), ancho_cm: f.get('ancho_cm').replace(',', '.'), alto_cm: f.get('alto_cm').replace(',', '.'), espesor_mm: f.get('espesor_mm').replace(',', '.'), forma: f.get('forma') || null };
    if (!esOp && f.has('modelo')) {
      const m = f.get('modelo');
      if (m !== modActual) Object.assign(cambios, x.tipo === 'Base' ? { modelo_base: m } : { modelo_cubierta: m, modelo_base: m });
      if ((f.get('tipo_mueble') || '') !== (x.tipo_mueble || '')) cambios.tipo_mueble = f.get('tipo_mueble');
    }
    if (!esOp && f.has('cantidad') && Number(f.get('cantidad')) !== (x.cantidad || 1)) cambios.cantidad = f.get('cantidad').trim();
    if (!esOp && f.has('material') && (f.get('material') || '') !== matActual) {
      const m = f.get('material');
      if (x.tipo === 'Base') cambios.material_base = m;
      else { cambios.material_cubierta = m; if (aMedidaTxt(x) && ['Mesa', 'Mueble', 'Banca'].includes(x.tipo)) cambios.material_base = m; }  // pieza a medida de un solo cuerpo: misma madera en la columna Base de la Lista
    }
    try { const r = await rpc('editar_pieza', { p_linea_id: lineaId, p_cambios: cambios }); actualizarPiezas(r); aviso('Pieza guardada'); cerrarModal(); despues && despues(r); } catch (e) { aviso(errorDe(e), true); }
  };
  if (!esOp) $('#b-borrar-pz').onclick = async () => {
    if (!confirm(`¿Borrar la pieza "${x.tipo} ${x.descripcion || ''}" de ${p.numero}? Queda anotado en el historial.`)) return;
    try { const r = await rpc('editar_pieza', { p_linea_id: lineaId, p_cambios: {}, p_borrar: true }); actualizarPiezas(r); aviso('Pieza borrada'); cerrarModal(); despues && despues(r); } catch (e) { aviso(errorDe(e), true); }
  };
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
  // Tanda 36 (seguridad): si el usuario activó la verificación en dos pasos, la base no entrega nada hasta que la sesión sea aal2.
  if (yo && yo.requiere_2fa) return pantallaCodigo2FA();
  if (!yo) { app.innerHTML = `<div class="login"><h1>Sin perfil</h1><p>Tu usuario entró, pero no tiene un rol asignado. Pídele a Harold que te active.</p><button class="btn" id="salir">Salir</button></div>`; $('#salir').onclick = salir; return; }
  document.body.classList.toggle('tablet', yo.rol === 'operacion');
  // Harold 12-oct (tanda 20): la app se usa en horizontal, también en el celular. Android lo respeta al instalarla; iPhone no deja bloquearla (queda el aviso de girar).
  try { if (matchMedia('(display-mode: standalone)').matches && screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {}); } catch (e) { /* navegador sin soporte */ }
  if (!location.hash || location.hash === '#/') location.hash = yo.rol === 'operacion' ? '#/taller' : '#/lista';
  render(); if (!window.__vigilando) { window.__vigilando = true; vigilarVersion(); }
}
function pantallaLogin() {
  document.body.classList.remove('tablet');
  app.innerHTML = `<form class="login" id="f-login">
    <img src="logo.png" alt="Santino Design" class="logo-login"><h1 style="font-size:16px;color:var(--gris-2);font-weight:600">Pedidos</h1>
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
/* ---------- verificación en dos pasos (TOTP) · tanda 36 ---------- */
async function pantallaCodigo2FA() {
  document.body.classList.remove('tablet');
  const { data: fac } = await sb.auth.mfa.listFactors(); const f = fac && fac.totp && fac.totp.find(x => x.status === 'verified');
  if (!f) { app.innerHTML = `<div class="login"><h1>Falta el segundo paso</h1><p>Tu cuenta exige verificación en dos pasos pero no encuentro el factor. Pídele a Harold que lo revise.</p><button class="btn" id="salir">Salir</button></div>`; $('#salir').onclick = salir; return; }
  app.innerHTML = `<form class="login" id="f-2fa"><img src="logo.png" alt="Santino Design" class="logo-login"><h1 style="font-size:16px;color:var(--gris-2);font-weight:600">Código de verificación</h1>
    <div style="font-size:13px;color:var(--gris-2)">Abre tu app de códigos (Google Authenticator, Authy, 1Password) y escribe los 6 dígitos.</div>
    <label>Código <input name="code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" required autocomplete="one-time-code" autofocus></label>
    <button class="btn primario" type="submit">Entrar</button><button class="btn" type="button" id="salir">Salir</button></form>`;
  $('#salir').onclick = salir;
  $('#f-2fa').onsubmit = async ev => {
    ev.preventDefault(); const code = new FormData(ev.target).get('code').trim();
    const { data: ch, error: e1 } = await sb.auth.mfa.challenge({ factorId: f.id }); if (e1) return aviso(errorDe(e1), true);
    const { error: e2 } = await sb.auth.mfa.verify({ factorId: f.id, challengeId: ch.id, code }); if (e2) return aviso('Código incorrecto o vencido', true);
    iniciar();
  };
}
async function menuUsuario() {
  const { data: fac } = await sb.auth.mfa.listFactors(); const activo = fac && fac.totp && fac.totp.find(x => x.status === 'verified');
  const m = modal(`<h2>${esc(yo.nombre)} · ${esc(yo.rol)}</h2>
    <div class="seccion" style="padding:12px"><b>Verificación en dos pasos</b><div class="gris" style="font-size:13px">${activo ? 'Activa. Al entrar, además de la clave, la app pide el código de tu teléfono. Sin el código la base no entrega ningún dato.' : 'Inactiva. Con ella, aunque alguien tenga tu clave no puede entrar sin el código de tu teléfono. Recomendado para Harold.'}</div>
      <div class="acciones" style="justify-content:flex-start">${activo ? '<button class="btn peligro" id="u-quitar">Desactivar</button>' : '<button class="btn primario" id="u-activar">Activar ahora</button>'}</div></div>
    <div class="acciones"><button class="btn" id="u-salir">Salir de la app</button><button class="btn" onclick="cerrarModal()">Cerrar</button></div>`);
  $('#u-salir', m).onclick = () => { cerrarModal(); salir(); };
  const act = $('#u-activar', m); if (act) act.onclick = () => activar2FA().catch(e => aviso(errorDe(e), true));
  const qui = $('#u-quitar', m); if (qui) qui.onclick = async () => { if (!confirm('¿Desactivar la verificación en dos pasos? La cuenta queda protegida solo por la clave.')) return; const { error } = await sb.auth.mfa.unenroll({ factorId: activo.id }); if (error) return aviso(errorDe(error), true); aviso('Verificación en dos pasos desactivada'); cerrarModal(); };
}
async function activar2FA() {
  const { data: fac } = await sb.auth.mfa.listFactors();
  for (const x of (fac && fac.totp) || []) if (x.status !== 'verified') await sb.auth.mfa.unenroll({ factorId: x.id });   // intentos a medias
  const { data, error } = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Santino Pedidos' }); if (error) throw error;
  const m = modal(`<h2>Activar verificación en dos pasos</h2>
    <ol style="margin:0;padding-left:18px;font-size:13px;line-height:1.6"><li>Instala una app de códigos en el teléfono (Google Authenticator, Authy o 1Password).</li><li>Escanea este código QR con ella.</li><li>Escribe abajo los 6 dígitos que muestra.</li></ol>
    <div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap"><img src="${data.totp.qr_code}" alt="QR" style="width:180px;height:180px;border:1px solid var(--linea);border-radius:8px"><div class="gris" style="font-size:12px;word-break:break-all">Si no puedes escanear, escribe esta clave en la app:<br><span class="mono">${esc(data.totp.secret)}</span></div></div>
    <form id="f"><label class="campo">Código de 6 dígitos <input name="code" inputmode="numeric" maxlength="6" required autocomplete="one-time-code"></label>
    <div class="acciones"><button type="button" class="btn" id="cancelar">Cancelar</button><button class="btn primario">Confirmar</button></div></form>`);
  $('#cancelar', m).onclick = async () => { await sb.auth.mfa.unenroll({ factorId: data.id }); cerrarModal(); };
  $('#f', m).onsubmit = async ev => {
    ev.preventDefault(); const code = new FormData(ev.target).get('code').trim();
    const { data: ch, error: e1 } = await sb.auth.mfa.challenge({ factorId: data.id }); if (e1) return aviso(errorDe(e1), true);
    const { error: e2 } = await sb.auth.mfa.verify({ factorId: data.id, challengeId: ch.id, code }); if (e2) return aviso('Código incorrecto: prueba con el siguiente que muestre la app', true);
    cerrarModal(); aviso('Verificación en dos pasos activa. Desde ahora la app pedirá el código al entrar.'); yo = await rpc('mi_perfil', {}); render();
  };
}

/* ---------- navegación ---------- */
window.addEventListener('hashchange', () => { if (yo) render(); });
function barra(activa) {
  const links = yo.rol === 'operacion'
    ? [['#/taller', 'Lista'], ['#/odt', 'ODT'], ['#/ruta', 'Ruta'], ...(yo.ve_compras ? [['#/compras', 'Compras']] : [])]
    : [['#/lista', 'Lista'], ['#/odt', 'ODT'], ['#/ruta', 'Ruta'], ['#/tablero', 'Tablero'], ['#/compras', 'Compras'], ['#/cotizador', 'Cotizador'], ...(esHarold() ? [['#/trabajadores', 'Trabajadores']] : []), ['#/panel', 'Panel'], ['#/clientes', 'Clientes'], ['#/casos', 'Casos'], ['#/bandeja', 'Bandeja']];
  return `<div class="barra"><a class="marca" href="${links[0][0]}" title="Santino Design · Pedidos"><img src="logo.png" alt="Santino Design" class="logo-barra"></a><nav class="nav">${links.map(([h, t]) => `<a href="${h}" class="${activa === h ? 'activo' : ''}">${t}</a>`).join('')}</nav><div class="espacio"></div><span id="extra-barra" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"></span><button class="avatar" id="btn-salir" title="${esc(yo.nombre)} · salir">${esc(yo.nombre[0])}</button></div>`;
}
async function render() {
  const h = location.hash.split('?')[0];
  const esOp = yo.rol === 'operacion';
  try {
    const est = $('#pagina-guia'); if (est && !h.startsWith('#/guia/')) est.remove();
    if (h.startsWith('#/pedido/')) await vFicha(h.split('/')[2]);
    else if (h.startsWith('#/guia/')) await vGuia(h.split('/')[2]);
    else if (h === '#/tablero' && !esOp) await vTablero();
    else if (h === '#/panel' && !esOp) await vPanel();
    else if (h === '#/clientes' && !esOp) await vClientes();
    else if (h.startsWith('#/casos')) await vCasos();
    else if (h === '#/bandeja' && !esOp) await vBandeja();
    else if (h === '#/ruta') await vRuta();
    else if (h === '#/compras/solicitudes/imprimir' && (!esOp || yo.ve_compras)) await vSolicitudesImprimir();   // hoja de insumos por proyecto para firma del maestro
    else if ((h === '#/compras/solicitudes' || h === '#/solicitudes') && (!esOp || yo.ve_compras)) await vSolicitudes();   // Por comprar: solicitudes de compra en mesón (21-oct-2026), dentro de Compras
    else if (h.startsWith('#/compras/proveedor/') && (!esOp || yo.ve_compras)) await vProveedor(Number(h.split('/')[3]));
    else if (h === '#/compras/proveedores' && (!esOp || yo.ve_compras)) await vProveedores();
    else if (h === '#/compras/insumos' && (!esOp || yo.ve_compras)) await vInsumos();
    else if (h === '#/compras' && (!esOp || yo.ve_compras)) await vCompras();
    else if ((h === '#/cotizador' || h.startsWith('#/cotizador?')) && !esOp) await vCotizaciones();
    else if (h.startsWith('#/trabajadores/') && !esOp) await vTrabajador(Number(h.split('/')[2]));   // pagos a colaboradores (19-oct-2026), solo Harold
    else if (h === '#/trabajadores' && !esOp) await vTrabajadores();
    else if (h.startsWith('#/cotizacion/') && !esOp) await vCotizacion(h.split('/')[2]);
    else if (h === '#/odt') await vOdt();
    else if (h === '#/imprimir-listado' && !esOp) await vImprimirListado();
    else if (h === '#/taller' || esOp) await vLista();
    else if (h === '#/clave') vClave();
    else await vLista();
  } catch (e) { app.innerHTML = barra(h) + `<div class="contenido"><div class="seccion"><h2>Error</h2><p>${esc(errorDe(e))}</p></div></div>`; }
  const bs = $('#btn-salir'); if (bs) bs.onclick = () => menuUsuario().catch(e => aviso(errorDe(e), true));
  pintarDeshacer();
  if (esOp) avisoRutaAlexis(h).catch(() => {});
}
/* Harold 15-oct: "cuando esté la ruta confirmada, que a Alexis le salga un mensaje de que se confirmó la ruta para mañana y lo lleve con un botón
   Ir a la ruta". Se calcula de los datos (sin columna nueva): paradas DESPACHO PROGRAMADO de mañana (o de hoy antes de las 12) todas con
   despacho_confirmado_en. Mientras falten, muestra el avance (3 de 6). Se puede cerrar; vuelve a salir si cambia el conteo. */
async function avisoRutaAlexis(h) {
  const f = new Date().getHours() < 12 ? hoyISO() : hoyISO(1);
  if (h === '#/ruta' && cache.rutaFecha === f) return;
  const { data } = await sb.from('v_pedido_operacion').select('id, tipo_entrega, despacho_confirmado_en').eq('estado', 'DESPACHO PROGRAMADO').eq('fecha_comprometida', f);
  const paradas = (data || []).filter(p => p.tipo_entrega !== 'Despacho regiones' && p.tipo_entrega !== 'Retiro en taller'); if (!paradas.length) return;
  const conf = paradas.filter(p => p.despacho_confirmado_en).length, lista = conf === paradas.length;
  const clave = `aviso-ruta-${f}-${conf}-${paradas.length}`; try { if (localStorage.getItem(clave)) return; } catch (e) { }
  const dia = f === hoyISO() ? 'hoy' : 'mañana'; const viejo = $('.aviso-ruta'); if (viejo) viejo.remove();
  const d = document.createElement('div'); d.className = 'aviso-ruta' + (lista ? ' lista' : '');
  d.innerHTML = `<span>${lista ? `🚚 Ruta de ${dia} (${fecha(f, true)}) confirmada: ${paradas.length} entrega${paradas.length > 1 ? 's' : ''}.` : `Ruta de ${dia} (${fecha(f, true)}): ${conf} de ${paradas.length} entregas confirmadas por el cliente; Harold sigue confirmando.`}</span><button class="btn chico ${lista ? 'primario' : 'borde'}" id="b-ir-ruta">Ir a la ruta</button><button class="btn chico" id="b-cerrar-aviso" aria-label="Cerrar">✕</button>`;
  const barraEl = $('.barra'); if (barraEl) barraEl.after(d); else app.prepend(d);
  $('#b-ir-ruta', d).onclick = () => { cache.rutaFecha = f; if (location.hash === '#/ruta') vRuta(); else location.hash = '#/ruta'; };
  $('#b-cerrar-aviso', d).onclick = () => { try { localStorage.setItem(clave, '1'); } catch (e) { } d.remove(); };
}
/* Versión nueva publicada (Harold 16-oct: "¿cómo se actualiza la app en la tablet?"; en el Mac veía cambios atrasados aunque recargara:
   GitHub Pages deja app.js en caché 10 minutos). La app mira cada 3 minutos, y al volver a la pantalla, el index.html publicado; si trae
   otro ?v= que el que corre, muestra arriba "Hay una versión nueva · Actualizar" (recarga). Sirve igual en la app instalada en la tablet,
   que no tiene botón de recargar. */
function vigilarVersion() {
  if (!MI_VERSION || location.protocol === 'file:') return;
  const mirar = async () => {
    try {
      const t = await (await fetch(location.pathname.replace(/[^/]*$/, '') + 'index.html?t=' + Date.now(), { cache: 'no-store' })).text();
      const v = (t.match(/app\.js\?v=(\d+)/) || [])[1]; if (!v || v === MI_VERSION || $('.aviso-version')) return;
      const d = document.createElement('div'); d.className = 'aviso-version';
      d.innerHTML = `<span>Hay una versión nueva de la app.</span><button class="btn chico primario" id="b-actualizar">Actualizar</button>`;
      document.body.appendChild(d); $('#b-actualizar', d).onclick = () => location.reload();
    } catch (e) { /* sin red: se intenta después */ }
  };
  setTimeout(mirar, 15000); setInterval(mirar, 3 * 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) mirar(); });
}
function vClave() {
  app.innerHTML = barra('') + `<form class="login" id="f-clave"><h1>Nueva clave</h1><label>Clave nueva <input type="password" name="p" minlength="8" required></label><button class="btn primario">Guardar</button></form>`;
  $('#f-clave').onsubmit = async ev => { ev.preventDefault(); const { error } = await sb.auth.updateUser({ password: new FormData(ev.target).get('p') }); aviso(error ? errorDe(error) : 'Clave guardada', !!error); if (!error) location.hash = '#/'; };
}

/* ---------- datos ---------- */
async function cargarPedidos() {
  await cargarModelos(); await cargarMovimientos();
  // La misma Lista para Harold y Alexis (Harold 12-oct): solo cambia la vista (la de operación no trae precios)
  let q = sb.from(yo.rol === 'operacion' ? 'v_pedido_operacion' : 'v_pedido').select('*');
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
  if (cache.etapas.size) l = l.filter(p => (p.piezas || []).some(x => x.area && cache.etapas.has(x.etapa)));  // ej. Barniz = todo lo que está para barnizar
  // "Pendientes míos" (Lista v2): lo que Harold tiene que resolver; se suman (un pedido entra si cumple CUALQUIERA de los marcados)
  if (cache.mios.size) l = l.filter(p => [...cache.mios].some(m => PENDIENTES_MIOS[m](p)));
  const b = cache.busqueda.trim().toLowerCase(); if (!b) return l;
  return l.filter(p => [p.numero, p.cliente, p.resumen, p.comuna, p.cotizacion_numero, p.observacion].join(' ').toLowerCase().includes(b));
}

const PENDIENTES_MIOS = {
  'Atrasados': p => p.atrasado,
  'Sin acabado': p => (p.piezas || []).some(x => x.area && !['Vidrio/compras', 'Barniz'].includes(x.area) && !x.acabado),
  'Sin medidas': p => (p.piezas || []).some(x => x.area === 'Carpintería' && ['En cola', 'Fabricación'].includes(x.etapa) && !x.largo_cm && !x.medida_texto && !/\.(MOS|LIN)\./.test(x.color || '')),
  'Sin fecha maestro': p => (p.piezas || []).some(x => x.area && x.area !== 'Vidrio/compras' && ['En cola', 'Fabricación', 'Soldadura', 'Armado'].includes(x.etapa) && !x.fecha_taller),
  'Devueltas': p => (p.piezas || []).some(x => x.etapa === 'Devuelta al proveedor'),
  'Sin comuna': p => !p.comuna && p.tipo_entrega !== 'Retiro en taller',
  'Con saldo': p => (p.saldo ?? p.saldo_por_cobrar) > 0,
  'Pago pendiente': p => !!p.pago_pendiente,
};
/* ---------- Harold · Lista densa ---------- */
async function vLista() {
  const esOp = yo.rol === 'operacion';
  { const q = location.hash.split('?')[1]; const mq = q && q.match(/q=([^&]+)/); if (mq) { cache.busqueda = decodeURIComponent(mq[1]); cache.filtro = 'todos'; history.replaceState(null, '', esOp ? '#/taller' : '#/lista'); } }
  await cargarPedidos();
  if (!['pendientes', 'todos'].includes(cache.filtro)) cache.filtro = 'pendientes';   // Harold 14-oct: los entregados se revisan en Clientes (un solo lugar), no en la Lista
  const estadosVisibles = cache.filtro === 'pendientes' ? ESTADOS.filter(e => !['ENTREGADO', 'CANCELADO', 'DEVUELTO'].includes(e)) : cache.filtro === 'entregados' ? [] : ESTADOS;
  const setDe = g => g === 'estado' ? cache.estados : g === 'tipo' ? cache.tipos : g === 'etapa' ? cache.etapas : g === 'mios' ? cache.mios : cache.bases;
  const toggle = (grupo, valor, texto, titulo) => `<button class="ftog ${setDe(grupo).has(valor) ? 'on' : ''}" data-grupo="${grupo}" data-valor="${esc(valor)}" title="${esc(titulo)}">${esc(texto)}</button>`;
  const leyenda = `Estados: ${estadosVisibles.map(e => `${COD_ESTADO[e]} = ${e.toLowerCase()}`).join(' · ')}. Tipos: ${Object.keys(COD_TIPO).map(t => `${COD_TIPO[t]} = ${t.toLowerCase()}`).join(' · ')}. Base: METAL estructura metálica · MADERA madera maciza · ENCHAPADO MDF enchapado. Los filtros se suman; sin marcar = todos. Entregar rápido: arrastrar la fila hacia la derecha (con el dedo en la tablet, con el mouse en el Mac); si hay saldo, confirma el cobro.`;
  app.innerHTML = barra(esOp ? '#/taller' : '#/lista') + `<div class="sub no-imprimir filtros-v2">
      <label>Ver <select id="f-modo"><option value="pendientes" ${cache.filtro === 'pendientes' ? 'selected' : ''}>Pendientes</option><option value="todos" ${cache.filtro === 'todos' ? 'selected' : ''}>Todos (últimos 500)</option></select></label>
      ${estadosVisibles.length ? `<span class="fgrupo"><span class="fgrupo-t">Estado</span>${estadosVisibles.map(e => toggle('estado', e, COD_ESTADO[e], e)).join('')}</span>` : ''}
      ${cache.filtro === 'pendientes' ? `<span class="fgrupo"><span class="fgrupo-t">Taller</span>${[['En cola', 'Cola de producción: piezas sin empezar'], ['Fabricación', 'Fabricándose ahora en carpintería'], ['Soldadura', 'Piezas en soldadura'], ['Armado', 'Piezas en armado'], ['Barniz', 'Todo lo que está para barnizar'], ['Pintura', 'Piezas en pintura'], ['Por pedir', 'Compras por hacer'], ['Devuelta al proveedor', 'Piezas compradas que volvieron al proveedor por venir mal'], ['Por embalar', 'Piezas terminadas que faltan por embalar (Harold 19-oct)'], ['Embalado', 'Piezas listas']].map(([v, t]) => toggle('etapa', v, v, t)).join('')}</span>` : ''}
      ${cache.filtro === 'pendientes' ? `<span class="fgrupo"><span class="fgrupo-t">${esOp ? 'Pendientes' : 'Pendientes míos'}</span>${Object.keys(PENDIENTES_MIOS).filter(k => !esOp || !['Con saldo', 'Pago pendiente'].includes(k)).map(k => toggle('mios', k, k, 'Solo pedidos con: ' + k.toLowerCase()).replace('class="ftog', 'class="ftog alerta')).join('')}</span>` : ''}
      <label>Buscar <input type="search" id="f-busca" placeholder="cliente, número, modelo, comuna" value="${esc(cache.busqueda)}" style="width:210px"></label>
      <button class="ayuda" type="button" title="${esc(leyenda)}" id="b-leyenda">?</button>
      <span id="resumen-lista" style="margin-left:auto;color:var(--gris-3)"></span>
      ${esOp ? '' : '<span class="acciones-lista"><button class="btn" id="b-nuevo">+ Nuevo pedido</button><span class="menu-mas"><button class="btn" id="b-mas-menu">Más ▾</button><div class="menu-lista" id="m-mas"><button type="button" id="b-export">Exportar a Excel (CSV)</button><span class="fgrupo" style="padding:6px 10px"><span class="fgrupo-t">Base</span>' + [['METAL', 'Estructura metálica (soldadura)'], ['MADERA', 'Base de madera maciza (carpintería)'], ['ENCHAPADO', 'Base de MDF enchapado (ej. Montecarlo)']].map(([v, t]) => toggle('base', v, v, t)).join('') + '</span><a href="#/imprimir-listado" style="color:var(--gris-3);font-size:12px;border-top:1px solid var(--linea);margin-top:4px" title="Harold 22-oct: ya casi no se usa, queda por si acaso">Imprimir listado operacional (por si acaso)</a></div></span></span>'}
    </div><div class="contenido"><div class="tabla-env" id="tabla"></div></div>`;
  $('#f-modo').onchange = e => { cache.filtro = e.target.value; cache.estados.clear(); vLista(); };
  $$('.ftog').forEach(b => b.onclick = () => { const set = setDe(b.dataset.grupo); set.has(b.dataset.valor) ? set.delete(b.dataset.valor) : set.add(b.dataset.valor); b.classList.toggle('on'); pintarLista(); });
  const bl = $('#b-leyenda'); if (bl) bl.onclick = () => aviso(leyenda);
  const bm = $('#b-mas-menu'); if (bm) { bm.onclick = ev => { ev.stopPropagation(); $('#m-mas').classList.toggle('abierto'); }; document.addEventListener('click', () => { const m = $('#m-mas'); if (m) m.classList.remove('abierto'); }, { once: true }); }
  $('#f-busca').oninput = e => { cache.busqueda = e.target.value; pintarLista(); };
  if (!esOp) { $('#b-nuevo').onclick = () => formPedido(); $('#b-export').onclick = exportarCSV; }
  pintarLista();
}
/* Lista v2 (Harold 13-oct-2026, propuesta aprobada, variante B): 11 columnas con ancho fijo que caben sin scroll en el Mac;
   cada dato en un solo lugar (tipo y alertas bajo el cliente, espesor con el material, forma y personas bajo la medida, envío bajo
   la comuna); columna Sillas propia; semanas como separador; la CELDA de cada pieza (Cubierta / pieza, Base, Sillas) es el botón
   de etapa (toque avanza, mantener vuelve). LISTA_PIEZAS = 'chip' vuelve a la variante A (columna Piezas con chips) en minutos. */
const LISTA_PIEZAS = 'celda';
function semanaDe(iso) { const d = new Date(iso + 'T12:00:00'); const lun = new Date(d); lun.setDate(d.getDate() - ((d.getDay() + 6) % 7)); const dom = new Date(lun); dom.setDate(lun.getDate() + 6); return `Semana del ${fecha(lun.toISOString())} al ${fecha(dom.toISOString())}`; }
function celdaPieza(x, p, l1, l2) {
  if (!x || !x.area) return `<div class="l1">${esc(l1 || '-')}</div>${l2 ? `<div class="l2">${esc(l2)}</div>` : ''}`;
  const et = x.etapas || []; const devuelta = x.etapa === 'Devuelta al proveedor'; const i = et.indexOf(x.etapa); const ult = i >= 0 && i === et.length - 1;
  const falta = x.area && !['Vidrio/compras', 'Barniz'].includes(x.area) && !x.acabado;
  return `<button class="celda-pieza ${devuelta ? 'devuelta' : ult ? 'lista' : i > 0 ? 'proceso' : ''}${falta ? ' falta' : ''}" data-etapa="${x.id}" data-pedido="${p.id}" title="${esc(x.descripcion || x.tipo)}. ${devuelta ? 'Está en el proveedor. Toca: volvió conforme (Recibido).' : !ult ? 'Toca: pasa a ' + esc(et[i + 1] || '') + '.' : 'Pieza lista.'} Mantener apretado o clic derecho: vuelve atrás."><div class="l1">${esc(l1 || '-')}</div>${l2 ? `<div class="l2">${esc(l2)}</div>` : ''}<span class="etapa-tag">${esc(x.etapa || et[0] || '')}${ult ? ' ✓' : ''}${falta ? ' · ¿acabado?' : ''}</span></button>`;
}
function alertasPedido(p) {
  const a = [];
  if (p.urgente) a.push(['URG', 'urgente']);
  if (p.pago_pendiente && (p.total || 0) > 0) a.push(['PAGO PEND', 'pago']);
  if ((p.piezas || []).some(x => x.area && !['Vidrio/compras', 'Barniz'].includes(x.area) && !x.acabado)) a.push(['¿ACABADO?', 'atrasado']);
  if ((p.piezas || []).some(x => x.etapa === 'Devuelta al proveedor')) a.push(['DEVUELTA', 'atrasado']);
  if (p.grupo && p.grupo.n > 1) a.push([`UNIDO +${p.grupo.n - 1}`, 'inst']);   // pedidos unidos con pago compartido (tanda 30)
  if ((p.piezas || []).some(x => x.area === 'Carpintería' && ['En cola', 'Fabricación'].includes(x.etapa) && !x.largo_cm && !x.medida_texto && !/\.(MOS|LIN)\./.test(x.color || ''))) a.push(['SIN MEDIDAS', 'atrasado']);
  return a.map(([t, c]) => `<span class="chip ${c}">${t}</span>`).join(' ');
}
function pintarLista() {
  const lista = filtrar(cache.pedidos);
  const esOp = yo.rol === 'operacion';
  const celdas = LISTA_PIEZAS === 'celda';
  const nMov = cache.filtro === 'pendientes' ? (cache.movs || []).filter(m => { const p = lista.find(q => q.id === m.pedido_id); return p && (p.piezas || []).some(x => x.area); }).length : 0;
  $('#resumen-lista').textContent = `${lista.length} pedidos${nMov ? ` · ${nMov} movimiento${nMov > 1 ? 's' : ''}` : ''}`;
  const cab = [['est', 'Est.', 'Estado del pedido (ver leyenda en ?)'], ['num', 'N°', 'Abre la ficha'], ['cli', 'Cliente', 'Nombre; debajo el tipo de pedido y las alertas'], ['mod', 'Modelo', ''], ['med', 'Medida', 'Largo × ancho (× alto); debajo forma y personas'],
    ['cub', celdas ? 'Cubierta / pieza' : 'Cubierta', celdas ? 'Material y espesor; debajo el tono. La celda es el botón de etapa: toca para avanzar, mantener apretado para volver' : 'Material y espesor; debajo el tono'],
    ['base', 'Base', celdas ? 'Material; debajo el color. Toca para avanzar la etapa' : 'Material; debajo el color'],
    ['sillas', 'Sillas', 'Cantidad × modelo; debajo tapiz y pata' + (celdas ? '. Toca para avanzar la compra' : '')], ['ent', 'Entrega cliente', 'Fecha de entrega; "aprox." = estimada, no comprometida. Clic para cambiarla'],
    ['com', 'Comuna', 'Debajo: RM, regiones o retiro, y si lleva instalación'], ...(celdas ? [] : [['pz', 'Piezas', 'Toca para avanzar; mantener para volver']]), ['saldo', 'Saldo', esOp ? 'Saldo por cobrar al entregar' : '']];
  const nCols = cab.length; const hoy = hoyISO();
  const dos = (a, b) => `<div class="l1">${esc(a || '-')}</div>${b ? `<div class="l2">${esc(b)}</div>` : ''}`;
  const sal = p => esOp ? p.saldo_por_cobrar : p.saldo;   // Alexis ve el saldo por cobrar como Harold (Harold 14-oct: "él entrega")
  const filaMov = (m, p) => `<tr class="fila mov-fila ${m.fecha < hoy ? 'atrasado' : ''}" data-mov="${m.id}" data-id="${p.id}">
      <td class="c-est"><span class="estado e-MOV" title="Movimiento: no es un pedido">MOV</span></td><td class="c-num"><a class="num ficha-num" href="#/pedido/${p.id}">${esc(p.numero)}</a></td>
      <td class="c-cli"><div class="l1" title="${esc(p.cliente)}">${esc(abrev(p.cliente))}</div><div class="l2"><span class="chip inst">${esc(m.tipo === 'Retiro en cliente' ? 'RETIRO' : m.tipo.toUpperCase())}</span></div></td>
      <td colspan="4"><div class="l1">${esc(m.nota || m.tipo)}</div><div class="l2">${esc(m.direccion || p.direccion || 'dirección pendiente')}</div></td>
      <td class="c-ent fecha-mov" data-mov-id="${m.id}" title="${esOp ? 'Clic para proponer otro día' : 'Clic para cambiar la fecha'}">${movFechaTxt(m)}</td><td class="c-com">${dos(p.comuna || '', '')}</td>
      ${celdas ? '' : '<td class="c-pz"></td>'}<td class="c-saldo"><button class="btn chico primario" data-mov-hecho="${m.id}">Hecho</button></td></tr>`;
  const feP = p => cache.filtro === 'entregados' && p.entregado_en ? String(p.entregado_en).slice(0, 10) : (p.fecha_comprometida || p.fecha_estimada || '9999');   // entregados: por fecha de entrega real
  const ids = new Set(lista.map(p => p.id));
  const entradas = lista.map(p => ({ k: feP(p), p }));
  // Un pedido SIN piezas de taller (postventa: visita técnica, retiro) se muestra como una sola fila con su movimiento adentro, en la fecha del movimiento (Harold 13-oct, W3142)
  const sinPiezas = p => !(p.piezas || []).some(x => x.area);
  const movDelPedido = p => sinPiezas(p) ? (cache.movs || []).filter(m => m.pedido_id === p.id).sort((a, b) => a.fecha.localeCompare(b.fecha))[0] : null;
  entradas.forEach(e => { const m = movDelPedido(e.p); if (m) { e.mp = m; e.k = m.fecha; } });
  if (cache.filtro === 'pendientes') (cache.movs || []).filter(m => ids.has(m.pedido_id) && !sinPiezas(lista.find(p => p.id === m.pedido_id))).forEach(m => entradas.push({ k: m.fecha, m, p: lista.find(p => p.id === m.pedido_id) }));
  else lista.forEach(p => { if (sinPiezas(p) && movDelPedido(p)) return; movsDe(p.id).forEach(m => entradas.push({ k: feP(p), m, p })); });   // sin piezas: el movimiento ya va dentro de su fila (Harold 16-oct, Dina W3153 salía dos veces)
  entradas.sort((a, b) => cache.filtro === 'entregados' ? String(b.k).localeCompare(String(a.k)) : String(a.k).localeCompare(String(b.k)));   // entregados: el último entregado arriba (Harold 14-oct)
  let semAct = null;
  const cuerpo = entradas.map(({ p, m, k, mp }) => {
    let sep = '';
    if ((cache.filtro === 'pendientes' || cache.filtro === 'entregados') && k !== '9999') { const sw = semanaDe(k); if (sw !== semAct) { semAct = sw; sep = `<tr class="semana"><td colspan="${nCols}">${sw}</td></tr>`; } }
    else if (cache.filtro === 'pendientes' && k === '9999' && semAct !== 'sin') { semAct = 'sin'; sep = `<tr class="semana"><td colspan="${nCols}">Sin fecha de entrega</td></tr>`; }
    if (m) return sep + filaMov(m, p);
    const r = rasgos(p);
    const envio = (p.tipo_entrega === 'Despacho regiones' ? 'Regiones' : p.tipo_entrega === 'Retiro en taller' ? 'Retiro en taller' : 'RM') + (p.instalacion ? ' + instalación' : '');
    const fe = feP(p); const atraso = p.atrasado ? Math.max(1, Math.round((new Date(hoy) - new Date(fe)) / 864e5)) : 0;
    const ent = cache.filtro === 'entregados' ? (p.entregado_en ? `<div class="l1">${fecha(fe)}</div><div class="l2">entregado</div>` : '<span class="sin-fecha">sin fecha de entrega</span>') : fe === '9999' ? '<span class="sin-fecha">sin fecha</span>' : `<div class="l1 ${p.atrasado ? 'rojo' : ''}">${fecha(fe)}</div>${p.despacho_propuesto && p.estado !== 'DESPACHO PROGRAMADO' ? `<div class="l2 propone">Alexis propone ${fecha(p.despacho_propuesto)}</div>` : p.atrasado ? `<div class="l2 rojo">atrasado ${atraso} d</div>` : p.estado === 'DESPACHO PROGRAMADO' ? (p.despacho_propuesto && p.despacho_propuesto !== p.fecha_comprometida ? `<div class="l2 propone">${esc(p.despacho_propuesto_por || '')} propone ${fecha(p.despacho_propuesto)}</div>` : p.despacho_confirmado_en ? '<div class="l2">cliente confirmó</div>' : '<div class="l2 propone">por confirmar</div>') : p.fecha_comprometida ? '<div class="l2">comprometida</div>' : '<div class="l2">aprox. (+21 d)</div>'}`;
    const cubL1 = r.parcial === 'solo bases' ? '-' : [r.cub.material_cubierta ? codMaterial(r.cub.material_cubierta) : '', r.cub.espesor_mm ? num(r.cub.espesor_mm) + ' mm' : ''].filter(Boolean).join(' · ') || (celdas && r.cub.area ? (r.cub.tipo === 'Servicio' ? 'Instalación' : r.cub.tipo) : '-');
    const cubL2 = r.cubierta2.slice(1).filter(Boolean).join(' · ');
    const conBase = r.base.tipo || ['Cubierta', 'Mesa'].includes(r.cub.tipo);  // un mueble, banca o servicio no tiene base: la celda queda vacía
    const baseL1 = conBase ? r.base2[0] : '-', baseL2 = conBase ? r.base2.slice(1).filter(Boolean).join(' · ') : '';
    const medL1 = r.medida !== '-' ? r.medida.replace(/ x /g, ' × ') : (r.cub.medida_texto || ''), medL2 = [{ RECT: 'Rect', CUA: 'Cuad', CIRC: 'Circ', OVAL: 'Oval' }[r.cub.forma], r.cub.personas ? r.cub.personas + 'P' : ''].filter(Boolean).join(' · ');
    const celdaMov = mp ? `<button class="celda-pieza mov ${mp.fecha < hoy ? 'falta' : ''}" data-mov-hecho="${mp.id}" title="${esc(mp.nota || '')}. Toca cuando esté hecho."><div class="l1">${esc(mp.tipo)}</div><div class="l2">${esc(mp.nota || mp.direccion || '')}</div><span class="etapa-tag">${mp.fecha_propuesta ? 'Alexis propone ' + fecha(mp.fecha_propuesta) + ' · ' : ''}toca: hecho</span></button>` : '';
    const celdaCub = mp ? celdaMov : celdas ? celdaPieza(r.cub.area ? r.cub : null, p, cubL1, cubL2) + r.extras.map(x => celdaPieza(x, p, (x.tipo === 'Servicio' ? 'Instalación' : (x.descripcion || x.tipo).split(/\s·\s|:\s|,\s/)[0]) + (x.cantidad > 1 ? ' ×' + x.cantidad : ''), codMaterial(x.material_cubierta || x.material_base) || '')).join('') : dos(cubL1, cubL2);
    const celdaBase = celdas ? celdaPieza(r.base.tipo ? r.base : null, p, baseL1, baseL2) : dos(baseL1, baseL2);
    const celdaSil = r.sillasL1 ? (celdas ? celdaPieza(r.sil, p, r.sillasL1, r.sillasL2) : dos(r.sillasL1, r.sillasL2)) : '<span class="gris">-</span>';
    return sep + `<tr class="fila ${p.atrasado ? 'atrasado' : ''}" data-id="${p.id}">
      <td class="c-est">${mp ? `<span class="estado e-MOV" title="${esc(p.tipo_pedido)}: ${esc(mp.tipo)}, no se fabrica nada">${esc(COD_MOV[mp.tipo] || 'MOV')}</span>` : estadoHtml(p.estado, true)}</td><td class="c-num"><a class="num ficha-num" href="#/pedido/${p.id}" title="Abrir la ficha">${esc(p.numero)}</a></td>
      <td class="c-cli"><div class="l1" title="${esc(p.cliente)}">${esc(abrev(p.cliente))}</div><div class="l2">${tipoHtml(p.tipo_pedido)} ${alertasPedido(p)}</div></td>
      <td class="c-mod" title="${esc(r.descripcion || '')}"><div class="l1">${esc(r.modelo)}</div>${r.parcial ? `<div class="l2 parcial">${r.parcial}</div>` : ''}</td>
      <td class="c-med">${medL1 ? dos(medL1, medL2) : (r.cub.area === 'Carpintería' && ['En cola', 'Fabricación'].includes(r.cub.etapa) ? '<span class="falta-dato">por definir</span>' : '-')}</td>
      <td class="c-cub">${celdaCub}</td><td class="c-base">${celdaBase}</td>
      <td class="c-sillas">${celdaSil}</td>
      ${mp ? `<td class="c-ent fecha-mov" data-mov-id="${mp.id}" title="${esOp ? 'Clic para proponer otro día' : 'Clic para cambiar la fecha'}">${movFechaTxt(mp)}</td>` : `<td class="c-ent fecha-ent" data-id="${p.id}" title="${esOp ? 'Clic para proponer una fecha de entrega (Harold la acepta)' : 'Clic para cambiar la fecha de entrega'}">${ent}</td>`}
      <td class="c-com">${dos(p.comuna || (p.tipo_entrega === 'Retiro en taller' ? 'Taller' : ''), envio).replace('<div class="l1">-</div>', '<div class="l1 falta-dato">¿comuna?</div>')}</td>
      ${celdas ? '' : `<td class="c-pz">${etapasHtml(p)}</td>`}<td class="c-saldo mono ${sal(p) > 0 ? 'rojo' : ''}">${sinMontos(p) ? `<span class="gris">${TXT_SIN_MONTOS}</span>` : sal(p) > 0 ? pesos(sal(p)) : '<span class="gris">pagado</span>'}</td></tr>`;
  }).join('');
  $('#tabla').innerHTML = `<table class="lista v2 ${celdas ? 'b' : ''}"><colgroup>${cab.map(([c]) => `<col class="c-${c}">`).join('')}</colgroup><thead><tr>${cab.map(([c, t, tt]) => `<th class="c-${c}" title="${esc(tt)}">${t}</th>`).join('')}</tr></thead><tbody>${cuerpo}</tbody></table>`;
  $$('#tabla a.ficha-num').forEach(a => a.onclick = ev => ev.stopPropagation());
  const recargarMovs = async () => { await cargarMovimientos(); pintarLista(); };
  activarMovimientos($('#tabla'), {}, recargarMovs);
  activarEtapas($('#tabla'), () => pintarLista());
  activarArrastreHorizontal($('#tabla'));
  // Fechas desde la Lista (Harold 13-oct): Harold siempre puede cambiarlas; Alexis solo propone (entrega del pedido o día del movimiento) y Harold acepta.
  const editorFecha = (td, valorInicial, guardar) => {
    if (td.querySelector('input')) return; const antes = td.innerHTML;
    td.innerHTML = `<input type="date" value="${valorInicial || ''}" style="min-height:28px;padding:2px 4px;font-size:12px;width:100%">`;
    const inp = td.querySelector('input'); inp.focus(); try { inp.showPicker && inp.showPicker(); } catch (e) { /* algunos navegadores no lo permiten */ }
    inp.onclick = e => e.stopPropagation();
    inp.onchange = () => guardar(inp.value || null);
    inp.onblur = () => setTimeout(() => { if (td.querySelector('input')) td.innerHTML = antes; }, 200);
  };
  $$('#tabla td.fecha-ent').forEach(td => td.onclick = ev => {
    ev.stopPropagation(); const p = cache.pedidos.find(x => x.id == td.dataset.id);
    if (esOp) return editorFecha(td, p.despacho_propuesto || p.fecha_comprometida || p.fecha_estimada, async v => { try { await rpc('proponer_despacho', { p_pedido_id: p.id, p_fecha: v }); aviso(v ? 'Propuesto ' + fecha(v, true) + '; Harold decide' : 'Propuesta retirada'); vLista(); } catch (e) { aviso(errorDe(e), true); } });
    editorFecha(td, p.despacho_propuesto || p.fecha_comprometida || p.fecha_estimada, async v => {
      const antesV = p.fecha_comprometida, antesProp = p.despacho_propuesto;
      const { error } = await sb.from('pedido').update({ fecha_comprometida: v, despacho_propuesto: null }).eq('id', p.id);
      aviso(error ? errorDe(error) : (v ? 'Entrega comprometida: ' + fecha(v, true) : 'Fecha de entrega borrada'), !!error);
      if (!error) anotarCambio(`fecha de entrega de ${p.numero}`, () => sb.from('pedido').update({ fecha_comprometida: antesV, despacho_propuesto: antesProp }).eq('id', p.id).then(r => { if (r.error) throw r.error; }));
      vLista(); });
  });
  $$('#tabla td.fecha-mov').forEach(td => td.onclick = ev => {
    ev.stopPropagation(); const m = (cache.movs || []).find(x => x.id == td.dataset.movId); if (!m) return;
    if (esOp) return editorFecha(td, m.fecha_propuesta || m.fecha, async v => { const { error } = await sb.from('movimiento').update({ fecha_propuesta: v }).eq('id', m.id); if (error) return aviso(errorDe(error), true); aviso(v ? 'Propuesto ' + fecha(v, true) + '; Harold decide' : 'Propuesta retirada'); await cargarMovimientos(); pintarLista(); });
    editorFecha(td, m.fecha_propuesta || m.fecha, async v => { if (!v) return; const antes = m.fecha, antesProp = m.fecha_propuesta; const { error } = await sb.from('movimiento').update({ fecha: v, fecha_propuesta: null }).eq('id', m.id); if (error) return aviso(errorDe(error), true); aviso('Movimiento: ' + fecha(v, true)); anotarCambio(`fecha del movimiento (volver a ${fecha(antes)})`, async () => { await sb.from('movimiento').update({ fecha: antes, fecha_propuesta: antesProp }).eq('id', m.id); await cargarMovimientos(); }); await cargarMovimientos(); pintarLista(); });
  });
  $$('#tabla tr.fila').forEach(tr => tr.onclick = () => abrirDetalleFila(tr));
  activarDeslizarEntrega();
}
/* Tabla de piezas compartida (despliegue de la Lista y ficha): mismas columnas que la ODT (Harold 13-oct: una sola forma de ver las piezas) */
function tablaPiezasHtml(p, esOp) {
  const piezas = (p.piezas || []).filter(x => x.area);
  const med = x => x.medida_texto ? (/por definir|pendiente/i.test(x.medida_texto) ? `<span class="falta-dato">${esc(x.medida_texto)}</span>` : esc(x.medida_texto)) : medidaTxt(x) ? esc(medidaTxt(x, ' × ')) + ' cm' : /\.(MOS|LIN)\./.test(x.color || '') ? 'Estándar ' + esc(x.color) : x.area === 'Carpintería' ? '<span class="falta-dato">por definir</span>' : '';
  const nombrePz = x => aMedidaTxt(x) ? (['Base', 'Cubierta'].includes(x.tipo) ? x.tipo + ' de ' + aMedidaTxt(x).toLowerCase() : aMedidaTxt(x)) : x.tipo === 'Base' ? 'Base ' + (nombreModelo(x.modelo_base) || '') : x.tipo === 'Cubierta' ? (nombreModelo(x.modelo_cubierta) || 'Cubierta') : x.tipo === 'Silla' ? `${x.cantidad} sillas ${NOMBRE_SILLA[x.tipo_silla] || x.tipo_silla || '(modelo por definir)'}` : x.tipo === 'Servicio' ? 'Instalación' : (x.descripcion || x.tipo).split(/\s·\s|:\s|,\s/)[0];
  const madera = x => { const m = x.tipo === 'Base' ? x.material_base : (x.material_cubierta || x.material_base); return (m ? esc(codMaterial(m)) : (x.tipo === 'Silla' ? '' : '-')) + (x.espesor_mm ? `<div class="l2">${num(x.espesor_mm)} mm</div>` : (x.area === 'Carpintería' && !/espesor/i.test(x.indicaciones || '') ? '<div class="l2 falta-dato">esp.?</div>' : '')); };
  const term = x => x.tipo === 'Silla' || x.tipo === 'Banca' ? [x.tapiz ? x.tapiz + (x.color_silla ? ' ' + x.color_silla : '') : (x.color_silla ? 'tapiz ' + x.color_silla : ''), x.color ? 'pata ' + x.color : ''].filter(Boolean).join(' · ') || '<span class="falta-dato">tapiz por definir</span>' : esc([x.tipo === 'Base' || !x.tono ? x.color : tonoTxt(x.tono), x.nota_acabado].filter(Boolean).join(' · '));
  const filaPz = x => `<tr><td>${etapaChip(x, p.id)}</td><td><a class="cli-edit" data-editar-pieza="${x.id}" title="Editar esta pieza">${esc(nombrePz(x))}</a>${detalleAMedidaHtml(x, p) ? `<div class="l2">${detalleAMedidaHtml(x, p)}</div>` : ''}${ocLineaPieza(x)}</td><td>${madera(x)}</td><td class="nw">${med(x)}</td><td>${term(x)}</td><td>${x.area === 'Vidrio/compras' ? '<span class="gris">no aplica</span>' : acabadoHtml(x)}</td><td><input type="date" class="f-taller" value="${x.fecha_taller || ''}" data-ftaller="${x.id}" title="Fecha comprometida para el maestro"></td>${esOp ? `<td class="gris">${esc(x.indicaciones || '')}</td>` : `<td class="gris ind-edit" data-ind="${x.id}" title="Clic para cambiar las indicaciones del maestro">${esc(x.indicaciones || '') || '<span class="falta-dato">agregar…</span>'}</td>`}</tr>`;
  return piezas.length ? `<table class="d-tabla"><thead><tr><th>Etapa</th><th>Pieza</th><th>Madera</th><th>Medidas L × A × Al</th><th>Term.</th><th>Acabado</th><th>Fecha maestro</th><th>Indicaciones</th></tr></thead><tbody>${piezas.map(filaPz).join('')}</tbody></table>` : '<div class="gris">Sin piezas de taller</div>';
}
function activarFechaMaestro(raiz, p, despues) {
  $$('[data-ftaller]', raiz).forEach(inp => { inp.onclick = ev => ev.stopPropagation(); inp.onchange = async () => {
    const id = Number(inp.dataset.ftaller), pz = (p.piezas || []).find(y => y.id === id), antes = pz && pz.fecha_taller;
    try { const r = await rpc('editar_pieza', { p_linea_id: id, p_cambios: { fecha_taller: inp.value || null } }); actualizarPiezas(r); aviso('Fecha para el maestro: ' + (inp.value ? fecha(inp.value, true) : 'sin fecha'));
      anotarCambio(`fecha para el maestro (volver a ${antes ? fecha(antes) : 'sin fecha'})`, async () => { actualizarPiezas(await rpc('editar_pieza', { p_linea_id: id, p_cambios: { fecha_taller: antes || null } })); }); despues(); } catch (e) { aviso(errorDe(e), true); } }; });
}
/* Programar despacho en un paso (Harold 13-oct): estado DESPACHO PROGRAMADO más la fecha; Alexis también puede, confirmando que el cliente acordó el día. */
function activarProgramar(raiz, p, despues) {
  $$('[data-programar]', raiz).forEach(b => b.onclick = async ev => {
    ev.stopPropagation(); const inp = $(`[data-prog-fecha="${p.id}"]`, raiz); const f = inp && inp.value; if (!f) return aviso('Elige el día de entrega', true);
    const faltan = (p.piezas || []).filter(x => x.area && x.estado !== 'Lista').length;
    const msg = (yo.rol === 'operacion' ? `¿El cliente acordó recibir el ${fecha(f, true)}? Harold verá el cambio en el historial.` : `¿Programar la entrega para el ${fecha(f, true)}?`) + (faltan ? `\nOjo: faltan ${faltan} pieza${faltan > 1 ? 's' : ''} por embalar.` : '');
    if (!confirm(msg)) return;
    try { await rpc('programar_despacho', { p_pedido_id: p.id, p_fecha: f }); aviso('Despacho programado para el ' + fecha(f, true)); anotarCambio(`despacho de ${p.numero} (volver a ${p.estado})`, () => rpc('cambiar_estado', { p_pedido_id: p.id, p_estado: p.estado })); despues(); } catch (e) { aviso(errorDe(e), true); }
  });
}
function abrirDetalleFila(tr) {
  const sig = tr.nextElementSibling;
  if (sig && sig.classList.contains('detalle')) { sig.remove(); return; }
  $$('#tabla tr.detalle').forEach(x => x.remove());
  const p = cache.pedidos.find(x => x.id == tr.dataset.id);
  const d = document.createElement('tr'); d.className = 'detalle';
  const esOp = yo.rol === 'operacion';
  // Despliegue v2 (Harold 13-oct): 4 bloques para trabajar sin entrar a la ficha: Pedido · Cliente y entrega · Pago · Piezas (tabla con las
  // mismas columnas de la ODT; el nombre de la pieza abre Editar). La ficha queda para historial, documentos y guías.
  const estadosPosibles = esOp ? [...new Set([p.estado, 'EN FABRICACIÓN', 'LISTO EN TALLER', 'DESPACHO PROGRAMADO'])] : ESTADOS;   // Harold 19-oct: operación entrega solo por Entregar o deslizando (W3146 quedó ENTREGADO por un toque aquí)
  const tel = p.cliente_telefono;
  const saldo = esOp ? p.saldo_por_cobrar : p.saldo;
  const fe = p.fecha_comprometida || p.fecha_estimada;
  const piezas = (p.piezas || []).filter(x => x.area);
  d.innerHTML = `<td colspan="${tr.children.length}"><div class="desp2">
    <section class="d-bloque d-pedido"><h4>Pedido</h4>
      <label class="desp-estado">Estado <select data-estado-pedido="${p.id}">${estadosPosibles.map(e => `<option ${e === p.estado ? 'selected' : ''}>${e}</option>`).join('')}</select></label>
      <div class="d-fila"><span>Compra</span><b>${fecha(p.fecha_compra)}</b></div>
      <div class="d-fila"><span>Entrega cliente</span><b>${fe ? fecha(fe, true) : 'sin fecha'}</b>${fe && !p.fecha_comprometida ? ' <small class="gris">aprox., sin comprometer</small>' : ''}</div>
      <div class="d-fila"><span>Origen</span><b>${esc(p.origen || '')}</b>${p.cotizacion_numero ? ` <small class="gris">· ${esc(p.cotizacion_numero)}</small>` : ''}</div>
      <div class="d-acciones">
        ${['EN FABRICACIÓN', 'POR FABRICAR', 'DISEÑO APROBADO'].includes(p.estado) && p.piezas_total > 0 ? `<button class="btn chico primario" data-listo="${p.id}" ${p.piezas_listas < p.piezas_total ? 'disabled' : ''} title="${p.piezas_listas} de ${p.piezas_total} piezas embaladas">Marcar LISTO EN TALLER</button>` : ''}
        ${esOp && p.estado === 'LISTO EN TALLER' ? `<label style="font-size:12px">Proponer despacho <input type="date" data-fecha="${p.id}" value="${p.despacho_propuesto || ''}"></label><button class="btn chico borde" data-prop="${p.id}">Proponer</button>` : ''}
        ${esOp && p.estado === 'DESPACHO PROGRAMADO' ? `<button class="btn chico primario" data-entregar="${p.id}">Entregar</button>` : ''}
        ${p.despacho_propuesto && p.estado === 'LISTO EN TALLER' && !esOp ? `<span class="chip prop">Alexis propone ${fecha(p.despacho_propuesto, true)}</span><button class="btn chico borde" data-confirmar="${p.id}">Cliente confirmó: programar</button><a class="btn chico" target="_blank" href="${waLink(p, 'despacho')}">WSP despacho</a>` : ''}
        ${!esOp && p.estado === 'DESPACHO PROGRAMADO' ? (p.despacho_confirmado_en ? '<span class="chip ok">CLIENTE CONFIRMÓ</span>' : `<span class="chip saldo">POR CONFIRMAR</span><a class="btn chico" target="_blank" href="${waLink(p, 'despacho')}">WSP despacho</a><button class="btn chico primario" data-confirmar="${p.id}">Cliente confirmó</button>`) : ''}
        ${p.estado !== 'DESPACHO PROGRAMADO' ? `<span class="prog-desp"><input type="date" data-prog-fecha="${p.id}" value="${p.despacho_propuesto || p.fecha_comprometida || ''}" title="Día de entrega acordado con el cliente"><button class="btn chico primario" data-programar="${p.id}" title="Deja el pedido en DESPACHO PROGRAMADO con esa fecha: entra a la Ruta de ese día">Programar despacho</button></span>` : ''}
        ${esOp ? '' : `<button class="btn chico borde" data-urgente="${p.id}">${p.urgente ? 'Quitar urgente' : 'Urgente'}</button>`}
        ${['LISTO EN TALLER', 'DESPACHO PROGRAMADO', 'ENTREGADO'].includes(p.estado) && !(esOp && p.tipo_pedido === 'Proyecto') ? `<button class="btn chico borde" data-guia-lista="${p.id}" title="Emite la guía o abre la que ya existe, para imprimir o enviar">Guía de despacho</button>` : ''}
        <a class="btn chico" href="#/pedido/${p.id}">Abrir ficha${p.planos ? ` · planos (${p.planos})` : ''}</a>
      </div>
    </section>
    <section class="d-bloque d-cliente"><h4>Cliente y entrega</h4>
      <div class="d-fila"><span>Cliente</span><b>${esc(p.cliente)}</b></div>
      <div class="d-fila"><span>Teléfono</span><b>${esc(tel || 'sin teléfono')}</b>${tel ? ` <a class="btn chico borde" target="_blank" href="https://wa.me/${String(tel).replace(/\D/g, '')}">WSP</a>` : ''}</div>
      <div class="d-fila"><span>Dirección</span><b>${esc(p.direccion_entrega || p.direccion || 'sin dirección')}</b></div>
      <div class="d-fila"><span>Comuna</span><b>${esc(p.comuna_entrega || p.comuna || '-')}</b> <small class="gris">${esc((p.tipo_entrega || 'Despacho RM') + (p.instalacion ? ' · con instalación' : ''))}</small></div>
      ${p.nota_entrega ? `<div class="d-fila"><span>Nota</span><b>${esc(p.nota_entrega)}</b></div>` : ''}
    </section>
    ${`<section class="d-bloque d-dinero"><h4>Pago</h4>
      ${sinMontos(p) ? `<div class="d-fila"><span>Pagos</span><b class="gris">${TXT_SIN_MONTOS}</b></div>` : `<div class="d-fila"><span>Total</span><b class="mono">${pesos(p.total)}</b></div>
      <div class="d-fila"><span>Abonado</span><b class="mono">${pesos(p.abonado)}</b> ${pctAbono(p)}</div>
      <div class="d-fila"><span>Saldo</span><b class="mono ${saldo > 0 ? 'rojo' : ''}">${saldo > 0 ? pesos(saldo) : 'pagado'}</b>${saldo > 0 ? ' <span class="chip saldo">COBRAR AL ENTREGAR</span>' : ''}${saldo > 0 && tel && !esOp ? ` <a href="#/pedido/${p.id}" title="El mensaje de saldo se arma en la ficha">mensaje de saldo</a>` : ''}</div>`}
      ${p.grupo && p.grupo.n > 1 ? `<div class="d-fila"><span>Unidos</span><b>${p.grupo.numeros.map(esc).join(' · ')}</b></div><div class="d-fila"><span>Saldo grupo</span><b class="mono ${p.grupo.saldo > 0 ? 'rojo' : ''}">${p.grupo.saldo == null ? `<span class="gris">${TXT_SIN_MONTOS}</span>` : p.grupo.saldo > 0 ? pesos(p.grupo.saldo) : p.grupo.saldo < 0 ? pesos(-p.grupo.saldo) + ' a favor' : 'pagado'}</b></div>` : ''}
      ${esOp ? '' : `<div class="d-fila"><span>Documento</span><b>${esc(p.documento_tributario || '-')}${p.documento_numero ? ' ' + esc(p.documento_numero) : ''}</b></div>`}
    </section>`}
    <section class="d-bloque d-piezas"><h4>Piezas (${piezas.length}) <small class="gris">toca el chip para avanzar · mantener para volver · toca el nombre para editar</small></h4>
      ${tablaPiezasHtml(p, esOp)}
    </section>
    ${(p.movimientos = movsDe(p.id)).length || !esOp ? `<div class="d-bloque d-mov">${movimientosHtml(p, esOp)}</div>` : ''}
    ${p.observacion ? `<section class="d-bloque d-obs"><h4>Observación</h4><div>${esc(p.observacion)}</div></section>` : ''}
    </div></td>`;
  tr.after(d);
  activarMovimientos(d, p, async () => { await cargarMovimientos(); reabrir(); });
  const reabrir = () => { pintarLista(); const t2 = $(`#tabla tr.fila[data-id="${p.id}"]`); if (t2) abrirDetalleFila(t2); };
  activarEtapas(d, reabrir);
  activarPiezasEdicion(d, reabrir);
  activarFechaMaestro(d, p, reabrir);
  activarCompras(d, p, reabrir);
  const se = $('[data-estado-pedido]', d);
  se.onclick = ev => ev.stopPropagation();
  se.onchange = async () => {
    const antes = p.estado, nuevo = se.value;
    if (nuevo === 'ENTREGADO' && !confirmarEntregaAnticipada(p)) { se.value = antes; return; }
    try { await rpc('cambiar_estado', { p_pedido_id: p.id, p_estado: nuevo }); p.estado = nuevo; aviso(`${p.numero}: ${nuevo}`); anotarCambio(`estado de ${p.numero} (volver a ${antes})`, () => rpc('cambiar_estado', { p_pedido_id: p.id, p_estado: antes })); reabrir(); }
    catch (e) { se.value = antes; aviso(errorDe(e), true); }
  };
  $$('input, a, button, select', d).forEach(el => { if (!el.onclick) el.addEventListener('click', ev => ev.stopPropagation()); });
  const bc = $('[data-confirmar]', d); if (bc) bc.onclick = async () => { try { await rpc('confirmar_despacho', { p_pedido_id: p.id }); aviso('Confirmado por el cliente ✓: entra a la Ruta'); anotarCambio('confirmación del cliente (volver a por confirmar)', () => rpc('confirmar_despacho', { p_pedido_id: p.id, p_quitar: true })); vLista(); } catch (e) { aviso(errorDe(e), true); } };
  const bl = $('[data-listo]', d); if (bl) bl.onclick = async () => { try { await rpc('cambiar_estado', { p_pedido_id: p.id, p_estado: 'LISTO EN TALLER' }); aviso('Listo en taller ✓'); anotarCambio(`${p.numero} listo en taller (volver a ${p.estado})`, () => rpc('cambiar_estado', { p_pedido_id: p.id, p_estado: p.estado })); vLista(); } catch (e) { aviso(errorDe(e), true); } };
  const bp = $('[data-prop]', d); if (bp) bp.onclick = async () => { const f = $('[data-fecha]', d).value; if (!f) return aviso('Elige la fecha', true); try { await rpc('proponer_despacho', { p_pedido_id: p.id, p_fecha: f }); aviso('Propuesta enviada a Harold'); vLista(); } catch (e) { aviso(errorDe(e), true); } };
  const be = $('[data-entregar]', d); if (be) be.onclick = () => formEntregar(p, () => vLista());
  activarProgramar(d, p, () => vLista());
  /* Guía desde la Lista (Harold 22-oct: "no veo dónde sale para la guía de despacho"): abre la última guía vigente o el formulario para emitirla. */
  const bg = $('[data-guia-lista]', d); if (bg) bg.onclick = async () => { const { data: gs, error } = await sb.from('guia_despacho').select('id, anulada').eq('pedido_id', p.id).order('numero', { ascending: false }); if (error) return aviso(errorDe(error), true);
    const g = (gs || []).find(x => !x.anulada); if (g) location.hash = '#/guia/' + g.id; else formGuia(p); };
  const bu = $('[data-urgente]', d); if (bu) bu.onclick = async () => { const v = !p.urgente; const { error } = await sb.from('pedido').update({ urgente: v }).eq('id', p.id); if (error) return aviso(errorDe(error), true); p.urgente = v; aviso(v ? 'Marcado urgente' : 'Ya no es urgente'); anotarCambio(`urgente de ${p.numero}`, async () => { await sb.from('pedido').update({ urgente: !v }).eq('id', p.id); p.urgente = !v; }); reabrir(); };
}
const CUENTA_SANTINO = 'Santino Design SpA\nRUT 77.551.022-6\nBanco Santander\nCuenta Corriente 87727157\nhola@santinodesign.cl';
const WEBPAY_LINK = 'https://www.webpay.cl/form-pay/80544';
const nombreModelo = cod => (cache.modelosNombre || {})[cod] || NOMBRE_MODELO[cod] || cod || '';  // la tabla modelo manda; el mapa de abajo es solo respaldo
const NOMBRE_MODELO = { VEN: 'Venecia', ROM: 'Roma', MYKHONOS: 'Mykonos', 'MESA EXT': 'Mesa exterior', MON: 'Mónaco', GONQUI: 'Gonqui', NOTHOFAGUS: 'Nothofagus', PRAGA: 'Praga', SANTORINI: 'Santorini', 'MONTE.C': 'Mesa Monte Carlo', FIO: 'Fiorella', X: 'Mesa X', ORIGEN: 'Origen', 'TIERRA DEL FUEGO': 'Tierra del Fuego', TIVOLI: 'Tivoli', 'MESA.C': 'Mesa de centro', REMANSO: 'Remanso', TRAMA: 'Trama', SOBREMESA: 'Sobremesa', AMORA: 'Amora', DUNA: 'Duna', LENA: 'Lena' };
const NOMBRE_MATERIAL = { PINO: 'pino', LENGA: 'lenga', LENG: 'lenga', 'V.T': 'vidrio templado', 'V.C': 'vidrio', 'ROB.US': 'roble americano', 'ROB US': 'roble americano', 'ROB.HUALLE': 'roble hualle', HAYA: 'haya', KIRI: 'kiri', TRAVERTINO: 'travertino', METAL: 'metal' };
const NOMBRE_COLOR = { NGR: 'negro', NAT: 'natural', BL: 'blanco', GRIS: 'gris', NOG: 'nogal' };
const nombreMaterial = m => (codigoDe('material', m) || {}).nombre || NOMBRE_MATERIAL[m] || (m || '').toLowerCase();
// Harold 12-oct (tanda 20): en toda la app el color va como CÓDIGO (NGR, BL, GRIS...), nunca traducido a palabra. NOMBRE_COLOR queda solo para textos a clientes o proveedores.
const nombreColor = c => c ? String(c) : '';
function nombrePila(p) { return ((p.cliente || '').trim().split(' ')[0] || '').replace(/^./, c => c.toUpperCase()); }
function telWa(p) { return (p.cliente_telefono || '').replace(/\D/g, ''); }
// Mensaje 1 de Mensajes_Despacho_e_Instalacion_v1_0.md (confirmación de despacho)
/* Harold 15-oct: UN solo mensaje de confirmación: rango horario del cliente si tiene restricción (hora_desde/hora_hasta; si no, 10 a 20 hrs),
   saldo pendiente si lo hay (sin "puedes transferir antes": muchos pagan al recibir el mensaje) y, si el pedido no lleva instalación, la oferta con
   el precio fijo por tipo de producto (tabla INSTALACION de Harold 15-oct). */
const INSTALACION = { madera: [[4, 9990, 15000], [8, 12000, 20000], [12, 18000, 25000]], vidrio: [[8, 25000, 35000], [12, 35000, 45000]], piedra: [[8, 35000, 35000], [12, 45000, 45000]] };
function precioInstalacion(p) {
  const pz = p.piezas || []; const cub = pz.find(x => ['Cubierta', 'Mesa'].includes(x.tipo)) || pz.find(x => x.personas) ; if (!cub) return null;
  const personas = Number(cub.personas || 0); if (!personas || personas > 12) return null;
  const mat = String(cub.material_cubierta || ''); const desc = String(cub.descripcion || '');
  const tipo = /^V\./.test(mat) || /vidrio/i.test(desc) ? 'vidrio' : /TRAVERTINO|M[AÁ]RMOL|PIEDRA|GRANITO|CUARZO/i.test(mat + ' ' + desc) ? 'piedra' : 'madera';
  const sillas = pz.some(x => x.tipo === 'Silla' || x.tipo === 'Banca');
  const fila = INSTALACION[tipo].find(f => personas <= f[0]); return fila ? fila[sillas ? 2 : 1] : null;
}
const horaTxt = h => { const [a, b] = hhmm(h).split(':'); return b && b !== '00' ? `${Number(a)}:${b}` : String(Number(a)); };
function mensajeDespacho(p) {
  const f = p.despacho_propuesto || p.fecha_comprometida;
  const dia = f ? 'el ' + fecha(f, true).replace(/^([^ ]+)/, m => ({ lun: 'lunes', mar: 'martes', 'mié': 'miércoles', jue: 'jueves', vie: 'viernes', 'sáb': 'sábado', dom: 'domingo' }[m] || m)) : 'este viernes';
  const rango = `entre las ${horaTxt(p.hora_desde || '10:00')} y ${horaTxt(p.hora_hasta || '20:00')} hrs`;
  const L = [`Hola! Confirmamos el despacho 🚚 de tu pedido ${dia} ${rango}. No manejamos un horario fijo por la cantidad de pedidos del día, pero los chicos te pueden avisar con al menos 30 minutos de anticipación.`, '', '▶️ Importante: confirma que puedes recibir el pedido, o avísanos si prefieres que lo dejen en conserjería.'];
  const abonado = Number(p.abonado || 0), saldo = Number(p.total || 0) - abonado;
  if (saldo > 0) L.push('', `💰 Queda un saldo pendiente de ${pesos(saldo)} (total ${pesos(p.total)}, abonado ${pesos(abonado)}):`, '', CUENTA_SANTINO, '', `Webpay: ${WEBPAY_LINK}`);
  if (!p.instalacion) { const v = precioInstalacion(p); const que = (p.piezas || []).some(x => x.tipo === 'Silla' || x.tipo === 'Banca') ? 'el comedor' : /mueble|rack|closet|escritorio/i.test(p.resumen || '') ? 'el mueble' : 'la mesa';
    L.push('', `🔧 Si quieres, los chicos pueden dejar ${que} armad${que === 'la mesa' ? 'a' : 'o'} e instalad${que === 'la mesa' ? 'a' : 'o'} en su lugar el mismo día${v ? ' por ' + pesos(v) : ''}. Avísanos y lo agregamos a la entrega${v ? '' : '; te confirmamos el valor'}.`); }
  L.push('', 'Saludos! 👋');
  return L.join('\n');
}
// Formato exacto de la skill mensajes-saldo-pendiente v1.2
function mensajeSaldo(p, abonos) {
  const pz = p.piezas || []; const cub = pz.find(x => ['Cubierta', 'Mesa', 'Mueble'].includes(x.tipo)) || {}; const sil = pz.find(x => x.tipo === 'Silla' || x.tipo === 'Banca');
  const modelo = aMedidaTxt(cub) || NOMBRE_MODELO[cub.modelo_cubierta] || NOMBRE_MODELO[(pz.find(x => x.tipo === 'Base') || {}).modelo_base] || cub.modelo_cubierta || cub.descripcion || '';
  const L = [`${nombrePila(p)}, te dejamos por acá el detalle de tu pedido con el saldo pendiente.`, ''];
  L.push(`${modelo}${cub.personas ? ' ' + cub.personas + ' personas' : ''}`.trim());
  const det = [cub.material_cubierta ? `${nombreMaterial(cub.material_cubierta)}${cub.espesor_mm ? ' ' + cub.espesor_mm + 'mm' : ''}` : null, cub.largo_cm ? `${num(cub.largo_cm)} x ${num(cub.ancho_cm)}${cub.alto_cm ? ' x ' + num(cub.alto_cm) : ''} cm` : null, cub.color ? (NOMBRE_COLOR[cub.color] || cub.color) : null, cub.tono ? (/^\d$/.test(cub.tono) ? 'barniz ' + ({ 1: 'natural', 2: '2 manos', 4: '4 manos' }[cub.tono] || 'tono ' + cub.tono) : 'barniz ' + (NOMBRE_COLOR[cub.tono] || cub.tono)) : null].filter(Boolean);
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
/* Harold 15-oct (captura): WhatsApp de escritorio en el Mac muestra � en vez de los emojis y perdió la línea de Webpay del texto que viene en el
   enlace (el enlace sale correcto de la app). Por eso todo enlace wa.me pasa por aquí: el mensaje se copia al portapapeles y en pantallas con
   mouse (Mac) el chat se abre sin texto para pegarlo con Cmd+V; en la tablet o el celular (pantalla táctil) el texto va prellenado.
   Harold 22-oct (captura): "al poner el botón de wsp no me deja el texto predeterminado". En el Mac se abre ahora WhatsApp Web (siempre la misma
   pestaña) con el mensaje ya escrito y sin emojis, que eran los que salían como �; el mensaje completo queda igual en el portapapeles. */
const esTactil = () => window.matchMedia && window.matchMedia('(pointer:coarse)').matches;
const sinEmojis = t => t.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{25A0}-\u{25FF}️‍]/gu, '').replace(/[ \t]{2,}/g, ' ').replace(/^[ \t]+/gm, '');
async function abrirWa(url) {
  const [base, q] = url.split('?text='); const texto = q ? decodeURIComponent(q) : '';
  let copiado = false; if (texto && navigator.clipboard) { try { await navigator.clipboard.writeText(texto); copiado = true; } catch (e) { } }
  if (texto && !esTactil()) {
    const tel = base.replace('https://wa.me/', '').replace(/\D/g, '');
    aviso('Se abre WhatsApp Web con el mensaje escrito' + (copiado ? ' (también quedó copiado: Cmd+V si hiciera falta)' : ''));
    window.open(`https://web.whatsapp.com/send?${tel ? 'phone=' + tel + '&' : ''}text=${encodeURIComponent(sinEmojis(texto))}`, 'santino_wsp');
  }
  else window.open(url, '_blank');
}
document.addEventListener('click', ev => { const a = ev.target.closest && ev.target.closest('a[href^="https://wa.me/"]'); if (!a) return; ev.preventDefault(); ev.stopPropagation(); abrirWa(a.href); }, true);
/* Plano desde la ODT y la ficha (Harold 20-oct-2026: "que Alexis lo imprima directo desde la ODT para el carpintero").
   21-oct-2026 (Harold: en la tablet el PDF abría en otra pestaña sin opción de imprimir): visor DENTRO de la app con botón Imprimir.
   Cada hoja del PDF se dibuja con pdf.js como imagen y se imprime con window.print() (igual que la ODT); si pdf.js no carga, se abre el PDF como antes. */
let pdfjsListo = null;
function cargarPdfJs() {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  if (pdfjsListo) return pdfjsListo;
  const base = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/';
  return pdfjsListo = new Promise((ok, mal) => {
    const sc = document.createElement('script'); sc.src = base + 'pdf.min.js';
    sc.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = base + 'pdf.worker.min.js'; ok(window.pdfjsLib); };
    sc.onerror = () => { pdfjsListo = null; mal(new Error('No se pudo cargar el visor de planos')); };
    document.head.appendChild(sc);
  });
}
async function blobDePlano(d) {
  if (d.storage_path) { const r = await sb.storage.from('documentos').download(d.storage_path); if (r.error) throw r.error; return r.data; }
  const r = await fetch(d.url); if (!r.ok) throw new Error('No se pudo abrir el plano'); return await r.blob();
}
async function abrirVisorPlanos(pedidoId) {
  const { data: docs, error } = await sb.from('documento').select('nombre,storage_path,url,subido_en').eq('pedido_id', pedidoId).eq('tipo', 'Plano').order('subido_en', { ascending: false });
  if (error) throw error;
  if (!(docs || []).length) throw new Error('Este pedido no tiene plano cargado');
  const pdfjs = await cargarPdfJs();
  const v = document.createElement('div'); v.id = 'visor-plano';
  v.innerHTML = `<div class="vp-barra"><div class="vp-tabs">${docs.map((d, i) => `<button type="button" class="btn chico${i ? '' : ' primario'}" data-i="${i}">${esc(d.nombre.replace(/^Planos? de producción · /, ''))}</button>`).join('')}</div>
    <span class="vp-esp"></span><button type="button" class="btn primario" id="vp-imp">Imprimir</button><button type="button" class="btn" id="vp-desc">Descargar PDF</button><button type="button" class="btn" id="vp-x">Cerrar</button></div>
    <div class="vp-paginas"><div class="vp-msg">Preparando el plano…</div></div>`;
  document.body.appendChild(v);
  const urls = []; let blobActual = null, nombreActual = '', turno = 0;
  const cerrar = () => { urls.forEach(u => URL.revokeObjectURL(u)); v.remove(); };
  async function mostrar(i) {
    const mio = ++turno; const cont = $('.vp-paginas', v); cont.innerHTML = '<div class="vp-msg">Preparando el plano…</div>';
    $$('.vp-tabs button', v).forEach(b => b.classList.toggle('primario', Number(b.dataset.i) === i));
    try {
      const blob = await blobDePlano(docs[i]); if (mio !== turno) return;
      blobActual = blob; nombreActual = docs[i].nombre;
      const pdf = await pdfjs.getDocument({ data: await blob.arrayBuffer() }).promise;
      for (let n = 1; n <= pdf.numPages; n++) {
        const pag = await pdf.getPage(n); const vp0 = pag.getViewport({ scale: 1 });
        const vp = pag.getViewport({ scale: 2000 / vp0.width }); const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height;
        await pag.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
        const jpg = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.88)); c.width = c.height = 0;
        if (mio !== turno) return;
        const u = URL.createObjectURL(jpg); urls.push(u); if (n === 1) cont.innerHTML = '';
        cont.insertAdjacentHTML('beforeend', `<img src="${u}" alt="Hoja ${n} de ${pdf.numPages}">`);
      }
    } catch (e) { if (mio === turno) $('.vp-paginas', v).innerHTML = `<div class="vp-msg">No se pudo mostrar el plano: ${esc(errorDe(e))}</div>`; }
  }
  $$('.vp-tabs button', v).forEach(b => b.onclick = () => mostrar(Number(b.dataset.i)));
  $('#vp-x', v).onclick = cerrar;
  $('#vp-imp', v).onclick = () => window.print();
  $('#vp-desc', v).onclick = () => { if (!blobActual) return; const u = URL.createObjectURL(blobActual); const a = document.createElement('a'); a.href = u; a.download = nombreActual.replace(/[^\w.\-· ]/g, '_') + '.pdf'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000); };
  mostrar(0);
}
document.addEventListener('click', async ev => {
  const a = ev.target.closest && ev.target.closest('[data-abrir-plano]'); if (!a) return;
  ev.preventDefault(); ev.stopPropagation();
  const id = Number(a.dataset.abrirPlano);
  try { await abrirVisorPlanos(id); }
  catch (e) {
    // Respaldo: el PDF más reciente en otra pestaña, como antes
    try {
      const { data: docs, error } = await sb.from('documento').select('storage_path,url').eq('pedido_id', id).eq('tipo', 'Plano').order('subido_en', { ascending: false }).limit(1);
      if (error) throw error; const d = (docs || [])[0]; if (!d) throw new Error('Este pedido no tiene plano cargado');
      let href = d.url; if (d.storage_path) { const r = await sb.storage.from('documentos').createSignedUrl(d.storage_path, 3600); if (r.error) throw r.error; href = r.data.signedUrl; }
      window.open(href, '_blank');
    } catch (e2) { aviso(errorDe(e2), true); }
  }
}, true);
function waLink(p, tipo) { return `https://wa.me/${telWa(p)}?text=${encodeURIComponent(tipo === 'despacho' ? mensajeDespacho(p) : `Hola ${nombrePila(p)}, te escribe Harold de Santino Design por tu pedido ${p.numero}.`)}`; }
async function abrirWaSaldo(p) {
  const { data: abonos } = await sb.from('abono').select('monto').eq('pedido_id', p.id).order('fecha');
  const texto = mensajeSaldo(p, abonos || []);
  const alertas = []; if (p.precio_instalacion > 80000) alertas.push(`Instalación ${pesos(p.precio_instalacion)} parece alta (¿un cero de más?)`); if (p.precio_despacho > 60000) alertas.push(`Despacho ${pesos(p.precio_despacho)} parece alto`);
  if (alertas.length) aviso('Revisa antes de enviar: ' + alertas.join(' · '), true);
  abrirWa(`https://wa.me/${telWa(p)}?text=${encodeURIComponent(texto)}`);
}
/* Harold 15-oct: en la Ruta el botón WhatsApp es una lista: confirmar despacho, saldo pendiente, y confirmación más saldo ofreciendo la
   instalación cuando el pedido no la lleva. Sin precio de instalación inventado: se ofrece y Harold confirma el valor por WhatsApp. */
function menuWsp(p, extra = '') {
  if (!telWa(p)) return '';
  const saldo = Number(p.saldo_por_cobrar ?? p.saldo ?? 0);
  if (!(saldo > 0)) return `<a class="btn chico" target="_blank" href="${waLink(p, 'despacho')}" title="Confirmación del despacho${p.instalacion ? '' : ' con oferta de instalación'}">WhatsApp</a>`;
  return `<span class="menu-mas"><button type="button" class="btn chico" data-wsp-menu="${p.id}">WhatsApp ▾</button><div class="menu-lista" data-wsp-lista="${p.id}"><button type="button" data-wsp="despacho" data-id="${p.id}">Confirmar despacho (con saldo${p.instalacion ? '' : ' y oferta de instalación'})</button><button type="button" data-wsp="saldo" data-id="${p.id}">Saldo pendiente (detalle del pedido)</button>${extra}</div></span>`;
}
function activarMenus(raiz) {
  $$('[data-menu]', raiz).forEach(b => b.onclick = ev => { ev.stopPropagation(); const l = $(`[data-menu-lista="${b.dataset.menu}"]`, raiz); const abierto = l.classList.contains('abierto'); $$('.menu-lista.abierto').forEach(x => x.classList.remove('abierto')); if (!abierto) { l.classList.add('abierto'); l.onclick = e => e.stopPropagation(); document.addEventListener('click', () => l.classList.remove('abierto'), { once: true }); } });
}
function activarMenusWsp(raiz) {
  $$('[data-wsp-menu]', raiz).forEach(b => b.onclick = ev => { ev.stopPropagation(); const l = $(`[data-wsp-lista="${b.dataset.wspMenu}"]`, raiz); const abierto = l.classList.contains('abierto'); $$('.menu-lista.abierto').forEach(x => x.classList.remove('abierto')); if (!abierto) { l.classList.add('abierto'); document.addEventListener('click', () => l.classList.remove('abierto'), { once: true }); } });
  $$('[data-wsp]', raiz).forEach(b => b.onclick = async ev => { ev.stopPropagation(); const p = cache.pedidos.find(x => x.id === Number(b.dataset.id)); if (!p) return; b.closest('.menu-lista').classList.remove('abierto');
    if (b.dataset.wsp === 'despacho') return abrirWa(waLink(p, 'despacho'));
    if (b.dataset.wsp === 'saldo') return abrirWaSaldo(p); });
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
  await cargarModelos();
  if (!p) { app.innerHTML = barra('') + `<div class="contenido"><div class="seccion">Este pedido no está disponible en tu vista.</div></div>`; return; }
  const [{ data: docs }, { data: hist }, { data: abonos }, { data: guias }, { data: movs }, { data: casos }, { data: garantia }] = await Promise.all([
    sb.from('documento').select('*').eq('pedido_id', id).order('subido_en', { ascending: false }),
    esOp ? Promise.resolve({ data: [] }) : sb.from('historial').select('*').eq('pedido_id', id).order('cuando', { ascending: false }).limit(60),
    sb.from('abono').select('*').eq('pedido_id', id).order('fecha'),
    sb.from('guia_despacho').select('*').eq('pedido_id', id).order('numero', { ascending: false }),
    sb.from('movimiento').select('*').eq('pedido_id', id).order('fecha'),
    sb.from('v_caso').select('*').eq('pedido_id', id).order('abierto_en', { ascending: false }),
    p.estado === 'ENTREGADO' ? sb.rpc('garantia_de', { p_id: Number(id) }) : Promise.resolve({ data: null }),
  ]);
  p.movimientos = movs || [];
  const r = rasgos(p); const aMedida = A_MEDIDA.includes(p.tipo_pedido);
  const piezas = (p.piezas || []);
  app.innerHTML = barra(esOp ? '#/taller' : '#/lista') + `<div class="contenido">
    <div class="encabezado"><a href="${esOp ? '#/taller' : '#/lista'}">‹ Volver</a><h1>${esc(p.numero)} · ${esc(p.cliente)}</h1>${estadoHtml(p.estado)}${aMedida ? `<span class="chip medida">${esc(p.tipo_pedido.toUpperCase())}</span>` : ''}${(p.etiquetas || []).filter(t => !t.startsWith('A MEDIDA')).map(chip).join(' ')}
      ${esOp && p.saldo_por_cobrar > 0 ? `<span class="chip saldo">COBRAR ${pesos(p.saldo_por_cobrar)} AL ENTREGAR</span>` : ''}
      <div class="espacio"></div>
      ${esOp ? '' : `<label style="font-size:13px;display:flex;align-items:center;gap:6px"><input type="checkbox" id="c-urgente" ${p.urgente ? 'checked' : ''}> Urgente</label>
      ${p.estado === 'ENTREGADO' ? `<button class="btn chico borde" id="b-postventa" title="Crea un pedido de postventa ligado a este (visita técnica, retiro, reparación)">+ Postventa</button>` : ''}
      <label style="font-size:13px">Tipo <select id="s-tipo" title="Cambiar el tipo de pedido si se ingresó mal">${Object.keys(COD_TIPO).map(t => `<option ${t === p.tipo_pedido ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      <label style="font-size:13px">Estado <select id="s-estado">${ESTADOS.map(e => `<option ${e === p.estado ? 'selected' : ''}>${e}</option>`).join('')}</select></label>`}
    </div>
    ${aMedida && !esOp ? `<div class="pasos" style="margin-bottom:12px">${['VISITA TÉCNICA', 'DIBUJO 3D', 'DISEÑO APROBADO', 'EN FABRICACIÓN', 'LISTO EN TALLER', 'DESPACHO PROGRAMADO', 'ENTREGADO'].map(e => `<span class="${e === p.estado ? 'activo' : ''}">${e}</span>`).join('')}<span style="background:none">La fabricación solo parte con DISEÑO APROBADO (R-139)</span></div>` : ''}
    <div class="grid-ficha"><div class="columna">
      <section class="seccion"><div class="cab"><h2>Piezas del pedido · toca una para avanzar de etapa (clic derecho: volver)</h2>${esOp ? '' : `<button class="btn chico" id="b-linea">+ Agregar línea</button>`}</div>
        <div class="tabla-env">${tablaPiezasHtml(p, esOp)}</div>
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
          ${['EN FABRICACIÓN', 'POR FABRICAR', 'DISEÑO APROBADO'].includes(p.estado) ? (p.piezas_total > 0 ? `<button class="btn primario" id="b-listo" ${p.piezas_listas < p.piezas_total ? 'disabled' : ''}>Marcar LISTO EN TALLER</button><span style="font-size:12px;color:var(--gris-2)">${p.piezas_listas} de ${p.piezas_total} piezas embaladas</span>` : '<span style="font-size:12px;color:var(--gris-2)">Sin piezas de taller: este pedido se resuelve con su movimiento (visita, retiro); si lleva una pieza, agrégala con "Agregar línea".</span>') : ''}
          ${p.estado === 'LISTO EN TALLER' ? `<label style="font-size:13px">Proponer despacho <input type="date" id="f-prop" value="${p.despacho_propuesto || ''}"></label><button class="btn borde" id="b-prop">Proponer</button>${!esOp ? `<button class="btn primario" id="b-conf">Cliente confirmó: programar</button>` : ''}` : ''}
          ${!esOp && p.cliente_telefono ? `<a class="btn" target="_blank" href="${waLink(p, 'despacho')}" title="Mensaje 1 de las plantillas de despacho">WhatsApp: confirmar despacho</a>${p.saldo > 0 ? `<button class="btn" id="b-wa-saldo">WhatsApp: saldo pendiente</button>` : ''}` : ''}
          ${p.estado === 'DESPACHO PROGRAMADO' ? `<button class="btn primario" id="b-entregar">Marcar ENTREGADO</button>` : `<span class="prog-desp"><input type="date" data-prog-fecha="${p.id}" value="${p.despacho_propuesto || p.fecha_comprometida || ''}" style="min-height:32px;padding:4px 8px"><button class="btn primario" data-programar="${p.id}">Programar despacho</button></span>`}
          ${p.cotizacion_numero ? `<span style="font-size:12px;color:var(--gris-2)">Cotización ${esc(p.cotizacion_numero)}</span>` : ''}
        </div>
      </section>
      ${movimientosHtml(p, esOp)}
      ${sinMontos(p) ? `<section class="seccion"><div class="cab"><h2>Pagos</h2></div><div class="gris">Proyecto: total, abonos y saldo ${TXT_SIN_MONTOS}.</div></section>` : `<section class="seccion"><div class="cab"><h2>Pagos</h2><span style="display:flex;gap:6px">${esOp ? '' : '<button class="btn chico" id="b-precios" title="Corregir venta, despacho, instalación o embalaje">Editar precios</button>'}<button class="btn chico borde" id="b-abono">+ Registrar ${esOp ? 'cobro' : 'abono'}</button></span></div>
        <div class="cifras">${esOp ? `<div class="cifra"><div>Total</div><div>${pesos(p.total)}</div></div>` : `<div class="cifra"><div>Venta</div><div>${pesos(p.precio_venta)}</div></div><div class="cifra"><div>Despacho + instalación</div><div>${pesos(p.precio_despacho + p.precio_instalacion + p.precio_embalaje)}</div></div>`}<div class="cifra"><div>Abonado</div><div>${pesos(p.abonado)} ${pctAbono(p)}</div></div><div class="cifra"><div>Saldo${esOp ? ' por cobrar' : ' (calculado)'}</div><div style="color:${(p.saldo ?? p.saldo_por_cobrar) > 0 ? 'var(--ambar-txt)' : 'var(--verde)'}">${pesos(p.saldo ?? p.saldo_por_cobrar)}</div></div>${esOp ? '' : `<div class="cifra" id="cifra-margen" title="Fase 6: costo manual, de la cotización o del motor; clic para fijar el costo a mano"><div>Costo est. · margen</div><div class="gris" style="font-size:14px">calculando…</div></div>`}</div>
        ${grupoHtml(p, esOp)}
        ${abonos.length ? `<div class="tabla-env"><table class="lista"><thead><tr><th>Fecha</th><th>Monto</th><th>Medio</th><th>Cuenta</th><th>Referencia</th><th>Comprobante</th><th>Registró</th></tr></thead><tbody>${abonos.map(a => `<tr><td class="nw">${fecha(a.fecha)}</td><td class="mono">${pesos(a.monto)}</td><td>${esc(a.medio_pago)}</td><td>${esc(cuentaNombre(a.cuenta))}</td><td>${esc(a.referencia || '')}</td><td>${a.comprobante_url ? `<a href="${esc(a.comprobante_url)}" target="_blank">ver</a>` : '-'}</td><td>${esc(a.registrado_por)}</td></tr>`).join('')}</tbody></table></div>` : '<div style="color:var(--gris-3);font-size:13px">Sin abonos todavía</div>'}
        ${esOp ? '' : `<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;font-size:13px"><span>Documento tributario</span><select id="s-doc"><option ${p.documento_tributario === 'Pendiente' ? 'selected' : ''}>Pendiente</option><option ${p.documento_tributario === 'Boleta emitida' ? 'selected' : ''}>Boleta emitida</option><option ${p.documento_tributario === 'Factura emitida' ? 'selected' : ''}>Factura emitida</option></select><input id="i-docnum" placeholder="N°" value="${esc(p.documento_numero || '')}" style="width:90px"><input type="date" id="i-docfecha" value="${p.documento_fecha || ''}"><button class="btn chico" id="b-doc">Guardar</button></div>`}
      </section>`}
      ${`${esOp && !(casos || []).length ? '' : casosFichaHtml(casos || [], esOp)}
      <section class="seccion"><div class="cab"><h2>Guías de despacho</h2>${esOp && p.tipo_pedido === 'Proyecto' ? '' : '<button class="btn chico borde" id="b-guia">+ Nueva guía de despacho</button>'}</div>
        ${(guias || []).length ? `<div class="docs">${guias.map(g => `<div class="doc"><span>Guía N° ${g.numero}${g.anulada ? ' (anulada)' : ''}<div class="tipo">${fecha(g.fecha)} · ${g.bultos} bulto${g.bultos > 1 ? 's' : ''} · ${esc(g.modalidad)} · ${esc(g.estado_pago)} · ${esc(g.emitida_por)}</div></span><a class="btn chico" href="#/guia/${g.id}">Ver / imprimir</a></div>`).join('')}</div>` : '<div style="color:var(--gris-3);font-size:13px">Sin guías emitidas. El correlativo sigue en la base (siguiente: el que muestre el formulario).</div>'}
      </section>
      <section class="seccion"><h2>Historial</h2><div class="historial">${hist.map(h => `<div><time>${fechaHora(h.cuando)}</time><span><strong>${esc(h.quien)}</strong> ${esc(h.campo)}: ${h.valor_anterior ? esc(h.valor_anterior) + ' → ' : ''}${esc(h.valor_nuevo || '')}</span></div>`).join('') || '<span style="color:var(--gris-3)">Sin movimientos</span>'}</div></section>`}
    </div><aside class="columna">
      <section class="seccion"><div class="cab"><h2>Cliente</h2>${esOp ? '' : '<button class="btn chico borde" id="b-cliente">Editar cliente</button>'}</div>
        <div><strong>${esc(p.cliente)}</strong>${p.tipo_cliente ? ' · ' + esc(p.tipo_cliente) : ''}${p.cliente_empresa ? ' · ' + esc(p.cliente_empresa) : ''}</div>
        <div class="fila-dato"><span>Teléfono</span><span>${p.cliente_telefono ? esc(p.cliente_telefono) + ` <a target="_blank" href="https://wa.me/${telWa(p)}">WSP</a>` : '<span class="falta-dato">sin teléfono</span>'}</span></div>
        <div class="fila-dato"><span>Correo</span><span>${esc(p.cliente_email || '-')}</span></div>
        <div class="fila-dato"><span>Dirección</span><span>${p.direccion ? esc(p.direccion) : '<span class="falta-dato">sin dirección</span>'}</span></div>
        <div class="fila-dato"><span>Comuna</span><span>${p.comuna ? esc(p.comuna) : '<span class="falta-dato">sin comuna</span>'}</span></div>
      </section>
      <section class="seccion"><div class="cab"><h2>Fechas y entrega</h2>${esOp ? '' : '<span style="display:flex;gap:6px"><button class="btn chico borde" id="b-entrega">Editar entrega</button><button class="btn chico borde" id="b-repetir" title="Nuevo pedido para este cliente con las mismas piezas, precios y entrega; cambia lo que difiera">Repetir pedido</button></span>'}</div>
        <div class="fila-dato"><span>Compra</span><span>${fecha(p.fecha_compra)}${p.fecha_compra_estimada ? ' <span class="falta-dato">(estimada)</span>' : ''}</span></div>
        <div class="fila-dato"><span>Origen</span><span>${esc(origenTxt(p)) || '-'}${!esOp && ['WhatsApp', 'Instagram', 'Shopify'].includes(p.origen) && !p.origen_codigo && !p.origen_red ? ' <small class="gris">(sin código ni red: Editar entrega)</small>' : ''}</span></div>
        <div class="fila-dato"><span>Entrega cliente</span>${esOp ? `<span>${fecha(p.fecha_comprometida || p.fecha_estimada, true)}${p.fecha_comprometida ? '' : ' <small class="gris">aprox.</small>'}</span>` : `<span><input type="date" id="i-comp" value="${p.fecha_comprometida || ''}" style="min-height:32px;padding:4px 8px" title="Fecha comprometida con el cliente; vacía = aproximada">${p.fecha_comprometida ? '' : ` <small class="gris">aprox. ${fecha(p.fecha_estimada)} (+21 d)</small>`}</span>`}</div>
        <div class="fila-dato"><span>Entrega</span><span>${esc(p.tipo_entrega)}${p.instalacion ? ' + instalación' : ''}</span></div>
        ${p.direccion_entrega || p.comuna_entrega ? `<div class="fila-dato"><span>Dirección de entrega</span><span>${esc([p.direccion_entrega, p.comuna_entrega].filter(Boolean).join(', '))}</span></div>` : ''}
        <div class="fila-dato"><span>Nota de entrega</span><span>${esc(p.nota_entrega || '-')}</span></div>
        <div class="fila-dato"><span>Recibe</span><span>${p.hora_desde || p.hora_hasta ? `${hhmm(p.hora_desde) || '…'} a ${hhmm(p.hora_hasta) || '…'}` : 'sin restricción de horario'}${esOp ? '' : ` <button class="btn chico borde" id="b-horario" style="margin-left:6px">Cambiar</button>`}</span></div>
        ${p.estado === 'DESPACHO PROGRAMADO' ? `<div class="fila-dato"><span>Cliente confirmó</span><span>${p.despacho_confirmado_en ? '<span class="chip ok">SÍ · ' + fechaHora(p.despacho_confirmado_en) + '</span>' : '<span class="chip saldo">POR CONFIRMAR</span>' + (esOp ? ' <small class="gris">Harold confirma</small>' : ` <a class="btn chico" target="_blank" href="${waLink(p, 'despacho')}">WhatsApp</a> <button class="btn chico primario" id="b-conf2">Confirmó</button>`)}</span></div>` : ''}
        ${p.cotizacion_numero ? `<div class="fila-dato"><span>Cotización</span><span>${esc(p.cotizacion_numero)}</span></div>` : ''}
        ${garantia ? garantiaHtml(garantia) : ''}
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
  cache.pedidos = cache.pedidos || []; if (!cache.pedidos.find(x => x.id === p.id)) cache.pedidos.push(p);
  activarEtapas(app, recargar);
  activarPiezasEdicion(app, recargar);
  activarFechaMaestro(app, p, recargar);
  activarProgramar(app, p, recargar);
  activarMovimientos(app, p, recargar);
  activarCompras(app, p, recargar);
  $$('.caso-fila').forEach(d => d.onclick = () => modalCaso(Number(d.dataset.caso)));
  { const bc = $('#b-caso'); if (bc) bc.onclick = () => formCaso({ pedido_id: p.id, cliente_id: p.cliente_id, numero: p.numero, cliente: p.cliente }); }
  $$('[data-ver]').forEach(b => b.onclick = async () => { const { data, error } = await sb.storage.from('documentos').createSignedUrl(b.dataset.ver, 3600); if (error) return aviso(errorDe(error), true); window.open(data.signedUrl, '_blank'); });
  const on = (sel, fn) => { const el = $(sel); if (el) el.onclick = fn; };
  on('#b-abono', () => formAbono(p, recargar));
  on('#b-unir', () => formUnir(p, recargar));
  on('#b-separar', async () => { if (!confirm(`¿Separar ${p.numero} de los pedidos unidos? Sus abonos se quedan donde están.`)) return; try { await rpc('separar_pedido', { p_id: p.id }); aviso('Separado'); recargar(); } catch (e) { aviso(errorDe(e), true); } });
  on('#b-listo', async () => { try { await rpc('cambiar_estado', { p_pedido_id: Number(id), p_estado: 'LISTO EN TALLER' }); aviso('Listo en taller'); anotarCambio(`${p.numero} listo en taller (volver a ${p.estado})`, () => rpc('cambiar_estado', { p_pedido_id: Number(id), p_estado: p.estado })); recargar(); } catch (e) { aviso(errorDe(e), true); } });
  on('#b-horario', () => formHorarioEntrega(p, recargar));
  on('#b-conf2', async () => { try { await rpc('confirmar_despacho', { p_pedido_id: Number(id) }); aviso('Confirmado por el cliente ✓'); anotarCambio('confirmación del cliente (volver a por confirmar)', () => rpc('confirmar_despacho', { p_pedido_id: Number(id), p_quitar: true })); recargar(); } catch (e) { aviso(errorDe(e), true); } });
  on('#b-prop', async () => { const f = $('#f-prop').value; if (!f) return aviso('Elige una fecha', true); try { await rpc('proponer_despacho', { p_pedido_id: Number(id), p_fecha: f }); aviso('Propuesta guardada; Harold envía el mensaje'); recargar(); } catch (e) { aviso(errorDe(e), true); } });
  on('#b-conf', async () => { try { await rpc('confirmar_despacho', { p_pedido_id: Number(id), p_fecha: $('#f-prop').value || null }); aviso('Despacho programado'); recargar(); } catch (e) { aviso(errorDe(e), true); } });
  on('#b-entregar', () => formEntregar(p, recargar));
  on('#b-wa-saldo', () => abrirWaSaldo(p));
  if (!esOp) {
    $('#s-estado').onchange = async ev => { if (ev.target.value === 'ENTREGADO' && !confirmarEntregaAnticipada(p)) { ev.target.value = p.estado; return; } try { await rpc('cambiar_estado', { p_pedido_id: Number(id), p_estado: ev.target.value }); aviso('Estado: ' + ev.target.value); anotarCambio(`estado de ${p.numero} (volver a ${p.estado})`, () => rpc('cambiar_estado', { p_pedido_id: Number(id), p_estado: p.estado })); } catch (e) { aviso(errorDe(e), true); } recargar(); };
    $('#s-tipo').onchange = async ev => { const nuevo = ev.target.value, antes = p.tipo_pedido; const { error } = await sb.from('pedido').update({ tipo_pedido: nuevo }).eq('id', id); aviso(error ? errorDe(error) : 'Tipo de pedido: ' + nuevo, !!error); if (!error) { anotarCambio(`tipo de ${p.numero} (volver a ${antes})`, () => sb.from('pedido').update({ tipo_pedido: antes }).eq('id', id).then(r => { if (r.error) throw r.error; })); recargar(); } };
    $('#c-urgente').onchange = async ev => { const nuevo = ev.target.checked; const { error } = await sb.from('pedido').update({ urgente: nuevo }).eq('id', id); aviso(error ? errorDe(error) : (nuevo ? 'Marcado urgente' : 'Ya no es urgente'), !!error); if (!error) anotarCambio(`urgente de ${p.numero}`, () => sb.from('pedido').update({ urgente: !nuevo }).eq('id', id).then(r => { if (r.error) throw r.error; })); };
    $('#i-comp').onchange = async ev => { const { error } = await sb.from('pedido').update({ fecha_comprometida: ev.target.value || null }).eq('id', id); aviso(error ? errorDe(error) : 'Fecha comprometida guardada (queda en el historial)', !!error); if (!error) anotarCambio(`fecha de entrega de ${p.numero}`, () => sb.from('pedido').update({ fecha_comprometida: p.fecha_comprometida }).eq('id', id).then(r => { if (r.error) throw r.error; })); recargar(); };
    on('#b-obs', async () => { const { error } = await sb.from('pedido').update({ observacion: $('#t-obs').value }).eq('id', id); aviso(error ? errorDe(error) : 'Observación guardada', !!error); if (!error) anotarCambio(`observación de ${p.numero}`, () => sb.from('pedido').update({ observacion: p.observacion }).eq('id', id).then(r => { if (r.error) throw r.error; })); });
    on('#b-doc', async () => { const { error } = await sb.from('pedido').update({ documento_tributario: $('#s-doc').value, documento_numero: $('#i-docnum').value || null, documento_fecha: $('#i-docfecha').value || null }).eq('id', id); aviso(error ? errorDe(error) : 'Documento guardado', !!error); recargar(); });
    on('#b-abono', () => formAbono(p, recargar));
    on('#b-cliente', () => formEditarCliente(p, recargar));
    on('#b-postventa', () => formPostventa(p));
    on('#b-entrega', () => formEditarEntrega(p, recargar));
    on('#b-repetir', () => formPedido({ cliente: { id: p.cliente_id, nombre: p.cliente, telefono: p.cliente_telefono, comuna: p.comuna }, base: p }));
    on('#b-precios', () => formEditarPrecios(p, recargar));
    on('#b-subir', () => formSubir(p, recargar));
    on('#b-linea', () => formLinea(p, recargar));
    on('#b-guia', () => formGuia(p));
  }
  if (!esOp) pintarMargenFicha(p).catch(() => {});   // Fase 6: costo y margen (solo Harold)
}
/* Pedidos unidos (tanda 30, Harold 14-oct, Belén Ureta Studio): cada pedido sigue siendo una fila con sus piezas, entrega y guía;
   comparten el pago. Un abono del grupo completa primero el saldo del pedido que se entrega antes y el resto pasa al siguiente. */
function grupoHtml(p, esOp) {
  const g = p.grupo;
  const botones = esOp ? '' : `<span style="display:flex;gap:6px">${g && g.n > 1 ? `<button class="btn chico" id="b-unir">Unir otro pedido</button><button class="btn chico" id="b-separar">Separar este</button>` : `<button class="btn chico" id="b-unir" title="Unir este pedido con otro del mismo cliente para que compartan el pago">Unir con otro pedido</button>`}</span>`;
  if (!g || g.n < 2) return esOp ? '' : `<div style="display:flex;gap:10px;align-items:center;font-size:12px;color:var(--gris-3)"><span>Pedido sin unir.</span>${botones}</div>`;
  return `<div class="grupo-caja"><div class="cab"><h3 style="margin:0;font-size:13px">Pedidos unidos (${g.n})${g.nombre ? ` · ${esc(g.nombre)}` : ''} <small class="gris">pago compartido: un abono completa primero el que se entrega antes</small></h3>${botones}</div>
    <table class="lista"><thead><tr><th>Pedido</th><th>Estado</th><th>Entrega</th><th>Total</th><th>Abonado</th><th>Saldo</th></tr></thead><tbody>
    ${g.pedidos.map(x => `<tr class="${x.id === p.id ? 'fila-actual' : ''}"><td class="nw">${x.id === p.id ? `<b>${esc(x.numero)}</b>` : `<a href="#/pedido/${x.id}">${esc(x.numero)}</a>`}</td><td>${estadoHtml(x.estado, COD_ESTADO[x.estado])}</td><td class="nw">${fecha(x.fecha)}</td><td class="mono">${pesos(x.total)}</td><td class="mono">${pesos(x.abonado)}</td><td class="mono ${x.saldo > 0 ? 'rojo' : ''}">${x.saldo > 0 ? pesos(x.saldo) : x.saldo < 0 ? pesos(-x.saldo) + ' a favor' : 'pagado'}</td></tr>`).join('')}
    <tr class="total-row"><td colspan="3"><b>Grupo</b></td><td class="mono"><b>${pesos(g.total)}</b></td><td class="mono"><b>${pesos(g.abonado)}</b></td><td class="mono ${g.saldo > 0 ? 'rojo' : ''}"><b>${g.saldo > 0 ? pesos(g.saldo) : g.saldo < 0 ? pesos(-g.saldo) + ' a favor' : 'pagado'}</b></td></tr></tbody></table></div>`;
}
function formUnir(p, despues) {
  modal(`<h2>Unir ${esc(p.numero)} con otro pedido</h2><div class="gris" style="font-size:12px">Los pedidos unidos siguen siendo filas separadas (cada uno con sus piezas, su entrega y su guía) y comparten el pago. Deben ser del mismo cliente (${esc(p.cliente)}).</div><form id="f-unir"><div class="campos">
    <label class="campo">Número del otro pedido (W3129, #2079; varios separados por coma) <input name="numeros" required placeholder="W3129, W3130"></label>
    <label class="campo">Nombre del grupo (opcional) <input name="nombre" placeholder="ej. sofás oficina"></label></div>
    <div class="acciones"><button type="button" class="btn" onclick="cerrarModal()">Cancelar</button><button class="btn primario">Unir</button></div></form>`);
  $('#f-unir').onsubmit = async ev => { ev.preventDefault(); const f = new FormData(ev.target); try {
    const nums = String(f.get('numeros') || '').split(/[,\s]+/).map(s => s.trim()).filter(Boolean);
    const { data, error } = await sb.from('pedido').select('id, numero').in('numero', nums); if (error) throw error;
    const falta = nums.filter(n => !(data || []).some(d => d.numero === n)); if (falta.length) throw new Error('No existe: ' + falta.join(', '));
    const g = await rpc('unir_pedidos', { p_ids: [p.id, ...data.map(d => d.id)], p_nombre: f.get('nombre') || null });
    cerrarModal(); aviso(`Unidos: ${g.numeros.join(', ')}`); despues();
  } catch (e) { aviso(errorDe(e), true); } };
}
async function formAbono(p, despues) {
  await cargarModelos();
  const g = p.grupo && p.grupo.n > 1 ? p.grupo : null; const saldoP = (p.saldo ?? p.saldo_por_cobrar) || 0;
  modal(`<h2>Registrar ${yo.rol === 'operacion' ? 'cobro' : 'abono'} · ${esc(p.numero)}</h2><form id="f">
    ${g ? `<div class="entrega-cobro" style="margin-bottom:8px"><label><input type="radio" name="alcance" value="grupo" checked> Repartir entre los pedidos unidos (${esc(g.numeros.join(', '))}): completa primero el que se entrega antes · saldo del grupo ${pesos(g.saldo)}</label><label><input type="radio" name="alcance" value="pedido"> Solo este pedido (${esc(p.numero)}, saldo ${pesos(saldoP)})</label></div>` : ''}
    <div class="campos">
    <label class="campo">Monto (negativo = devolución) <input name="monto" type="number" required value="${g ? (g.saldo > 0 ? g.saldo : '') : (saldoP > 0 ? saldoP : '')}"></label>
    <label class="campo">Medio <select name="medio"><option>Transferencia</option><option>Webpay</option><option>MercadoPago</option><option>Getnet</option><option>Efectivo</option><option>Shopify</option></select></label>
    <label class="campo">Cuenta a la que pagó <select name="cuenta"><option value="">(sin anotar)</option>${cuentasOpciones()}</select></label>
    <label class="campo">Fecha <input name="fecha" type="date" value="${hoyISO()}"></label>
    <label class="campo">Referencia <input name="ref" placeholder="N° de operación, NC, nota"></label>
    <label class="campo">Comprobante (imagen o PDF) <input name="archivo" type="file" accept="image/*,.pdf"></label></div>
    <div class="acciones"><button type="button" class="btn" onclick="cerrarModal()">Cancelar</button><button class="btn primario">Guardar</button></div></form>`);
  $$('input[name=alcance]').forEach(r => r.onchange = () => { const m = $('input[name=monto]'); const v = $('input[name=alcance]:checked').value; m.value = v === 'grupo' ? (g.saldo > 0 ? g.saldo : '') : (saldoP > 0 ? saldoP : ''); });
  $('#f').onsubmit = async ev => {
    ev.preventDefault(); const f = new FormData(ev.target); let url = null;
    try {
      const a = f.get('archivo');
      if (a && a.size) { const path = `${p.id}/comprobante_${Date.now()}_${a.name.replace(/[^\w.\-]/g, '_')}`; const { error } = await sb.storage.from('documentos').upload(path, a); if (error) throw error; await sb.from('documento').insert({ pedido_id: p.id, tipo: 'Comprobante', nombre: a.name, storage_path: path, subido_por: yo.nombre }); url = path; }
      const monto = Number(f.get('monto'));
      if (g && f.get('alcance') === 'grupo' && monto > 0) {
        const r = await rpc('registrar_abono_grupo', { p_grupo_id: g.id, p_monto: monto, p_medio: f.get('medio'), p_fecha: f.get('fecha'), p_referencia: f.get('ref') || null, p_cuenta: f.get('cuenta') || null, p_comprobante_url: url });
        aviso(`Abono repartido: ${r.reparto.map(x => x.numero + ' ' + pesos(x.monto) + (x.excedente ? ' (excedente)' : '')).join(' · ')} · saldo del grupo ${pesos(r.grupo.saldo)}`);
      } else {
        const r = await rpc('registrar_abono', { p_pedido_id: p.id, p_monto: monto, p_medio: f.get('medio'), p_fecha: f.get('fecha'), p_referencia: f.get('ref') || null, p_comprobante_url: url, p_cuenta: f.get('cuenta') || null });
        aviso(`Abono registrado · saldo ${pesos(r.saldo)}`);
      }
      cerrarModal(); despues();
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
/* Entrega con confirmación del saldo (Harold 14-oct, desde la tablet): si hay saldo, se confirma ahí mismo si se cobró o no;
   un solo paso: cobro (abono con medio y cuenta) más ENTREGADO, con foto opcional. Lo usan el deslizar de la Lista, el despliegue y la ficha. */
/* Harold 19-oct-2026: W3146 quedó ENTREGADO el 16-oct, tres días antes de la entrega confirmada (toque en el menú Estado de la tablet).
   Marcar ENTREGADO con fecha comprometida futura pide confirmación por todos los caminos (Entregar, deslizar, menú Estado de Harold). */
function confirmarEntregaAnticipada(p) {
  const f = p.fecha_comprometida || p.fecha_estimada; if (!f || String(f).slice(0, 10) <= hoyISO()) return true;
  return confirm(`${p.numero}: la entrega está programada para el ${fecha(String(f).slice(0, 10), true)}, no para hoy. ¿Seguro que ya se entregó?`);
}
async function formEntregar(p, despues) {
  await cargarModelos();
  const saldo = Number(p.saldo_por_cobrar ?? p.saldo ?? 0);
  modal(`<h2>Entregar · ${esc(p.numero)} · ${esc(p.cliente)}</h2><form id="f">
    ${saldo > 0 ? `<div style="padding:10px;border-radius:8px;background:var(--ambar);color:var(--ambar-txt);font-weight:700">Saldo pendiente ${pesos(saldo)}. ¿Se cobró en la entrega?</div>
    <div class="entrega-cobro"><label><input type="radio" name="cobro" value="si" checked> Sí, se cobró</label><label><input type="radio" name="cobro" value="no"> No, entregar con el saldo pendiente</label></div>
    ${p.grupo && p.grupo.n > 1 ? `<div class="gris" style="font-size:12px">Pedidos unidos (${esc(p.grupo.numeros.join(', '))}): saldo del grupo ${pesos(p.grupo.saldo)}. Lo que se cobre de más de ${pesos(saldo)} se aplica al siguiente pedido unido.</div>` : ''}
    <div class="campos" id="e-cobro"><label class="campo">Monto cobrado <input name="monto" type="number" min="0" value="${saldo}"></label><label class="campo">Medio <select name="medio"><option>Transferencia</option><option>Efectivo</option><option>Webpay</option><option>MercadoPago</option><option>Getnet</option></select></label><label class="campo">Cuenta a la que pagó <select name="cuenta"><option value="">(sin anotar)</option>${cuentasOpciones()}</select></label></div>` : '<div><span class="chip ok">PAGADO</span> <span class="gris" style="font-size:12px">sin saldo pendiente</span></div>'}
    <label class="campo">Foto de entrega (opcional) <input name="foto" type="file" accept="image/*" capture="environment"></label>
    <div class="acciones"><button type="button" class="btn" onclick="cerrarModal()">Cancelar</button><button class="btn primario">${saldo > 0 ? 'Aceptar y marcar ENTREGADO' : 'Marcar ENTREGADO'}</button></div></form>`);
  $$('input[name=cobro]').forEach(r => r.onchange = () => { const c = $('#e-cobro'); if (c) c.style.display = $('input[name=cobro]:checked').value === 'si' ? '' : 'none'; });
  $('#f').onsubmit = async ev => {
    ev.preventDefault(); if (!confirmarEntregaAnticipada(p)) return; const f = new FormData(ev.target); const foto = f.get('foto'); let url = null;
    const cobra = saldo > 0 && f.get('cobro') === 'si';
    try {
      if (foto && foto.size) { const path = `entregas/${p.id}_${Date.now()}.jpg`; const { error } = await sb.storage.from('documentos').upload(path, foto, { contentType: foto.type || 'image/jpeg' }); if (error) throw error; url = path; }
      const cobrado = cobra ? Number(f.get('monto') || saldo) : 0;
      const r = await rpc('entregar_pedido', { p_pedido_id: p.id, p_cobro: cobrado, p_medio: cobra ? f.get('medio') : 'Transferencia', p_cuenta: cobra ? (f.get('cuenta') || null) : null, p_foto_url: url });
      aviso(`${p.numero} entregado ✓${cobra ? ' · cobrado ' + pesos(cobrado) : ''}${r.saldo > 0 ? ' · queda saldo ' + pesos(r.saldo) : ''}${r.reparto && r.reparto.length ? ' · ' + r.reparto.map(x => x.numero + ' ' + pesos(x.monto)).join(', ') : ''}`); cerrarModal(); despues();
    } catch (e) { aviso(errorDe(e), true); }
  };
}
/* Deslizar una fila hacia la derecha en la tablet = entregar ese pedido (Harold 14-oct: "para marcar un pedido como entregado de forma
   rápida se me ocurre deslizar hacia la derecha"). Solo filas de pedido (no movimientos); abre la ventana de entrega con el saldo. */
function activarDeslizarEntrega() {
  $$('#tabla tr.fila:not(.mov-fila)').forEach(tr => {
    let x0 = null, y0 = null, dx = 0, activo = false;
    tr.addEventListener('touchstart', ev => { const t0 = ev.touches[0]; x0 = t0.clientX; y0 = t0.clientY; dx = 0; activo = !ev.target.closest('button, a, input, select'); }, { passive: true });
    tr.addEventListener('touchmove', ev => { if (!activo || x0 == null) return; const t0 = ev.touches[0]; dx = t0.clientX - x0; if (Math.abs(t0.clientY - y0) > 30) { activo = false; tr.style.transform = ''; return; } if (dx > 10) tr.style.transform = `translateX(${Math.min(dx, 140)}px)`; }, { passive: true });
    const fin = () => { tr.style.transform = ''; const ok = activo && dx > 110; x0 = null; activo = false; if (!ok) return;
      const p = cache.pedidos.find(x => x.id == tr.dataset.id); if (!p) return;
      if (['ENTREGADO', 'CANCELADO', 'DEVUELTO'].includes(p.estado)) return aviso(`${p.numero} ya está ${p.estado.toLowerCase()}`);
      // Harold 14-oct: la ventana solo cuando hay saldo pendiente; sin saldo, el deslizar entrega directo (con Deshacer)
      if (Number(p.saldo_por_cobrar ?? p.saldo ?? 0) > 0) return formEntregar(p, () => vLista());
      if (!confirmarEntregaAnticipada(p)) return;
      (async () => { try { await rpc('entregar_pedido', { p_pedido_id: p.id, p_cobro: 0 }); aviso(`${p.numero} entregado ✓ (pagado)`); anotarCambio(`${p.numero} entregado (volver a ${p.estado})`, () => rpc('cambiar_estado', { p_pedido_id: p.id, p_estado: p.estado })); vLista(); } catch (e) { aviso(errorDe(e), true); } })(); };
    tr.addEventListener('touchend', fin); tr.addEventListener('touchcancel', fin);
    // Mac (Harold 14-oct, "es clic izquierdo"): clic izquierdo y arrastrar la fila hacia la derecha = entregar. El arrastre de una fila
    // de pedido ya no mueve la tabla (para eso quedan las flechas ← → y la barra); un arrastre no abre el despliegue.
    tr.addEventListener('mousedown', ev => {
      if (ev.button !== 0 || ev.target.closest('button, a, input, select')) return;
      ev.stopPropagation(); x0 = ev.clientX; y0 = ev.clientY; dx = 0; activo = true;
      const mover = e => { if (!activo) return; dx = e.clientX - x0; if (Math.abs(e.clientY - y0) > 40) { activo = false; tr.style.transform = ''; return; } if (dx > 10) { tr.style.transform = `translateX(${Math.min(dx, 140)}px)`; tr.dataset.arrastrado = '1'; e.preventDefault(); } };
      const soltar = () => { window.removeEventListener('mousemove', mover); window.removeEventListener('mouseup', soltar); const hubo = dx > 10; fin(); if (hubo) setTimeout(() => { delete tr.dataset.arrastrado; }, 50); };
      window.addEventListener('mousemove', mover); window.addEventListener('mouseup', soltar);
    });
    tr.addEventListener('click', ev => { if (tr.dataset.arrastrado) { ev.stopPropagation(); ev.preventDefault(); } }, true);
  });
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
    <label class="campo">Largo abierta (solo extensible) <input name="${prefijo}largo_ext_cm" type="number" step="0.5" placeholder="180"></label>
    <label class="campo">Forma <select name="${prefijo}forma"><option value="">-</option><option>RECT</option><option>CUA</option><option>CIRC</option><option>OVAL</option></select></label>
    <label class="campo">Personas <input name="${prefijo}personas" type="number"></label>
    <label class="campo">Tono o barniz <select name="${prefijo}tono"><option value="">-</option>${['1', '2', '3', '4', '5', 'NGR', 'BL', 'GRIS', 'NOG', 'SIN BARNIZ', 'ESPECIAL'].map(t => `<option>${t}</option>`).join('')}</select></label>
    <label class="campo">Nota de acabado <input name="${prefijo}nota_acabado"></label>
    <label class="campo">Tipo silla <input name="${prefijo}tipo_silla" placeholder="TULIP, WISH, CROSS"></label>
    <label class="campo">Tapiz (material) <input name="${prefijo}tapiz" placeholder="Cueromix, Velvet, Lino"></label>
    <label class="campo">Color silla o del tapiz <input name="${prefijo}color_silla" placeholder="NGR, BL, BEIGE"></label>
    <label class="campo">Área de taller <select name="${prefijo}area_taller"><option value="">(sin área: no es pieza)</option><option>Carpintería</option><option>Soldadura</option><option>Barniz</option><option>Armado muebles</option><option>Vidrio/compras</option><option>Embalaje</option><option>Despacho</option></select></label>
  </div>`;
}
function leerLinea(f, prefijo = '') {
  const v = k => { const x = f.get(prefijo + k); return x === '' || x == null ? null : x; };
  const n = k => v(k) == null ? null : Number(v(k));
  return { tipo_linea: v('tipo_linea'), descripcion: v('descripcion'), cantidad: n('cantidad') || 1, modelo_cubierta: v('modelo_cubierta'), modelo_base: v('modelo_base'), material_cubierta: v('material_cubierta'), material_base: v('material_base'), color_estructura: v('color_estructura'), espesor_mm: n('espesor_mm'), largo_cm: n('largo_cm'), ancho_cm: n('ancho_cm'), alto_cm: n('alto_cm'), largo_ext_cm: n('largo_ext_cm'), forma: v('forma'), personas: n('personas'), tono: v('tono'), nota_acabado: v('nota_acabado'), tipo_silla: v('tipo_silla'), tapiz: v('tapiz'), color_silla: v('color_silla'), area_taller: v('area_taller') };
}
function formLinea(p, despues) {
  modal(`<h2>Agregar línea · ${esc(p.numero)}</h2><form id="f">${camposLinea()}<div class="acciones"><button type="button" class="btn" onclick="cerrarModal()">Cancelar</button><button class="btn primario">Guardar</button></div></form>`);
  $('#f').onsubmit = async ev => { ev.preventDefault(); const l = leerLinea(new FormData(ev.target)); l.pedido_id = p.id; l.orden = (p.piezas || []).length + 1; const { error } = await sb.from('linea_pedido').insert(l); if (error) return aviso(errorDe(error), true); aviso('Línea agregada'); cerrarModal(); despues(); };
}
/* Postventa desde un pedido entregado (Harold 13-oct): crea un pedido Postventa ligado al original (mismo cliente, sin valor, sin piezas)
   con su movimiento (visita técnica, retiro, otro). Si después lleva una pieza (repuesto, cubierta nueva) se agrega desde la ficha nueva. */
function formPostventa(p, fechaDefecto, despues) {
  modal(`<h2>Nueva postventa · ${esc(p.numero)} ${esc(p.cliente)}</h2><form id="f-pv"><div class="campos">
    <label class="campo">Qué hay que hacer <select name="tipo">${['Visita técnica', 'Retiro en cliente', 'Entrega', 'Instalación', 'Otro'].map(t => `<option>${t}</option>`).join('')}</select></label>
    <label class="campo">Fecha <input type="date" name="fecha" required value="${fechaDefecto || hoyISO(1)}"></label>
    <label class="campo">Dirección (vacía = la del pedido) <input name="direccion" placeholder="${esc(p.direccion_entrega || p.direccion || '')}"></label></div>
    <label class="campo" style="display:block;margin-top:8px">Qué se hace o se revisa <textarea name="nota" rows="2" style="width:100%" required placeholder="Ej. revisar cajón que no cierra, llevar rieles de 35 mm"></textarea></label>
    <label class="campo" style="display:block;margin-top:8px">Valor a cobrar (0 = sin costo) <input name="valor" type="number" value="0" min="0"></label>
    <p style="font-size:12px;color:var(--gris-2);margin:6px 0">Se crea un pedido POSTVENTA con número W nuevo, ligado a este, con el movimiento en la fecha indicada. Si lleva una pieza de taller, agrégala después en su ficha con "Agregar línea".</p>
    <div class="acciones"><button type="button" class="btn" onclick="cerrarModal()">Cancelar</button><button class="btn primario">Crear postventa</button></div></form>`);
  $('#f-pv').onsubmit = async ev => {
    ev.preventDefault(); const f = new FormData(ev.target);
    try {
      const numero = await rpc('siguiente_numero_w', {});
      const { data: np, error } = await sb.from('pedido').insert({ numero, tipo_pedido: 'Postventa', cliente_id: p.cliente_id, pedido_origen_id: p.id, origen: 'Interno', estado: 'POR FABRICAR', fecha_compra: hoyISO(), fecha_comprometida: f.get('fecha'), tipo_entrega: p.tipo_entrega || 'Despacho RM', instalacion: false, direccion_entrega: p.direccion_entrega || null, comuna_entrega: p.comuna_entrega || null, precio_venta: Number(f.get('valor') || 0), precio_despacho: 0, precio_instalacion: 0, precio_embalaje: 0, observacion: `Postventa de ${p.numero}: ${f.get('nota')}` }).select('id').single();
      if (error) throw error;
      const { error: e2 } = await sb.from('movimiento').insert({ pedido_id: np.id, tipo: f.get('tipo'), fecha: f.get('fecha'), direccion: (f.get('direccion') || '').trim() || null, nota: f.get('nota') });
      if (e2) throw e2;
      cerrarModal(); aviso(`Postventa ${numero} creada`); if (despues) despues(); else location.hash = '#/pedido/' + np.id;
    } catch (e) { aviso(errorDe(e), true); }
  };
}
/* Ficha: editar cliente, entrega y precios (Harold 13-oct: "si lo ingresaste sin número ni dirección, debería poder dejar ingresarlos") */
async function opcionesComuna(actual) { const { data } = await sb.from('comuna').select('nombre').order('nombre'); return `<option value="">-</option>` + (data || []).map(c => `<option ${c.nombre === actual ? 'selected' : ''}>${esc(c.nombre)}</option>`).join(''); }
async function formEditarCliente(p, despues) {
  const { data: c, error } = await sb.from('cliente').select('*').eq('id', p.cliente_id).single(); if (error) return aviso(errorDe(error), true);
  const op = await opcionesComuna(c.comuna);
  modal(`<h2>Editar cliente · ${esc(c.nombre)}</h2><form id="f-cli"><div class="campos">
    <label class="campo">Nombre <input name="nombre" value="${esc(c.nombre || '')}" required></label>
    <label class="campo">Tipo de cliente <select name="tipo_cliente">${['Particular', 'Arquitecto', 'Diseñador', 'Contratista', 'Empresa'].map(t => `<option ${t === c.tipo_cliente ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
    <label class="campo">Teléfono (+569XXXXXXXX) <input name="telefono" value="${esc(c.telefono || '')}" placeholder="+56912345678"></label>
    <label class="campo">Teléfono 2 <input name="telefono_2" value="${esc(c.telefono_2 || '')}"></label>
    <label class="campo">Correo <input name="email" type="email" value="${esc(c.email || '')}"></label>
    <label class="campo">RUT <input name="rut" value="${esc(c.rut || '')}"></label>
    <label class="campo">Empresa <input name="empresa" value="${esc(c.empresa || '')}"></label>
    <label class="campo">Dirección <input name="direccion" value="${esc(c.direccion || '')}"></label>
    <label class="campo">Comuna <select name="comuna">${op}</select></label>
    <label class="campo">Notas <input name="notas" value="${esc(c.notas || '')}"></label></div>
    <div class="acciones"><button type="button" class="btn" onclick="cerrarModal()">Cancelar</button><button class="btn primario">Guardar</button></div></form>`);
  $('#f-cli').onsubmit = async ev => { ev.preventDefault(); const f = new FormData(ev.target); const v = k => (f.get(k) || '').trim() || null;
    const cambios = { nombre: v('nombre'), tipo_cliente: v('tipo_cliente'), telefono: v('telefono'), telefono_2: v('telefono_2'), email: v('email'), rut: v('rut'), empresa: v('empresa'), direccion: v('direccion'), comuna: v('comuna'), notas: v('notas') };
    const { error } = await sb.from('cliente').update(cambios).eq('id', c.id); if (error) return aviso(errorDe(error), true);
    await sb.from('historial').insert({ pedido_id: p.id, campo: 'cliente editado', valor_anterior: [c.telefono, c.direccion, c.comuna].filter(Boolean).join(' · ') || '-', valor_nuevo: [cambios.telefono, cambios.direccion, cambios.comuna].filter(Boolean).join(' · ') || '-', quien: yo.nombre || 'Harold' }).then(() => {}, () => {});
    cerrarModal(); aviso('Cliente guardado'); despues(); };
}
async function formEditarEntrega(p, despues) {
  const op = await opcionesComuna(p.comuna_entrega);
  modal(`<h2>Editar entrega · ${esc(p.numero)}</h2><form id="f-ent"><div class="campos">
    <label class="campo">Fecha de compra <input name="fecha_compra" type="date" value="${p.fecha_compra || ''}" required></label>
    <label class="campo">Fecha comprometida con el cliente (vacía = aproximada, +21 días) <input name="fecha_comprometida" type="date" value="${p.fecha_comprometida || ''}"></label>
    <label class="campo">Tipo de entrega <select name="tipo_entrega">${['Despacho RM', 'Despacho regiones', 'Retiro en taller'].map(t => `<option ${t === p.tipo_entrega ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
    <label class="campo" style="flex-direction:row;align-items:center;gap:8px"><input type="checkbox" name="instalacion" ${p.instalacion ? 'checked' : ''}> Con instalación</label>
    <label class="campo">Dirección de entrega (vacía = la del cliente) <input name="direccion_entrega" value="${esc(p.direccion_entrega || '')}" placeholder="${esc(p.direccion || '')}"></label>
    <label class="campo">Comuna de entrega (vacía = la del cliente) <select name="comuna_entrega">${op}</select></label>
    <label class="campo">Nota de entrega <input name="nota_entrega" value="${esc(p.nota_entrega || '')}"></label>
    <label class="campo">Recibe desde (restricción del cliente; vacío = sin restricción) <input name="hora_desde" type="time" value="${hhmm(p.hora_desde)}"></label>
    <label class="campo">Recibe hasta <input name="hora_hasta" type="time" value="${hhmm(p.hora_hasta)}"></label>
    <label class="campo">Fecha de entrega real (garantía; vacía = sin entregar) <input name="entregado_en" type="date" value="${p.entregado_en ? String(p.entregado_en).slice(0, 10) : ''}"></label>
    <label class="campo">Cotización N° <input name="cotizacion_numero" value="${esc(p.cotizacion_numero || '')}" placeholder="Cot 3370"></label>
    <label class="campo">Origen <select name="origen">${['WhatsApp', 'Instagram', 'Shopify', 'Fábrica', 'Tienda', 'Cliente directo', 'Correo', 'Colaborador', 'Interno'].map(t => `<option ${t === p.origen ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
    ${camposOrigenHtml(p)}</div>
    <div class="acciones"><button type="button" class="btn" onclick="cerrarModal()">Cancelar</button><button class="btn primario">Guardar</button></div></form>`);
  $('#f-ent').onsubmit = async ev => { ev.preventDefault(); const f = new FormData(ev.target); const v = k => (f.get(k) || '').trim() || null;
    const cambios = { fecha_compra: v('fecha_compra'), fecha_comprometida: v('fecha_comprometida'), tipo_entrega: v('tipo_entrega'), instalacion: f.get('instalacion') === 'on', direccion_entrega: v('direccion_entrega'), comuna_entrega: v('comuna_entrega'), nota_entrega: v('nota_entrega'), hora_desde: v('hora_desde'), hora_hasta: v('hora_hasta'), cotizacion_numero: v('cotizacion_numero'), origen: v('origen'), ...leerOrigen(f), entregado_en: v('entregado_en') ? v('entregado_en') + 'T12:00:00' : null };
    const { error } = await sb.from('pedido').update(cambios).eq('id', p.id); if (error) return aviso(errorDe(error), true);
    cerrarModal(); aviso('Entrega guardada'); despues(); };
}
function formEditarPrecios(p, despues) {
  modal(`<h2>Editar precios · ${esc(p.numero)}</h2><form id="f-pre"><div class="campos">
    <label class="campo">Venta <input name="precio_venta" type="number" value="${p.precio_venta ?? 0}" required></label>
    <label class="campo">Despacho <input name="precio_despacho" type="number" value="${p.precio_despacho ?? 0}"></label>
    <label class="campo">Instalación <input name="precio_instalacion" type="number" value="${p.precio_instalacion ?? 0}"></label>
    <label class="campo">Embalaje <input name="precio_embalaje" type="number" value="${p.precio_embalaje ?? 0}"></label></div>
    <p style="font-size:12px;color:var(--gris-2);margin:6px 0">El total y el saldo se recalculan solos; los abonos no cambian.</p>
    <div class="acciones"><button type="button" class="btn" onclick="cerrarModal()">Cancelar</button><button class="btn primario">Guardar</button></div></form>`);
  $('#f-pre').onsubmit = async ev => { ev.preventDefault(); const f = new FormData(ev.target); const n = k => Number(f.get(k) || 0);
    const antes = { precio_venta: p.precio_venta, precio_despacho: p.precio_despacho, precio_instalacion: p.precio_instalacion, precio_embalaje: p.precio_embalaje };
    const cambios = { precio_venta: n('precio_venta'), precio_despacho: n('precio_despacho'), precio_instalacion: n('precio_instalacion'), precio_embalaje: n('precio_embalaje') };
    const { error } = await sb.from('pedido').update(cambios).eq('id', p.id); if (error) return aviso(errorDe(error), true);
    anotarCambio(`precios de ${p.numero}`, () => sb.from('pedido').update(antes).eq('id', p.id).then(r => { if (r.error) throw r.error; }));
    cerrarModal(); aviso('Precios guardados'); despues(); };
}
/* Harold 15-oct: una clienta antigua pidió repetir un pedido. pre.cliente = cliente ya elegido (desde Clientes o la ficha); pre.base = pedido a repetir:
   copia tipo, origen, precios, entrega y las piezas, y Harold cambia lo que difiera antes de crear. */
async function formPedido(pre = {}) {
  const { data: comunas } = await sb.from('comuna').select('nombre').order('nombre');
  const opComunas = (comunas || []).map(c => `<option>${esc(c.nombre)}</option>`).join('');
  const base = pre.base || null, piezasBase = base ? (base.piezas || []).slice().sort((a, b) => (a.orden || 0) - (b.orden || 0)) : [];
  let lineas = Math.max(1, piezasBase.length);
  const m = modal(`<h2>${base ? `Repetir ${esc(base.numero)} · ${esc(base.cliente)}` : pre.cliente ? `Nuevo pedido · ${esc(pre.cliente.nombre)}` : 'Nuevo pedido'}</h2>${base ? '<div class="gris" style="font-size:12px;margin:-6px 0 8px">Copiado del pedido original: cliente, tipo, precios, entrega y piezas. Cambia lo que difiera; el número y la fecha de compra son nuevos.</div>' : ''}<form id="f">
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
      ${camposOrigenHtml({})}
      <label class="campo">Fecha de compra <input name="fecha_compra" type="date" value="${hoyISO()}" required></label>
      <label class="campo">Precio de venta <input name="precio_venta" type="number" required></label>
      <label class="campo">Despacho <input name="precio_despacho" type="number" value="19980"></label>
      <label class="campo">Instalación <input name="precio_instalacion" type="number" value="0"></label>
      <label class="campo">Tipo de entrega <select name="tipo_entrega"><option>Despacho RM</option><option>Despacho regiones</option><option>Retiro en taller</option></select></label>
      <label class="campo" style="flex-direction:row;align-items:center;gap:8px"><input type="checkbox" name="instalacion"> Con instalación</label>
      <label class="campo">Cotización N° <input name="cotizacion_numero" placeholder="Cot 3370"></label>
      <label class="campo">Fecha comprometida con el cliente (vacía = aproximada, compra + 21 días) <input name="fecha_comprometida" type="date"></label>
      <label class="campo">Nota de entrega <input name="nota_entrega"></label>
      <label class="campo">Recibe desde (restricción horaria del cliente; vacío = sin restricción) <input name="hora_desde" type="time"></label>
      <label class="campo">Recibe hasta <input name="hora_hasta" type="time"></label>
      <label class="campo">Abono inicial <input name="abono" type="number" placeholder="0"></label>
      <label class="campo">Medio del abono <select name="abono_medio"><option>Transferencia</option><option>Webpay</option><option>MercadoPago</option><option>Getnet</option><option>Efectivo</option></select></label>
    </div>
    <label class="campo">Observación <textarea name="observacion"></textarea></label>
    <h2>Líneas (piezas)</h2><div id="lineas">${piezasBase.length ? piezasBase.map((x, i) => (i ? '<hr style="border:none;border-top:1px solid var(--linea)">' : '') + camposLinea(`l${i}_`)).join('') : camposLinea('l0_')}</div><button type="button" class="btn chico" id="b-mas">+ otra línea</button>
    <div class="acciones"><button type="button" class="btn" onclick="cerrarModal()">Cancelar</button><button class="btn primario">Crear pedido</button></div></form>`);
  $('#b-mas', m).onclick = () => { const d = document.createElement('div'); d.innerHTML = '<hr style="border:none;border-top:1px solid var(--linea)">' + camposLinea(`l${lineas++}_`); $('#lineas', m).appendChild(d); };
  const bc = $('[name=buscar_cliente]', m);
  bc.oninput = async () => { const t = bc.value.trim(); if (t.length < 2) return; const { data } = await sb.from('v_cliente').select('id,nombre,telefono,comuna').or(`nombre.ilike.%${t}%,telefono.ilike.%${t}%`).limit(8); $('#dl-cli', m).innerHTML = (data || []).map(c => `<option value="${esc(c.nombre)} · ${esc(c.telefono || '')} · ${esc(c.comuna || '')}" data-id="${c.id}"></option>`).join(''); const op = [...$('#dl-cli', m).options].find(o => o.value === bc.value); $('[name=cliente_id]', m).value = op ? op.dataset.id : ''; };
  bc.onchange = bc.oninput;
  if (pre.cliente) { bc.value = `${pre.cliente.nombre} · ${pre.cliente.telefono || ''} · ${pre.cliente.comuna || ''}`; $('[name=cliente_id]', m).value = pre.cliente.id; $('#dl-cli', m).innerHTML = `<option value="${esc(bc.value)}" data-id="${pre.cliente.id}"></option>`; }
  if (base) {   // mismos datos del pedido original; las piezas vuelven a empezar (sin etapa) y el abono queda en blanco
    const pon = (k, v) => { const el = $(`[name="${k}"]`, m); if (!el || v == null || v === '') return; if (el.type === 'checkbox') el.checked = !!v; else el.value = v; };
    ['tipo_pedido', 'origen', 'precio_venta', 'precio_despacho', 'precio_instalacion', 'tipo_entrega', 'nota_entrega', 'observacion'].forEach(k => pon(k, base[k])); pon('instalacion', base.instalacion);
    piezasBase.forEach((x, i) => { const pf = `l${i}_`; pon(pf + 'tipo_linea', x.tipo); pon(pf + 'area_taller', x.area); pon(pf + 'color_estructura', x.color);
      ['descripcion', 'cantidad', 'modelo_cubierta', 'modelo_base', 'material_cubierta', 'material_base', 'espesor_mm', 'largo_cm', 'ancho_cm', 'alto_cm', 'largo_ext_cm', 'forma', 'personas', 'tono', 'nota_acabado', 'tipo_silla', 'tapiz', 'color_silla'].forEach(k => pon(pf + k, x[k])); });
  }
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
      const ped = { numero, cliente_id, tipo_pedido: f.get('tipo_pedido'), origen: f.get('origen'), ...leerOrigen(f), fecha_compra: f.get('fecha_compra'), precio_venta: Number(f.get('precio_venta')), precio_despacho: Number(f.get('precio_despacho') || 0), precio_instalacion: Number(f.get('precio_instalacion') || 0), tipo_entrega: f.get('tipo_entrega'), instalacion: !!f.get('instalacion'), cotizacion_numero: f.get('cotizacion_numero') || null, fecha_comprometida: f.get('fecha_comprometida') || null, nota_entrega: f.get('nota_entrega') || null, hora_desde: f.get('hora_desde') || null, hora_hasta: f.get('hora_hasta') || null, observacion: f.get('observacion') || null, creado_por: yo.nombre };
      if (A_MEDIDA.includes(ped.tipo_pedido)) ped.estado = 'VISITA TÉCNICA';
      const { data: np, error } = await sb.from('pedido').insert(ped).select('id').single(); if (error) throw error;
      const ls = []; for (let i = 0; i < lineas; i++) { if (!f.get(`l${i}_descripcion`)) continue; const l = leerLinea(f, `l${i}_`); l.pedido_id = np.id; l.orden = i + 1; ls.push(l); }
      if (ls.length) { const { error: e2 } = await sb.from('linea_pedido').insert(ls); if (e2) throw e2; }
      if (Number(f.get('abono'))) await rpc('registrar_abono', { p_pedido_id: np.id, p_monto: Number(f.get('abono')), p_medio: f.get('abono_medio'), p_fecha: f.get('fecha_compra') });
      aviso('Pedido ' + numero + ' creado'); cerrarModal(); location.hash = '#/pedido/' + np.id;
    } catch (e) { aviso(errorDe(e), true); }
  };
}

/* Fase 6 (19-oct-2026): costo estimado y margen del pedido en la ficha, con costo manual de Harold. */
async function pintarMargenFicha(p) {
  const el = $('#cifra-margen'); if (!el) return;
  const { data: m } = await sb.from('v_pedido_margen').select('*').eq('id', p.id).maybeSingle(); if (!m) { el.remove(); return; }
  el.querySelector('div:last-child').innerHTML = m.costo != null ? `<span style="font-size:14px">${pesos(m.costo)}</span> · <b class="${(m.margen_pct || 0) < 0.3 ? 'rojo' : ''}">${Math.round((m.margen_pct || 0) * 100)}%</b><div class="gris" style="font-size:11px;font-weight:400">${m.costo_origen === 'manual' ? 'costo manual' : m.costo_origen === 'cotizacion' ? 'de la cotización' : 'motor de precios'}${m.compras_reales ? ' · compras reales ' + pesos(m.compras_reales) : ''}</div>` : `<span class="gris" style="font-size:13px">sin costo: clic para ponerlo</span>`;
  el.style.cursor = 'pointer'; el.onclick = () => {
    const mm = modal(`<h2>Costo del pedido ${esc(p.numero)}</h2><p class="gris" style="font-size:13px;margin:0">Neto sin IVA ${pesos(m.neto)}. Costo estimado hoy: ${m.costo != null ? pesos(m.costo) + ' (' + (m.costo_origen || 'motor') + ')' : 'sin costo'}. Si pones un costo a mano manda sobre el estimado; vacío vuelve al estimado.</p>
      <form id="f"><div class="campos"><label class="campo">Costo total (pesos) <input name="costo" type="number" value="${m.costo_origen === 'manual' ? m.costo : ''}" placeholder="${m.costo != null ? m.costo : ''}"></label><label class="campo">Nota <input name="nota" placeholder="qué incluye"></label></div>
      <div class="acciones"><button type="button" class="btn" onclick="cerrarModal()">Cancelar</button><button class="btn primario">Guardar</button></div></form>`);
    $('#f', mm).onsubmit = async ev => { ev.preventDefault(); const f = new FormData(ev.target); try { await rpc('fijar_costo_pedido', { p_pedido_id: p.id, p_costo: f.get('costo') === '' ? null : Number(f.get('costo')), p_nota: f.get('nota') || null }); cerrarModal(); aviso('Costo guardado'); pintarMargenFicha(p); } catch (e) { aviso(errorDe(e), true); } };
  };
}

/* ---------- Harold · Panel ---------- */
async function vPanel() {
  const [{ data: meses }, { data: atrasados }, { data: delMes }, { data: casosAb }, { data: mkt }, { data: mktOrigen }, { data: mgMes }, mgRes, { data: cotMes }] = await Promise.all([
    sb.from('v_panel_mes').select('*').order('mes'),
    sb.from('v_pedido').select('id,numero,cliente,dias_atraso,saldo,estado,tipo_entrega').eq('atrasado', true).order('dias_atraso', { ascending: false }),
    sb.from('v_pedido').select('origen,tipo_cliente,total,tipo_pedido,pago_pendiente,estado').gte('fecha_compra', hoyISO().slice(0, 8) + '01'),
    sb.from('v_caso').select('id,tipo,sin_movimiento').neq('estado', 'Cerrado'),
    sb.from('v_panel_marketing_mes').select('*'),
    sb.from('v_marketing_origen').select('*').gte('mes', hoyISO().slice(0, 8) + '01'),
    sb.from('v_panel_margen_mes').select('*').order('mes'),
    rpc('margen_resumen', { p_desde: hoyISO().slice(0, 8) + '01', p_hasta: hoyISO() }),
    sb.from('v_panel_cotizacion_mes').select('*').order('mes'),
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
      <div class="cifra grande seccion"><div>Casos de servicio abiertos</div><div style="color:${(casosAb || []).length ? 'var(--ambar-txt)' : 'var(--azul)'}">${(casosAb || []).length}</div><div style="font-size:12px;color:var(--gris-2)">${CASO_TIPOS.map(tp => `${tp} ${(casosAb || []).filter(c => c.tipo === tp).length}`).join(' · ')}${(casosAb || []).some(c => c.sin_movimiento) ? ` · <span class="rojo">${(casosAb || []).filter(c => c.sin_movimiento).length} sin movimiento hace 7 días</span>` : ''} · <a href="#/casos">ver casos</a></div></div>
    </div>
    ${(() => { const pm = {}; (mkt || []).forEach(r => pm[r.mes.slice(0, 7)] = r); const a = pm[k] || { pedidos: 0, ventas: 0, shopify: 0, whatsapp: 0, ventas_shopify: 0, ventas_whatsapp: 0, a_medida: 0 }, b = pm[kAnt];
      const fila = (r, tit) => `<tr><td>${tit}</td><td>${r.pedidos}</td><td class="mono">${pesos(r.ventas)}</td><td>${r.shopify} · ${pesos(r.ventas_shopify)}</td><td>${r.whatsapp} · ${pesos(r.ventas_whatsapp)}</td><td>${r.a_medida}</td></tr>`;
      const porRed = {}; (mktOrigen || []).forEach(r => { const kk = r.origen_red || 'desconocido'; porRed[kk] = porRed[kk] || { n: 0, v: 0 }; porRed[kk].n += Number(r.pedidos); porRed[kk].v += Number(r.ventas); });
      const conCodigo = (mktOrigen || []).filter(r => r.origen_codigo !== '(sin código)').sort((x, z) => z.pedidos - x.pedidos);
      return `<section class="seccion"><h2>Marketing · ${MESES_L[m]} ${y} <small class="gris">solo Shopify y WhatsApp, tipo catálogo, mesa o mueble a medida, sin cancelados ni fechas estimadas (regla de Harold 14-oct)</small></h2>
      <div class="tabla-env"><table class="lista"><thead><tr><th></th><th>Pedidos</th><th>Ventas</th><th>Shopify</th><th>WhatsApp</th><th>A medida</th></tr></thead><tbody>${fila(a, `${MESES_L[m]} ${y}`)}${b ? fila(b, `${MESES_L[m]} ${y - 1}`) : ''}</tbody></table></div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px"><div><h3 style="margin:6px 0;font-size:13px">Por red (${MESES_L[m]})</h3><table class="lista"><thead><tr><th>Red</th><th>Pedidos</th><th>Ventas</th></tr></thead><tbody>${Object.entries(porRed).sort((x, z) => z[1].n - x[1].n).map(([kk, v]) => `<tr><td>${esc(NOMBRE_RED[kk] || kk)}</td><td>${v.n}</td><td class="mono">${pesos(v.v)}</td></tr>`).join('') || '<tr><td colspan="3" class="gris">Sin pedidos de marketing este mes</td></tr>'}</tbody></table></div>
      <div><h3 style="margin:6px 0;font-size:13px">Por código del mensaje (${MESES_L[m]})</h3><table class="lista"><thead><tr><th>Código</th><th>Red</th><th>Pedidos</th><th>Ventas</th></tr></thead><tbody>${conCodigo.map(r => `<tr><td>${esc(r.origen_codigo)}${r.origen_campana ? `<div class="l2">${esc(r.origen_campana)}</div>` : ''}</td><td>${esc(NOMBRE_RED[r.origen_red] || r.origen_red)}</td><td>${r.pedidos}</td><td class="mono">${pesos(r.ventas)}</td></tr>`).join('') || '<tr><td colspan="4" class="gris">Ningún pedido del mes trae código todavía (se llena al ingresar por WhatsApp o desde Shopify con el barrido)</td></tr>'}</tbody></table></div></div></section>`; })()}
    <section class="seccion"><h2>Pedidos por mes · ${y} contra ${y - 1}</h2><div class="barras">${MESES.map((mm, i) => { const a = porMes[`${y}-${String(i + 1).padStart(2, '0')}`], b = porMes[`${y - 1}-${String(i + 1).padStart(2, '0')}`]; return `<div class="barra-mes"><div class="par"><div class="b" style="height:${(b ? b.pedidos : 0) / maxP * 100}%" title="${y - 1}: ${b ? b.pedidos : 0}"></div><div class="b actual" style="height:${(a ? a.pedidos : 0) / maxP * 100}%" title="${y}: ${a ? a.pedidos : 0}"></div></div><span>${mm}</span><span style="font-size:10px">${a ? a.pedidos : '·'} / ${b ? b.pedidos : '·'}</span></div>`; }).join('')}</div><div style="font-size:12px;color:var(--gris-2)">Barra gris ${y - 1}, barra azul ${y}. Datos de prueba en el prototipo.</div></section>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:14px">
      <section class="seccion"><h2>Por origen · mes actual</h2><table class="lista"><thead><tr><th>Origen</th><th>Pedidos</th><th>Ventas</th></tr></thead><tbody>${agrupar('origen').map(([kk, v]) => `<tr><td>${esc(kk)}</td><td>${v.n}</td><td class="mono">${pesos(v.v)}</td></tr>`).join('')}</tbody></table></section>
      <section class="seccion"><h2>Por tipo de cliente · mes actual</h2><table class="lista"><thead><tr><th>Tipo</th><th>Pedidos</th><th>Ventas</th><th>Margen $ ; %</th></tr></thead><tbody>${agrupar('tipo_cliente').map(([kk, v]) => `<tr><td>${esc(kk)}</td><td>${v.n}</td><td class="mono">${pesos(v.v)}</td><td class="mono">${(() => { const t = ((mgRes && mgRes.por_tipo_cliente) || []).find(x => x.tipo_cliente === kk); return t && t.costo != null ? `${pesos(t.margen)} ; ${Math.round((t.margen_pct || 0) * 100)}%${t.sin_costo ? ` <span class="gris" title="pedidos sin costo estimado">(${t.sin_costo} s/c)</span>` : ''}` : '<span class="gris">sin costo</span>'; })()}</td></tr>`).join('')}</tbody></table></section>
    </div>
    ${(() => { /* Fase 6 (19-oct-2026): margen estimado por mes y por modelo. Costo = manual > cotización > motor; compras reales de OC aparte. */
      const pm = {}; (mgMes || []).forEach(r => pm[r.mes.slice(0, 7)] = r); const a = pm[k], b = pm[kAnt];
      const fila = (r, tit) => r ? `<tr><td>${tit}</td><td>${r.pedidos} <span class="gris">(${r.con_costo} con costo)</span></td><td class="mono">${pesos(r.neto)}</td><td class="mono">${pesos(r.costo)}</td><td class="mono"><b>${pesos((r.neto_con_costo || 0) - (r.costo || 0))}</b> · ${r.neto_con_costo ? Math.round(((r.neto_con_costo - r.costo) / r.neto_con_costo) * 100) : 0}%</td><td class="mono">${r.compras_reales ? pesos(r.compras_reales) : '<span class="gris">-</span>'}</td></tr>` : '';
      const modelos = ((mgRes && mgRes.por_modelo) || []);
      const ult = Object.values(pm).sort((x, z) => String(z.mes).localeCompare(String(x.mes))).slice(0, 6).reverse();
      return `<section class="seccion"><h2>Margen estimado · ${MESES_L[m]} ${y} <small class="gris">neto sin IVA menos costo (manual, de la cotización o del motor con los parámetros vigentes); compras reales = OC a proveedores prorrateadas, para contrastar cuando se usen</small></h2>
      <div class="tabla-env"><table class="lista"><thead><tr><th></th><th>Pedidos</th><th>Neto</th><th>Costo est.</th><th>Margen $ · %</th><th>Compras reales</th></tr></thead><tbody>${fila(a, `${MESES_L[m]} ${y}`)}${fila(b, `${MESES_L[m]} ${y - 1}`)}${ult.filter(r => r !== a && r !== b).map(r => fila(r, r.mes.slice(0, 7))).join('')}</tbody></table></div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:14px"><div><h3 style="margin:6px 0;font-size:13px">Por modelo (${MESES_L[m]})</h3><table class="lista"><thead><tr><th>Modelo</th><th>Pedidos</th><th>Neto</th><th>Margen $ · %</th></tr></thead><tbody>${modelos.map(r => `<tr><td>${esc(r.modelo || '(sin modelo)')}</td><td>${r.pedidos}</td><td class="mono">${pesos(r.neto)}</td><td class="mono ${(r.margen_pct || 0) < 0.3 ? 'rojo' : ''}">${pesos(r.margen)} · ${Math.round((r.margen_pct || 0) * 100)}%</td></tr>`).join('') || '<tr><td colspan="4" class="gris">Sin pedidos con costo este mes</td></tr>'}</tbody></table>${mgRes && mgRes.sin_costo ? `<div class="gris" style="font-size:12px;margin-top:4px">${mgRes.sin_costo} pedidos del mes sin costo (muebles a medida o proyectos sin cotización en la app): se les pone a mano desde la ficha.</div>` : ''}</div>
      <div><h3 style="margin:6px 0;font-size:13px">Cotizaciones por mes</h3><table class="lista"><thead><tr><th>Mes</th><th>Categoría</th><th>Emitidas</th><th>Convertidas</th><th>Perdidas</th><th>Abiertas</th></tr></thead><tbody>${(cotMes || []).slice(-8).map(r => `<tr><td>${r.mes.slice(0, 7)}</td><td>${r.categoria === 'proyectos' ? 'Proyectos' : 'Mesas y demás'}</td><td>${r.emitidas} · ${pesos(r.monto_emitido)}</td><td>${r.convertidas} · ${pesos(r.monto_convertido)}${r.emitidas ? ` <span class="gris">(${Math.round(r.convertidas / r.emitidas * 100)}%)</span>` : ''}</td><td>${r.perdidas}</td><td>${r.abiertas}</td></tr>`).join('') || '<tr><td colspan="6" class="gris">Todavía no hay cotizaciones emitidas en la app</td></tr>'}</tbody></table></div></div></section>`; })()}
    </div>`;
}

/* ---------- Harold · Clientes y Bandeja ---------- */
async function vClientes() {
  // Harold 14-oct: "antes teníamos la hoja de entregados; Clientes debe ir quedando por orden de entrega, el último entregado arriba, y desde ahí abrir su ficha"
  // Todos los clientes, por páginas de 1000 (tope de PostgREST): con el límite de 400 los entregados hace más de un año no salían al buscar (Harold 16-oct, Carolina y Sebastián)
  const todos = async () => { const out = []; for (let d = 0; ; d += 1000) { const { data: pg, error } = await sb.from('v_cliente').select('*').order('ultima_entrega', { ascending: false, nullsFirst: false }).order('ultima_compra', { ascending: false, nullsFirst: false }).order('id').range(d, d + 999); if (error) throw error; out.push(...(pg || [])); if (!pg || pg.length < 1000) return out; } };
  const [data, { data: casosCli }] = await Promise.all([todos(), sb.from('v_caso').select('cliente_id, estado')]);
  const casosDe = {}; (casosCli || []).forEach(c => { const k = casosDe[c.cliente_id] = casosDe[c.cliente_id] || { n: 0, ab: 0 }; k.n++; if (c.estado !== 'Cerrado') k.ab++; });
  cache.clientesOrden = cache.clientesOrden || 'entrega';
  app.innerHTML = barra('#/clientes') + `<div class="sub"><label>Buscar <input type="search" id="b" style="width:240px" placeholder="nombre, teléfono, correo, empresa"></label>
    <label>Orden <select id="o"><option value="entrega" ${cache.clientesOrden === 'entrega' ? 'selected' : ''}>Última entrega (reciente arriba)</option><option value="compra" ${cache.clientesOrden === 'compra' ? 'selected' : ''}>Última compra</option><option value="nombre" ${cache.clientesOrden === 'nombre' ? 'selected' : ''}>Nombre</option></select></label>
    <span style="color:var(--gris-3)">${data.length} clientes · la fecha de Última entrega abre la ficha; con ~ es estimada (venía del Excel sin fecha)</span>
    <button class="btn chico" id="b-dup" title="Clientes que parecen repetidos (mismo teléfono o mismo nombre): unirlos deja los pedidos en uno solo">Duplicados</button></div><div class="contenido"><div class="tabla-env"><table class="lista"><thead><tr><th>Nombre</th><th>Tipo</th><th>Teléfono</th><th>Comuna</th><th>Pedidos</th><th>Pendientes</th><th>Total comprado</th><th>Última compra</th><th>Última entrega</th><th>Casos</th></tr></thead><tbody id="tb"></tbody></table></div></div>`;
  const pintar = () => { const t = $('#b').value.toLowerCase(); const o = cache.clientesOrden;
    const lista = data.filter(c => !t || [c.nombre, c.telefono, c.email, c.empresa].join(' ').toLowerCase().includes(t)).sort((a, b) => o === 'nombre' ? String(a.nombre).localeCompare(String(b.nombre)) : o === 'compra' ? String(b.ultima_compra || '').localeCompare(String(a.ultima_compra || '')) : String(b.ultima_entrega || '').localeCompare(String(a.ultima_entrega || '')) || String(b.ultima_compra || '').localeCompare(String(a.ultima_compra || '')));
    $('#tb').innerHTML = lista.map(c => `<tr><td class="nw"><strong>${esc(c.nombre)}</strong>${c.empresa && c.empresa !== c.nombre ? ' · ' + esc(c.empresa) : ''}<div class="l2"><a href="#/lista?q=${encodeURIComponent(c.nombre)}" title="Ver todos sus pedidos en la Lista">ver pedidos</a> · <a href="#" data-nuevo-cli="${c.id}" title="Nuevo pedido para este cliente con sus datos ya puestos">nuevo pedido</a>${c.email ? ' · ' + esc(c.email) : ''}</div></td><td>${esc(c.tipo_cliente)}</td><td class="nw">${esc(c.telefono || '')}</td><td>${esc(c.comuna || '')}</td><td>${c.pedidos}</td><td>${c.pendientes ? `<span class="chip inst">${c.pendientes}</span>` : ''}</td><td class="mono">${pesos(c.total_comprado)}</td><td class="nw">${fecha(c.ultima_compra)}</td><td class="nw">${c.ultima_entrega ? `<a href="#/pedido/${c.ultimo_entregado_id}" title="Abrir la ficha del último pedido entregado${c.ultima_entrega_estimada ? ' (fecha estimada: venía del Excel sin fecha de entrega; corrígela en Editar entrega)' : ''}">${c.ultima_entrega_estimada ? '~' : ''}${fecha(c.ultima_entrega)}</a>${c.ultima_entrega_estimada ? '<div class="l2 gris">estimada</div>' : ''}` : '<span class="gris">-</span>'}</td><td class="nw">${casosDe[c.id] ? `<a href="#/casos?cliente=${c.id}">${casosDe[c.id].n}${casosDe[c.id].ab ? ` <span class="chip caso-Abierto">${casosDe[c.id].ab} abierto${casosDe[c.id].ab > 1 ? 's' : ''}</span>` : ''}</a>` : ''}</td></tr>`).join(''); };
  $('#b').oninput = pintar; $('#o').onchange = ev => { cache.clientesOrden = ev.target.value; pintar(); }; pintar();
  $('#b-dup').onclick = () => modalDuplicados().catch(e => aviso(errorDe(e), true));
  $('#tb').onclick = ev => { const a = ev.target.closest('[data-nuevo-cli]'); if (!a) return; ev.preventDefault(); const c = data.find(x => String(x.id) === a.dataset.nuevoCli); if (c) formPedido({ cliente: c }); };
}
/* Tanda 41 (19-oct-2026): clientes duplicados de la migración (ej. Jorge Alcaide 276 y 655). Harold elige cuál conservar; unir_clientes pasa
   pedidos, cotizaciones y casos, completa datos que faltaban y deja el otro marcado "(duplicado, usar N)". */
async function modalDuplicados() {
  const { data, error } = await sb.from('v_cliente_duplicado').select('*').order('pedidos_a', { ascending: false }); if (error) throw error;
  const filas = (data || []).map((d, i) => `<tr data-i="${i}"><td>${esc(d.motivo)}</td>
    <td><label style="display:flex;gap:6px;align-items:flex-start"><input type="radio" name="k${i}" value="${d.id_a}" ${d.pedidos_a >= d.pedidos_b ? 'checked' : ''}><span><b>${esc(d.nombre_a)}</b> <span class="gris">#${d.id_a}</span><div class="l2">${d.pedidos_a} pedidos${d.telefono_a ? ' · ' + esc(d.telefono_a) : ''}</div></span></label></td>
    <td><label style="display:flex;gap:6px;align-items:flex-start"><input type="radio" name="k${i}" value="${d.id_b}" ${d.pedidos_a < d.pedidos_b ? 'checked' : ''}><span><b>${esc(d.nombre_b)}</b> <span class="gris">#${d.id_b}</span><div class="l2">${d.pedidos_b} pedidos${d.telefono_b ? ' · ' + esc(d.telefono_b) : ''}</div></span></label></td>
    <td><button class="btn chico primario" data-unir="${i}">Unir</button></td></tr>`).join('');
  const m = modal(`<h2>Posibles clientes duplicados (${(data || []).length})</h2><p class="gris" style="font-size:12px;margin:0">Marca cuál se conserva (por defecto el que tiene más pedidos) y pulsa Unir: los pedidos, cotizaciones y casos del otro pasan al conservado, y el otro queda marcado como duplicado (no se borra). Si son personas distintas con el mismo nombre, no los unas.</p>
    <div style="overflow:auto;max-height:60vh"><table class="d-tabla"><thead><tr><th>Motivo</th><th>Cliente A</th><th>Cliente B</th><th></th></tr></thead><tbody>${filas || '<tr><td colspan="4" class="gris">No encontré duplicados.</td></tr>'}</tbody></table></div>
    <div class="acciones"><button class="btn" onclick="cerrarModal()">Cerrar</button></div>`, 'ancha');
  $$('[data-unir]', m).forEach(b => b.onclick = async () => {
    const i = Number(b.dataset.unir), d = data[i]; const conservar = Number($(`input[name=k${i}]:checked`, m).value), dup = conservar === d.id_a ? d.id_b : d.id_a;
    if (!confirm(`¿Unir #${dup} dentro de #${conservar}? Los pedidos de #${dup} pasan a #${conservar}.`)) return;
    try { const r = await rpc('unir_clientes', { p_conservar: conservar, p_duplicado: dup }); aviso(`Unidos: ${r.pedidos} pedidos, ${r.cotizaciones} cotizaciones, ${r.casos} casos pasaron a #${conservar}`); b.closest('tr').remove(); } catch (e) { aviso(errorDe(e), true); }
  });
}
async function vBandeja() {
  const { data } = await sb.from('v_bandeja').select('*').order('creado_en', { ascending: false });
  app.innerHTML = barra('#/bandeja') + `<div class="sub">Pedidos de Shopify sin pago, propuestas de Claude y productos que no se reconocieron. Se resuelven uno por uno.</div><div class="contenido"><div class="columna">${(data || []).map(b => `<div class="seccion"><div class="cab"><div><strong>${esc(b.titulo)}</strong><div style="font-size:12px;color:var(--gris-2)">${esc(b.tipo)} · ${fechaHora(b.creado_en)}${b.numero ? ` · <a href="#/pedido/${b.pedido_id}">${esc(b.numero)}</a> ${esc(b.cliente || '')}` : ''}</div>${b.detalle ? `<pre style="font-size:11px;color:var(--gris-3);white-space:pre-wrap;margin:6px 0 0">${esc(JSON.stringify(b.detalle, null, 1)).slice(0, 600)}</pre>` : ''}</div><button class="btn chico" data-res="${b.id}">Resuelto</button></div></div>`).join('') || '<div class="seccion">Bandeja vacía</div>'}</div></div>`;
  $$('[data-res]').forEach(b => b.onclick = async () => { await sb.from('bandeja').update({ resuelta: true }).eq('id', b.dataset.res); vBandeja(); });
}

/* ---------- Alexis · Lista por semana ---------- */
/* Movimientos de un pedido (Harold 13-oct, Isidora Bauerle): retiro en casa del cliente, entrega, visita técnica, instalación.
   Se ven en la Lista (etiqueta), en la ficha y en la Ruta del día; hechos quedan en la ficha y el historial. Nunca cuentan como pedido. */
// Harold 13-oct (10:30): sin "tentativo" ni "confirmar". Un movimiento tiene UNA fecha (la pone Harold); Alexis puede proponer otra y
// Harold la acepta con un toque (queda como fecha). Nada más.
const movEstado = m => m.hecho ? 'hecho' : m.fecha_propuesta ? 'propuesto' : 'fijado';
const movChip = m => m.hecho ? '<span class="chip ok">HECHO</span>' : m.fecha_propuesta ? `<span class="chip prop">Alexis propone ${fecha(m.fecha_propuesta, true)}</span>` : '';
function movFechaCelda(m) {
  const rojo = m.fecha < hoyISO() && !m.hecho ? 'color:var(--rojo-txt)' : '';
  const chico = 'min-height:28px;padding:2px 4px;font-size:12px';
  if (m.hecho) return fecha(m.fecha, true);
  if (yo.rol === 'operacion') return `<span style="${rojo}">${fecha(m.fecha, true)}</span> ${movChip(m)}<div><small class="gris">Proponer otro día:</small> <input type="date" value="${m.fecha_propuesta || ''}" data-mov-prop="${m.id}" title="Propón otro día; Harold lo acepta" style="${chico}"></div>`;
  return `<input type="date" value="${m.fecha}" data-mov-fecha="${m.id}" title="Fecha del movimiento (clic para cambiarla)" style="${chico};${rojo}">${m.fecha_propuesta ? ` ${movChip(m)} <button class="btn chico borde" data-mov-conf="${m.id}" title="Dejar la fecha que propone Alexis">Aceptar</button>` : ''}`;
}
const movFechaTxt = m => { const tarde = m.fecha < hoyISO() && !m.hecho; return `<div class="l1 ${tarde ? 'rojo' : ''}">${fecha(m.fecha)}</div>${m.fecha_propuesta ? `<div class="l2">Alexis propone ${fecha(m.fecha_propuesta)}</div>` : m.hecho ? '<div class="l2">hecho</div>' : ''}`; };
const MOV_TIPOS = ['Retiro en cliente', 'Entrega', 'Visita técnica', 'Instalación', 'Otro'];
// Etiqueta de estado de un pedido sin piezas (postventa): lo que hay que hacer, no "POR FABRICAR" (Harold 16-oct, Dina W3153)
const COD_MOV = { 'Retiro en cliente': 'RETIRO', 'Entrega': 'ENTREGA', 'Visita técnica': 'VISITA', 'Instalación': 'INSTAL', 'Otro': 'MOV' };
const movEtiqueta = m => `${m.tipo === 'Retiro en cliente' ? 'RETIRO' : m.tipo.toUpperCase()} ${fecha(m.fecha)}`;
async function cargarMovimientos() { const { data } = await sb.from('movimiento').select('*').eq('hecho', false).order('fecha'); cache.movs = data || []; }
const movsDe = id => (cache.movs || []).filter(m => m.pedido_id === id);
function movimientosHtml(p, esOp) {
  const ms = p.movimientos || [];
  return `<section class="seccion"><div class="cab"><h2>Movimientos (retiros, visitas, instalación)</h2>${esOp ? '' : `<button class="btn chico borde" id="b-mov">+ Agregar movimiento</button>`}</div>
    ${ms.length ? `<div class="tabla-env"><table class="lista"><thead><tr><th>Fecha</th><th>Qué</th><th>Dirección</th><th>Nota</th><th>Estado</th><th></th></tr></thead><tbody>${ms.map(m => `<tr class="${m.hecho ? '' : 'mov-pend'}"><td class="nw">${movFechaCelda(m)}</td><td class="nw"><strong>${esc(m.tipo)}</strong></td><td>${esc(m.direccion || p.direccion || '-')}</td><td>${esc(m.nota || '')}</td><td class="nw">${m.hecho ? `<span class="chip ok">HECHO</span> <span class="gris">${esc(m.hecho_por || '')} ${fecha(m.hecho_en)}</span>` : movChip(m)}</td><td class="nw">${m.hecho ? '' : `<button class="btn chico primario" data-mov-hecho="${m.id}">Hecho</button>`}${esOp || m.hecho ? '' : ` <button class="btn chico" data-mov-editar="${m.id}" title="Cambiar qué se hace, la nota o la dirección">✎</button> <button class="btn chico" data-mov-borrar="${m.id}" title="Borrar este movimiento">×</button>`}</td></tr>`).join('')}</tbody></table></div>` : '<div style="color:var(--gris-3);font-size:13px">Sin movimientos. Un retiro en casa del cliente, una visita técnica o una instalación con fecha propia se anotan aquí; Alexis puede proponer otro día y Harold lo acepta.</div>'}
  </section>`;
}
function activarMovimientos(raiz, p, despues) {
  const movDe = id => (cache.movs || []).find(x => x.id === id) || ((p && p.movimientos) || []).find(x => x.id === id);
  const refrescar = async () => { await cargarMovimientos(); despues(); };
  $$('[data-mov-fecha]', raiz).forEach(inp => { inp.onclick = ev => ev.stopPropagation(); inp.onchange = async () => { const id = Number(inp.dataset.movFecha), m = movDe(id); const antes = m && m.fecha; if (!inp.value) return; const { error } = await sb.from('movimiento').update({ fecha: inp.value }).eq('id', id); if (error) return aviso(errorDe(error), true); aviso('Movimiento: ' + fecha(inp.value, true)); if (antes) anotarCambio(`fecha del movimiento (volver a ${fecha(antes)})`, async () => { await sb.from('movimiento').update({ fecha: antes }).eq('id', id); await cargarMovimientos(); }); refrescar(); }; });
  $$('[data-mov-prop]', raiz).forEach(inp => { inp.onclick = ev => ev.stopPropagation(); inp.onchange = async () => { const id = Number(inp.dataset.movProp), m = movDe(id); const antes = m && m.fecha_propuesta; const { error } = await sb.from('movimiento').update({ fecha_propuesta: inp.value || null }).eq('id', id); if (error) return aviso(errorDe(error), true); aviso(inp.value ? 'Propuesto ' + fecha(inp.value, true) + '; Harold lo confirma con el cliente' : 'Propuesta retirada'); anotarCambio('propuesta del movimiento', async () => { await sb.from('movimiento').update({ fecha_propuesta: antes || null }).eq('id', id); await cargarMovimientos(); }); refrescar(); }; });
  $$('[data-mov-conf]', raiz).forEach(b => b.onclick = async ev => { ev.stopPropagation(); const id = Number(b.dataset.movConf), m = movDe(id); const antes = m && m.fecha, prop = m && m.fecha_propuesta; if (!prop) return; const { error } = await sb.from('movimiento').update({ fecha: prop, fecha_propuesta: null, confirmado: true }).eq('id', id); if (error) return aviso(errorDe(error), true); aviso('Fecha aceptada: ' + fecha(prop, true)); anotarCambio(`fecha del movimiento (volver a ${fecha(antes)})`, async () => { await sb.from('movimiento').update({ fecha: antes, fecha_propuesta: prop, confirmado: false }).eq('id', id); await cargarMovimientos(); }); refrescar(); });
  $$('[data-mov-hecho]', raiz).forEach(b => b.onclick = async () => { const { error } = await sb.from('movimiento').update({ hecho: true }).eq('id', Number(b.dataset.movHecho)); if (error) return aviso(errorDe(error), true); aviso('Movimiento hecho'); anotarCambio('movimiento hecho (volver a pendiente)', async () => { await sb.from('movimiento').update({ hecho: false, hecho_en: null, hecho_por: null }).eq('id', Number(b.dataset.movHecho)); }); despues(); });
  $$('[data-mov-borrar]', raiz).forEach(b => b.onclick = async () => { if (!confirm('¿Borrar este movimiento?')) return; const { error } = await sb.from('movimiento').delete().eq('id', Number(b.dataset.movBorrar)); if (error) return aviso(errorDe(error), true); aviso('Movimiento borrado'); despues(); });
  $$('[data-mov-editar]', raiz).forEach(b => b.onclick = ev => { ev.stopPropagation(); const m = movDe(Number(b.dataset.movEditar)); if (m) formEditarMovimiento(m, p, despues); });
  const ba = $('#b-mov', raiz); if (ba) ba.onclick = () => formMovimiento(p, hoyISO(), despues);
}
/* Editar un movimiento pendiente (Harold 16-oct, W3154: "necesito poder editar la nota y no podía"): qué se hace, dirección y nota.
   La fecha se cambia donde siempre (celda de la Lista, ficha, Ruta). Si el pedido es una postventa sin piezas, la observación del
   pedido repite la nota (es lo que se ve en la ficha): se actualiza junto. */
function formEditarMovimiento(m, p, despues) {
  const ped = (p && p.id === m.pedido_id) ? p : (cache.pedidos || []).find(x => x.id === m.pedido_id) || {};
  modal(`<h2>Editar movimiento · ${esc(ped.numero || '')} ${esc(ped.cliente || '')}</h2><form id="f-mov-e"><div class="campos">
    <label class="campo">Qué <select name="tipo">${MOV_TIPOS.map(t => `<option ${t === m.tipo ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
    <label class="campo">Dirección (vacío = la del pedido) <input name="direccion" value="${esc(m.direccion || '')}" placeholder="${esc(ped.direccion || '')}"></label></div>
    <label class="campo" style="display:block;margin-top:8px">Nota (qué se hace, qué hay que llevar) <textarea name="nota" rows="3" style="width:100%">${esc(m.nota || '')}</textarea></label>
    <div class="acciones"><button type="button" class="btn" onclick="cerrarModal()">Cancelar</button><button class="btn primario">Guardar</button></div></form>`);
  $('#f-mov-e').onsubmit = async ev => {
    ev.preventDefault(); const f = new FormData(ev.target); const nota = (f.get('nota') || '').trim() || null;
    const { error } = await sb.from('movimiento').update({ tipo: f.get('tipo'), direccion: (f.get('direccion') || '').trim() || null, nota }).eq('id', m.id);
    if (error) return aviso(errorDe(error), true);
    if (ped.tipo_pedido === 'Postventa' && m.nota && (ped.observacion || '').includes(m.nota)) await sb.from('pedido').update({ observacion: ped.observacion.replace(m.nota, nota || '') }).eq('id', ped.id);
    cerrarModal(); aviso('Movimiento guardado'); despues();
  };
}
/* Nuevo movimiento de un pedido (ficha y Ruta). fechaDefecto: hoy en la ficha, el día que se está mirando en la Ruta. */
function formMovimiento(p, fechaDefecto, despues) {
  modal(`<h2>Nuevo movimiento · ${esc(p.numero)} ${esc(p.cliente)}</h2><form id="f-mov"><div class="campos">
    <label class="campo">Qué <select name="tipo">${MOV_TIPOS.map(t => `<option>${t}</option>`).join('')}</select></label>
    <label class="campo">Fecha <input type="date" name="fecha" required value="${fechaDefecto || hoyISO()}"></label>
    <label class="campo">Dirección (vacío = la del pedido) <input name="direccion" placeholder="${esc(p.direccion || '')}"></label>
    <label class="campo">Nota <input name="nota" placeholder="Qué se retira o se hace"></label></div>
    <div class="acciones"><button type="button" class="btn" onclick="cerrarModal()">Cancelar</button><button class="btn primario">Guardar</button></div></form>`);
  $('#f-mov').onsubmit = async ev => { ev.preventDefault(); const f = new FormData(ev.target); const { error } = await sb.from('movimiento').insert({ pedido_id: p.id, tipo: f.get('tipo'), fecha: f.get('fecha'), direccion: f.get('direccion') || null, nota: f.get('nota') || null }); if (error) return aviso(errorDe(error), true); cerrarModal(); aviso('Movimiento agregado'); despues(); };
}
/* "+ Movimiento" desde la Ruta (Harold 16-oct: una acción se hace desde donde uno está). Se busca el pedido por número o cliente entre
   todos (no solo los pendientes): si ya está ENTREGADO, lo que corresponde es una Postventa (pedido sin piezas con su movimiento, que es
   lo que la Ruta y la Lista muestran); si está pendiente, un movimiento más del mismo pedido. */
function formMovimientoRuta(dia, despues) {
  modal(`<h2>Movimiento para el ${fecha(dia, true)}</h2><div class="gris" style="font-size:12px">Retiro, visita técnica, instalación o entrega extra. Busca el pedido; si ya está entregado se crea una Postventa.</div>
    <label class="campo" style="display:block;margin-top:8px">Pedido o cliente <input id="mr-q" type="search" placeholder="W3153, Dina Soto, P25-014…" autofocus></label><div id="mr-res" style="margin-top:6px"></div>`);
  const res = $('#mr-res'); let t;
  const buscar = async q => {
    q = q.trim(); if (q.length < 2) { res.innerHTML = ''; return; }
    const { data } = await sb.from('v_pedido').select('*').or(`numero.ilike.%${q.replace(/[%,()]/g, '')}%,cliente.ilike.%${q.replace(/[%,()]/g, '')}%`).order('fecha_compra', { ascending: false }).limit(12);
    res.innerHTML = (data || []).map(p => `<div class="prop" data-mr="${p.id}" style="cursor:pointer"><span style="flex:1"><strong>${esc(p.numero)}</strong> ${esc(p.cliente)} · ${esc(p.comuna || '')}<br><span style="font-size:12px;color:var(--gris-2)">${esc(p.resumen || '')}</span></span>${estadoHtml(p.estado, true)}</div>`).join('') || '<div class="gris" style="font-size:13px">Nada con ese texto</div>';
    $$('[data-mr]', res).forEach(d => d.onclick = () => { const p = data.find(x => x.id === Number(d.dataset.mr)); cerrarModal(); if (p.estado === 'ENTREGADO') formPostventa(p, dia, despues); else formMovimiento(p, dia, despues); });
  };
  $('#mr-q').oninput = e => { clearTimeout(t); t = setTimeout(() => buscar(e.target.value), 250); };
}
async function cargarOperacion() {
  await cargarModelos(); await cargarMovimientos();
  const { data, error } = await sb.from('v_pedido_operacion').select('*').order('fecha_entrega', { ascending: true, nullsFirst: false }).order('prioridad'); if (error) throw error; cache.pedidos = data; return data;
}
function lunesDe(s) { const d = new Date(s + 'T12:00:00'); const dia = (d.getDay() + 6) % 7; d.setDate(d.getDate() - dia); return d; }
function etiquetaSemana(lunes) { const v = new Date(lunes); v.setDate(v.getDate() + 4); return `Semana del ${String(lunes.getDate()).padStart(2, '0')} al ${String(v.getDate()).padStart(2, '0')} de ${MESES_L[v.getMonth()]}`; }
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
  // Movimientos (retiros, visitas, instalaciones) como fila propia en su fecha, marcados MOV (Harold 13-oct); no cuentan como pedido
  const movFila = (m, p) => ['MOV', '-', p.cliente, 1, `${m.tipo === 'Retiro en cliente' ? 'RETIRO' : m.tipo.toUpperCase()}${m.fecha_propuesta ? ' (Alexis propone ' + fecha(m.fecha_propuesta) + ')' : ''}${m.nota ? ': ' + m.nota : ''}`, '-', '-', '-', m.direccion || p.direccion || 'dirección pendiente', '-', '-', '-', 'n/a', 'n/a', 'n/a', fecha(m.fecha)];
  const movsAct = (cache.movs || []).map(m => ({ m, p: activos.find(p => p.id === m.pedido_id) })).filter(e => e.p);
  const filaDe = e => e.m ? movFila(e.m, e.p) : fila(e.p);
  const tabla = lista => `<table class="lista impresion"><thead><tr>${cab.map(c => `<th>${c}</th>`).join('')}</tr></thead><tbody>${lista.map(e => `<tr class="${(e.m ? e.m.fecha < hoyISO() : e.p.atrasado) ? 'atrasado' : ''}${e.m ? ' mov' : ''}">${filaDe(e).map(v => `<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  const conE = con.map(p => ({ p, k: fe(p) })).concat(movsAct.map(e => ({ ...e, k: e.m.fecha }))).sort((a, b) => a.k.localeCompare(b.k)), sinE = sin.map(p => ({ p }));
  let cuerpo = '';
  if (activos.length < UMBRAL_PLANO) { cuerpo = tabla(conE) + (sinE.length ? `<h3 class="salto">Pedidos sin fecha de entrega</h3>${tabla(sinE)}` : ''); }
  else {
    const grupos = {}; conE.forEach(e => { const k = lunesDe(e.k).toISOString().slice(0, 10); (grupos[k] = grupos[k] || []).push(e); });
    cuerpo = Object.keys(grupos).sort().map(k => `<h3>${etiquetaSemana(new Date(k + 'T12:00:00'))}</h3>${tabla(grupos[k])}`).join('') + (sinE.length ? `<h3 class="salto">Pedidos sin fecha de entrega</h3>${tabla(sinE)}` : '');
  }
  app.innerHTML = barra(esOp ? '#/taller' : '#/lista') + `<div class="sub no-imprimir"><a href="${esOp ? '#/taller' : '#/lista'}">‹ Volver</a><button class="btn primario" onclick="window.print()">Imprimir</button><span style="color:var(--gris-3)">Mismo formato que el Listado Operacional en PDF (carta horizontal, ${activos.length < UMBRAL_PLANO ? 'una sola tabla' : 'agrupado por semana'}).</span></div>
    <div class="contenido listado-print"><div class="titulo-print">${esc(titulo)}</div>${cuerpo}</div>`;
}

/* ---------- ODT: orden de trabajo por etapa (Harold 12-oct, tanda 19) ----------
   Lo que está HOY en una etapa (ej. Barniz), ordenado por fecha de entrega, para imprimirlo y entregárselo al barnizador.
   Abajo, lo que viene a esa etapa (todavía en fabricación, armado o soldadura), para anticiparse. */
// Harold 13-oct: todo pedido entra de inmediato a la cola de producción (primera pestaña, ordenada por fecha de entrega; cambia si cambian las fechas); Fabricación es solo lo que se está fabricando.
// Harold 13-oct: la ODT que se le entrega al maestro es UNA lista por taller (lo que está en cola y lo que se está fabricando, por fecha
// de entrega); marcar FABRICANDO no la cambia, solo dice qué se está haciendo hoy. [clave, título, área, etapa de trabajo, acabado]
const ODT_ETAPAS = [['Carpintería', 'Carpintería', 'Carpintería', 'Fabricación', null], ['Soldadura', 'Soldadura', 'Soldadura', 'Soldadura', null], ['Armado muebles', 'Armado de muebles', 'Armado muebles', 'Armado', null], ['Barniz', 'Barniz', null, 'Barniz', 'Barniz'], ['Pintura', 'Pintura', null, 'Pintura', 'Pintura']];
async function vOdt() {
  const esOp = yo.rol === 'operacion';
  if (esOp) await cargarOperacion(); else { cache.filtro = 'pendientes'; await cargarPedidos(); }
  cache.odt = ODT_ETAPAS.some(e => e[0] === cache.odt) ? cache.odt : 'Carpintería';
  const [clave, titulo, area, etapa, acabado] = ODT_ETAPAS.find(e => e[0] === cache.odt) || ODT_ETAPAS[0];
  const fe = p => p.fecha_comprometida || p.fecha_estimada || null;
  const activos = cache.pedidos.filter(p => !['ENTREGADO', 'CANCELADO', 'DEVUELTO'].includes(p.estado) && !p.pago_pendiente);
  const filas = cond => activos.flatMap(p => (p.piezas || []).filter(x => x.area && cond(x)).map(x => ({ p, x })))
    .sort((a, b) => String(a.x.fecha_taller || fe(a.p) || '9').localeCompare(String(b.x.fecha_taller || fe(b.p) || '9')) || String(a.p.numero).localeCompare(String(b.p.numero)));
  const ahora = area ? filas(x => x.area === area && (x.etapa === 'En cola' || x.etapa === etapa)) : filas(x => x.etapa === etapa);
  const fabricando = ahora.filter(({ x }) => x.etapa === etapa).length;
  const vienen = acabado ? filas(x => x.acabado === acabado && ['En cola', 'Fabricación', 'Armado', 'Soldadura'].includes(x.etapa)) : [];
  // Formato de la ODT (Harold 13-oct): une su ODT de Excel (cliente, modelo, madera, tamaño, formato, cantidad, fecha comprometida, entrega/revisión, comentario)
  // con lo de la app (N° de pedido, terminación, estado). La fecha comprometida es PARA EL MAESTRO (por pieza), distinta de la entrega al cliente.
  const FORMA_TXT = { RECT: 'Rect.', CUA: 'Cuadr.', CIRC: 'Circ.', OVAL: 'Oval.' };
  const hoyI = hoyISO();
  const falta = t => `<span class="falta-dato">${t}</span>`;
  const maderaHtml = x => { const m = x.tipo === 'Base' ? x.material_base : (x.material_cubierta || x.material_base);
    const esp = x.espesor_mm ? num(x.espesor_mm) + ' mm' : (x.area === 'Carpintería' && x.tipo !== 'Servicio' && !/espesor/i.test(x.indicaciones || '') ? falta('esp.?') : '');
    return (m ? esc(nombreMaterial(m).toUpperCase()) : falta('madera?')) + (esp ? `<div class="l2">${esp}</div>` : ''); };
  const tamanoHtml = (x, p) => {
    if (x.medida_texto) return (/por definir|pendiente/i.test(x.medida_texto) ? falta(esc(x.medida_texto)) : esc(x.medida_texto)) + (x.tipo === 'Base' ? paraCub(x, p) : '');
    if (x.tipo === 'Base') {
      const cub = (p.piezas || []).find(y => y.tipo === 'Cubierta' && y.largo_cm);
      const para = cub ? `<div class="l2">para cubierta ${esc(medidaTxt(cub))} cm</div>` : '';
      if (x.largo_cm) return `Largo ${num(x.largo_cm)}${x.ancho_cm ? ' × Ancho ' + num(x.ancho_cm) : ''}${x.alto_cm ? ' × Alto ' + num(x.alto_cm) : ''} cm${para}`;
      if (/\.(MOS|LIN)\./.test(x.color || '')) return `Estándar ${esc(x.color)}${para}`;
      return falta('medidas por definir') + para;
    }
    if (!x.largo_cm) return falta('medidas por definir');
    if (x.forma === 'CIRC' && !x.ancho_cm || x.forma === 'CIRC' && x.ancho_cm === x.largo_cm && !x.alto_cm) return `Ø ${num(x.largo_cm)} cm${x.largo_ext_cm ? ' a ' + num(x.largo_ext_cm) + ' ext' : ''}`;
    return esc(medidaTxt(x, ' × ')) + ' cm';
  };
  const paraCub = (x, p) => { const cub = (p.piezas || []).find(y => y.tipo === 'Cubierta' && y.largo_cm); return cub ? `<div class="l2">para cubierta ${esc(medidaTxt(cub))} cm</div>` : ''; };
  const formatoTxt = x => x.tipo === 'Base' ? '' : [FORMA_TXT[x.forma], x.largo_ext_cm ? 'extensible' : ''].filter(Boolean).join(' · ');
  // Regla de columnas (Harold 13-oct): Modelo / pieza = solo el nombre (modelo de catálogo o nombre corto de la pieza) y el tipo;
  // Madera = material y espesor; Medidas = números o el texto de medidas; Term. = tono o color más la nota de acabado;
  // Indicaciones = lo que no cabe en las otras. Nada se repite entre columnas.
  const terminacion = x => [x.tipo === 'Base' || !x.tono ? (x.color ? nombreColor(x.color) : null) : tonoTxt(x.tono), x.nota_acabado].filter(Boolean).join(' · ');
  const esMedida = t => /^\s*[\dØ]/.test(t) || /\d\s*[x×]\s*\d/.test(t) || /\bcm\b|\bmm\b/.test(t);
  const nombrePieza = x => {
    const mod = x.tipo === 'Base' ? (x.modelo_base || x.modelo_cubierta) : (x.modelo_cubierta || x.modelo_base);
    // ESPECIAL no dice nada al maestro: se usa el tipo de mueble ("Mesa de centro a medida", Harold 20-oct) o la descripción corta ("Especial en base a Origen", Harold 13-oct)
    if (aMedidaTxt(x)) return ['Base', 'Cubierta'].includes(x.tipo) ? x.tipo + ' de ' + aMedidaTxt(x).toLowerCase() : aMedidaTxt(x);
    if (!['Mueble', 'Banca', 'Servicio', 'Repuesto', 'Barniz'].includes(x.tipo) && mod && mod !== 'ESPECIAL') return nombreModelo(mod) || mod;
    const partes = (x.descripcion || '').split(/\s·\s|:\s|,\s/).map(t => t.trim()).filter(t => t && !esMedida(t));
    return partes[0] || nombreModelo(x.modelo_cubierta || x.modelo_base) || '-';
  };
  const filaFecha = (x, p) => { const k = x.fecha_taller || null; return `<td class="nw"><span class="no-imprimir"><input type="date" class="f-taller" value="${k || ''}" data-ftaller="${x.id}" title="Fecha comprometida para el maestro (cuándo debe estar lista esta pieza)"></span><span class="solo-impresion">${k ? fecha(k, true) : '________'}</span>${p.urgente ? ' <strong>URG</strong>' : ''}</td>`; };
  // Anchos fijos por columna (Harold 13-oct: "deja un ancho estándar máximo"); al imprimir no hay columna de estado.
  const COLS = [['fecha', 'Fecha', 'Fecha comprometida para el maestro'], ['num', 'N°', ''], ['cli', 'Cliente', 'Toca el nombre para editar la pieza'], ['pieza', 'Pieza', ''], ['madera', 'Madera', 'Material y espesor'], ['medidas', 'Medidas L × A × Al', 'Largo × ancho × alto, siempre en ese orden'], ['forma', 'Form.', 'Formato'], ['ctd', 'Ctd', ''], ['term', 'Term.', 'Tono o color y acabado'], ['indic', 'Indicaciones', ''], ['estado no-imprimir', 'Estado', ''], ['hecho solo-impresion', 'Hecho', ''], ['rev solo-impresion', 'Entrega / Rev.', '']];
  const tabla = (lista, conChip) => !lista.length ? '<p class="gris" style="margin:6px 0 14px">Nada por ahora.</p>' : `<table class="lista impresion odt"><colgroup>${COLS.map(([c]) => `<col class="c-${c.split(' ')[0]} ${c.includes(' ') ? c.split(' ')[1] : ''}">`).join('')}</colgroup><thead><tr>${COLS.map(([c, t, tt]) => `<th class="${c}" title="${esc(tt)}">${c.startsWith('estado') && !conChip ? '' : esc(t)}</th>`).join('')}</tr></thead><tbody>${lista.map(({ p, x }) => {
    const fab = area && x.etapa === etapa, tarde = (x.fecha_taller || '9999') < hoyI || (!x.fecha_taller && p.atrasado);
    const ind = [x.indicaciones].filter(Boolean);
    return `<tr class="${tarde ? 'atrasado' : ''}${fab ? ' fabricando' : ''}">${filaFecha(x, p)}<td class="num">${esc(p.numero)}</td><td class="cli"><a class="cli-edit" data-editar-pieza="${x.id}" title="Editar esta pieza (medidas, formato, indicaciones, fecha para el maestro)">${esc(p.cliente)}</a></td>
    <td class="pieza"><strong>${esc(nombrePieza(x))}</strong><div class="l2">${aMedidaTxt(x) ? (detalleAMedidaHtml(x, p) || esc(x.tipo)) : [esc(x.tipo), detalleAMedidaHtml(x, p)].filter(Boolean).join(' · ')}</div></td>
    <td class="madera">${maderaHtml(x)}</td><td class="medidas">${tamanoHtml(x, p)}</td><td class="forma">${esc(formatoTxt(x))}</td><td class="ctd">${x.cantidad || 1}</td><td class="term">${esc(terminacion(x))}</td><td class="indic${esOp ? '' : ' ind-edit'}" ${esOp ? '' : `data-ind="${x.id}" title="Clic para cambiar las indicaciones del maestro"`}>${ind.map(esc).join(' · ')}</td>
    <td class="estado no-imprimir">${conChip ? etapaChip(x, p.id) : esc(x.etapa)}</td><td class="hecho solo-impresion caja-ok"></td><td class="rev solo-impresion caja-ok"></td></tr>`; }).join('')}</tbody></table>`;
  const hoy = new Date();
  app.innerHTML = barra('#/odt') + `<div class="sub no-imprimir">
      <span class="fgrupo"><span class="fgrupo-t">Etapa</span>${ODT_ETAPAS.map(([v, t]) => `<button class="ftog ${v === etapa ? 'on' : ''}" data-odt="${esc(v)}">${esc(t)}</button>`).join('')}</span>
      <button class="btn primario" onclick="window.print()">Imprimir ODT</button>
      <span style="color:var(--gris-3)">${area ? 'Una sola lista, ordenada por la fecha comprometida para el maestro (si una pieza no la tiene, por la entrega al cliente): la cola más lo que se está haciendo. Toca la pieza cuando el maestro la empiece (queda marcada y no sale de la lista); tócala de nuevo al terminar y pasa a barniz, pintura o embalado.' : 'Toca la pieza cuando termine esta etapa: pasa a la siguiente y sale de esta lista.'}</span></div>
    <div class="contenido listado-print odt-print"><div class="titulo-print">ORDEN DE TRABAJO · ${esc(titulo.toUpperCase())} · ${String(hoy.getDate()).padStart(2, '0')}/${String(hoy.getMonth() + 1).padStart(2, '0')}/${hoy.getFullYear()} · ${ahora.length} pieza${ahora.length === 1 ? '' : 's'}</div>
    <h3 class="no-imprimir">${area ? `Orden de trabajo por fecha comprometida (${ahora.length} piezas, ${fabricando} fabricándose ahora)` : `En ${esc(etapa.toLowerCase())} ahora (${ahora.length})`}</h3>${tabla(ahora, true)}
    ${acabado ? `<h3 class="no-imprimir">Vienen a ${esc(etapa.toLowerCase())} (todavía en fabricación, armado o soldadura: ${vienen.length})</h3><div class="no-imprimir">${tabla(vienen, true)}</div>` : ''}</div>`;
  $$('[data-odt]').forEach(b => b.onclick = () => { cache.odt = b.dataset.odt; vOdt(); });
  $$('[data-ftaller]').forEach(inp => { inp.onclick = ev => ev.stopPropagation(); inp.onchange = async () => {
    const id = Number(inp.dataset.ftaller), pz = cache.pedidos.flatMap(q => q.piezas || []).find(y => y.id === id), antes = pz && pz.fecha_taller;
    try { const r = await rpc('editar_pieza', { p_linea_id: id, p_cambios: { fecha_taller: inp.value || null } }); actualizarPiezas(r); aviso('Fecha para el maestro: ' + (inp.value ? fecha(inp.value, true) : 'sin fecha'));
      anotarCambio(`fecha para el maestro (volver a ${antes ? fecha(antes) : 'sin fecha'})`, async () => { actualizarPiezas(await rpc('editar_pieza', { p_linea_id: id, p_cambios: { fecha_taller: antes || null } })); });
      vOdt(); } catch (e) { aviso(errorDe(e), true); } }; });
  activarEtapas(app, () => vOdt());
  activarPiezasEdicion(app, () => vOdt());
}

/* ---------- Ruta (tanda 33, 15-oct-2026) ----------
   Harold: "yo no la tengo visible y debería tenerla", "la encontré engorrosa", "necesito sistema de optimización de ruta y que si un cliente
   tiene restricciones el sistema las considere". Una sola columna: la ruta del día arriba (paradas numeradas con hora estimada de llegada,
   confirmación del cliente, WhatsApp y Confirmó para Harold, ▲▼ que se guardan para todos), debajo lo propuesto por Alexis y, plegado,
   lo que se puede proponer. Orden: optimizado desde el taller (todas las permutaciones hasta 8 paradas; vecino más cercano más 2-opt
   con más), respetando "Recibe desde / hasta" del pedido y la regla fija de no llegar antes de las 10:00; empate: lejos primero.
   Ubicación: dirección real geolocalizada con OpenStreetMap (Nominatim, 1 consulta por dirección nueva, guardada en geocache); si no se
   ubica, el centro de la comuna y se dice "ubicación aprox.". Nada se inventa: sin dirección = la parada queda al final marcada. */
const TALLER = { nombre: 'Taller Santino', direccion: 'Lo Blanco 1919, La Pintana, Chile', lat: -33.5905, lng: -70.6330 };
const SALIDA_DEFECTO = '09:30', HORA_MIN_CLIENTE = '10:00';
const COMUNA_XY = { 'Vitacura': [-33.398, -70.577], 'Lo Barnechea': [-33.352, -70.516], 'Las Condes': [-33.408, -70.553], 'La Reina': [-33.445, -70.541], 'Providencia': [-33.431, -70.609], 'Ñuñoa': [-33.456, -70.598], 'Santiago': [-33.445, -70.653], 'Macul': [-33.487, -70.600], 'Peñalolén': [-33.488, -70.540], 'La Florida': [-33.523, -70.575], 'Huechuraba': [-33.370, -70.640], 'Colina': [-33.204, -70.675], 'Chicureo': [-33.280, -70.680], 'San Miguel': [-33.497, -70.652], 'Maipú': [-33.511, -70.758], 'Puente Alto': [-33.610, -70.575], 'Lampa': [-33.286, -70.876], 'Quilicura': [-33.360, -70.730], 'Padre Hurtado': [-33.572, -70.810], 'San Bernardo': [-33.592, -70.700], 'Buin': [-33.733, -70.742], 'Pudahuel': [-33.443, -70.758], 'Quinta Normal': [-33.428, -70.698], 'Cerrillos': [-33.497, -70.710], 'La Cisterna': [-33.533, -70.663], 'Recoleta': [-33.405, -70.640], 'Peñaflor': [-33.606, -70.876], 'Pedro Aguirre Cerda': [-33.490, -70.675], 'San Joaquín': [-33.493, -70.628], 'Independencia': [-33.417, -70.663], 'El Bosque': [-33.562, -70.675], 'Calera de Tango': [-33.629, -70.776], 'La Granja': [-33.539, -70.625], 'Conchalí': [-33.385, -70.675], 'Talagante': [-33.665, -70.928], 'Pirque': [-33.638, -70.550], 'Lo Prado': [-33.444, -70.725], 'Estación Central': [-33.460, -70.698], 'Lo Espejo': [-33.523, -70.690], 'El Monte': [-33.680, -70.985], 'Curacaví': [-33.401, -71.130], 'Melipilla': [-33.687, -71.214], 'Paine': [-33.808, -70.742], 'María Pinto': [-33.515, -71.120], 'Cerro Navia': [-33.422, -70.735], 'Renca': [-33.403, -70.712], 'San Ramón': [-33.540, -70.645], 'La Pintana': [-33.583, -70.634], 'Til Til': [-33.086, -70.928], 'Isla de Maipo': [-33.750, -70.900], 'San José de Maipo': [-33.640, -70.350] };
const sinTildes = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const COMUNA_XY_N = Object.fromEntries(Object.entries(COMUNA_XY).map(([k, v]) => [sinTildes(k), v]));
function xyComuna(c) { const v = COMUNA_XY_N[sinTildes(c)]; return v ? { lat: v[0], lng: v[1] } : null; }
const distKm = (a, b) => Math.hypot((a.lng - b.lng) * 92.7, (a.lat - b.lat) * 111.2) * 1.3;   // km por calle ≈ 1,3 × línea recta
const minViaje = km => Math.round(6 + km * 2.4);                                                 // 25 km/h en ciudad más 6 min de estacionar y subir
const esDepto = d => /\b(depto|dpto|departamento|edificio|piso|apt|torre|of(icina)?)\b/i.test(d || '');
function limpiarDireccion(d, comuna) { let s = (d || '').split(/[,;]/)[0]; s = s.replace(/\b(depto|dpto|departamento|casa|torre|piso|of(?:icina)?|cond(?:ominio)?|edificio|block|bloque|interior|parcela|local|km\.?)\b.*$/i, '').replace(/\s+/g, ' ').trim(); return s ? `${s}, ${comuna || 'Santiago'}, Chile` : ''; }
const horaMin = h => { if (!h) return null; const [a, b] = String(h).split(':').map(Number); return a * 60 + b; };
const minHora = m => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(Math.round(m) % 60).padStart(2, '0')}`;
const hhmm = h => h ? String(h).slice(0, 5) : '';
/* Minutos en el lugar (tabla de la skill auto-pedidodespacho v3.1): sin instalación 35; instalación en depto 40, en casa 50; con vidrio 90 */
function minParada(p) { if (!p || !p.instalacion) return 35; if ((p.piezas || []).some(x => /^V\./.test(x.material_cubierta || '') || /vidrio/i.test(x.descripcion || ''))) return 90; return esDepto(p.direccion) ? 40 : 50; }
const minMov = m => m.tipo === 'Instalación' ? 50 : m.tipo === 'Retiro en cliente' ? 20 : 30;

const geo = { cache: new Map(), fallo: new Set(), cargado: false };
async function cargarGeocache() { if (geo.cargado) return; const { data } = await sb.from('geocache').select('direccion,lat,lng,precision'); (data || []).forEach(g => geo.cache.set(g.direccion, g)); geo.cargado = true; }
/* Pone x.xy y x.precision ('calle' | 'comuna' | null) a cada parada; devuelve las direcciones que faltan geolocalizar (se hace después, sin bloquear) */
async function ubicar(paradas) {
  await cargarGeocache(); const nuevas = [];
  for (const x of paradas) {
    x.dirLimpia = limpiarDireccion(x.direccion, x.comuna); const g = x.dirLimpia && geo.cache.get(x.dirLimpia);
    if (g) { x.xy = { lat: g.lat, lng: g.lng }; x.precision = g.precision; continue; }
    const c = xyComuna(x.comuna); x.xy = c; x.precision = c ? 'comuna' : null;
    if (x.dirLimpia && !geo.fallo.has(x.dirLimpia)) nuevas.push(x);
  }
  return nuevas;
}
async function geocodificar(x) {   // OpenStreetMap Nominatim: máximo 1 consulta por segundo; resultado fuera de la comuna (calle homónima) se descarta
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=cl&q=${encodeURIComponent(x.dirLimpia)}`, { headers: { Accept: 'application/json' } });
    const h = ((await r.json()) || [])[0]; const c = xyComuna(x.comuna);
    if (h && (!c || distKm(c, { lat: +h.lat, lng: +h.lon }) < 15)) {
      const fila = { direccion: x.dirLimpia, lat: +h.lat, lng: +h.lon, precision: 'calle' }; geo.cache.set(x.dirLimpia, fila);
      const { error } = await sb.from('geocache').insert(fila); if (error) console.warn('geocache', error.message);
      x.xy = { lat: fila.lat, lng: fila.lng }; x.precision = 'calle'; return true;
    }
  } catch (e) { console.warn('nominatim', e.message); }
  geo.fallo.add(x.dirLimpia); return false;
}
/* Hora estimada de cada parada en el orden dado (x.eta, x.espera, x.tarde); viaje sin ubicación = 20 min */
function horario(lista, salida) {
  let t = horaMin(salida) || horaMin(SALIDA_DEFECTO), prev = TALLER, tarde = 0, espera = 0;
  for (const x of lista) {
    t += x.xy && prev ? minViaje(distKm(prev, x.xy)) : 20;
    const desde = Math.max(horaMin(HORA_MIN_CLIENTE), horaMin(x.hora_desde) || 0); x.espera = t < desde ? desde - t : 0; t = Math.max(t, desde);
    const hasta = horaMin(x.hora_hasta); x.tarde = hasta && t > hasta ? t - hasta : 0; tarde += x.tarde; espera += x.espera;
    x.eta = t; t += x.minutos; prev = x.xy || prev;
  }
  t += prev ? minViaje(distKm(prev, TALLER)) : 20;
  return { fin: t, tarde, espera, costo: t - (horaMin(salida) || horaMin(SALIDA_DEFECTO)) + tarde * 10 };
}
/* Mejor orden: menor tiempo total con vuelta al taller, penalizando llegar después de la hora del cliente; hasta 8 paradas prueba todos los órdenes */
function planificar(paradas, salida) {
  const con = paradas.filter(x => x.xy), sin = paradas.filter(x => !x.xy); const n = con.length;
  if (!n) { const e = horario(sin, salida); return { orden: sin, ...e }; }
  let mejor = null;
  const probar = seq => { const l = seq.map(k => con[k]); const e = horario(l, salida); const d0 = distKm(TALLER, l[0].xy), dm = mejor ? distKm(TALLER, mejor.l[0].xy) : 0;
    if (!mejor || e.costo < mejor.e.costo - 0.5 || (Math.abs(e.costo - mejor.e.costo) <= 0.5 && d0 > dm)) mejor = { l, e }; return e.costo; };
  const idx = con.map((_, i) => i);
  if (n <= 8) { const perm = (rest, acc) => { if (!rest.length) return probar(acc); rest.forEach((k, i) => perm(rest.filter((_, j) => j !== i), acc.concat(k))); }; perm(idx, []); }
  else {
    let seq = [], prev = TALLER, libres = new Set(idx);
    while (libres.size) { let m = null; libres.forEach(k => { if (m == null || distKm(prev, con[k].xy) < distKm(prev, con[m].xy)) m = k; }); seq.push(m); libres.delete(m); prev = con[m].xy; }
    probar(seq); let mejora = true, vueltas = 0;
    while (mejora && vueltas++ < 20) { mejora = false; for (let i = 0; i < n - 1; i++) for (let j = i + 1; j < n; j++) { const s = seq.slice(0, i).concat(seq.slice(i, j + 1).reverse(), seq.slice(j + 1)); const antes = mejor.e.costo; if (probar(s) < antes - 0.5) { seq = s; mejora = true; } } }
  }
  const orden = mejor.l.concat(sin); const e = horario(orden, salida); return { orden, ...e };
}
function paradaDePedido(p) { return { k: 'p' + p.id, tipo: 'pedido', id: p.id, p, numero: p.numero, cliente: p.cliente, telefono: p.cliente_telefono, comuna: p.comuna, direccion: p.direccion, nota: p.nota_entrega, resumen: p.resumen, instalacion: p.instalacion, saldo: Number(p.saldo_por_cobrar ?? p.saldo ?? 0), confirmado: !!p.despacho_confirmado_en, hora_desde: hhmm(p.hora_desde), hora_hasta: hhmm(p.hora_hasta), minutos: minParada(p), orden: p.orden_ruta }; }
function paradaDeMov(m) { const p = cache.pedidos.find(x => x.id === m.pedido_id) || {}; return { k: 'm' + m.id, tipo: 'mov', id: m.id, m, p, numero: p.numero || '', cliente: p.cliente || '', telefono: p.cliente_telefono, comuna: p.comuna, direccion: m.direccion || p.direccion, nota: m.nota, resumen: m.tipo, instalacion: m.tipo === 'Instalación', saldo: 0, confirmado: true, minutos: minMov(m), orden: m.orden_ruta }; }
async function guardarOrdenRuta(orden, antes) {
  const ped = orden.filter(x => x.tipo === 'pedido'), mov = orden.filter(x => x.tipo === 'mov');
  await rpc('ordenar_ruta', { p_pedidos: ped.map(x => x.id), p_movimientos: mov.map(x => x.id), p_orden_pedidos: ped.map(x => orden.indexOf(x) + 1), p_orden_movimientos: mov.map(x => orden.indexOf(x) + 1) });
  if (antes) anotarCambio('orden de la ruta', async () => { await rpc('ordenar_ruta', { p_pedidos: antes.filter(x => x.tipo === 'pedido').map(x => x.id), p_movimientos: antes.filter(x => x.tipo === 'mov').map(x => x.id), p_orden_pedidos: antes.filter(x => x.tipo === 'pedido').map(x => x.orden), p_orden_movimientos: antes.filter(x => x.tipo === 'mov').map(x => x.orden) }); });
}
function linkMaps(orden) { const w = orden.filter(x => x.dirLimpia).map(x => x.dirLimpia); if (!w.length) return ''; return `https://www.google.com/maps/dir/?api=1&travelmode=driving&origin=${encodeURIComponent(TALLER.direccion)}&destination=${encodeURIComponent(TALLER.direccion)}&waypoints=${w.slice(0, 9).map(encodeURIComponent).join('%7C')}`; }
async function vRuta() {
  const esOp = yo.rol === 'operacion';
  await (esOp ? cargarOperacion() : (cache.filtro = 'pendientes', cargarPedidos()));
  if (!cache.rutaFecha) cache.rutaFecha = hoyISO();
  const f = cache.rutaFecha, salida = cache.rutaSalida || SALIDA_DEFECTO, hoy = hoyISO(), manana = hoyISO(1);
  const saldoDe = p => Number(p.saldo_por_cobrar ?? p.saldo ?? 0);
  const programados = cache.pedidos.filter(p => p.estado === 'DESPACHO PROGRAMADO' && p.fecha_comprometida === f);
  const regiones = programados.filter(p => p.tipo_entrega === 'Despacho regiones'), retiros = programados.filter(p => p.tipo_entrega === 'Retiro en taller');
  const movsDia = (cache.movs || []).filter(m => m.fecha === f && cache.pedidos.some(x => x.id === m.pedido_id));
  const propuestos = cache.pedidos.filter(p => p.estado !== 'DESPACHO PROGRAMADO' && p.despacho_propuesto === f);
  /* Harold 22-oct: "en la ruta no me aparecen los demás pedidos para poder verlos y confirmar con los clientes": los candidatos suman
     POR FABRICAR y DISEÑO APROBADO, van por fecha de entrega y la lista queda abierta; los programados de otros días tienen su propia sección. */
  const fEntrega = p => p.fecha_comprometida || p.fecha_estimada || '9999';
  const candidatos = cache.pedidos.filter(p => ['LISTO EN TALLER', 'EN FABRICACIÓN', 'POR FABRICAR', 'DISEÑO APROBADO'].includes(p.estado) && p.despacho_propuesto !== f && p.tipo_entrega !== 'Retiro en taller')
    .sort((a, b) => (b.estado === 'LISTO EN TALLER') - (a.estado === 'LISTO EN TALLER') || fEntrega(a).localeCompare(fEntrega(b)));
  const otrosDias = cache.pedidos.filter(p => p.estado === 'DESPACHO PROGRAMADO' && p.fecha_comprometida && p.fecha_comprometida !== f).sort((a, b) => a.fecha_comprometida.localeCompare(b.fecha_comprometida));
  const movsOtros = (cache.movs || []).filter(m => m.fecha !== f && cache.pedidos.some(x => x.id === m.pedido_id)).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const paradas = programados.filter(p => !regiones.includes(p) && !retiros.includes(p)).map(paradaDePedido).concat(movsDia.map(paradaDeMov));
  const nuevas = await ubicar(paradas);
  const guardadas = paradas.filter(x => x.orden != null).sort((a, b) => a.orden - b.orden), libres = paradas.filter(x => x.orden == null);
  let orden, plan;
  if (guardadas.length) { orden = guardadas.concat(libres.length ? planificar(libres, salida).orden : []); plan = horario(orden, salida); }
  else { plan = planificar(paradas, salida); orden = plan.orden; }
  const porConfirmar = orden.filter(x => x.tipo === 'pedido' && !x.confirmado).length, cobrar = orden.reduce((s, x) => s + (x.saldo > 0 ? x.saldo : 0), 0);
  const chipConf = x => x.tipo !== 'pedido' ? '' : x.confirmado ? '<span class="chip ok">CONFIRMADO</span>' : `<span class="chip saldo" title="${esOp ? 'Harold confirma con el cliente' : 'Manda el WhatsApp y marca Confirmó cuando el cliente responda'}">POR CONFIRMAR</span>`;
  const tel = x => x.telefono ? `<a href="tel:${esc(x.telefono)}" style="white-space:nowrap">${esc(x.telefono)}</a>` : '<span class="falta-dato">sin teléfono</span>';
  const tarjeta = (x, i) => `<div class="parada${x.tipo === 'mov' ? ' mov' : ''}${x.tarde ? ' tarde' : ''}" data-k="${x.k}">
      <div class="n">${x.tipo === 'mov' ? (x.m.tipo === 'Retiro en cliente' ? 'R' : x.m.tipo[0]) : i + 1}</div>
      <div class="cuerpo">
        <div class="num"><a class="ficha-num" href="#/pedido/${x.p.id || ''}">${esc(x.numero)}</a> ${esc(x.cliente)} ${x.tipo === 'mov' ? `<span class="chip inst">${esc(x.m.tipo.toUpperCase())}</span>` : ''}${x.instalacion && x.tipo === 'pedido' ? ' <span class="chip inst">INSTALACIÓN</span>' : ''} ${x.tipo === 'pedido' ? (x.saldo > 0 ? `<span class="chip saldo">COBRAR ${pesos(x.saldo)}</span>` : '<span class="chip ok">PAGADO</span>') : ''} ${chipConf(x)}${x.tipo === 'pedido' && x.p.despacho_propuesto && x.p.despacho_propuesto !== x.p.fecha_comprometida ? ` <span class="chip prop" title="Propuesta de otro día pendiente de evaluar">${esc((x.p.despacho_propuesto_por || 'Se').toUpperCase())} PROPONE ${fecha(x.p.despacho_propuesto, true)}</span>${!esOp ? `<button class="btn chico primario" data-acepta-prop="${x.id}" title="Mover la entrega a ese día como confirmada">Aceptar</button><button class="btn chico borde" data-descarta-prop="${x.id}">Descartar</button>` : ''}` : ''}</div>
        <div class="gris">${x.direccion ? esc(x.direccion) : '<span class="falta-dato">dirección pendiente</span>'}${x.comuna ? ' · ' + esc(x.comuna) : ' · <span class="falta-dato">sin comuna</span>'} · ${tel(x)}${x.precision === 'comuna' ? ' · <span title="No se pudo ubicar la calle: se usa el centro de la comuna">ubicación aprox.</span>' : x.precision == null ? ' · <span class="falta-dato">sin ubicación: va al final</span>' : ''}</div>
        <div>${esc(x.resumen || '')}${x.nota ? ` · <em>${esc(x.nota)}</em>` : ''}</div>
        <div class="gris">llega ~<strong>${minHora(x.eta)}</strong> · ${x.minutos} min${x.hora_desde || x.hora_hasta ? ` · recibe ${x.hora_desde || '…'} a ${x.hora_hasta || '…'}` : ''}${x.espera ? ` · <span class="ambar-txt">espera ${x.espera} min hasta las ${x.hora_desde || HORA_MIN_CLIENTE}</span>` : ''}${x.tarde ? ` · <span class="rojo">llega ${x.tarde} min después de las ${x.hora_hasta}</span>` : ''}</div>
      </div>
      <div class="acc no-imprimir">
        ${!esOp && x.tipo === 'pedido' ? menuWsp(x.p) : ''}
        ${!esOp && x.tipo === 'pedido' && !x.confirmado ? `<button class="btn chico primario" data-confirmar="${x.id}" title="El cliente respondió que recibe ese día">Confirmó</button>` : ''}
        ${!esOp && x.tipo === 'pedido' ? `<button class="btn chico borde" data-horario="${x.id}" title="Restricción horaria del cliente (recibe desde / hasta)">Horario</button>` : ''}
        ${x.tipo === 'pedido' ? `<span class="menu-mas"><button type="button" class="btn chico borde" data-menu="mover${x.id}">Mover ▾</button><div class="menu-lista mover" data-menu-lista="mover${x.id}"><label>Nueva fecha <input type="date" data-mover-fecha="${x.id}"></label>${esOp ? `<button type="button" data-mover="propone" data-id="${x.id}">Proponer ese día (Harold confirma con el cliente)</button>` : `<button type="button" data-mover="confirmar" data-id="${x.id}">El cliente confirmó ese día: mover</button><button type="button" data-mover="propone" data-id="${x.id}">El cliente propone ese día: evaluar con Alexis</button><button type="button" data-mover="sacar" data-id="${x.id}">Sacar de la ruta (vuelve a Listo en taller)</button>`}</div></span>` : ''}
        <button class="btn chico" data-sube="${i}" aria-label="Subir" ${i === 0 ? 'disabled' : ''}>▲</button><button class="btn chico" data-baja="${i}" aria-label="Bajar" ${i === orden.length - 1 ? 'disabled' : ''}>▼</button>
        ${x.tipo === 'pedido' ? `<button class="btn chico ${esOp ? 'primario' : 'borde'}" data-entregar="${x.id}">Entregado</button>` : `${esOp ? '' : `<button class="btn chico borde" data-mov-editar="${x.id}" title="Cambiar qué se hace, la nota o la dirección">Editar</button>`}<button class="btn chico ${esOp ? 'primario' : 'borde'}" data-mov-hecho="${x.id}">Hecho</button>`}
      </div></div>`;
  const propHtml = p => `<div class="prop"><span style="flex:1"><strong><a class="ficha-num" href="#/pedido/${p.id}">${esc(p.numero)}</a></strong> ${esc(p.cliente)} · ${esc(p.comuna || '')}<br><span style="font-size:12px;color:var(--gris-2)">${esc(p.resumen || '')}${saldoDe(p) > 0 ? ` · cobrar ${pesos(saldoDe(p))}` : ' · pagado'}${p.estado !== 'LISTO EN TALLER' ? ` · ${esc(p.estado)} ${p.piezas_listas}/${p.piezas_total}` : ''}</span></span>
      <span class="acc">${esOp ? `<span class="chip prop">PROPUESTO · esperando a Harold</span><button class="btn chico borde" data-prop-quitar="${p.id}">Quitar</button>` : `<span class="chip prop">Alexis propone</span>${menuWsp(p)}<button class="btn chico primario" data-confirmar="${p.id}" title="Entra a la ruta de este día como confirmado">Confirmó</button><input type="date" data-conf-fecha="${p.id}" value="" title="Si el cliente prefiere otro día" style="min-height:32px;padding:2px 6px"><button class="btn chico borde" data-conf-otro="${p.id}">Otro día</button>`}</span></div>`;
  const candHtml = p => { const listo = p.estado === 'LISTO EN TALLER'; return `<div class="prop">${esOp ? `<input type="checkbox" data-prop="${p.id}" ${listo ? '' : 'disabled'} title="Proponer para este día; Harold confirma con el cliente">` : ''}<span style="flex:1"><strong><a class="ficha-num" href="#/pedido/${p.id}">${esc(p.numero)}</a></strong> ${esc(p.cliente)} · ${esc(p.comuna || '')}${p.despacho_propuesto ? ` · <span class="chip prop">propuesto ${fecha(p.despacho_propuesto, true)}</span>` : ''}<br><span style="font-size:12px;color:var(--gris-2)">${esc(p.resumen || '')}${saldoDe(p) > 0 ? ` · cobrar ${pesos(saldoDe(p))}` : ' · pagado'}${p.tipo_entrega === 'Despacho regiones' ? ' · regiones: va por guía' : ''}${fEntrega(p) !== '9999' ? ` · entrega ${fecha(fEntrega(p), true)}` : ''}</span></span>
      <span class="acc">${listo ? '<span class="chip ok">LISTO</span>' : `<span class="chip">${esc(p.estado)} · ${p.piezas_listas}/${p.piezas_total}</span>`}${!esOp ? menuWsp(p) : ''}${!esOp ? `<input type="date" data-prog-fecha="${p.id}" value="${f}" style="min-height:32px;padding:2px 6px"><button class="btn chico borde" data-programar="${p.id}" title="Acordado con el cliente: entra a la ruta de ese día como confirmado">Programar</button>` : ''}</span></div>`; };
  const movOtroHtml = m => { const pm = cache.pedidos.find(x => x.id === m.pedido_id) || {}; const prop = m.fecha_propuesta === f; return `<div class="prop">${esOp ? `<input type="checkbox" data-movprop="${m.id}" ${prop ? 'checked' : ''}>` : ''}<span style="flex:1"><strong>${esc(m.tipo)}</strong> · <a class="ficha-num" href="#/pedido/${pm.id || ''}">${esc(pm.numero || '')}</a> ${esc(pm.cliente || '')} · ${esc(pm.comuna || '')}<br><span style="font-size:12px;color:var(--gris-2)">${esc(m.nota || '')}${m.nota ? ' · ' : ''}${esc(m.direccion || pm.direccion || 'dirección pendiente')} · fecha ${fecha(m.fecha, true)}${m.fecha_propuesta && !prop ? ' · Alexis propone ' + fecha(m.fecha_propuesta, true) : ''}</span></span>
      <span class="acc">${prop ? '<span class="chip prop">PROPUESTO para este día</span>' : ''}${prop && !esOp ? `<button class="btn chico primario" data-mov-conf="${m.id}">Aceptar</button>` : ''}${!esOp ? `<input type="date" data-mov-fecha="${m.id}" value="${m.fecha}" title="Cambiar la fecha" style="min-height:32px;padding:2px 6px">` : ''}</span></div>`; };
  const resumen = `${orden.length} parada${orden.length === 1 ? '' : 's'}${porConfirmar ? ` · <strong class="ambar-txt">${porConfirmar} por confirmar</strong>` : orden.length ? ' · todas confirmadas' : ''}${cobrar ? ` · cobrar ${pesos(cobrar)}` : ''}${orden.length ? ` · vuelta al taller ~${minHora(plan.fin)}` : ''}`;
  app.innerHTML = barra('#/ruta') + `<div class="sub no-imprimir"><label>Día <input type="date" id="f-ruta" value="${f}"></label><button class="btn chico ${f === hoy ? 'primario' : 'borde'}" data-dia="${hoy}">Hoy</button><button class="btn chico ${f === manana ? 'primario' : 'borde'}" data-dia="${manana}">Mañana</button>
      <label title="Hora a la que sale Alexis del taller; las horas de llegada se calculan desde aquí">Salida <input type="time" id="h-salida" value="${salida}" style="min-height:34px;padding:4px 8px"></label>
      <div class="pasos"><span>1. Alexis propone</span><span>2. Harold manda WhatsApp</span><span>3. Cliente confirma</span><span>4. Alexis entrega</span></div></div>
    <div class="contenido ruta">
      <section class="seccion"><div class="cab"><h2>Ruta del ${fecha(f, true)}</h2><span class="gris" style="font-size:13px">${resumen}</span></div>
        <div class="ruta-cab no-imprimir"><span class="gris" style="font-size:12px">${guardadas.length ? 'Orden guardado (▲▼ para cambiar; lo ven todos).' : 'Orden propuesto por cercanía desde el taller y por el horario de cada cliente; ▲▼ lo cambia y lo guarda.'}${nuevas.length ? ` Ubicando ${nuevas.length} dirección${nuevas.length > 1 ? 'es' : ''} nueva${nuevas.length > 1 ? 's' : ''}…` : ''}</span>
          <span class="espacio"></span>${orden.length > 1 ? `<button class="btn chico borde" id="b-reordenar" title="Vuelve a calcular el mejor orden y lo guarda">Reordenar por cercanía</button>` : ''}${linkMaps(orden) ? `<a class="btn chico borde" target="_blank" href="${linkMaps(orden)}" title="Abre Google Maps con las paradas en este orden, saliendo y volviendo al taller${orden.filter(x => x.dirLimpia).length > 9 ? ' (solo las primeras 9)' : ''}">Abrir en Google Maps</a>` : ''}${!esOp ? `<button class="btn chico borde" id="b-mov-ruta" title="Retiro, visita técnica, instalación o entrega extra para este día; si el pedido ya está entregado se crea una Postventa">+ Movimiento</button>` : ''}<button class="btn chico borde" onclick="window.print()">Imprimir</button><button class="btn chico borde" id="b-etiq" ${orden.some(x => x.tipo === 'pedido') ? '' : 'disabled'}>Etiquetas</button></div>
        <div class="ruta-lista">${orden.map(tarjeta).join('') || '<div style="color:var(--gris-3)">Sin entregas confirmadas ni programadas para este día</div>'}</div>
        ${plan.fin > horaMin('19:00') && orden.length ? `<div class="rojo" style="margin-top:8px">Ojo: la ruta termina después de las 19:00 (~${minHora(plan.fin)}). Conviene mover una parada a otro día.</div>` : ''}
        ${retiros.length ? `<div style="margin-top:10px;font-size:13px"><strong>Retiran en el taller este día:</strong> ${retiros.map(p => `${esc(p.numero)} ${esc(p.cliente)}${saldoDe(p) > 0 ? ' (cobrar ' + pesos(saldoDe(p)) + ')' : ''}`).join(' · ')}</div>` : ''}
        ${regiones.length ? `<div style="margin-top:6px;font-size:13px"><strong>Regiones (guía y transporte, no van en ruta):</strong> ${regiones.map(p => `${esc(p.numero)} ${esc(p.cliente)} · ${esc(p.comuna || '')}`).join(' · ')}</div>` : ''}</section>
      ${propuestos.length || !esOp ? `<section class="seccion no-imprimir"><div class="cab"><h2>Propuestos por Alexis para este día (${propuestos.length})</h2><span class="gris" style="font-size:12px">${esOp ? 'Harold manda el WhatsApp y confirma' : 'Manda el WhatsApp; cuando el cliente responda, Confirmó los pasa a la ruta'}</span></div>
        ${propuestos.map(propHtml).join('') || '<div style="color:var(--gris-3)">Nada propuesto para este día</div>'}</section>` : ''}
      ${otrosDias.length ? `<section class="seccion no-imprimir"><div class="cab"><h2>Programados para otros días (${otrosDias.length})</h2><span class="gris" style="font-size:12px">${esOp ? 'Harold confirma con el cliente' : 'Manda el WhatsApp y marca Confirmó cuando el cliente responda'}</span></div>
        ${otrosDias.map(p => `<div class="prop"><span style="flex:1"><strong><a class="ficha-num" href="#/pedido/${p.id}">${esc(p.numero)}</a></strong> ${esc(p.cliente)} · ${esc(p.comuna || '')}${p.tipo_entrega === 'Despacho regiones' ? ' · regiones' : p.tipo_entrega === 'Retiro en taller' ? ' · retira en taller' : ''}<br><span style="font-size:12px;color:var(--gris-2)">${esc(p.resumen || '')}${saldoDe(p) > 0 ? ` · cobrar ${pesos(saldoDe(p))}` : ' · pagado'}</span></span>
          <span class="acc"><button class="btn chico borde" data-dia="${p.fecha_comprometida}" title="Ver la ruta de ese día">${fecha(p.fecha_comprometida, true)}</button>${p.despacho_confirmado_en ? '<span class="chip ok">CONFIRMADO</span>' : '<span class="chip saldo">POR CONFIRMAR</span>'}${!esOp ? menuWsp(p) : ''}${!esOp && !p.despacho_confirmado_en ? `<button class="btn chico primario" data-conf-dia="${p.id}" title="El cliente respondió que recibe ese día">Confirmó</button>` : ''}</span></div>`).join('')}</section>` : ''}
      <details class="seccion plegable no-imprimir" open><summary>${esOp ? 'Proponer para este día' : 'Programar otro pedido para este día'} · listos, en fabricación y por fabricar (${candidatos.length})</summary>
        <div class="gris" style="font-size:12px;margin:4px 0 8px">${esOp ? 'Marca lo que se puede despachar ese día; Harold confirma con el cliente.' : 'Programar = ya lo acordaste con el cliente: entra a la ruta como confirmado.'}</div>
        ${candidatos.map(candHtml).join('') || '<div style="color:var(--gris-3)">Nada listo en taller</div>'}</details>
      ${movsOtros.length ? `<details class="seccion plegable no-imprimir"><summary>Otros movimientos pendientes (retiros, visitas, instalaciones) · ${movsOtros.length}</summary>${movsOtros.map(movOtroHtml).join('')}</details>` : ''}
    </div>`;
  $('#f-ruta').onchange = e => { cache.rutaFecha = e.target.value; vRuta(); };
  $$('[data-dia]').forEach(b => b.onclick = () => { cache.rutaFecha = b.dataset.dia; vRuta(); });
  $('#h-salida').onchange = e => { cache.rutaSalida = e.target.value || SALIDA_DEFECTO; vRuta(); };
  const antesOrden = orden.map(x => ({ tipo: x.tipo, id: x.id, orden: x.orden }));
  $$('[data-sube],[data-baja]').forEach(b => b.onclick = async () => { const i = Number(b.dataset.sube ?? b.dataset.baja), j = b.dataset.sube != null ? i - 1 : i + 1; if (j < 0 || j >= orden.length) return; const o = orden.slice();[o[i], o[j]] = [o[j], o[i]]; try { await guardarOrdenRuta(o, antesOrden); vRuta(); } catch (e) { aviso(errorDe(e), true); } });
  const br = $('#b-reordenar'); if (br) br.onclick = async () => { try { const mejor = planificar(paradas, salida).orden; await guardarOrdenRuta(mejor, antesOrden); aviso('Ruta reordenada por cercanía y horario'); vRuta(); } catch (e) { aviso(errorDe(e), true); } };
  $$('[data-confirmar]').forEach(b => b.onclick = async () => { const id = Number(b.dataset.confirmar); try { await rpc('confirmar_despacho', { p_pedido_id: id }); aviso('Confirmado por el cliente ✓'); anotarCambio('confirmación del cliente (volver a por confirmar)', () => rpc('confirmar_despacho', { p_pedido_id: id, p_quitar: true })); vRuta(); } catch (e) { aviso(errorDe(e), true); } });
  $$('[data-conf-otro]').forEach(b => b.onclick = async () => { const id = Number(b.dataset.confOtro); const d = $(`[data-conf-fecha="${id}"]`).value; if (!d) return aviso('Elige el día que acordó el cliente', true); try { await rpc('confirmar_despacho', { p_pedido_id: id, p_fecha: d }); aviso('Confirmado para el ' + fecha(d, true)); cache.rutaFecha = d; vRuta(); } catch (e) { aviso(errorDe(e), true); } });
  $$('[data-horario]').forEach(b => b.onclick = () => { const p = cache.pedidos.find(x => x.id === Number(b.dataset.horario)); formHorarioEntrega(p, () => vRuta()); });
  $$('[data-conf-dia]').forEach(b => b.onclick = async () => { const p = cache.pedidos.find(x => x.id === Number(b.dataset.confDia)); if (!p) return; try { await rpc('confirmar_despacho', { p_pedido_id: p.id, p_fecha: p.fecha_comprometida }); aviso(`${p.numero} confirmado para el ${fecha(p.fecha_comprometida, true)} ✓`); anotarCambio('confirmación del cliente (volver a por confirmar)', () => rpc('confirmar_despacho', { p_pedido_id: p.id, p_quitar: true })); vRuta(); } catch (e) { aviso(errorDe(e), true); } });
  $$('[data-entregar]').forEach(b => b.onclick = () => formEntregar(cache.pedidos.find(p => p.id === Number(b.dataset.entregar)), () => vRuta()));
  $$('[data-prop]').forEach(c => c.onchange = async () => { try { await rpc('proponer_despacho', { p_pedido_id: Number(c.dataset.prop), p_fecha: c.checked ? f : null }); aviso(c.checked ? 'Propuesto; Harold avisa al cliente' : 'Propuesta retirada'); vRuta(); } catch (e) { aviso(errorDe(e), true); } });
  $$('[data-prop-quitar]').forEach(b => b.onclick = async () => { try { await rpc('proponer_despacho', { p_pedido_id: Number(b.dataset.propQuitar), p_fecha: null }); aviso('Propuesta retirada'); vRuta(); } catch (e) { aviso(errorDe(e), true); } });
  $$('[data-movprop]').forEach(c => c.onchange = async () => { const id = Number(c.dataset.movprop); const { error } = await sb.from('movimiento').update({ fecha_propuesta: c.checked ? f : null }).eq('id', id); if (error) return aviso(errorDe(error), true); aviso(c.checked ? 'Propuesto; Harold avisa al cliente' : 'Propuesta retirada'); await cargarMovimientos(); vRuta(); });
  candidatos.forEach(p => { const b = $(`[data-programar="${p.id}"]`); if (b) activarProgramar(b.closest('.prop'), p, () => vRuta()); });
  const bm = $('#b-mov-ruta'); if (bm) bm.onclick = () => formMovimientoRuta(f, async () => { await cargarMovimientos(); vRuta(); });
  const be = $('#b-etiq'); if (be) be.onclick = () => imprimirEtiquetas(orden.filter(x => x.tipo === 'pedido').map(x => x.p));
  activarMenusWsp(app); activarMenus(app);
  const pedidoDe = b => cache.pedidos.find(p => p.id === Number(b.dataset.id || b.dataset.aceptaProp || b.dataset.descartaProp));
  $$('[data-mover]').forEach(b => b.onclick = async ev => { ev.stopPropagation(); const p = pedidoDe(b); if (!p) return; const d = ($(`[data-mover-fecha="${p.id}"]`) || {}).value; b.closest('.menu-lista').classList.remove('abierto');
    try {
      if (b.dataset.mover === 'sacar') { if (!confirm(`¿Sacar ${p.numero} de la ruta? Vuelve a LISTO EN TALLER sin día de entrega confirmado.`)) return; await rpc('cambiar_estado', { p_pedido_id: p.id, p_estado: 'LISTO EN TALLER' }); const { error } = await sb.from('pedido').update({ despacho_propuesto: null, despacho_propuesto_por: null, despacho_confirmado_en: null, orden_ruta: null }).eq('id', p.id); if (error) throw error; aviso(`${p.numero} fuera de la ruta`); anotarCambio(`${p.numero} fuera de la ruta (volver a programado el ${fecha(f)})`, () => rpc('programar_despacho', { p_pedido_id: p.id, p_fecha: f })); return vRuta(); }
      if (!d) return aviso('Elige la nueva fecha en el menú Mover', true);
      if (b.dataset.mover === 'confirmar') { await rpc('confirmar_despacho', { p_pedido_id: p.id, p_fecha: d }); aviso(`${p.numero} movido al ${fecha(d, true)} (confirmado)`); anotarCambio(`${p.numero} movido (volver al ${fecha(f)})`, () => rpc('confirmar_despacho', { p_pedido_id: p.id, p_fecha: f })); return vRuta(); }
      if (esOp) { await rpc('proponer_despacho', { p_pedido_id: p.id, p_fecha: d }); aviso('Propuesto; Harold lo confirma con el cliente'); return vRuta(); }
      const { error } = await sb.from('pedido').update({ despacho_propuesto: d, despacho_propuesto_por: 'Cliente' }).eq('id', p.id); if (error) throw error; aviso(`Anotado: el cliente propone el ${fecha(d, true)}; evalúa con Alexis y Acepta o Descarta`); vRuta();
    } catch (e) { aviso(errorDe(e), true); } });
  $$('[data-acepta-prop]').forEach(b => b.onclick = async () => { const p = pedidoDe(b); if (!p || !p.despacho_propuesto) return; try { await rpc('confirmar_despacho', { p_pedido_id: p.id, p_fecha: p.despacho_propuesto }); aviso(`${p.numero} movido al ${fecha(p.despacho_propuesto, true)} (confirmado)`); anotarCambio(`${p.numero} movido (volver al ${fecha(f)})`, () => rpc('confirmar_despacho', { p_pedido_id: p.id, p_fecha: f })); vRuta(); } catch (e) { aviso(errorDe(e), true); } });
  $$('[data-descarta-prop]').forEach(b => b.onclick = async () => { const p = pedidoDe(b); if (!p) return; const { error } = await sb.from('pedido').update({ despacho_propuesto: p.fecha_comprometida, despacho_propuesto_por: null }).eq('id', p.id); if (error) return aviso(errorDe(error), true); aviso('Propuesta descartada; sigue el ' + fecha(p.fecha_comprometida, true)); vRuta(); });
  activarMovimientos(app, {}, () => vRuta());
  if (nuevas.length) (async () => { let cambio = false; for (const x of nuevas) { if (await geocodificar(x)) cambio = true; await new Promise(r => setTimeout(r, 1100)); } if (cambio && location.hash === '#/ruta' && cache.rutaFecha === f) vRuta(); })();
}
/* Restricción horaria del cliente: dos columnas del pedido (hora_desde, hora_hasta); el optimizador de la Ruta las respeta */
function formHorarioEntrega(p, despues) {
  modal(`<h2>Horario del cliente · ${esc(p.numero)} ${esc(p.cliente)}</h2><form id="f-hor"><div class="campos">
    <label class="campo">Recibe desde <input type="time" name="hora_desde" value="${hhmm(p.hora_desde)}"></label>
    <label class="campo">Recibe hasta <input type="time" name="hora_hasta" value="${hhmm(p.hora_hasta)}"></label></div>
    <div class="gris" style="font-size:12px">Vacío = sin restricción (regla fija: ningún cliente antes de las 10:00). Lo que no es hora (conserjería, llamar antes) va en la nota de entrega.</div>
    <div class="acciones"><button type="button" class="btn" onclick="cerrarModal()">Cancelar</button><button class="btn primario">Guardar</button></div></form>`);
  $('#f-hor').onsubmit = async ev => { ev.preventDefault(); const fd = new FormData(ev.target); const cambios = { hora_desde: fd.get('hora_desde') || null, hora_hasta: fd.get('hora_hasta') || null };
    const { error } = await sb.from('pedido').update(cambios).eq('id', p.id); if (error) return aviso(errorDe(error), true);
    cerrarModal(); aviso(cambios.hora_desde || cambios.hora_hasta ? `Recibe ${cambios.hora_desde || '…'} a ${cambios.hora_hasta || '…'}` : 'Sin restricción de horario'); despues(); };
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
    if (def) { n += def * c; det.push(`${c > 1 ? c + ' x ' : ''}${nombreModelo(cod)}: ${def * c}`); }
    else { seguro = false; det.push(`${nombreModelo(cod) || principal.tipo}: sin regla de bultos, confirmar`); }
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
  const medida = medidaTxt(x, 'x', ' cm');
  const partes = [`${x.tipo === 'Mesa' || x.tipo === 'Cubierta' ? 'Mesa ' : ''}${nombreModelo(cod) || ''} ${cap(nombreMaterial(mat))}`.trim()];
  const tras = [medida, x.personas ? `[${x.personas} personas]` : ''].filter(Boolean).join(' ');
  if (tras) partes.push(tras);
  let d = partes.join(' · ');
  if (x.color) d += ' / ' + cap(nombreColor(x.color)) + (x.tono && !ES_VIDRIO(mat) ? ' ' + tonoTxt(x.tono) : '');
  return d;
}
function productosGuia(p) {
  const pz = p.piezas || []; const lineas = [];
  pz.filter(x => !['Silla', 'Banca', 'Servicio'].includes(x.tipo)).forEach((x, i) => lineas.push({ desc: descProducto(x), valor: i === 0 ? pesos(p.precio_venta) : '' }));
  pz.filter(x => ['Silla', 'Banca'].includes(x.tipo)).forEach(x => lineas.push({ desc: `${x.cantidad || 1} ${x.tipo === 'Banca' ? 'banca' : 'sillas'} ${x.tipo_silla || ''} ${x.color_silla ? '/ ' + cap(nombreColor(x.color_silla)) : ''}`.replace(/\s+/g, ' ').trim(), valor: 'incluidas' }));
  if (!lineas.length) lineas.push({ desc: p.resumen || 'Pedido ' + p.numero, valor: pesos(p.precio_venta) });
  if (p.precio_despacho > 0) lineas.push({ desc: 'Despacho', valor: pesos(p.precio_despacho) });
  if (p.precio_instalacion > 0) lineas.push({ desc: 'Instalación', valor: pesos(p.precio_instalacion) });
  return lineas;
}
async function formGuia(p) {
  await cargarModelos();
  /* Alexis ve el pedido por la vista de operación, sin precios: datos_guia los trae (0074, 22-oct-2026; las guías de proyectos las emite Harold). */
  try { p = { ...p, ...(await rpc('datos_guia', { p_pedido_id: p.id }) || {}) }; } catch (e) { aviso(errorDe(e), true); return; }
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
  const esOp = yo.rol === 'operacion';
  app.innerHTML = barra(esOp ? '#/taller' : '#/lista') + `<div class="sub no-imprimir"><a class="btn" href="#/pedido/${g.pedido_id}">‹ Volver a la ficha ${esc(g.pedido ? g.pedido.numero : '')}</a><button class="btn primario" id="b-enviar-guia">Enviar guía</button><button class="btn" id="b-print">Imprimir</button>${esOp ? '' : `<span style="color:var(--gris-3)">Nombre sugerido del archivo: ${esc(archivo)} · carpeta 05_Guias_de_despacho/${new Date(g.fecha + 'T12:00:00').getFullYear()}/</span>`}</div>
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
  $('#b-enviar-guia').onclick = () => enviarGuia(g, archivo);
}

/* Enviar guía (Harold 22-oct-2026: "él se la envía por wsp a don René", Pullman Cargo). Arma el PDF de la guía con jsPDF y:
   en la tablet o el celular abre la hoja de compartir con el PDF (WhatsApp, Gmail, Bluetooth); en el Mac, o si la hoja no acepta
   archivos, descarga el PDF y abre el chat de Don René (o un correo) con el mensaje listo para adjuntarlo. Cada envío queda en el historial. */
async function logoGuiaDataUrl() { if (cache.logoGuia) return cache.logoGuia; const b = await (await fetch('logo-guia.png')).blob(); cache.logoGuia = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(b); }); return cache.logoGuia; }
async function pdfGuia(g) {
  await cargarJsPDF(); const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'letter' }); const W = 215.9, M = 16, A = W - 2 * M; let y = 12;
  const d = g.destinatario || {}; const prods = g.productos || [];
  try { doc.addImage(await logoGuiaDataUrl(), 'PNG', M - 4, y - 4, 44, 44); } catch (e) { }
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(0, 129, 166); doc.text('GUÍA DE DESPACHO', W - M, y + 12, { align: 'right' });
  doc.setFontSize(24); doc.setTextColor(26, 26, 26); doc.text('N° ' + g.numero, W - M, y + 22, { align: 'right' });
  doc.setFontSize(8.5); doc.setTextColor(150); doc.text('Fecha: ' + new Date(g.fecha + 'T12:00:00').toLocaleDateString('es-CL'), W - M, y + 28, { align: 'right' });
  y += 38; doc.setDrawColor(221); doc.setLineWidth(0.2); doc.line(M, y, W - M, y); y += 7;
  const bloque = (x, titulo, filas) => { doc.setFontSize(7); doc.setTextColor(0, 129, 166); doc.text(titulo.toUpperCase(), x, y); doc.setDrawColor(238); doc.line(x, y + 1.5, x + A / 2 - 6, y + 1.5); let yy = y + 6.5;
    filas.forEach(([k, v]) => { doc.setFontSize(8.5); doc.setTextColor(170); doc.text(k, x, yy); doc.setFontSize(10); doc.setTextColor(40); const t = doc.splitTextToSize(String(v || '-'), A / 2 - 28); doc.text(t, x + 20, yy); yy += Math.max(5, t.length * 4.4); }); return yy; };
  const y1 = bloque(M, 'Emisor', [['Empresa', EMISOR.empresa], ['RUT', EMISOR.rut], ['Dirección', EMISOR.direccion], ['Teléfono', EMISOR.telefono], ['Email', EMISOR.email]]);
  const y2 = bloque(M + A / 2 + 4, 'Destinatario', [['Nombre', d.nombre], ['Teléfono', d.telefono], ['Dirección', d.direccion], ['Comuna', d.comuna], ['Región', d.region], ['Email', d.email]]);
  y = Math.max(y1, y2) + 3;
  doc.setFillColor(242, 248, 250); doc.rect(M, y, A, 15, 'F');
  [['Modalidad', g.modalidad], ['Bultos', String(g.bultos)], ['Estado pago', g.estado_pago]].forEach(([k, v], i) => { const x = M + 5 + i * (A / 3);
    doc.setFontSize(7); doc.setTextColor(0, 129, 166); doc.text(k.toUpperCase(), x, y + 5.5); doc.setFontSize(11); doc.setTextColor(26, 26, 26); doc.text(String(v || '-'), x, y + 11.5); });
  y += 22; doc.setFontSize(7); doc.setTextColor(0, 129, 166); doc.text('PRODUCTOS', M, y); y += 3;
  const cV = 34; doc.setFillColor(230, 243, 247); doc.rect(M, y, A, 7, 'F'); doc.setFontSize(8.5); doc.setTextColor(40);
  doc.text('N°', M + 2, y + 4.8); doc.text('Descripción', M + 14, y + 4.8); doc.text('Valor', W - M - 2, y + 4.8, { align: 'right' }); y += 7;
  doc.setFontSize(9.5); doc.setDrawColor(221);
  const filas = prods.concat(Array.from({ length: Math.max(0, 10 - prods.length) }, () => ({ desc: '', valor: '' })));
  filas.forEach((l, i) => { const t = doc.splitTextToSize(String(l.desc || ''), A - 14 - cV - 4); const h = Math.max(7, t.length * 4.4 + 2.6);
    doc.setTextColor(150); doc.text(String(i + 1), M + 2, y + 4.8); doc.setTextColor(40); doc.text(t, M + 14, y + 4.8); doc.text(String(l.valor || ''), W - M - 2, y + 4.8, { align: 'right' }); y += h; doc.line(M, y, W - M, y); });
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.text('Total', M + 14, y + 6); doc.text(pesos(g.total), W - M - 2, y + 6, { align: 'right' }); doc.setFont('helvetica', 'normal');
  y = Math.max(y + 32, 236); doc.setDrawColor(120); doc.line(W / 2 - 35, y, W / 2 + 35, y); doc.setFontSize(8); doc.setTextColor(150); doc.text('Firma receptor', W / 2, y + 5, { align: 'center' });
  return doc.output('blob');
}
function textoGuia(g) {
  const d = g.destinatario || {}; const destino = [d.comuna, d.region && !/metropolitana/i.test(d.region) && d.region !== d.comuna ? d.region : ''].filter(Boolean).join(', ');
  return `Hola don René, le envío la guía de despacho N° ${g.numero} de Santino Design: ${g.bultos} bulto${g.bultos > 1 ? 's' : ''} para ${d.nombre || ''}${destino ? ', ' + destino : ''}. Gracias`;
}
async function contactoPullman() {
  const { data } = await sb.from('proveedor').select('nombre, telefono, correo, contactos').eq('nombre', 'Pullman Cargo').maybeSingle();
  const c = data && (data.contactos || [])[0] || {};
  return { telefono: String((data && data.telefono) || c.telefono || '').replace(/\D/g, ''), correo: (data && data.correo) || '' };
}
async function enviarGuia(g, archivo) {
  let blob; try { aviso('Preparando el PDF…'); blob = await pdfGuia(g); } catch (e) { aviso(errorDe(e), true); return; }
  const file = new File([blob], archivo, { type: 'application/pdf' }); const texto = textoGuia(g);
  const registrar = canal => rpc('registrar_envio_guia', { p_guia_id: g.id, p_canal: canal }).catch(() => { });
  if (esTactil() && navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'Guía N° ' + g.numero, text: texto }); registrar('compartida desde la tablet'); aviso('Guía enviada'); return; }
    catch (e) { if (e && e.name === 'AbortError') return; }
  }
  const pull = await contactoPullman();
  modal(`<h2>Enviar guía N° ${g.numero}</h2>
    <div style="font-size:13px;margin-bottom:10px">Se descarga el PDF <b>${esc(archivo)}</b> y se abre el chat o el correo con este mensaje. Adjunta el PDF descargado antes de enviar.</div>
    <div class="campo" style="background:var(--fondo-2,#f4f6f7);padding:8px;border-radius:6px;font-size:13px">${esc(texto)}</div>
    ${pull.telefono ? '' : '<div style="font-size:12px;color:var(--rojo-txt)">Falta el teléfono de Don René: agrégalo en Compras, proveedor Pullman Cargo. Mientras, WhatsApp te deja elegir el chat.</div>'}
    <div class="acciones"><button type="button" class="btn" id="eg-cancelar">Cancelar</button><button type="button" class="btn" id="eg-correo">Por correo</button><button type="button" class="btn primario" id="eg-wsp">Por WhatsApp a Don René</button></div>`);
  const descargar = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = archivo; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 10000); };
  $('#eg-cancelar').onclick = cerrarModal;
  $('#eg-wsp').onclick = async () => { descargar(); cerrarModal(); await abrirWa(`https://wa.me/${pull.telefono}?text=${encodeURIComponent(texto)}`); registrar('WhatsApp'); };
  $('#eg-correo').onclick = () => { descargar(); cerrarModal(); location.href = `mailto:${encodeURIComponent(pull.correo)}?subject=${encodeURIComponent('Guía de despacho N° ' + g.numero + ' · Santino Design')}&body=${encodeURIComponent(texto)}`; registrar('correo'); };
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

/* ---------- Compras (tanda 26, 13-oct-2026): orden de compra completa según el proceso real de Harold ----------
   Harold 13-oct: "primero le mando el texto y luego el proveedor da una fecha aproximada, no antes"; "la orden de compra primero se
   envía para que el proveedor mande su cotización, ahí recién se paga"; "la orden de compra que parta en el 2000"; "las guías serían
   del proveedor: Alexis tacha la guía del proveedor y ahí ves que se fue de vuelta y que se recibió conforme y queda en bodega".
   Flujo: marcar piezas por pedir del mismo proveedor → Crear OC-2000 (sin fecha) → mandar el texto (Copiar, WhatsApp al proveedor o
   PDF con logo que en celular y tablet abre la hoja de compartir) → el proveedor cotiza (monto y cotización adjunta) → se paga (monto,
   fecha, medio y comprobante) → llega: Recibir pieza a pieza, conforme (bodega) o devuelta al proveedor, con la guía del proveedor
   tachada adjunta → al volver, conforme de nuevo → embalado cierra la OC. Todo queda en el historial de cada pedido. */
const OC_ESTADOS = ['Enviada', 'Cotizada', 'Abonada', 'Pagada', 'Recibida', 'Con devolución', 'Cerrada'];   // Abonada (0044): pagó una parte de lo cotizado
const ocChip = e => `<span class="chip oc-estado oc-${(e || '').replace(/ /g, '_')}">${esc(e || '')}</span>`;
const puedeComprar = () => yo.rol !== 'operacion' || !!yo.ve_compras;
// Pagos y saldos con proveedores (0044): Harold siempre; Alexis solo con ve_pagos_prov (Harold 16-oct: "no por defecto")
const puedeVerPagos = () => yo.rol !== 'operacion' || (!!yo.ve_compras && !!yo.ve_pagos_prov);
// Indicaciones de la pieza (Estrella W3134: "7 cm más alta") van al final de la línea para el proveedor (paso 0, 16-oct)
const indicCompra = x => x.indicaciones ? `, ${x.indicaciones}` : '';
const descCompra = (prov, x) => descCompraBase(prov, x) + indicCompra(x);
const descCompraBase = (prov, x) => {
  const med = medidaTxt(x, ' x ', ' cm');
  if (prov && prov.formato === 'vidrio') return `${x.cantidad} ${ES_VIDRIO(x.material_cubierta) ? nombreMaterial(x.material_cubierta).replace(/^vidrio/, 'vidrio' + (x.cantidad > 1 ? 's' : '')) : 'cubierta' + (x.cantidad > 1 ? 's' : '') + ' ' + nombreMaterial(x.material_cubierta)}${x.espesor_mm ? ' ' + x.espesor_mm + ' mm' : ''}${med ? ', ' + med : ''}${x.forma === 'CIRC' ? ' (redondo)' : x.forma === 'OVAL' ? ' (ovalado)' : ''}${x.nota_acabado ? ', ' + x.nota_acabado : ''}`;
  if (prov && prov.formato === 'sillas_aliwen') return `${x.cantidad} ${x.tipo_linea === 'Silla' || x.tipo === 'Silla' ? 'Silla Santino' : (x.descripcion || 'mueble')}, pata ${({ NGR: 'negra', BL: 'blanca', NAT: 'natural' }[x.color_estructura] || x.color_estructura || 'negra')}, tapiz ${[x.tapiz, x.color_silla].filter(Boolean).join(' ') || 'por definir'}, madera lenga`;
  const nom = (x.tipo_linea || x.tipo) === 'Silla' ? `silla${x.cantidad > 1 ? 's' : ''} ${NOMBRE_SILLA[x.tipo_silla] || x.tipo_silla || ''}`.trim() : (x.descripcion || x.tipo_linea || x.tipo);
  return `${x.cantidad} ${nom}${med ? ', ' + med : ''}${x.espesor_mm && !med ? ', ' + x.espesor_mm + ' mm' : ''}${x.tapiz || x.color_silla ? ', ' + [x.tapiz, x.color_silla].filter(Boolean).join(' ') : ''}`;
};
const refPedido = x => `[${x.numero} ${nombrePila({ cliente: x.cliente })}]`;
/* ---------- Líneas de la OC (paso 3 Compras v2, 19-oct-2026, migración 0058) ----------
   Harold 19-oct: "en el mensaje de la OC debe dar el detalle de lo pedido bien ordenado como lista y valores a pagar"; "a Erick por mientras
   ponle el mensaje sin IVA y ponle el abono de 50% y el valor, que le enviamos el comprobante ahora"; "no le pongas la fecha de entrega al
   cliente"; "sí está bien el código del cliente para hacer seguimiento siempre"; "lo de pedido de la clienta no es necesario, evita info que
   no sea necesaria"; "debe ser en formato listado, lo de patas debe ser lista para que él lo vea bien, optimizado para que se vea ordenado
   en WhatsApp"; "para más de 12 sillas ahí le preguntas en la misma OC a Erick cuántos metros". Los asteriscos salen en negrita en WhatsApp. */
const COLOR_PATA = { NGR: 'negra', BL: 'blanca', NAT: 'natural' };
const colorTexto = c => c ? (NOMBRE_COLOR[String(c).toUpperCase()] || String(c).toLowerCase().replace(/\./g, ' ')) : '';
const qty = n => { const v = Number(n); return Number.isInteger(v) ? String(v) : v.toLocaleString('es-CL', { maximumFractionDigits: 2 }); };
const totalItem = it => it.precio_unitario == null ? null : Math.round(Number(it.cantidad) * it.precio_unitario * (1 + (Number(it.iva_pct) || 0) / 100));
const netoItem = it => it.precio_unitario == null ? null : Math.round(Number(it.cantidad) * it.precio_unitario);
// Una línea normalizada a partir de una pieza por pedir (fila de v_compras) más lo propuesto por la base (precio del catálogo, IVA del proveedor)
const itemDePieza = (x, pr) => ({ linea_id: x.linea_id || x.id, linea_pedido_id: x.linea_id || x.id, pedido_id: x.pedido_id, numero: x.numero, cliente: x.cliente, tipo: x.tipo_linea || x.tipo, pieza_descripcion: x.descripcion, pieza_cantidad: x.cantidad,
  cantidad: pr && pr.cantidad != null ? pr.cantidad : (x.cantidad || 1), unidad: 'un', precio_unitario: pr && pr.precio_unitario != null ? pr.precio_unitario : null, iva_pct: pr && pr.iva_pct != null ? pr.iva_pct : 19, insumo_id: pr ? pr.insumo_id : null,
  indicaciones: x.indicaciones, tipo_silla: x.tipo_silla, tapiz: x.tapiz, color_silla: x.color_silla, color_estructura: x.color_estructura, material_cubierta: x.material_cubierta, espesor_mm: x.espesor_mm, largo_cm: x.largo_cm, ancho_cm: x.ancho_cm, alto_cm: x.alto_cm, largo_ext_cm: x.largo_ext_cm, forma: x.forma, nota_acabado: x.nota_acabado, etapa: x.etapa, etapas: x.etapas_de_json || x.etapas, recibida_pieza_en: x.recibida_en, devuelta_en: x.devuelta_en, recepcion_nota: x.recepcion_nota });
const totalesItems = items => { let neto = 0, total = 0, sin = 0; items.forEach(it => { if (it.precio_unitario == null) { sin++; return; } neto += netoItem(it); total += totalItem(it); }); return { neto, iva: total - neto, total, sin, conIva: items.some(it => it.precio_unitario != null && Number(it.iva_pct) > 0) }; };
// Título de la línea: "8 sillas Santino", "9 m de Tapiz Eco Cuero Patagonia beige [TAG 26 06]", "1 vidrio templado 12 mm, 240 x 120 cm"
const tituloItem = (prov, it, sinCant = false) => {
  const n = Number(it.cantidad); const c = sinCant ? '' : qty(n) + ' ';
  if (it.descripcion) return `${c}${it.unidad && it.unidad !== 'un' ? it.unidad + ' de ' : ''}${it.descripcion}`;
  if (!it.linea_pedido_id && (it.insumo_nombre || it.insumo_id)) return `${c}${it.unidad && it.unidad !== 'un' ? it.unidad + ' de ' : ''}${it.insumo_nombre || 'insumo'}${it.color ? ' ' + colorTexto(it.color) : ''}${it.codigo_proveedor ? ' [' + it.codigo_proveedor + ']' : ''}`;
  if (it.tipo === 'Silla') return `${c}silla${n > 1 ? 's' : ''} ${NOMBRE_SILLA[it.tipo_silla] || it.tipo_silla || ''}`.trim();
  const base = descCompraBase(prov && prov.formato === 'sillas_aliwen' ? { ...prov, formato: 'generico' } : prov, { ...it, descripcion: it.pieza_descripcion, cantidad: qty(n) });
  return sinCant ? base.replace(/^\S+\s/, '') : base;
};
// Atributos en líneas aparte (lo que Erick necesita ver): pata, tapiz, madera; indicaciones; la pregunta de la tela si son más de 12 sillas
const atributosItem = (prov, it) => {
  const a = [];
  if (prov && prov.formato === 'sillas_aliwen' && it.linea_pedido_id) {
    a.push('Pata: ' + (it.color_estructura ? (COLOR_PATA[it.color_estructura] || colorTexto(it.color_estructura)) : 'por confirmar'));
    const col = it.color_silla && !/POR DEFINIR/i.test(it.color_silla) ? colorTexto(it.color_silla) : '';
    a.push('Tapiz: ' + ([it.tapiz, col].filter(Boolean).join(' ') || 'por confirmar'));
    a.push('Madera: lenga');
  } else if (it.linea_pedido_id && (it.tapiz || (it.color_silla && !/POR DEFINIR/i.test(it.color_silla)))) a.push('Tapiz: ' + [it.tapiz, colorTexto(it.color_silla)].filter(Boolean).join(' '));
  if (it.indicaciones) a.push(it.indicaciones);
  if (prov && prov.formato === 'sillas_aliwen' && it.tipo === 'Silla' && Number(it.cantidad) > 12) a.push('¿Cuántos metros de tela necesitas para estas sillas?');
  return a;
};
// Texto de la OC para WhatsApp (o correo). {OC} se reemplaza por el número real al crearla (lo hace la base).
const textoOC = (prov, items, codigo = '{OC}', fechaOC = hoyISO()) => {
  const t = totalesItems(items || []);
  const contacto = prov && prov.contacto ? String(prov.contacto).trim().split(/[\s(\/]/)[0] : '';
  const sillas = prov && prov.formato === 'sillas_aliwen';
  let s = `*Orden de compra ${codigo}*\nSantino Design · ${fecha(fechaOC, true)}\n\nHola${contacto ? ' ' + contacto : ''}, te pido${sillas ? ' estas sillas Santino' : ''}:\n\n`;
  (items || []).forEach((it, i) => {
    s += `*${i + 1}) ${tituloItem(prov, it)}*${it.numero ? ` · ${it.numero} ${nombrePila({ cliente: it.cliente })}` : ''}\n`;
    atributosItem(prov, it).forEach(x => { s += `- ${x}\n`; });
    if (it.precio_unitario != null) s += `${qty(it.cantidad)} × ${pesos(it.precio_unitario)} = ${pesos(netoItem(it))}${Number(it.iva_pct) > 0 ? ' neto' : ''}\n`;
    s += '\n';
  });
  if (items && items.length && t.sin === 0) {
    s += t.conIva ? `Neto: ${pesos(t.neto)}\nIVA 19%: ${pesos(t.iva)}\n*Total: ${pesos(t.total)}*\n` : `*Total: ${pesos(t.total)}*\n`;
    if (prov && prov.pct_anticipo) { const ab = Math.round(t.total * prov.pct_anticipo / 100); s += `*Abono ${prov.pct_anticipo}%: ${pesos(ab)}* (te enviamos el comprobante ahora)\nSaldo: ${pesos(t.total - ab)}\n`; }
    s += '\n';
  }
  s += `Favor confirmar fecha de ${prov && /despach/i.test(prov.despacho || '') ? 'despacho' : 'entrega'} citando la ${codigo}.` + (prov && prov.formato === 'vidrio' ? '\nRetiro en taller Lo Blanco 1919, La Pintana.' : '') + ' Gracias.';
  return s;
};
const pieTextoOC = (prov, codigo) => textoOC(prov, [], codigo).split('\n\n').pop();
const waProveedor = (prov, texto) => `https://wa.me/${prov && prov.telefono ? String(prov.telefono).replace(/\D/g, '') : ''}?text=${encodeURIComponent(texto)}`;
async function cargarProveedores() { if (!cache.proveedores) { const { data } = await sb.from('proveedor').select('*').eq('activo', true).order('nombre'); cache.proveedores = data || []; } return cache.proveedores; }
const provDe = oc => (cache.proveedores || []).find(p => p.id === oc.proveedor_id) || { id: oc.proveedor_id, nombre: oc.proveedor, telefono: oc.proveedor_telefono, formato: oc.proveedor_formato, contacto: oc.proveedor_contacto, iva_pct: oc.proveedor_iva_pct, pct_anticipo: oc.proveedor_pct_anticipo, despacho: oc.proveedor_despacho };
async function cargarInsumos(todos = false) { if (!cache.insumos) { try { cache.insumos = (await rpc('insumos_json', { p_todos: !!todos })) || []; } catch (e) { cache.insumos = []; } } return cache.insumos; }

async function vCompras() {
  await cargarModelos(); await cargarProveedores();
  const verCerradas = !!cache.ocCerradas;
  const [{ data: piezas, error }, ocs] = await Promise.all([sb.from('v_compras').select('*').order('fecha_entrega', { ascending: true, nullsFirst: false }), rpc('ordenes_compra_json', { p_todas: verCerradas })]);
  if (error) throw error;
  cache.compras = piezas || []; cache.ocs = ocs || [];
  const sinOC = cache.compras.filter(x => !x.orden_compra_id);
  const grupos = {}; sinOC.forEach(x => { const k = x.proveedor || x.proveedor_sugerido || 'Sin proveedor definido'; (grupos[k] = grupos[k] || []).push(x); });
  const fila = x => `<tr class="${x.atrasado_prov ? 'atrasado' : ''}"><td><input type="checkbox" data-sel="${x.linea_id}" ${/^Por pedir/.test(x.etapa || '') ? '' : 'disabled'}></td><td class="num"><a href="#/pedido/${x.pedido_id}">${esc(x.numero)}</a>${x.urgente ? ' <span class="chip urgente">URGENTE</span>' : ''}</td><td>${esc(x.cliente)}</td><td>${esc(x.tipo_linea)}${x.cantidad > 1 ? ' ×' + x.cantidad : ''}</td><td>${esc(x.descripcion || '')}${x.tapiz || x.color_silla ? ' · ' + esc([x.tapiz, x.color_silla].filter(Boolean).join(' ')) : ''}</td><td class="nw">${x.largo_cm ? `${num(x.largo_cm)} x ${num(x.ancho_cm)}${x.espesor_mm ? ' · ' + x.espesor_mm + ' mm' : ''}` : ''}</td><td class="nw">${fecha(x.fecha_entrega)}</td><td class="nw">${etapaChip({ id: x.linea_id, tipo: x.tipo_linea, etapa: x.etapa, etapas: x.etapas_de_json, area: 'Vidrio/compras', cantidad: x.cantidad, descripcion: x.descripcion }, x.pedido_id)}</td></tr>`;
  const filaOC = oc => `<tr class="fila-oc ${oc.atrasada ? 'atrasado' : ''}" data-oc="${oc.id}" title="Abrir la orden de compra">
    <td class="num"><b>${esc(oc.codigo)}</b></td><td>${esc(oc.proveedor)}</td><td class="nw">${fecha(oc.fecha)}</td><td>${ocChip(oc.estado)}</td>
    <td>${oc.piezas.map(x => `<div class="l2">${esc(x.numero)} ${esc(nombrePila({ cliente: x.cliente }))} · ${esc(x.tipo)}${x.cantidad > 1 ? ' ×' + x.cantidad : ''} · <span class="${x.etapa === 'Devuelta al proveedor' ? 'rojo' : ''}">${esc(x.etapa)}</span></div>`).join('')}${(oc.items || []).filter(it => !it.linea_pedido_id).map(it => `<div class="l2">${it.numero ? esc(it.numero) + ' ' + esc(nombrePila({ cliente: it.cliente })) + ' · ' : ''}${esc(tituloItem(provDe(oc), it))}${it.recibida_en ? ' · recibida' : ''}</div>`).join('')}</td>
    <td class="nw ${oc.atrasada ? 'rojo' : ''}">${oc.fecha_prometida ? fecha(oc.fecha_prometida, true) : '<span class="gris">sin fecha aún</span>'}${oc.referencia_prov ? `<div class="l2">${esc(oc.referencia_prov)}</div>` : ''}</td>
    ${puedeComprar() ? `<td class="nw mono">${oc.monto_cotizado != null ? pesos(oc.monto_cotizado) : '<span class="gris">-</span>'}</td>` : ''}${puedeVerPagos() ? `<td class="nw mono">${oc.monto_pagado != null ? pesos(oc.monto_pagado) + `<div class="l2">${fecha(oc.fecha_pago)}${oc.medio_pago ? ' · ' + esc(oc.medio_pago) : ''}</div>` : '<span class="gris">-</span>'}</td><td class="nw mono">${saldoOC(oc)}</td>` : ''}
    <td class="nw">${oc.documentos.length ? oc.documentos.map(d => `<span class="chip" title="${esc(d.nombre)}">${esc(abrevDoc(d.tipo))}</span>`).join(' ') : '<span class="gris">-</span>'}</td>
  </tr>`;
  app.innerHTML = barra('#/compras') + `<div class="sub no-imprimir"><a href="#/compras/solicitudes" class="btn chico primario" title="Lo que hay que ir a comprar al mesón (herrajes, planchas, LED…), con el total por insumo">Por comprar</a><a href="#/compras/proveedores" class="btn chico" title="Ficha, historial, pagos y saldo de cada proveedor">Proveedores</a><a href="#/compras/insumos" class="btn chico" title="Catálogo de lo que se compra sin pasar por una pieza (tela, film, madera) y precios de referencia">Insumos</a>${puedeComprar() ? '<button class="btn chico" id="c-insumos" title="Orden de compra de tela, film, madera u otro insumo que no es una pieza de un pedido">+ Compra de insumos</button>' : ''}<span>Arriba, las órdenes de compra; abajo, las piezas por pedir agrupadas por proveedor: marca las de un mismo proveedor (solo se marcan las que están Por pedir) y crea la orden con cantidades y precios. Lo pedido antes del 13-oct sigue como Pedido, sin OC.</span><span style="margin-left:auto;color:var(--gris-3)">${cache.ocs.length} OC · ${sinOC.length} piezas sin OC</span></div><div class="contenido" style="display:flex;flex-direction:column;gap:14px">
    <section class="seccion"><div class="cab"><h2>Órdenes de compra</h2><label style="font-size:12px;display:flex;gap:6px;align-items:center"><input type="checkbox" id="c-cerradas" ${verCerradas ? 'checked' : ''}> ver también las cerradas</label></div>
      ${cache.ocs.length ? `<div class="tabla-env"><table class="lista oc-tabla"><thead><tr><th>OC</th><th>Proveedor</th><th>Enviada</th><th>Estado</th><th>Piezas</th><th>Llega</th>${puedeComprar() ? '<th>Cotizó</th>' : ''}${puedeVerPagos() ? '<th>Pagado</th><th>Saldo</th>' : ''}<th>Docs</th></tr></thead><tbody>${cache.ocs.map(filaOC).join('')}</tbody></table></div>` : '<div class="gris">No hay órdenes de compra abiertas.</div>'}
    </section>
    ${Object.keys(grupos).sort().map(k => { const prov = cache.proveedores.find(p => p.nombre === k); return `<section class="seccion"><div class="cab"><h2>${esc(k)}${prov && prov.que_vende ? ` <span style="font-weight:400;color:var(--gris-2);font-size:13px">· ${esc(prov.que_vende)}</span>` : ''}</h2>${puedeComprar() ? `<button class="btn chico primario" data-armar="${esc(k)}">Crear orden de compra con las marcadas</button>` : ''}</div>
      <div class="tabla-env"><table class="lista"><thead><tr><th></th><th>N°</th><th>Cliente</th><th>Pieza</th><th>Descripción</th><th>Medida</th><th>Entrega al cliente</th><th title="Toca para avanzar; mantener para volver">Etapa</th></tr></thead><tbody>${grupos[k].map(fila).join('')}</tbody></table></div></section>`; }).join('') || '<div class="seccion">No hay piezas por comprar sin orden de compra.</div>'}
  </div>`;
  $('#c-cerradas').onchange = ev => { cache.ocCerradas = ev.target.checked; vCompras(); };
  const bi = $('#c-insumos'); if (bi) bi.onclick = () => formCrearOC([], null);
  activarEtapas(app, () => vCompras());
  $$('tr.fila-oc').forEach(tr => tr.onclick = () => modalOC(Number(tr.dataset.oc)));
  $$('[data-armar]').forEach(b => b.onclick = () => {
    const sec = b.closest('section'); const ids = $$('input[data-sel]:checked', sec).map(i => Number(i.dataset.sel));
    if (!ids.length) return aviso('Marca al menos una pieza (las que están Por pedir)', true);
    formCrearOC(cache.compras.filter(x => ids.includes(x.linea_id)), cache.proveedores.find(p => p.nombre === b.dataset.armar));
  });
  const q = location.hash.split('?')[1]; const m = q && q.match(/oc=(\d+)/); if (m) { history.replaceState(null, '', '#/compras'); modalOC(Number(m[1])); }
}
const abrevDoc = t => ({ 'Cotización proveedor': 'COT', 'Comprobante proveedor': 'PAGO', 'Guía proveedor': 'GUÍA', 'Orden de compra': 'OC', 'Cotización': 'COT', 'Comprobante': 'PAGO' }[t] || (t || '').slice(0, 4).toUpperCase());

/* Crear la OC: proveedor, líneas con cantidad, precio e IVA (propuestas desde el catálogo de insumos), insumos sueltos y el texto que se manda
   (paso 3, 19-oct-2026). Sin piezas (botón "+ Compra de insumos") es una OC solo de insumos: tela, film, madera. */
async function formCrearOC(piezas, prov0) {
  const provs = cache.proveedores; const insumos = await cargarInsumos();
  // Las piezas se releen de la base al abrir (Harold 19-oct: corrigió la pata de Liliana y la pantalla seguía mostrando "por confirmar")
  if (piezas.length) { try { const { data } = await sb.from('v_compras').select('*').in('linea_id', piezas.map(x => x.linea_id)); if (data && data.length) { piezas = piezas.map(x => data.find(d => d.linea_id === x.linea_id) || x); piezas.forEach(x => { const cx = (cache.compras || []).find(c => c.linea_id === x.linea_id); if (cx) Object.assign(cx, x); }); } } catch (e) { } }
  // Número real de la próxima OC (migración 0060: max + 1, sin saltos); si no se pudo leer, queda {OC} y la base lo reemplaza
  let codigoPrev = '{OC}'; try { codigoPrev = (await rpc('proximo_oc', {})) || '{OC}'; } catch (e) { }
  let prov = prov0 || provs[0]; let items = [], extras = [], nota = '';
  const ids = piezas.map(x => x.linea_id);
  const pedidosOpc = () => { const m = {}; (cache.compras || []).concat(piezas).forEach(x => { m[x.pedido_id] = [x.numero, x.cliente]; }); return Object.entries(m).map(([id, [numero, cliente]]) => ({ id: Number(id), numero, cliente })).sort((a, b) => String(a.numero).localeCompare(String(b.numero))); };
  const proponer = async () => { let prop = []; if (ids.length) { try { prop = (await rpc('oc_items_propuestos', { p_linea_ids: ids, p_proveedor_id: prov.id })) || []; } catch (e) { prop = []; } } items = piezas.map(x => itemDePieza(x, prop.find(p => p.linea_id === x.linea_id) || { iva_pct: prov.iva_pct != null ? prov.iva_pct : 19 })); };
  await proponer();
  const extraCompleto = e => { const ins = insumos.find(i => i.id === Number(e.insumo_id)) || {}; const pd = pedidosOpc().find(p => p.id === Number(e.pedido_id)); return { ...e, insumo_nombre: ins.nombre, codigo_proveedor: ins.codigo_proveedor, unidad: e.unidad || ins.unidad || 'un', numero: pd ? pd.numero : null, cliente: pd ? pd.cliente : null }; };
  const todos = () => items.concat(extras.map(extraCompleto));
  const filaPieza = (it, i) => `<tr><td class="num">${i + 1}</td><td>${esc(tituloItem(prov, it))}${yo.rol === 'admin' ? ` <button type="button" class="btn chico" data-pieza="${it.linea_id}" title="Corregir pata, tapiz, color e indicaciones de la pieza sin ir al pedido">✎ pieza</button>` : ''}<div class="l2">${esc(it.numero)} ${esc(nombrePila({ cliente: it.cliente }))}${atributosItem(prov, it).length ? ' · ' + esc(atributosItem(prov, it).join(' · ')) : ''}</div></td>
    <td><input type="number" min="0.01" step="0.01" data-it="${i}" data-k="cantidad" value="${it.cantidad}" style="width:72px"></td>
    <td><input type="number" min="0" step="1" data-it="${i}" data-k="precio_unitario" value="${it.precio_unitario != null ? it.precio_unitario : ''}" placeholder="sin precio" style="width:104px"></td>
    <td><select data-it="${i}" data-k="iva_pct"><option value="0" ${!Number(it.iva_pct) ? 'selected' : ''}>sin IVA</option><option value="19" ${Number(it.iva_pct) === 19 ? 'selected' : ''}>+19%</option></select></td>
    <td class="nw mono">${it.precio_unitario != null ? pesos(totalItem(it)) : '<span class="gris">-</span>'}</td><td></td></tr>`;
  const filaExtra = (e, j) => `<tr><td class="num">${items.length + j + 1}</td><td><select data-ex="${j}" data-k="insumo_id" style="max-width:100%"><option value="">(texto libre)</option>${insumos.map(i => `<option value="${i.id}" ${Number(e.insumo_id) === i.id ? 'selected' : ''}>${esc(i.nombre)}${i.codigo_proveedor ? ' [' + esc(i.codigo_proveedor) + ']' : ''} · ${esc(i.unidad)}${i.precio_neto_ref ? ' · ' + pesos(i.precio_neto_ref) : ''}${i.proveedor ? ' · ' + esc(i.proveedor) : ''}</option>`).join('')}</select>
      <input data-ex="${j}" data-k="descripcion" value="${esc(e.descripcion || '')}" placeholder="descripción (texto libre, o para precisar el insumo)" style="width:100%;margin-top:4px">
      <div style="display:flex;gap:6px;margin-top:4px;flex-wrap:wrap"><input data-ex="${j}" data-k="color" value="${esc(e.color || '')}" placeholder="color (BEIGE)" style="width:110px"><select data-ex="${j}" data-k="pedido_id" title="A qué pedido cae el costo"><option value="">sin pedido</option>${pedidosOpc().map(p => `<option value="${p.id}" ${Number(e.pedido_id) === p.id ? 'selected' : ''}>${esc(p.numero)} ${esc(nombrePila({ cliente: p.cliente }))}</option>`).join('')}</select><input data-ex="${j}" data-k="indicaciones" value="${esc(e.indicaciones || '')}" placeholder="indicaciones" style="flex:1;min-width:120px"></div></td>
    <td><input type="number" min="0.01" step="0.01" data-ex="${j}" data-k="cantidad" value="${e.cantidad}" style="width:72px"><div class="l2">${esc(extraCompleto(e).unidad)}</div></td>
    <td><input type="number" min="0" step="1" data-ex="${j}" data-k="precio_unitario" value="${e.precio_unitario != null ? e.precio_unitario : ''}" placeholder="sin precio" style="width:104px"></td>
    <td><select data-ex="${j}" data-k="iva_pct"><option value="0" ${!Number(e.iva_pct) ? 'selected' : ''}>sin IVA</option><option value="19" ${Number(e.iva_pct) === 19 ? 'selected' : ''}>+19%</option></select></td>
    <td class="nw mono">${e.precio_unitario != null ? pesos(totalItem(e)) : '<span class="gris">-</span>'}</td><td><button type="button" class="btn chico" data-quitar="${j}" title="Quitar esta línea">×</button></td></tr>`;
  const render = () => {
    const lista = todos(); const t = totalesItems(lista);
    modal(`<h2>Nueva orden de compra${piezas.length ? ` · ${piezas.length} pieza${piezas.length > 1 ? 's' : ''}` : ' · insumos'}</h2>
      <div class="gris" style="font-size:12px">Se crea con el número correlativo siguiente (desde OC-2000) y sin fecha: la fecha la da el proveedor cuando responda. Las líneas traen el precio de referencia del catálogo de insumos; corrígelo si el proveedor cobra otro. El texto se rearma con cada cambio: edítalo al final si hace falta.</div>
      <label class="campo">Proveedor <select id="c-prov">${provs.map(p => `<option value="${p.id}" ${p.id === prov.id ? 'selected' : ''}>${esc(p.nombre)}${p.iva_pct ? '' : ' (sin IVA)'}${p.pct_anticipo ? ' · abono ' + p.pct_anticipo + '%' : ''}</option>`).join('')}</select></label>
      <div class="tabla-env"><table class="d-tabla oc-lineas"><thead><tr><th>N°</th><th>Línea</th><th>Cant.</th><th>Precio unit.</th><th>IVA</th><th>Total</th><th></th></tr></thead><tbody>${items.map(filaPieza).join('')}${extras.map(filaExtra).join('')}</tbody></table></div>
      <div class="acciones" style="justify-content:space-between;align-items:center"><button type="button" class="btn chico" id="c-mas">+ Insumo o línea libre</button><div class="mono" style="font-size:13px">${t.sin ? `<span class="gris">${t.sin} línea${t.sin > 1 ? 's' : ''} sin precio</span> · ` : ''}${t.conIva ? `neto ${pesos(t.neto)} · IVA ${pesos(t.iva)} · ` : ''}<b>Total ${pesos(t.total)}</b>${prov.pct_anticipo && !t.sin && lista.length ? ` · abono ${prov.pct_anticipo}% ${pesos(Math.round(t.total * prov.pct_anticipo / 100))}` : ''}</div></div>
      <label class="campo">Texto para el proveedor${codigoPrev !== '{OC}' ? ` (será la ${esc(codigoPrev)})` : ' ({OC} será el número real)'} <textarea id="c-texto" class="oc-texto" style="min-height:260px">${esc(textoOC(prov, lista, codigoPrev))}</textarea></label>
      <div class="acciones" style="justify-content:flex-start;margin-top:-6px"><button type="button" class="btn chico" id="c-copiar" title="Copia el texto tal como está en el cuadro">Copiar texto</button></div>
      <label class="campo">Nota interna (opcional) <input id="c-nota" value="${esc(nota)}" placeholder="ej. pedir con urgencia, retiro el viernes"></label>
      <div class="acciones"><button type="button" class="btn" id="c-cancelar">Cancelar</button><button type="button" class="btn primario" id="c-ok">Crear orden de compra</button></div>`, 'ancha');
    $('#modal').onclick = null;   // un clic fuera de la ventana no la cierra: se perdería lo editado (Harold 19-oct: "al volver atrás se salió")
    const guardarNota = () => { nota = $('#c-nota').value; };
    $('#c-cancelar').onclick = () => { if (extras.length || items.some(it => it.precio_unitario != null)) { if (!confirm('¿Cerrar sin crear la orden de compra? Se pierde lo editado aquí (las correcciones de piezas ya quedaron guardadas en el pedido).')) return; } cerrarModal(); };
    $('#c-copiar').onclick = async () => { try { await navigator.clipboard.writeText($('#c-texto').value); aviso(codigoPrev !== '{OC}' ? `Texto copiado con el número ${codigoPrev}: recuerda crear la orden para que quede registrada` : 'Texto copiado ({OC}: el número real sale al crear la orden)'); } catch (e) { aviso('No se pudo copiar: selecciona el texto y cópialo', true); } };
    // Harold 19-oct: "ahí mismo yo podría editar el tapiz y las patas de Liliana; de cualquier lado se puede editar para no ir a otro lado y volver"
    $$('[data-pieza]', $('#modal')).forEach(b => b.onclick = () => { guardarNota(); const x = piezas.find(p => p.linea_id === Number(b.dataset.pieza)); formPiezaCompra(x, async nuevo => { Object.assign(x, nuevo); const cx = (cache.compras || []).find(c => c.linea_id === x.linea_id); if (cx) Object.assign(cx, nuevo); await proponer(); render(); }, render); });
    $('#c-prov').onchange = async () => { guardarNota(); prov = provs.find(p => p.id === Number($('#c-prov').value)); await proponer(); extras.forEach(e => { e.iva_pct = prov.iva_pct != null ? prov.iva_pct : 19; }); render(); };
    $$('[data-it]', $('#modal')).forEach(el => el.onchange = () => { guardarNota(); const it = items[Number(el.dataset.it)]; it[el.dataset.k] = el.value === '' ? null : Number(el.value); render(); });
    $$('[data-ex]', $('#modal')).forEach(el => el.onchange = () => { guardarNota(); const e = extras[Number(el.dataset.ex)]; const k = el.dataset.k;
      if (k === 'insumo_id') { e.insumo_id = el.value || null; const ins = insumos.find(i => i.id === Number(el.value)); if (ins) { e.unidad = ins.unidad; if (e.precio_unitario == null || e.precioAuto) { e.precio_unitario = ins.precio_neto_ref; e.precioAuto = true; } } }
      else if (['cantidad', 'precio_unitario', 'iva_pct', 'pedido_id'].includes(k)) { e[k] = el.value === '' ? null : Number(el.value); if (k === 'precio_unitario') e.precioAuto = false; }
      else e[k] = el.value; render(); });
    $$('[data-quitar]', $('#modal')).forEach(b => b.onclick = () => { guardarNota(); extras.splice(Number(b.dataset.quitar), 1); render(); });
    $('#c-mas').onclick = () => { guardarNota(); extras.push({ insumo_id: null, descripcion: '', cantidad: 1, unidad: 'un', precio_unitario: null, iva_pct: prov.iva_pct != null ? prov.iva_pct : 19, color: '', pedido_id: null, indicaciones: '' }); render(); };
    $('#c-ok').onclick = async () => {
      const p_items = items.map(it => ({ linea_id: it.linea_id, cantidad: it.cantidad, precio_unitario: it.precio_unitario, iva_pct: it.iva_pct, insumo_id: it.insumo_id }))
        .concat(extras.map(e => ({ insumo_id: e.insumo_id || null, descripcion: e.descripcion || null, cantidad: e.cantidad, unidad: extraCompleto(e).unidad, precio_unitario: e.precio_unitario, iva_pct: e.iva_pct, color: e.color || null, pedido_id: e.pedido_id || null, indicaciones: e.indicaciones || null })));
      if (!p_items.length) return aviso('Agrega al menos una línea', true);
      if (extras.some(e => !e.insumo_id && !(e.descripcion || '').trim())) return aviso('Cada línea libre necesita un insumo del catálogo o una descripción', true);
      const texto = codigoPrev !== '{OC}' ? $('#c-texto').value.split(codigoPrev).join('{OC}') : $('#c-texto').value;   // la base pone el número definitivo
      try { const oc = await rpc('crear_orden_compra', { p_linea_ids: ids, p_proveedor_id: prov.id, p_texto: texto, p_nota: $('#c-nota').value || null, p_items }); cerrarModal(); const n = (oc.items || []).length; aviso(`${oc.codigo} creada con ${n} línea${n > 1 ? 's' : ''}: ahora mándala al proveedor`); await vCompras(); modalOC(oc.id, oc); } catch (e) { aviso(errorDe(e), true); } };
  };
  render();
}

/* La orden de compra: todo lo que se hace con ella en una sola ventana (Harold: una acción se hace desde donde uno está).
   Desde el paso 3 (19-oct) muestra sus LÍNEAS con cantidad, precio e IVA; el total sale de las líneas salvo que se registre lo que cotizó el proveedor. */
async function modalOC(id, ocDado) {
  await cargarProveedores();
  const oc = ocDado || await rpc('orden_compra_json', { p_id: id }); if (!oc) return aviso('No se pudo abrir la orden de compra', true);
  const prov = provDe(oc); const pc = puedeComprar(); const esOp = yo.rol === 'operacion'; const editable = pc && oc.estado !== 'Cerrada';
  const items = oc.items || (oc.piezas || []).map(x => itemDePieza(x, null)); const t = totalesItems(items);
  const recibibles = (oc.piezas || []).filter(x => /^(Pedid|Recibid|Devuelta)/.test(x.etapa || ''));
  const filaIt = it => `<tr><td>${it.linea_pedido_id ? etapaChip({ id: it.linea_pedido_id, tipo: it.tipo, etapa: it.etapa, etapas: it.etapas, area: 'Vidrio/compras', cantidad: it.pieza_cantidad, descripcion: it.pieza_descripcion }, it.pedido_id) : '<span class="chip">insumo</span>'}</td>
    <td>${it.numero ? `<a href="#/pedido/${it.pedido_id}" onclick="cerrarModal()">${esc(it.numero)}</a> ${esc(nombrePila({ cliente: it.cliente }))}` : '<span class="gris">-</span>'}</td>
    <td>${esc(tituloItem(prov, it))}${atributosItem(prov, it).length ? `<div class="l2">${esc(atributosItem(prov, it).join(' · '))}</div>` : ''}</td>
    <td class="nw">${qty(it.cantidad)}${it.unidad && it.unidad !== 'un' ? ' ' + esc(it.unidad) : ''}</td>
    ${pc ? `<td class="nw mono">${it.precio_unitario != null ? pesos(it.precio_unitario) + (Number(it.iva_pct) ? `<div class="l2">+${it.iva_pct}% IVA</div>` : '') : '<span class="gris">sin precio</span>'}</td><td class="nw mono">${it.precio_unitario != null ? pesos(totalItem(it)) : '<span class="gris">-</span>'}</td>` : ''}
    <td class="nw">${it.linea_pedido_id ? (it.etapa === 'Devuelta al proveedor' ? `<span class="rojo">devuelta ${fecha(it.devuelta_en)}</span>` : it.recibida_pieza_en ? `recibida ${fecha(it.recibida_pieza_en)}` : '') + (it.recepcion_nota ? `<div class="l2">${esc(it.recepcion_nota)}</div>` : '') : it.recibida_en ? `recibida ${fecha(it.recibida_en)}` : ''}</td>
    ${editable ? `<td class="nw"><button type="button" class="btn chico" data-edit-it="${it.id}" title="Cantidad, precio, IVA, indicaciones">✎</button>${!it.linea_pedido_id ? ` <button type="button" class="btn chico" data-del-it="${it.id}" title="Borrar esta línea">×</button>` : ''}</td>` : ''}</tr>`;
  const doc = d => `<div class="doc"><span>${esc(d.nombre)}<div class="tipo">${esc(d.tipo)} · ${esc(d.subido_por)} · ${fecha(d.subido_en)}</div></span><span>${d.storage_path ? `<button class="btn chico" data-ver="${esc(d.storage_path)}">Ver</button>` : d.url ? `<a class="btn chico" href="${esc(d.url)}" target="_blank">Abrir</a>` : ''}</span></div>`;
  const totalLineas = oc.total != null && !oc.lineas_sin_precio ? oc.total : (t.sin === 0 && items.length ? t.total : null);
  modal(`<div class="cab"><h2>${esc(oc.codigo)} · <a href="#/compras/proveedor/${oc.proveedor_id}" onclick="cerrarModal()" title="Ficha del proveedor: historial, pagos y saldo">${esc(oc.proveedor)}</a> ${ocChip(oc.estado)}${oc.atrasada ? ' <span class="chip atrasado">ATRASADA</span>' : ''}</h2><button type="button" class="btn chico" id="oc-x">Cerrar ventana</button></div>
    <div class="gris" style="font-size:12px">Enviada el ${fecha(oc.fecha, true)} por ${esc(oc.creado_por)}${prov.contacto ? ' · ' + esc(prov.contacto) : ''}${prov.telefono ? ' · ' + esc(prov.telefono) : ''}${oc.nota ? ' · nota: ' + esc(oc.nota) : ''}</div>
    <div class="campos" style="align-items:end">
      <label class="campo">Fecha prometida por el proveedor <input type="date" id="oc-fecha" value="${oc.fecha_prometida || ''}" ${pc ? '' : 'disabled'}></label>
      <label class="campo">Referencia del proveedor (cotización, pedido, guía) <input id="oc-ref" value="${esc(oc.referencia_prov || '')}" ${pc ? '' : 'disabled'}></label>
      ${pc ? '<button type="button" class="btn chico" id="oc-guardar" style="margin-bottom:2px">Guardar</button>' : ''}
    </div>
    <table class="d-tabla"><thead><tr><th>Etapa</th><th>Pedido</th><th>Línea</th><th>Cant.</th>${pc ? '<th>Precio unit.</th><th>Total</th>' : ''}<th>Recepción</th>${editable ? '<th></th>' : ''}</tr></thead><tbody>${items.map(filaIt).join('')}</tbody>
      ${pc && items.length ? `<tfoot><tr><td colspan="4" style="text-align:right">${t.sin ? `<span class="gris">${t.sin} línea${t.sin > 1 ? 's' : ''} sin precio</span>` : t.conIva ? `neto ${pesos(t.neto)} · IVA ${pesos(t.iva)} · <b>Total</b>` : '<b>Total</b>'}</td><td></td><td class="nw mono"><b>${t.sin ? '-' : pesos(t.total)}</b></td><td colspan="2"></td></tr></tfoot>` : ''}</table>
    ${editable ? `<div class="acciones" style="justify-content:flex-start;margin-top:4px"><button type="button" class="btn chico" id="oc-mas">+ Línea (insumo o texto libre)</button></div>` : ''}
    ${pc || puedeVerPagos() ? `<div class="oc-dinero">${pc ? `<div><b>Cotización del proveedor:</b> ${oc.monto_origen === 'proveedor' && oc.monto_cotizado != null ? pesos(oc.monto_cotizado) + (totalLineas != null && oc.monto_cotizado !== totalLineas ? ` <span class="rojo" title="difiere del total de las líneas">≠ líneas ${pesos(totalLineas)}</span>` : '') : (totalLineas != null ? `<span class="gris">se usa el total de las líneas, ${pesos(totalLineas)}</span>` : '<span class="gris">aún no cotiza y faltan precios en las líneas</span>')} <button type="button" class="btn chico" id="oc-cot">${oc.monto_origen === 'proveedor' ? 'Corregir' : 'Registrar lo que cotizó'}</button></div>` : ''}
      ${puedeVerPagos() ? `<div><b>Pagos:</b> ${(oc.pagos || []).length ? (oc.pagos || []).map(g => `<span class="chip pago" title="${esc([g.tipo, g.medio_pago, cuentaNombre(g.cuenta_origen) !== '-' ? cuentaNombre(g.cuenta_origen) : '', g.referencia, g.registrado_por].filter(Boolean).join(' · '))}">${pesos(g.monto_aplicado)} · ${fecha(g.fecha)}${g.comprobante_path ? ` <button type="button" class="btn chico" data-ver="${esc(g.comprobante_path)}">ver</button>` : g.comprobante_url ? ` <a href="${esc(g.comprobante_url)}" target="_blank">ver</a>` : ''}</span>`).join(' ') + ` = <b>${pesos(oc.monto_pagado || 0)}</b>` : '<span class="gris">sin pagar</span>'}${oc.saldo != null ? ` · saldo ${saldoOC(oc)}` : ''}${prov.pct_anticipo && oc.monto_cotizado && !(oc.pagos || []).length ? ` · <span class="gris">abono ${prov.pct_anticipo}% = ${pesos(Math.round(oc.monto_cotizado * prov.pct_anticipo / 100))}</span>` : ''} <button type="button" class="btn chico" id="oc-pago">Registrar pago</button></div>` : ''}</div>` : ''}
    <div><div class="cab"><h2 style="font-size:14px">Documentos (${oc.documentos.length})</h2>${pc || esOp ? '<button type="button" class="btn chico" id="oc-adj">Adjuntar</button>' : ''}</div><div class="docs">${oc.documentos.map(doc).join('') || '<div class="gris" style="font-size:12px">Nada adjunto aún: cotización del proveedor, comprobante de pago, guía del proveedor tachada.</div>'}</div></div>
    <details open><summary style="cursor:pointer;font-weight:600">Texto para el proveedor</summary><textarea id="oc-texto" class="oc-texto" style="min-height:240px" ${pc ? '' : 'readonly'}>${esc(oc.texto_enviado || textoOC(prov, items, oc.codigo, oc.fecha))}</textarea>
      <div class="acciones" style="justify-content:flex-start"><button type="button" class="btn" id="oc-copiar">Copiar</button><button type="button" class="btn" id="oc-wa">WhatsApp${prov.telefono ? '' : ' (elige el chat)'}</button><button type="button" class="btn" id="oc-pdf">PDF${navigator.canShare ? ' · compartir' : ''}</button>${pc ? '<button type="button" class="btn chico" id="oc-rearmar" title="Vuelve a armar el texto desde las líneas (cantidades, precios, abono)">Rearmar desde las líneas</button>' : ''}</div></details>
    <div class="acciones">
      ${recibibles.length ? `<button type="button" class="btn primario" id="oc-recibir">Recibir / devolver piezas</button>` : ''}
      ${pc && oc.estado !== 'Cerrada' ? `<button type="button" class="btn" id="oc-cerrar" title="Cerrarla a mano (se cierra sola cuando todas las piezas quedan embaladas)">Cerrar OC</button>` : ''}
      ${pc && oc.estado === 'Cerrada' ? `<button type="button" class="btn" id="oc-reabrir">Reabrir</button>` : ''}
    </div>`, 'ancha');
  const refrescar = async () => { if (typeof render === 'function') await render(); modalOC(oc.id); };
  const on = (sel, fn) => { const el = $(sel); if (el) el.onclick = fn; };
  on('#oc-x', cerrarModal);
  activarEtapas($('#modal'), () => refrescar());
  $$('[data-ver]', $('#modal')).forEach(b => b.onclick = async () => { const { data, error } = await sb.storage.from('documentos').createSignedUrl(b.dataset.ver, 3600); if (error) return aviso(errorDe(error), true); window.open(data.signedUrl, '_blank'); });
  $$('[data-edit-it]', $('#modal')).forEach(b => b.onclick = () => formEditarItem(items.find(it => it.id === Number(b.dataset.editIt)), oc, refrescar));
  $$('[data-del-it]', $('#modal')).forEach(b => b.onclick = async () => { if (!confirm('¿Borrar esta línea de la OC?')) return; try { await rpc('borrar_oc_item', { p_item_id: Number(b.dataset.delIt) }); aviso('Línea borrada'); refrescar(); } catch (e) { aviso(errorDe(e), true); } });
  on('#oc-mas', () => formAgregarItem(oc, refrescar));
  // Guardar queda como "Guardado ✓" y deshabilitado mientras lo escrito sea igual a lo guardado (Harold 13-oct: "si ya está guardada debe quedar marcado sin poder guardar de nuevo")
  const estadoGuardar = () => { const b = $('#oc-guardar'); if (!b) return; const igual = ($('#oc-fecha').value || '') === (oc.fecha_prometida || '') && ($('#oc-ref').value.trim() || '') === (oc.referencia_prov || ''); b.disabled = igual; b.textContent = igual ? 'Guardado ✓' : 'Guardar'; b.classList.toggle('primario', !igual); };
  estadoGuardar(); ['#oc-fecha', '#oc-ref'].forEach(s => { const el = $(s); if (el) el.oninput = el.onchange = estadoGuardar; });
  on('#oc-guardar', async () => { try { await rpc('actualizar_orden_compra', { p_oc_id: oc.id, p_cambios: { fecha_prometida: $('#oc-fecha').value || '', referencia_prov: $('#oc-ref').value || '' } }); aviso('Guardado (queda en el historial de cada pedido)'); refrescar(); } catch (e) { aviso(errorDe(e), true); } });
  const guardarTexto = async () => { if (!pc) return; const tx = $('#oc-texto').value; if (tx !== (oc.texto_enviado || '')) { try { await rpc('actualizar_orden_compra', { p_oc_id: oc.id, p_cambios: { texto_enviado: tx } }); oc.texto_enviado = tx; } catch (e) { } } };
  on('#oc-rearmar', async () => { $('#oc-texto').value = textoOC(prov, items, oc.codigo, oc.fecha); await guardarTexto(); aviso('Texto rearmado desde las líneas y guardado'); });
  on('#oc-copiar', async () => { await guardarTexto(); try { await navigator.clipboard.writeText($('#oc-texto').value); aviso('Texto copiado: pégalo en WhatsApp o en el correo'); } catch (e) { aviso('No se pudo copiar: selecciona el texto y cópialo', true); } });
  on('#oc-wa', async () => { await guardarTexto(); window.open(waProveedor(prov, $('#oc-texto').value), '_blank'); });
  on('#oc-pdf', async () => { await guardarTexto(); try { const r = await pdfOC(oc, prov); if (r) aviso(r); } catch (e) { aviso(errorDe(e), true); } });
  on('#oc-cot', () => formCotizacionOC(oc, refrescar));
  on('#oc-pago', () => formPagoProveedor({ id: oc.proveedor_id }, oc, refrescar));
  on('#oc-adj', () => formAdjuntarOC(oc, refrescar));
  on('#oc-recibir', () => formRecibir(recibibles.map(x => ({ ...x, oc })), oc, refrescar));
  on('#oc-cerrar', async () => { if (!confirm(`¿Cerrar la ${oc.codigo}? Se cierra sola cuando todas las piezas quedan embaladas; ciérrala a mano solo si ya no llegará nada más.`)) return; try { await rpc('actualizar_orden_compra', { p_oc_id: oc.id, p_cambios: { estado: 'Cerrada' } }); aviso(`${oc.codigo} cerrada`); refrescar(); } catch (e) { aviso(errorDe(e), true); } });
  on('#oc-reabrir', async () => { try { await rpc('actualizar_orden_compra', { p_oc_id: oc.id, p_cambios: { estado: 'Enviada' } }); await rpc('actualizar_orden_compra', { p_oc_id: oc.id, p_cambios: { texto_enviado: oc.texto_enviado || '' } }); aviso(`${oc.codigo} reabierta`); refrescar(); } catch (e) { aviso(errorDe(e), true); } });
}
/* Corregir la pieza del pedido desde la compra (Harold 19-oct: "de cualquier lado se puede editar"): pata, tapiz, color e indicaciones.
   Guarda con editar_pieza (queda en el historial del pedido) y devuelve los valores nuevos para que la línea y el texto se rearmen. */
function formPiezaCompra(x, despues, cancelar) {
  if (!x) return;
  const telas = (cache.insumos || []).filter(i => i.categoria === 'tela').map(i => i.nombre.replace(/^Tapiz (Eco Cuero )?/i, ''));
  const esSilla = (x.tipo_linea || x.tipo) === 'Silla';
  modal(`<h2>Pieza · ${esc(x.numero)} ${esc(nombrePila({ cliente: x.cliente }))}</h2><div class="gris" style="font-size:12px">${esc((x.tipo_linea || x.tipo) || '')}${x.cantidad > 1 ? ' ×' + x.cantidad : ''} · ${esc(x.descripcion || '')}. Lo que cambies queda en el pedido y en su historial; la línea y el texto de la OC se rearman solos.</div><form id="f"><div class="campos">
    <label class="campo">${esSilla ? 'Pata' : 'Color de estructura'} (código) <input name="color_estructura" list="l-pata" value="${esc(x.color_estructura || '')}" placeholder="NGR, NAT, BL"><datalist id="l-pata"><option value="NGR"><option value="NAT"><option value="BL"></datalist></label>
    ${esSilla ? `<label class="campo">Tapiz (material) <input name="tapiz" list="l-tela" value="${esc(x.tapiz || '')}" placeholder="Patagonia, Velvet Tokio"><datalist id="l-tela">${telas.map(t => `<option value="${esc(t)}">`).join('')}</datalist></label>
    <label class="campo">Color del tapiz (código) <input name="color_silla" value="${esc(x.color_silla && !/POR DEFINIR/i.test(x.color_silla) ? x.color_silla : '')}" placeholder="BEIGE, GRIS.PERLA"></label>` : ''}
    <label class="campo" style="grid-column:1/-1">Indicaciones para el proveedor <input name="indicaciones" value="${esc(x.indicaciones || '')}" placeholder="ej. 7 cm más altas que la estándar"></label></div>
    <div class="acciones"><button type="button" class="btn" id="pz-cancelar">Cancelar</button><button class="btn primario">Guardar</button></div></form>`);
  $('#pz-cancelar').onclick = () => (cancelar ? cancelar() : cerrarModal());
  $('#f').onsubmit = async ev => { ev.preventDefault(); const f = new FormData(ev.target); const c = { color_estructura: (f.get('color_estructura') || '').trim().toUpperCase(), indicaciones: f.get('indicaciones') }; if (esSilla) { c.tapiz = (f.get('tapiz') || '').trim(); c.color_silla = (f.get('color_silla') || '').trim().toUpperCase(); }
    try { const r = await rpc('editar_pieza', { p_linea_id: x.linea_id || x.id, p_cambios: c }); if (typeof actualizarPiezas === 'function') { try { actualizarPiezas(r); } catch (e) { } } aviso('Pieza corregida'); const nuevo = { color_estructura: c.color_estructura || null, indicaciones: c.indicaciones || null }; if (esSilla) { nuevo.tapiz = c.tapiz || null; nuevo.color_silla = c.color_silla || null; } await despues(nuevo); } catch (e) { aviso(errorDe(e), true); } };
}
/* Editar una línea de la OC: cantidad, precio, IVA, indicaciones (y descripción y color si no es una pieza del pedido).
   Si la línea es una pieza, Harold puede corregir ahí mismo pata, tapiz y color (botón "Corregir la pieza"). */
function formEditarItem(it, oc, despues) {
  if (!it) return;
  modal(`<h2>Línea ${it.orden || ''} · ${esc(oc.codigo)}</h2><div class="gris" style="font-size:12px">${esc(tituloItem(provDe(oc), it))}${it.numero ? ' · ' + esc(it.numero) + ' ' + esc(nombrePila({ cliente: it.cliente })) : ''}${it.linea_pedido_id && yo.rol === 'admin' ? ` <button type="button" class="btn chico" id="e-pieza" title="Pata, tapiz, color e indicaciones de la pieza, sin ir al pedido">Corregir la pieza</button>` : ''}</div><form id="f"><div class="campos">
    <label class="campo">Cantidad <input name="cantidad" type="number" min="0.01" step="0.01" value="${it.cantidad}" required></label>
    <label class="campo">Unidad <input name="unidad" value="${esc(it.unidad || 'un')}" placeholder="un, m, m2, plancha"></label>
    <label class="campo">Precio unitario ($) <input name="precio_unitario" type="number" min="0" step="1" value="${it.precio_unitario != null ? it.precio_unitario : ''}" placeholder="sin precio"></label>
    <label class="campo">IVA <select name="iva_pct"><option value="0" ${!Number(it.iva_pct) ? 'selected' : ''}>sin IVA (precio final)</option><option value="19" ${Number(it.iva_pct) === 19 ? 'selected' : ''}>+19% sobre el neto</option></select></label>
    ${!it.linea_pedido_id ? `<label class="campo">Descripción <input name="descripcion" value="${esc(it.descripcion || '')}"></label><label class="campo">Color (código) <input name="color" value="${esc(it.color || '')}" placeholder="BEIGE"></label>` : ''}
    <label class="campo" style="grid-column:1/-1">Indicaciones para el proveedor <input name="indicaciones" value="${esc(it.indicaciones || '')}"></label></div>
    <div class="acciones"><button type="button" class="btn" id="e-cancelar">Cancelar</button><button class="btn primario">Guardar</button></div></form>`);
  $('#e-cancelar').onclick = () => despues();
  const bp = $('#e-pieza'); if (bp) bp.onclick = async () => { await cargarInsumos(); formPiezaCompra({ ...it, linea_id: it.linea_pedido_id, tipo_linea: it.tipo, descripcion: it.pieza_descripcion, cantidad: it.pieza_cantidad }, async () => { await rearmarTextoOC(oc); despues(); }, () => formEditarItem(it, oc, despues)); };
  $('#f').onsubmit = async ev => { ev.preventDefault(); const f = new FormData(ev.target); const c = {}; for (const [k, v] of f.entries()) c[k] = v; try { await rpc('editar_oc_item', { p_item_id: it.id, p_cambios: c }); await rearmarTextoOC(oc); aviso('Línea guardada: total y texto de la OC rearmados'); despues(); } catch (e) { aviso(errorDe(e), true); } };
}
/* Tras corregir una línea o una pieza, el texto de la OC se vuelve a armar desde la base (si Harold lo había retocado a mano, lo rehace: el dato manda) */
async function rearmarTextoOC(oc) {
  try { const fresco = await rpc('orden_compra_json', { p_id: oc.id }); if (!fresco) return; const tx = textoOC(provDe(fresco), fresco.items || [], fresco.codigo, fresco.fecha); if (tx !== fresco.texto_enviado) await rpc('actualizar_orden_compra', { p_oc_id: oc.id, p_cambios: { texto_enviado: tx } }); } catch (e) { }
}
/* Agregar una línea a una OC existente: insumo del catálogo o texto libre, con el pedido al que cae el costo */
async function formAgregarItem(oc, despues) {
  const insumos = await cargarInsumos(); const prov = provDe(oc);
  const pedidos = {}; (oc.items || []).forEach(it => { if (it.pedido_id) pedidos[it.pedido_id] = [it.numero, it.cliente]; }); (cache.compras || []).forEach(x => { pedidos[x.pedido_id] = [x.numero, x.cliente]; });
  modal(`<h2>Nueva línea · ${esc(oc.codigo)}</h2><form id="f"><div class="campos">
    <label class="campo">Insumo del catálogo <select name="insumo_id" id="a-ins"><option value="">(texto libre)</option>${insumos.map(i => `<option value="${i.id}" data-precio="${i.precio_neto_ref != null ? i.precio_neto_ref : ''}" data-unidad="${esc(i.unidad)}">${esc(i.nombre)}${i.codigo_proveedor ? ' [' + esc(i.codigo_proveedor) + ']' : ''} · ${esc(i.unidad)}${i.precio_neto_ref ? ' · ' + pesos(i.precio_neto_ref) : ''}</option>`).join('')}</select></label>
    <label class="campo">Descripción (texto libre o para precisar) <input name="descripcion"></label>
    <label class="campo">Cantidad <input name="cantidad" type="number" min="0.01" step="0.01" value="1" required></label>
    <label class="campo">Unidad <input name="unidad" id="a-unidad" value="un"></label>
    <label class="campo">Precio unitario ($) <input name="precio_unitario" id="a-precio" type="number" min="0" step="1" placeholder="sin precio"></label>
    <label class="campo">IVA <select name="iva_pct"><option value="0" ${!Number(prov.iva_pct) ? 'selected' : ''}>sin IVA (precio final)</option><option value="19" ${Number(prov.iva_pct) === 19 ? 'selected' : ''}>+19% sobre el neto</option></select></label>
    <label class="campo">Color (código) <input name="color" placeholder="BEIGE"></label>
    <label class="campo">A qué pedido cae el costo <select name="pedido_id"><option value="">sin pedido</option>${Object.entries(pedidos).sort((a, b) => String(a[1][0]).localeCompare(String(b[1][0]))).map(([id, [n, c]]) => `<option value="${id}">${esc(n)} ${esc(nombrePila({ cliente: c }))}</option>`).join('')}</select></label>
    <label class="campo" style="grid-column:1/-1">Indicaciones para el proveedor <input name="indicaciones"></label></div>
    <div class="acciones"><button type="button" class="btn" id="a-cancelar">Cancelar</button><button class="btn primario">Agregar</button></div></form>`);
  $('#a-ins').onchange = ev => { const o = ev.target.selectedOptions[0]; if (o && o.dataset.unidad) $('#a-unidad').value = o.dataset.unidad; if (o && o.dataset.precio) $('#a-precio').value = o.dataset.precio; };
  $('#a-cancelar').onclick = () => despues();
  $('#f').onsubmit = async ev => { ev.preventDefault(); const f = new FormData(ev.target); const c = {}; for (const [k, v] of f.entries()) c[k] = v; if (!c.insumo_id && !(c.descripcion || '').trim()) return aviso('Elige un insumo o escribe una descripción', true); try { await rpc('agregar_oc_item', { p_oc_id: oc.id, p_item: c }); aviso('Línea agregada'); despues(); } catch (e) { aviso(errorDe(e), true); } };
}
/* Subir un archivo a la OC (carpeta compras/<id>/ del bucket) y registrarlo como documento */
async function subirDocOC(oc, tipo, archivo, nombre, url) {
  const fila = { orden_compra_id: oc.id, tipo, nombre: nombre || (archivo && archivo.name) || url, subido_por: yo.nombre, url: url || null };
  if (archivo && archivo.size) { const path = `compras/${oc.id}/${Date.now()}_${archivo.name.replace(/[^\w.\-]/g, '_')}`; const { error } = await sb.storage.from('documentos').upload(path, archivo, { contentType: archivo.type || undefined }); if (error) throw error; fila.storage_path = path; }
  else if (!fila.url) return null;
  const { error } = await sb.from('documento').insert(fila); if (error) throw error;
  return fila;
}
function formCotizacionOC(oc, despues) {
  modal(`<h2>Cotización del proveedor · ${esc(oc.codigo)}</h2><form id="f"><div class="campos">
    <div class="gris" style="font-size:12px;grid-column:1/-1">Solo si lo que cotizó el proveedor difiere del total de las líneas${oc.total != null ? ' (' + pesos(oc.total) + ')' : ''}: este monto manda sobre las líneas. Déjalo vacío para volver al total de las líneas.</div>
    <label class="campo">Monto cotizado por el proveedor ($, total a pagar) <input name="monto" type="number" min="0" step="1" value="${oc.monto_origen === 'proveedor' && oc.monto_cotizado != null ? oc.monto_cotizado : ''}"></label>
    <label class="campo">N° de cotización o referencia <input name="ref" value="${esc(oc.referencia_prov || '')}"></label>
    <label class="campo">Fecha prometida (si ya la dio) <input name="fecha" type="date" value="${oc.fecha_prometida || ''}"></label>
    <label class="campo">Archivo de la cotización (PDF o foto) <input name="archivo" type="file" accept="application/pdf,image/*"></label></div>
    <div class="acciones"><button type="button" class="btn" onclick="cerrarModal()">Cancelar</button><button class="btn primario">Guardar</button></div></form>`);
  $('#f').onsubmit = async ev => { ev.preventDefault(); const f = new FormData(ev.target); try {
    await rpc('actualizar_orden_compra', { p_oc_id: oc.id, p_cambios: { monto_cotizado: f.get('monto') || '', referencia_prov: f.get('ref') || '', ...(f.get('fecha') ? { fecha_prometida: f.get('fecha') } : {}) } });
    const a = f.get('archivo'); if (a && a.size) await subirDocOC(oc, 'Cotización proveedor', a, `Cotización ${oc.codigo} ${oc.proveedor}`);
    aviso('Cotización registrada'); cerrarModal(); despues(); } catch (e) { aviso(errorDe(e), true); } };
}
/* ---------- Catálogo de insumos (Compras v2 paso 3, 19-oct-2026): tela, film, madera y lo demás que se compra sin ser pieza de un pedido ----------
   Harold edita; quien compra lo ve. El precio de referencia es el que la OC propone (neto si el proveedor agrega IVA, final si no). */
const CATEGORIAS_INSUMO = ['tela', 'silla', 'sofá', 'vidrio', 'piedra', 'madera', 'cubierta', 'perfil', 'pintura', 'embalaje', 'herraje', 'iluminacion', 'tablero', 'tapacanto', 'servicio', 'otro'];
async function vInsumos() {
  cache.insumos = null; const lista = await cargarInsumos(true); await cargarProveedores();
  const admin = yo.rol === 'admin';
  const fila = i => `<tr class="${i.activo ? '' : 'inactivo'} ${admin ? 'fila-prov' : ''}" data-ins="${i.id}" ${admin ? 'title="Editar este insumo"' : ''}><td class="nw"><b>${esc(i.codigo)}</b>${i.activo ? '' : ' <span class="chip">inactivo</span>'}</td><td>${esc(i.nombre)}${i.codigo_proveedor ? ` <span class="gris">[${esc(i.codigo_proveedor)}]</span>` : ''}${i.tiene_color ? ' <span class="chip">color por línea</span>' : ''}${i.nota ? `<div class="l2">${esc(i.nota)}</div>` : ''}</td><td>${esc(i.categoria)}</td><td>${esc(i.unidad)}</td><td>${esc(i.proveedor || '')}</td><td class="nw mono">${i.precio_neto_ref != null ? pesos(i.precio_neto_ref) : '<span class="gris">-</span>'}${i.precio_ref_fecha ? `<div class="l2">${fecha(i.precio_ref_fecha)}</div>` : ''}</td></tr>`;
  app.innerHTML = barra('#/compras') + `<div class="sub no-imprimir"><a href="#/compras" class="btn chico">← Compras</a><span>Catálogo de lo que se compra: con el precio de referencia la orden de compra propone el precio de cada línea. Tela, film y madera se piden desde Compras con "+ Compra de insumos".</span>${admin ? '<button class="btn chico primario" id="i-nuevo" style="margin-left:auto">+ Insumo</button>' : ''}</div>
    <div class="contenido"><section class="seccion"><div class="tabla-env"><table class="lista"><thead><tr><th>Código</th><th>Insumo</th><th>Categoría</th><th>Unidad</th><th>Proveedor habitual</th><th>Precio ref.</th></tr></thead><tbody>${lista.map(fila).join('') || '<tr><td colspan="6" class="gris">Sin insumos todavía.</td></tr>'}</tbody></table></div>
      <div class="gris" style="font-size:12px;margin-top:8px">Precio de referencia: neto si el proveedor agrega IVA en la OC (Fabrics), final si no (Aliwen). El precio real de cada compra queda en la línea de la OC; el de referencia se corrige aquí cuando cambia.</div></section></div>`;
  if (admin) { $$('tr[data-ins]').forEach(tr => tr.onclick = () => formInsumo(lista.find(i => i.id === Number(tr.dataset.ins)), vInsumos)); const b = $('#i-nuevo'); if (b) b.onclick = () => formInsumo(null, vInsumos); }
}
function formInsumo(i, despues) {
  const v = k => esc(i && i[k] != null ? i[k] : ''); const provs = cache.proveedores || [];
  modal(`<h2>${i ? 'Editar insumo · ' + esc(i.codigo) : 'Nuevo insumo'}</h2><form id="f"><div class="campos">
    <label class="campo">Código (estilo de la casa) <input name="codigo" value="${v('codigo')}" placeholder="TELA.PATAGONIA" required></label>
    <label class="campo">Nombre <input name="nombre" value="${v('nombre')}" placeholder="Tapiz Eco Cuero Patagonia" required></label>
    <label class="campo">Categoría <select name="categoria">${CATEGORIAS_INSUMO.map(c => `<option ${(i ? i.categoria : 'otro') === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
    <label class="campo">Unidad <select name="unidad">${['un', 'm', 'm2', 'plancha', 'kg', 'rollo', 'servicio'].map(u => `<option ${(i ? i.unidad : 'un') === u ? 'selected' : ''}>${u}</option>`).join('')}</select></label>
    <label class="campo">Proveedor habitual <select name="proveedor_habitual_id"><option value="">(ninguno)</option>${provs.map(p => `<option value="${p.id}" ${i && i.proveedor_habitual_id === p.id ? 'selected' : ''}>${esc(p.nombre)}</option>`).join('')}</select></label>
    <label class="campo">Código del proveedor <input name="codigo_proveedor" value="${v('codigo_proveedor')}" placeholder="TAG 26 06"></label>
    <label class="campo">Precio de referencia ($) <input name="precio_neto_ref" type="number" min="0" step="1" value="${v('precio_neto_ref')}"></label>
    <label class="campo">Color por línea <select name="tiene_color"><option value="true" ${i && i.tiene_color ? 'selected' : ''}>Sí (el color se indica al pedir)</option><option value="false" ${!i || !i.tiene_color ? 'selected' : ''}>No</option></select></label>
    ${i ? `<label class="campo">Activo <select name="activo"><option value="true" ${i.activo ? 'selected' : ''}>Sí</option><option value="false" ${!i.activo ? 'selected' : ''}>No (ya no se compra)</option></select></label>` : ''}
    <label class="campo" style="grid-column:1/-1">Nota <textarea name="nota" rows="3">${v('nota')}</textarea></label></div>
    <div class="acciones"><button type="button" class="btn" onclick="cerrarModal()">Cancelar</button><button class="btn primario">${i ? 'Guardar' : 'Crear insumo'}</button></div></form>`, 'ancha');
  $('#f').onsubmit = async ev => { ev.preventDefault(); const f = new FormData(ev.target); const c = {}; for (const [k, val] of f.entries()) c[k] = val; c.tiene_color = c.tiene_color === 'true'; if (c.activo != null) c.activo = c.activo === 'true';
    try { await rpc('editar_insumo', { p_id: i ? i.id : null, p_datos: c }); cache.insumos = null; aviso(i ? 'Insumo guardado' : 'Insumo creado'); cerrarModal(); despues(); } catch (e) { aviso(errorDe(e), true); } };
}

/* ---------- Proveedores y pagos (Compras v2 pasos 1 y 2, 16-oct-2026; ARQUITECTURA_COMPRAS_v2.md) ----------
   Harold: "necesito un lugar donde ver el historial de pedidos que se le hizo a cada proveedor" y "los abonos y saldos que tengo con proveedores".
   Un pago puede cubrir varias OC y una OC puede recibir varios pagos (anticipo y saldo). Lo pagado de la OC se deriva de los pagos.
   Quién ve pagos y saldos: Harold; Alexis solo con ve_pagos_prov (no por defecto). */
const saldoOC = oc => oc.saldo == null ? '<span class="gris">-</span>' : oc.saldo > 0 ? `<span class="rojo">${pesos(oc.saldo)}</span>` : oc.saldo < 0 ? `<span class="verde-txt" title="pagado de más: queda a favor">${pesos(oc.saldo)}</span>` : '<span class="verde-txt">al día</span>';
const waTel = tel => tel ? `<a href="https://wa.me/${String(tel).replace(/\D/g, '')}" target="_blank" title="WhatsApp">${esc(tel)}</a>` : '';
const ivaTxt = p => p && p.precios_con_iva === false ? 'cotiza neto (IVA aparte)' : 'cotiza con IVA';
const PAGO_TIPOS = ['Pago total', 'Anticipo', 'Saldo', 'Nota de crédito', 'Ajuste'];
const CATEGORIAS_PROV = ['vidrio', 'piedra', 'silla', 'sofá', 'tela', 'cubierta', 'madera', 'perfil', 'pintura', 'embalaje', 'herraje', 'servicio', 'otro'];

async function vProveedores() {
  const provs = (await rpc('proveedores_json', {})) || [];
  cache.provsInactivos = !!cache.provsInactivos;
  const lista = provs.filter(p => cache.provsInactivos || p.activo);
  const pv = puedeVerPagos(), pc = puedeComprar(), admin = yo.rol === 'admin';
  const saldoTotal = provs.reduce((s, p) => s + (p.saldo || 0), 0);
  const fila = p => `<tr class="fila-prov ${p.activo ? '' : 'inactivo'}" data-prov="${p.id}" title="Abrir la ficha del proveedor">
    <td class="nw"><b>${esc(p.nombre)}</b>${p.activo ? '' : ' <span class="chip">inactivo</span>'}${p.categoria ? `<div class="l2">${esc(p.categoria)}</div>` : ''}</td>
    <td>${esc(p.que_vende || '')}</td>
    <td class="nw">${esc(p.contacto || '')}${p.telefono ? `<div class="l2">${waTel(p.telefono)}</div>` : ''}</td>
    <td class="num">${p.por_pedir ? `<a href="#/compras" title="Piezas por pedir que le corresponden a este proveedor">${p.por_pedir}</a>` : '<span class="gris">-</span>'}</td>
    <td class="num">${p.oc_abiertas || '<span class="gris">-</span>'}<div class="l2">${p.oc_total ? p.oc_total + ' en total' : ''}</div></td>
    <td class="nw">${p.ultima_compra ? fecha(p.ultima_compra) : '<span class="gris">-</span>'}</td>
    ${pc ? `<td class="nw mono">${p.comprado ? pesos(p.comprado) : '<span class="gris">-</span>'}</td>` : ''}
    ${pv ? `<td class="nw mono">${p.pagado ? pesos(p.pagado) : '<span class="gris">-</span>'}</td><td class="nw mono">${saldoOC(p)}</td>` : ''}
  </tr>`;
  app.innerHTML = barra('#/compras') + `<div class="sub no-imprimir"><a href="#/compras" class="btn chico">← Compras</a><span>Toca un proveedor para ver su ficha: datos, órdenes de compra, pagos, saldo e historial de lo comprado.</span>
      <label style="font-size:12px;display:flex;gap:6px;align-items:center;margin-left:auto"><input type="checkbox" id="p-inactivos" ${cache.provsInactivos ? 'checked' : ''}> ver inactivos</label>
      ${admin ? '<button class="btn chico primario" id="p-nuevo">+ Proveedor</button>' : ''}</div>
    <div class="contenido" style="display:flex;flex-direction:column;gap:14px">
      ${pv ? `<div class="kpis"><div class="kpi"><b>Saldo total con proveedores</b><span class="${saldoTotal > 0 ? 'rojo' : ''}">${pesos(saldoTotal)}</span></div><div class="kpi"><b>Proveedores con saldo</b><span>${provs.filter(p => (p.saldo || 0) > 0).length}</span></div><div class="kpi"><b>OC abiertas</b><span>${provs.reduce((s, p) => s + (p.oc_abiertas || 0), 0)}</span></div></div>` : ''}
      <section class="seccion"><div class="tabla-env"><table class="lista prov-tabla"><thead><tr><th>Proveedor</th><th>Qué vende</th><th>Contacto</th><th>Por pedir</th><th>OC abiertas</th><th>Última compra</th>${pc ? '<th>Comprado</th>' : ''}${pv ? '<th>Pagado</th><th>Saldo</th>' : ''}</tr></thead><tbody>${lista.map(fila).join('')}</tbody></table></div>
      <div class="gris" style="font-size:12px;margin-top:8px">Comprado = suma de lo cotizado en sus OC (las OC sin cotización no suman). Saldo = comprado menos pagado; en rojo lo que se debe, en verde lo pagado de más.</div></section>
    </div>`;
  $$('tr.fila-prov').forEach(tr => tr.onclick = () => { location.hash = '#/compras/proveedor/' + tr.dataset.prov; });
  $('#p-inactivos').onchange = ev => { cache.provsInactivos = ev.target.checked; vProveedores(); };
  const bn = $('#p-nuevo'); if (bn) bn.onclick = () => formProveedor(null, p => { location.hash = '#/compras/proveedor/' + p.id; });
}

async function vProveedor(id) {
  await cargarProveedores();
  const p = await rpc('proveedor_json', { p_id: id });
  if (!p) { app.innerHTML = barra('#/compras') + '<div class="contenido"><div class="seccion">Proveedor no encontrado.</div></div>'; return; }
  const pv = puedeVerPagos(), pc = puedeComprar(), admin = yo.rol === 'admin'; const c = p.cuenta || {};
  const dato = (t, v) => v == null || v === '' ? '' : `<div class="dato"><b>${t}</b>${v}</div>`;
  // Cuenta corriente: OC (cargo = lo cotizado) y pagos (abono) en orden de fecha, con saldo acumulado
  const movs = [];
  (p.ocs || []).forEach(o => movs.push({ fecha: o.fecha, orden: 0, tipo: 'oc', texto: `${o.codigo} · ${o.piezas_resumen || (o.n_piezas + ' piezas')}`, ref: o.referencia_prov, cargo: o.monto_cotizado, estado: o.estado, oc_id: o.id, sinCot: o.monto_cotizado == null }));
  (p.pagos || []).forEach(g => movs.push({ fecha: g.fecha, orden: 1, tipo: 'pago', texto: `${g.tipo}${g.aplicado && g.aplicado.length ? ' · ' + g.aplicado.map(a => 'OC-' + a.numero + (g.aplicado.length > 1 ? ' ' + pesos(a.monto) : '')).join(', ') : ' · sin aplicar a una OC'}${g.nota ? ' · ' + g.nota : ''}`, ref: [g.medio_pago, cuentaNombre(g.cuenta_origen) !== '-' ? cuentaNombre(g.cuenta_origen) : '', g.referencia].filter(Boolean).join(' · '), abono: g.monto, pago: g }));
  movs.sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)) || a.orden - b.orden);
  let acum = 0;
  const filaMov = m => { acum += (m.cargo || 0) - (m.abono || 0); return `<tr class="${m.oc_id ? 'fila-oc' : ''}" ${m.oc_id ? `data-oc="${m.oc_id}"` : ''}><td class="nw">${fecha(m.fecha)}</td><td>${esc(m.texto)}${m.estado ? ' ' + ocChip(m.estado) : ''}${m.sinCot ? ' <span class="chip">sin cotización</span>' : ''}${m.ref ? `<div class="l2">${esc(m.ref)}</div>` : ''}</td><td class="nw mono">${m.cargo != null ? pesos(m.cargo) : ''}</td><td class="nw mono">${m.abono != null ? pesos(m.abono) : ''}</td><td class="nw mono ${acum > 0 ? 'rojo' : acum < 0 ? 'verde-txt' : ''}">${pesos(acum)}</td><td class="nw">${m.pago ? (m.pago.comprobante_path ? `<button class="btn chico" data-ver="${esc(m.pago.comprobante_path)}">Ver</button>` : m.pago.comprobante_url ? `<a class="btn chico" href="${esc(m.pago.comprobante_url)}" target="_blank">Abrir</a>` : '') + (admin ? ` <button class="btn chico" data-borrar-pago="${m.pago.id}" title="Borrar este pago (si se registró mal)">Borrar</button>` : '') : ''}</td></tr>`; };
  const filaOC = o => `<tr class="fila-oc ${o.atrasada ? 'atrasado' : ''}" data-oc="${o.id}" title="Abrir la orden de compra"><td class="num"><b>${esc(o.codigo)}</b></td><td class="nw">${fecha(o.fecha)}</td><td>${ocChip(o.estado)}</td><td>${esc(o.piezas_resumen || '')}</td><td class="nw ${o.atrasada ? 'rojo' : ''}">${o.fecha_prometida ? fecha(o.fecha_prometida, true) : '<span class="gris">sin fecha</span>'}${o.referencia_prov ? `<div class="l2">${esc(o.referencia_prov)}</div>` : ''}</td>${pc ? `<td class="nw mono">${o.monto_cotizado != null ? pesos(o.monto_cotizado) : '<span class="gris">-</span>'}</td>` : ''}${pv ? `<td class="nw mono">${o.monto_pagado != null ? pesos(o.monto_pagado) : '<span class="gris">-</span>'}</td><td class="nw mono">${saldoOC(o)}</td>` : ''}</tr>`;
  const filaIt = x => `<tr><td class="nw">${fecha(x.fecha)}</td><td class="nw"><a href="#" data-oc="${x.oc_id}">OC-${x.oc_numero}</a> ${ocChip(x.estado_oc)}</td><td class="nw">${x.numero ? `<a href="#/pedido/${x.pedido_id}">${esc(x.numero)}</a> ${esc(nombrePila({ cliente: x.cliente }))}` : '<span class="gris">-</span>'}</td><td>${esc(tituloItem(p, x))}${atributosItem(p, x).length ? `<div class="l2">${esc(atributosItem(p, x).join(' · '))}</div>` : ''}</td><td class="nw">${qty(x.cantidad)}${x.unidad && x.unidad !== 'un' ? ' ' + esc(x.unidad) : ''}</td>${pc ? `<td class="nw mono">${x.precio_unitario != null ? pesos(x.precio_unitario) + (Number(x.iva_pct) ? ' <span class="gris">+IVA</span>' : '') : '<span class="gris">-</span>'}</td><td class="nw mono">${x.total != null ? pesos(x.total) : '<span class="gris">-</span>'}</td>` : ''}<td class="nw">${x.devuelta_en ? `<span class="rojo">devuelta ${fecha(x.devuelta_en)}</span>` : x.recibida_en ? `recibida ${fecha(x.recibida_en)}` : esc(x.etapa || '')}</td></tr>`;
  const filaPz = x => `<tr><td class="nw">${x.fecha_pedido ? fecha(x.fecha_pedido) : '-'}</td><td class="nw"><a href="#/pedido/${x.pedido_id}">${esc(x.numero)}</a> ${esc(nombrePila({ cliente: x.cliente }))}</td><td>${esc(descCompra(p, { ...x, tipo_linea: x.tipo }))}</td><td class="nw">${esc(x.etapa || '')}${x.devuelta_en ? `<div class="l2 rojo">devuelta ${fecha(x.devuelta_en)}${x.recepcion_nota ? ' · ' + esc(x.recepcion_nota) : ''}</div>` : x.recibida_en ? `<div class="l2">recibida ${fecha(x.recibida_en)}</div>` : ''}</td><td class="nw">${x.oc_numero ? `<a href="#" data-oc="${x.oc_id}">OC-${x.oc_numero}</a>` : '<span class="gris">sin OC</span>'}</td></tr>`;
  app.innerHTML = barra('#/compras') + `<div class="sub no-imprimir"><a href="#/compras/proveedores" class="btn chico">← Proveedores</a><span><b>${esc(p.nombre)}</b> · ${esc(p.que_vende || '')}</span>
      <span style="margin-left:auto;display:flex;gap:8px">${pv ? '<button class="btn chico primario" id="pv-pago">Registrar pago</button>' : ''}${admin ? '<button class="btn chico" id="pv-editar">Editar</button>' : ''}</span></div>
    <div class="contenido ficha-prov" style="display:flex;flex-direction:column;gap:14px">
      <section class="seccion"><div class="cab"><h2>${esc(p.nombre)}${p.activo ? '' : ' <span class="chip">inactivo</span>'}${p.categoria ? ` <span class="chip">${esc(p.categoria)}</span>` : ''}</h2></div>
        <div class="datos">${dato('Contacto', esc(p.contacto))}${dato('Teléfono', waTel(p.telefono))}${dato('Correo', p.correo ? `<a href="mailto:${esc(p.correo)}">${esc(p.correo)}</a>` : '')}${dato('RUT', esc(p.rut))}${dato('Dirección', esc(p.direccion))}${dato('Forma de pago', esc(p.forma_pago))}
          ${dato('Condición', [p.pct_anticipo != null ? p.pct_anticipo + '% para empezar' : '', p.pct_contra_entrega != null ? p.pct_contra_entrega + '% contra entrega' : '', p.plazo_dias ? p.plazo_dias + ' días' : ''].filter(Boolean).join(' · '))}
          ${dato('Precios', ivaTxt(p))}${dato('IVA en la OC', p.iva_pct != null ? (Number(p.iva_pct) ? '+' + p.iva_pct + '% sobre el neto' : 'sin IVA (precio final)') : '')}${dato('Despacho', esc(p.despacho))}${dato('Cuenta bancaria', esc(p.cuenta_bancaria))}${dato('Formato del pedido', esc(p.formato))}${dato('Nota', esc(p.nota))}</div></section>
      <div class="kpis">
        <div class="kpi"><b>OC abiertas</b><span>${c.oc_abiertas || 0}</span>${c.oc_sin_cotizar ? `<small>${c.oc_sin_cotizar} sin cotización</small>` : ''}</div>
        <div class="kpi"><b>Última compra</b><span>${c.ultima_compra ? fecha(c.ultima_compra) : '-'}</span></div>
        ${pc ? `<div class="kpi"><b>Comprado ${new Date().getFullYear()}</b><span>${pesos(c.comprado_ano || 0)}</span><small>${pesos(c.comprado || 0)} histórico</small></div>` : ''}
        ${pv ? `<div class="kpi"><b>Pagado ${new Date().getFullYear()}</b><span>${pesos(c.pagado_ano || 0)}</span><small>${pesos(c.pagado || 0)} histórico</small></div><div class="kpi"><b>Saldo</b><span class="${(c.saldo || 0) > 0 ? 'rojo' : (c.saldo || 0) < 0 ? 'verde-txt' : ''}">${pesos(c.saldo || 0)}</span><small>${(c.saldo || 0) > 0 ? 'se le debe' : (c.saldo || 0) < 0 ? 'a favor nuestro' : 'al día'}${c.sin_aplicar ? ' · ' + pesos(c.sin_aplicar) + ' pagados sin OC' : ''}</small></div>` : ''}
        <div class="kpi"><b>Piezas devueltas</b><span class="${c.piezas_devueltas ? 'rojo' : ''}">${c.piezas_devueltas || 0}</span></div>
      </div>
      ${pv ? `<section class="seccion"><div class="cab"><h2>Cuenta corriente</h2><span class="gris" style="font-size:12px">cargo = lo cotizado en la OC · abono = pago · saldo acumulado</span></div>
        ${movs.length ? `<div class="tabla-env"><table class="lista"><thead><tr><th>Fecha</th><th>Detalle</th><th>Cargo</th><th>Abono</th><th>Saldo</th><th></th></tr></thead><tbody>${movs.map(filaMov).join('')}</tbody></table></div>` : '<div class="gris">Sin movimientos todavía.</div>'}</section>` : ''}
      <section class="seccion"><div class="cab"><h2>Órdenes de compra (${(p.ocs || []).length})</h2></div>
        ${(p.ocs || []).length ? `<div class="tabla-env"><table class="lista oc-tabla"><thead><tr><th>OC</th><th>Enviada</th><th>Estado</th><th>Piezas</th><th>Llega</th>${pc ? '<th>Cotizó</th>' : ''}${pv ? '<th>Pagado</th><th>Saldo</th>' : ''}</tr></thead><tbody>${p.ocs.map(filaOC).join('')}</tbody></table></div>` : '<div class="gris">Todavía no se le ha hecho ninguna orden de compra desde la app.</div>'}</section>
      <section class="seccion"><div class="cab"><h2>Historial de compras (${(p.items || []).length} línea${(p.items || []).length === 1 ? '' : 's'})</h2><span class="gris" style="font-size:12px">cada línea de cada OC, con cantidad y precio: lo que se le ha comprado y a cuánto</span></div>
        ${(p.items || []).length ? `<div class="tabla-env"><table class="lista"><thead><tr><th>Fecha</th><th>OC</th><th>Pedido</th><th>Línea</th><th>Cant.</th>${pc ? '<th>Precio unit.</th><th>Total</th>' : ''}<th>Estado</th></tr></thead><tbody>${p.items.map(filaIt).join('')}</tbody></table></div>` : '<div class="gris">Nada comprado a este proveedor desde la app (las compras anteriores al 13-oct-2026 están en Proveedores.xlsx).</div>'}</section>
      ${(p.piezas || []).some(x => !x.oc_id) ? `<section class="seccion"><div class="cab"><h2>Piezas pedidas sin OC (${p.piezas.filter(x => !x.oc_id).length})</h2><span class="gris" style="font-size:12px">pedidas antes del 13-oct o anotadas a mano</span></div>
        <div class="tabla-env"><table class="lista"><thead><tr><th>Pedida</th><th>Pedido</th><th>Pieza</th><th>Etapa</th><th>OC</th></tr></thead><tbody>${p.piezas.filter(x => !x.oc_id).map(filaPz).join('')}</tbody></table></div></section>` : ''}
    </div>`;
  const refrescar = () => vProveedor(id);
  $$('tr.fila-oc, a[data-oc]').forEach(el => el.onclick = ev => { ev.preventDefault(); modalOC(Number(el.dataset.oc)); });
  $$('[data-ver]').forEach(b => b.onclick = async ev => { ev.stopPropagation(); const { data, error } = await sb.storage.from('documentos').createSignedUrl(b.dataset.ver, 3600); if (error) return aviso(errorDe(error), true); window.open(data.signedUrl, '_blank'); });
  $$('[data-borrar-pago]').forEach(b => b.onclick = async ev => { ev.stopPropagation(); if (!confirm('¿Borrar este pago? Las OC vuelven a su estado según lo que quede pagado. Queda anotado en el historial de los pedidos.')) return; try { await rpc('borrar_pago_proveedor', { p_pago_id: Number(b.dataset.borrarPago) }); aviso('Pago borrado'); refrescar(); } catch (e) { aviso(errorDe(e), true); } });
  const be = $('#pv-editar'); if (be) be.onclick = () => formProveedor(p, refrescar);
  const bp = $('#pv-pago'); if (bp) bp.onclick = () => formPagoProveedor(p, null, refrescar);
}

/* Crear o editar un proveedor (solo Harold). Los datos de contacto, condiciones de pago y si cotiza con o sin IVA. */
function formProveedor(p, despues) {
  const v = k => esc(p && p[k] != null ? p[k] : '');
  modal(`<h2>${p ? 'Editar proveedor · ' + esc(p.nombre) : 'Nuevo proveedor'}</h2><form id="f"><div class="campos">
    <label class="campo">Nombre <input name="nombre" value="${v('nombre')}" required></label>
    <label class="campo">Qué vende <input name="que_vende" value="${v('que_vende')}" placeholder="ej. Telas para tapiz"></label>
    <label class="campo">Categoría <select name="categoria"><option value="">(sin categoría)</option>${CATEGORIAS_PROV.map(c => `<option ${p && p.categoria === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
    <label class="campo">Contacto (persona) <input name="contacto" value="${v('contacto')}"></label>
    <label class="campo">Teléfono (WhatsApp) <input name="telefono" value="${v('telefono')}" placeholder="+56 9 ..."></label>
    <label class="campo">Correo <input name="correo" type="email" value="${v('correo')}"></label>
    <label class="campo">RUT <input name="rut" value="${v('rut')}"></label>
    <label class="campo">Dirección <input name="direccion" value="${v('direccion')}"></label>
    <label class="campo">Forma de pago <input name="forma_pago" value="${v('forma_pago') || (p ? '' : 'Transferencia')}"></label>
    <label class="campo">% para empezar <input name="pct_anticipo" type="number" min="0" max="100" value="${v('pct_anticipo')}"></label>
    <label class="campo">% contra entrega <input name="pct_contra_entrega" type="number" min="0" max="100" value="${v('pct_contra_entrega')}"></label>
    <label class="campo">Plazo (días) <input name="plazo_dias" type="number" min="0" value="${v('plazo_dias')}"></label>
    <label class="campo">Precios <select name="precios_con_iva"><option value="true" ${!p || p.precios_con_iva !== false ? 'selected' : ''}>Cotiza con IVA incluido</option><option value="false" ${p && p.precios_con_iva === false ? 'selected' : ''}>Cotiza neto (IVA aparte)</option></select></label>
    <label class="campo">IVA en la OC <select name="iva_pct"><option value="19" ${!p || Number(p.iva_pct) === 19 || p.iva_pct == null ? 'selected' : ''}>+19% sobre el neto (cotiza neto y factura)</option><option value="0" ${p && Number(p.iva_pct) === 0 ? 'selected' : ''}>Sin IVA (precio final: trae IVA incluido o no factura)</option></select></label>
    <label class="campo">Despacho <input name="despacho" value="${v('despacho')}" placeholder="ej. Despachan gratis, Solo retiro"></label>
    <label class="campo">Cuenta bancaria <input name="cuenta_bancaria" value="${v('cuenta_bancaria')}" placeholder="banco, tipo, número, RUT, correo"></label>
    <label class="campo">Espesores de vidrio que se le piden (mm) <input name="espesores_vidrio" value="${esc(p && p.espesores_vidrio ? p.espesores_vidrio.join(', ') : '')}" placeholder="ej. 12 o 15, 19 (solo vidrierías)" title="Compras sugiere este proveedor para las cubiertas de vidrio de estos espesores (Harold 20-oct: 12 mm Templaglass, 15 mm Agliati)"></label>
    <label class="campo">Formato del texto de la OC <select name="formato">${[['generico', 'Genérico (cantidad, descripción, medidas)'], ['vidrio', 'Vidrio (tipo, espesor, medidas, forma)'], ['sillas_aliwen', 'Sillas Aliwen (pata, tapiz, madera)']].map(([k, t]) => `<option value="${k}" ${(p ? p.formato : 'generico') === k ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
    ${p ? `<label class="campo">Activo <select name="activo"><option value="true" ${p.activo ? 'selected' : ''}>Sí</option><option value="false" ${!p.activo ? 'selected' : ''}>No (ya no se le compra)</option></select></label>` : ''}
    <label class="campo" style="grid-column:1/-1">Nota (precios acordados, cómo pedir, horarios) <textarea name="nota" rows="3">${v('nota')}</textarea></label></div>
    <div class="acciones"><button type="button" class="btn" onclick="cerrarModal()">Cancelar</button><button class="btn primario">${p ? 'Guardar' : 'Crear proveedor'}</button></div></form>`, 'ancha');
  $('#f').onsubmit = async ev => { ev.preventDefault(); const f = new FormData(ev.target); const c = {}; for (const [k, val] of f.entries()) c[k] = val; if (c.precios_con_iva != null) c.precios_con_iva = c.precios_con_iva === 'true'; if (c.activo != null) c.activo = c.activo === 'true';
    try { const r = await rpc('editar_proveedor', { p_id: p ? p.id : null, p_cambios: c }); cache.proveedores = null; aviso(p ? 'Proveedor guardado' : 'Proveedor creado'); cerrarModal(); despues(r); } catch (e) { aviso(errorDe(e), true); } };
}

/* Registrar un pago a un proveedor: monto, fecha, medio, desde qué cuenta, tipo (anticipo, saldo...), comprobante, y a qué OC se aplica
   (una, varias o ninguna; lo no aplicado queda a favor en su cuenta). ocPre = OC desde la que se abrió (queda marcada con su saldo). */
async function formPagoProveedor(prov, ocPre, despues) {
  const p = prov.ocs ? prov : await rpc('proveedor_json', { p_id: prov.id || prov.proveedor_id });
  if (!p) return aviso('No se pudo cargar el proveedor', true);
  const abiertas = (p.ocs || []).filter(o => o.estado !== 'Cerrada' || (o.saldo || 0) > 0 || (ocPre && o.id === ocPre.id));
  const filaOC = o => { const pre = ocPre && o.id === ocPre.id; const sug = o.saldo != null && o.saldo > 0 ? o.saldo : o.monto_cotizado != null && o.monto_pagado == null ? o.monto_cotizado : ''; return `<div class="aplicar-fila"><label><input type="checkbox" name="oc_${o.id}" ${pre ? 'checked' : ''}> <b>${esc(o.codigo)}</b> ${ocChip(o.estado)} ${esc(o.piezas_resumen || '')}<div class="l2">${o.monto_cotizado != null ? 'cotizó ' + pesos(o.monto_cotizado) : 'sin cotización'}${o.monto_pagado ? ' · pagado ' + pesos(o.monto_pagado) : ''}${o.saldo != null ? ' · saldo ' + pesos(o.saldo) : ''}</div></label><input name="m_${o.id}" type="number" step="1" placeholder="monto" value="${pre ? sug : ''}" style="width:120px"></div>`; };
  modal(`<h2>Pago a ${esc(p.nombre)}</h2><div class="gris" style="font-size:12px">${ivaTxt(p)}. Marca a qué órdenes de compra se aplica; si pagas varias juntas, reparte el monto. Lo que no apliques queda a favor en su cuenta.</div><form id="f"><div class="campos">
    <label class="campo">Monto pagado ($) <input name="monto" type="number" step="1" value="${ocPre && ocPre.saldo > 0 ? ocPre.saldo : ocPre && ocPre.monto_cotizado != null && ocPre.monto_pagado == null ? ocPre.monto_cotizado : ''}" required></label>
    <label class="campo">Fecha <input name="fecha" type="date" value="${hoyISO()}" required></label>
    <label class="campo">Tipo <select name="tipo">${PAGO_TIPOS.map(t => `<option ${(ocPre && ocPre.monto_pagado ? 'Saldo' : 'Pago total') === t ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
    <label class="campo">Medio <select name="medio">${['Transferencia', 'Efectivo', 'Tarjeta', 'Otro'].map(m => `<option>${m}</option>`).join('')}</select></label>
    <label class="campo">Desde qué cuenta <select name="cuenta"><option value="">(sin anotar)</option>${cuentasOpciones()}</select></label>
    <label class="campo">Referencia (n° transferencia, factura) <input name="ref"></label>
    <label class="campo">Comprobante (foto o PDF) <input name="archivo" type="file" accept="application/pdf,image/*"></label>
    <label class="campo">o enlace <input name="url" type="url" placeholder="https://..."></label>
    <label class="campo" style="grid-column:1/-1">Nota <input name="nota" placeholder="ej. anticipo sillas Estrella y Liliana"></label></div>
    <div style="margin-top:10px"><b style="font-size:13px">Aplicar a órdenes de compra</b>${abiertas.length ? `<div class="aplicar">${abiertas.map(filaOC).join('')}</div>` : '<div class="gris" style="font-size:12px">Este proveedor no tiene OC abiertas: el pago queda a favor en su cuenta.</div>'}</div>
    <div class="acciones"><button type="button" class="btn" onclick="cerrarModal()">Cancelar</button><button class="btn primario">Guardar pago</button></div></form>`, 'ancha');
  const sel = $('select[name=cuenta]'); if (sel && codigoDe('cuenta', 'SANTINO.SANTANDER')) sel.value = 'SANTINO.SANTANDER';
  $$('.aplicar-fila input[type=checkbox]').forEach(cb => cb.onchange = () => { const m = cb.closest('.aplicar-fila').querySelector('input[type=number]'); if (cb.checked && !m.value) { const o = abiertas.find(x => 'oc_' + x.id === cb.name); const mon = Number($('input[name=monto]').value) || 0; m.value = o.saldo != null && o.saldo > 0 ? Math.min(o.saldo, mon || o.saldo) : o.monto_cotizado != null && o.monto_pagado == null ? Math.min(o.monto_cotizado, mon || o.monto_cotizado) : mon || ''; } });
  $('#f').onsubmit = async ev => { ev.preventDefault(); const f = new FormData(ev.target); const monto = Number(f.get('monto'));
    if (!monto) return aviso('Falta el monto', true);
    const aplicar = abiertas.filter(o => f.get('oc_' + o.id)).map(o => ({ oc_id: o.id, monto: Number(f.get('m_' + o.id)) || 0 })).filter(a => a.monto);
    const suma = aplicar.reduce((s, a) => s + a.monto, 0);
    if (Math.abs(suma) > Math.abs(monto)) return aviso(`Lo aplicado (${pesos(suma)}) supera el monto del pago (${pesos(monto)})`, true);
    try {
      let path = null; const a = f.get('archivo');
      if (a && a.size) { path = `compras/pagos/${p.id}/${Date.now()}_${a.name.replace(/[^\w.\-]/g, '_')}`; const { error } = await sb.storage.from('documentos').upload(path, a, { contentType: a.type || undefined }); if (error) throw error; }
      await rpc('registrar_pago_proveedor', { p_proveedor_id: p.id, p_monto: monto, p_fecha: f.get('fecha'), p_medio: f.get('medio'), p_cuenta: f.get('cuenta') || null, p_tipo: f.get('tipo'), p_referencia: f.get('ref') || null, p_nota: f.get('nota') || null, p_aplicar: aplicar, p_comprobante_path: path, p_comprobante_url: f.get('url') || null });
      aviso(`Pago de ${pesos(monto)} a ${p.nombre} registrado${aplicar.length ? ' y aplicado a ' + aplicar.length + ' OC' : ''}`); cerrarModal(); despues();
    } catch (e) { aviso(errorDe(e), true); } };
}
function formAdjuntarOC(oc, despues) {
  const esOp = yo.rol === 'operacion';
  const tipos = esOp ? ['Guía proveedor'] : ['Guía proveedor', 'Cotización proveedor', 'Comprobante proveedor', 'Orden de compra', 'Otro'];
  modal(`<h2>Adjuntar a ${esc(oc.codigo)}</h2><form id="f"><div class="campos">
    <label class="campo">Tipo <select name="tipo">${tipos.map(t => `<option>${t}</option>`).join('')}</select></label>
    <label class="campo">Archivo (foto o PDF, hasta 25 MB) <input name="archivo" type="file" accept="application/pdf,image/*"></label>
    <label class="campo">o enlace (Drive) <input name="url" type="url" placeholder="https://drive.google.com/..."></label>
    <label class="campo">Nombre <input name="nombre" placeholder="se toma del archivo si va vacío"></label></div>
    <div class="acciones"><button type="button" class="btn" onclick="cerrarModal()">Cancelar</button><button class="btn primario">Guardar</button></div></form>`);
  $('#f').onsubmit = async ev => { ev.preventDefault(); const f = new FormData(ev.target); try { const r = await subirDocOC(oc, f.get('tipo'), f.get('archivo'), f.get('nombre'), f.get('url')); if (!r) throw new Error('Adjunta un archivo o pega un enlace'); aviso('Documento guardado'); cerrarModal(); despues(); } catch (e) { aviso(errorDe(e), true); } };
}
/* Recepción (Alexis tacha la guía del proveedor): por cada pieza, conforme (queda en bodega) o devuelta al proveedor con el motivo;
   la foto de la guía tachada se adjunta a la OC (o al pedido si la pieza no tiene OC). */
function formRecibir(piezas, oc, despues) {
  const fila = x => `<div class="recibir-fila"><div><b>${esc(x.numero || '')}</b> ${esc(x.cliente ? nombrePila({ cliente: x.cliente }) : '')} · ${esc(descCompra(x.oc ? provDe(x.oc) : null, x))}<div class="l2 gris">hoy: ${esc(x.etapa)}${x.recepcion_nota ? ' · ' + esc(x.recepcion_nota) : ''}</div></div>
    <div class="recibir-opc"><label><input type="radio" name="r${x.id}" value="conforme" ${x.etapa === 'Devuelta al proveedor' ? '' : 'checked'}> Conforme, a bodega</label><label><input type="radio" name="r${x.id}" value="devuelta"> Devuelta al proveedor</label><label><input type="radio" name="r${x.id}" value="" ${x.etapa === 'Devuelta al proveedor' ? 'checked' : ''}> Sin cambio</label><input name="n${x.id}" placeholder="motivo o nota (ej. vino trizado)" style="width:100%"></div></div>`;
  modal(`<h2>Recibir piezas${oc ? ' · ' + esc(oc.codigo) : ''}</h2><div class="gris" style="font-size:12px">Marca cada pieza como llegó. Conforme = queda en bodega (etapa Recibido). Devuelta = vuelve al proveedor con el motivo; cuando vuelva bien, tócala de nuevo o vuelve a recibirla conforme. Adjunta la foto de la guía del proveedor tachada.</div>
    <form id="f">${piezas.map(fila).join('')}
    <label class="campo" style="margin-top:8px">Guía del proveedor (foto o PDF, opcional) <input name="guia" type="file" accept="application/pdf,image/*" capture="environment"></label>
    <div class="acciones"><button type="button" class="btn" onclick="cerrarModal()">Cancelar</button><button class="btn primario">Guardar recepción</button></div></form>`, 'ancha');
  $('#f').onsubmit = async ev => { ev.preventDefault(); const f = new FormData(ev.target); try {
    const items = piezas.map(x => ({ linea_id: x.id, resultado: f.get('r' + x.id) || '', nota: f.get('n' + x.id) || '' })).filter(i => i.resultado);
    if (!items.length) throw new Error('No marcaste ninguna pieza');
    const r = await rpc('recibir_compra', { p_items: items });
    (r.pedidos || []).forEach(actualizarPiezas);
    const g = f.get('guia'); if (g && g.size) {
      if (oc) await subirDocOC(oc, 'Guía proveedor', g, `Guía ${oc.proveedor} ${fecha(hoyISO())}`);
      else { const x = piezas[0]; const path = `compras/pedido_${x.pedido_id}/${Date.now()}_${g.name.replace(/[^\w.\-]/g, '_')}`; const { error } = await sb.storage.from('documentos').upload(path, g); if (error) throw error; const { error: e2 } = await sb.from('documento').insert({ pedido_id: x.pedido_id, tipo: 'Guía proveedor', nombre: `Guía proveedor ${fecha(hoyISO())}`, storage_path: path, subido_por: yo.nombre }); if (e2) throw e2; }
    }
    const dev = items.filter(i => i.resultado === 'devuelta').length;
    aviso(`${items.length - dev} recibida${items.length - dev === 1 ? '' : 's'} conforme${dev ? ` · ${dev} devuelta${dev > 1 ? 's' : ''} al proveedor` : ''}`); cerrarModal(); despues(r); } catch (e) { aviso(errorDe(e), true); } };
}
/* Enlaces de compra en la tabla de piezas (despliegue y ficha): abrir la OC y recibir/devolver desde el pedido */
function activarCompras(raiz, p, despues) {
  $$('[data-oc]', raiz).forEach(a => { if (a.tagName === 'TR') return; a.onclick = ev => { ev.preventDefault(); ev.stopPropagation(); modalOC(Number(a.dataset.oc)); }; });
  $$('[data-recibir]', raiz).forEach(a => a.onclick = ev => { ev.preventDefault(); ev.stopPropagation(); const x = (p.piezas || []).find(y => y.id === Number(a.dataset.recibir)); if (!x) return;
    const oc = x.oc_id ? { id: x.oc_id, codigo: 'OC-' + x.oc_numero, proveedor: x.proveedor, proveedor_id: null } : null;
    formRecibir([{ ...x, numero: p.numero, cliente: p.cliente, tipo_linea: x.tipo, oc }], oc, despues); });
}
const ocLineaPieza = x => x.area !== 'Vidrio/compras' ? '' : `<div class="l2">${x.oc_numero ? `<a href="#" data-oc="${x.oc_id}" title="Abrir la orden de compra">OC-${x.oc_numero}</a> · ${esc(x.oc_estado || '')}${x.fecha_prometida_prov ? ` · llega ${fecha(x.fecha_prometida_prov)}` : ''}` : esc(x.proveedor || (/^Pedid/.test(x.etapa || '') ? 'pedida' : 'compra a proveedor'))}${/^(Pedid|Recibid|Devuelta)/.test(x.etapa || '') ? ` · <a href="#" data-recibir="${x.id}">recibir / devolver</a>` : ''}</div>`;

/* PDF de la OC con logo y número: en el Mac se descarga; en celular o tablet abre la hoja de compartir (WhatsApp, Mail).
   jsPDF se carga solo cuando se pide el primer PDF. El PDF generado queda adjunto a la OC (tipo "Orden de compra") la primera vez. */
async function cargarJsPDF() { if (window.jspdf) return; await new Promise((ok, no) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'; s.onload = ok; s.onerror = () => no(new Error('No se pudo cargar el generador de PDF (revisa la conexión)')); document.head.appendChild(s); }); }
async function logoDataUrl() { if (cache.logoData) return cache.logoData; const b = await (await fetch('logo.png')).blob(); cache.logoData = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(b); }); return cache.logoData; }
async function pdfOC(oc, prov) {
  await cargarJsPDF(); const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'letter' }); const W = 215.9, M = 18, A = W - 2 * M; let y = 16;
  try { doc.addImage(await logoDataUrl(), 'PNG', M, y - 2, 58, 12); } catch (e) { }
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(0, 129, 166); doc.text('ORDEN DE COMPRA', W - M, y, { align: 'right' });
  doc.setFontSize(22); doc.setTextColor(26, 26, 26); doc.text(oc.codigo, W - M, y + 9, { align: 'right' });
  doc.setFontSize(8); doc.setTextColor(120); doc.text('Fecha: ' + fecha(oc.fecha), W - M, y + 14, { align: 'right' });
  y += 22; doc.setDrawColor(0, 129, 166); doc.setLineWidth(0.6); doc.line(M, y, W - M, y); y += 7;
  const bloque = (x, titulo, filas) => { doc.setFontSize(7); doc.setTextColor(0, 129, 166); doc.text(titulo.toUpperCase(), x, y); let yy = y + 5; doc.setFontSize(9); filas.forEach(([k, v]) => { doc.setTextColor(120); doc.text(k, x, yy); doc.setTextColor(40); doc.text(String(v || '-'), x + 22, yy); yy += 4.6; }); return yy; };
  const y1 = bloque(M, 'Emisor', [['Empresa', EMISOR.empresa], ['RUT', EMISOR.rut], ['Dirección', EMISOR.direccion], ['Teléfono', EMISOR.telefono], ['Email', EMISOR.email]]);
  const y2 = bloque(M + A / 2 + 4, 'Proveedor', [['Nombre', prov.nombre], ['Contacto', prov.contacto], ['Teléfono', prov.telefono], ['Dirección', prov.direccion], ['Referencia', oc.referencia_prov]]);
  y = Math.max(y1, y2) + 4;
  doc.setFontSize(7); doc.setTextColor(0, 129, 166); doc.text('DETALLE', M, y); y += 3;
  const items = oc.items || (oc.piezas || []).map(x => itemDePieza(x, null)); const tt = totalesItems(items); const conPrecio = puedeComprar() && items.length > 0 && tt.sin === 0;
  const cols = conPrecio ? [[M, 8, 'N°'], [M + 8, 18, 'Cant.'], [M + 26, A - 26 - 30 - 26 - 28, 'Descripción'], [W - M - 84, 30, 'Pedido'], [W - M - 54, 26, 'Precio'], [W - M - 28, 28, 'Total']] : [[M, 10, 'N°'], [M + 10, 16, 'Cant.'], [M + 26, A - 26 - 34, 'Descripción'], [W - M - 34, 34, 'Pedido']];
  doc.setFillColor(230, 243, 247); doc.rect(M, y, A, 7, 'F'); doc.setFontSize(8.5); doc.setTextColor(40); cols.forEach(([x, w, t]) => doc.text(t, x + 2, y + 4.8)); y += 7;
  doc.setFontSize(9); doc.setDrawColor(221, 227, 230); doc.setLineWidth(0.2);
  items.forEach((it, i) => { const txt = [tituloItem(prov, it, true)].concat(atributosItem(prov, it)).join('\n'); const d = doc.splitTextToSize(txt, cols[2][1] - 4); const h = Math.max(7, d.length * 4.4 + 3); if (y + h > 240) { doc.addPage(); y = 20; }
    doc.setTextColor(40); doc.text(String(i + 1), cols[0][0] + 2, y + 4.8); doc.text(qty(it.cantidad) + (it.unidad && it.unidad !== 'un' ? ' ' + it.unidad : ''), cols[1][0] + 2, y + 4.8); doc.text(d, cols[2][0] + 2, y + 4.8);
    doc.setTextColor(120); doc.text(it.numero ? `${it.numero} ${nombrePila({ cliente: it.cliente })}` : '', cols[3][0] + 2, y + 4.8);
    if (conPrecio) { doc.setTextColor(40); doc.text(pesos(it.precio_unitario) + (Number(it.iva_pct) ? ' +IVA' : ''), cols[4][0] + cols[4][1] - 2, y + 4.8, { align: 'right' }); doc.text(pesos(totalItem(it)), cols[5][0] + cols[5][1] - 2, y + 4.8, { align: 'right' }); }
    y += h; doc.line(M, y, W - M, y); });
  if (conPrecio) {
    y += 3; const linea = (k, v, negrita) => { doc.setFont('helvetica', negrita ? 'bold' : 'normal'); doc.setTextColor(40); doc.text(k, W - M - 60, y + 4.8, { align: 'right' }); doc.text(v, W - M - 2, y + 4.8, { align: 'right' }); y += 5.5; };
    if (tt.conIva) { linea('Neto', pesos(tt.neto)); linea('IVA 19%', pesos(tt.iva)); }
    linea('Total', pesos(tt.total), true);
    if (prov.pct_anticipo) { const ab = Math.round(tt.total * prov.pct_anticipo / 100); linea(`Abono ${prov.pct_anticipo}%`, pesos(ab)); linea('Saldo', pesos(tt.total - ab)); }
    doc.setFont('helvetica', 'normal');
  }
  y += 8; doc.setFontSize(9); doc.setTextColor(40);
  const pie = doc.splitTextToSize(pieTextoOC(prov, oc.codigo), A); doc.text(pie, M, y); y += pie.length * 4.6 + 4;
  doc.setFontSize(7.5); doc.setTextColor(140); doc.text(`${EMISOR.empresa} · RUT ${EMISOR.rut} · ${EMISOR.email} · ${EMISOR.telefono}`, W / 2, 268, { align: 'center' });
  const blob = doc.output('blob'); const nombre = `${oc.codigo}_${(prov.nombre || '').replace(/[^\w]+/g, '_')}.pdf`;
  if (puedeComprar() && !(oc.documentos || []).some(d => d.tipo === 'Orden de compra')) { try { await subirDocOC(oc, 'Orden de compra', new File([blob], nombre, { type: 'application/pdf' }), nombre); oc.documentos = [...(oc.documentos || []), { tipo: 'Orden de compra' }]; } catch (e) { } }
  const file = new File([blob], nombre, { type: 'application/pdf' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], title: oc.codigo, text: `Orden de compra ${oc.codigo} · Santino Design` }); return 'PDF compartido'; } catch (e) { if (e && e.name === 'AbortError') return ''; } }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nombre; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  return 'PDF descargado: ' + nombre;
}

/* ---------- Casos de servicio al cliente (tanda 28, 14-oct-2026, IDEAS I-16; Harold: "ok a las 5, constrúyelo") ----------
   Reclamos, consultas y garantías ligados al cliente y al pedido, con estado, resultado, historial de contactos (notas) y garantía
   (legal 6 meses, Santino 12 meses desde la entrega; estimada en rojo si la fecha de entrega se rellenó por defecto). La Postventa se
   crea desde el caso SOLO con "Defecto confirmado" o "Acuerdo" (migración 0033, crear_postventa_de_caso). Harold abre y cierra;
   Alexis ve un caso solo mientras tenga una Postventa pendiente ligada. Caso que lo motivó: María Jesús Canales W3116. */
const CASO_TIPOS = ['Reclamo', 'Consulta', 'Garantía'], CASO_ESTADOS = ['Abierto', 'Esperando cliente', 'Esperando revisión', 'Cerrado'];
const CASO_RESULTADOS = ['', 'Sin defecto', 'Defecto confirmado', 'Acuerdo', 'Sin respuesta'], CASO_CANALES = ['WhatsApp', 'Correo', 'Teléfono', 'Instagram', 'Presencial'];
const casoChip = e => `<span class="chip caso-${(e || '').replace(/ /g, '_')}">${esc(e || '')}</span>`;
const garantiaHtml = (g, corto) => {
  if (!g) return '';
  if (g.sin_fecha) return '<span class="falta-dato">sin fecha de entrega: no se puede calcular la garantía</span>';
  const est = g.estimada ? ' <span class="falta-dato" title="La fecha de entrega se rellenó por defecto (migración); corrígela en Editar entrega">(estimada)</span>' : '';
  const leg = `legal hasta ${fecha(g.legal_hasta)} ${g.legal_vigente ? '<span class="chip ok">VIGENTE</span>' : '<span class="chip">vencida</span>'}`;
  const san = `Santino hasta ${fecha(g.santino_hasta)} ${g.santino_vigente ? '<span class="chip ok">VIGENTE</span>' : '<span class="chip">vencida</span>'}`;
  return corto ? `entregado ${fecha(g.entregado_en)}${est} · ${leg} · ${san}` : `<div class="fila-dato"><span>Entregado</span><span>${fecha(g.entregado_en, true)}${est}</span></div><div class="fila-dato"><span>Garantía</span><span>${leg}<br>${san}</span></div>`;
};
async function vCasos() {
  const { data, error } = await sb.from('v_caso').select('*').order('estado', { ascending: true }).order('abierto_en', { ascending: false }); if (error) throw error;
  cache.casos = data || [];
  const q = location.hash.split('?')[1] || ''; const mCli = q.match(/cliente=(\d+)/); const mNuevo = q.match(/nuevo=1/);
  cache.casoFiltro = cache.casoFiltro || { estado: 'abiertos', tipo: '', texto: '', cliente: mCli ? Number(mCli[1]) : null };
  if (mCli) cache.casoFiltro.cliente = Number(mCli[1]);
  const f = cache.casoFiltro;
  const abiertos = cache.casos.filter(c => c.estado !== 'Cerrado');
  const porTipo = CASO_TIPOS.map(t => `${t}: ${abiertos.filter(c => c.tipo === t).length}`).join(' · ');
  const cuenta = campo => { const g = {}; cache.casos.filter(c => c.tipo === 'Reclamo' || c.tipo === 'Garantía').forEach(c => { const k = c[campo] ? (campo === 'modelo' ? nombreModelo(c[campo]) : codMaterial(c[campo])) : '(sin dato)'; g[k] = g[k] || { n: 0, def: 0 }; g[k].n++; if (c.resultado === 'Defecto confirmado') g[k].def++; }); return Object.entries(g).sort((a, b) => b[1].n - a[1].n).slice(0, 8); };
  const pintar = () => {
    const t = (f.texto || '').toLowerCase();
    const lista = cache.casos.filter(c => (f.estado === 'todos' || (f.estado === 'abiertos' ? c.estado !== 'Cerrado' : c.estado === f.estado)) && (!f.tipo || c.tipo === f.tipo) && (!f.cliente || c.cliente_id === f.cliente)
      && (!t || [c.codigo, c.cliente, c.pedido_numero, c.modelo, c.material, c.resumen, c.resultado, c.postventa_numero].join(' ').toLowerCase().includes(t)));
    $('#tb-casos').innerHTML = lista.map(c => `<tr class="fila-caso ${c.sin_movimiento ? 'atrasado' : ''}" data-caso="${c.id}" title="Abrir el caso">
      <td class="num"><b>${esc(c.codigo)}</b>${c.sin_movimiento ? '<div class="l2 rojo">7 días sin movimiento</div>' : ''}</td><td class="nw">${fecha(c.abierto_en)}</td><td><b>${esc(c.cliente)}</b>${c.tipo_cliente && c.tipo_cliente !== 'Persona' ? `<div class="l2">${esc(c.tipo_cliente)}</div>` : ''}</td>
      <td class="nw">${c.pedido_id ? `<a href="#/pedido/${c.pedido_id}">${esc(c.pedido_numero)}</a>` : '<span class="gris">sin pedido</span>'}${c.modelo || c.material ? `<div class="l2">${esc([nombreModelo(c.modelo), codMaterial(c.material)].filter(Boolean).join(' · '))}</div>` : ''}</td>
      <td>${esc(c.tipo)}</td><td>${casoChip(c.estado)}</td><td>${esc(c.resultado || '')}</td><td>${esc(c.resumen.length > 90 ? c.resumen.slice(0, 90) + '…' : c.resumen)}</td>
      <td class="nw">${c.notas} ${c.ultima_nota ? `<div class="l2">${fecha(c.ultima_nota)}</div>` : ''}</td><td class="nw">${c.pedido_postventa_id ? `<a href="#/pedido/${c.pedido_postventa_id}">${esc(c.postventa_numero)}</a><div class="l2">${esc(c.postventa_estado || '')}</div>` : ''}</td></tr>`).join('') || `<tr><td colspan="10" class="gris">Sin casos con ese filtro.</td></tr>`;
    $('#n-casos').textContent = `${lista.length} caso${lista.length === 1 ? '' : 's'}`;
    $$('tr.fila-caso').forEach(tr => tr.onclick = () => modalCaso(Number(tr.dataset.caso)));
  };
  const cliFiltro = f.cliente ? cache.casos.find(c => c.cliente_id === f.cliente) : null;
  app.innerHTML = barra('#/casos') + `<div class="sub filtros-v2">
      <label>Ver <select id="fc-estado"><option value="abiertos" ${f.estado === 'abiertos' ? 'selected' : ''}>Abiertos (${abiertos.length})</option>${CASO_ESTADOS.map(e => `<option value="${e}" ${f.estado === e ? 'selected' : ''}>${e}</option>`).join('')}<option value="todos" ${f.estado === 'todos' ? 'selected' : ''}>Todos (${cache.casos.length})</option></select></label>
      <label>Tipo <select id="fc-tipo"><option value="">todos</option>${CASO_TIPOS.map(t => `<option ${f.tipo === t ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      <label>Buscar <input type="search" id="fc-texto" value="${esc(f.texto || '')}" placeholder="cliente, pedido, modelo, madera, texto" style="width:230px"></label>
      ${cliFiltro ? `<span class="chip inst">Cliente: ${esc(cliFiltro.cliente)} <a href="#" id="fc-quitar-cli" title="Quitar el filtro">×</a></span>` : ''}
      <span id="n-casos" style="color:var(--gris-3)"></span><span style="color:var(--gris-3)">· abiertos: ${porTipo}</span>
      <span class="acciones-lista" style="margin-left:auto"><button class="btn" id="b-caso-nuevo">+ Caso</button></span>
    </div><div class="contenido" style="display:flex;flex-direction:column;gap:14px">
    <div class="tabla-env"><table class="lista"><thead><tr><th>Caso</th><th>Abierto</th><th>Cliente</th><th>Pedido</th><th>Tipo</th><th>Estado</th><th>Resultado</th><th>Resumen</th><th>Notas</th><th>Postventa</th></tr></thead><tbody id="tb-casos"></tbody></table></div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px">
      <section class="seccion"><h2>Reclamos y garantías por modelo <small class="gris">(todos los tiempos; "con defecto" = resultado Defecto confirmado)</small></h2><table class="lista"><thead><tr><th>Modelo</th><th>Casos</th><th>Con defecto</th></tr></thead><tbody>${cuenta('modelo').map(([k, v]) => `<tr><td>${esc(k)}</td><td>${v.n}</td><td>${v.def}</td></tr>`).join('') || '<tr><td colspan="3" class="gris">Sin reclamos todavía</td></tr>'}</tbody></table></section>
      <section class="seccion"><h2>Reclamos y garantías por madera o material</h2><table class="lista"><thead><tr><th>Material</th><th>Casos</th><th>Con defecto</th></tr></thead><tbody>${cuenta('material').map(([k, v]) => `<tr><td>${esc(k)}</td><td>${v.n}</td><td>${v.def}</td></tr>`).join('') || '<tr><td colspan="3" class="gris">Sin reclamos todavía</td></tr>'}</tbody></table></section>
    </div></div>`;
  $('#fc-estado').onchange = e => { f.estado = e.target.value; pintar(); };
  $('#fc-tipo').onchange = e => { f.tipo = e.target.value; pintar(); };
  $('#fc-texto').oninput = e => { f.texto = e.target.value; pintar(); };
  const q1 = $('#fc-quitar-cli'); if (q1) q1.onclick = ev => { ev.preventDefault(); f.cliente = null; history.replaceState(null, '', '#/casos'); vCasos(); };
  $('#b-caso-nuevo').onclick = () => formCaso({});
  pintar();
  if (mNuevo) { history.replaceState(null, '', '#/casos'); formCaso({}); }
}
/* Abrir un caso: desde la ficha del pedido (viene con pedido y cliente), desde Clientes o desde la pestaña Casos (se busca el pedido por número) */
async function formCaso(ctx) {
  modal(`<h2>Nuevo caso de servicio${ctx.numero ? ' · ' + esc(ctx.numero) + ' ' + esc(ctx.cliente || '') : ''}</h2><form id="f-caso"><div class="campos">
    ${ctx.pedido_id ? '' : `<label class="campo">Pedido (número, ej. W3116 o #2079) <input name="pedido_numero" value="${esc(ctx.pedido_numero || '')}" placeholder="vacío = caso sin pedido"></label>`}
    ${ctx.pedido_id || ctx.cliente_id ? '' : `<label class="campo">Cliente (si no hay pedido) <input name="cliente_nombre" placeholder="nombre tal como está en Clientes"></label>`}
    <label class="campo">Tipo <select name="tipo">${CASO_TIPOS.map(t => `<option>${t}</option>`).join('')}</select></label>
    <label class="campo">Canal <select name="canal">${CASO_CANALES.map(t => `<option>${t}</option>`).join('')}</select></label>
    <label class="campo">Fecha de apertura <input name="abierto_en" type="date" value="${hoyISO()}" required></label></div>
    <label class="campo" style="display:block;margin-top:8px">Qué pasa (resumen) <textarea name="resumen" rows="3" style="width:100%" required placeholder="Ej. línea de color que cruza la cubierta de lenga; la clienta cree que es el barniz"></textarea></label>
    <label class="campo" style="display:block;margin-top:8px">Primer contacto (opcional) <textarea name="nota" rows="2" style="width:100%" placeholder="Ej. se le explicó la variación natural de la lenga; se le pidió video con luz natural"></textarea></label>
    <p class="gris" style="font-size:12px;margin:6px 0">La Postventa (visita, retiro, reparación) se crea después, desde el caso, solo cuando el resultado sea "Defecto confirmado" o "Acuerdo": así no aparece en la Lista de Alexis antes de tiempo.</p>
    <div class="acciones"><button type="button" class="btn" onclick="cerrarModal()">Cancelar</button><button class="btn primario">Abrir caso</button></div></form>`);
  $('#f-caso').onsubmit = async ev => { ev.preventDefault(); const f = new FormData(ev.target); try {
    let pedido_id = ctx.pedido_id || null, cliente_id = ctx.cliente_id || null;
    const pn = (f.get('pedido_numero') || '').trim();
    if (!pedido_id && pn) { const { data } = await sb.from('pedido').select('id, cliente_id').eq('numero', pn).maybeSingle(); if (!data) throw new Error(`No existe el pedido ${pn}`); pedido_id = data.id; cliente_id = data.cliente_id; }
    const cn = (f.get('cliente_nombre') || '').trim();
    if (!pedido_id && !cliente_id && cn) { const { data } = await sb.from('cliente').select('id, nombre').ilike('nombre', `%${cn}%`).limit(2); if (!data || !data.length) throw new Error(`No encuentro al cliente "${cn}" en Clientes`); if (data.length > 1) throw new Error(`Hay más de un cliente con "${cn}": escribe el nombre completo`); cliente_id = data[0].id; }
    if (!pedido_id && !cliente_id) throw new Error('Indica el pedido o el cliente');
    const c = await rpc('crear_caso', { p: { pedido_id, cliente_id, tipo: f.get('tipo'), canal: f.get('canal'), abierto_en: f.get('abierto_en'), resumen: f.get('resumen'), nota: f.get('nota') || '' } });
    cerrarModal(); aviso(`${c.codigo} abierto`); if (location.hash.startsWith('#/casos')) await vCasos(); else if (location.hash.startsWith('#/pedido/')) await render(); modalCaso(c.id);
  } catch (e) { aviso(errorDe(e), true); } };
}
/* La ventana del caso: datos editables (Guardar queda "Guardado ✓" si no cambió nada), garantía, notas y la Postventa */
async function modalCaso(id) {
  const [{ data: c, error }, { data: notas }] = await Promise.all([sb.from('v_caso').select('*').eq('id', id).maybeSingle(), sb.from('caso_nota').select('*').eq('caso_id', id).order('fecha')]);
  if (error) return aviso(errorDe(error), true); if (!c) return aviso('El caso no está disponible en tu vista', true);
  const esOp = yo.rol === 'operacion'; const ro = esOp ? 'disabled' : '';
  const puedePV = !esOp && !c.pedido_postventa_id && ['Defecto confirmado', 'Acuerdo'].includes(c.resultado || '');
  const notaHtml = n => `<div class="caso-nota"><div class="l2">${fechaHora(n.fecha)} · ${esc(n.quien)} · ${esc(n.tipo)}</div><div>${esc(n.texto)}</div></div>`;
  modal(`<div class="cab"><h2>${esc(c.codigo)} · ${esc(c.cliente)} ${casoChip(c.estado)}${c.sin_movimiento ? ' <span class="chip atrasado">7 DÍAS SIN MOVIMIENTO</span>' : ''}</h2><button type="button" class="btn chico" id="cs-x">Cerrar ventana</button></div>
    <div class="gris" style="font-size:12px">${c.pedido_id ? `Pedido <a href="#/pedido/${c.pedido_id}" onclick="cerrarModal()">${esc(c.pedido_numero)}</a> · ${esc([c.tipo_pedido, nombreModelo(c.modelo), codMaterial(c.material), c.pieza].filter(Boolean).join(' · '))}` : 'Sin pedido ligado'}${c.cliente_telefono ? ` · <a target="_blank" href="https://wa.me/${String(c.cliente_telefono).replace(/\D/g, '')}">WhatsApp ${esc(c.cliente_telefono)}</a>` : ''} · abierto por ${esc(c.creado_por)}</div>
    ${c.pedido_id ? `<div style="font-size:13px"><b>Garantía:</b> ${garantiaHtml(c.garantia, true)}</div>` : ''}
    <div class="campos" style="align-items:end">
      <label class="campo">Tipo <select id="cs-tipo" ${ro}>${CASO_TIPOS.map(t => `<option ${t === c.tipo ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      <label class="campo">Estado <select id="cs-estado" ${ro}>${CASO_ESTADOS.map(t => `<option ${t === c.estado ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      <label class="campo">Resultado <select id="cs-resultado" ${ro}>${CASO_RESULTADOS.map(t => `<option value="${t}" ${(c.resultado || '') === t ? 'selected' : ''}>${t || '(sin resultado)'}</option>`).join('')}</select></label>
      <label class="campo">Canal <select id="cs-canal" ${ro}><option value="">-</option>${CASO_CANALES.map(t => `<option ${t === c.canal ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      <label class="campo">Abierto el <input type="date" id="cs-abierto" value="${c.abierto_en || ''}" ${ro}></label>
      ${c.cerrado_en ? `<div class="campo"><span>Cerrado el</span><b>${fecha(c.cerrado_en)}</b></div>` : ''}
    </div>
    <label class="campo">Resumen <textarea id="cs-resumen" rows="2" ${ro}>${esc(c.resumen)}</textarea></label>
    ${esOp ? '' : `<div class="acciones" style="justify-content:flex-start"><button type="button" class="btn" id="cs-guardar">Guardar</button></div>`}
    <div><h2 style="font-size:14px;margin:0 0 6px">Historial de contactos (${notas.length})</h2><div class="caso-notas">${notas.map(notaHtml).join('') || '<div class="gris" style="font-size:12px">Sin notas todavía.</div>'}</div>
      ${esOp ? '' : `<form id="f-nota" style="display:flex;gap:8px;flex-wrap:wrap;align-items:end;margin-top:8px"><label class="campo">Tipo <select name="tipo"><option>Contacto con el cliente</option><option>Revisión interna</option><option>Decisión</option></select></label><label class="campo" style="flex:1 1 260px">Nota <input name="texto" placeholder="qué se habló, qué se revisó, qué se decidió" required></label><button class="btn chico primario">Agregar nota</button></form>`}</div>
    <div class="acciones">
      ${c.pedido_postventa_id ? `<a class="btn" href="#/pedido/${c.pedido_postventa_id}" onclick="cerrarModal()">Postventa ${esc(c.postventa_numero)} · ${esc(c.postventa_estado || '')}</a>` : puedePV ? `<button type="button" class="btn primario" id="cs-pv">Crear Postventa (visita, retiro, reparación)</button>` : esOp ? '' : `<span class="gris" style="font-size:12px">La Postventa se habilita con resultado "Defecto confirmado" o "Acuerdo".</span>`}
    </div>`, 'ancha');
  const on = (sel, fn) => { const el = $(sel); if (el) el.onclick = fn; };
  on('#cs-x', cerrarModal);
  const leer = () => ({ tipo: $('#cs-tipo').value, estado: $('#cs-estado').value, resultado: $('#cs-resultado').value, canal: $('#cs-canal').value, abierto_en: $('#cs-abierto').value, resumen: $('#cs-resumen').value.trim() });
  const estadoGuardar = () => { const b = $('#cs-guardar'); if (!b) return; const v = leer(); const igual = v.tipo === c.tipo && v.estado === c.estado && v.resultado === (c.resultado || '') && v.canal === (c.canal || '') && v.abierto_en === (c.abierto_en || '') && v.resumen === c.resumen; b.disabled = igual; b.textContent = igual ? 'Guardado ✓' : 'Guardar'; b.classList.toggle('primario', !igual); };
  estadoGuardar(); ['#cs-tipo', '#cs-estado', '#cs-resultado', '#cs-canal', '#cs-abierto', '#cs-resumen'].forEach(s => { const el = $(s); if (el) el.oninput = el.onchange = estadoGuardar; });
  const refrescar = async () => { if (location.hash.startsWith('#/casos')) await vCasos(); else if (location.hash.startsWith('#/pedido/')) await render(); modalCaso(id); };
  on('#cs-guardar', async () => { try { const v = leer(); if (v.estado === 'Cerrado' && !v.resultado && !confirm('¿Cerrar el caso sin resultado? Mejor elige uno (sin defecto, defecto confirmado, acuerdo, sin respuesta).')) return; await rpc('actualizar_caso', { p_id: id, p_cambios: v }); aviso('Caso guardado'); refrescar(); } catch (e) { aviso(errorDe(e), true); } });
  const fn = $('#f-nota'); if (fn) fn.onsubmit = async ev => { ev.preventDefault(); const f = new FormData(ev.target); try { await rpc('agregar_nota_caso', { p_id: id, p_tipo: f.get('tipo'), p_texto: f.get('texto') }); aviso('Nota agregada'); refrescar(); } catch (e) { aviso(errorDe(e), true); } };
  on('#cs-pv', () => formPostventaDeCaso(c, refrescar));
}
function formPostventaDeCaso(c, despues) {
  modal(`<h2>Postventa desde ${esc(c.codigo)} · ${esc(c.cliente)}</h2><div class="gris" style="font-size:12px">Resultado: ${esc(c.resultado)}. Se crea un pedido POSTVENTA ligado a ${esc(c.pedido_numero || 'este caso')} con el movimiento en la fecha indicada; desde ahí Alexis lo ve en su Lista. Si lleva una pieza de taller (cubierta nueva, repuesto), se agrega después en su ficha.</div><form id="f-pv"><div class="campos">
    <label class="campo">Qué hay que hacer <select name="tipo">${['Visita técnica', 'Retiro en cliente', 'Entrega', 'Instalación', 'Otro'].map(t => `<option>${t}</option>`).join('')}</select></label>
    <label class="campo">Fecha <input type="date" name="fecha" required value="${fechaDefecto || hoyISO(1)}"></label>
    <label class="campo">Dirección (vacía = la del pedido) <input name="direccion"></label>
    <label class="campo">Valor a cobrar (0 = sin costo) <input name="valor" type="number" value="0" min="0"></label></div>
    <label class="campo" style="display:block;margin-top:8px">Qué se hace o se revisa <textarea name="nota" rows="2" style="width:100%" required>${esc(c.resumen)}</textarea></label>
    <div class="acciones"><button type="button" class="btn" onclick="cerrarModal()">Cancelar</button><button class="btn primario">Crear postventa</button></div></form>`);
  $('#f-pv').onsubmit = async ev => { ev.preventDefault(); const f = new FormData(ev.target); try {
    const r = await rpc('crear_postventa_de_caso', { p_caso_id: c.id, p_tipo_mov: f.get('tipo'), p_fecha: f.get('fecha'), p_direccion: f.get('direccion') || null, p_nota: f.get('nota'), p_valor: Number(f.get('valor') || 0) });
    cerrarModal(); aviso(`Postventa ${r.numero} creada y ligada al caso`); despues();
  } catch (e) { aviso(errorDe(e), true); } };
}
/* Bloque de casos en la ficha del pedido */
function casosFichaHtml(casos, esOp) {
  const fila = c => `<div class="doc caso-fila" data-caso="${c.id}" style="cursor:pointer"><span><b>${esc(c.codigo)}</b> · ${esc(c.tipo)} ${casoChip(c.estado)}${c.resultado ? ' · ' + esc(c.resultado) : ''}<div class="tipo">abierto ${fecha(c.abierto_en)} · ${esc(c.resumen.length > 110 ? c.resumen.slice(0, 110) + '…' : c.resumen)}${c.postventa_numero ? ' · postventa ' + esc(c.postventa_numero) : ''}</div></span><span class="btn chico">Abrir</span></div>`;
  return `<section class="seccion"><div class="cab"><h2>Casos de servicio${casos.length ? ` (${casos.length})` : ''}</h2>${esOp ? '' : '<button class="btn chico borde" id="b-caso">+ Caso</button>'}</div><div class="docs">${casos.map(fila).join('') || '<div class="gris" style="font-size:13px">Sin reclamos ni consultas registradas.</div>'}</div></section>`;
}
/* Porcentaje abonado, sutil (Harold 14-oct: "quiero que me diga el %, algo sutil para no manchar la ficha") */
const cuentasOpciones = () => Object.values((cache.codigos || {}).cuenta || {}).sort((a, b) => (a.orden || 0) - (b.orden || 0)).map(c => `<option value="${esc(c.codigo)}">${esc(c.nombre)}</option>`).join('');
const cuentaNombre = c => c ? ((codigoDe('cuenta', c) || {}).abreviatura || c) : '-';
/* Origen detallado (T-314, 14-oct): código del mensaje de WhatsApp, red y campaña; nunca inventado (vacío = no se sabe) */
const ORIGEN_REDES = ['', 'ig', 'fb', 'meta', 'google', 'tiktok', 'organico', 'directo', 'desconocido'];
const NOMBRE_RED = { ig: 'Instagram', fb: 'Facebook', meta: 'Meta (ig o fb)', google: 'Google', tiktok: 'TikTok', organico: 'Orgánico', directo: 'Directo', desconocido: 'Desconocido' };
const camposOrigenHtml = (p = {}) => `<label class="campo">Código del mensaje (WhatsApp) <input name="origen_codigo" value="${esc(p.origen_codigo || '')}" placeholder="ej. [A-anuncio-medida] o pega el mensaje" title="Pega el mensaje del cliente: el código [X-...|red] se detecta solo"></label>
    <label class="campo">Red de donde vino <select name="origen_red">${ORIGEN_REDES.map(r => `<option value="${r}" ${(p.origen_red || '') === r ? 'selected' : ''}>${r ? NOMBRE_RED[r] : '(no se sabe)'}</option>`).join('')}</select></label>
    <label class="campo">Campaña (opcional) <input name="origen_campana" value="${esc(p.origen_campana || '')}" placeholder="ej. Böll muebles a medida A/B"></label>`;
function activarDeteccionCodigo(form) {
  const inp = form.querySelector('input[name=origen_codigo]'); if (!inp) return;
  inp.onblur = inp.onchange = () => { const m = inp.value.match(/\[([A-Za-z]-[^\]|]+)(?:\|(ig|fb|meta|google|tiktok))?\]/); if (!m) return; inp.value = '[' + m[1] + ']'; const sel = form.querySelector('select[name=origen_red]'); if (m[2] && sel && !sel.value) sel.value = m[2].toLowerCase(); };
}
const leerOrigen = f => ({ origen_codigo: (f.get('origen_codigo') || '').trim() || null, origen_red: f.get('origen_red') || null, origen_campana: (f.get('origen_campana') || '').trim() || null });
const origenTxt = p => [p.origen, p.origen_codigo, p.origen_red ? NOMBRE_RED[p.origen_red] || p.origen_red : '', p.origen_campana].filter(Boolean).join(' · ');
const pctAbono = p => { const t = Number(p.total || 0), a = Number(p.abonado || 0); if (!t) return ''; const pc = Math.round(a / t * 100); return `<small class="pct-abono" title="Porcentaje del total abonado">${pc}% del total</small>`; };

/* ---------- Títulos de columna que siguen al bajar (Harold 12-oct, tanda 20) ----------
   Solo los títulos de columna, pegados bajo la barra; los filtros y leyendas se van con el scroll.
   position:sticky no sirve aquí porque .tabla-env tiene scroll horizontal (es un contenedor de scroll y el sticky
   se queda dentro de él), así que los th se desplazan con transform según el scroll de la página. */
(() => {
  let pedido = false;
  const ajustar = () => {
    pedido = false;
    const b = document.querySelector('.barra'); const tope = b ? b.getBoundingClientRect().bottom : 0;
    document.querySelectorAll('.tabla-env > table.lista > thead').forEach(th => {
      const t = th.parentElement.getBoundingClientRect(); const h = th.getBoundingClientRect().height;
      const d = t.top < tope && t.bottom - h > tope ? Math.round(tope - t.top) : 0;
      if (String(d) === th.dataset.desp) return;
      th.dataset.desp = String(d);
      const tr = d ? `translateY(${d}px)` : '';
      th.querySelectorAll('th').forEach(c => { c.style.transform = tr; });
      th.classList.toggle('flotando', d > 0);
    });
  };
  const programar = () => { if (!pedido) { pedido = true; requestAnimationFrame(ajustar); } };
  addEventListener('scroll', programar, { passive: true }); addEventListener('resize', programar);
  const raiz = document.getElementById('app'); if (raiz) new MutationObserver(programar).observe(raiz, { childList: true, subtree: true });
})();
