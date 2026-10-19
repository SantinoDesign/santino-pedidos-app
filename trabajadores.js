/* Santino Pedidos · Trabajadores (19-oct-2026). Pagos a colaboradores: reemplaza 1.Orden/01_Bases_de_datos/03_RRHH/PAGOS.xlsx.
   Tablas trabajadores_datos, trabajadores_historial y trabajadores_pendientes (migraciones 0053 y 0054). Solo Harold: la base
   (RLS con su uid) no entrega una fila a nadie más, ni a service_role; la app solo esconde la pestaña a los demás.
   Este archivo se carga antes de app.js y usa sus utilidades (sb, $, esc, aviso, modal, pesos, fecha, barra…) en tiempo de ejecución.
   Regla del Excel (y de la vista trabajadores_v_historial):
     bruto  = monto_dias + monto_extras (+ bonos o saldos anteriores que se sumen)
     pagado = round(bruto × pct/100) − adelanto_descontado − descuento_bencina − otros_descuentos + viatico
     pendiente = bruto − round(bruto × pct/100)   (cuando se paga el 80 %, el 20 % queda como pendiente por pagar) */
'use strict';

const HAROLD_ID = '32a22ba3-7124-4224-8fd9-d0212fb3e4e4';
const esHarold = () => !!(yo && yo.id === HAROLD_ID);
const TRAB = { inactivos: false };
const TIPOS_PAGO_TRAB = ['Mensual (días hábiles)', 'Honorarios contrato fijo', 'Honorarios contrato puntual'];
const FRECUENCIAS_TRAB = ['Semanal', 'Quincenal', 'Mensual', 'Adelantos días 5 y 15 + saldo final', 'Pago único al término'];
const r0 = n => Math.round(Number(n) || 0);
const fechaLargaTrab = s => { if (!s) return '-'; const d = new Date(s + 'T12:00:00'); return `${String(d.getDate()).padStart(2, '0')}-${MESES[d.getMonth()]}-${d.getFullYear()}`; };
/* Días hábiles (lunes a viernes) del mes de una fecha ISO. Los feriados se pagan como día normal (nota de Felipe en el Excel), así que no se restan. */
function diasHabilesMes(iso) { const d = new Date(iso + 'T12:00:00'); const y = d.getFullYear(), m = d.getMonth(); let n = 0; for (let x = new Date(y, m, 1); x.getMonth() === m; x.setDate(x.getDate() + 1)) if (x.getDay() > 0 && x.getDay() < 6) n++; return n; }
function diasHabilesEntre(desde, hasta) { if (!desde || !hasta || hasta < desde) return 0; let n = 0; for (let x = new Date(desde + 'T12:00:00'); x <= new Date(hasta + 'T12:00:00'); x.setDate(x.getDate() + 1)) if (x.getDay() > 0 && x.getDay() < 6) n++; return n; }
function tarifaDiaDe(t, iso) { if (!t || t.tipo_pago !== 'Mensual (días hábiles)') return null; return r0(t.sueldo_mensual / diasHabilesMes(iso || hoyISO())); }
const lunesDeTrab = iso => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.toISOString().slice(0, 10); };
const masDias = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

/* ---------- datos ---------- */
async function trabCargar() {
  const q = async (p) => { const { data, error } = await p; if (error) throw error; return data || []; };
  const [datos, resumen, historial, pendientes] = await Promise.all([
    q(sb.from('trabajadores_datos').select('*').order('activo', { ascending: false }).order('nombre')),
    q(sb.from('trabajadores_v_resumen').select('*')),
    q(sb.from('trabajadores_v_historial').select('*').order('periodo_desde', { ascending: false, nullsFirst: false }).order('id', { ascending: false })),
    q(sb.from('trabajadores_pendientes').select('*').order('estado').order('fecha_vencimiento', { nullsFirst: false }).order('id'))
  ]);
  return { datos, resumen, historial, pendientes };
}
function sinAcceso(h) { app.innerHTML = barra(h) + `<div class="contenido"><div class="seccion"><h2>Trabajadores</h2><p>Esta sección es solo de Harold. La base no entrega estos datos a ningún otro usuario.</p></div></div>`; }

