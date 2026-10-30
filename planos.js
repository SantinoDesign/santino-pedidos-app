/* Planos de bases para el taller (Harold 30-oct-2026: "pasa este estilo al PLANO BASE de la app empezando por la Trama, con la lista de corte
   de piezas, y después rehaz la Sobremesa"). Estilo nacido de la prueba con el repo dimensional-drawing (MIT) y corregido por Harold:
   varias vistas en una lámina (frontal, lateral, desde arriba, explotada y detalle), cotas una sola vez, letra grande para maestros con lentes
   (R-362), siempre en blanco y negro (relleno blanco, achurado negro), logo de Santino Design en blanco y negro, sin "escala referencial".
   Estándar: 00_Config/plantillas/plano_produccion/ESTANDAR_PLANOS_PRODUCCION.md. Medidas de la lámina en mm.
   Funciones puras: reciben las medidas y los datos del cajetín y devuelven el SVG; app.js las llama desde PLANOS_BASE. */
(function () {
  const VW = 1700, VH = 1202;                            // A4 horizontal (297 x 210 mm): 1 unidad = 0,175 mm
  const escT = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const mm = v => String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const CSS = `.border{fill:none;stroke:#000;stroke-width:1.6}.obj{fill:#fff;stroke:#000;stroke-width:2.2;stroke-linejoin:round}
    .pz{fill:#fff;stroke:#000;stroke-width:1.8;stroke-linejoin:round}.lis{fill:#fff;stroke:#000;stroke-width:1}.bar{fill:url(#hat);stroke:#000;stroke-width:1.8;stroke-linejoin:round}
    .hole{fill:none;stroke:#000;stroke-width:1.1;stroke-dasharray:4 3}.tpl{fill:none;stroke:#000;stroke-width:1.2;stroke-dasharray:10 5}
    .cl{fill:none;stroke:#000;stroke-width:.9;stroke-dasharray:18 4 3 4}.floor{stroke:#000;stroke-width:1.2}.dl{stroke:#000;stroke-width:1;fill:none}
    .ext{stroke:#000;stroke-width:.8;fill:none}.lead{stroke:#000;stroke-width:1;fill:none}.dot{fill:#000}.thin{fill:none;stroke:#000;stroke-width:1.2}
    text{font-family:Arimo,'Helvetica Neue',Helvetica,Arial,sans-serif;fill:#000}
    .dt{font-size:22px;paint-order:stroke;stroke:#fff;stroke-width:5px;stroke-linejoin:round}.lb{font-size:20px;letter-spacing:.5px;paint-order:stroke;stroke:#fff;stroke-width:4px}
    .vt{font-size:22px;font-weight:700;letter-spacing:2px}.th{font-size:18px;font-weight:700;letter-spacing:.5px}.td{font-size:20px}
    .ck{font-size:15px;letter-spacing:.8px}.cv{font-size:20px;letter-spacing:.4px}`;
  const DEFS = `<defs><marker id="ar" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="10" markerHeight="10" orient="auto-start-reverse" markerUnits="userSpaceOnUse"><path d="M0,1.7 L10,5 L0,8.3 z"/></marker>
    <pattern id="hat" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#fff"/><line x1="0" y1="0" x2="0" y2="6" stroke="#000" stroke-width="1.2"/></pattern></defs>`;

  /* ---------- kit de dibujo (todo en unidades de la hoja) ---------- */
  function hoja() {
    const L = [], f = v => (+v).toFixed(1), anchoTxt = (s, fs) => String(s).length * fs * 0.7;
    const k = {
      line: (x1, y1, x2, y2, c = 'thin') => L.push(`<line class="${c}" x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}"/>`),
      poly: (pts, c = 'pz') => L.push(`<polygon class="${c}" points="${pts.map(q => f(q[0]) + ',' + f(q[1])).join(' ')}"/>`),
      rect: (x, y, w, h, c = 'pz') => L.push(`<rect class="${c}" x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}"/>`),
      circle: (cx, cy, r, c = 'pz') => L.push(`<circle class="${c}" cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}"/>`),
      text: (x, y, s, c = 'lb', anc = 'start', rot = 0) => L.push(`<text class="${c}" x="${f(x)}" y="${f(y)}" text-anchor="${anc}"${rot ? ` transform="rotate(${rot} ${f(x)} ${f(y)})"` : ''}>${escT(s)}</text>`),
      raw: s => L.push(s),
      dimH(x1, x2, y, e1, e2, s, below) {
        [[x1, e1], [x2, e2]].forEach(([x, e]) => { if (e == null) return; const g = Math.sign(y - e) || 1; k.line(x, e + g * 4, x, y + g * 7, 'ext'); });
        L.push(`<line class="dl" x1="${f(x1)}" y1="${f(y)}" x2="${f(x2)}" y2="${f(y)}" marker-start="url(#ar)" marker-end="url(#ar)"/>`);
        k.text((x1 + x2) / 2, below ? y + 23 : y - 7, s, 'dt', 'middle');
      },
      dimV(y1, y2, x, e1, e2, s, side) {
        [[y1, e1], [y2, e2]].forEach(([y, e]) => { if (e == null) return; const g = Math.sign(x - e) || 1; k.line(e + g * 4, y, x + g * 7, y, 'ext'); });
        const c = (y1 + y2) / 2;
        if (y2 - y1 >= 30) L.push(`<line class="dl" x1="${f(x)}" y1="${f(y1)}" x2="${f(x)}" y2="${f(y2)}" marker-start="url(#ar)" marker-end="url(#ar)"/>`);
        else { L.push(`<line class="dl" x1="${f(x)}" y1="${f(y1 - 16)}" x2="${f(x)}" y2="${f(y1)}" marker-end="url(#ar)"/><line class="dl" x1="${f(x)}" y1="${f(y2 + 16)}" x2="${f(x)}" y2="${f(y2)}" marker-end="url(#ar)"/>`); k.line(x, y1, x, y2, 'dl'); }
        if (side) k.text(side === 'r' ? x + 8 : x - 8, c + 7, s, 'dt', side === 'r' ? 'start' : 'end');
        else k.text(x - 7, c, s, 'dt', 'middle', -90);
      },
      // indicación: texto en (x,y) y línea desde el final del texto hasta el punto (px,py)
      lab(px, py, x, y, s) { const t = String(s).toUpperCase(); k.text(x, y, t); k.circle(px, py, 2.6, 'dot'); k.line(px < x ? x - 6 : x + anchoTxt(t, 20) + 6, y - 7, px, py, 'lead'); },
      // indicación con línea que entra por la izquierda del texto (para textos a la derecha del dibujo)
      tag(px, py, x, lineas) { k.circle(px, py, 2.6, 'dot'); k.line(px, py, x, py, 'lead'); lineas.forEach((t, i) => k.text(x + 8, py + 7 + i * 22, String(t).toUpperCase())); },
      title: (x, y, s) => k.text(x, y, String(s).toUpperCase(), 'vt', 'middle'),
      tabla(x, y, titulo, cols, filas) {   // cols: [[encabezado, ancho]]
        const rh = 29, w = cols.reduce((a, c) => a + c[1], 0);
        k.text(x, y, String(titulo).toUpperCase(), 'vt');
        let cx = x; cols.forEach(([h, cw]) => { k.text(cx + 8, y + 32, String(h).toUpperCase(), 'th'); cx += cw; });
        k.line(x, y + 41, x + w, y + 41, 'thin');
        filas.forEach((r, i) => { let c2 = x; r.forEach((v, j) => { k.text(c2 + 8, y + 41 + (i + 1) * rh - 9, v, 'td'); c2 += cols[j][1]; }); k.line(x, y + 41 + (i + 1) * rh, x + w, y + 41 + (i + 1) * rh, 'ext'); });
      },
      cajetin(info) {   // info: { logo, proyecto, mueble:[l1,l2], material:[l1,l2], fecha, version, lamina }
        const y = VH - 112, h = 82, celdas = [];
        if (info.proyecto) celdas.push(['Proyecto', info.proyecto]);
        celdas.push(['Mueble', info.mueble], ['Material', info.material], ['Medidas', ['En mm']], ['Fecha', [info.fecha, `${info.version} · lám. ${info.lamina || '1 de 1'}`]], ['Revisado maestro', ['']]);
        const libre = 1660 - 290, anchos = celdas.map(([n, v]) => Math.max(110, anchoTxt(n, 15) + 30, ...v.map(t => anchoTxt(String(t).toUpperCase(), 20) + 30)));
        anchos[anchos.length - 1] = 0; const suma = anchos.reduce((a, b) => a + b, 0), resto = libre - 195;
        if (suma > resto) anchos.forEach((w, i) => { anchos[i] = w * resto / suma; }); anchos[anchos.length - 1] = libre - Math.min(suma, resto);
        k.rect(40, y, 1620, h, 'thin');
        if (info.logo) L.push(`<image href="${info.logo}" x="52" y="${y + 17}" width="226" height="46.7" preserveAspectRatio="xMidYMid meet"/>`);
        let x = 290; celdas.forEach(([n, v], i) => { k.line(x, y, x, y + h, 'thin'); k.text(x + 14, y + 22, n.toUpperCase(), 'ck'); v.forEach((t, j) => k.text(x + 14, y + 48 + j * 22, String(t).toUpperCase(), 'cv')); x += anchos[i]; });
      },
      svg: () => `<svg xmlns="http://www.w3.org/2000/svg" width="297mm" height="210mm" viewBox="0 0 ${VW} ${VH}"><style>${CSS}</style>${DEFS}<rect width="${VW}" height="${VH}" fill="#fff"/><rect class="border" x="20" y="20" width="${VW - 40}" height="${VH - 40}" rx="16"/>${L.join('')}</svg>`
    };
    return k;
  }
  // estadio (óvalo de la Trama): dos semicírculos unidos por rectas; puntos en sentido antihorario partiendo abajo a la derecha
  function estadio(Lg, An, n) {
    const r = An / 2, s = Lg / 2 - r, P = 2 * Math.PI * r + 4 * s, o = [];
    for (let i = 0; i < n; i++) { let t = i / n * P;
      if (t < Math.PI * r) { const a = -Math.PI / 2 + t / r; o.push([s + r * Math.cos(a), r * Math.sin(a)]); continue; } t -= Math.PI * r;
      if (t < 2 * s) { o.push([s - t, r]); continue; } t -= 2 * s;
      if (t < Math.PI * r) { const a = Math.PI / 2 + t / r; o.push([-s + r * Math.cos(a), r * Math.sin(a)]); continue; } t -= Math.PI * r; o.push([-s + t, -r]); }
    return o;
  }
  // proyección de la vista explotada (axonométrica); y del objeto hacia el fondo, z hacia arriba
  const iso = (TX, TY, s) => (x, y, z) => [TX + (0.94 * x - 0.34 * y) * s, TY + (-0.17 * x - 0.47 * y) * s - z * s];

  /* =================================================================================================
     TRAMA. Medidas en cm (las cotas salen en mm). Construcción (Harold 29-oct-2026): listones de 2 x 2 separados y verticales, por fuera de
     un techo ovalado de una pieza (arriba) y de 2 orejas unidas por 2 largueros (abajo, centro libre para la plantilla); 2 barras de 3,4
     injertadas en la base, perforadas para anclar la cubierta, con las puntas a 45°. abajo y arriba = medidas finales por fuera de los listones.
     m: { cubL, cubA, espCub, alto (base), abajoL, abajoA, arribaL, arribaA, esp (mm), barraL, barraA, barraX } (cm salvo esp)
     ================================================================================================= */
  function laminaTrama(m, info) {
    const k = hoja();
    const CL = m.cubL, CA = m.cubA, EC = m.espCub, HB = m.alto, HT = HB + EC, LS = 2, LC = LS / 2;
    const TS = (m.arribaL - m.arribaA) / 2, TR = m.arribaA / 2 - LS, BS = (m.abajoL - m.abajoA) / 2, BR = m.abajoA / 2 - LS;
    const BAR = { x: m.barraX, L: m.barraL, w: m.barraA };
    const paso = 2.64, NS = Math.max(1, Math.round(2 * TS / paso)), NA = Math.max(2, Math.round(Math.PI * TR / paso));
    const dB = Math.max(0, BS - TS);
    const curvaAbajo = u => { const r = BR + LC, len = 2 * dB + Math.PI * r; let t = u * len; if (t < dB) return [TS + t, -r]; t -= dB;
      if (t < Math.PI * r) { const a = -Math.PI / 2 + t / r; return [BS + r * Math.cos(a), r * Math.sin(a)]; } t -= Math.PI * r; return [BS - t, r]; };
    const LIS = [];
    for (const sy of [-1, 1]) for (let i = 0; i < NS; i++) { const x = -TS + (i + 0.5) * 2 * TS / NS; LIS.push({ t: [x, sy * (TR + LC)], b: [x, sy * (BR + LC)], ang: sy * Math.PI / 2 }); }
    for (const sx of [-1, 1]) for (let j = 0; j < NA; j++) { const u = (j + 0.5) / NA, a = -Math.PI / 2 + Math.PI * u, t = [TS + (TR + LC) * Math.cos(a), (TR + LC) * Math.sin(a)], b = curvaAbajo(u);
      LIS.push({ t: [sx * t[0], t[1]], b: [sx * b[0], b[1]], ang: sx > 0 ? a : Math.PI - a }); }
    const anchoAp = a => Math.abs(Math.cos(a)) + Math.abs(Math.sin(a));   // medio ancho aparente de un listón 2 x 2 girado
    const T = v => mm(v * 10);

    // VISTA FRONTAL
    { const kf = Math.min(3, 640 / CL, 235 / HT), X0 = 405, TOP = 120, X = x => X0 + x * kf, Y = z => TOP + (HT - z) * kf, FL = Y(0);
      k.line(X(-CL / 2 - 10), FL, X(CL / 2 + 10), FL, 'floor');
      LIS.filter(l => l.t[1] <= 0 || Math.abs(l.t[0]) > TS).sort((p, q) => q.t[1] - p.t[1]).forEach(l => { const h = anchoAp(l.ang);
        k.poly([[X(l.b[0] - h), FL], [X(l.b[0] + h), FL], [X(l.t[0] + h), Y(HB)], [X(l.t[0] - h), Y(HB)]], 'lis'); });
      [-1, 1].forEach(s => k.rect(X(s * BAR.x - BAR.w / 2), Y(HB), BAR.w * kf, EC * kf, 'bar'));
      k.rect(X(-CL / 2), Y(HT), CL * kf, EC * kf, 'obj');
      k.line(X(0), Y(HT) - 12, X(0), FL + 12, 'cl');
      k.dimH(X(-CL / 2), X(CL / 2), Y(HT) - 46, Y(HT), Y(HT), T(CL));
      k.dimH(X(-m.arribaL / 2), X(m.arribaL / 2), Y(HT) - 18, Y(HB), Y(HB), T(m.arribaL));
      k.dimH(X(-m.abajoL / 2), X(m.abajoL / 2), FL + 32, FL, FL, T(m.abajoL), true);
      k.dimV(Y(HT), FL, X(-CL / 2) - 30, X(-CL / 2), X(-m.abajoL / 2 - 2), T(HT));
      k.dimV(Y(HB), FL, X(-m.abajoL / 2) - 18, null, null, T(HB), 'l');
      k.dimV(Y(HT), Y(HB), X(CL / 2) + 22, X(CL / 2), X(CL / 2), T(EC), 'r');
      k.title(X0, FL + 92, 'Vista frontal'); }

    // VISTA LATERAL
    { const kf = Math.min(3, 640 / CL, 235 / HT), X0 = 1030, TOP = 120, X = y => X0 + y * kf, Y = z => TOP + (HT - z) * kf, FL = Y(0), e = EC, fl = 1, L = BAR.L / 2;
      k.line(X(-CA / 2 - 10), FL, X(CA / 2 + 10), FL, 'floor');
      k.poly([[X(-L), Y(HB)], [X(L), Y(HB)], [X(L), Y(HB - fl)], [X(L - (e - fl)), Y(HB - e)], [X(-L + (e - fl)), Y(HB - e)], [X(-L), Y(HB - fl)]], 'bar');
      [-1, 1].forEach(s => k.line(X(s * (L - 6)), Y(HB), X(s * (L - 6)), Y(HB - e), 'hole'));
      LIS.filter(l => l.t[0] >= 0).sort((p, q) => p.t[0] - q.t[0]).forEach(l => { const h = anchoAp(l.ang);
        k.poly([[X(l.b[1] - h), FL], [X(l.b[1] + h), FL], [X(l.t[1] + h), Y(HB)], [X(l.t[1] - h), Y(HB)]], 'lis'); });
      k.rect(X(-CA / 2), Y(HT), CA * kf, EC * kf, 'obj');
      k.line(X(0), Y(HT) - 12, X(0), FL + 12, 'cl');
      k.dimH(X(-CA / 2), X(CA / 2), Y(HT) - 46, Y(HT), Y(HT), T(CA));
      k.dimH(X(-m.arribaA / 2), X(m.arribaA / 2), Y(HT) - 18, Y(HB), Y(HB), T(m.arribaA));
      k.dimH(X(-m.abajoA / 2), X(m.abajoA / 2), FL + 32, FL, FL, T(m.abajoA), true);
      k.title(X0, FL + 92, 'Vista lateral'); }

    // VISTA EXPLOTADA
    { const s = Math.min(1.15, 250 / CL), pr = iso(1335, 390, s), ring = (pts, z, c) => k.poly(pts.map(q => pr(q[0], q[1], z)), c), LX = 1525;
      const oreja = sx => { const o = []; for (let i = 0; i <= 24; i++) { const a = -Math.PI / 2 + Math.PI * i / 24; o.push([sx * (BS + BR * Math.cos(a)), BR * Math.sin(a)]); } return o; };
      ring(oreja(1), 0, 'pz'); ring(oreja(-1), 0, 'pz');
      [-1, 1].forEach(sy => ring([[-BS, sy * BR], [BS, sy * BR], [BS, sy * (BR - 4)], [-BS, sy * (BR - 4)]], 0, 'pz'));
      LIS.slice().sort((p, q) => (q.t[1] - q.t[0] * 0.3) - (p.t[1] - p.t[0] * 0.3)).forEach(l => { const a = pr(l.b[0], l.b[1], 0), b = pr(l.t[0], l.t[1], HB);
        k.raw(`<line class="lis" stroke-width="2.2" x1="${a[0].toFixed(1)}" y1="${a[1].toFixed(1)}" x2="${b[0].toFixed(1)}" y2="${b[1].toFixed(1)}"/>`); });
      const ZT = HB + 12, ZB = HB + 52, ZC = HB + 84;
      ring(estadio(2 * (TS + TR), 2 * TR, 120), ZT, 'pz');
      [-1, 1].forEach(sx => ring([[sx * BAR.x - BAR.w / 2, -BAR.L / 2], [sx * BAR.x + BAR.w / 2, -BAR.L / 2], [sx * BAR.x + BAR.w / 2, BAR.L / 2], [sx * BAR.x - BAR.w / 2, BAR.L / 2]], ZB, 'bar'));
      ring(estadio(CL, CA, 160), ZC, 'obj');
      k.tag(...pr(CL / 2, 0, ZC), LX, ['Cubierta']);
      k.tag(...pr(BAR.x + BAR.w / 2, -BAR.L / 2 + 3, ZB), LX, ['Barras']);
      k.tag(...pr(TS + TR, 0, ZT), LX, ['Techo']);
      k.tag(...pr(TS + TR + LC, 0, HB * 0.55), LX, ['Listones']);
      k.tag(...pr(BS + BR, 0, 0), LX, ['Orejas y', 'largueros']);
      k.title(1400, 446, 'Vista explotada'); }

    // ARRIBA: TECHO Y BARRAS, VISTA DESDE ARRIBA
    const kp = Math.min(2.6, 300 / m.arribaL, 420 / m.abajoL, 170 / BAR.L, 120 / m.abajoA);
    const cuadro = (c, a, h) => { const ca = Math.cos(a), sa = Math.sin(a); return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => [c[0] + (u * ca - v * sa) * h, c[1] - (u * sa + v * ca) * h]); };
    { const CX = 270, CY = 670, X = x => CX + x * kp, Y = y => CY - y * kp;
      k.poly(estadio(2 * (TS + TR), 2 * TR, 160).map(q => [X(q[0]), Y(q[1])]), 'pz');
      LIS.forEach(l => k.poly(cuadro([X(l.t[0]), Y(l.t[1])], l.ang, kp), 'lis'));
      [-1, 1].forEach(sx => k.rect(X(sx * BAR.x - BAR.w / 2), Y(BAR.L / 2), BAR.w * kp, BAR.L * kp, 'bar'));
      k.line(X(-(TS + TR) - 10), Y(0), X(TS + TR + 10), Y(0), 'cl');
      k.dimH(X(-(TS + TR)), X(TS + TR), Y(-BAR.L / 2) + 26, Y(0), Y(0), T(2 * (TS + TR)), true);
      k.dimH(X(-BAR.x), X(BAR.x), Y(BAR.L / 2) - 14, Y(BAR.L / 2), Y(BAR.L / 2), T(2 * BAR.x));
      k.dimV(Y(BAR.L / 2), Y(-BAR.L / 2), X(-(TS + TR)) - 26, X(-BAR.x - BAR.w / 2), X(-BAR.x - BAR.w / 2), T(BAR.L));
      k.dimV(Y(TR), Y(-TR), X(TS + TR) + 44, X(TS + TR * 0.5), X(TS + TR * 0.5), T(2 * TR), 'r');
      k.lab(X(12), Y(TR + LC), 60, 508, 'Listones 2 x 2 separados');
      k.lab(X(-12), Y(0), 60, 540, 'Techo: 1 pieza');
      k.title(CX, 840, 'Arriba · vista desde arriba'); }

    // ABAJO: OREJAS Y LARGUEROS, VISTA DESDE ARRIBA
    { const CX = 760, CY = 670, X = x => CX + x * kp, Y = y => CY - y * kp;
      [-1, 1].forEach(sx => { const o = []; for (let i = 0; i <= 30; i++) { const a = -Math.PI / 2 + Math.PI * i / 30; o.push([X(sx * (BS + BR * Math.cos(a))), Y(BR * Math.sin(a))]); } k.poly(o, 'pz'); });
      [-1, 1].forEach(sy => k.rect(X(-BS), Y(sy > 0 ? BR : -(BR - 4)), 2 * BS * kp, 4 * kp, 'pz'));
      k.rect(X(-BS + 6), Y(BR - 8), (2 * BS - 12) * kp, (2 * BR - 16) * kp, 'tpl');
      k.text(X(0), Y(0) + 7, 'PLANTILLA', 'lb', 'middle');
      LIS.forEach(l => k.poly(cuadro([X(l.b[0]), Y(l.b[1])], l.ang, kp), 'lis'));
      k.dimH(X(-BS), X(BS), Y(BR + 2) - 30, Y(BR), Y(BR), T(2 * BS));
      k.dimH(X(-(BS + BR)), X(BS + BR), Y(-(BR + 2)) + 30, Y(0), Y(0), T(2 * (BS + BR)), true);
      k.dimV(Y(BR), Y(-BR), X(BS + BR) + 22, X(BS + BR * 0.3), X(BS + BR * 0.3), T(2 * BR), 'r');
      k.lab(X(30), Y(BR - 2), 560, 540, '2 orejas + 2 largueros');
      k.title(CX, 840, 'Abajo · vista desde arriba'); }

    // PUNTA DE LA BARRA
    { const kd = 7, X0 = 1130, Y0 = 690, e = EC, fl = 1, len = 24, X = x => X0 + x * kd, Y = z => Y0 - z * kd, hx = X(len - 8);
      k.poly([[X(0), Y(e)], [X(len), Y(e)], [X(len), Y(e - fl)], [X(len - (e - fl)), Y(0)], [X(0), Y(0)]], 'bar');
      k.line(X(0), Y(e) - 10, X(0), Y(0) + 10, 'cl');
      k.line(hx, Y(e) - 6, hx, Y(0) + 6, 'hole');
      k.dimV(Y(e), Y(0), X(0) - 26, X(0), X(0), T(e), 'l');
      k.circle(X(len - (e - fl) / 2), Y((e - fl) / 2), 2.6, 'dot'); k.line(X(len - (e - fl) / 2), Y((e - fl) / 2), X(len) + 30, Y(0) + 40, 'lead'); k.text(X(len) + 38, Y(0) + 47, 'PUNTA A 45°');
      k.circle(hx, Y(e), 2.6, 'dot'); k.line(hx, Y(e), hx + 24, Y(e) - 44, 'lead'); k.text(hx + 32, Y(e) - 38, 'PERFORACIÓN PARA'); k.text(hx + 32, Y(e) - 16, 'ANCLAR LA CUBIERTA');
      k.text(X(len / 2), Y(0) + 82, `BARRA ${T(BAR.L)} X ${T(BAR.w)} INJERTADA EN LA BASE`, 'lb', 'middle');
      k.title(X(len / 2), 840, 'Punta de la barra'); }

    // LISTA DE CORTE
    { const lis = lean => Math.sqrt(HB * HB + lean * lean) * 10, esp = m.esp;
      k.tabla(40, 880, 'Lista de corte', [['Pieza', 190], ['Cant.', 90], ['Sección', 150], ['Medida', 320], ['Nota', 480]], [
        ['Techo', '1', `${esp}`, `${T(2 * (TS + TR))} x ${T(2 * TR)}`, 'Ovalado, una pieza'],
        ['Oreja', '2', `${esp}`, `${T(2 * BR)} x ${T(BR)}`, 'Media luna'],
        ['Larguero', '2', `40 x ${esp}`, `${T(2 * BS)}`, 'Entre orejas'],
        ['Listón', String(2 * NS + 2 * NA), '20 x 20', `${mm(lis((m.abajoA - m.arribaA) / 2))} a ${mm(lis((m.abajoL - m.arribaL) / 2))}`, 'Separados, por fuera del techo y las orejas'],
        ['Barra', '2', `${T(BAR.w)} x ${esp}`, `${T(BAR.L)}`, 'Puntas a 45°, perforadas']]); }

    k.cajetin(info);
    return k.svg();
  }

  /* =================================================================================================
     SOBREMESA. Mismas medidas y unión que la lámina anterior de la app (Harold 27-oct-2026: "la pata baja hacia abajo para que no se
     note la testa de la pieza de abajo"): la cruz de arriba va de punta a punta sobre las patas; las patas bajan hasta el suelo con el patín
     debajo; la cruz de abajo va entre las patas. Cruce a media madera al centro. m en mm: { D, abajo, arriba, alto, esp, espCub }
     ================================================================================================= */
  function laminaSobremesa(m, info) {
    const k = hoja();
    const Lb = m.abajo, Lt = m.arriba, H = m.alto, D = m.D, esp = m.esp, EC = m.espCub, PAT = 16, B = 70;
    const inc = (Lb - Lt) / 2, ang = Math.atan(inc / H), angTxt = (ang * 180 / Math.PI).toFixed(0);
    const lPata = (H - B) / Math.cos(ang), wh = B / Math.cos(ang), lAbajo = Lb - 2 * wh;
    const xo = y => Lb / 2 - inc * (y - PAT) / H;   // canto exterior de la pata a la altura y (mm desde el suelo)
    const y1 = PAT, y2 = PAT + B, y3 = PAT + H - B, y4 = PAT + H, HT = y4 + EC;

    // VISTA FRONTAL (un marco)
    { const kf = Math.min(0.62, 640 / Math.max(Lb, D), 300 / HT), X0 = 420, FL = 430, X = v => X0 + v * kf, Y = v => FL - v * kf;
      k.line(X(-Math.max(Lb, D) / 2) - 20, FL, X(Math.max(Lb, D) / 2) + 20, FL, 'floor');
      k.poly([[X(-(xo(y1) - wh)), Y(y1)], [X(xo(y1) - wh), Y(y1)], [X(xo(y2) - wh), Y(y2)], [X(-(xo(y2) - wh)), Y(y2)]]);
      k.poly([[X(-xo(y3)), Y(y3)], [X(xo(y3)), Y(y3)], [X(Lt / 2), Y(y4)], [X(-Lt / 2), Y(y4)]]);
      for (const s of [1, -1]) k.poly([[X(s * xo(y1)), Y(y1)], [X(s * xo(y3)), Y(y3)], [X(s * (xo(y3) - wh)), Y(y3)], [X(s * (xo(y1) - wh)), Y(y1)]]);
      for (const s of [1, -1]) k.poly([[X(s * (xo(y1) - wh + 5)), Y(0)], [X(s * (xo(y1) - 5)), Y(0)], [X(s * (xo(y1) - 5)), Y(PAT)], [X(s * (xo(y1) - wh + 5)), Y(PAT)]], 'bar');
      k.rect(X(-D / 2), Y(HT), D * kf, EC * kf, 'obj');
      k.line(X(0), Y(HT) - 12, X(0), FL + 12, 'cl');
      k.dimH(X(-D / 2), X(D / 2), Y(HT) - 46, Y(HT), Y(HT), `Ø ${mm(D)}`);
      k.dimH(X(-Lt / 2), X(Lt / 2), Y(HT) - 18, Y(y4), Y(y4), mm(Lt));
      k.dimH(X(-Lb / 2), X(Lb / 2), FL + 32, FL, FL, mm(Lb), true);
      k.dimH(X(Lt / 2), X(Lb / 2), FL + 70, Y(y4), FL, mm(inc), true);
      k.dimV(Y(y4), Y(y1), X(-Math.max(Lb, D) / 2) - 30, X(-Lt / 2), X(-Lb / 2), mm(H));
      k.dimV(Y(HT), Y(y4), X(D / 2) + 22, X(D / 2), X(D / 2), mm(EC), 'r');
      k.lab(X(xo(y1) - wh / 2), Y(PAT / 2), X(Lb / 2) + 40, FL - 30, 'Patín regulable');
      k.title(X0, FL + 112, 'Vista frontal · un marco'); k.text(X0, FL + 138, 'EL OTRO MARCO ES IGUAL, CRUZADO A 90°', 'lb', 'middle'); }

    // VISTA DESDE ARRIBA
    { const kp = Math.min(0.3, 300 / D), CX = 1010, CY = 300, X = v => CX + v * kp, Y = v => CY + v * kp;
      k.circle(CX, CY, D / 2 * kp, 'obj');
      k.rect(X(-Lb / 2), Y(-esp / 2), Lb * kp, esp * kp); k.rect(X(-esp / 2), Y(-Lb / 2), esp * kp, Lb * kp);
      for (const s of [1, -1]) { k.line(X(s * Lt / 2), Y(-esp / 2) - 4, X(s * Lt / 2), Y(esp / 2) + 4, 'thin'); k.line(X(-esp / 2) - 4, Y(s * Lt / 2), X(esp / 2) + 4, Y(s * Lt / 2), 'thin'); }
      k.lab(CX + 3, CY + 3, 820, 470, 'Cruce a media madera al centro');
      k.title(CX, 542, 'Vista desde arriba'); }

    // VISTA EXPLOTADA
    { const s = Math.min(0.2, 230 / D), pr = iso(1370, 430, s), LX = 1530;
      const barra = (L, z, eje, c = 'pz') => { const p = eje === 'x' ? [[-L / 2, -esp / 2], [L / 2, -esp / 2], [L / 2, esp / 2], [-L / 2, esp / 2]] : [[-esp / 2, -L / 2], [esp / 2, -L / 2], [esp / 2, L / 2], [-esp / 2, L / 2]]; k.poly(p.map(q => pr(q[0], q[1], z)), c); };
      const ZA = y4 + 60 / s, ZC = ZA + 110 / s;
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([a, b]) => { const p = pr(a * xo(y1), b * xo(y1), 0), q = pr(a * xo(y3), b * xo(y3), y3);
        k.raw(`<line style="stroke:#000;stroke-width:7;stroke-linecap:square" x1="${p[0].toFixed(1)}" y1="${p[1].toFixed(1)}" x2="${q[0].toFixed(1)}" y2="${q[1].toFixed(1)}"/>`);
        k.raw(`<line style="stroke:#fff;stroke-width:4.4;stroke-linecap:square" x1="${p[0].toFixed(1)}" y1="${p[1].toFixed(1)}" x2="${q[0].toFixed(1)}" y2="${q[1].toFixed(1)}"/>`); });
      barra(lAbajo, y2, 'x'); barra(lAbajo, y2, 'y');
      barra(Lt, ZA, 'x'); barra(Lt, ZA, 'y');
      k.poly(Array.from({ length: 90 }, (_, i) => { const a = i / 90 * 2 * Math.PI; return pr(D / 2 * Math.cos(a), D / 2 * Math.sin(a), ZC); }), 'obj');
      k.tag(...pr(D / 2, 0, ZC), LX, ['Cubierta']);
      k.tag(...pr(Lt / 2, 0, ZA), LX, ['Cruz arriba']);
      k.tag(...pr(xo((y1 + y3) / 2), 0, (y1 + y3) / 2), LX, ['Patas (4)']);
      k.tag(...pr(0, -lAbajo / 2, y2), LX, ['Cruz abajo']);
      k.title(1440, 542, 'Vista explotada'); }

    // DETALLE: CRUCE A MEDIA MADERA
    { const kd = 1.6, X0 = 90, Y0 = 800, lp = 260, X = v => X0 + v * kd, Y = v => Y0 - v * kd, c = lp / 2;
      k.poly([[X(0), Y(B)], [X(c - esp / 2), Y(B)], [X(c - esp / 2), Y(B / 2)], [X(c + esp / 2), Y(B / 2)], [X(c + esp / 2), Y(B)], [X(lp), Y(B)], [X(lp), Y(0)], [X(0), Y(0)]]);
      k.line(X(0), Y(B) - 10, X(0), Y(0) + 10, 'cl'); k.line(X(lp), Y(B) - 10, X(lp), Y(0) + 10, 'cl');
      k.dimV(Y(B), Y(B / 2), X(lp) + 22, X(c + esp / 2), X(lp), mm(B / 2), 'r');
      k.dimV(Y(B), Y(0), X(0) - 26, X(0), X(0), mm(B), 'l');
      k.dimH(X(c - esp / 2), X(c + esp / 2), Y(B) - 22, Y(B), Y(B), mm(esp));
      k.text(X(c), Y(0) + 34, 'CRUZ ARRIBA: REBAJE ARRIBA', 'lb', 'middle'); k.text(X(c), Y(0) + 58, 'LA OTRA: REBAJE ABAJO', 'lb', 'middle');
      k.title(X(c), 920, 'Cruce a media madera'); }

    // LISTA DE CORTE
    k.tabla(600, 660, 'Lista de corte', [['Pieza', 180], ['Cant.', 80], ['Sección', 130], ['Corte', 650]], [
      ['Cruz abajo', '2', `${B} x ${esp}`, `${mm(lAbajo)} por abajo, entre patas; puntas a ${angTxt}°, rebaje ${B / 2}`],
      ['Cruz arriba', '2', `${B} x ${esp}`, `${mm(Lt)}; puntas a ${angTxt}°, rebaje ${B / 2} al centro`],
      ['Pata', '4', `${B} x ${esp}`, `${mm(lPata)} por el canto exterior, hasta el suelo; puntas a ${angTxt}°`],
      ['Patín regulable', '4', '', 'Uno bajo cada pata']]);

    k.cajetin(info);
    return k.svg();
  }

  window.PlanosSantino = { laminaTrama, laminaSobremesa };
})();
