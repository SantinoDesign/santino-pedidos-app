/* Santino Pedidos · Solicitudes de compra (21-oct-2026, migración 0071). Harold: "una nueva sección para mí y para Alexis de
   solicitudes de compra, por categoría; que él pueda ir marcando lo que compró, para que lo que le quede pendiente lo compre, o bien
   marcar que compró todo".
   Una solicitud = una lista para un proveedor y un día (hoy Yousef). Cada ítem: categoría, cantidad, unidad, proyecto y ambiente.
   Alexis toca la casilla (comprado entero), "Parte" (compró menos: el resto queda pendiente) o "Compré todo".
   Distinta de la OC de Compras: aquí no hay precio por línea ni pago al proveedor; solo lo que costó la boleta, si se anota.
   Se carga antes de app.js y usa sus utilidades (sb, $, $$, esc, aviso, modal, rpc, fecha, pesos, num, barra…) en tiempo de ejecución. */
'use strict';

const CATEGORIAS_SOLICITUD = ['Herrajes y ferretería', 'Planchas y tapacantos', 'Iluminación', 'Madera', 'Barniz y pintura', 'Embalaje', 'Telas', 'Otros'];
const UNIDADES_SOLICITUD = ['un', 'par', 'bolsa', 'caja', 'plancha', 'm', 'm2', 'rollo', 'kg', 'galón', 'litro', 'pulgada'];

async function vSolicitudes() {
  const verCerradas = !!cache.solCerradas;
  const lista = await rpc('solicitudes_json', { p_cerradas: verCerradas }) || [];
  cache.solicitudes = lista;
  const admin = yo.rol === 'admin';
  app.innerHTML = barra('#/compras') + `<div class="sub no-imprimir"><a href="#/compras" class="btn chico">← Compras</a><button class="btn chico primario" id="s-nueva">+ Nueva solicitud</button>
      <button class="btn chico" id="s-desglose" title="Muestra u oculta cuánto va a cada proyecto y ambiente">${cache.solDesglose ? 'Ocultar desglose' : 'Ver desglose por proyecto'}</button>
      <a href="#/compras/solicitudes/imprimir" class="btn chico" title="Una hoja por proyecto con sus insumos, para entregarlos al maestro en una caja y que firme">Imprimir por proyecto</a>
      <span>Lo que hay que ir a comprar: cada insumo con el total de todos los proyectos. Toca la casilla cuando lo compres; si compraste menos, usa "Parte" y lo que falta queda pendiente.</span>
      <label style="margin-left:auto;font-size:12px;display:flex;gap:6px;align-items:center"><input type="checkbox" id="s-cerradas" ${verCerradas ? 'checked' : ''}> ver también las ya compradas</label></div>
    <div class="contenido">${lista.length ? lista.map(s => seccionSolicitud(s, admin)).join('') : '<section class="seccion gris">No hay solicitudes de compra pendientes.</section>'}</div>`;
  $('#s-cerradas').onchange = ev => { cache.solCerradas = ev.target.checked; vSolicitudes(); };
  $('#s-nueva').onclick = () => formSolicitud(null);
  $('#s-desglose').onclick = () => { cache.solDesglose = !cache.solDesglose; vSolicitudes(); };
  activarSolicitudes(app);
}

const cantTxt = (c, u) => `${num(c)} ${u === 'un' ? (Number(c) === 1 ? 'unidad' : 'unidades') : u === 'par' ? (Number(c) === 1 ? 'par' : 'pares') : u}`;

// Harold 21-oct: "las bisagras y cualquier otro insumo debes agruparlas para que él pida el total solamente… y quizás desglosas en
// alguna parte si él quiere revisar, para distribuir a los maestros por proyecto". Una fila por insumo con el total; el desglose debajo.
const corto = n => (n || '').trim().split(/\s+/).slice(0, 2).join(' ');
function gruposSolicitud(items) {
  const g = []; const idx = {};
  items.forEach(i => { const k = i.categoria + '|' + (i.insumo_id || i.descripcion.toLowerCase()) + '|' + i.unidad; if (!(k in idx)) { idx[k] = g.length; g.push({ k, cat: i.categoria, desc: i.descripcion, unidad: i.unidad, items: [] }); } g[idx[k]].items.push(i); });
  g.forEach(x => { const vivos = x.items.filter(i => !i.descartado);
    x.total = vivos.reduce((a, i) => a + Number(i.cantidad), 0); x.comprado = vivos.reduce((a, i) => a + Number(i.cantidad_comprada), 0);
    x.pendiente = vivos.some(i => i.pendiente); x.proyectos = [...new Map(vivos.map(i => [i.pedido_id || 0, i])).values()]; });
  return g;
}