/* ---------- pestaña Trabajadores ---------- */
async function vTrabajadores() {
  if (!esHarold()) return sinAcceso('#/trabajadores');
  const D = await trabCargar();
  const hoy = hoyISO(), anio = hoy.slice(0, 4), mes = hoy.slice(0, 7);
  const vivos = D.historial.filter(h => !h.anulada);
  const pagadoMes = vivos.filter(h => (h.fecha_pago || '').startsWith(mes)).reduce((s, h) => s + h.pagado, 0);
  const pagadoAnio = vivos.filter(h => (h.fecha_pago || '').startsWith(anio)).reduce((s, h) => s + h.pagado, 0);
  const pendPagar = D.resumen.reduce((s, r) => s + Number(r.pendiente_por_pagar || 0), 0);
  const pendDesc = D.resumen.reduce((s, r) => s + Number(r.pendiente_por_descontar || 0), 0);
  const lista = D.datos.filter(t => TRAB.inactivos || t.activo);
  const fila = t => { const r = D.resumen.find(x => x.trabajador_id === t.id) || {}; const anioT = vivos.filter(h => h.trabajador_id === t.id && (h.fecha_pago || '').startsWith(anio)).reduce((s, h) => s + h.pagado, 0);
    const pp = Number(r.pendiente_por_pagar || 0), pd = Number(r.pendiente_por_descontar || 0);
    return `<tr class="fila-trab ${t.activo ? '' : 'inactivo'}" data-trab="${t.id}" title="Abrir la ficha y el historial de pagos">
      <td class="nw"><b>${esc(t.nombre)}</b>${t.activo ? '' : ' <span class="chip">inactivo</span>'}<div class="l2">${esc(t.tipo_pago)}</div></td>
      <td class="nw mono">${pesos(t.sueldo_mensual)}<div class="l2">${esc(t.frecuencia_pago)}</div></td>
      <td class="nw mono">${t.tipo_pago === 'Mensual (días hábiles)' ? pesos(tarifaDiaDe(t, hoy)) + `<div class="l2">${diasHabilesMes(hoy)} días háb. este mes</div>` : '<span class="gris">según contrato</span>'}</td>
      <td class="nw mono">${t.valor_hora_extra ? pesos(t.valor_hora_extra) : '<span class="gris">-</span>'}</td>
      <td class="nw mono">${t.descuento_fijo_semanal ? pesos(t.descuento_fijo_semanal) + ` <span class="gris">${esc(t.descuento_fijo_concepto || '')}</span>` : '<span class="gris">-</span>'}</td>
      <td class="num">${r.periodos_registrados || 0}</td>
      <td class="nw">${r.ultimo_pago ? fecha(r.ultimo_pago) : '<span class="gris">-</span>'}</td>
      <td class="nw mono">${anioT ? pesos(anioT) : '<span class="gris">-</span>'}<div class="l2">${pesos(r.total_pagado || 0)} histórico</div></td>
      <td class="nw mono">${pp ? `<span class="rojo">${pesos(pp)} por pagar</span>` : ''}${pp && pd ? '<br>' : ''}${pd ? `<span class="ambar-txt">${pesos(pd)} por descontar</span>` : ''}${!pp && !pd ? '<span class="verde-txt">al día</span>' : ''}</td>
    </tr>`; };
  app.innerHTML = barra('#/trabajadores') + `<div class="sub no-imprimir"><span>Pagos a colaboradores (antes PAGOS.xlsx). Toca un trabajador para ver su ficha, registrar un pago o anotar un pendiente.</span>
      <label style="font-size:12px;display:flex;gap:6px;align-items:center;margin-left:auto"><input type="checkbox" id="t-inactivos" ${TRAB.inactivos ? 'checked' : ''}> ver inactivos</label>
      <button class="btn chico" id="t-nuevo">+ Trabajador</button><button class="btn chico primario" id="t-pago">Registrar pago</button></div>
    <div class="contenido" style="display:flex;flex-direction:column;gap:14px">
      <div class="kpis">
        <div class="kpi"><b>Pagado en ${MESES_L[Number(mes.slice(5)) - 1]}</b><span>${pesos(pagadoMes)}</span><small>${vivos.filter(h => (h.fecha_pago || '').startsWith(mes)).length} pagos</small></div>
        <div class="kpi"><b>Pagado en ${anio}</b><span>${pesos(pagadoAnio)}</span><small>${pesos(vivos.reduce((s, h) => s + h.pagado, 0))} histórico</small></div>
        <div class="kpi"><b>Por pagar</b><span class="${pendPagar ? 'rojo' : ''}">${pesos(pendPagar)}</span><small>saldos que Santino debe</small></div>
        <div class="kpi"><b>Por descontar</b><span class="${pendDesc ? 'ambar-txt' : ''}">${pesos(pendDesc)}</span><small>se restan en el próximo pago</small></div>
        <div class="kpi"><b>Activos</b><span>${D.datos.filter(t => t.activo).length}</span><small>${D.datos.length} en total</small></div>
      </div>
      <section class="seccion"><div class="tabla-env"><table class="lista"><thead><tr><th>Trabajador</th><th>Sueldo / líquido</th><th>Tarifa día</th><th>Hora extra</th><th>Desc. fijo semanal</th><th>Pagos</th><th>Último pago</th><th>Pagado ${anio}</th><th>Pendientes</th></tr></thead><tbody>${lista.map(fila).join('')}</tbody></table></div>
      <div class="gris" style="font-size:12px;margin-top:8px">Tarifa día = sueldo ÷ días hábiles (lunes a viernes) del mes en curso; al registrar un pago se calcula con el mes del período. Los feriados se pagan como día normal.</div></section>
    </div>`;
  $$('tr.fila-trab').forEach(tr => tr.onclick = () => { location.hash = '#/trabajadores/' + tr.dataset.trab; });
  $('#t-inactivos').onchange = ev => { TRAB.inactivos = ev.target.checked; vTrabajadores(); };
  $('#t-nuevo').onclick = () => formTrabajador(null, t => { location.hash = '#/trabajadores/' + t.id; });
  $('#t-pago').onclick = () => elegirTrabajador(D.datos.filter(t => t.activo), t => formPagoTrabajador(t, D, () => vTrabajadores()));
}
function elegirTrabajador(lista, despues) {
  if (lista.length === 1) return despues(lista[0]);
  const m = modal(`<h2>¿A quién le pagas?</h2><div class="acciones-lista" style="display:flex;flex-wrap:wrap;gap:8px">${lista.map(t => `<button class="btn" data-t="${t.id}">${esc(t.nombre)}</button>`).join('')}</div><div class="acciones"><button class="btn" onclick="cerrarModal()">Cancelar</button></div>`);
  $$('[data-t]', m).forEach(b => b.onclick = () => { cerrarModal(); despues(lista.find(t => t.id === Number(b.dataset.t))); });
}

