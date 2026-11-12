/* Santino Pedidos · pestaña Otros > Vehículos (10-nov-2026, migración 0101).
   Harold: "ayer se nos perdieron [los papeles]. No teníamos la documentación, no teníamos cómo mostrarla. Hay que hacer un registro
   por cada vehículo de qué documentación hay ... cuándo vencen, y que nos salte una alerta ... y un calendario de mantenciones".
   Documentos obligatorios: SOAP, Permiso de circulación, Revisión técnica, Gases y Padrón (este no vence). Harold y Alexis ven,
   suben y registran; borrar es solo de Harold. Archivos en documentos/vehiculos/<PATENTE>/<AÑO o Permanentes>/; el espejo los copia
   ordenados a OneDrive. Aviso por correo los lunes (función vehiculos-avisos) y número rojo en la pestaña Otros.
   Se carga antes de app.js y usa sus utilidades (sb, yo, $, esc, aviso, modal, fecha, barra…) en tiempo de ejecución. */
'use strict';

const VEH = { vista: 'documentos', alertas: null };
const VEH_REQ = ['SOAP', 'Permiso de circulación', 'Revisión técnica', 'Gases', 'Padrón'];
const VEH_TIPOS = [...VEH_REQ, 'Homologación', 'Otro'];
const VEH_CORTO = { 'SOAP': 'SOAP', 'Permiso de circulación': 'Permiso', 'Revisión técnica': 'Rev. técnica', 'Gases': 'Gases', 'Padrón': 'Padrón', 'Homologación': 'Homologación', 'Otro': 'Otro' };
const VEH_COD = { 'SOAP': 'SOAP', 'Padrón': 'PADRON', 'Permiso de circulación': 'PERMISO', 'Revisión técnica': 'RT', 'Gases': 'GASES', 'Homologación': 'HOMOLOGACION', 'Otro': 'OTRO' };
const VEH_MANT = ['Cambio de aceite y filtro de aceite', 'Filtro de aire', 'Filtro de combustible', 'Frenos (pastillas y líquido)', 'Rotación y revisión de neumáticos', 'Correa o cadena de distribución', 'Batería', 'Alineación y balanceo', 'Otro'];
const vehFechaL = s => { if (!s) return '-'; const d = new Date(s + 'T12:00:00'); return `${String(d.getDate()).padStart(2, '0')}-${MESES[d.getMonth()]}-${d.getFullYear()}`; };
const vehKm = n => n == null ? '-' : Number(n).toLocaleString('es-CL') + ' km';
const vehEsAdmin = () => yo && yo.rol === 'admin';
function vehChip(estado) {
  const c = { 'VENCIDO': 'urgente', 'VENCIDA': 'urgente', 'POR VENCER': 'saldo', 'PRÓXIMA': 'saldo', 'AL DÍA': 'ok', 'FALTA': 'veh-falta', 'SIN REGISTRO': 'veh-falta' }[estado] || '';
  return `<span class="chip ${c}">${esc(estado)}</span>`;
}
const vehMesRT = p => ({ 9: 1, 0: 2, 1: 4, 2: 5, 3: 6, 4: 7, 5: 8, 6: 9, 7: 10, 8: 11 })[p.slice(-1)];

/* ---------- datos ---------- */
async function vehCargar() {
  const q = async p => { const { data, error } = await p; if (error) throw error; return data || []; };
  const [veh, est, docs, mest, mant] = await Promise.all([
    q(sb.from('vehiculo').select('*').eq('activo', true).order('nombre_corto')),   // vendidos fuera de la app (Harold 10-nov): sus papeles quedan en OneDrive, 10_Vehiculos/Vendidos/
    q(sb.from('vehiculo_v_documentos').select('*').order('orden')),
    q(sb.from('vehiculo_documento').select('*').order('vence_en', { ascending: false, nullsFirst: false }).order('id', { ascending: false })),
    q(sb.from('vehiculo_v_mantencion').select('*').order('plan_id')),
    q(sb.from('vehiculo_mantencion').select('*').order('fecha', { ascending: false }).order('id', { ascending: false }))
  ]);
  const D = { veh, est, docs, mest, mant };
  VEH.alertas = vehContar(D); vehPintarBadge();
  return D;
}
function vehContar(D) { return D.est.filter(e => e.estado === 'VENCIDO' || e.estado === 'POR VENCER').length + D.mest.filter(m => m.estado === 'VENCIDA').length; }
/* Número rojo en la pestaña Otros: se calcula al entrar a la app y cada vez que se abre el módulo */
async function vehContarAlertas() {
  try {
    const [a, b] = await Promise.all([sb.from('vehiculo_v_documentos').select('estado').in('estado', ['VENCIDO', 'POR VENCER']), sb.from('vehiculo_v_mantencion').select('estado').eq('estado', 'VENCIDA')]);
    if (a.error || b.error) return; VEH.alertas = (a.data || []).length + (b.data || []).length; vehPintarBadge();
  } catch (e) { /* sin módulo o sin permiso: no muestra número */ }
}
const vehEtiquetaOtros = () => 'Otros' + (VEH.alertas ? ` <span class="badge-alerta" title="Documentos de vehículos vencidos o por vencer y mantenciones vencidas">${VEH.alertas}</span>` : '');
function vehPintarBadge() { const a = document.querySelector('.nav a[href="#/otros"]'); if (a) a.innerHTML = vehEtiquetaOtros(); }