function seccionSolicitud(s, admin) {
  const pend = s.pendientes, tot = s.total_items, cerrada = !!s.cerrada_en, abierto = !!cache.solDesglose;
  const grupos = gruposSolicitud(s.items);
  const cats = CATEGORIAS_SOLICITUD.filter(c => grupos.some(g => g.cat === c));
  const contactos = (s.proveedor_contactos || []).filter(c => c.telefono && s.items.some(i => i.pendiente && (!c.categorias || !c.categorias.length || c.categorias.includes(i.categoria))));   // solo quien atiende algo pendiente
  const filaItem = (i, gk) => {
    const parcial = i.cantidad_comprada > 0 && i.pendiente;
    return `<tr class="sol-item sol-desglose ${abierto ? '' : 'oculto'} ${i.pendiente ? '' : 'comprado'} ${i.descartado ? 'descartado' : ''}" data-de="${esc(gk)}">
      <td class="sol-check"><input type="checkbox" data-sol-check="${i.id}" ${i.pendiente ? '' : 'checked'} ${i.descartado ? 'disabled' : ''} title="${i.pendiente ? 'Marcar comprado' : 'Desmarcar (no se compró)'}"></td>
      <td class="nw sol-cant">${esc(cantTxt(i.cantidad, i.unidad))}</td>
      <td>${i.numero ? `<a href="#/pedido/${i.pedido_id}">${esc(i.numero)}</a> ${esc(i.cliente || '')}` : 'Sin proyecto'}${i.ambiente ? ' · <b>' + esc(i.ambiente) + '</b>' : ''}${i.nota ? `<div class="l2">${esc(i.nota)}</div>` : ''}${parcial ? `<div class="l2 ambar-txt">Compradas ${esc(cantTxt(i.cantidad_comprada, i.unidad))}: faltan ${esc(cantTxt(i.cantidad - i.cantidad_comprada, i.unidad))}</div>` : ''}${!i.pendiente && !i.descartado ? `<div class="l2 gris">Comprado${i.comprado_por ? ' por ' + esc(i.comprado_por) : ''} ${fechaHora(i.comprado_en)}</div>` : ''}${i.descartado ? '<div class="l2 gris">Descartado: ya no se compra</div>' : ''}</td>
      <td class="nw no-imprimir">${i.pendiente ? `<button class="btn chico" data-sol-parte="${i.id}" title="Compraste menos de lo pedido para este proyecto">Parte</button>` : ''}${admin || (i.creado_por === yo.nombre && !i.cantidad_comprada) ? ` <button class="btn chico" data-sol-edit="${i.id}" title="Editar, descartar, mover o borrar">✎</button>` : ''}</td></tr>`;
  };
  const filaGrupo = g => {
    const parcial = g.comprado > 0 && g.pendiente, ids = g.items.filter(i => !i.descartado).map(i => i.id).join(',');
    return `<tr class="sol-total ${g.pendiente ? '' : 'comprado'}">
      <td class="sol-check"><input type="checkbox" data-sol-grupo="${ids}" ${g.pendiente ? '' : 'checked'} title="${g.pendiente ? 'Compré el total' : 'Desmarcar el total'}"></td>
      <td class="nw sol-cant"><b>${esc(cantTxt(g.total, g.unidad))}</b></td>
      <td><b>${esc(g.desc)}</b><div class="l2">Para ${g.proyectos.map(i => i.numero ? `${esc(i.numero)} ${esc(corto(i.cliente))}` : 'sin proyecto').join(', ')}</div>${parcial ? `<div class="l2 ambar-txt">Compradas ${esc(cantTxt(g.comprado, g.unidad))}: faltan ${esc(cantTxt(g.total - g.comprado, g.unidad))}</div>` : ''}</td>
      <td class="nw no-imprimir">${g.pendiente ? `<button class="btn chico" data-sol-grupo-parte="${ids}" data-total="${g.total}" data-unidad="${esc(g.unidad)}" data-desc="${esc(g.desc)}" title="Compraste menos del total: se reparte por proyecto y el resto queda pendiente">Parte</button> ` : ''}<button class="btn chico" data-sol-ver="${esc(g.k)}" title="Ver cuánto va a cada proyecto y ambiente">${g.items.length} ▾</button></td></tr>
      ${g.items.map(i => filaItem(i, g.k)).join('')}`;
  };
  return `<section class="seccion sol ${cerrada ? 'sol-cerrada' : ''}" data-sol="${s.id}">
    <div class="cab"><h2>${esc(s.proveedor || 'Proveedor por definir')} <span style="font-weight:400;color:var(--gris-2);font-size:13px">· ${fecha(s.fecha, true)}${s.proveedor_direccion ? ' · ' + esc(s.proveedor_direccion) : ''}</span></h2>
      <span class="chip ${cerrada ? 'verde' : pend < tot ? 'ambar' : ''}">${cerrada ? 'Todo comprado' : `${grupos.filter(g => g.pendiente).length} insumo${grupos.filter(g => g.pendiente).length === 1 ? '' : 's'} por comprar`}</span></div>
    ${s.nota ? `<div class="l2" style="margin:-4px 0 8px">${esc(s.nota)}</div>` : ''}
    <div class="sol-acciones no-imprimir">${!cerrada && pend ? `<button class="btn chico primario" data-sol-todo="${s.id}">Compré todo</button>` : ''}<button class="btn chico" data-sol-add="${s.id}">+ Agregar</button>
      ${contactos.map(c => `<a class="btn chico" target="_blank" rel="noopener" href="https://wa.me/${String(c.telefono).replace(/\D/g, '')}?text=${encodeURIComponent(textoSolicitud(s, c.categorias))}" title="WhatsApp con lo pendiente de su rubro">WhatsApp ${esc(c.nombre.split(' ')[0])} (${esc(c.rubro)})</a>`).join('')}
      <button class="btn chico" data-sol-copiar="${s.id}" title="Copia la lista de lo pendiente (totales) para mandarla por WhatsApp">Copiar lista</button>
      <button class="btn chico" data-sol-cab="${s.id}" title="Proveedor, fecha, nota y lo que costó">Datos${s.monto_pagado != null ? ' · ' + pesos(s.monto_pagado) : ''}</button></div>
    ${cats.map(c => `<h3 class="sol-cat">${esc(c)}</h3><div class="tabla-env"><table class="lista sol-tabla"><tbody>${grupos.filter(g => g.cat === c).map(filaGrupo).join('')}</tbody></table></div>`).join('')}
  </section>`;
}