/* ---------- ficha de un trabajador ---------- */
async function vTrabajador(id) {
  if (!esHarold()) return sinAcceso('#/trabajadores');
  const D = await trabCargar();
  const t = D.datos.find(x => x.id === id);
  if (!t) { app.innerHTML = barra('#/trabajadores') + '<div class="contenido"><div class="seccion">Trabajador no encontrado.</div></div>'; return; }
  const r = D.resumen.find(x => x.trabajador_id === id) || {};
  const hist = D.historial.filter(h => h.trabajador_id === id), vivos = hist.filter(h => !h.anulada);
  const pend = D.pendientes.filter(p => p.trabajador_id === id), pendAct = pend.filter(p => p.estado === 'Pendiente');
  const anio = hoyISO().slice(0, 4);
  const dato = (k, v) => v == null || v === '' ? '' : `<div class="dato"><b>${k}</b>${v}</div>`;
  const filaH = h => `<tr class="fila-pago ${h.anulada ? 'inactivo' : ''}" data-pago="${h.id}" title="Ver el detalle del pago">
      <td class="nw">${h.periodo_desde ? fecha(h.periodo_desde) + (h.periodo_hasta && h.periodo_hasta !== h.periodo_desde ? ' a ' + fecha(h.periodo_hasta) : '') : '<span class="gris">sin período</span>'}${h.anulada ? ' <span class="chip">anulado</span>' : ''}</td>
      <td class="num">${h.dias_trabajados != null ? num(h.dias_trabajados) : ''}</td>
      <td class="num">${h.horas_extra ? num(h.horas_extra) : ''}</td>
      <td class="nw mono">${h.bruto != null ? pesos(h.bruto) : '<span class="gris">-</span>'}${h.pct_pagado !== 100 ? `<div class="l2">${h.pct_pagado}% pagado</div>` : ''}</td>
      <td class="nw mono">${descuentosTxt(h)}</td>
      <td class="nw mono"><b>${pesos(h.pagado)}</b>${h.pendiente ? `<div class="l2 rojo">${pesos(h.pendiente)} quedó pendiente</div>` : ''}${h.diferencia ? `<div class="l2 ambar-txt" title="pagado menos lo que da la fórmula">no cuadra: ${h.diferencia > 0 ? '+' : ''}${pesos(h.diferencia)}</div>` : ''}</td>
      <td class="nw">${h.fecha_pago ? fecha(h.fecha_pago) : '<span class="gris">-</span>'}</td>
      <td class="nota-corta" title="${esc(h.notas || '')}">${esc(recortar(h.notas, 110))}</td></tr>`;
  const filaP = p => `<tr class="${p.estado !== 'Pendiente' ? 'inactivo' : ''}"><td class="nw"><span class="chip ${p.tipo === 'por_pagar' ? 'saldo' : ''}">${p.tipo === 'por_pagar' ? 'por pagar' : 'por descontar'}</span></td><td>${esc(p.concepto)}${p.notas ? `<div class="l2">${esc(p.notas)}</div>` : ''}</td><td class="nw mono">${pesos(p.monto)}</td><td class="nw">${p.fecha_vencimiento ? fecha(p.fecha_vencimiento) : '<span class="gris">-</span>'}</td><td>${esc(p.prioridad)}</td><td class="nw">${esc(p.estado)}${p.resuelto_en ? `<div class="l2">${fecha(p.resuelto_en)}${p.historial_id ? ' · pago #' + p.historial_id : ''}</div>` : ''}</td>
      <td class="nw">${p.estado === 'Pendiente' ? `<button class="btn chico" data-pend-editar="${p.id}">Editar</button> <button class="btn chico" data-pend-resolver="${p.id}" title="Marcarlo como aplicado sin pasar por un pago (ya se resolvió aparte)">Resuelto</button> <button class="btn chico" data-pend-descartar="${p.id}">Descartar</button>` : ''}</td></tr>`;
  app.innerHTML = barra('#/trabajadores') + `<div class="sub no-imprimir"><a href="#/trabajadores" class="btn chico">← Trabajadores</a><span><b>${esc(t.nombre)}</b> · ${esc(t.tipo_pago)}</span>
      <span style="margin-left:auto;display:flex;gap:8px"><button class="btn chico" id="tf-pendiente">+ Pendiente</button><button class="btn chico" id="tf-editar">Editar ficha</button><button class="btn chico primario" id="tf-pago">Registrar pago</button></span></div>
    <div class="contenido ficha-prov" style="display:flex;flex-direction:column;gap:14px">
      <section class="seccion"><div class="cab"><h2>${esc(t.nombre)}${t.activo ? '' : ' <span class="chip">inactivo</span>'}</h2></div>
        <div class="datos">${dato('Tipo de pago', esc(t.tipo_pago))}${dato(t.tipo_pago === 'Mensual (días hábiles)' ? 'Sueldo líquido mensual' : 'Líquido pactado', pesos(t.sueldo_mensual))}
          ${dato('Tarifa día', t.tipo_pago === 'Mensual (días hábiles)' ? `${pesos(tarifaDiaDe(t, hoyISO()))} este mes (${diasHabilesMes(hoyISO())} días háb.) · ${pesos(t.tarifa_dia_base)} sobre ${t.dias_habiles_referencia} de referencia` : 'según contrato')}
          ${dato('Hora extra', t.valor_hora_extra ? pesos(t.valor_hora_extra) : '')}${dato('Descuento fijo semanal', t.descuento_fijo_semanal ? pesos(t.descuento_fijo_semanal) + (t.descuento_fijo_concepto ? ' (' + esc(t.descuento_fijo_concepto) + ')' : '') : '')}
          ${dato('Frecuencia', esc(t.frecuencia_pago))}${dato('Inicio', t.fecha_inicio ? fechaLargaTrab(t.fecha_inicio) : '')}${dato('Término', t.fecha_termino ? fechaLargaTrab(t.fecha_termino) : '')}${dato('Notas', esc(t.notas))}</div></section>
      <div class="kpis">
        <div class="kpi"><b>Pagado ${anio}</b><span>${pesos(vivos.filter(h => (h.fecha_pago || '').startsWith(anio)).reduce((s, h) => s + h.pagado, 0))}</span><small>${pesos(r.total_pagado || 0)} histórico · ${vivos.length} pagos</small></div>
        <div class="kpi"><b>Último pago</b><span>${r.ultimo_pago ? fecha(r.ultimo_pago) : '-'}</span>${vivos[0] ? `<small>${pesos(vivos[0].pagado)}</small>` : ''}</div>
        <div class="kpi"><b>Por pagar</b><span class="${Number(r.pendiente_por_pagar) ? 'rojo' : ''}">${pesos(r.pendiente_por_pagar || 0)}</span><small>${Number(r.pendiente_historial) ? pesos(r.pendiente_historial) + ' anotados en pagos parciales' : 'saldos a su favor'}</small></div>
        <div class="kpi"><b>Por descontar</b><span class="${Number(r.pendiente_por_descontar) ? 'ambar-txt' : ''}">${pesos(r.pendiente_por_descontar || 0)}</span><small>se restan en el próximo pago</small></div>
      </div>
      <section class="seccion"><div class="cab"><h2>Pendientes (${pendAct.length})</h2><span class="gris" style="font-size:12px">al registrar un pago se pueden aplicar con un clic</span></div>
        ${pend.length ? `<div class="tabla-env"><table class="lista"><thead><tr><th>Tipo</th><th>Concepto</th><th>Monto</th><th>Vence</th><th>Prioridad</th><th>Estado</th><th></th></tr></thead><tbody>${pend.map(filaP).join('')}</tbody></table></div>` : '<div class="gris">Sin pendientes.</div>'}</section>
      <section class="seccion"><div class="cab"><h2>Historial de pagos (${vivos.length})</h2><span class="gris" style="font-size:12px">toca una fila para ver el detalle, corregir la nota o anular</span></div>
        ${hist.length ? `<div class="tabla-env"><table class="lista"><thead><tr><th>Período</th><th>Días</th><th>H. extra</th><th>Bruto</th><th>Descuentos</th><th>Pagado</th><th>Fecha pago</th><th>Notas</th></tr></thead><tbody>${hist.map(filaH).join('')}</tbody></table></div>` : '<div class="gris">Todavía no tiene pagos registrados.</div>'}</section>
    </div>`;
  const refrescar = () => vTrabajador(id);
  $$('tr.fila-pago').forEach(tr => tr.onclick = () => modalPagoTrabajador(hist.find(h => h.id === Number(tr.dataset.pago)), t, refrescar));
  $('#tf-editar').onclick = () => formTrabajador(t, refrescar);
  $('#tf-pago').onclick = () => formPagoTrabajador(t, D, refrescar);
  $('#tf-pendiente').onclick = () => formPendiente(t, null, refrescar);
  $$('[data-pend-editar]').forEach(b => b.onclick = ev => { ev.stopPropagation(); formPendiente(t, pend.find(p => p.id === Number(b.dataset.pendEditar)), refrescar); });
  $$('[data-pend-resolver]').forEach(b => b.onclick = ev => { ev.stopPropagation(); resolverPendiente(Number(b.dataset.pendResolver), 'Aplicado', null, refrescar); });
  $$('[data-pend-descartar]').forEach(b => b.onclick = ev => { ev.stopPropagation(); if (confirm('¿Descartar este pendiente? Queda en el historial como descartado.')) resolverPendiente(Number(b.dataset.pendDescartar), 'Descartado', null, refrescar); });
}
const recortar = (s, n) => !s ? '' : s.length > n ? s.slice(0, n - 1) + '…' : s;
function descuentosTxt(h) {
  const partes = []; if (h.adelanto_descontado) partes.push(`adelanto ${pesos(h.adelanto_descontado)}`); if (h.descuento_bencina) partes.push(`bencina ${pesos(h.descuento_bencina)}`); if (h.otros_descuentos) partes.push(`otros ${pesos(h.otros_descuentos)}`); if (h.viatico) partes.push(`<span class="verde-txt">+ viático ${pesos(h.viatico)}</span>`);
  return partes.length ? partes.join('<br>') : '<span class="gris">-</span>';
}
async function resolverPendiente(id, estado, historialId, despues) {
  const { error } = await sb.from('trabajadores_pendientes').update({ estado, historial_id: historialId, resuelto_en: hoyISO() }).eq('id', id);
  if (error) return aviso(errorDe(error), true); aviso(estado === 'Aplicado' ? 'Pendiente resuelto' : 'Pendiente descartado'); despues();
}