async function vehAbrirPdf(path) {
  const w = window.open('', '_blank');   // se abre antes del await para que el navegador no lo bloquee
  const { data, error } = await sb.storage.from('documentos').createSignedUrl(path, 900);
  if (error) { if (w) w.close(); return aviso(errorDe(error), true); }
  if (w) w.location = data.signedUrl; else location.href = data.signedUrl;
}

/* ---------- Otros (módulos) ---------- */
async function vOtros() {
  app.innerHTML = barra('#/otros') + `<div class="contenido"><div class="cargando">Cargando…</div></div>`;
  let resumen = '';
  try {
    const D = await vehCargar();
    const n = e => D.est.filter(x => x.estado === e).length;
    resumen = [n('VENCIDO') && `<span class="chip urgente">${n('VENCIDO')} vencido${n('VENCIDO') > 1 ? 's' : ''}</span>`, n('POR VENCER') && `<span class="chip saldo">${n('POR VENCER')} por vencer</span>`, n('FALTA') && `<span class="chip veh-falta">${n('FALTA')} sin documento</span>`].filter(Boolean).join(' ') || '<span class="chip ok">todo al día</span>';
    resumen = `<div class="gris">${D.veh.filter(v => v.activo).length} vehículos</div><div>${resumen}</div>`;
  } catch (e) { resumen = `<div class="gris">${esc(errorDe(e))}</div>`; }
  $('.contenido').innerHTML = `<div class="otros-modulos">
    <a class="modulo" href="#/otros/vehiculos"><div class="modulo-t">🚚 Vehículos</div><div class="gris">Papeles de cada vehículo, vencimientos, calendario y mantenciones</div>${resumen}</a>
  </div>`;
}

/* ---------- Vehículos ---------- */
async function vVehiculos() {
  const D = await vehCargar();
  const tabs = [['documentos', 'Documentos'], ['calendario', 'Calendario'], ['mantenciones', 'Mantenciones'], ['datos', 'Datos de cada vehículo']];
  app.innerHTML = barra('#/otros') + `<div class="sub"><a href="#/otros">Otros</a> › Vehículos
      <span class="espacio"></span>${tabs.map(([k, t]) => `<button class="btn chico ${VEH.vista === k ? 'primario' : 'borde'}" data-vista="${k}">${t}</button>`).join('')}
      <button class="btn chico primario" id="veh-subir">+ Subir documento</button></div>
    <div class="contenido" id="veh-cont"></div>`;
  $$('[data-vista]').forEach(b => b.onclick = () => { VEH.vista = b.dataset.vista; vVehiculos(); });
  $('#veh-subir').onclick = () => vehFormDoc(D, {});
  const cont = $('#veh-cont');
  if (VEH.vista === 'calendario') cont.innerHTML = vehCalendario(D);
  else if (VEH.vista === 'mantenciones') cont.innerHTML = vehMantenciones(D);
  else if (VEH.vista === 'datos') cont.innerHTML = vehDatos(D);
  else cont.innerHTML = vehDocumentos(D);
  vehEventos(D, cont);
}

function vehAlertasHtml(D) {
  const filas = [];
  const nom = id => { const v = D.veh.find(x => x.id === id); return v ? `<b>${esc(v.nombre_corto)}</b> ${esc(v.patente)}` : ''; };
  for (const e of D.est.filter(x => x.estado === 'VENCIDO')) filas.push(`<li>${vehChip('VENCIDO')} ${nom(e.vehiculo_id)} · ${esc(e.tipo)} venció el ${vehFechaL(e.vence_en)}${e.tipo === 'Revisión técnica' ? ` (a esta patente le toca en ${MESES_L[vehMesRT(e.patente) - 1]})` : ''}</li>`);
  for (const e of D.est.filter(x => x.estado === 'POR VENCER')) filas.push(`<li>${vehChip('POR VENCER')} ${nom(e.vehiculo_id)} · ${esc(e.tipo)} vence el ${vehFechaL(e.vence_en)} (en ${e.dias} días)</li>`);
  for (const m of D.mest.filter(x => x.estado === 'VENCIDA')) filas.push(`<li>${vehChip('VENCIDA')} ${nom(m.vehiculo_id)} · ${esc(m.tipo)}</li>`);
  const faltan = D.est.filter(x => x.estado === 'FALTA');
  if (faltan.length) filas.push(`<li>${vehChip('FALTA')} ${faltan.map(e => `${nom(e.vehiculo_id)} ${esc(VEH_CORTO[e.tipo])}`).join(' · ')}</li>`);
  return filas.length ? `<div class="seccion veh-alertas"><h2>Qué hay que resolver</h2><ul>${filas.join('')}</ul></div>` : `<div class="seccion"><h2>Todo al día</h2></div>`;
}