// Texto para el proveedor: solo lo pendiente (y solo las categorías de ese contacto si se indican)
function textoSolicitud(s, categorias) {
  const items = s.items.filter(i => i.pendiente && (!categorias || !categorias.length || categorias.includes(i.categoria)));
  const suma = {}; items.forEach(i => { const k = i.descripcion + '|' + i.unidad; suma[k] = (suma[k] || 0) + Number(i.cantidad - i.cantidad_comprada); });
  return `Hola, te escribo de Santino Design. Necesito:\n${Object.entries(suma).map(([k, c]) => { const [d, u] = k.split('|'); return `- ${cantTxt(c, u)} ${d}`; }).join('\n')}\nGracias`;
}

function activarSolicitudes(raiz) {
  const sol = id => cache.solicitudes.find(s => s.id === Number(id));
  const item = id => cache.solicitudes.flatMap(s => s.items).find(i => i.id === Number(id));
  raiz.querySelectorAll('[data-sol-check]').forEach(cb => cb.onchange = async () => {
    const i = item(cb.dataset.solCheck);
    try { await rpc('marcar_item_comprado', { p_item_id: i.id, p_cantidad: cb.checked ? null : 0 }); aviso(cb.checked ? `Comprado: ${cantTxt(i.cantidad, i.unidad)} ${i.descripcion}` : 'Vuelve a pendiente'); vSolicitudes(); }
    catch (e) { cb.checked = !cb.checked; aviso(errorDe(e), true); }
  });
  raiz.querySelectorAll('[data-sol-ver]').forEach(b => b.onclick = () => raiz.querySelectorAll('tr[data-de]').forEach(tr => { if (tr.dataset.de === b.dataset.solVer) tr.classList.toggle('oculto'); }));
  raiz.querySelectorAll('[data-sol-grupo]').forEach(cb => cb.onchange = async () => {
    try { await rpc('marcar_grupo_comprado', { p_item_ids: cb.dataset.solGrupo.split(',').map(Number), p_cantidad: cb.checked ? null : 0 }); aviso(cb.checked ? 'Comprado el total' : 'Vuelve a pendiente'); vSolicitudes(); }
    catch (e) { cb.checked = !cb.checked; aviso(errorDe(e), true); }
  });
  raiz.querySelectorAll('[data-sol-grupo-parte]').forEach(b => b.onclick = () => {
    const d = b.dataset;
    modal(`<h2>¿Cuánto compraste?</h2><p>${esc(d.desc)}: el total es <b>${esc(cantTxt(d.total, d.unidad))}</b>. Lo comprado se reparte por proyecto en orden y lo que falte queda pendiente (en el desglose puedes corregir a qué proyecto va).</p>
      <form id="f"><label class="campo">Compradas (${esc(d.unidad)}) <input name="c" type="number" min="0" max="${d.total}" step="any" required autofocus></label>
      <div class="acciones"><button type="button" class="btn" onclick="cerrarModal()">Cancelar</button><button class="btn primario">Guardar</button></div></form>`);
    $('#f').onsubmit = async ev => { ev.preventDefault(); try { await rpc('marcar_grupo_comprado', { p_item_ids: d.solGrupoParte.split(',').map(Number), p_cantidad: Number(ev.target.c.value) }); cerrarModal(); aviso('Anotado'); vSolicitudes(); } catch (e) { aviso(errorDe(e), true); } };
  });
  raiz.querySelectorAll('[data-sol-parte]').forEach(b => b.onclick = () => {
    const i = item(b.dataset.solParte);
    modal(`<h2>¿Cuánto compraste?</h2><p>${esc(i.descripcion)}${i.ambiente ? ' · ' + esc(i.ambiente) : ''}: se pidieron <b>${esc(cantTxt(i.cantidad, i.unidad))}</b>. Lo que falte queda pendiente.</p>
      <form id="f"><label class="campo">Compradas (${esc(i.unidad)}) <input name="c" type="number" min="0" max="${i.cantidad}" step="any" value="${num(i.cantidad_comprada) || ''}" required autofocus></label>
      <div class="acciones"><button type="button" class="btn" onclick="cerrarModal()">Cancelar</button><button class="btn primario">Guardar</button></div></form>`);
    $('#f').onsubmit = async ev => { ev.preventDefault(); try { await rpc('marcar_item_comprado', { p_item_id: i.id, p_cantidad: Number(ev.target.c.value) }); cerrarModal(); aviso('Anotado'); vSolicitudes(); } catch (e) { aviso(errorDe(e), true); } };
  });
  raiz.querySelectorAll('[data-sol-todo]').forEach(b => b.onclick = async () => {
    const s = sol(b.dataset.solTodo);
    if (!confirm(`¿Compraste todo lo pendiente de ${s.proveedor || 'esta solicitud'} (${s.pendientes} ítem${s.pendientes > 1 ? 's' : ''})?`)) return;
    try { await rpc('marcar_solicitud_comprada', { p_id: s.id }); aviso('Todo marcado como comprado'); vSolicitudes(); } catch (e) { aviso(errorDe(e), true); }
  });
  raiz.querySelectorAll('[data-sol-add]').forEach(b => b.onclick = () => formItems(sol(b.dataset.solAdd)));
  raiz.querySelectorAll('[data-sol-cab]').forEach(b => b.onclick = () => formSolicitud(sol(b.dataset.solCab)));
  raiz.querySelectorAll('[data-sol-edit]').forEach(b => b.onclick = () => formItemSolicitud(item(b.dataset.solEdit)));
  raiz.querySelectorAll('[data-sol-copiar]').forEach(b => b.onclick = async () => {
    try { await navigator.clipboard.writeText(textoSolicitud(sol(b.dataset.solCopiar))); aviso('Lista copiada: pégala en WhatsApp'); } catch (e) { aviso('No se pudo copiar', true); }
  });
}