/* ---------- detalle de un pago: corregir nota y fechas, anular ---------- */
function modalPagoTrabajador(h, t, despues) {
  const f = (k, v) => v == null || v === '' ? '' : `<div class="dato"><b>${k}</b>${v}</div>`;
  const m = modal(`<h2>Pago #${h.id} · ${esc(t.nombre)}${h.anulada ? ' <span class="chip">anulado</span>' : ''}</h2>
    <div class="datos" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:8px 16px">${f('Período', h.periodo_desde ? fechaLargaTrab(h.periodo_desde) + ' a ' + fechaLargaTrab(h.periodo_hasta) : '')}${f('Días trabajados', h.dias_trabajados != null ? num(h.dias_trabajados) : '')}${f('Monto días', h.monto_dias != null ? pesos(h.monto_dias) : '')}
      ${f('Horas extra', h.horas_extra ? num(h.horas_extra) : '')}${f('Monto extras', h.monto_extras ? pesos(h.monto_extras) : '')}${f('Bruto', h.bruto != null ? pesos(h.bruto) : '')}${f('% pagado', h.pct_pagado + '%')}
      ${f('Adelanto descontado', h.adelanto_descontado ? pesos(h.adelanto_descontado) : '')}${f('Descuento bencina', h.descuento_bencina ? pesos(h.descuento_bencina) : '')}${f('Otros descuentos', h.otros_descuentos ? pesos(h.otros_descuentos) : '')}${f('Viático', h.viatico ? pesos(h.viatico) : '')}
      ${f('Pagado', '<b>' + pesos(h.pagado) + '</b>')}${f('Quedó pendiente', h.pendiente ? pesos(h.pendiente) : '')}${f('Según fórmula', h.pagado_calculado != null ? pesos(h.pagado_calculado) + (h.diferencia ? ` <span class="ambar-txt">(difiere ${h.diferencia > 0 ? '+' : ''}${pesos(h.diferencia)})</span>` : ' <span class="verde-txt">cuadra</span>') : '')}
      ${f('Registrado por', esc(h.registrado_por || '') + (h.numero_excel ? ' · fila ' + h.numero_excel + ' del Excel' : ''))}</div>
    <form id="f" style="margin-top:10px"><div class="campos">
      <label class="campo">Fecha de pago <input name="fecha_pago" type="date" value="${h.fecha_pago || ''}"></label>
      <label class="campo">Fecha de liquidación <input name="fecha_liquidacion" type="date" value="${h.fecha_liquidacion || ''}"></label>
      <label class="campo" style="grid-column:1/-1">Notas <textarea name="notas" rows="4">${esc(h.notas || '')}</textarea></label></div>
      <div class="acciones">${h.anulada ? '' : '<button type="button" class="btn peligro" id="p-anular">Anular pago</button>'}<button type="button" class="btn" onclick="cerrarModal()">Cerrar</button><button class="btn primario">Guardar</button></div></form>`, 'ancha');
  $('#f', m).onsubmit = async ev => { ev.preventDefault(); const d = new FormData(ev.target);
    const { error } = await sb.from('trabajadores_historial').update({ fecha_pago: d.get('fecha_pago') || null, fecha_liquidacion: d.get('fecha_liquidacion') || null, notas: d.get('notas') || null }).eq('id', h.id);
    if (error) return aviso(errorDe(error), true); aviso('Pago actualizado'); cerrarModal(); despues(); };
  const ba = $('#p-anular', m); if (ba) ba.onclick = async () => {
    const motivo = prompt(`¿Anular el pago de ${pesos(h.pagado)}? No se borra: queda marcado como anulado y fuera de los totales. Escribe el motivo:`); if (motivo == null) return; if (!motivo.trim()) return aviso('Falta el motivo', true);
    const { error } = await sb.from('trabajadores_historial').update({ anulada: true, notas: ((h.notas || '') + `\nANULADO ${fechaLargaTrab(hoyISO())}: ${motivo.trim()}`).trim() }).eq('id', h.id);
    if (error) return aviso(errorDe(error), true); aviso('Pago anulado'); cerrarModal(); despues(); };
}

