/* App de censos — Estudios cardiológicos para hospitales periféricos.
   Los datos de pacientes se piden al servidor en cada sesión y viven solo en memoria:
   no se guardan en el dispositivo. Lo único que se recuerda es la sesión (12 horas). */
(function () {
  'use strict';

  const CFG = window.APP_CONFIG || {};
  const $app = document.getElementById('app');
  const $capas = document.getElementById('capas');
  const LLAVE_TOKEN = 'cardio_perif_censos_sesion';
  const DIAS_INICIALES = 60;
  const NOMBRE_SERVICIO = CFG.NOMBRE_SERVICIO || 'Servicio de Cardiología';

  // Deben coincidir con la API (sirven para ordenar listas y filtros).
  const ESTUDIOS = ['Ecocardiograma', 'Ecocardiograma transesofágico', 'Monitoreo Holter', 'Prueba de esfuerzo'];
  const CORTO = { 'Ecocardiograma': 'Eco', 'Ecocardiograma transesofágico': 'ETE', 'Monitoreo Holter': 'Holter', 'Prueba de esfuerzo': 'P. esfuerzo' };
  const PRIORIDADES = ['Urgencia', 'A demanda'];
  const HOSPITALES = [
    'H.N. "Dr. Juan Jose Fernandez", Zacamil', 'H.N. "Dr. Luis Edmundo Vasquez", Chalatenango', 'H.N. Neumologico "Dr. Jose Saldaña"',
    'H.N. Psiquiatrico "Dr. Jose Molina", Soyapango', 'H.N. "Enf. Angelica Vidal", Ilopango', 'H.N. "Nuestra Sra de Fatima", Cojutepeque',
    'H.N. "Dr. Francisco Menéndez", Ahuachapan', 'H.N. "Dr. Jorge Mazzini Villacorta", Sonsonate', 'H.N. "San Juan de Dios", Santa Ana',
    'H.N. "Dr. Arturo Morales", Metapán, Santa Ana', 'H.N. De Chalchuapa, Santa Ana', 'H.N. "San Rafael", Santa Tecla, La Libertad',
    'H.N. Nueva Concepcion, Chalatenango', 'H.N. De Niños "Benjamin Bloom"', 'H.N. De La Mujer "Dra. Maria Isabel Rodriguez"',
    'H.N. De Suchitoto, Cuscatlan', 'H.N. "Santa Gertrudis", San Vicente', 'H.N. "Santa Teresa", Zacatecoluca, La Paz',
    'H.N. "San Jerónimo Emiliani" De Sensuntepeque, Cabañas', 'H.N. "Dr. José Luís Saca", Ilobasco, Cabañas', 'H.N. "San Pedro", Usulután',
    'H.N. De Jiquilisco, Usulutan', 'H.N. "Dr. Jorge Arturo Mena", Santiago de María, Usulután', 'H.N. "San Juan de Dios", San Miguel',
    'H.N. Nueva Guadalupe, San Miguel', 'H.N. "Monseñor Oscar Arnulfo Romero y Galdámez", Ciudad Barrios, San Miguel',
    'H.N. "Dr. Héctor Antonio Hernández Flores", San Francisco Gotera, Morazán', 'H.N. De La Union', 'H.N. Santa Rosa De Lima, La Union', 'H.N. Rosales'];
  const ESPECIALIDADES = ['Medicina Interna', 'Cirugía', 'Ginecología', 'Oncología', 'Nefrología', 'Hematología', 'Reumatología',
    'Neurología', 'Psiquiatría', 'Geriatría', 'Cardiología', 'Otro'];
  const NO_ACUDIRA = 'No podrá acudir';
  const NO_ACUDIO = 'Paciente no acudió';
  const GRUPOS_EDAD = [['Menos de 1 año', 0, 0], ['1 – 9', 1, 9], ['10 – 19', 10, 19], ['20 – 29', 20, 29], ['30 – 39', 30, 39], ['40 – 49', 40, 49],
    ['50 – 59', 50, 59], ['60 – 69', 60, 69], ['70 – 79', 70, 79], ['80 o más', 80, 200]];
  const LETRAS_DIA = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
  const NOMBRES_DIA = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
  const DIA_CORTO = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const MES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

  const S = {
    token: '', usuario: null, medicos: [], motivos: [], config: null, hoy: '', filas: new Map(), repetidas: new Set(),
    desde: '', sincronizado: '', cargando: false, errorCarga: '', ui: {}, archivos: new Map(), cupos: null, stats: null, usuarios: null,
    panel: null, detalleAbierto: null, plantillas: [], estudiosConReporte: [], estadoReportes: null
  };

  /* ============================== utilidades ============================== */
  function h(tag, attrs) {
    const el = document.createElement(tag);
    const a = attrs || {};
    Object.keys(a).forEach(function (k) {
      const v = a[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'class') el.className = v;
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    });
    for (let i = 2; i < arguments.length; i++) agregar(el, arguments[i]);
    return el;
  }
  function agregar(el, hijo) {
    if (hijo === null || hijo === undefined || hijo === false) return;
    if (Array.isArray(hijo)) hijo.forEach(function (x) { agregar(el, x); });
    else el.appendChild(hijo.nodeType ? hijo : document.createTextNode(String(hijo)));
  }
  /** <select> con opciones [valor, texto] o grupos {grupo, opciones}. */
  function selector(opciones, valor, attrs) {
    const s = h('select', attrs);
    const op = function (o) { return h('option', { value: o[0], selected: String(o[0]) === String(valor) }, o[1]); };
    opciones.forEach(function (o) {
      if (o.grupo) s.appendChild(h('optgroup', { label: o.grupo }, o.opciones.map(op))); else s.appendChild(op(o));
    });
    return s;
  }
  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function cmp(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
  function partes(iso) { const p = String(iso || '').slice(0, 10).split('-'); return [Number(p[0]), Number(p[1]), Number(p[2])]; }
  /** 1 = lunes … 7 = domingo */
  function diaSemana(iso) { const p = partes(iso); const d = new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay(); return d === 0 ? 7 : d; }
  function fechaLarga(iso) { const p = partes(iso); return NOMBRES_DIA[diaSemana(iso) - 1] + ' ' + p[2] + ' de ' + MESES[p[1] - 1] + ' de ' + p[0]; }
  function fechaSinAnio(iso) { const p = partes(iso); return NOMBRES_DIA[diaSemana(iso) - 1] + ' ' + p[2] + ' de ' + MESES[p[1] - 1]; }
  function fechaCorta(iso) { const p = String(iso || '').slice(0, 10).split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : ''; }
  function fechaMedia(iso) { const p = partes(iso); return iso ? DIA_CORTO[diaSemana(iso) - 1] + ' ' + String(p[2]).padStart(2, '0') + '/' + String(p[1]).padStart(2, '0') : ''; }
  function horaDe(fh) { return String(fh || '').slice(11, 16); }
  function fechaHora(fh) { return fh ? fechaCorta(fh) + ' ' + horaDe(fh) : ''; }
  function hora12(hhmm) {
    const p = String(hhmm || '').split(':');
    if (p.length < 2) return '';
    const n = Number(p[0]);
    return ((n % 12) || 12) + ':' + p[1] + (n < 12 ? ' a. m.' : ' p. m.');
  }
  function telefono(t) {
    const s = String(t || '');
    if (s.charAt(0) === '+') { const d = s.slice(1); return d.length === 11 ? '+' + d.slice(0, 3) + ' ' + d.slice(3, 7) + '-' + d.slice(7) : s; }
    const d = s.replace(/\D/g, '');
    return d.length === 8 ? d.slice(0, 4) + '-' + d.slice(4) : d;
  }
  function sumarDias(iso, n) { const p = partes(iso); return new Date(Date.UTC(p[0], p[1] - 1, p[2] + n)).toISOString().slice(0, 10); }
  function diasEntre(a, b) { const x = partes(a), y = partes(b); return Math.round((Date.UTC(y[0], y[1] - 1, y[2]) - Date.UTC(x[0], x[1] - 1, x[2])) / 86400000); }
  function plural(n, uno, varios) { return n + ' ' + (n === 1 ? uno : varios); }
  function hospCorto(x) { return String(x || '').replace(/^H\.N\.\s*/, '').replace(/"/g, ''); }
  function guardarToken(t) { try { if (t) localStorage.setItem(LLAVE_TOKEN, t); else localStorage.removeItem(LLAVE_TOKEN); } catch (e) { /* sin almacenamiento */ } }
  function leerToken() { try { return localStorage.getItem(LLAVE_TOKEN) || ''; } catch (e) { return ''; } }
  function esAdmin() { return S.usuario && S.usuario.rol === 'admin'; }

  async function api(action, datos) {
    if (!CFG.API_URL || /PEGAR_AQUI/.test(CFG.API_URL)) {
      const e0 = new Error('La app aún no está conectada. Falta pegar la dirección de la API en el archivo config.js.');
      e0.code = 'CONFIG';
      throw e0;
    }
    let res, j;
    try {
      res = await fetch(CFG.API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(Object.assign({ action: action, token: S.token }, datos || {})) });
      j = await res.json();
    } catch (e) {
      const e1 = new Error('No hay conexión con el servidor. Revise su internet e intente de nuevo.');
      e1.code = 'RED';
      throw e1;
    }
    if (!j.ok) {
      const e2 = new Error(j.error || 'Ocurrió un error.');
      e2.code = j.code;
      e2.datos = j.datos;
      if (j.code === 'SESION' && S.token) { cerrarSesion(j.error); }
      if (j.code === 'CAMBIAR_CLAVE' && S.usuario) { S.usuario.debe_cambiar = true; pintar(); }
      throw e2;
    }
    return j.data;
  }

  /* ============================== avisos y modales ============================== */
  let tostadaActual = null;
  function tostada(texto, opciones) {
    const o = opciones || {};
    if (tostadaActual) tostadaActual.remove();
    const t = h('div', { class: 'tostada' + (o.error ? ' error' : ''), role: 'status' }, h('span', null, texto),
      o.accion ? h('button', { onclick: function () { t.remove(); o.accion.fn(); } }, o.accion.texto) : null);
    document.body.appendChild(t);
    tostadaActual = t;
    setTimeout(function () { t.remove(); }, o.accion ? 9000 : 4500);
  }
  function modalesAbiertos() { return $capas.children.length > 0; }
  function abrirModal(contenido, opciones) {
    const o = opciones || {};
    const velo = h('div', { class: 'velo', role: 'dialog', 'aria-modal': 'true' });
    let cerrado = false, preguntando = false;
    const cerrarYa = function () {
      if (cerrado) return;
      cerrado = true;
      velo.remove(); document.removeEventListener('keydown', tecla); if (!modalesAbiertos()) document.body.style.overflow = ''; if (o.alCerrar) o.alCerrar();
    };
    // o.antesDeCerrar() puede devolver false (o una promesa) para que el modal siga abierto, p. ej. con un comentario sin guardar.
    const cerrar = function () {
      if (!o.antesDeCerrar) { cerrarYa(); return; }
      if (preguntando || cerrado) return;
      preguntando = true;
      Promise.resolve(o.antesDeCerrar()).then(function (ok) { preguntando = false; if (ok) cerrarYa(); });
    };
    const tecla = function (ev) { if (ev.key === 'Escape' && $capas.lastChild === velo && !document.querySelector('.visor')) cerrar(); };
    velo.addEventListener('mousedown', function (ev) { if (ev.target === velo) cerrar(); });
    document.addEventListener('keydown', tecla);
    velo.appendChild(typeof contenido === 'function' ? contenido(cerrar) : contenido);
    $capas.appendChild(velo);
    document.body.style.overflow = 'hidden';
    const foco = velo.querySelector('[data-foco]') || velo.querySelector('button, input, select');
    if (foco) foco.focus();
    return cerrar;
  }
  function modalChico(titulo, cuerpo) {
    return abrirModal(function (cerrar) {
      return h('div', { class: 'modal chico' },
        h('div', { class: 'modal-cab' }, h('h2', { style: 'margin:0' }, titulo), h('button', { class: 'btn chico x', onclick: cerrar, 'aria-label': 'Cerrar' }, '✕')),
        h('div', { class: 'modal-cuerpo' }, cuerpo(cerrar)));
    });
  }
  /** Pregunta con dos botones. Devuelve una promesa con true (confirmar) o false. */
  function preguntar(titulo, texto, siTexto, noTexto, claseSi) {
    return new Promise(function (resolver) {
      let respondido = false;
      const fin = function (v, cerrar) { if (respondido) return; respondido = true; cerrar(); resolver(v); };
      abrirModal(function (cerrar) {
        return h('div', { class: 'modal chico' },
          h('div', { class: 'modal-cab' }, h('h2', { style: 'margin:0' }, titulo)),
          h('div', { class: 'modal-cuerpo' }, agregarTexto(texto),
            h('div', { style: 'display:grid;gap:10px;margin-top:16px' },
              h('button', { class: 'btn ' + (claseSi || 'primario'), onclick: function () { fin(true, cerrar); } }, siTexto),
              h('button', { class: 'btn', 'data-foco': true, onclick: function () { fin(false, cerrar); } }, noTexto))));
      }, { alCerrar: function () { if (!respondido) { respondido = true; resolver(false); } } });
    });
  }
  function agregarTexto(t) { return (Array.isArray(t) ? t : [t]).map(function (x) { return typeof x === 'string' ? h('p', { style: 'margin:0 0 10px' }, x) : x; }); }
  function cajaError() { return h('div', { role: 'alert' }); }
  function mostrarError(caja, e) { caja.textContent = ''; caja.appendChild(h('div', { class: 'aviso error' }, e.message || String(e))); }
  async function conBoton(btn, fn) {
    const texto = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Un momento…';
    try { return await fn(); } finally { btn.disabled = false; btn.textContent = texto; }
  }

  /* ============================== sesión ============================== */
  function cerrarSesion(mensaje) {
    S.token = '';
    S.usuario = null;
    S.filas = new Map();
    S.archivos.forEach(function (a) { URL.revokeObjectURL(a.url); });
    S.archivos = new Map();
    S.cupos = S.stats = S.usuarios = S.panel = S.estadoReportes = null;
    S.plantillas = [];
    S.sincronizado = '';
    S.desde = '';
    guardarToken('');
    $capas.textContent = '';
    document.body.style.overflow = '';
    pintarAcceso(mensaje);
  }

  function pintarAcceso(mensaje) {
    $app.textContent = '';
    const err = cajaError();
    const usuario = h('input', { id: 'in-usuario', type: 'text', autocomplete: 'username', autocapitalize: 'none', spellcheck: 'false' });
    const clave = h('input', { id: 'in-clave', type: 'password', autocomplete: 'current-password' });
    const btn = h('button', { class: 'btn primario ancho', type: 'submit' }, 'Ingresar');
    $app.appendChild(h('div', { class: 'acceso' }, h('form', { class: 'caja', onsubmit: async function (ev) {
      ev.preventDefault();
      err.textContent = '';
      try {
        const r = await conBoton(btn, function () { return api('login', { usuario: usuario.value, clave: clave.value }); });
        S.token = r.token;
        S.usuario = r.usuario;
        guardarToken(r.token);
        await iniciar();
      } catch (e) { mostrarError(err, e); }
    } },
      h('img', { src: 'icons/icon-192.png', alt: '' }),
      h('h1', null, 'Censos · Hospitales periféricos'),
      h('p', { class: 'sub' }, 'Estudios cardiológicos solicitados por la red'),
      mensaje ? h('div', { class: 'aviso alerta' }, mensaje) : null,
      h('div', { class: 'campo' }, h('label', { for: 'in-usuario' }, 'Usuario'), usuario),
      h('div', { class: 'campo' }, h('label', { for: 'in-clave' }, 'Contraseña'), clave),
      err, btn,
      h('p', { style: 'color:#51606f;font-size:12.5px;text-align:center;margin:14px 0 0' }, 'Acceso exclusivo del personal autorizado. Toda acción queda registrada.'))));
    usuario.focus();
  }

  function formularioClave(alTerminar, obligado) {
    const err = cajaError();
    const actual = h('input', { id: 'cl-actual', type: 'password', autocomplete: 'current-password' });
    const nueva = h('input', { id: 'cl-nueva', type: 'password', autocomplete: 'new-password' });
    const repite = h('input', { id: 'cl-repite', type: 'password', autocomplete: 'new-password' });
    const btn = h('button', { class: 'btn primario ancho', type: 'submit' }, 'Guardar contraseña');
    return h('form', { onsubmit: async function (ev) {
      ev.preventDefault();
      err.textContent = '';
      if (nueva.value !== repite.value) { mostrarError(err, new Error('Las contraseñas nuevas no coinciden.')); return; }
      try {
        await conBoton(btn, function () { return api('clave.cambiar', { actual: actual.value, nueva: nueva.value }); });
        S.usuario.debe_cambiar = false;
        tostada('Contraseña actualizada.');
        alTerminar();
      } catch (e) { mostrarError(err, e); }
    } },
      obligado ? h('div', { class: 'aviso info' }, 'Por seguridad, debe crear su propia contraseña antes de continuar.') : null,
      h('div', { class: 'campo' }, h('label', { for: 'cl-actual' }, obligado ? 'Contraseña temporal' : 'Contraseña actual'), actual),
      h('div', { class: 'campo' }, h('label', { for: 'cl-nueva' }, 'Contraseña nueva (mínimo 8 caracteres)'), nueva),
      h('div', { class: 'campo' }, h('label', { for: 'cl-repite' }, 'Repita la contraseña nueva'), repite),
      err, btn);
  }

  function menuCuenta() {
    modalChico(S.usuario.nombre, function (cerrar) {
      return [h('p', { style: 'margin:0 0 14px;color:#51606f' }, 'Usuario: ' + S.usuario.usuario + ' · ' + (esAdmin() ? 'Administrador' : 'Médico')),
        h('div', { style: 'display:grid;gap:10px' },
          h('button', { class: 'btn', onclick: function () { cerrar(); modalChico('Cambiar contraseña', function (c2) { return formularioClave(c2, false); }); } }, 'Cambiar contraseña'),
          h('button', { class: 'btn peligro', onclick: function () { cerrarSesion('Sesión cerrada.'); } }, 'Cerrar sesión'))];
    });
  }

  /* ============================== datos ============================== */
  function aObjeto(cols, arr) {
    const o = {};
    cols.forEach(function (c, i) { o[c] = arr[i] === undefined ? '' : arr[i]; });
    o.pN = PRIORIDADES.indexOf(o.prioridad) + 1 || 9;
    o.edadN = o.edad === '' ? -1 : Number(o.edad);
    o.busca = norm(o.nombre + ' ' + o.expediente + ' ' + o.hospital + ' ' + o.id);
    return o;
  }
  function integrarFila(cols, arr) { const o = aObjeto(cols, arr); S.filas.set(o.id, o); return o; }
  /** Marca como "posible repetida" el mismo paciente (hospital + expediente) con el mismo estudio en menos de 15 días. */
  function recalcularRepetidas() {
    const grupos = {};
    S.filas.forEach(function (f) {
      if (!f.expediente) return;
      const k = norm(f.hospital) + '|' + norm(f.expediente).replace(/\s/g, '') + '|' + f.estudio;
      (grupos[k] = grupos[k] || []).push(f);
    });
    S.repetidas = new Set();
    Object.keys(grupos).forEach(function (k) {
      const g = grupos[k];
      if (g.length < 2) return;
      g.sort(function (a, b) { return cmp(a.fecha, b.fecha); });
      for (let i = 1; i < g.length; i++) {
        if (diasEntre(g[i - 1].fecha, g[i].fecha) <= 14) { S.repetidas.add(g[i - 1].id); S.repetidas.add(g[i].id); }
      }
    });
  }
  function integrar(r) {
    r.filas.forEach(function (arr) { integrarFila(r.columnas, arr); });
    S.hoy = r.fecha;
    recalcularRepetidas();
  }
  /** Aplica la fila que devuelve el servidor después de un cambio. */
  function aplicarFila(r) {
    const o = integrarFila(r.columnas, r.fila);
    recalcularRepetidas();
    return o;
  }
  async function aplicarInicio() {
    const r = await api('inicio');
    S.usuario = r.usuario;
    S.medicos = r.medicos;
    S.motivos = r.motivos_no;
    S.config = r.config;
    S.hoy = r.fecha;
    S.plantillas = r.plantillas || [];
    S.estudiosConReporte = r.estudios_con_reporte || [];
    return r;
  }
  /** Trae del servidor los últimos días y todos los pendientes. Lo más antiguo ya cargado se conserva. */
  async function sincronizar(silencioso) {
    if (S.cargando || !S.token) return;
    S.cargando = true;
    if (!silencioso) pintar();
    try {
      const ventana = sumarDias(S.hoy || new Date().toISOString().slice(0, 10), -DIAS_INICIALES);
      const r = await Promise.all([aplicarInicio(), api('solicitudes.listar', { desde: ventana, hasta: '9999-12-31', pendientes: true })]);
      const recibidos = new Set(r[1].filas.map(function (arr) { return arr[0]; }));
      const antiguas = new Map();
      let cambioAntiguo = false;
      S.filas.forEach(function (f, id) {
        if (f.fecha >= ventana) return;
        // Un pendiente antiguo que ya no llega fue cerrado desde otro dispositivo: hay que releerlo.
        if (f.estado === 'PENDIENTE' && !recibidos.has(id)) cambioAntiguo = true;
        antiguas.set(id, f);
      });
      S.filas = antiguas;
      integrar(r[1]);
      if (cambioAntiguo && S.desde) integrar(await api('solicitudes.listar', { desde: S.desde, hasta: sumarDias(ventana, -1) }));
      if (!S.desde || ventana < S.desde) S.desde = ventana;
      S.sincronizado = r[1].hora;
      S.errorCarga = '';
    } catch (e) {
      if (e.code !== 'SESION') S.errorCarga = e.message;
    }
    S.cargando = false;
    if (S.token && !(silencioso && (modalesAbiertos() || escribiendo()))) pintar();
  }
  function escribiendo() {
    const a = document.activeElement;
    return a && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName) && $app.contains(a);
  }
  async function cargarAntiguos(desde) {
    if (S.desde && desde >= S.desde) return;
    const r = await api('solicitudes.listar', { desde: desde, hasta: S.desde ? sumarDias(S.desde, -1) : '9999-12-31' });
    integrar(r);
    S.desde = desde;
  }
  async function iniciar() {
    try {
      await aplicarInicio();
    } catch (e) {
      if (e.code !== 'SESION') pintarAcceso(e.message);
      return;
    }
    if (S.usuario.debe_cambiar) { pintar(); return; }
    pintar();
    await sincronizar();
  }
  function filasArr() { return Array.from(S.filas.values()); }

  /* ============================== cupos ============================== */
  /** Cupos de un estudio en una fecha: los del día de la semana, salvo que esa fecha esté marcada sin cupos. */
  function cuposDia(fecha, estudio) {
    const c = S.config;
    if (!c) return { cupos: 0, cerrado: false, motivo: '' };
    const cierre = c.sin_cupo.filter(function (s) { return s.fecha === fecha && (s.estudio === 'TODOS' || s.estudio === estudio); })[0];
    if (cierre) return { cupos: 0, cerrado: true, motivo: cierre.motivo };
    return { cupos: Number((c.semana[diaSemana(fecha)] || {})[estudio] || 0), cerrado: false, motivo: '' };
  }
  /** Una cita ocupa cupo mientras está pendiente, si se realizó o si el paciente no se presentó. */
  function ocupa(f) {
    return !!f.cita_fecha && (f.estado === 'PENDIENTE' || f.estado === 'REALIZADO' || (f.estado === 'NO REALIZADO' && f.motivo_no === NO_ACUDIO));
  }
  function citasDe(fecha) { return filasArr().filter(function (f) { return f.cita_fecha === fecha; }); }
  function usados(fecha, estudio, excluirId) {
    let n = 0;
    S.filas.forEach(function (f) { if (f.cita_fecha === fecha && f.estudio === estudio && f.id !== excluirId && ocupa(f)) n++; });
    return n;
  }
  /** Resumen de un día: para un estudio o para todos. clase: libre | lleno | sin */
  function resumenDia(fecha, estudio) {
    const lista = estudio ? [estudio] : ESTUDIOS;
    let u = 0, c = 0, alguno = false;
    const det = lista.map(function (e) {
      const k = cuposDia(fecha, e), n = usados(fecha, e);
      u += n; c += k.cupos;
      if (n < k.cupos) alguno = true;
      return { estudio: e, usados: n, cupos: k.cupos, cerrado: k.cerrado, motivo: k.motivo };
    });
    const clase = c === 0 && u === 0 ? 'sin' : alguno ? 'libre' : 'lleno';
    return { usados: u, cupos: c, clase: clase, det: det };
  }
  function proximasLibres(estudio, desde, cuantas) {
    const out = [];
    for (let i = 0; i < 60 && out.length < cuantas; i++) {
      const d = sumarDias(desde, i);
      const k = cuposDia(d, estudio), n = usados(d, estudio);
      if (k.cupos > n) out.push({ fecha: d, libres: k.cupos - n });
    }
    return out;
  }

  /* ============================== marco general ============================== */
  function barra(titulo, sub, conVolver) {
    return h('header', { class: 'barra' }, h('div', { class: 'barra-int' },
      conVolver ? h('a', { class: 'btn-barra', href: '#/' }, '‹ Inicio') : h('img', { class: 'logo', src: 'icons/icon-192.png', alt: '' }),
      h('h1', null, titulo, sub ? h('small', null, sub) : null),
      h('button', { class: 'btn-barra no-imprimir', title: 'Actualizar datos', onclick: function () { S.cupos = S.stats = S.usuarios = S.estadoReportes = null; sincronizar(); } }, '↻', h('span', { class: 'txt' }, S.cargando ? ' Actualizando…' : ' Actualizar')),
      h('button', { class: 'btn-barra no-imprimir', onclick: menuCuenta, 'aria-label': 'Mi cuenta' }, S.usuario ? S.usuario.usuario : '')));
  }
  function ruta() { return location.hash.replace(/^#\/?/, '').split('/'); }

  function pintar() {
    if (!S.token || !S.usuario) { pintarAcceso(); return; }
    const y = window.scrollY;
    const activo = document.activeElement && $app.contains(document.activeElement) ? document.activeElement : null;
    const foco = activo && activo.id ? { id: activo.id, pos: activo.tagName === 'INPUT' && /^(text|search)$/.test(activo.type) ? activo.selectionStart : null } : null;
    $app.textContent = '';
    if (S.usuario.debe_cambiar) {
      $app.appendChild(h('div', { class: 'acceso' }, h('div', { class: 'caja' }, h('h1', { style: 'margin-bottom:14px' }, 'Cree su contraseña'),
        formularioClave(function () { iniciar(); }, true))));
      return;
    }
    const r = ruta();
    const main = h('main', { class: 'contenido' });
    let titulo = 'Censos · Hospitales periféricos', sub = S.hoy ? fechaLarga(S.hoy) : '', volver = true;
    if (S.errorCarga) main.appendChild(h('div', { class: 'aviso error', role: 'alert' }, S.errorCarga));
    if (r[0] === 'citas') { titulo = 'Asignación de citas'; vistaCitas(main); }
    else if (r[0] === 'agenda') { titulo = 'Agenda'; vistaAgenda(main, /^\d{4}-\d{2}-\d{2}$/.test(r[1] || '') ? r[1] : S.hoy); }
    else if (r[0] === 'pendientes') { titulo = 'Solicitudes pendientes'; vistaPendientes(main); }
    else if (r[0] === 'censo') { titulo = 'Censo'; sub = 'Todas las solicitudes'; vistaCenso(main); }
    else if (r[0] === 'estadisticas') { titulo = 'Estadísticas'; sub = ''; vistaEstadisticas(main); }
    else if (r[0] === 'cupos') { titulo = 'Control de cupos'; vistaCupos(main); }
    else if (r[0] === 'admin' && esAdmin()) { titulo = 'Usuarios y médicos'; sub = ''; vistaAdmin(main); }
    else { volver = false; vistaInicio(main); }
    $app.appendChild(barra(titulo, sub, volver));
    $app.appendChild(main);
    window.scrollTo(0, y);
    if (foco) {
      const el = document.getElementById(foco.id);
      if (el) { el.focus({ preventScroll: true }); if (foco.pos !== null) { try { el.setSelectionRange(foco.pos, foco.pos); } catch (e) { /* no aplica */ } } }
    }
  }

  /* ============================== inicio ============================== */
  function vistaInicio(main) {
    const todas = filasArr();
    const pend = todas.filter(function (f) { return f.estado === 'PENDIENTE'; });
    const sinCita = pend.filter(function (f) { return !f.cita_fecha; });
    const conCita = pend.filter(function (f) { return f.cita_fecha; });
    const deHoy = todas.filter(function (f) { return f.cita_fecha === S.hoy && f.motivo_no !== NO_ACUDIRA; });
    const atendidas = deHoy.filter(function (f) { return f.estado !== 'PENDIENTE'; }).length;
    const recibidasHoy = todas.filter(function (f) { return f.fecha === S.hoy; }).length;
    const urg = pend.filter(function (f) { return f.prioridad === 'Urgencia'; }).length;
    const porRevisar = todas.filter(function (f) { return f.reporte_estado === 'POR REVISAR'; }).length;
    const sinDatos = !S.sincronizado;
    const tarjeta = function (href, clase, nombre, cifra, cifraNota, nota) {
      return h('a', { class: 'modulo ' + clase, href: href }, h('div', { class: 'nombre' }, nombre),
        cifra !== null ? h('div', { class: 'cifra' }, sinDatos ? '–' : cifra, h('small', null, cifraNota)) : null,
        nota ? h('div', { class: 'nota' }, sinDatos ? '' : nota) : null);
    };
    agregar(main, [
      h('div', { class: 'saludo' }, h('h2', null, 'Hola, ' + S.usuario.nombre),
        h('span', null, S.sincronizado ? plural(recibidasHoy, 'solicitud recibida', 'solicitudes recibidas') + ' hoy · actualizado a las ' + S.sincronizado : 'Cargando solicitudes…')),
      porRevisar ? h('a', { class: 'aviso alerta aviso-enlace', href: '#/censo', onclick: function () {
        const u = uiCenso();
        Object.assign(u, { reporte: 'revisar', q: '', estudio: '', hosp: '', estado: '', prio: '', desde: S.desde || u.desde, hasta: S.hoy });
      } }, h('b', null, plural(porRevisar, 'reporte de ecocardiograma por revisar', 'reportes de ecocardiograma por revisar') + '.'),
        ' Se encontraron reportes que podrían corresponder a estas solicitudes, pero no coinciden todos los datos. Toque aquí para revisarlos.') : null,
      h('div', { class: 'modulos' },
        tarjeta('#/citas', 'principal', 'Asignación de citas', sinCita.length, sinCita.length === 1 ? 'por agendar' : 'por agendar',
          plural(conCita.length, 'solicitud agendada', 'solicitudes agendadas') + ' en espera'),
        tarjeta('#/agenda', '', 'Agenda de hoy', deHoy.length, deHoy.length === 1 ? 'cita hoy' : 'citas hoy',
          atendidas + ' marcadas · ' + (deHoy.length - atendidas) + ' por marcar'),
        tarjeta('#/pendientes', '', 'Solicitudes pendientes', pend.length, 'sin completar', plural(urg, 'urgencia', 'urgencias') + ' · ' + sinCita.length + ' sin cita')),
      h('h3', { class: 'seccion-t' }, 'Gestión'),
      h('div', { class: 'modulos' },
        tarjeta('#/censo', 'util', 'Censo', null, '', 'Todas las solicitudes, con filtros y descarga'),
        tarjeta('#/estadisticas', 'util', 'Estadísticas', null, '', 'Por estudio, médico, edad, sexo, hospital, especialidad y prioridad'),
        tarjeta('#/cupos', 'util', 'Control de cupos', null, '', 'Cupos por día y estudio, fechas sin cupos y formulario'),
        esAdmin() ? tarjeta('#/admin', 'util', 'Usuarios y médicos', null, '', 'Cuentas de acceso, médicos, plantillas de comentario y censo de reportes') : null)
    ]);
  }

  /* ============================== tablas ============================== */
  const ORDENES = {
    fecha: ['Fecha de solicitud', function (a, b) { return cmp(a.fecha_hora, b.fecha_hora); }],
    prioridad: ['Prioridad', function (a, b) { return a.pN - b.pN || cmp(a.fecha_hora, b.fecha_hora); }],
    cita: ['Fecha de cita', function (a, b) { return cmp(a.cita_fecha || '9999', b.cita_fecha || '9999') || cmp(a.cita_hora, b.cita_hora) || a.pN - b.pN; }],
    hora: ['Hora', function (a, b) { return cmp(a.cita_hora, b.cita_hora) || a.pN - b.pN || a.nombre.localeCompare(b.nombre, 'es'); }],
    nombre: ['Nombre', function (a, b) { return a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }); }],
    edad: ['Edad', function (a, b) { return a.edadN - b.edadN || cmp(a.fecha_hora, b.fecha_hora); }],
    hospital: ['Hospital', function (a, b) { return hospCorto(a.hospital).localeCompare(hospCorto(b.hospital), 'es') || cmp(a.fecha_hora, b.fecha_hora); }],
    estudio: ['Estudio', function (a, b) { return ESTUDIOS.indexOf(a.estudio) - ESTUDIOS.indexOf(b.estudio) || cmp(a.fecha_hora, b.fecha_hora); }]
  };
  function ui(llave, base) { if (!S.ui[llave]) S.ui[llave] = Object.assign({ q: '', limite: 150 }, base); return S.ui[llave]; }

  function controles(u, ordenes, extra) {
    const buscar = h('input', { type: 'search', id: 'buscar', placeholder: 'Nombre, expediente u hospital', value: u.q,
      oninput: function (ev) { u.q = ev.target.value; u.limite = 150; clearTimeout(buscar._t); buscar._t = setTimeout(function () { pintar(); }, 180); } });
    return h('div', { class: 'filtros no-imprimir' },
      h('div', { class: 'campo buscar' }, h('label', { for: 'buscar' }, 'Buscar'), buscar),
      extra || null,
      h('div', { class: 'campo chico' }, h('label', { for: 'orden' }, 'Ordenar por'),
        selector(ordenes.map(function (k) { return [k, ORDENES[k][0]]; }), u.orden, { id: 'orden', onchange: function (ev) { u.orden = ev.target.value; pintar(); } })),
      h('div', { class: 'campo', style: 'flex:0 0 auto' }, h('label', null, ' '),
        h('button', { class: 'btn', title: 'Invertir el orden', onclick: function () { u.dir = -u.dir; pintar(); } }, u.dir > 0 ? '↑ Ascendente' : '↓ Descendente')));
  }
  function filtroSelect(id, etiqueta, opciones, valor, alCambiar) {
    return h('div', { class: 'campo chico' }, h('label', { for: id }, etiqueta),
      selector(opciones, valor, { id: id, onchange: function (ev) { alCambiar(ev.target.value); pintar(); } }));
  }
  function opcionesHospital(filas) {
    const vistos = {};
    filas.forEach(function (f) { if (f.hospital) vistos[f.hospital] = true; });
    const lista = HOSPITALES.filter(function (x) { return vistos[x]; }).concat(Object.keys(vistos).filter(function (x) { return HOSPITALES.indexOf(x) < 0; }).sort());
    return [['', 'Todos']].concat(lista.map(function (x) { return [x, hospCorto(x)]; }));
  }
  function aplicar(filas, u) {
    const q = norm(u.q.trim());
    const palabras = q ? q.split(/\s+/) : [];
    let r = palabras.length ? filas.filter(function (f) { return palabras.every(function (p) { return f.busca.indexOf(p) >= 0; }); }) : filas.slice();
    r.sort(ORDENES[u.orden][1]);
    if (u.dir < 0) r.reverse();
    return r;
  }

  function selectorMarcado(f) {
    const actual = f.estado === 'REALIZADO' ? 'R|' + f.realizado_por : f.estado === 'NO REALIZADO' ? 'N|' + f.motivo_no : 'P|';
    const medicos = S.medicos.filter(function (m) { return m.activo || m.nombre === f.realizado_por; }).map(function (m) { return ['R|' + m.nombre, m.nombre]; });
    if (f.estado === 'REALIZADO' && !medicos.some(function (m) { return m[0] === actual; })) medicos.push([actual, f.realizado_por]);
    const motivos = S.motivos.map(function (m) { return ['N|' + m, m]; });
    if (f.estado === 'NO REALIZADO' && !motivos.some(function (m) { return m[0] === actual; })) motivos.push([actual, f.motivo_no]);
    return selector([['P|', 'Pendiente'], { grupo: 'Realizado por', opciones: medicos }, { grupo: 'No se realizó', opciones: motivos }], actual,
      { class: 'marcar ' + (f.estado === 'REALIZADO' ? 'hecho' : f.estado === 'NO REALIZADO' ? 'no' : 'pend'),
        'aria-label': 'Resultado de la solicitud de ' + f.nombre,
        onclick: function (ev) { ev.stopPropagation(); },
        onchange: function (ev) { marcar(f, ev.target.value, actual, ev.target); } });
  }

  async function marcar(f, valor, anterior, control, esDeshacer) {
    const tipo = { R: 'REALIZADO', N: 'NO_REALIZADO', P: 'PENDIENTE' }[valor.charAt(0)];
    if (control) control.disabled = true;
    try {
      const r = await api('solicitudes.marcar', { id: f.id, tipo: tipo, valor: valor.slice(2) });
      f = aplicarFila(r);
      const texto = tipo === 'REALIZADO' ? 'Realizado por ' + f.realizado_por : tipo === 'NO_REALIZADO' ? 'Cerrada: ' + f.motivo_no : 'Devuelta a pendientes';
      tostada(f.nombre + ' — ' + texto, esDeshacer ? null : { accion: { texto: 'Deshacer', fn: function () { marcar(f, anterior, valor, null, true); } } });
    } catch (e) {
      tostada(e.message, { error: true });
    }
    refrescarDetalle(f.id);
    pintar();
  }

  function chipPrioridad(f) { return h('span', { class: 'chip ' + (f.prioridad === 'Urgencia' ? 'urg' : f.prioridad ? 'dem' : 'gris') }, f.prioridad || '—'); }
  function chipEstado(f) {
    if (f.estado === 'REALIZADO') return h('span', { class: 'chip ok' }, 'Realizado');
    if (f.estado === 'NO REALIZADO') return h('span', { class: 'chip gris' }, f.motivo_no || 'No realizado');
    return h('span', { class: 'chip azul' }, 'Pendiente');
  }
  function edadCorta(f) {
    if (f.edad === '') return '—';
    if (f.edad === '0') {
      const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(f.fecha_nacimiento || '');
      if (m) { const meses = diasEntre(m[3] + '-' + m[2] + '-' + m[1], f.fecha) / 30.44; return Math.max(0, Math.floor(meses)) + ' m'; }
      return '< 1 a';
    }
    return f.edad + ' a';
  }
  function textoEspera(f) {
    const d = diasEntre(f.fecha, S.hoy);
    return d <= 0 ? 'recibida hoy' : d === 1 ? 'hace 1 día' : 'hace ' + d + ' días';
  }
  function textoCita(f) { return f.cita_fecha ? fechaMedia(f.cita_fecha) + ' · ' + hora12(f.cita_hora) : ''; }

  function celdaCita(f) {
    if (f.estado !== 'PENDIENTE') {
      return [chipEstado(f), f.cita_fecha ? h('div', { class: 'tenue', style: 'margin-top:3px' }, 'Cita: ' + textoCita(f)) : null];
    }
    const abierta = S.panel && S.panel.id === f.id;
    const alternar = function (ev) { ev.stopPropagation(); alternarPanel(f); };
    if (!f.cita_fecha) {
      return h('button', { class: 'btn suave btn-cita', 'aria-expanded': String(abierta), onclick: alternar }, 'Asignar cita', h('span', { class: 'fl' }, abierta ? ' ▲' : ' ▼'));
    }
    const pasada = f.cita_fecha < S.hoy;
    return [h('button', { class: 'btn btn-cita', 'aria-expanded': String(abierta), onclick: alternar, style: pasada ? 'border-color:#e3b5b0' : '' },
      textoCita(f), h('span', { class: 'fl' }, abierta ? ' ▲' : ' ▼')),
    h('div', { class: 'chips' },
      pasada ? h('span', { class: 'chip urg' }, 'Cita pasada sin marcar') : null,
      f.sobrecupo === 'SI' ? h('span', { class: 'chip alerta' }, 'Sobrecupo') : null,
      f.notificado ? h('span', { class: 'chip ok', title: 'Notificado: ' + f.notificado }, 'Notificado ✓') : h('span', { class: 'chip gris' }, 'Sin notificar'))];
  }
  function alternarPanel(f) {
    if (S.panel && S.panel.id === f.id) S.panel = null;
    else S.panel = nuevoEstadoPanel(f);
    pintar();
  }
  function nuevoEstadoPanel(f) {
    return { id: f.id, modo: f.cita_fecha ? 'opciones' : 'asignar', fecha: '', hora: (S.config && S.config.horas[f.estudio]) || '06:00', medico: '' };
  }

  const COLS = {
    cita: { t: 'Cita', clase: 'c-cita', celda: celdaCita },
    marcar: { t: 'Realizado por · reporte', clase: 'c-marcar', celda: celdaMarcar },
    solicitud: { t: 'Solicitud', orden: 'fecha', clase: 'nowrap', e: 'Solicitud', celda: function (f) {
      return [fechaHora(f.fecha_hora), f.estado === 'PENDIENTE' ? h('div', { class: 'tenue' }, textoEspera(f)) : null];
    } },
    hora: { t: 'Hora', orden: 'hora', clase: 'nowrap', e: 'Hora', celda: function (f) { return h('b', null, hora12(f.cita_hora)); } },
    prioridad: { t: 'Prioridad', orden: 'prioridad', celda: chipPrioridad },
    paciente: { t: 'Paciente', orden: 'nombre', clase: 'c-pac pac', celda: function (f) {
      return [h('b', null, f.nombre), h('span', { class: 'tenue' }, 'Exp. ' + (f.expediente || 's/d') + ' · ' + f.id),
        S.repetidas.has(f.id) ? h('span', { class: 'chip rep', style: 'margin-left:6px', title: 'Mismo paciente, hospital y estudio solicitados con menos de 15 días de diferencia' }, 'Posible repetida') : null];
    } },
    edad: { t: 'Edad · sexo', orden: 'edad', clase: 'nowrap', e: 'Edad', celda: function (f) { return edadCorta(f) + (f.sexo ? ' · ' + f.sexo.charAt(0) : ''); } },
    hospital: { t: 'Hospital · especialidad', orden: 'hospital', clase: 'c-hosp', celda: function (f) {
      return [h('div', null, hospCorto(f.hospital)), h('span', { class: 'tenue' }, f.especialidad)];
    } },
    estudio: { t: 'Estudio', orden: 'estudio', e: 'Estudio', celda: function (f) { return f.estudio; } },
    citaTexto: { t: 'Cita', orden: 'cita', clase: 'nowrap', e: 'Cita', celda: function (f) {
      if (!f.cita_fecha) return h('span', { class: 'tenue' }, 'Sin cita');
      return [textoCita(f), f.cita_medico ? h('div', { class: 'tenue' }, f.cita_medico) : null,
        f.motivo_no === NO_ACUDIRA ? h('div', { class: 'tenue' }, 'cancelada') : null];
    } },
    medicoCita: { t: 'Médico', e: 'Médico', celda: function (f) { return f.cita_medico || '—'; } }
  };

  function tabla(filas, u, op) {
    const o = op || {};
    if (!filas.length) return h('div', { class: 'tabla-caja' }, h('div', { class: 'vacio' }, S.sincronizado ? (o.vacio || 'No hay solicitudes en este apartado.') : 'Cargando solicitudes…'));
    const visibles = filas.slice(0, u.limite);
    const cuerpo = h('tbody');
    visibles.forEach(function (f) {
      const plegable = o.plegable && f.estado === 'PENDIENTE';
      const abierta = plegable && S.panel && S.panel.id === f.id;
      cuerpo.appendChild(h('tr', { class: (f.estado === 'PENDIENTE' ? '' : 'cerrada') + (abierta ? ' abierta' : ''), tabindex: '0',
        onclick: function () { if (plegable) alternarPanel(f); else abrirDetalle(f); },
        onkeydown: function (ev) { if (ev.key === 'Enter' && ev.target.tagName === 'TR') { if (plegable) alternarPanel(f); else abrirDetalle(f); } } },
      o.columnas.map(function (k) { const c = COLS[k]; return h('td', { class: c.clase || null, 'data-e': c.e || null }, c.celda(f)); })));
      if (abierta) {
        cuerpo.appendChild(h('tr', { class: 'plegable' }, h('td', { colspan: String(o.columnas.length) },
          panelCita(f, S.panel, function (cerrar) { if (cerrar) S.panel = null; pintar(); }))));
      }
    });
    const col = function (k) {
      const c = COLS[k];
      const ord = c.orden && o.ordenes.indexOf(c.orden) >= 0 ? c.orden : null;
      return h('th', null, ord ? h('button', { title: 'Ordenar por ' + c.t.toLowerCase(), onclick: function () { if (u.orden === ord) u.dir = -u.dir; else { u.orden = ord; u.dir = 1; } pintar(); } },
        c.t + (u.orden === ord ? (u.dir > 0 ? ' ↑' : ' ↓') : '')) : c.t);
    };
    return h('div', { class: 'tabla-caja' },
      h('div', { class: 'tabla-scroll' }, h('table', { class: 'censo' }, h('thead', null, h('tr', null, o.columnas.map(col))), cuerpo)),
      h('div', { class: 'pie-tabla' }, h('span', null, 'Mostrando ' + visibles.length + ' de ' + plural(filas.length, 'solicitud', 'solicitudes')),
        filas.length > visibles.length ? h('button', { class: 'btn chico', onclick: function () { u.limite += 150; pintar(); } }, 'Mostrar más') : null));
  }

  /* ============================== panel de cita (plegable) ============================== */
  function mensajeCita(f) {
    return [NOMBRE_SERVICIO + ' – cita para estudio cardiológico',
      'Paciente: ' + f.nombre + ' (exp. ' + f.expediente + ')',
      'Hospital: ' + f.hospital,
      'Estudio: ' + f.estudio,
      'Fecha: ' + fechaLarga(f.cita_fecha),
      'Hora: ' + hora12(f.cita_hora) + (f.cita_medico ? ' · ' + f.cita_medico : ''),
      '',
      'Todo paciente hospitalizado debe acudir acompañado de médico y personal de enfermería. Si no podrá acudir con el paciente, favor de avisar con tiempo para reasignar el cupo.',
      'Solicitud ' + f.id].join('\n');
  }
  function enlaceWhatsApp(f) {
    // Números de El Salvador: 8 dígitos (se antepone 503). De otros países: guardados con "+código".
    const s = String(f.contacto || '');
    const num = s.charAt(0) === '+' ? s.slice(1).replace(/\D/g, '') : /^\d{8}$/.test(s) ? '503' + s : '';
    return num && f.cita_fecha ? 'https://wa.me/' + num + '?text=' + encodeURIComponent(mensajeCita(f)) : '';
  }
  async function marcarNotificado(f, valor, silencioso) {
    try {
      const r = await api('cita.notificado', { id: f.id, valor: valor });
      aplicarFila(r);
      if (!silencioso) tostada(valor ? 'Marcada como notificada.' : 'Se quitó la marca de notificada.');
    } catch (e) { tostada(e.message, { error: true }); }
    refrescarDetalle(f.id);
    if (!modalesAbiertos() || !silencioso) pintar();
  }
  function botonWhatsApp(f, clase) {
    const url = enlaceWhatsApp(f);
    if (!url) return null;
    return h('a', { class: 'btn wa ' + (clase || ''), href: url, target: '_blank', rel: 'noopener',
      onclick: function (ev) { ev.stopPropagation(); if (!f.notificado) marcarNotificado(f, true, true); } }, 'Notificar por WhatsApp');
  }

  /**
   * Panel para asignar, reprogramar o cancelar la cita. "st" guarda lo que se está editando
   * ({modo, fecha, hora, medico}) para que sobreviva a los repintados. alCambiar(cerrar) se llama al terminar.
   */
  function panelCita(f, st, alCambiar) {
    const caja = h('div', { class: 'panel-cita', onclick: function (ev) { ev.stopPropagation(); } });
    if (f.estado !== 'PENDIENTE') {
      agregar(caja, [h('div', { class: 'linea' }, 'La solicitud está cerrada (', chipEstado(f), '). Para agendarla de nuevo, primero devuélvala a pendientes.'),
        f.cita_fecha ? h('div', { class: 'linea' }, 'Última cita: ', h('b', null, fechaLarga(f.cita_fecha) + ' · ' + hora12(f.cita_hora))) : null]);
      return caja;
    }
    if (st.modo === 'opciones' && !f.cita_fecha) {
      agregar(caja, [h('div', { class: 'linea' }, 'Esta solicitud aún no tiene cita asignada (' + textoEspera(f) + ').'),
        h('div', { class: 'botones' }, h('button', { class: 'btn primario', onclick: function () { st.modo = 'asignar'; alCambiar(false); } }, 'Asignar cita'))]);
      return caja;
    }
    if (st.modo === 'opciones') {
      const pasada = f.cita_fecha < S.hoy;
      agregar(caja, [
        h('h4', null, 'Cita: ' + fechaLarga(f.cita_fecha) + ' · ' + hora12(f.cita_hora),
          f.sobrecupo === 'SI' ? h('span', { class: 'chip alerta' }, 'Sobrecupo') : null, pasada ? h('span', { class: 'chip urg' }, 'Ya pasó: marque el resultado') : null),
        h('div', { class: 'linea' }, f.estudio + (f.cita_medico ? ' · ' + f.cita_medico : '') + ' · ' + hospCorto(f.hospital)),
        h('div', { class: 'linea' }, f.notificado ? ['Notificado: ', h('b', null, f.notificado)]
          : ['Aún no se ha notificado al médico solicitante (', h('b', null, telefono(f.contacto) || 'sin número'), ').']),
        h('div', { class: 'botones' },
          botonWhatsApp(f),
          f.contacto ? h('a', { class: 'btn', href: 'tel:' + f.contacto, onclick: function (ev) { ev.stopPropagation(); } }, 'Llamar') : null,
          h('button', { class: 'btn', onclick: function (ev) { conBoton(ev.currentTarget, function () { return marcarNotificado(f, !f.notificado); }); } },
            f.notificado ? 'Quitar marca de notificado' : 'Marcar como notificado')),
        h('div', { class: 'botones' },
          h('button', { class: 'btn primario', onclick: function () { st.modo = 'asignar'; st.fecha = ''; st.hora = f.cita_hora; st.medico = f.cita_medico; alCambiar(false); } }, 'Reprogramar'),
          h('button', { class: 'btn peligro', onclick: function (ev) { noPodraAcudir(f, ev.currentTarget, alCambiar); } }, 'Paciente no podrá acudir'),
          h('button', { class: 'btn', onclick: function () { abrirDetalle(f); } }, 'Ver solicitud completa'))
      ]);
      return caja;
    }
    // Modo asignar / reprogramar
    const err = cajaError();
    const libres = proximasLibres(f.estudio, S.hoy, 6);
    const ocupacion = h('div', { class: 'ocupacion', 'aria-live': 'polite' });
    const fecha = h('input', { type: 'date', id: 'pc-fecha-' + f.id, min: S.hoy, value: st.fecha, onchange: function (ev) { st.fecha = ev.target.value; actualizar(); } });
    const hora = h('input', { type: 'time', id: 'pc-hora-' + f.id, value: st.hora, step: 300, onchange: function (ev) { st.hora = ev.target.value; } });
    const medicos = S.medicos.filter(function (m) { return m.activo || m.nombre === st.medico; }).map(function (m) { return [m.nombre, m.nombre]; });
    const medico = selector([['', 'Sin asignar']].concat(medicos), st.medico, { id: 'pc-medico-' + f.id, onchange: function (ev) { st.medico = ev.target.value; } });
    const chips = h('div', { class: 'fechas-libres' });
    const pintarChips = function () {
      chips.textContent = '';
      if (!libres.length) { chips.appendChild(h('span', { class: 'linea' }, 'No hay días con cupo libre en los próximos 60 días. Elija una fecha y asigne en sobrecupo.')); return; }
      libres.forEach(function (x) {
        const p = partes(x.fecha);
        chips.appendChild(h('button', { type: 'button', class: 'fecha-chip', 'aria-pressed': String(st.fecha === x.fecha),
          onclick: function () { st.fecha = x.fecha; fecha.value = x.fecha; actualizar(); } },
        (x.fecha === S.hoy ? 'Hoy ' : DIA_CORTO[diaSemana(x.fecha) - 1] + ' ') + p[2] + ' ' + MES_CORTO[p[1] - 1], h('small', null, plural(x.libres, 'libre', 'libres'))));
      });
    };
    const actualizar = function () {
      pintarChips();
      ocupacion.textContent = '';
      ocupacion.className = 'ocupacion';
      if (!st.fecha) { ocupacion.appendChild(document.createTextNode('Elija un día de la lista o escriba la fecha.')); return; }
      const k = cuposDia(st.fecha, f.estudio), n = usados(st.fecha, f.estudio, f.id);
      const horas = {};
      filasArr().forEach(function (x) { if (x.id !== f.id && x.cita_fecha === st.fecha && x.estudio === f.estudio && ocupa(x)) horas[x.cita_hora] = (horas[x.cita_hora] || 0) + 1; });
      const lista = Object.keys(horas).sort().map(function (x) { return hora12(x) + (horas[x] > 1 ? ' (' + horas[x] + ')' : ''); });
      ocupacion.classList.add(k.cupos === 0 && n === 0 ? 'sin' : n >= k.cupos ? 'lleno' : 'libre');
      agregar(ocupacion, [h('b', null, f.estudio + ', ' + fechaSinAnio(st.fecha) + ': '),
        k.cupos === 0 ? 'sin cupos ese día' + (k.motivo ? ' (' + k.motivo + ')' : '') + (n ? ' · ' + plural(n, 'cita en sobrecupo', 'citas en sobrecupo') : '')
          : n + ' de ' + k.cupos + ' cupos ocupados' + (n >= k.cupos ? ' — cupos completos' : ''),
        lista.length ? h('span', { class: 'horas' }, 'Horas ya agendadas: ' + lista.join(', ')) : null]);
    };
    const btn = h('button', { class: 'btn primario', onclick: function (ev) { guardarCita(f, st, ev.currentTarget, err, fecha, alCambiar); } }, f.cita_fecha ? 'Guardar nueva fecha' : 'Asignar cita');
    agregar(caja, [
      h('h4', null, (f.cita_fecha ? 'Reprogramar cita · ' : 'Asignar cita · ') + f.estudio, chipPrioridad(f)),
      f.cita_fecha ? h('div', { class: 'linea' }, 'Cita actual: ', h('b', null, fechaLarga(f.cita_fecha) + ' · ' + hora12(f.cita_hora)), '. Al guardar, ese cupo queda libre.') : null,
      h('div', null, h('div', { class: 'linea', style: 'margin-bottom:6px' }, 'Próximos días con cupo para ' + f.estudio + ':'), chips),
      h('div', { class: 'fila' },
        h('div', { class: 'campo corto' }, h('label', { for: 'pc-fecha-' + f.id }, 'Fecha'), fecha),
        h('div', { class: 'campo corto' }, h('label', { for: 'pc-hora-' + f.id }, 'Hora'), hora),
        h('div', { class: 'campo' }, h('label', { for: 'pc-medico-' + f.id }, 'Médico (opcional)'), medico)),
      ocupacion, err,
      h('div', { class: 'botones' }, btn,
        h('button', { class: 'btn', onclick: function () { st.modo = 'opciones'; alCambiar(!f.cita_fecha); } }, 'Cancelar'))
    ]);
    actualizar();
    return caja;
  }

  async function guardarCita(f, st, btn, err, inputFecha, alCambiar, sobrecupo) {
    err.textContent = '';
    if (!st.fecha) { mostrarError(err, new Error('Elija la fecha de la cita.')); inputFecha.focus(); return; }
    if (!/^\d{2}:\d{2}$/.test(st.hora || '')) { mostrarError(err, new Error('Escriba la hora de la cita.')); return; }
    if (st.fecha < S.hoy) { mostrarError(err, new Error('La fecha ya pasó.')); return; }
    if (!sobrecupo) {
      const k = cuposDia(st.fecha, f.estudio), n = usados(st.fecha, f.estudio, f.id);
      if (n >= k.cupos && !(await confirmarSobrecupo(f, st.fecha, n, k))) { inputFecha.focus(); return; }
      sobrecupo = n >= k.cupos;
    }
    try {
      const r = await conBoton(btn, function () { return api('cita.asignar', { id: f.id, fecha: st.fecha, hora: st.hora, medico: st.medico, sobrecupo: !!sobrecupo }); });
      const reprogramada = !!f.cita_fecha;
      f = aplicarFila(r);
      st.modo = 'opciones';
      tostada((reprogramada ? 'Cita reprogramada: ' : 'Cita asignada: ') + f.nombre + ', ' + textoCita(f) + (f.sobrecupo === 'SI' ? ' (sobrecupo)' : ''),
        enlaceWhatsApp(f) ? { accion: { texto: 'Notificar por WhatsApp', fn: function () { window.open(enlaceWhatsApp(f), '_blank', 'noopener'); marcarNotificado(f, true, true); } } } : null);
      refrescarDetalle(f.id);
      alCambiar(false);
    } catch (e) {
      if (e.code === 'SIN_CUPO' && e.datos) {
        // Otra persona ocupó el último cupo mientras tanto.
        if (await confirmarSobrecupo(f, st.fecha, e.datos.usados, { cupos: e.datos.cupos, motivo: e.datos.motivo })) guardarCita(f, st, btn, err, inputFecha, alCambiar, true);
        return;
      }
      mostrarError(err, e);
    }
  }
  function confirmarSobrecupo(f, fecha, n, k) {
    const texto = k.cupos === 0
      ? 'El ' + fechaLarga(fecha) + ' no tiene cupos de ' + f.estudio + (k.motivo ? ' (' + k.motivo + ')' : '') + (n ? ' y ya hay ' + plural(n, 'cita', 'citas') + ' en sobrecupo' : '') + '.'
      : 'El ' + fechaLarga(fecha) + ' ya tiene ' + n + ' de ' + k.cupos + ' cupos de ' + f.estudio + ' ocupados.';
    return preguntar('Se alcanzó el límite de cupos', [texto, '¿Desea asignar otra fecha o asignar en sobrecupo?'], 'Asignar en sobrecupo', 'Elegir otra fecha', 'alerta');
  }
  async function noPodraAcudir(f, btn, alCambiar) {
    const ok = await preguntar('Paciente no podrá acudir', ['¿Confirma que ' + f.nombre + ' no podrá acudir a su cita del ' + fechaLarga(f.cita_fecha) + '?',
      'La solicitud se cerrará como "No podrá acudir" y el cupo de ese día quedará libre para otro paciente.'], 'Sí, no podrá acudir', 'Volver', 'peligro');
    if (!ok) return;
    try {
      const r = await conBoton(btn, function () { return api('cita.no_acudira', { id: f.id }); });
      f = aplicarFila(r);
      if (S.panel && S.panel.id === f.id) S.panel = null;
      tostada(f.nombre + ': no podrá acudir. Cupo liberado.', { accion: { texto: 'Deshacer', fn: function () { marcar(f, 'P|', 'N|' + NO_ACUDIRA, null, true); } } });
      refrescarDetalle(f.id);
      alCambiar(true);
    } catch (e) { tostada(e.message, { error: true }); }
  }

  /* ============================== asignación de citas ============================== */
  function calendario(u) {
    const p = u.mes.split('-').map(Number);
    const primero = u.mes + '-01';
    const diasMes = new Date(Date.UTC(p[0], p[1], 0)).getUTCDate();
    const desfase = diaSemana(primero) - 1;
    const rejilla = h('div', { class: 'cal-rejilla', role: 'grid', 'aria-label': 'Calendario de citas' },
      LETRAS_DIA.map(function (l, i) { return h('div', { class: 'cal-dsem', title: NOMBRES_DIA[i] }, l); }));
    for (let i = 0; i < desfase; i++) rejilla.appendChild(h('div', { class: 'cal-dia vacio-mes' }));
    for (let d = 1; d <= diasMes; d++) {
      const fecha = u.mes + '-' + String(d).padStart(2, '0');
      const r = resumenDia(fecha, u.estudio);
      const pasado = fecha < S.hoy;
      const clases = ['cal-dia', r.clase, pasado ? 'pasado' : '', fecha === S.hoy ? 'hoy' : '', u.dia === fecha ? 'elegido' : '', !u.estudio ? 'con-det' : ''].join(' ');
      const det = !u.estudio ? h('div', { class: 'det' }, r.det.filter(function (x) { return x.cupos || x.usados; }).map(function (x) {
        return h('span', { class: x.usados >= x.cupos ? 'full' : '' }, CORTO[x.estudio] + ' ' + x.usados + '/' + x.cupos);
      })) : null;
      const etiqueta = fechaSinAnio(fecha) + ': ' + (r.cupos || r.usados ? r.usados + ' de ' + r.cupos + ' cupos ocupados' : 'sin cupos') +
        (u.estudio ? ' de ' + u.estudio : '') + (r.det.some(function (x) { return x.cerrado && x.motivo; }) ? ' (' + r.det.filter(function (x) { return x.motivo; })[0].motivo + ')' : '');
      rejilla.appendChild(h('button', { type: 'button', class: clases, 'aria-label': etiqueta, title: etiqueta, 'aria-pressed': String(u.dia === fecha),
        onclick: function () { u.dia = u.dia === fecha ? '' : fecha; pintar(); } },
      h('span', { class: 'n' }, d), det, h('span', { class: 'c' }, r.cupos || r.usados ? r.usados + '/' + r.cupos : '')));
    }
    const cambiarMes = async function (delta) {
      const n = new Date(Date.UTC(p[0], p[1] - 1 + delta, 1)).toISOString().slice(0, 7);
      u.mes = n;
      u.dia = '';
      const inicio = sumarDias(n + '-01', -7);
      if (S.desde && inicio < S.desde) {
        try { await cargarAntiguos(inicio); } catch (e) { tostada(e.message, { error: true }); }
      }
      pintar();
    };
    const filtros = h('div', { class: 'cal-filtros', role: 'group', 'aria-label': 'Estudio' },
      [['', 'Todos']].concat(ESTUDIOS.map(function (e) { return [e, CORTO[e]]; })).map(function (x) {
        return h('button', { type: 'button', class: 'cal-filtro', 'aria-pressed': String(u.estudio === x[0]), title: x[0] || 'Todos los estudios',
          onclick: function () { u.estudio = x[0]; pintar(); } }, x[1]);
      }));
    return h('section', { class: 'panel' },
      h('div', { class: 'cal-cab' },
        h('div', { class: 'cal-nav' },
          h('button', { class: 'btn', 'aria-label': 'Mes anterior', onclick: function () { cambiarMes(-1); } }, '‹'),
          h('h3', null, MESES[p[1] - 1] + ' ' + p[0]),
          h('button', { class: 'btn', 'aria-label': 'Mes siguiente', onclick: function () { cambiarMes(1); } }, '›')),
        u.mes !== S.hoy.slice(0, 7) ? h('button', { class: 'btn chico', onclick: function () { u.mes = S.hoy.slice(0, 7); u.dia = ''; pintar(); } }, 'Ir a hoy') : null,
        filtros),
      rejilla,
      h('div', { class: 'cal-leyenda' }, h('span', null, h('i', { class: 'libre' }), 'Hay cupos'), h('span', null, h('i', { class: 'lleno' }), 'Cupos completos'),
        h('span', null, h('i', { class: 'sin' }), 'Sin cupos'), h('span', null, 'Cifra: citas / cupos' + (u.estudio ? ' de ' + u.estudio : ' (todos los estudios)') + '. Toque un día para ver quién viene.')));
  }

  function detalleDia(u) {
    const fecha = u.dia;
    const r = resumenDia(fecha, '');
    const citas = citasDe(fecha).filter(function (f) { return !u.estudio || f.estudio === u.estudio; })
      .sort(function (a, b) { return (a.motivo_no === NO_ACUDIRA) - (b.motivo_no === NO_ACUDIRA) || ORDENES.hora[1](a, b); });
    return h('section', { class: 'panel dia-detalle' },
      h('div', { class: 'cab', style: 'margin-bottom:8px' }, h('h3', { style: 'margin:0;flex:1' }, 'Citas del ' + fechaLarga(fecha)),
        h('a', { class: 'btn chico', href: '#/agenda/' + fecha }, 'Abrir agenda de ese día'),
        h('button', { class: 'btn chico', 'aria-label': 'Cerrar', onclick: function () { u.dia = ''; pintar(); } }, '✕')),
      h('div', { class: 'resumen' }, r.det.map(function (x) {
        return h('span', { class: 'chip ' + (x.cupos === 0 && x.usados === 0 ? 'gris' : x.usados >= x.cupos ? 'urg' : 'dem') },
          x.estudio + ' ' + x.usados + '/' + x.cupos + (x.cerrado ? ' · ' + (x.motivo || 'sin cupos') : ''));
      })),
      citas.length ? h('ul', { class: 'lista-citas' }, citas.map(function (f) {
        return h('li', { class: f.motivo_no === NO_ACUDIRA ? 'cancelada' : '', tabindex: '0', onclick: function () { abrirDetalle(f); },
          onkeydown: function (ev) { if (ev.key === 'Enter') abrirDetalle(f); } },
        h('span', { class: 'hr' }, hora12(f.cita_hora)),
        h('span', null, h('b', null, f.nombre), h('span', { class: 'tenue' }, f.estudio + ' · ' + hospCorto(f.hospital) + (f.cita_medico ? ' · ' + f.cita_medico : ''))),
        f.estado === 'PENDIENTE' ? chipPrioridad(f) : chipEstado(f));
      })) : h('p', { style: 'margin:0;color:#51606f' }, 'No hay citas ' + (u.estudio ? 'de ' + u.estudio + ' ' : '') + 'para este día.'));
  }

  function vistaCitas(main) {
    const u = ui('citas', { mes: S.hoy.slice(0, 7), estudio: '', dia: '', tab: 'sin', orden: 'prioridad', dir: 1, fEstudio: '', fHosp: '' });
    const pend = filasArr().filter(function (f) { return f.estado === 'PENDIENTE'; });
    // La fila que se está editando sigue visible aunque ya no corresponda a la pestaña (p. ej. recién agendada),
    // para que se pueda notificar en seguida. Sale de la lista al cerrar su panel.
    const abierta = function (f) { return S.panel && S.panel.id === f.id; };
    const grupos = {
      sin: pend.filter(function (f) { return !f.cita_fecha || abierta(f); }),
      con: pend.filter(function (f) { return f.cita_fecha || abierta(f); }),
      todas: filasArr()
    };
    const titulos = { sin: 'Por agendar', con: 'Agendadas', todas: 'Todas' };
    const cambiar = function (t) {
      u.tab = t;
      S.panel = null;
      u.limite = 150;
      if (t === 'sin') { u.orden = 'prioridad'; u.dir = 1; } else if (t === 'con') { u.orden = 'cita'; u.dir = 1; } else { u.orden = 'fecha'; u.dir = -1; }
      pintar();
    };
    const base = grupos[u.tab].filter(function (f) { return (!u.fEstudio || f.estudio === u.fEstudio) && (!u.fHosp || f.hospital === u.fHosp); });
    const ordenes = ['prioridad', 'fecha', 'cita', 'nombre', 'hospital', 'estudio'];
    agregar(main, [
      calendario(u),
      u.dia ? detalleDia(u) : null,
      h('div', { class: 'cab', style: 'margin-top:18px' }, h('h2', null, 'Solicitudes'),
        h('span', { class: 'estado-form' }, 'Toque la primera columna para asignar la cita, reprogramarla o avisar que el paciente no podrá acudir.')),
      h('div', { class: 'pestanas', role: 'tablist' }, Object.keys(titulos).map(function (t) {
        return h('button', { class: 'pestana', role: 'tab', 'aria-selected': String(u.tab === t), onclick: function () { cambiar(t); } }, titulos[t], h('span', { class: 'n' }, grupos[t].length));
      })),
      controles(u, ordenes, [
        filtroSelect('ci-estudio', 'Estudio', [['', 'Todos']].concat(ESTUDIOS.map(function (e) { return [e, e]; })), u.fEstudio, function (v) { u.fEstudio = v; }),
        filtroSelect('ci-hosp', 'Hospital', opcionesHospital(grupos[u.tab]), u.fHosp, function (v) { u.fHosp = v; })]),
      tabla(aplicar(base, u), u, { plegable: true, ordenes: ordenes, columnas: ['cita', 'solicitud', 'prioridad', 'paciente', 'edad', 'hospital', 'estudio'],
        vacio: u.tab === 'sin' ? 'No hay solicitudes por agendar.' : u.tab === 'con' ? 'No hay solicitudes agendadas en espera.' : 'No hay solicitudes en el periodo cargado.' })
    ]);
  }

  /* ============================== agenda del día ============================== */
  function vistaAgenda(main, fecha) {
    const u = ui('agenda', { estudio: '' });
    if (S.desde && fecha < S.desde) {
      main.appendChild(h('div', { class: 'vacio' }, 'Cargando citas de ese día…'));
      cargarAntiguos(sumarDias(fecha, -7)).then(pintar).catch(function (e) { tostada(e.message, { error: true }); });
      return;
    }
    const r = resumenDia(fecha, '');
    const filas = citasDe(fecha).filter(function (f) { return !u.estudio || f.estudio === u.estudio; })
      .sort(function (a, b) { return (a.motivo_no === NO_ACUDIRA) - (b.motivo_no === NO_ACUDIRA) || ORDENES.hora[1](a, b); });
    const activas = filas.filter(function (f) { return f.motivo_no !== NO_ACUDIRA; });
    const pend = activas.filter(function (f) { return f.estado === 'PENDIENTE'; }).length;
    const ir = function (d) { location.hash = '#/agenda/' + d; };
    const esHoy = fecha === S.hoy;
    agregar(main, [
      h('div', { class: 'cab' },
        h('h2', null, esHoy ? 'Agenda de hoy' : 'Agenda del ' + fechaSinAnio(fecha), h('small', { style: 'display:block;font-size:14px;font-weight:500;color:#51606f;margin-top:4px' },
          fechaLarga(fecha) + ' · ' + plural(activas.length, 'cita', 'citas') + ' · ' + pend + ' por marcar')),
        h('div', { class: 'nav-dia no-imprimir' },
          h('button', { class: 'btn', 'aria-label': 'Día anterior', onclick: function () { ir(sumarDias(fecha, -1)); } }, '‹'),
          !esHoy ? h('button', { class: 'btn', onclick: function () { ir(S.hoy); } }, 'Hoy') : null,
          h('input', { type: 'date', 'aria-label': 'Ir a la fecha', value: fecha, onchange: function (ev) { if (ev.target.value) ir(ev.target.value); } }),
          h('button', { class: 'btn', 'aria-label': 'Día siguiente', onclick: function () { ir(sumarDias(fecha, 1)); } }, '›'),
          h('button', { class: 'btn', onclick: function () { window.print(); } }, 'Imprimir'))),
      h('div', { class: 'resumen-dia' }, r.det.map(function (x) {
        return h('button', { type: 'button', class: 'cal-filtro', 'aria-pressed': String(u.estudio === x.estudio), title: 'Mostrar solo ' + x.estudio,
          onclick: function () { u.estudio = u.estudio === x.estudio ? '' : x.estudio; pintar(); } },
        x.estudio + ' ' + x.usados + '/' + x.cupos + (x.cerrado ? ' · ' + (x.motivo || 'sin cupos') : ''));
      })),
      tabla(filas, { limite: 500, orden: 'hora', dir: 1 }, { ordenes: [], columnas: ['marcar', 'hora', 'prioridad', 'paciente', 'edad', 'hospital', 'estudio', 'medicoCita'],
        vacio: 'No hay citas ' + (u.estudio ? 'de ' + u.estudio + ' ' : '') + 'para este día.' }),
      h('p', { class: 'no-imprimir', style: 'color:#51606f;font-size:13.5px' }, 'Toque un paciente para ver la solicitud completa, con el EKG y la radiografía. Las citas canceladas ("No podrá acudir") aparecen al final, en gris.')
    ]);
  }

  /* ============================== pendientes ============================== */
  function vistaPendientes(main) {
    const u = ui('pendientes', { orden: 'fecha', dir: 1, cita: '', fEstudio: '', fHosp: '', fPrio: '' });
    const todas = filasArr().filter(function (f) { return f.estado === 'PENDIENTE'; });
    const base = todas.filter(function (f) {
      return (!u.cita || (u.cita === 'con') === !!f.cita_fecha) && (!u.fEstudio || f.estudio === u.fEstudio) && (!u.fHosp || f.hospital === u.fHosp) && (!u.fPrio || f.prioridad === u.fPrio);
    });
    const sinCita = todas.filter(function (f) { return !f.cita_fecha; }).length;
    const vencidas = todas.filter(function (f) { return f.cita_fecha && f.cita_fecha < S.hoy; }).length;
    const ordenes = ['fecha', 'prioridad', 'cita', 'nombre', 'edad', 'hospital', 'estudio'];
    agregar(main, [
      h('div', { class: 'cab' }, h('h2', null, plural(todas.length, 'solicitud pendiente', 'solicitudes pendientes')),
        h('span', { class: 'estado-form' }, sinCita + ' sin cita · ' + (todas.length - sinCita) + ' con cita' + (vencidas ? ' · ' + plural(vencidas, 'cita pasada sin marcar', 'citas pasadas sin marcar') : ''))),
      vencidas ? h('div', { class: 'aviso alerta' }, 'Hay ' + plural(vencidas, 'cita cuya fecha ya pasó', 'citas cuya fecha ya pasó') + ' y siguen pendientes. Márquelas como realizadas o "Paciente no acudió".') : null,
      controles(u, ordenes, [
        filtroSelect('pe-cita', 'Cita', [['', 'Todas'], ['sin', 'Sin cita'], ['con', 'Con cita']], u.cita, function (v) { u.cita = v; }),
        filtroSelect('pe-estudio', 'Estudio', [['', 'Todos']].concat(ESTUDIOS.map(function (e) { return [e, e]; })), u.fEstudio, function (v) { u.fEstudio = v; }),
        filtroSelect('pe-prio', 'Prioridad', [['', 'Todas']].concat(PRIORIDADES.map(function (e) { return [e, e]; })), u.fPrio, function (v) { u.fPrio = v; }),
        filtroSelect('pe-hosp', 'Hospital', opcionesHospital(todas), u.fHosp, function (v) { u.fHosp = v; })]),
      tabla(aplicar(base, u), u, { ordenes: ordenes, columnas: ['marcar', 'solicitud', 'prioridad', 'paciente', 'edad', 'hospital', 'estudio', 'citaTexto'],
        vacio: 'No hay solicitudes pendientes con estos filtros.' })
    ]);
  }

  /* ============================== detalle ============================== */
  async function obtenerArchivo(id, cual, n) {
    return descargarArchivo(id + '|' + cual + '|' + (n || 0), function () { return api('archivo', { id: id, cual: cual, n: n || 0 }); });
  }
  async function descargarArchivo(llave, pedir) {
    if (S.archivos.has(llave)) return S.archivos.get(llave);
    const d = await pedir();
    const bin = atob(d.b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const a = { url: URL.createObjectURL(new Blob([bytes], { type: d.tipo })), tipo: d.tipo, nombre: d.nombre };
    S.archivos.set(llave, a);
    if (S.archivos.size > 24) { const vieja = S.archivos.keys().next().value; URL.revokeObjectURL(S.archivos.get(vieja).url); S.archivos.delete(vieja); }
    return a;
  }
  function visor(url) {
    const img = h('img', { src: url, class: 'ajustar', alt: 'Imagen ampliada' });
    const v = h('div', { class: 'visor' }, h('button', { class: 'btn cerrar' }, '✕ Cerrar'), img);
    const cerrar = function () { v.remove(); document.removeEventListener('keydown', tecla, true); };
    const tecla = function (ev) { if (ev.key === 'Escape') { ev.stopPropagation(); cerrar(); } };
    img.addEventListener('click', function (ev) { ev.stopPropagation(); img.classList.toggle('ajustar'); v.style.cursor = img.classList.contains('ajustar') ? 'zoom-out' : 'zoom-in'; });
    v.addEventListener('click', cerrar);
    document.addEventListener('keydown', tecla, true);
    document.body.appendChild(v);
  }
  function panelArchivo(f, cual, titulo, n) {
    const lienzo = h('div', { class: 'lienzo' });
    const acciones = h('span');
    if (!f[cual]) {
      lienzo.textContent = 'No se cargó este archivo.';
    } else {
      lienzo.appendChild(h('div', null, h('div', { class: 'giro' }), h('div', { style: 'margin-top:8px' }, 'Cargando…')));
      obtenerArchivo(f.id, cual, n).then(function (a) {
        lienzo.textContent = '';
        acciones.appendChild(h('a', { class: 'btn chico', href: a.url, target: '_blank', rel: 'noopener' }, 'Abrir en otra pestaña'));
        if (a.tipo === 'application/pdf') {
          if (navigator.pdfViewerEnabled) lienzo.appendChild(h('iframe', { src: a.url, title: titulo }));
          else lienzo.textContent = 'Documento PDF. Use "Abrir en otra pestaña" para verlo.';
        } else {
          lienzo.appendChild(h('img', { src: a.url, alt: titulo, title: 'Clic para ampliar', onclick: function () { visor(a.url); } }));
        }
      }).catch(function (e) { lienzo.textContent = 'No se pudo cargar: ' + e.message; });
    }
    return h('div', { class: 'archivo' }, h('div', { class: 'tit' }, titulo, acciones), lienzo);
  }
  function botonesOtros(f) {
    const n = Number(f.otros || 0);
    if (!n) return null;
    return h('section', { class: 'ficha todo' }, h('h3', null, 'Otros estudios y reportes (hoja anterior)'),
      h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' }, Array.from({ length: n }, function (x, i) {
        return h('button', { class: 'btn chico', onclick: async function (ev) {
          try {
            const a = await conBoton(ev.currentTarget, function () { return obtenerArchivo(f.id, 'otros', i); });
            if (/^image\//.test(a.tipo)) visor(a.url); else window.open(a.url, '_blank', 'noopener');
          } catch (e) { tostada(e.message, { error: true }); }
        } }, 'Archivo ' + (i + 1));
      })));
  }
  /* ============================== reporte del estudio ============================== */
  const MAX_REPORTE = 8 * 1024 * 1024;
  const TEXTO_REPORTE = { 'AUTOMÁTICO': 'Vinculado automáticamente', 'CONFIRMADO': 'Reporte confirmado', 'CARGADO': 'Cargado a mano', 'POR REVISAR': 'Por revisar' };
  function conCensoReportes(f) { return S.estudiosConReporte.indexOf(f.estudio) >= 0; }
  /** Quita de la memoria el archivo descargado (el reporte cambió). */
  function olvidarArchivo(llave) {
    Array.from(S.archivos.keys()).forEach(function (k) {
      if (k.indexOf(llave) === 0) { URL.revokeObjectURL(S.archivos.get(k).url); S.archivos.delete(k); }
    });
  }
  function chipReporte(f) {
    if (!f.reporte) return null;
    return h('span', { class: 'chip ' + (f.reporte_estado === 'POR REVISAR' ? 'alerta' : 'ok') }, TEXTO_REPORTE[f.reporte_estado] || 'Con reporte');
  }
  /** Botón junto a "Realizado por": subir el reporte, verlo o revisarlo. */
  function botonReporte(f) {
    if (f.reporte) {
      const revisar = f.reporte_estado === 'POR REVISAR';
      return h('button', { type: 'button', class: 'btn chico btn-rep no-imprimir ' + (revisar ? 'revisar' : 'con'),
        title: revisar ? 'Se encontró un reporte que podría ser de este paciente. Revíselo y confírmelo.' : TEXTO_REPORTE[f.reporte_estado] || 'Ver el reporte',
        onclick: function (ev) { ev.stopPropagation(); abrirDetalle(S.filas.get(f.id) || f, { ir: 'reporte' }); } }, revisar ? 'Revisar reporte' : 'Ver reporte ✓');
    }
    if (f.estado === 'NO REALIZADO') return null;
    return h('button', { type: 'button', class: 'btn chico btn-rep sin no-imprimir',
      title: 'Subir una foto o un PDF del reporte' + (conCensoReportes(f) ? '. El reporte del ecógrafo también se busca solo cada hora.' : ''),
      onclick: function (ev) { ev.stopPropagation(); elegirArchivoReporte(f, ev.currentTarget); } }, '+ Subir reporte');
  }
  function celdaMarcar(f) { return h('div', { class: 'marcar-caja' }, selectorMarcado(f), botonReporte(f)); }

  function elegirArchivoReporte(f, btn) {
    const input = h('input', { type: 'file', accept: 'image/*,application/pdf,.pdf', style: 'display:none' });
    input.addEventListener('change', function () {
      const archivo = input.files && input.files[0];
      input.remove();
      if (archivo) subirReporte(f, archivo, btn);
    });
    document.body.appendChild(input);
    input.click();
  }
  /** PDF tal cual; las fotos se reducen (máx. 2400 px, JPG) para que suban rápido con mala conexión. */
  async function prepararReporte(archivo) {
    const ext = (String(archivo.name || '').split('.').pop() || '').toLowerCase();
    if (archivo.type === 'application/pdf' || ext === 'pdf') {
      if (archivo.size > MAX_REPORTE) throw new Error('El PDF pesa más de 8 MB.');
      return archivo;
    }
    if (!/^image\//.test(archivo.type) && ['jpg', 'jpeg', 'png'].indexOf(ext) < 0) throw new Error('Use una foto (JPG o PNG) o un PDF.');
    const url = URL.createObjectURL(archivo);
    try {
      const img = await new Promise(function (ok, mal) {
        const i = new Image();
        i.onload = function () { ok(i); };
        i.onerror = function () { mal(new Error('No se pudo abrir la imagen. Pruebe con otra foto o con un PDF.')); };
        i.src = url;
      });
      const escala = Math.min(1, 2400 / Math.max(img.naturalWidth, img.naturalHeight));
      if (/^image\/(jpeg|png)$/.test(archivo.type) && escala === 1 && archivo.size <= 900 * 1024) return archivo;
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * escala);
      c.height = Math.round(img.naturalHeight * escala);
      const g = c.getContext('2d');
      g.fillStyle = '#fff';
      g.fillRect(0, 0, c.width, c.height);
      g.drawImage(img, 0, 0, c.width, c.height);
      const b = await new Promise(function (ok) { c.toBlob(ok, 'image/jpeg', 0.88); });
      if (!b) throw new Error('No se pudo preparar la imagen.');
      if (b.size > MAX_REPORTE) throw new Error('La imagen pesa más de 8 MB.');
      return b;
    } finally { URL.revokeObjectURL(url); }
  }
  function aBase64(blob) {
    return new Promise(function (ok, mal) {
      const r = new FileReader();
      r.onload = function () { ok(String(r.result).split(',')[1] || ''); };
      r.onerror = function () { mal(new Error('No se pudo leer el archivo.')); };
      r.readAsDataURL(blob);
    });
  }
  async function subirReporte(f, archivo, btn) {
    if (f.reporte && !(await preguntar('¿Reemplazar el reporte?', 'Esta solicitud ya tiene un reporte. El archivo nuevo lo reemplazará.', 'Sí, reemplazar', 'Cancelar'))) return;
    const trabajo = async function () {
      const blob = await prepararReporte(archivo);
      const r = await api('reporte.subir', { id: f.id, archivo: { b64: await aBase64(blob) } });
      olvidarArchivo(f.id + '|reporte|');
      return aplicarFila(r);
    };
    try {
      const x = btn && btn.isConnected ? await conBoton(btn, trabajo) : await trabajo();
      tostada('Reporte cargado · ' + x.nombre);
    } catch (e) { tostada(e.message, { error: true }); }
    refrescarDetalle(f.id);
    pintar();
  }
  async function accionReporte(f, accion, btn, mensaje) {
    try {
      const r = await conBoton(btn, function () { return api(accion, { id: f.id }); });
      if (accion !== 'reporte.confirmar') olvidarArchivo(f.id + '|reporte|');
      aplicarFila(r);
      tostada(mensaje);
    } catch (e) { tostada(e.message, { error: true }); }
    refrescarDetalle(f.id);
    pintar();
  }

  /** Contenido de la sección "Reporte del estudio" en el detalle. */
  function pintarReporte(caja, f) {
    caja.textContent = '';
    const censo = conCensoReportes(f);
    const boton = function (texto, clase, fn) { return h('button', { type: 'button', class: 'btn chico ' + (clase || ''), onclick: function (ev) { fn(ev.currentTarget); } }, texto); };
    const subir = boton(f.reporte ? 'Reemplazar (subir foto o PDF)' : 'Subir foto o PDF', f.reporte ? '' : 'oscuro', function (b) { elegirArchivoReporte(f, b); });
    const buscar = censo ? boton(f.reporte ? 'Elegir otro del censo' : 'Buscar en el censo de reportes', '', function () { elegirDelCenso(f); }) : null;
    if (!f.reporte) {
      agregar(caja, [
        h('p', { class: 'tenue', style: 'margin:0 0 6px' }, 'Sin reporte.' + (censo ? ' El reporte del ecógrafo se busca automáticamente cada hora (7:00 a. m. a 3:59 p. m.). También puede buscarlo en el censo o subir una foto o un PDF.' : '')),
        f.reporte_info ? h('p', { class: 'tenue', style: 'margin:0 0 10px' }, f.reporte_info) : null,
        h('div', { class: 'acciones-rep' }, subir, buscar)]);
      return;
    }
    const revisar = f.reporte_estado === 'POR REVISAR';
    const vistaRep = panelArchivo(f, 'reporte', 'Reporte');
    vistaRep.classList.add('reporte');
    agregar(caja, [
      h('div', { class: 'linea-rep' }, chipReporte(f), f.reporte_info ? h('span', { class: 'tenue' }, f.reporte_info) : null),
      revisar ? h('div', { class: 'aviso alerta', style: 'margin-top:0' }, h('b', null, '¿Este reporte es de ' + f.nombre + '?'),
        ' Exp. ' + (f.expediente || 's/d') + ' · nacimiento ' + (f.fecha_nacimiento || 's/d') + '. Compare los datos del reporte antes de confirmar.') : null,
      h('div', { class: 'acciones-rep' },
        revisar ? boton('Sí, corresponde', 'primario', function (b) { accionReporte(f, 'reporte.confirmar', b, 'Reporte confirmado.'); }) : null,
        revisar ? boton('No corresponde', 'peligro', function (b) { accionReporte(f, 'reporte.descartar', b, 'Se quitó el reporte propuesto; no se volverá a proponer.'); }) : null,
        buscar, subir,
        revisar ? null : boton('Quitar reporte', 'peligro', async function (b) {
          if (await preguntar('¿Quitar el reporte?', 'La solicitud quedará sin reporte.' + (censo ? ' Ese archivo no se le volverá a proponer automáticamente.' : ''), 'Sí, quitar', 'Cancelar', 'peligro')) {
            accionReporte(f, 'reporte.descartar', b, 'Reporte quitado.');
          }
        })),
      h('div', { style: 'margin-top:12px' }, vistaRep)]);
  }

  /** Busca en el censo de reportes (los más parecidos al paciente primero) y permite elegir el correcto. */
  function elegirDelCenso(f) {
    abrirModal(function (cerrar) {
      const lista = h('div', { class: 'lista-censo' }, h('div', { class: 'vacio' }, 'Buscando en el censo…'));
      const vista = h('div', { class: 'vista-censo' });
      const err = cajaError();
      const q = h('input', { type: 'search', id: 'censo-q', placeholder: 'Nombre o ID del paciente', autocomplete: 'off', 'data-foco': true });
      let pedido = 0;
      const marca = function (ok, texto) { return h('span', { class: 'chip ' + (ok ? 'ok' : 'gris') }, (ok ? '✓ ' : '✕ ') + texto); };
      const buscar = async function () {
        const n = ++pedido;
        err.textContent = '';
        try {
          const r = await api('reportes.buscar', { id: f.id, q: q.value.trim() });
          if (n === pedido) pintarLista(r);
        } catch (e) { if (n === pedido) { lista.textContent = ''; mostrarError(err, e); } }
      };
      q.addEventListener('input', function () { clearTimeout(q._t); q._t = setTimeout(buscar, 350); });
      const ver = async function (x, btn) {
        try {
          const a = await conBoton(btn, function () { return descargarArchivo('censo|' + x.archivo, function () { return api('reporte.archivo', { archivo: x.archivo }); }); });
          vista.textContent = '';
          vista.appendChild(h('div', { class: 'archivo reporte', style: 'margin-bottom:12px' },
            h('div', { class: 'tit' }, h('span', null, (x.paciente || x.nombre_archivo) + ' · ' + fechaHora(x.fecha_hora)),
              h('span', { class: 'acciones-rep' }, h('a', { class: 'btn chico', href: a.url, target: '_blank', rel: 'noopener' }, 'Abrir en otra pestaña'),
                h('button', { type: 'button', class: 'btn chico', onclick: function () { vista.textContent = ''; } }, 'Ocultar'))),
            h('div', { class: 'lienzo' }, navigator.pdfViewerEnabled ? h('iframe', { src: a.url, title: 'Reporte del censo' }) : 'Documento PDF. Use "Abrir en otra pestaña" para verlo.')));
          vista.scrollIntoView({ block: 'start' });
        } catch (e) { mostrarError(err, e); }
      };
      const elegir = async function (x, btn) {
        let mover = false, otra = null;
        for (;;) {
          try {
            const r = await conBoton(btn, function () { return api('reporte.vincular', { id: f.id, archivo: x.archivo, mover: mover }); });
            olvidarArchivo(f.id + '|reporte|');
            aplicarFila(r);
            break;
          } catch (e) {
            if (e.code === 'VINCULADO_A_OTRA' && !mover) {
              const idOtra = e.datos && e.datos.solicitud;
              otra = S.filas.get(idOtra) || null;
              const quien = otra ? ' (' + otra.nombre + ', ' + otra.estudio + ' del ' + fechaCorta(otra.fecha) + ')' : '';
              if (!(await preguntar('Ese reporte está en otra solicitud', 'Está vinculado a la solicitud ' + idOtra + quien + '. ¿Moverlo a esta solicitud? La otra quedará sin reporte.', 'Sí, moverlo aquí', 'Cancelar'))) return;
              mover = true;
              continue;
            }
            mostrarError(err, e);
            return;
          }
        }
        if (otra) { // la otra solicitud quedó sin reporte
          Object.assign(otra, { reporte: '', reporte_estado: '', reporte_info: 'El reporte se movió a la solicitud ' + f.id + '.' });
          olvidarArchivo(otra.id + '|reporte|');
        }
        cerrar();
        tostada('Reporte vinculado a ' + f.nombre + '.');
        refrescarDetalle(f.id);
        pintar();
      };
      const pintarLista = function (r) {
        lista.textContent = '';
        if (!r.reportes.length) {
          lista.appendChild(h('div', { class: 'vacio' }, q.value.trim() ? 'Ningún reporte del censo coincide con la búsqueda.' :
            'Ningún reporte del censo coincide con el expediente, el nombre o la fecha de nacimiento. Busque por nombre o ID.'));
        }
        r.reportes.forEach(function (x) {
          const actual = x.solicitud === f.id;
          lista.appendChild(h('div', { class: 'item-censo' + (actual ? ' actual' : '') },
            h('div', { class: 'crece' }, h('b', null, x.paciente || x.nombre_archivo),
              h('div', { class: 'tenue' }, 'ID: ' + (x.id_paciente || '—') + ' · nacimiento: ' + (x.fnac || '—') + ' · estudio: ' + (fechaHora(x.fecha_hora) || '—')),
              h('div', { class: 'chips' }, marca(x.coincide.expediente, 'Expediente'), marca(x.coincide.nombre, 'Nombre'), marca(x.coincide.fnac, 'Nacimiento'),
                x.solicitud ? h('span', { class: 'chip ' + (actual ? 'azul' : 'alerta') }, actual ? 'Es el reporte actual' : 'En la solicitud ' + x.solicitud) : null)),
            h('div', { class: 'acciones-rep' },
              h('button', { type: 'button', class: 'btn chico', onclick: function (ev) { ver(x, ev.currentTarget); } }, 'Ver'),
              actual ? null : h('button', { type: 'button', class: 'btn chico primario', onclick: function (ev) { elegir(x, ev.currentTarget); } }, 'Elegir este'))));
        });
        lista.appendChild(h('p', { class: 'tenue', style: 'margin:10px 0 0;font-size:13px' }, 'Reportes en el censo: ' + r.total_censo + '. Se muestran hasta 40, primero los que más coinciden y los más cercanos a la fecha de la cita.'));
      };
      buscar();
      return h('div', { class: 'modal' },
        h('div', { class: 'modal-cab' },
          h('div', { style: 'min-width:0' }, h('h2', null, 'Elegir reporte del censo'),
            h('div', { class: 'meta' }, h('span', null, f.nombre), h('span', null, '· Exp. ' + (f.expediente || 's/d')), h('span', null, '· Nac. ' + (f.fecha_nacimiento || 's/d')),
              h('span', null, '· Solicitud ' + fechaCorta(f.fecha) + (f.cita_fecha ? ' · cita ' + fechaCorta(f.cita_fecha) : '')))),
          h('button', { class: 'btn chico x', onclick: cerrar, 'aria-label': 'Cerrar' }, '✕ Cerrar')),
        h('div', { class: 'modal-cuerpo' }, h('div', { class: 'todo' }, vista,
          h('div', { class: 'campo' }, h('label', { for: 'censo-q' }, 'Buscar (vacío = los que coinciden con el paciente)'), q), err, lista)));
    });
  }

  /* ============================== comentario ============================== */
  function seccionComentario(f0) {
    let f = f0;
    let guardado = f.comentario || '';
    const txt = h('textarea', { id: 'comentario-txt', rows: '5', maxlength: '5000', placeholder: 'Comentario sobre la solicitud o el estudio…', 'aria-label': 'Comentario' });
    txt.value = guardado;
    const info = h('span', { class: 'tenue' });
    const pintarInfo = function () {
      const cambios = txt.value !== guardado;
      info.textContent = (cambios ? 'Sin guardar · ' : f.comentario_por ? 'Guardado por ' + f.comentario_por + ' · ' : '') + txt.value.length + '/5000';
      info.classList.toggle('sin-guardar', cambios);
    };
    txt.addEventListener('input', pintarInfo);
    const plantillas = S.plantillas.filter(function (p) { return !p.estudio || p.estudio === f.estudio; });
    // Al elegir una plantilla se inserta donde está el cursor (o reemplaza el cuadro si está vacío).
    const sel = plantillas.length ? selector([['', 'Insertar plantilla…']].concat(plantillas.map(function (p, i) { return [String(i), p.nombre]; })), '',
      { id: 'plantilla-sel', 'aria-label': 'Insertar plantilla', onchange: function () {
        if (sel.value === '') return;
        const p = plantillas[Number(sel.value)];
        sel.value = '';
        const v = txt.value;
        if (!v.trim()) txt.value = p.texto;
        else {
          const ini = typeof txt.selectionStart === 'number' ? txt.selectionStart : v.length, fin = typeof txt.selectionEnd === 'number' ? txt.selectionEnd : v.length;
          const antes = v.slice(0, ini), despues = v.slice(fin);
          txt.value = antes + (antes && !/\n$/.test(antes) ? '\n' : '') + p.texto + (despues && !/^\n/.test(despues) ? '\n' : '') + despues;
        }
        txt.focus();
        pintarInfo();
      } }) : null;
    const guardar = h('button', { type: 'button', class: 'btn primario', onclick: async function (ev) {
      try {
        const r = await conBoton(ev.currentTarget, function () { return api('comentario.guardar', { id: f.id, texto: txt.value }); });
        f = aplicarFila(r);
        txt.value = guardado = f.comentario || '';
        pintarInfo();
        tostada(guardado ? 'Comentario guardado.' : 'Comentario borrado.');
      } catch (e) { tostada(e.message, { error: true }); }
    } }, 'Guardar comentario');
    pintarInfo();
    return {
      sinGuardar: function () { return txt.value !== guardado; },
      seccion: h('section', { class: 'ficha todo comentario' }, h('h3', null, 'Comentario'), txt,
        h('div', { class: 'barra-com' }, info, h('div', { class: 'acciones-rep' }, sel ||
          (esAdmin() ? h('span', { class: 'tenue', style: 'font-size:13px' }, 'Puede crear plantillas en "Usuarios y médicos".') : null), guardar)))
    };
  }

  function dato(et, valor) { return h('div', null, h('dt', null, et), h('dd', null, valor || '—')); }
  function refrescarDetalle(id) { if (S.detalleAbierto && S.detalleAbierto.id === id) S.detalleAbierto.fn(S.filas.get(id)); }

  function abrirDetalle(f0, op) {
    let f = f0;
    const peso = Number(f.peso), talla = Number(f.talla);
    const imc = peso > 0 && talla > 0 ? (peso / Math.pow(talla / 100, 2)).toFixed(1) : '';
    const sc = peso > 0 && talla > 0 ? Math.sqrt(peso * talla / 3600).toFixed(2) + ' m²' : '';
    const seccionCita = h('div');
    const resultado = h('div');
    const st = Object.assign(nuevoEstadoPanel(f), { modo: 'opciones' });
    const pintarCita = function () {
      seccionCita.textContent = '';
      if (f.citas_previas) seccionCita.appendChild(h('p', { class: 'texto-largo', style: 'margin:0 0 10px' }, h('b', null, 'Citas anteriores'), f.citas_previas.split(' | ').join('\n')));
      if (f.estado !== 'PENDIENTE' && !f.cita_fecha) { seccionCita.appendChild(h('p', { style: 'margin:0;color:#51606f' }, 'No tuvo cita asignada.')); return; }
      seccionCita.appendChild(panelCita(f, st, function () { f = S.filas.get(f.id) || f; pintarCita(); pintar(); }));
    };
    const pintarResultado = function () {
      resultado.textContent = '';
      agregar(resultado, [h('div', { style: 'margin-bottom:10px' }, selectorMarcado(f)),
        h('dl', { class: 'datos' }, dato('Estado', chipEstado(f)), f.estado !== 'PENDIENTE' ? dato('Fecha de cierre', fechaHora(f.fecha_cierre)) : null,
          f.marcado_por ? dato('Marcado por', f.marcado_por) : null)]);
    };
    const seccionReporte = h('section', { class: 'ficha todo', id: 'seccion-reporte' }, h('h3', null, 'Reporte del estudio'));
    const cajaReporte = h('div');
    seccionReporte.appendChild(cajaReporte);
    const comentario = seccionComentario(f);
    pintarCita();
    pintarResultado();
    pintarReporte(cajaReporte, f);
    S.detalleAbierto = { id: f.id, fn: function (x) { if (x) f = x; pintarCita(); pintarResultado(); pintarReporte(cajaReporte, f); } };
    const contacto = f.contacto ? [h('a', { href: 'tel:' + f.contacto }, telefono(f.contacto))] : '';
    abrirModal(function (cerrar) {
      return h('div', { class: 'modal' },
        h('div', { class: 'modal-cab' },
          h('div', { style: 'min-width:0' }, h('h2', null, f.nombre),
            h('div', { class: 'meta' }, chipPrioridad(f), h('span', null, f.estudio), h('span', null, '·'), h('span', null, 'Solicitud ' + f.id),
              h('span', null, '·'), h('span', null, fechaHora(f.fecha_hora)),
              f.origen === 'HISTÓRICO' ? h('span', { class: 'chip gris' }, 'Hoja anterior') : null,
              S.repetidas.has(f.id) ? h('span', { class: 'chip rep' }, 'Posible repetida') : null)),
          h('button', { class: 'btn chico x', onclick: cerrar, 'aria-label': 'Cerrar' }, '✕ Cerrar')),
        h('div', { class: 'modal-cuerpo' },
          h('section', { class: 'ficha' }, h('h3', null, 'Paciente'), h('dl', { class: 'datos' },
            dato('Expediente', f.expediente), dato('Fecha de nacimiento', f.fecha_nacimiento), dato('Edad', f.edad === '' ? '' : f.edad === '0' ? edadCorta(f).replace(' m', ' meses') : f.edad + ' años'),
            dato('Sexo', f.sexo), dato('Peso', f.peso ? f.peso + ' kg' : ''), dato('Talla', f.talla ? f.talla + ' cm' : ''),
            dato('IMC', imc), dato('Superficie corporal', sc))),
          h('section', { class: 'ficha' }, h('h3', null, 'Procedencia'), h('dl', { class: 'datos' },
            h('div', { style: 'grid-column:1/-1' }, h('dt', null, 'Hospital'), h('dd', null, f.hospital || '—')),
            dato('Especialidad', f.especialidad), dato('Médico que solicita', f.medico), dato('Contacto', contacto))),
          h('section', { class: 'ficha todo' }, h('h3', null, 'Información clínica'),
            h('p', { class: 'texto-largo' }, h('b', null, 'Diagnósticos'), f.diagnostico || '—'),
            h('p', { class: 'texto-largo' }, h('b', null, 'Motivo por el cual solicita el estudio'), f.motivo || '—'),
            h('p', { class: 'texto-largo' }, h('b', null, 'Datos clínicos relevantes'), f.datos_clinicos || '—'),
            f.notas ? h('p', { class: 'texto-largo' }, h('b', null, 'Otros datos (hoja anterior)'), f.notas) : null),
          h('section', { class: 'todo archivos' }, panelArchivo(f, 'ekg', 'Electrocardiograma'), panelArchivo(f, 'rx', 'Rayos X de tórax')),
          botonesOtros(f),
          h('section', { class: 'ficha todo' }, h('h3', null, 'Cita'), seccionCita),
          h('section', { class: 'ficha todo' }, h('h3', null, 'Resultado'), resultado),
          seccionReporte,
          comentario.seccion));
    }, { alCerrar: function () { S.detalleAbierto = null; },
      antesDeCerrar: function () {
        return !comentario.sinGuardar() || preguntar('Comentario sin guardar', 'Escribió un comentario que todavía no se ha guardado.', 'Cerrar sin guardar', 'Seguir editando', 'peligro');
      } });
    if (op && op.ir === 'reporte') seccionReporte.scrollIntoView({ block: 'start' });
  }

  /* ============================== censo general ============================== */
  function uiCenso() {
    return ui('censo', { orden: 'fecha', dir: -1, estudio: '', hosp: '', estado: '', prio: '', reporte: '', desde: sumarDias(S.hoy || new Date().toISOString().slice(0, 10), -30), hasta: S.hoy || '' });
  }
  function vistaCenso(main) {
    const u = uiCenso();
    const ordenes = ['fecha', 'prioridad', 'cita', 'nombre', 'edad', 'hospital', 'estudio'];
    const enRango = filasArr().filter(function (f) { return (!u.desde || f.fecha >= u.desde) && (!u.hasta || f.fecha <= u.hasta); });
    const filas = enRango.filter(function (f) {
      return (!u.estudio || f.estudio === u.estudio) && (!u.hosp || f.hospital === u.hosp) && (!u.prio || f.prioridad === u.prio) &&
        (!u.estado || (u.estado === 'NO_ACUDIO' ? f.motivo_no === NO_ACUDIO : f.estado === u.estado)) &&
        (!u.reporte || (u.reporte === 'revisar' ? f.reporte_estado === 'POR REVISAR' : u.reporte === 'sin' ? !f.reporte : !!f.reporte && f.reporte_estado !== 'POR REVISAR'));
    });
    const visibles = aplicar(filas, u);
    const err = cajaError();
    const pedir = async function (desde, btn) {
      try {
        await conBoton(btn, function () { return cargarAntiguos(desde); });
        u.desde = desde === '0000-01-01' ? '' : desde;
        pintar();
      } catch (e) { mostrarError(err, e); }
    };
    const estudios = ESTUDIOS.concat(Array.from(new Set(enRango.map(function (f) { return f.estudio; }))).filter(function (e) { return e && ESTUDIOS.indexOf(e) < 0; }));
    const filtro = function (id, etiqueta, control) { return h('div', { class: 'campo chico' }, h('label', { for: id }, etiqueta), control); };
    const extra = [
      filtro('f-desde', 'Desde', h('input', { type: 'date', id: 'f-desde', value: u.desde, max: S.hoy, onchange: function (ev) {
        const v = ev.target.value;
        if (v && S.desde && v < S.desde) pedir(v, ev.target); else { u.desde = v; pintar(); }
      } })),
      filtro('f-hasta', 'Hasta', h('input', { type: 'date', id: 'f-hasta', value: u.hasta, max: S.hoy, onchange: function (ev) { u.hasta = ev.target.value; pintar(); } })),
      filtroSelect('f-estudio', 'Estudio', [['', 'Todos']].concat(estudios.map(function (x) { return [x, x]; })), u.estudio, function (v) { u.estudio = v; }),
      filtroSelect('f-hosp', 'Hospital', opcionesHospital(enRango), u.hosp, function (v) { u.hosp = v; }),
      filtroSelect('f-prio', 'Prioridad', [['', 'Todas']].concat(PRIORIDADES.map(function (x) { return [x, x]; })), u.prio, function (v) { u.prio = v; }),
      filtroSelect('f-estado', 'Estado', [['', 'Todos'], ['PENDIENTE', 'Pendiente'], ['REALIZADO', 'Realizado'], ['NO REALIZADO', 'No realizado'], ['NO_ACUDIO', 'Paciente no acudió']], u.estado, function (v) { u.estado = v; }),
      filtroSelect('f-reporte', 'Reporte', [['', 'Todos'], ['con', 'Con reporte'], ['sin', 'Sin reporte'], ['revisar', 'Por revisar']], u.reporte, function (v) { u.reporte = v; })
    ];
    agregar(main, [
      h('div', { class: 'cab' }, h('h2', null, 'Censo de solicitudes'),
        h('button', { class: 'btn no-imprimir', onclick: function (ev) { pedir('0000-01-01', ev.currentTarget); } }, 'Cargar todo el historial'),
        h('button', { class: 'btn oscuro no-imprimir', onclick: function () { exportarCsv(visibles); } }, 'Descargar (CSV)')),
      err,
      controles(u, ordenes, extra),
      tabla(visibles, u, { ordenes: ordenes, columnas: ['marcar', 'solicitud', 'prioridad', 'paciente', 'edad', 'hospital', 'estudio', 'citaTexto'], vacio: 'No hay solicitudes con estos filtros.' }),
      h('p', { class: 'no-imprimir', style: 'color:#51606f;font-size:13.5px' }, S.desde > '0000-01-01' ? 'Datos cargados desde el ' + fechaCorta(S.desde) + '. Para ver fechas anteriores, cambie "Desde" o use "Cargar todo el historial".' : 'Historial completo cargado.')
    ]);
  }

  function descargar(nombre, texto) {
    const url = URL.createObjectURL(new Blob(['﻿' + texto], { type: 'text/csv;charset=utf-8' }));
    const a = h('a', { href: url, download: nombre });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }
  function celdaCsv(v) {
    let s = String(v === undefined || v === null ? '' : v);
    if (/^[=+\-@\t]/.test(s)) s = "'" + s; // evita que Excel lo interprete como fórmula
    return '"' + s.replace(/"/g, '""') + '"';
  }
  function exportarCsv(filas) {
    if (!filas.length) { tostada('No hay filas para descargar.'); return; }
    if (!confirm('El archivo contendrá datos de ' + plural(filas.length, 'paciente', 'pacientes') + '. Guárdelo solo en un equipo institucional. ¿Descargar?')) return;
    const cols = [['id', 'Solicitud'], ['fecha_hora', 'Fecha y hora'], ['estudio', 'Estudio'], ['prioridad', 'Prioridad'], ['hospital', 'Hospital'], ['especialidad', 'Especialidad'],
      ['nombre', 'Paciente'], ['expediente', 'Expediente'], ['fecha_nacimiento', 'Fecha de nacimiento'], ['edad', 'Edad'], ['sexo', 'Sexo'], ['peso', 'Peso (kg)'], ['talla', 'Talla (cm)'],
      ['diagnostico', 'Diagnósticos'], ['motivo', 'Motivo del estudio'], ['datos_clinicos', 'Datos clínicos relevantes'], ['medico', 'Médico solicitante'], ['contacto', 'Contacto'],
      ['cita_fecha', 'Fecha de cita'], ['cita_hora', 'Hora de cita'], ['cita_medico', 'Médico de la cita'], ['sobrecupo', 'Sobrecupo'], ['notificado', 'Notificado'],
      ['estado', 'Estado'], ['realizado_por', 'Realizado por'], ['motivo_no', 'Motivo de no realización'], ['fecha_cierre', 'Fecha de cierre'],
      ['reporte_estado', 'Reporte'], ['comentario', 'Comentario'], ['comentario_por', 'Comentario guardado por'], ['origen', 'Origen']];
    const lineas = [cols.map(function (c) { return celdaCsv(c[1]); }).join(',')];
    filas.forEach(function (f) { lineas.push(cols.map(function (c) { return celdaCsv(f[c[0]]); }).join(',')); });
    descargar('censo_perifericos_' + S.hoy + '.csv', lineas.join('\r\n'));
  }

  /* ============================== control de cupos ============================== */
  function vistaCupos(main) {
    if (!S.cupos) {
      main.appendChild(h('div', { class: 'vacio' }, 'Cargando configuración…'));
      api('cupos.obtener').then(function (r) { S.cupos = r; S.config = r.config; if (ruta()[0] === 'cupos') pintar(); })
        .catch(function (e) { if (ruta()[0] === 'cupos') { main.textContent = ''; main.appendChild(h('div', { class: 'aviso error' }, e.message)); } });
      return;
    }
    const admin = esAdmin();
    const c = S.cupos.config;
    const b = S.cupos.borrador || (S.cupos.borrador = {
      semana: JSON.parse(JSON.stringify(c.semana)), horas: Object.assign({}, c.horas),
      formulario: { activo: c.formulario.activo, mensaje: c.formulario.mensaje || '', codigo: c.formulario.codigo || '' }
    });
    const err = cajaError();
    const totales = {};
    const pintarTotal = function (d) {
      if (totales[d]) totales[d].textContent = ESTUDIOS.reduce(function (s, e) { return s + Number(b.semana[d][e] || 0); }, 0);
    };
    const tablaSemana = h('table', { class: 'semana' },
      h('thead', null, h('tr', null, h('th', null, 'Día'), ESTUDIOS.map(function (e) { return h('th', { title: e }, h('span', { class: 'largo' }, e), h('span', { class: 'corto' }, CORTO[e])); }), h('th', null, 'Total'))),
      h('tbody', null, NOMBRES_DIA.map(function (nombre, i) {
        const d = i + 1;
        totales[d] = h('td', { class: 'tot' });
        const fila = h('tr', { class: d >= 6 ? 'finde' : '' }, h('td', null, h('span', { class: 'largo' }, nombre.charAt(0).toUpperCase() + nombre.slice(1)),
          h('span', { class: 'corto' }, nombre.charAt(0).toUpperCase() + nombre.slice(1, 3))),
          ESTUDIOS.map(function (e) {
            return h('td', null, admin ? h('input', { type: 'text', inputmode: 'numeric', maxlength: 2, value: String(b.semana[d][e]), 'aria-label': 'Cupos de ' + e + ' el ' + nombre, id: 'cs-' + d + '-' + ESTUDIOS.indexOf(e),
              oninput: function (ev) { ev.target.value = ev.target.value.replace(/\D/g, ''); b.semana[d][e] = ev.target.value === '' ? 0 : Number(ev.target.value); pintarTotal(d); } })
              : String(b.semana[d][e]));
          }), totales[d]);
        pintarTotal(d);
        return fila;
      })));
    const horasHabituales = h('div', { class: 'fila-form', style: 'margin-top:14px' }, ESTUDIOS.map(function (e, i) {
      return h('div', { class: 'campo', style: 'flex:1 1 140px' }, h('label', { for: 'ch-' + i }, 'Hora habitual · ' + CORTO[e]),
        admin ? h('input', { type: 'time', id: 'ch-' + i, value: b.horas[e], onchange: function (ev) { b.horas[e] = ev.target.value; } }) : h('div', null, hora12(b.horas[e])));
    }));

    const aplicarRespuesta = function (r, mensaje) { S.cupos = r; S.config = r.config; pintar(); if (mensaje) tostada(mensaje); };
    const fecha = h('input', { type: 'date', id: 'sc-fecha', min: S.hoy });
    const estudio = selector([['TODOS', 'Todos los estudios']].concat(ESTUDIOS.map(function (e) { return [e, e]; })), 'TODOS', { id: 'sc-estudio' });
    const motivo = h('input', { type: 'text', id: 'sc-motivo', maxlength: 80, placeholder: 'Ej. asueto, congreso, equipo en mantenimiento' });
    const futuras = c.sin_cupo.filter(function (x) { return x.fecha >= S.hoy; });
    const guardar = async function (ev) {
      err.textContent = '';
      for (let d = 1; d <= 7; d++) ESTUDIOS.forEach(function (e) { if (!(b.semana[d][e] >= 0)) b.semana[d][e] = 0; });
      try {
        const r = await conBoton(ev.currentTarget, function () { return api('cupos.guardar', { semana: b.semana, horas: b.horas, formulario: b.formulario }); });
        aplicarRespuesta(r, 'Configuración guardada.');
      } catch (e) { mostrarError(err, e); }
    };
    agregar(main, [
      h('div', { class: 'cab' }, h('h2', null, 'Control de cupos')),
      !admin ? h('div', { class: 'aviso info' }, 'Solo un administrador puede cambiar esta configuración. Usted puede consultarla.') : null,
      h('section', { class: 'panel' }, h('h3', null, 'Cupos por día de la semana'),
        h('p', { class: 'sub' }, 'Cuántas citas de cada estudio se pueden agendar cada día. 0 = ese día no se agenda ese estudio. La hora habitual es la que aparece al asignar una cita (se puede cambiar en cada una).'),
        h('div', { class: 'tabla-scroll' }, tablaSemana), horasHabituales),
      h('section', { class: 'panel' }, h('h3', null, 'Formulario de solicitud'),
        h('p', { class: 'sub' }, 'El formulario de los hospitales está abierto siempre, salvo que lo desactive aquí (por ejemplo, en vacaciones del servicio).'),
        h('div', { class: 'fila-form' },
          h('label', { class: 'interruptor', style: 'flex:0 0 auto;min-height:42px' }, h('input', { type: 'checkbox', checked: b.formulario.activo, disabled: !admin, onchange: function (ev) { b.formulario.activo = ev.target.checked; } }), 'Recibir solicitudes'),
          h('div', { class: 'campo', style: 'flex:3 1 260px' }, h('label', { for: 'fo-msg' }, 'Mensaje cuando está desactivado'),
            h('input', { type: 'text', id: 'fo-msg', maxlength: 200, value: b.formulario.mensaje, disabled: !admin, placeholder: 'Ej. Se reanuda el lunes 5 de enero.', oninput: function (ev) { b.formulario.mensaje = ev.target.value; } })),
          admin ? h('div', { class: 'campo', style: 'flex:1 1 160px' }, h('label', { for: 'fo-cod' }, 'Código de acceso (opcional)'),
            h('input', { type: 'text', id: 'fo-cod', maxlength: 20, value: b.formulario.codigo, autocomplete: 'off', placeholder: 'Sin código', oninput: function (ev) { b.formulario.codigo = ev.target.value; } })) : null)),
      err,
      admin ? h('div', { style: 'margin:-4px 0 18px;display:flex;gap:10px;flex-wrap:wrap' },
        h('button', { class: 'btn primario', onclick: guardar }, 'Guardar cambios'),
        h('button', { class: 'btn', onclick: function () { S.cupos.borrador = null; pintar(); } }, 'Descartar')) : null,
      h('section', { class: 'panel' }, h('h3', null, 'Fechas sin cupos'),
        h('p', { class: 'sub' }, 'Días en que no se agendará un estudio (o ninguno), aunque normalmente tenga cupos: asuetos, congresos, equipo en reparación…'),
        admin ? h('form', { class: 'fila-form', onsubmit: async function (ev) {
          ev.preventDefault();
          if (!fecha.value) { tostada('Elija una fecha.', { error: true }); return; }
          try {
            const r = await api('sincupo.agregar', { fecha: fecha.value, estudio: estudio.value, motivo: motivo.value });
            const f = fecha.value;
            aplicarRespuesta(r, r.citas_afectadas ? null : 'Fecha sin cupos agregada.');
            if (r.citas_afectadas) {
              tostada('Atención: el ' + fechaSinAnio(f) + ' ya tenía ' + plural(r.citas_afectadas, 'cita', 'citas') + '. Reprográmelas.',
                { accion: { texto: 'Ver ese día', fn: function () { location.hash = '#/agenda/' + f; } } });
            }
          } catch (e) { tostada(e.message, { error: true }); }
        } },
          h('div', { class: 'campo' }, h('label', { for: 'sc-fecha' }, 'Fecha'), fecha),
          h('div', { class: 'campo' }, h('label', { for: 'sc-estudio' }, 'Estudio'), estudio),
          h('div', { class: 'campo', style: 'flex:2 1 220px' }, h('label', { for: 'sc-motivo' }, 'Motivo (opcional)'), motivo),
          h('button', { class: 'btn oscuro', type: 'submit' }, 'Quitar cupos ese día')) : null,
        futuras.length ? h('ul', { class: 'lista-simple', style: 'margin-top:10px' }, futuras.map(function (x) {
          return h('li', null, h('span', { class: 'crece' }, h('b', null, fechaLarga(x.fecha)), ' — ' + (x.estudio === 'TODOS' ? 'Todos los estudios' : x.estudio) + (x.motivo ? ' · ' + x.motivo : '')),
            admin ? h('button', { class: 'btn chico peligro', onclick: async function () {
              try { aplicarRespuesta(await api('sincupo.eliminar', { fecha: x.fecha, estudio: x.estudio }), 'Cupos restablecidos ese día.'); } catch (e) { tostada(e.message, { error: true }); }
            } }, 'Quitar') : null);
        })) : h('p', { style: 'color:#51606f;margin:10px 0 0' }, 'No hay fechas sin cupos programadas.'))
    ]);
  }

  /* ============================== estadísticas ============================== */
  function contar(filas, fn, orden) {
    const m = {};
    filas.forEach(function (f) { const k = fn(f) || 'Sin dato'; m[k] = (m[k] || 0) + 1; });
    let pares = Object.keys(m).map(function (k) { return [k, m[k]]; });
    if (orden) pares = orden.map(function (k) { return [k, m[k] || 0]; }).concat(pares.filter(function (p) { return orden.indexOf(p[0]) < 0; }).sort(function (a, b) { return b[1] - a[1]; }));
    else pares.sort(function (a, b) { return b[1] - a[1]; });
    return pares;
  }
  function grupoEdad(f) {
    if (f.edad === '') return 'Sin dato';
    const n = Number(f.edad);
    const g = GRUPOS_EDAD.filter(function (x) { return n >= x[1] && n <= x[2]; })[0];
    return g ? g[0] : 'Sin dato';
  }
  function especialidadBase(f) { return /^Otro/.test(f.especialidad) ? 'Otro' : f.especialidad; }
  function barras(pares, nombres) {
    const total = pares.reduce(function (s, p) { return s + p[1]; }, 0);
    const max = Math.max.apply(null, pares.map(function (p) { return p[1]; }).concat([1]));
    if (!total) return h('p', { style: 'color:#51606f;margin:0' }, 'Sin datos en este mes.');
    return h('div', { class: 'barras' }, pares.map(function (p) {
      const et = nombres ? nombres(p[0]) : p[0];
      return h('div', { class: 'barra-f' }, h('span', { class: 'et', title: p[0] }, et),
        h('span', { class: 'pista' }, p[1] ? h('span', { class: 'relleno', style: 'display:block;width:' + (p[1] / max * 100).toFixed(1) + '%' }) : null),
        h('span', { class: 'val' }, p[1], h('small', null, Math.round(p[1] / total * 100) + '%')));
    }));
  }
  function vistaEstadisticas(main) {
    const u = ui('stats', { mes: (S.hoy || new Date().toISOString().slice(0, 10)).slice(0, 7) });
    const cab = h('div', { class: 'cab' }, h('h2', null, 'Estadísticas de ' + MESES[Number(u.mes.slice(5)) - 1] + ' de ' + u.mes.slice(0, 4)),
      h('div', { class: 'campo no-imprimir', style: 'margin:0;flex:0 0 170px' }, h('label', { for: 'mes' }, 'Mes'),
        h('input', { type: 'month', id: 'mes', value: u.mes, max: (S.hoy || '').slice(0, 7), onchange: function (ev) { if (ev.target.value) { u.mes = ev.target.value; S.stats = null; pintar(); } } })),
      h('button', { class: 'btn no-imprimir', onclick: function () { window.print(); } }, 'Imprimir'));
    main.appendChild(cab);
    if (!S.stats || S.stats.mes !== u.mes) {
      main.appendChild(h('div', { class: 'vacio' }, 'Calculando…'));
      api('estadisticas', { mes: u.mes }).then(function (r) {
        S.stats = { mes: r.mes, filas: r.filas.map(function (arr) { const o = {}; r.columnas.forEach(function (c, i) { o[c] = arr[i]; }); return o; }) };
        if (ruta()[0] === 'estadisticas') pintar();
      }).catch(function (e) { if (ruta()[0] === 'estadisticas') { main.lastChild.textContent = e.message; } });
      return;
    }
    const mes = u.mes;
    const filas = S.stats.filas;
    const recibidas = filas.filter(function (f) { return f.fecha.slice(0, 7) === mes; });
    const realizados = filas.filter(function (f) { return f.estado === 'REALIZADO' && f.fecha_cierre.slice(0, 7) === mes; });
    const noReal = filas.filter(function (f) { return f.estado === 'NO REALIZADO' && f.fecha_cierre.slice(0, 7) === mes; });
    const pendientes = recibidas.filter(function (f) { return f.estado === 'PENDIENTE'; });
    const citasMes = filas.filter(function (f) { return f.cita_fecha.slice(0, 7) === mes; });
    // Para la inasistencia solo cuentan las citas que ya ocurrieron y tienen resultado.
    const citasCumplidas = citasMes.filter(function (f) { return f.cita_fecha <= S.hoy && (f.estado === 'REALIZADO' || f.motivo_no === NO_ACUDIO); });
    const noAcudio = citasCumplidas.filter(function (f) { return f.motivo_no === NO_ACUDIO; });
    const avisaron = citasMes.filter(function (f) { return f.motivo_no === NO_ACUDIRA; });
    const sobrecupos = citasMes.filter(function (f) { return f.sobrecupo === 'SI'; });
    const conEspera = citasMes.filter(function (f) { return f.cita_fecha && f.fecha && f.origen !== 'HISTÓRICO'; });
    const espera = function (lista) {
      if (!lista.length) return null;
      const d = lista.map(function (f) { return Math.max(0, diasEntre(f.fecha, f.cita_fecha)); }).sort(function (a, b) { return a - b; });
      return { n: d.length, prom: d.reduce(function (s, x) { return s + x; }, 0) / d.length, mediana: d[Math.floor((d.length - 1) / 2)], max: d[d.length - 1] };
    };
    const eTodas = espera(conEspera);
    const kpi = function (clase, v, t) { return h('div', { class: 'kpi ' + clase }, h('div', { class: 'v' }, v), h('div', { class: 't' }, t)); };
    const porMedico = contar(realizados, function (f) { return f.realizado_por; });
    const estudiosUsados = ESTUDIOS.concat(realizados.map(function (f) { return f.estudio; })).filter(function (e, i, a) { return a.indexOf(e) === i && realizados.some(function (f) { return f.estudio === e; }); });
    const cruce = h('table', { class: 'cruce' },
      h('thead', null, h('tr', null, h('th', null, 'Médico'), estudiosUsados.map(function (e) { return h('th', null, e); }), h('th', { class: 'tot' }, 'Total'))),
      h('tbody', null, porMedico.map(function (p) {
        return h('tr', null, h('td', null, p[0]), estudiosUsados.map(function (e) {
          return h('td', null, realizados.filter(function (f) { return f.realizado_por === p[0] && f.estudio === e; }).length || '·');
        }), h('td', { class: 'tot' }, p[1]));
      })),
      h('tfoot', null, h('tr', null, h('td', null, 'Total'), estudiosUsados.map(function (e) { return h('td', null, realizados.filter(function (f) { return f.estudio === e; }).length); }), h('td', null, realizados.length))));
    // Inasistencia por hospital
    const hosp = {};
    citasMes.forEach(function (f) {
      const x = hosp[f.hospital] = hosp[f.hospital] || { citas: 0, real: 0, no: 0, aviso: 0 };
      if (f.motivo_no === NO_ACUDIRA) x.aviso++;
      else if (f.cita_fecha <= S.hoy && (f.estado === 'REALIZADO' || f.motivo_no === NO_ACUDIO)) { x.citas++; if (f.motivo_no === NO_ACUDIO) x.no++; else x.real++; }
    });
    const filasHosp = Object.keys(hosp).filter(function (k) { return hosp[k].citas || hosp[k].aviso; }).sort(function (a, b) { return hosp[b].no - hosp[a].no || hosp[b].citas - hosp[a].citas; });
    const tablaInasistencia = h('table', { class: 'cruce' },
      h('thead', null, h('tr', null, h('th', null, 'Hospital'), h('th', null, 'Citas'), h('th', null, 'Realizados'), h('th', null, 'No acudió'), h('th', null, '% inasistencia'), h('th', null, 'Avisó que no vendría'))),
      h('tbody', null, filasHosp.map(function (k) {
        const x = hosp[k], pct = x.citas ? Math.round(x.no / x.citas * 100) : 0;
        return h('tr', null, h('td', null, hospCorto(k)), h('td', null, x.citas), h('td', null, x.real), h('td', null, x.no || '·'), h('td', { class: pct >= 25 ? 'rojo' : '' }, x.citas ? pct + '%' : '–'), h('td', null, x.aviso || '·'));
      })),
      h('tfoot', null, h('tr', null, h('td', null, 'Total'), h('td', null, citasCumplidas.length), h('td', null, citasCumplidas.length - noAcudio.length), h('td', null, noAcudio.length),
        h('td', null, citasCumplidas.length ? Math.round(noAcudio.length / citasCumplidas.length * 100) + '%' : '–'), h('td', null, avisaron.length))));
    const tablaEspera = h('table', { class: 'cruce' },
      h('thead', null, h('tr', null, h('th', null, 'Prioridad'), h('th', null, 'Citas'), h('th', null, 'Promedio'), h('th', null, 'Mediana'), h('th', null, 'Máximo'))),
      h('tbody', null, PRIORIDADES.map(function (p) {
        const e = espera(conEspera.filter(function (f) { return f.prioridad === p; }));
        return h('tr', null, h('td', null, p), h('td', null, e ? e.n : 0), h('td', null, e ? e.prom.toFixed(1) + ' d' : '–'), h('td', null, e ? e.mediana + ' d' : '–'), h('td', null, e ? e.max + ' d' : '–'));
      })));
    const panel = function (titulo, contenido, clase, sub) { return h('section', { class: 'panel ' + (clase || '') }, h('h3', null, titulo), sub ? h('p', { class: 'sub' }, sub) : null, contenido); };
    const R = 'Estudios realizados';
    agregar(main, [
      h('div', { class: 'kpis' }, kpi('a', realizados.length, 'Estudios realizados'), kpi('b', recibidas.length, 'Solicitudes recibidas'),
        kpi('c', noAcudio.length, 'Pacientes que no acudieron'), kpi('d', pendientes.length, 'Recibidas en el mes y aún pendientes'),
        kpi('b', eTodas ? eTodas.prom.toFixed(1) + ' d' : '–', 'Espera promedio de solicitud a cita')),
      h('div', { class: 'graficas' },
        panel('Estudios realizados por tipo', barras(contar(realizados, function (f) { return f.estudio; }, ESTUDIOS))),
        panel('Estudios realizados por médico', barras(porMedico)),
        realizados.length ? panel('Médico por tipo de estudio', h('div', { class: 'tabla-scroll' }, cruce), 'todo') : null,
        panel('Por grupo de edad', barras(contar(realizados, grupoEdad, GRUPOS_EDAD.map(function (g) { return g[0]; }))), '', R),
        panel('Por sexo', barras(contar(realizados, function (f) { return f.sexo; }, ['Femenino', 'Masculino'])), '', R),
        panel('Por hospital que solicita', barras(contar(realizados, function (f) { return f.hospital; }), hospCorto), '', R),
        panel('Por especialidad que solicita', barras(contar(realizados, especialidadBase, ESPECIALIDADES.filter(function (e) { return realizados.some(function (f) { return especialidadBase(f) === e; }); }))), '', R),
        panel('Por prioridad', barras(contar(realizados, function (f) { return f.prioridad; }, PRIORIDADES)), '', R),
        panel('Solicitudes cerradas sin realizar', barras(contar(noReal, function (f) { return f.motivo_no; }, S.motivos.filter(function (m) { return noReal.some(function (f) { return f.motivo_no === m; }); }))), '', 'Por motivo'),
        panel('Solicitudes recibidas por hospital', barras(contar(recibidas, function (f) { return f.hospital; }), hospCorto), '', 'Todas las recibidas en el mes, se hayan realizado o no'),
        panel('Solicitudes recibidas por estudio', barras(contar(recibidas, function (f) { return f.estudio; }, ESTUDIOS)), '', 'Todas las recibidas en el mes'),
        filasHosp.length ? panel('Inasistencia por hospital', h('div', { class: 'tabla-scroll' }, tablaInasistencia), 'todo',
          'Citas del mes que ya ocurrieron y tienen resultado. "Avisó que no vendría" son las canceladas con tiempo (liberaron el cupo).') : null,
        conEspera.length ? panel('Días de espera de solicitud a cita', h('div', { class: 'tabla-scroll' }, tablaEspera), '',
          'Citas del mes. ' + plural(sobrecupos.length, 'cita se dio', 'citas se dieron') + ' en sobrecupo.') : null),
      h('p', { style: 'color:#51606f;font-size:13px' }, 'Los estudios realizados se cuentan en el mes en que se marcaron como realizados; las solicitudes recibidas, en el mes en que se enviaron; las citas, en el mes de la cita. En los registros de la hoja anterior, la fecha de cierre es la fecha de la solicitud.')
    ]);
  }

  /* ============================== usuarios y médicos ============================== */
  function vistaAdmin(main) {
    if (!S.usuarios) {
      main.appendChild(h('div', { class: 'vacio' }, 'Cargando…'));
      api('usuarios.listar').then(function (r) { S.usuarios = r.usuarios; if (ruta()[0] === 'admin') pintar(); })
        .catch(function (e) { if (ruta()[0] === 'admin') { main.textContent = ''; main.appendChild(h('div', { class: 'aviso error' }, e.message)); } });
      return;
    }
    const guardarMedicos = async function (lista, mensaje) {
      try { const r = await api('medicos.guardar', { medicos: lista }); S.medicos = r.medicos; pintar(); tostada(mensaje); } catch (e) { tostada(e.message, { error: true }); }
    };
    const nuevoMedico = h('input', { type: 'text', id: 'nm', maxlength: 60, placeholder: 'Ej. Dra. Apellido' });
    const actualizar = async function (cambio, mensaje) {
      try { const r = await api('usuarios.actualizar', cambio); S.usuarios = r.usuarios; pintar(); tostada(mensaje); } catch (e) { tostada(e.message, { error: true }); pintar(); }
    };
    const nu = { usuario: h('input', { type: 'text', id: 'nu-u', autocapitalize: 'none', autocomplete: 'off', placeholder: 'ej. chernandez' }),
      nombre: h('input', { type: 'text', id: 'nu-n', autocomplete: 'off', placeholder: 'Nombre completo' }),
      rol: selector([['medico', 'Médico'], ['admin', 'Administrador']], 'medico', { id: 'nu-r' }),
      clave: h('input', { type: 'text', id: 'nu-c', autocomplete: 'off', placeholder: 'Mínimo 8 caracteres' }) };
    const errU = cajaError();
    agregar(main, [
      h('section', { class: 'panel' }, h('h3', null, 'Médicos que realizan estudios'),
        h('p', { class: 'sub' }, 'Esta lista aparece al asignar citas y al marcar quién realizó cada estudio. Si un médico ya no está, desactívelo: sus estudios anteriores se conservan.'),
        h('ul', { class: 'lista-simple' }, S.medicos.map(function (m, i) {
          return h('li', null, h('span', { class: 'crece' }, h('b', null, m.nombre), m.activo ? '' : ' (inactivo)'),
            h('button', { class: 'btn chico', onclick: function () {
              guardarMedicos(S.medicos.map(function (x, j) { return { nombre: x.nombre, activo: j === i ? !x.activo : x.activo }; }), m.activo ? 'Médico desactivado.' : 'Médico activado.');
            } }, m.activo ? 'Desactivar' : 'Activar'));
        })),
        h('form', { class: 'fila-form', style: 'margin-top:10px', onsubmit: function (ev) {
          ev.preventDefault();
          if (nuevoMedico.value.trim().length < 3) { tostada('Escriba el nombre del médico.', { error: true }); return; }
          guardarMedicos(S.medicos.concat([{ nombre: nuevoMedico.value, activo: true }]), 'Médico agregado.');
        } }, h('div', { class: 'campo' }, h('label', { for: 'nm' }, 'Agregar médico'), nuevoMedico), h('button', { class: 'btn oscuro', type: 'submit' }, 'Agregar'))),
      h('section', { class: 'panel' }, h('h3', null, 'Usuarios de la app de censos'),
        h('p', { class: 'sub' }, 'Cada persona debe tener su propio usuario. Los administradores pueden cambiar cupos, usuarios y médicos; los médicos ven los censos, agendan citas y marcan estudios.'),
        h('ul', { class: 'lista-simple' }, S.usuarios.map(function (x) {
          const propio = x.usuario === S.usuario.usuario;
          return h('li', null, h('span', { class: 'crece' }, h('b', null, x.nombre), ' · ' + x.usuario + (x.activo ? '' : ' (inactivo)') + (x.debe_cambiar ? ' · clave temporal' : '')),
            selector([['medico', 'Médico'], ['admin', 'Administrador']], x.rol, { style: 'width:auto', disabled: propio, 'aria-label': 'Rol de ' + x.usuario,
              onchange: function (ev) { actualizar({ usuario: x.usuario, rol: ev.target.value }, 'Rol actualizado.'); } }),
            h('button', { class: 'btn chico', onclick: function () { restablecer(x); } }, 'Nueva contraseña'),
            propio ? null : h('button', { class: 'btn chico' + (x.activo ? ' peligro' : ''), onclick: function () { actualizar({ usuario: x.usuario, activo: !x.activo }, x.activo ? 'Usuario desactivado.' : 'Usuario activado.'); } }, x.activo ? 'Desactivar' : 'Activar'));
        })),
        h('h3', { style: 'margin-top:18px' }, 'Crear usuario'),
        h('form', { class: 'fila-form', onsubmit: async function (ev) {
          ev.preventDefault();
          errU.textContent = '';
          try {
            const r = await api('usuarios.crear', { usuario: nu.usuario.value, nombre: nu.nombre.value, rol: nu.rol.value, clave: nu.clave.value });
            S.usuarios = r.usuarios;
            pintar();
            tostada('Usuario creado. Entréguele su contraseña temporal en persona.');
          } catch (e) { mostrarError(errU, e); }
        } },
          h('div', { class: 'campo' }, h('label', { for: 'nu-u' }, 'Usuario'), nu.usuario),
          h('div', { class: 'campo' }, h('label', { for: 'nu-n' }, 'Nombre'), nu.nombre),
          h('div', { class: 'campo' }, h('label', { for: 'nu-r' }, 'Rol'), nu.rol),
          h('div', { class: 'campo' }, h('label', { for: 'nu-c' }, 'Contraseña temporal'), nu.clave),
          h('button', { class: 'btn oscuro', type: 'submit' }, 'Crear usuario')),
        errU),
      panelPlantillas(),
      panelReportes()
    ]);
  }
  /* ---------- plantillas de comentario ---------- */
  function panelPlantillas() {
    const guardar = async function (lista, mensaje) {
      const r = await api('plantillas.guardar', { plantillas: lista });
      S.plantillas = r.plantillas;
      pintar();
      tostada(mensaje);
    };
    const editar = function (i) {
      const p = i >= 0 ? S.plantillas[i] : { nombre: '', estudio: '', texto: '' };
      modalChico(i >= 0 ? 'Editar plantilla' : 'Nueva plantilla', function (cerrar) {
        const err = cajaError();
        const nombre = h('input', { type: 'text', id: 'pl-n', maxlength: '60', value: p.nombre, 'data-foco': true, placeholder: 'Ej. Ecocardiograma normal' });
        const estudio = selector([['', 'Todos los estudios']].concat(ESTUDIOS.map(function (e) { return [e, e]; })), p.estudio, { id: 'pl-e' });
        const texto = h('textarea', { id: 'pl-t', rows: '9', maxlength: '5000' });
        texto.value = p.texto;
        const btn = h('button', { class: 'btn primario ancho', type: 'submit' }, 'Guardar plantilla');
        return h('form', { onsubmit: async function (ev) {
          ev.preventDefault();
          const lista = S.plantillas.slice();
          const nueva = { nombre: nombre.value, estudio: estudio.value, texto: texto.value };
          if (i >= 0) lista[i] = nueva; else lista.push(nueva);
          try { await conBoton(btn, function () { return guardar(lista, i >= 0 ? 'Plantilla actualizada.' : 'Plantilla agregada.'); }); cerrar(); } catch (e) { mostrarError(err, e); }
        } },
        h('div', { class: 'campo' }, h('label', { for: 'pl-n' }, 'Nombre'), nombre),
        h('div', { class: 'campo' }, h('label', { for: 'pl-e' }, 'Aparece en'), estudio),
        h('div', { class: 'campo' }, h('label', { for: 'pl-t' }, 'Texto'), texto), err, btn);
      });
    };
    return h('section', { class: 'panel' }, h('h3', null, 'Plantillas de comentario'),
      h('p', { class: 'sub' }, 'Textos prehechos que se pueden insertar en el comentario de cada solicitud. Si elige un estudio, la plantilla solo aparece en las solicitudes de ese estudio.'),
      S.plantillas.length ? h('ul', { class: 'lista-simple' }, S.plantillas.map(function (p, i) {
        return h('li', null, h('span', { class: 'crece' }, h('b', null, p.nombre), ' · ' + (p.estudio || 'Todos los estudios'), h('div', { class: 'tenue recorte' }, p.texto)),
          h('button', { class: 'btn chico', onclick: function () { editar(i); } }, 'Editar'),
          h('button', { class: 'btn chico peligro', onclick: async function () {
            if (!(await preguntar('¿Eliminar la plantilla?', '"' + p.nombre + '" dejará de aparecer. Los comentarios ya guardados no cambian.', 'Sí, eliminar', 'Cancelar', 'peligro'))) return;
            try { await guardar(S.plantillas.filter(function (x, j) { return j !== i; }), 'Plantilla eliminada.'); } catch (e) { tostada(e.message, { error: true }); }
          } }, 'Eliminar'));
      })) : h('p', { class: 'tenue', style: 'margin:0' }, 'Aún no hay plantillas.'),
      h('button', { class: 'btn oscuro', style: 'margin-top:12px', onclick: function () { editar(-1); } }, 'Nueva plantilla'));
  }

  /* ---------- censo automático de reportes ---------- */
  function panelReportes() {
    const titulo = h('h3', null, 'Censo automático de reportes de ecocardiograma');
    const e = S.estadoReportes;
    if (!e || e.cargando) {
      if (!e) {
        S.estadoReportes = { cargando: true };
        api('reportes.estado').then(function (r) { S.estadoReportes = r; }).catch(function (x) { S.estadoReportes = { error: x.message }; })
          .then(function () { if (ruta()[0] === 'admin' && !modalesAbiertos()) pintar(); });
      }
      return h('section', { class: 'panel' }, titulo, h('div', { class: 'vacio' }, 'Cargando…'));
    }
    if (e.error) return h('section', { class: 'panel' }, titulo, h('div', { class: 'aviso error' }, e.error));
    const ejecutar = async function (btn, completo) {
      if (completo && !(await preguntar('¿Revisar toda la carpeta?', 'Se revisan todos los PDF de la carpeta de reportes, no solo los nuevos. Los que ya están en el censo no se duplican. Puede tardar unos minutos.', 'Sí, revisar todo', 'Cancelar'))) return;
      try {
        const r = await conBoton(btn, function () { return api('reportes.ejecutar', { completo: !!completo }); });
        S.estadoReportes = r;
        const x = r.resultado;
        tostada(plural(x.nuevos, 'reporte nuevo', 'reportes nuevos') + ' en el censo · ' + plural(x.automaticos, 'vinculado', 'vinculados') + ' · ' + x.revisar + ' por revisar');
        await sincronizar(true);
      } catch (err) { tostada(err.message, { error: true }); }
      pintar();
    };
    return h('section', { class: 'panel' }, titulo,
      h('p', { class: 'sub' }, 'Cada hora, de ' + e.horario + ', los PDF nuevos de la carpeta del ecógrafo se agregan a la pestaña "Reportes" de la hoja. Quince minutos después se buscan los reportes de las solicitudes de ecocardiograma sin reporte: si coinciden expediente, nombre y fecha de nacimiento se vinculan solos; si coinciden dos datos (siempre el nombre), quedan "por revisar".'),
      !e.drive_api ? h('div', { class: 'aviso error' }, 'Falta activar el servicio "Drive API" en el editor de Apps Script. Vea la guía de instalación, sección 12.') : null,
      e.drive_api && !e.activo ? h('div', { class: 'aviso alerta' }, 'La revisión automática no está activada. En el editor de Apps Script ejecute una vez la función "activarReportes" (guía de instalación, sección 12).') : null,
      h('dl', { class: 'datos' }, dato('Revisión automática', e.activo ? 'Activa' : 'Inactiva'), dato('Solicitudes desde', fechaCorta(e.desde)),
        dato('Último censo', e.ultimo_censo), dato('Última vinculación', e.ultima_vinculacion),
        dato('Reportes en el censo', String(e.censados)), dato('Vinculados', String(e.vinculados)), dato('Por revisar', String(e.por_revisar))),
      h('div', { class: 'acciones-rep', style: 'margin-top:14px' },
        h('button', { class: 'btn oscuro', disabled: !e.drive_api, onclick: function (ev) { ejecutar(ev.currentTarget, false); } }, 'Censar y vincular ahora'),
        h('button', { class: 'btn', disabled: !e.drive_api, onclick: function (ev) { ejecutar(ev.currentTarget, true); } }, 'Revisar toda la carpeta'),
        h('a', { class: 'btn', href: 'https://drive.google.com/drive/folders/' + e.carpeta, target: '_blank', rel: 'noopener' }, 'Abrir la carpeta de reportes')));
  }
  function restablecer(x) {
    modalChico('Nueva contraseña para ' + x.usuario, function (cerrar) {
      const err = cajaError();
      const clave = h('input', { type: 'text', id: 'rs-c', autocomplete: 'off', 'data-foco': true });
      return h('form', { onsubmit: async function (ev) {
        ev.preventDefault();
        try { const r = await api('usuarios.restablecer', { usuario: x.usuario, clave: clave.value }); S.usuarios = r.usuarios; cerrar(); pintar(); tostada('Contraseña temporal asignada.'); } catch (e) { mostrarError(err, e); }
      } }, h('p', { style: 'margin-top:0' }, 'Se le pedirá cambiarla la próxima vez que ingrese.'),
        h('div', { class: 'campo' }, h('label', { for: 'rs-c' }, 'Contraseña temporal (mínimo 8 caracteres)'), clave), err,
        h('button', { class: 'btn primario ancho', type: 'submit' }, 'Asignar'));
    });
  }

  /* ============================== arranque ============================== */
  window.addEventListener('hashchange', function () {
    if (ruta()[0] !== 'cupos') S.cupos = null;
    if (ruta()[0] !== 'admin') S.usuarios = S.estadoReportes = null;
    S.panel = null;
    window.scrollTo(0, 0);
    pintar();
    window.scrollTo(0, 0);
  });
  document.addEventListener('visibilitychange', function () { if (!document.hidden && S.token && S.sincronizado) sincronizar(true); });
  setInterval(function () { if (!document.hidden && S.token && S.sincronizado && !modalesAbiertos()) sincronizar(true); }, 120000);

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () { /* sin modo offline */ }); });
  }

  S.token = leerToken();
  if (S.token) { $app.textContent = ''; $app.appendChild(h('p', { class: 'cargando-inicial' }, 'Cargando…')); iniciar(); } else pintarAcceso();
})();