async function sugerenciasSolicitud() {
  if (!cache.solSug) cache.solSug = await rpc('solicitud_sugerencias', {});
  return cache.solSug;
}

async function formSolicitud(s) {
  const sug = await sugerenciasSolicitud(); const admin = yo.rol === 'admin';
  const hoy = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
  modal(`<h2>${s ? 'Datos de la solicitud' : 'Nueva solicitud de compra'}</h2><form id="f"><div class="campos">
    <label class="campo">Proveedor <select name="proveedor_id"><option value="">(por definir)</option>${sug.proveedores.map(p => `<option value="${p.id}" ${s && s.proveedor_id === p.id ? 'selected' : ''}>${esc(p.nombre)}</option>`).join('')}</select></label>
    <label class="campo">Día de compra <input name="fecha" type="date" value="${s ? s.fecha : hoy}"></label>
    <label class="campo" style="grid-column:1/-1">Nota <input name="nota" value="${esc(s && s.nota || '')}" placeholder="ej. herrajes para Sara"></label>
    ${s ? `<label class="campo">Lo que costó (boleta, $) <input name="monto_pagado" type="number" min="0" step="1" value="${s.monto_pagado != null ? s.monto_pagado : ''}"></label>` : ''}
  </div><div class="acciones">${s && admin ? '<button type="button" class="btn" id="f-borrar" style="margin-right:auto;color:var(--rojo)">Borrar solicitud</button>' : ''}<button type="button" class="btn" onclick="cerrarModal()">Cancelar</button><button class="btn primario">${s ? 'Guardar' : 'Crear y agregar ítems'}</button></div></form>`);
  $('#f').onsubmit = async ev => { ev.preventDefault(); const d = Object.fromEntries(new FormData(ev.target).entries());
    try { const id = await rpc('guardar_solicitud', { p_id: s ? s.id : null, p_datos: d }); cerrarModal(); await vSolicitudes(); if (!s) formItems(cache.solicitudes.find(x => x.id === id)); else aviso('Guardado'); } catch (e) { aviso(errorDe(e), true); } };
  const bb = $('#f-borrar'); if (bb) bb.onclick = async () => { if (!confirm('¿Borrar la solicitud completa?')) return; try { await rpc('borrar_solicitud', { p_id: s.id }); cerrarModal(); aviso('Solicitud borrada'); vSolicitudes(); } catch (e) { aviso(errorDe(e), true); } };
}