/* ---------- ficha: crear o editar ---------- */
function formTrabajador(t, despues) {
  const v = k => esc(t && t[k] != null ? t[k] : '');
  const mensual = !t || t.tipo_pago === 'Mensual (días hábiles)';
  const m = modal(`<h2>${t ? 'Editar ficha · ' + esc(t.nombre) : 'Nuevo trabajador'}</h2><form id="f"><div class="campos">
    <label class="campo">Nombre <input name="nombre" value="${v('nombre')}" required></label>
    <label class="campo">Tipo de pago <select name="tipo_pago">${TIPOS_PAGO_TRAB.map(x => `<option ${(t ? t.tipo_pago : TIPOS_PAGO_TRAB[0]) === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
    <label class="campo"><span id="l-sueldo">${mensual ? 'Sueldo líquido mensual ($)' : 'Líquido pactado del contrato ($)'}</span> <input name="sueldo_mensual" type="number" step="1" min="1" value="${v('sueldo_mensual')}" required></label>
    <label class="campo">Días hábiles de referencia <input name="dias_habiles_referencia" type="number" min="1" max="31" value="${t ? t.dias_habiles_referencia : 22}"></label>
    <label class="campo">Valor hora extra ($) <input name="valor_hora_extra" type="number" step="1" min="0" value="${v('valor_hora_extra')}"></label>
    <label class="campo">Descuento fijo semanal ($) <input name="descuento_fijo_semanal" type="number" step="1" min="0" value="${t ? t.descuento_fijo_semanal : 0}"></label>
    <label class="campo">Concepto del descuento <input name="descuento_fijo_concepto" value="${v('descuento_fijo_concepto')}" placeholder="ej. bencina"></label>
    <label class="campo">Frecuencia de pago <input name="frecuencia_pago" list="frec-trab" value="${v('frecuencia_pago') || (t ? '' : 'Semanal')}" required><datalist id="frec-trab">${FRECUENCIAS_TRAB.map(x => `<option value="${x}">`).join('')}</datalist></label>
    <label class="campo">Fecha de inicio <input name="fecha_inicio" type="date" value="${v('fecha_inicio')}"></label>
    <label class="campo">Fecha de término <input name="fecha_termino" type="date" value="${v('fecha_termino')}"></label>
    ${t ? `<label class="campo">Activo <select name="activo"><option value="true" ${t.activo ? 'selected' : ''}>Sí</option><option value="false" ${!t.activo ? 'selected' : ''}>No (ya no trabaja con Santino)</option></select></label>` : ''}
    <label class="campo" style="grid-column:1/-1">Notas (condiciones, contrato, acuerdos) <textarea name="notas" rows="3">${v('notas')}</textarea></label></div>
    <div class="acciones"><button type="button" class="btn" onclick="cerrarModal()">Cancelar</button><button class="btn primario">${t ? 'Guardar' : 'Crear'}</button></div></form>`, 'ancha');
  $('select[name=tipo_pago]', m).onchange = ev => { $('#l-sueldo', m).textContent = ev.target.value === TIPOS_PAGO_TRAB[0] ? 'Sueldo líquido mensual ($)' : 'Líquido pactado del contrato ($)'; };
  $('#f', m).onsubmit = async ev => { ev.preventDefault(); const d = new FormData(ev.target);
    const c = { nombre: d.get('nombre').trim(), tipo_pago: d.get('tipo_pago'), sueldo_mensual: r0(d.get('sueldo_mensual')), dias_habiles_referencia: Number(d.get('dias_habiles_referencia')) || 22, valor_hora_extra: d.get('valor_hora_extra') === '' ? null : r0(d.get('valor_hora_extra')), descuento_fijo_semanal: r0(d.get('descuento_fijo_semanal')), descuento_fijo_concepto: d.get('descuento_fijo_concepto') || null, frecuencia_pago: d.get('frecuencia_pago').trim(), fecha_inicio: d.get('fecha_inicio') || null, fecha_termino: d.get('fecha_termino') || null, notas: d.get('notas') || null };
    if (t) c.activo = d.get('activo') === 'true';
    const q = t ? sb.from('trabajadores_datos').update(c).eq('id', t.id).select().single() : sb.from('trabajadores_datos').insert(c).select().single();
    const { data, error } = await q; if (error) return aviso(errorDe(error), true);
    aviso(t ? 'Ficha guardada' : 'Trabajador creado'); cerrarModal(); despues(data); };
}

/* ---------- pendiente: crear o editar ---------- */
function formPendiente(t, p, despues) {
  const v = k => esc(p && p[k] != null ? p[k] : '');
  const m = modal(`<h2>${p ? 'Editar pendiente' : 'Nuevo pendiente'} · ${esc(t.nombre)}</h2><form id="f"><div class="campos">
    <label class="campo">Tipo <select name="tipo"><option value="por_descontar" ${!p || p.tipo === 'por_descontar' ? 'selected' : ''}>Por descontar (se le resta en el próximo pago)</option><option value="por_pagar" ${p && p.tipo === 'por_pagar' ? 'selected' : ''}>Por pagar (Santino se lo debe)</option></select></label>
    <label class="campo">Monto ($) <input name="monto" type="number" step="1" min="1" value="${v('monto')}" required></label>
    <label class="campo" style="grid-column:1/-1">Concepto <input name="concepto" value="${v('concepto')}" placeholder="ej. cuota 3 de 3 del celular" required></label>
    <label class="campo">Vence <input name="fecha_vencimiento" type="date" value="${v('fecha_vencimiento')}"></label>
    <label class="campo">Prioridad <select name="prioridad">${['Alta', 'Media', 'Baja'].map(x => `<option ${(p ? p.prioridad : 'Media') === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
    <label class="campo" style="grid-column:1/-1">Notas <textarea name="notas" rows="2">${v('notas')}</textarea></label></div>
    <div class="acciones"><button type="button" class="btn" onclick="cerrarModal()">Cancelar</button><button class="btn primario">${p ? 'Guardar' : 'Anotar'}</button></div></form>`);
  $('#f', m).onsubmit = async ev => { ev.preventDefault(); const d = new FormData(ev.target);
    const c = { trabajador_id: t.id, tipo: d.get('tipo'), monto: r0(d.get('monto')), concepto: d.get('concepto').trim(), fecha_vencimiento: d.get('fecha_vencimiento') || null, prioridad: d.get('prioridad'), notas: d.get('notas') || null };
    const { error } = p ? await sb.from('trabajadores_pendientes').update(c).eq('id', p.id) : await sb.from('trabajadores_pendientes').insert(c);
    if (error) return aviso(errorDe(error), true); aviso(p ? 'Pendiente guardado' : 'Pendiente anotado'); cerrarModal(); despues(); };
}

/* ---------- registrar un pago (la calculadora del Excel) ---------- */
function formPagoTrabajador(t, D, despues) {
  const mensual = t.tipo_pago === 'Mensual (días hábiles)';
  const pend = (D.pendientes || []).filter(p => p.trabajador_id === t.id && p.estado === 'Pendiente');
  const hoy = hoyISO(), desde0 = lunesDeTrab(hoy), hasta0 = masDias(desde0, 4);
  const semanas = (a, b) => Math.max(1, Math.round((diasHabilesEntre(a, b) || 5) / 5));
  const m = modal(`<h2>Registrar pago · ${esc(t.nombre)}</h2>
    <div class="gris" style="font-size:12px">${mensual ? `Tarifa día = ${pesos(t.sueldo_mensual)} ÷ días hábiles del mes del período. ` : 'Honorarios: escribe la tarifa día acordada o deja los días en cero y anota el monto en bonos. '}Pagado = bruto × % − adelanto − bencina − otros + viático.</div>
    <form id="f"><div class="campos">
      <label class="campo">Período desde <input name="desde" type="date" value="${desde0}"></label>
      <label class="campo">Período hasta <input name="hasta" type="date" value="${hasta0}"></label>
      <label class="campo">Días trabajados <input name="dias" type="number" step="0.5" min="0" value="${diasHabilesEntre(desde0, hasta0)}"></label>
      <label class="campo">Tarifa día ($) <input name="tarifa" type="number" step="1" min="0" value="${tarifaDiaDe(t, desde0) || ''}"><small class="gris" id="tarifa-ayuda"></small></label>
      <label class="campo">Horas extra <input name="horas" type="number" step="0.01" min="0" value="0"></label>
      <label class="campo">Valor hora extra ($) <input name="vhora" type="number" step="1" min="0" value="${t.valor_hora_extra || 0}"></label>
      <label class="campo">Bonos u otros haberes ($) <input name="bono" type="number" step="1" min="0" value="0" placeholder="se suman al bruto"></label>
      <label class="campo">Viático ($) <input name="viatico" type="number" step="1" min="0" value="0"><small class="gris">se paga íntegro</small></label>
      <label class="campo">Adelanto ya recibido ($) <input name="adelanto" type="number" step="1" min="0" value="0"></label>
      <label class="campo">Descuento ${esc(t.descuento_fijo_concepto || 'fijo')} ($) <input name="bencina" type="number" step="1" min="0" value="${t.descuento_fijo_semanal ? t.descuento_fijo_semanal * semanas(desde0, hasta0) : 0}"><small class="gris" id="bencina-ayuda"></small></label>
      <label class="campo">Otros descuentos ($) <input name="otros" type="number" step="1" min="0" value="0"></label>
      <label class="campo">% que se paga ahora <input name="pct" type="number" step="1" min="0" max="100" value="100"><small class="gris">80 deja el 20 % como pendiente</small></label>
      <label class="campo">Fecha de pago <input name="fecha_pago" type="date" value="${hoy}" required></label>
      <label class="campo" style="grid-column:1/-1">Notas (qué semanas, de dónde salen las horas, en cuántas transferencias) <textarea name="notas" rows="2"></textarea></label></div>
    ${pend.length ? `<div style="margin-top:10px"><b style="font-size:13px">Aplicar pendientes en este pago</b><div class="aplicar">${pend.map(p => `<div class="aplicar-fila"><label><input type="checkbox" name="pend_${p.id}" data-tipo="${p.tipo}" data-monto="${p.monto}"> <b>${pesos(p.monto)}</b> ${p.tipo === 'por_pagar' ? 'por pagar (se suma al bruto)' : 'por descontar (se resta)'} · ${esc(p.concepto)}</label></div>`).join('')}</div></div>` : ''}
    <div class="seccion" id="calc" style="margin-top:12px;padding:10px 14px;background:var(--panel)"></div>
    <div class="acciones"><button type="button" class="btn" onclick="cerrarModal()">Cancelar</button><button class="btn primario">Guardar pago</button></div></form>`, 'ancha');
  const F = $('#f', m), g = k => F.elements[k] ? F.elements[k].value : '';
  const marcados = () => $$('input[name^=pend_]', F).filter(c => c.checked).map(c => ({ id: Number(c.name.slice(5)), tipo: c.dataset.tipo, monto: Number(c.dataset.monto) }));
  const calc = () => {
    const dias = Number(g('dias')) || 0, tarifa = r0(g('tarifa')), horas = Number(g('horas')) || 0, vh = r0(g('vhora'));
    const saldosPrev = marcados().filter(p => p.tipo === 'por_pagar').reduce((s, p) => s + p.monto, 0), descPend = marcados().filter(p => p.tipo === 'por_descontar').reduce((s, p) => s + p.monto, 0);
    const monto_dias = r0(dias * tarifa), monto_extras = r0(horas * vh), bruto = monto_dias + monto_extras + r0(g('bono')) + saldosPrev;
    const pct = Math.min(100, Math.max(0, Number(g('pct')) || 0)), base = r0(bruto * pct / 100);
    const otros = r0(g('otros')) + descPend, pagado = base - r0(g('adelanto')) - r0(g('bencina')) - otros + r0(g('viatico')), pendiente = bruto - base;
    return { dias, tarifa, horas, vh, monto_dias, monto_extras, bruto, pct, pagado, pendiente, otros, saldosPrev, descPend };
  };
  const pintar = () => { const c = calc();
    $('#calc', m).innerHTML = `<div style="display:flex;gap:18px;flex-wrap:wrap;font-size:13px"><span>Días: <b>${pesos(c.monto_dias)}</b> <span class="gris">(${num(c.dias)} × ${pesos(c.tarifa)})</span></span><span>Extras: <b>${pesos(c.monto_extras)}</b> <span class="gris">(${num(c.horas)} h × ${pesos(c.vh)})</span></span>${c.saldosPrev ? `<span>Saldos anteriores: <b>${pesos(c.saldosPrev)}</b></span>` : ''}<span>Bruto: <b>${pesos(c.bruto)}</b></span>${c.pct !== 100 ? `<span>Se paga el ${c.pct} %: <b>${pesos(r0(c.bruto * c.pct / 100))}</b>, queda pendiente <b class="rojo">${pesos(c.pendiente)}</b></span>` : ''}${c.descPend ? `<span>Pendientes descontados: <b>${pesos(c.descPend)}</b></span>` : ''}</div>
      <div style="font-size:18px;margin-top:6px">A transferir: <b class="${c.pagado < 0 ? 'rojo' : ''}">${pesos(c.pagado)}</b></div>`;
    $('#tarifa-ayuda', m).textContent = mensual && g('desde') ? `${diasHabilesMes(g('desde'))} días hábiles en ${MESES_L[Number(g('desde').slice(5, 7)) - 1]}` : '';
    $('#bencina-ayuda', m).textContent = t.descuento_fijo_semanal ? `${pesos(t.descuento_fijo_semanal)} × ${semanas(g('desde'), g('hasta'))} semana${semanas(g('desde'), g('hasta')) > 1 ? 's' : ''}` : ''; };
  F.oninput = pintar; F.onchange = ev => {
    if (ev.target.name === 'desde' || ev.target.name === 'hasta') { if (g('desde') && g('hasta')) { F.elements.dias.value = diasHabilesEntre(g('desde'), g('hasta')); if (t.descuento_fijo_semanal) F.elements.bencina.value = t.descuento_fijo_semanal * semanas(g('desde'), g('hasta')); } if (mensual && g('desde')) F.elements.tarifa.value = tarifaDiaDe(t, g('desde')); }
    pintar(); };
  pintar();
  F.onsubmit = async ev => { ev.preventDefault(); const c = calc();
    if (c.pagado < 0) return aviso('El pago da negativo: revisa los descuentos', true);
    if (!c.bruto && !c.pagado) return aviso('No hay nada que pagar', true);
    const aplicados = marcados(); const notasAuto = aplicados.map(p => (p.tipo === 'por_pagar' ? 'incluye saldo pendiente ' : 'descuenta pendiente ') + pesos(p.monto) + ' (' + (pend.find(x => x.id === p.id) || {}).concepto + ')').join('; ');
    const fila = { trabajador_id: t.id, periodo_desde: g('desde') || null, periodo_hasta: g('hasta') || null, dias_trabajados: c.dias || null, monto_dias: c.monto_dias || null, horas_extra: c.horas || null, monto_extras: c.monto_extras || null, bruto: c.bruto, adelanto_descontado: r0(g('adelanto')), viatico: r0(g('viatico')), descuento_bencina: r0(g('bencina')), otros_descuentos: c.otros, pct_pagado: c.pct, pagado: c.pagado, pendiente: c.pendiente, fecha_pago: g('fecha_pago') || null, notas: [g('notas').trim(), r0(g('bono')) ? 'bonos ' + pesos(r0(g('bono'))) : '', notasAuto].filter(Boolean).join(' | ') || null };
    const { data, error } = await sb.from('trabajadores_historial').insert(fila).select().single(); if (error) return aviso(errorDe(error), true);
    for (const p of aplicados) { const { error: e2 } = await sb.from('trabajadores_pendientes').update({ estado: 'Aplicado', historial_id: data.id, resuelto_en: g('fecha_pago') || hoy }).eq('id', p.id); if (e2) aviso('El pago quedó guardado pero no se pudo cerrar un pendiente: ' + errorDe(e2), true); }
    if (c.pendiente > 0) { const { error: e3 } = await sb.from('trabajadores_pendientes').insert({ trabajador_id: t.id, tipo: 'por_pagar', monto: c.pendiente, concepto: `Saldo ${100 - c.pct}% del período ${fecha(g('desde'))} a ${fecha(g('hasta'))} (pago #${data.id})`, prioridad: 'Media' }); if (e3) aviso('El pago quedó guardado pero no se pudo anotar el saldo pendiente: ' + errorDe(e3), true); }
    aviso(`Pago de ${pesos(c.pagado)} a ${t.nombre} registrado${c.pendiente > 0 ? '; quedó pendiente ' + pesos(c.pendiente) : ''}`); cerrarModal(); despues(); };
}