function vehDocumentos(D) {
  const act = D.veh.filter(v => v.activo);
  const celda = (v, tipo) => {
    const e = D.est.find(x => x.vehiculo_id === v.id && x.tipo === tipo); if (!e) return '<td>-</td>';
    const fechaTxt = e.estado === 'FALTA' ? (tipo === 'Revisión técnica' || tipo === 'Gases' ? `<div class="l2">le toca en ${MESES_L[vehMesRT(v.patente) - 1]}</div>` : '') : e.vence_en ? `<div class="l2">vence ${vehFechaL(e.vence_en)}</div>` : '<div class="l2">no vence</div>';
    return `<td class="veh-celda" data-celda="${v.id}|${esc(tipo)}" title="Ver historial y subir">${vehChip(e.estado)}${e.storage_path ? ' 📄' : ''}${fechaTxt}</td>`;
  };
  return `${vehAlertasHtml(D)}
  <div class="seccion"><div class="cab"><h2>Documentos por vehículo</h2><span class="gris">Toca una celda para ver el PDF, el historial o subir el nuevo</span></div>
  <div class="tabla-env"><table class="lista veh-tabla"><thead><tr><th>Vehículo</th>${VEH_REQ.map(t => `<th>${VEH_CORTO[t]}</th>`).join('')}<th></th></tr></thead><tbody>
  ${act.map(v => `<tr><td class="nw"><b>${esc(v.nombre_corto)}</b> <span class="mono">${esc(v.patente)}</span><div class="l2">${esc(v.marca || '')} ${esc(v.modelo || '')} ${v.anio || ''}</div></td>${VEH_REQ.map(t => celda(v, t)).join('')}
    <td><button class="btn chico borde" data-papeles="${v.id}">Mostrar papeles</button></td></tr>`).join('')}
  </tbody></table></div></div>`;
}

/* Próximos 12 meses: vencimientos de documentos y mantenciones por fecha. Lo vencido se muestra en el mes actual. */
function vehCalendario(D) {
  const hoy = hoyISO(), ini = new Date(hoy.slice(0, 7) + '-01T12:00:00');
  const meses = Array.from({ length: 12 }, (_, i) => { const d = new Date(ini); d.setMonth(d.getMonth() + i); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; });
  const act = D.veh.filter(v => v.activo);
  const items = (v, mes) => {
    const out = [];
    for (const e of D.est.filter(x => x.vehiculo_id === v.id)) {
      if (e.vence_en) { const m = e.vence_en.slice(0, 7); if (m === mes || (mes === meses[0] && m < mes)) out.push([e.estado === 'VENCIDO' ? 'urgente' : e.estado === 'POR VENCER' ? 'saldo' : 'veh-prop', `${VEH_CORTO[e.tipo]} ${e.estado === 'VENCIDO' ? 'vencido' : 'vence ' + fecha(e.vence_en)}`]); }
      else if (e.estado === 'FALTA' && (e.tipo === 'Revisión técnica' || e.tipo === 'Gases')) { const mm = vehMesRT(v.patente); if (mm && Number(mes.slice(5)) === mm) out.push(['veh-falta', `${VEH_CORTO[e.tipo]}: le toca`]); }
    }
    for (const m of D.mest.filter(x => x.vehiculo_id === v.id && x.proxima_fecha)) { const mm = m.proxima_fecha.slice(0, 7); if (mm === mes || (mes === meses[0] && mm < mes)) out.push([m.estado === 'VENCIDA' ? 'urgente' : 'inst', `🔧 ${m.tipo}`]); }
    return out.map(([c, t]) => `<span class="chip ${c}">${esc(t)}</span>`).join('');
  };
  return `<div class="seccion"><div class="cab"><h2>Calendario de los próximos 12 meses</h2><span class="gris">Rojo vencido · ámbar vence en 30 días · azul programado · 🔧 mantención. La revisión técnica toca según el último dígito de la patente.</span></div>
  <div class="tabla-env"><table class="lista veh-cal"><thead><tr><th>Vehículo</th>${meses.map(m => `<th>${MESES[Number(m.slice(5)) - 1]} ${m.slice(2, 4)}</th>`).join('')}</tr></thead><tbody>
  ${act.map(v => `<tr><td class="nw"><b>${esc(v.nombre_corto)}</b><div class="l2 mono">${esc(v.patente)}</div></td>${meses.map(m => `<td class="veh-mes">${items(v, m)}</td>`).join('')}</tr>`).join('')}
  </tbody></table></div><div class="gris">El permiso de circulación y el SOAP vencen el 31 de marzo de cada año: se pagan en marzo.</div></div>`;
}