// Agregar varias líneas de una vez; el nombre sugiere unidad y categoría (catálogo de insumos y lo ya pedido antes)
async function formItems(s) {
  const sug = await sugerenciasSolicitud();
  const opciones = [...sug.insumos.map(i => ({ d: i.nombre, u: i.unidad, c: ({ herraje: 'Herrajes y ferretería', madera: 'Madera', pintura: 'Barniz y pintura', embalaje: 'Embalaje', tela: 'Telas', tablero: 'Planchas y tapacantos', tapacanto: 'Planchas y tapacantos', iluminacion: 'Iluminación' })[i.categoria] || 'Otros' })),
    ...sug.historial.map(h => ({ d: h.descripcion, u: h.unidad, c: h.categoria }))];
  const porNombre = {}; opciones.forEach(o => { if (!porNombre[o.d.toLowerCase()]) porNombre[o.d.toLowerCase()] = o; });
  const ultimoProy = (s.items[s.items.length - 1] || {}).pedido_id || '';
  const ambientes = [...new Set(s.items.map(i => i.ambiente).filter(Boolean))];
  const linea = () => `<div class="sol-linea">
    <select name="categoria">${CATEGORIAS_SOLICITUD.map(c => `<option>${c}</option>`).join('')}</select>
    <input name="cantidad" type="number" min="0" step="any" placeholder="Cant." style="width:70px">
    <select name="unidad">${UNIDADES_SOLICITUD.map(u => `<option>${u}</option>`).join('')}</select>
    <input name="descripcion" list="sol-dl" placeholder="Qué comprar (ej. Bisagra semicurva)" style="flex:1;min-width:180px">
    <select name="pedido_id"><option value="">Sin proyecto</option>${sug.proyectos.map(p => `<option value="${p.id}" ${p.id === ultimoProy ? 'selected' : ''}>${esc(p.numero)} ${esc(p.cliente)}</option>`).join('')}</select>
    <input name="ambiente" list="sol-amb" placeholder="Ambiente (opcional)" style="width:150px"></div>`;
  modal(`<h2>Agregar a ${esc(s.proveedor || 'la solicitud')} · ${fecha(s.fecha)}</h2>
    <datalist id="sol-dl">${Object.values(porNombre).map(o => `<option value="${esc(o.d)}">`).join('')}</datalist>
    <datalist id="sol-amb">${ambientes.map(a => `<option value="${esc(a)}">`).join('')}</datalist>
    <form id="f"><div id="sol-lineas">${linea()}</div>
    <button type="button" class="btn chico" id="sol-mas" style="margin-top:6px">+ Otra línea</button>
    <div class="acciones"><button type="button" class="btn" onclick="cerrarModal()">Cancelar</button><button class="btn primario">Agregar</button></div></form>`, 'ancha');
  const autocompletar = div => { const d = div.querySelector('[name=descripcion]'); d.onchange = () => { const o = porNombre[d.value.trim().toLowerCase()]; if (o) { div.querySelector('[name=unidad]').value = o.u; div.querySelector('[name=categoria]').value = o.c; } }; };
  $$('.sol-linea').forEach(autocompletar);
  $('#sol-mas').onclick = () => { const cont = $('#sol-lineas'); const prev = cont.lastElementChild; cont.insertAdjacentHTML('beforeend', linea()); const nueva = cont.lastElementChild;
    ['categoria', 'pedido_id', 'ambiente'].forEach(k => { nueva.querySelector(`[name=${k}]`).value = prev.querySelector(`[name=${k}]`).value; }); autocompletar(nueva); nueva.querySelector('[name=cantidad]').focus(); };
  $('#f').onsubmit = async ev => { ev.preventDefault();
    const items = $$('.sol-linea').map(div => Object.fromEntries([...div.querySelectorAll('[name]')].map(x => [x.name, x.value.trim()]))).filter(x => x.descripcion);
    if (!items.length) return aviso('Escribe qué comprar', true);
    if (items.some(x => !(Number(x.cantidad) > 0))) return aviso('Falta la cantidad en alguna línea', true);
    try { await rpc('agregar_items_solicitud', { p_solicitud_id: s.id, p_items: items }); cache.solSug = null; cerrarModal(); aviso(`${items.length} ítem${items.length > 1 ? 's' : ''} agregado${items.length > 1 ? 's' : ''}`); vSolicitudes(); } catch (e) { aviso(errorDe(e), true); } };
}