function vehMantenciones(D) {
  const act = D.veh.filter(v => v.activo);
  return act.map(v => {
    const plan = D.mest.filter(m => m.vehiculo_id === v.id), hist = D.mant.filter(m => m.vehiculo_id === v.id).slice(0, 8);
    return `<div class="seccion"><div class="cab"><h2>${esc(v.nombre_corto)} <span class="mono gris">${esc(v.patente)}</span></h2>
      <span>Kilometraje: <b>${vehKm(v.km_actual)}</b>${v.km_actual_en ? ` <span class="gris">al ${fecha(v.km_actual_en)}</span>` : ''} <button class="btn chico borde" data-km="${v.id}">Actualizar km</button> <button class="btn chico primario" data-mant="${v.id}">+ Registrar mantención</button></span></div>
      <div class="tabla-env"><table class="lista"><thead><tr><th>Mantención</th><th>Cada</th><th>Última</th><th>Próxima</th><th>Estado</th></tr></thead><tbody>
      ${plan.map(m => `<tr><td>${esc(m.tipo)}${m.notas ? `<div class="l2">${esc(m.notas)}</div>` : ''}</td>
        <td class="nw">${[m.cada_km && vehKm(m.cada_km), m.cada_meses && m.cada_meses + ' meses'].filter(Boolean).join(' o ')} ${m.propuesta ? '<span class="chip veh-prop" title="Intervalo genérico propuesto: confirmarlo con el manual o el mecánico">propuesta</span>' : ''} <button class="btn chico" data-plan="${m.plan_id}" title="Cambiar el intervalo">✎</button></td>
        <td class="nw">${m.ultima_fecha ? fecha(m.ultima_fecha) + (m.ultimo_km != null ? `<div class="l2">${vehKm(m.ultimo_km)}</div>` : '') : '<span class="gris">sin registro</span>'}</td>
        <td class="nw">${m.proxima_fecha ? fecha(m.proxima_fecha) : '-'}${m.proximo_km != null ? `<div class="l2">o a los ${vehKm(m.proximo_km)}</div>` : ''}</td>
        <td>${vehChip(m.estado)}</td></tr>`).join('')}
      </tbody></table></div>
      ${hist.length ? `<div class="historial">${hist.map(h => `<div><time>${vehFechaL(h.fecha)}</time><span>${esc(h.tipo)}${h.km != null ? ` · ${vehKm(h.km)}` : ''}${h.taller ? ` · ${esc(h.taller)}` : ''}${h.costo ? ` · ${pesos(h.costo)}` : ''}${h.notas ? ` · ${esc(h.notas)}` : ''}${h.storage_path ? ` <a href="#" data-pdf="${esc(h.storage_path)}">📄</a>` : ''}</span>${vehEsAdmin() ? ` <button class="btn chico" data-borra-mant="${h.id}" title="Borrar este registro">✕</button>` : ''}</div>`).join('')}</div>` : '<div class="gris">Sin mantenciones registradas todavía.</div>'}
    </div>`;
  }).join('<div style="height:12px"></div>');
}

function vehDatos(D) {
  const campo = (t, v) => `<div class="fila-dato"><span>${t}</span><span>${esc(v == null || v === '' ? '-' : v)}</span></div>`;
  return `<div class="veh-fichas">${D.veh.map(v => `<div class="seccion ${v.activo ? '' : 'inactivo'}"><div class="cab"><h2>${esc(v.nombre_corto)} <span class="mono">${esc(v.patente)}${v.dv ? '-' + esc(v.dv) : ''}</span>${v.activo ? '' : ' <span class="chip">inactivo</span>'}</h2><button class="btn chico borde" data-editar="${v.id}">Editar</button></div>
    ${campo('Tipo', v.tipo)}${campo('Marca y modelo', `${v.marca || ''} ${v.modelo || ''}`.trim())}${campo('Año', v.anio)}${campo('Color', v.color)}${campo('Combustible', v.combustible)}
    ${campo('N° motor', v.nro_motor)}${campo('N° chasis', v.nro_chasis)}${campo('Propietario', v.propietario)}${campo('RUT propietario', v.propietario_rut)}
    ${campo('Revisión técnica le toca en', MESES_L[vehMesRT(v.patente) - 1])}
    ${v.notas ? `<div class="falta-dato">${esc(v.notas)}</div>` : ''}
    <div class="docs">${D.docs.filter(d => d.vehiculo_id === v.id && (d.tipo === 'Homologación' || d.tipo === 'Otro')).map(d => `<div class="doc"><span>${esc(d.tipo)} · ${esc(d.detalle || '')}</span>${d.storage_path ? `<button class="btn chico" data-pdf="${esc(d.storage_path)}">Ver</button>` : ''}</div>`).join('')}</div>
  </div>`).join('')}${vehEsAdmin() ? `<div class="seccion"><button class="btn borde" data-editar="nuevo">+ Agregar vehículo</button></div>` : ''}</div>`;
}

function vehEventos(D, cont) {
  $$('[data-pdf]', cont).forEach(b => b.onclick = ev => { ev.preventDefault(); vehAbrirPdf(b.dataset.pdf); });
  $$('[data-celda]', cont).forEach(td => td.onclick = () => { const [id, tipo] = td.dataset.celda.split('|'); vehHistorial(D, Number(id), tipo); });
  $$('[data-papeles]', cont).forEach(b => b.onclick = () => vehPapeles(D, Number(b.dataset.papeles)));
  $$('[data-km]', cont).forEach(b => b.onclick = () => vehFormKm(D.veh.find(v => v.id === Number(b.dataset.km))));
  $$('[data-mant]', cont).forEach(b => b.onclick = () => vehFormMant(D, Number(b.dataset.mant)));
  $$('[data-plan]', cont).forEach(b => b.onclick = () => vehFormPlan(D.mest.find(m => m.plan_id === Number(b.dataset.plan))));
  $$('[data-editar]', cont).forEach(b => b.onclick = () => vehFormVehiculo(b.dataset.editar === 'nuevo' ? null : D.veh.find(v => v.id === Number(b.dataset.editar))));
  $$('[data-borra-mant]', cont).forEach(b => b.onclick = async () => {
    if (!confirm('¿Borrar este registro de mantención?')) return;
    const { error } = await sb.from('vehiculo_mantencion').delete().eq('id', Number(b.dataset.borraMant)); if (error) return aviso(errorDe(error), true);
    aviso('Registro borrado'); vVehiculos();
  });
}

/* Para un control: todos los papeles vigentes del vehículo en botones grandes */
function vehPapeles(D, id) {
  const v = D.veh.find(x => x.id === id);
  const lista = D.est.filter(e => e.vehiculo_id === id);
  modal(`<h2>Papeles ${esc(v.nombre_corto)} ${esc(v.patente)}</h2>
    <div class="veh-papeles">${lista.map(e => e.storage_path
      ? `<button class="btn ${e.estado === 'VENCIDO' ? 'peligro' : 'primario'}" data-pdf="${esc(e.storage_path)}">${esc(e.tipo)}${e.vence_en ? ` · vence ${vehFechaL(e.vence_en)}` : ''}${e.estado === 'VENCIDO' ? ' · VENCIDO' : ''}</button>`
      : `<div class="btn" style="opacity:.6">${esc(e.tipo)}: no está en el sistema</div>`).join('')}</div>
    <div class="acciones"><button class="btn" id="veh-cerrar">Cerrar</button></div>`);
  $$('#modal [data-pdf]').forEach(b => b.onclick = () => vehAbrirPdf(b.dataset.pdf));
  $('#veh-cerrar').onclick = cerrarModal;
}

function vehHistorial(D, id, tipo) {
  const v = D.veh.find(x => x.id === id);
  const docs = D.docs.filter(d => d.vehiculo_id === id && d.tipo === tipo);
  modal(`<h2>${esc(tipo)} · ${esc(v.nombre_corto)} ${esc(v.patente)}</h2>
    <div class="docs">${docs.length ? docs.map(d => `<div class="doc"><span>${d.periodo ? `<b>${d.periodo}</b> · ` : ''}${d.emitido_en ? 'desde ' + vehFechaL(d.emitido_en) : ''}${d.vence_en ? ' · vence ' + vehFechaL(d.vence_en) : ''}<div class="tipo">${esc(d.detalle || '')}</div></span>
      <span style="display:flex;gap:6px">${d.storage_path ? `<button class="btn chico primario" data-pdf="${esc(d.storage_path)}">Ver PDF</button>` : '<span class="gris">sin PDF</span>'}${vehEsAdmin() ? `<button class="btn chico peligro" data-borra-doc="${d.id}">Borrar</button>` : ''}</span></div>`).join('') : '<div class="gris">No hay ninguno registrado.</div>'}</div>
    <div class="acciones"><button class="btn" id="veh-cerrar">Cerrar</button><button class="btn primario" id="veh-nuevo">+ Subir ${esc(VEH_CORTO[tipo])} nuevo</button></div>`, 'ancha');
  $$('#modal [data-pdf]').forEach(b => b.onclick = () => vehAbrirPdf(b.dataset.pdf));
  $$('#modal [data-borra-doc]').forEach(b => b.onclick = async () => {
    if (!confirm('¿Borrar este registro? El PDF queda guardado en el respaldo de OneDrive.')) return;
    const { error } = await sb.from('vehiculo_documento').delete().eq('id', Number(b.dataset.borraDoc)); if (error) return aviso(errorDe(error), true);
    cerrarModal(); aviso('Registro borrado'); vVehiculos();
  });
  $('#veh-cerrar').onclick = cerrarModal;
  $('#veh-nuevo').onclick = () => vehFormDoc(D, { vehiculo_id: id, tipo });
}