async function formItemSolicitud(i) {
  const sug = await sugerenciasSolicitud(); const otras = cache.solicitudes.filter(s => s.id !== cache.solicitudes.find(x => x.items.includes(i)).id && !s.cerrada_en);
  modal(`<h2>Editar ítem</h2><form id="f"><div class="campos">
    <label class="campo" style="grid-column:1/-1">Qué comprar <input name="descripcion" value="${esc(i.descripcion)}" required></label>
    <label class="campo">Categoría <select name="categoria">${CATEGORIAS_SOLICITUD.map(c => `<option ${c === i.categoria ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
    <label class="campo">Cantidad <input name="cantidad" type="number" min="0" step="any" value="${num(i.cantidad)}"></label>
    <label class="campo">Unidad <select name="unidad">${UNIDADES_SOLICITUD.map(u => `<option ${u === i.unidad ? 'selected' : ''}>${u}</option>`).join('')}</select></label>
    <label class="campo">Proyecto <select name="pedido_id"><option value="">Sin proyecto</option>${sug.proyectos.map(p => `<option value="${p.id}" ${p.id === i.pedido_id ? 'selected' : ''}>${esc(p.numero)} ${esc(p.cliente)}</option>`).join('')}</select></label>
    <label class="campo">Ambiente <input name="ambiente" value="${esc(i.ambiente || '')}"></label>
    <label class="campo" style="grid-column:1/-1">Nota <input name="nota" value="${esc(i.nota || '')}"></label>
    ${i.pendiente && otras.length ? `<label class="campo" style="grid-column:1/-1">Pasar a otra solicitud <select name="solicitud_id"><option value="">(se queda aquí)</option>${otras.map(s => `<option value="${s.id}">${esc(s.proveedor || 'Por definir')} · ${fecha(s.fecha)}</option>`).join('')}</select></label>` : ''}
  </div><div class="acciones"><button type="button" class="btn" id="f-borrar" style="margin-right:auto;color:var(--rojo)">Borrar</button>${yo.rol === 'admin' && i.pendiente ? '<button type="button" class="btn" id="f-desc">Ya no se compra</button>' : ''}<button type="button" class="btn" onclick="cerrarModal()">Cancelar</button><button class="btn primario">Guardar</button></div></form>`, 'ancha');
  const guardar = async d => { try { await rpc('editar_item_solicitud', { p_item_id: i.id, p_datos: d }); cerrarModal(); aviso('Listo'); vSolicitudes(); } catch (e) { aviso(errorDe(e), true); } };
  $('#f').onsubmit = ev => { ev.preventDefault(); guardar(Object.fromEntries(new FormData(ev.target).entries())); };
  $('#f-borrar').onclick = () => { if (confirm(`¿Borrar "${i.descripcion}"?`)) guardar({ borrar: true }); };
  const bd = $('#f-desc'); if (bd) bd.onclick = () => guardar({ descartado: true });
}

/* Hoja por proyecto (Harold 21-oct: "más adelante él imprimirá los insumos de cada proyecto y el maestro lo deberá firmar"):
   una hoja por proyecto con lo de las solicitudes abiertas y de los últimos días, por ambiente, con firma de recepción del maestro. */
async function vSolicitudesImprimir() {
  const lista = await rpc('solicitudes_json', { p_cerradas: false }) || [];
  const porProy = {};
  lista.forEach(s => s.items.filter(i => !i.descartado && i.pedido_id).forEach(i => { (porProy[i.pedido_id] = porProy[i.pedido_id] || { numero: i.numero, cliente: i.cliente, items: [] }).items.push({ ...i, proveedor: s.proveedor }); }));
  const proys = Object.values(porProy).sort((a, b) => a.numero.localeCompare(b.numero));
  const hoja = p => `<div class="sol-hoja"><div class="sol-hoja-cab"><img src="logo.png" alt="Santino Design" style="height:34px"><div><h2 style="margin:0">Insumos del proyecto ${esc(p.numero)} · ${esc(p.cliente)}</h2><div class="l2">Impreso ${fecha(new Date().toISOString(), true)}</div></div></div>
    <table class="lista"><thead><tr><th>Cantidad</th><th>Insumo</th><th>Ambiente</th><th>Estado</th><th>Entregado ✓</th></tr></thead><tbody>${p.items.map(i => `<tr><td class="nw"><b>${esc(cantTxt(i.cantidad, i.unidad))}</b></td><td>${esc(i.descripcion)}${i.nota ? `<div class="l2">${esc(i.nota)}</div>` : ''}</td><td>${esc(i.ambiente || 'General')}</td><td class="nw">${i.pendiente ? (i.cantidad_comprada > 0 ? `Faltan ${esc(cantTxt(i.cantidad - i.cantidad_comprada, i.unidad))}` : 'Por comprar') : 'Comprado'}</td><td style="width:90px"></td></tr>`).join('')}</tbody></table>
    <div class="sol-firma"><div>Recibí conforme (maestro): ______________________________</div><div>Firma: ____________________</div><div>Fecha: ____ / ____ / ______</div></div></div>`;
  app.innerHTML = barra('#/compras') + `<div class="sub no-imprimir"><a href="#/compras/solicitudes" class="btn chico">← Por comprar</a><button class="btn chico primario" onclick="window.print()">Imprimir</button><span>Una hoja por proyecto con sus insumos, para armar la caja de cada maestro y que firme al recibirla.</span></div>
    <div class="contenido">${proys.length ? proys.map(hoja).join('') : '<section class="seccion gris">No hay insumos de proyectos en las solicitudes abiertas.</section>'}</div>`;
}