/* Subir documento. Si es revisión técnica, el mismo PDF de la planta suele traer el certificado de gases: se registran las dos filas. */
function vehFormDoc(D, pre) {
  const act = D.veh.filter(v => v.activo), anio = new Date().getFullYear();
  modal(`<h2>Subir documento</h2><form id="f-vdoc" class="campos">
    <label>Vehículo <select name="vehiculo_id" required>${act.map(v => `<option value="${v.id}" ${pre.vehiculo_id === v.id ? 'selected' : ''}>${esc(v.nombre_corto)} ${esc(v.patente)}</option>`).join('')}</select></label>
    <label>Documento <select name="tipo" required>${VEH_TIPOS.map(t => `<option ${pre.tipo === t ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
    <label>Año del documento <input type="number" name="periodo" value="${anio}" min="2000" max="2100"></label>
    <label>Desde (fecha de emisión o pago) <input type="date" name="emitido_en"></label>
    <label>Vence <input type="date" name="vence_en"><span class="l2">Permiso y SOAP: 31 de marzo del año siguiente. Revisión técnica: el último día del mes que dice «válido hasta».</span></label>
    <label class="veh-gases">El mismo PDF trae el certificado de gases, que vence <input type="date" name="gases_vence"><span class="l2">Déjalo vacío si no viene.</span></label>
    <label>Detalle <input name="detalle" placeholder="Aseguradora y póliza, planta, municipalidad"></label>
    <label>Archivo (PDF o foto) <input type="file" name="archivo" accept="application/pdf,image/*" required></label>
    <div class="acciones"><button type="button" class="btn" id="veh-cerrar">Cancelar</button><button class="btn primario" type="submit">Guardar</button></div></form>`, 'ancha');
  const f = $('#f-vdoc'), tipoSel = f.tipo;
  const ajustar = () => { $('.veh-gases', f).style.display = tipoSel.value === 'Revisión técnica' ? '' : 'none'; const sinVence = ['Padrón', 'Homologación'].includes(tipoSel.value); f.vence_en.disabled = sinVence; f.periodo.disabled = sinVence; };
  tipoSel.onchange = ajustar; ajustar();
  f.emitido_en.onchange = () => {
    if (!f.vence_en.value && (tipoSel.value === 'SOAP' || tipoSel.value === 'Permiso de circulación') && f.emitido_en.value) { const y = Number(f.emitido_en.value.slice(0, 4)) + (f.emitido_en.value.slice(5, 7) > '03' ? 1 : 0); f.vence_en.value = `${y}-03-31`; }
  };
  $('#veh-cerrar').onclick = cerrarModal;
  f.onsubmit = async ev => {
    ev.preventDefault(); const btn = $('button[type=submit]', f); btn.disabled = true;
    try {
      const v = act.find(x => x.id === Number(f.vehiculo_id.value)), tipo = tipoSel.value, a = f.archivo.files[0];
      const permanente = tipo === 'Padrón' || tipo === 'Homologación';
      const periodo = permanente ? null : Number(f.periodo.value) || null;
      const emit = f.emitido_en.value || null, vence = permanente ? null : (f.vence_en.value || null), gasV = tipo === 'Revisión técnica' ? (f.gases_vence.value || null) : null;
      if (!permanente && tipo !== 'Otro' && !vence) throw new Error('Falta la fecha en que vence');
      const ext = (a.name.match(/\.[a-z0-9]+$/i) || ['.pdf'])[0].toLowerCase();
      const cod = gasV ? 'RT_Y_GASES' : VEH_COD[tipo];
      const base = permanente ? `vehiculos/${v.patente}/Permanentes/${cod}_${v.patente}` : `vehiculos/${v.patente}/${periodo || (emit || hoyISO()).slice(0, 4)}/${cod}_${emit || periodo || hoyISO()}_${v.patente}`;
      let path = base + ext, n = 1, r;
      while (true) {
        r = await sb.storage.from('documentos').upload(path, a, { contentType: a.type || 'application/pdf', upsert: false });
        if (!r.error) break;
        if (!/exists|duplicate/i.test(r.error.message || '') || n > 8) throw r.error;
        n++; path = `${base}_v${n}${ext}`;
      }
      const fila = { vehiculo_id: v.id, tipo, periodo, emitido_en: emit, vence_en: vence, detalle: f.detalle.value.trim() || null, storage_path: path, archivo_nombre: path.split('/').pop() };
      const filas = [fila]; if (gasV) filas.push({ ...fila, tipo: 'Gases', vence_en: gasV });
      const { error } = await sb.from('vehiculo_documento').insert(filas); if (error) throw error;
      cerrarModal(); aviso(gasV ? 'Revisión técnica y gases guardados' : tipo + ' guardado'); vVehiculos();
    } catch (e) { btn.disabled = false; aviso(errorDe(e), true); }
  };
}

function vehFormKm(v) {
  modal(`<h2>Kilometraje ${esc(v.nombre_corto)} ${esc(v.patente)}</h2><form id="f-vkm" class="campos">
    <label>Kilómetros que marca hoy <input type="number" name="km" min="0" value="${v.km_actual || ''}" required></label>
    <div class="acciones"><button type="button" class="btn" id="veh-cerrar">Cancelar</button><button class="btn primario" type="submit">Guardar</button></div></form>`);
  $('#veh-cerrar').onclick = cerrarModal;
  $('#f-vkm').onsubmit = async ev => {
    ev.preventDefault();
    const { error } = await sb.from('vehiculo').update({ km_actual: Number(ev.target.km.value), km_actual_en: hoyISO() }).eq('id', v.id); if (error) return aviso(errorDe(error), true);
    cerrarModal(); aviso('Kilometraje guardado'); vVehiculos();
  };
}

function vehFormMant(D, id) {
  const v = D.veh.find(x => x.id === id);
  modal(`<h2>Registrar mantención · ${esc(v.nombre_corto)} ${esc(v.patente)}</h2><form id="f-vmant" class="campos">
    <label>Qué se hizo <select name="tipo">${VEH_MANT.map(t => `<option>${t}</option>`).join('')}</select></label>
    <label class="veh-otro">Describe <input name="otro"></label>
    <label>Fecha <input type="date" name="fecha" value="${hoyISO()}" required></label>
    <label>Kilometraje <input type="number" name="km" min="0" value="${v.km_actual || ''}"></label>
    <label>Taller o quién lo hizo <input name="taller"></label>
    <label>Costo ($) <input type="number" name="costo" min="0"></label>
    <label>Notas <input name="notas"></label>
    <label>Boleta o comprobante (opcional) <input type="file" name="archivo" accept="application/pdf,image/*"></label>
    <div class="acciones"><button type="button" class="btn" id="veh-cerrar">Cancelar</button><button class="btn primario" type="submit">Guardar</button></div></form>`, 'ancha');
  const f = $('#f-vmant'); const aj = () => { $('.veh-otro', f).style.display = f.tipo.value === 'Otro' ? '' : 'none'; }; f.tipo.onchange = aj; aj();
  $('#veh-cerrar').onclick = cerrarModal;
  f.onsubmit = async ev => {
    ev.preventDefault(); const btn = $('button[type=submit]', f); btn.disabled = true;
    try {
      const tipo = f.tipo.value === 'Otro' ? (f.otro.value.trim() || 'Otro') : f.tipo.value, km = f.km.value ? Number(f.km.value) : null;
      let path = null; const a = f.archivo.files[0];
      if (a) { const ext = (a.name.match(/\.[a-z0-9]+$/i) || ['.pdf'])[0].toLowerCase(); path = `vehiculos/${v.patente}/${f.fecha.value.slice(0, 4)}/MANTENCION_${f.fecha.value}_${v.patente}_${Date.now().toString(36)}${ext}`;
        const r = await sb.storage.from('documentos').upload(path, a, { contentType: a.type || 'application/pdf' }); if (r.error) throw r.error; }
      const { error } = await sb.from('vehiculo_mantencion').insert({ vehiculo_id: v.id, tipo, fecha: f.fecha.value, km, taller: f.taller.value.trim() || null, costo: f.costo.value ? Number(f.costo.value) : null, notas: f.notas.value.trim() || null, storage_path: path, archivo_nombre: path && path.split('/').pop() });
      if (error) throw error;
      if (km != null && (v.km_actual == null || km > v.km_actual)) await sb.from('vehiculo').update({ km_actual: km, km_actual_en: f.fecha.value }).eq('id', v.id);
      cerrarModal(); aviso('Mantención registrada'); vVehiculos();
    } catch (e) { btn.disabled = false; aviso(errorDe(e), true); }
  };
}

function vehFormPlan(m) {
  modal(`<h2>${esc(m.tipo)} · ${esc(m.nombre_corto)}</h2><form id="f-vplan" class="campos">
    <label>Cada cuántos km <input type="number" name="cada_km" min="0" value="${m.cada_km || ''}"></label>
    <label>o cada cuántos meses (lo que ocurra primero) <input type="number" name="cada_meses" min="0" value="${m.cada_meses || ''}"></label>
    <div class="acciones"><button type="button" class="btn" id="veh-cerrar">Cancelar</button><button class="btn primario" type="submit">Guardar (queda confirmado)</button></div></form>`);
  $('#veh-cerrar').onclick = cerrarModal;
  $('#f-vplan').onsubmit = async ev => {
    ev.preventDefault(); const f = ev.target;
    const { error } = await sb.from('vehiculo_plan').update({ cada_km: f.cada_km.value ? Number(f.cada_km.value) : null, cada_meses: f.cada_meses.value ? Number(f.cada_meses.value) : null, propuesta: false }).eq('id', m.plan_id);
    if (error) return aviso(errorDe(error), true); cerrarModal(); aviso('Intervalo guardado'); vVehiculos();
  };
}

function vehFormVehiculo(v) {
  const x = v || { tipo: 'Camioneta', activo: true };
  const c = (n, t, tipo = 'text') => `<label>${t} <input type="${tipo}" name="${n}" value="${esc(x[n] == null ? '' : x[n])}"></label>`;
  modal(`<h2>${v ? 'Editar ' + esc(v.nombre_corto) : 'Agregar vehículo'}</h2><form id="f-veh" class="campos">
    ${c('patente', 'Patente (sin guion ni dígito, ej. PDJY73)')}${c('dv', 'Dígito verificador')}${c('nombre_corto', 'Nombre corto (como le dicen en el taller)')}
    <label>Tipo <select name="tipo">${['Camioneta', 'Auto', 'Camión', 'Furgón', 'Otro'].map(t => `<option ${x.tipo === t ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
    ${c('marca', 'Marca')}${c('modelo', 'Modelo')}${c('anio', 'Año', 'number')}${c('color', 'Color')}${c('combustible', 'Combustible')}
    ${c('nro_motor', 'N° motor')}${c('nro_chasis', 'N° chasis')}${c('propietario', 'Propietario')}${c('propietario_rut', 'RUT propietario')}
    <label>Notas <textarea name="notas" rows="3">${esc(x.notas || '')}</textarea></label>
    <label><input type="checkbox" name="activo" ${x.activo ? 'checked' : ''}> En uso <span class="l2">Si se vendió, desmárcalo: sale de la app y sus papeles quedan guardados en OneDrive (Claude los pasa a la carpeta Vendidos).</span></label>
    <div class="acciones"><button type="button" class="btn" id="veh-cerrar">Cancelar</button><button class="btn primario" type="submit">Guardar</button></div></form>`, 'ancha');
  $('#veh-cerrar').onclick = cerrarModal;
  $('#f-veh').onsubmit = async ev => {
    ev.preventDefault(); const f = ev.target, d = {};
    for (const k of ['patente', 'dv', 'nombre_corto', 'tipo', 'marca', 'modelo', 'color', 'combustible', 'nro_motor', 'nro_chasis', 'propietario', 'propietario_rut', 'notas']) d[k] = f[k].value.trim() || null;
    d.patente = (d.patente || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); d.anio = f.anio.value ? Number(f.anio.value) : null; d.activo = f.activo.checked;
    if (!d.patente || !d.nombre_corto) return aviso('Falta la patente o el nombre corto', true);
    const r = v ? await sb.from('vehiculo').update(d).eq('id', v.id) : await sb.from('vehiculo').insert(d);
    if (r.error) return aviso(errorDe(r.error), true);
    if (!v) { const { data } = await sb.from('vehiculo').select('id').eq('patente', d.patente).single();
      if (data) await sb.from('vehiculo_plan').insert(['Cambio de aceite y filtro de aceite', 'Filtro de aire', 'Filtro de combustible', 'Frenos (pastillas y líquido)', 'Rotación y revisión de neumáticos', 'Correa o cadena de distribución'].map((t, i) => ({ vehiculo_id: data.id, tipo: t, cada_km: [10000, 20000, 20000, 20000, 10000, 60000][i], cada_meses: [12, 24, 24, 12, 6, 48][i] }))); }
    cerrarModal(); aviso('Vehículo guardado'); vVehiculos();
  };
}
