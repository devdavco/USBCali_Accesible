/*
 * EDITOR DEL GRAFO DEL CAMPUS
 * Crear puntos y tramos sobre el plano de la universidad y guardarlos en
 * js/datos.js con el mismo formato que usa la demo.
 */

const CONDICIONES = {
  plano:     { nombre: 'Plano',            color: '#16a34a' },
  rampa:     { nombre: 'Rampa',            color: '#2563eb' },
  pendiente: { nombre: 'Pendiente fuerte', color: '#ea580c' },
  escaleras: { nombre: 'Escaleras',        color: '#dc2626' }
};
const CLAVE_BORRADOR = 'editorCampus.borrador';
const CLAVE_PLANO_FIJO = 'editorCampus.planoFijo';
const MAXIMO_DESHACER = 100;

const el = function (id) { return document.getElementById(id); };

/* ------------------------------------------------------------------ */
/* Estado                                                              */
/* ------------------------------------------------------------------ */

// Posición aproximada del plano sobre el campus (alrededor de los puntos
// existentes), con la proporción de la imagen. Se ajusta calibrando.
function planoInicial() {
  return {
    imagen: 'plano_campus.png',
    opacidad: 0.7,
    esquinas: [
      [-76.546958, 3.348171], // superior izquierda
      [-76.5394, 3.348171],   // superior derecha
      [-76.5394, 3.34245],    // inferior derecha
      [-76.546958, 3.34245]   // inferior izquierda
    ]
  };
}

function datosDelArchivo() {
  if (typeof DATOS_CAMPUS === 'undefined') return { puntos: [], tramos: [], plano: planoInicial() };
  const datos = normalizarDatos({
    puntos: DATOS_CAMPUS.puntos || [],
    tramos: DATOS_CAMPUS.tramos || [],
    plano: DATOS_CAMPUS.plano || null
  });
  if (!datos.plano) datos.plano = planoInicial();
  return datos;
}

function huella(datos) { return JSON.stringify(normalizarDatos(datos)); }

const datosArchivo = datosDelArchivo();
let ultimoGuardado = huella(datosArchivo); // lo que hay en js/datos.js
let estado = datosArchivo;                 // { puntos, tramos, plano }
let seleccion = null;                      // { tipo: 'punto', id } | { tipo: 'tramo', indice }
let modo = 'puntos';                       // 'puntos' | 'tramo'
let tramoInicio = null;                    // id del primer punto al crear un tramo
let historial = [];                        // copias del estado para deshacer
let planoFijo = leerLocal(CLAVE_PLANO_FIJO, typeof DATOS_CAMPUS !== 'undefined' && Boolean(DATOS_CAMPUS.plano));
let imagenPlano = typeof PLANO_IMAGEN !== 'undefined' ? PLANO_IMAGEN : null;
let ultimoTipo = 'cruce';
let ultimaCondicion = 'plano';

// Recuperar el trabajo sin guardar (si se recargó la página)
const borrador = leerLocal(CLAVE_BORRADOR, null);
if (borrador && borrador.datos && huella(borrador.datos) !== ultimoGuardado) {
  estado = normalizarDatos(borrador.datos);
  el('aviso-borrador-texto').textContent = 'Se recuperó el trabajo sin guardar (' +
    new Date(borrador.fecha).toLocaleString('es-CO') + '). Recuerde pulsar «Guardar».';
  el('aviso-borrador').hidden = false;
}

function leerLocal(clave, porDefecto) {
  try {
    const valor = localStorage.getItem(clave);
    return valor === null ? porDefecto : JSON.parse(valor);
  } catch (e) { return porDefecto; }
}
function escribirLocal(clave, valor) {
  try { localStorage.setItem(clave, JSON.stringify(valor)); } catch (e) { /* sin almacenamiento */ }
}

function puntoPorId(id) { return estado.puntos.find(function (p) { return p.id === id; }); }

/** Guarda una copia del estado antes de cada cambio, para poder deshacerlo. */
function registrarCambio() {
  historial.push(JSON.stringify(estado));
  if (historial.length > MAXIMO_DESHACER) historial.shift();
}

function deshacer() {
  if (!historial.length) return;
  estado = JSON.parse(historial.pop());
  seleccion = null;
  tramoInicio = null;
  actualizar();
  mostrarMensaje('Se deshizo la última acción.');
}

/* ------------------------------------------------------------------ */
/* Mapa                                                                */
/* ------------------------------------------------------------------ */

const mapa = new maplibregl.Map({
  container: 'mapa',
  style: 'https://tiles.openfreemap.org/styles/liberty',
  center: [-76.543861, 3.345040], // [lng, lat]
  zoom: 17
});
mapa.addControl(new maplibregl.NavigationControl(), 'top-right');
let mapaListo = false;
let ajustarLimites = function () {};

mapa.on('load', function () {
  const vacia = { type: 'FeatureCollection', features: [] };

  // Tramos: color según la condición; las escaleras, en línea discontinua.
  mapa.addSource('tramos', { type: 'geojson', data: vacia });
  mapa.addLayer({
    id: 'tramos-seleccion', type: 'line', source: 'tramos',
    filter: ['get', 'seleccionado'],
    layout: { 'line-cap': 'round' },
    paint: { 'line-color': '#f59e0b', 'line-width': 14, 'line-opacity': 0.6 }
  });
  const colorCondicion = ['match', ['get', 'condicion'],
    'plano', CONDICIONES.plano.color,
    'rampa', CONDICIONES.rampa.color,
    'pendiente', CONDICIONES.pendiente.color,
    CONDICIONES.escaleras.color];
  mapa.addLayer({
    id: 'tramos', type: 'line', source: 'tramos',
    filter: ['!=', ['get', 'condicion'], 'escaleras'],
    layout: { 'line-cap': 'round' },
    paint: { 'line-color': colorCondicion, 'line-width': 5 }
  });
  mapa.addLayer({
    id: 'tramos-escaleras', type: 'line', source: 'tramos',
    filter: ['==', ['get', 'condicion'], 'escaleras'],
    paint: { 'line-color': CONDICIONES.escaleras.color, 'line-width': 5, 'line-dasharray': [1.5, 1] }
  });
  mapa.addLayer({
    id: 'tramos-metros', type: 'symbol', source: 'tramos',
    minzoom: 17,
    layout: {
      'symbol-placement': 'line-center',
      'text-field': ['get', 'texto'],
      'text-font': ['Noto Sans Regular'],
      'text-size': 11,
      'text-offset': [0, -0.9]
    },
    paint: { 'text-color': '#0f172a', 'text-halo-color': '#ffffff', 'text-halo-width': 2 }
  });
  // Capa invisible y ancha para que sea fácil hacer clic sobre un tramo.
  mapa.addLayer({
    id: 'tramos-clic', type: 'line', source: 'tramos',
    paint: { 'line-color': '#000', 'line-width': 14, 'line-opacity': 0 }
  });

  // Línea guía mientras se elige el segundo punto de un tramo.
  mapa.addSource('guia', { type: 'geojson', data: vacia });
  mapa.addLayer({
    id: 'guia', type: 'line', source: 'guia',
    paint: { 'line-color': '#f59e0b', 'line-width': 3, 'line-dasharray': [2, 2] }
  }, 'tramos-seleccion');

  if (imagenPlano) {
    agregarPlano(mapa, estado.plano, imagenPlano, 'guia').catch(function (e) { mostrarMensaje(e.message, 'error'); });
  }

  mapa.on('mouseenter', 'tramos-clic', function () { mapa.getCanvas().style.cursor = 'pointer'; });
  mapa.on('mouseleave', 'tramos-clic', function () { mapa.getCanvas().style.cursor = cursorDelModo(); });

  const limites = new maplibregl.LngLatBounds();
  if (estado.puntos.length) estado.puntos.forEach(function (p) { limites.extend([p.lng, p.lat]); });
  else estado.plano.esquinas.forEach(function (c) { limites.extend(c); });
  mapa.fitBounds(limites, { padding: 80, duration: 0, maxZoom: 18 });

  // Mismos límites que la demo; se recalculan al mover el plano o los puntos.
  ajustarLimites = limitarMapaAlCampus(mapa, function () { return areaDelCampus(estado.plano, estado.puntos); });

  mapaListo = true;
  actualizar();
});

function cursorDelModo() { return modo === 'puntos' ? 'crosshair' : ''; }

mapa.on('click', function (e) {
  // Los clics sobre marcadores (puntos o esquinas) se manejan aparte.
  if (e.originalEvent.target.closest && e.originalEvent.target.closest('.maplibregl-marker')) return;

  const caja = [[e.point.x - 6, e.point.y - 6], [e.point.x + 6, e.point.y + 6]];
  const tramo = mapa.queryRenderedFeatures(caja, { layers: ['tramos-clic'] })[0];
  if (tramo) {
    tramoInicio = null;
    seleccion = { tipo: 'tramo', indice: tramo.id };
    actualizar();
    return;
  }
  if (modo === 'tramo') {
    tramoInicio = null;
    seleccion = null;
    actualizar();
    return;
  }
  pedirNuevoPunto(e.lngLat);
});

mapa.on('mousemove', function (e) {
  if (!mapaListo || tramoInicio === null) return;
  const inicio = puntoPorId(tramoInicio);
  mapa.getSource('guia').setData({
    type: 'FeatureCollection',
    features: inicio ? [{
      type: 'Feature', properties: {},
      geometry: { type: 'LineString', coordinates: [[inicio.lng, inicio.lat], [e.lngLat.lng, e.lngLat.lat]] }
    }] : []
  });
});

/* ------------------------------------------------------------------ */
/* Puntos: marcadores arrastrables con su nombre                       */
/* ------------------------------------------------------------------ */

const marcadores = new Map(); // id → { marker, elemento, etiqueta }

function crearMarcador(id) {
  const elemento = document.createElement('div');
  elemento.className = 'marcador';
  const etiqueta = document.createElement('span');
  etiqueta.className = 'etiqueta';
  elemento.appendChild(etiqueta);

  const marker = new maplibregl.Marker({ element: elemento, draggable: true });
  elemento.addEventListener('click', function (e) {
    e.stopPropagation();
    alTocarPunto(id);
  });
  marker.on('dragstart', function () { registrarCambio(); });
  marker.on('drag', function () {
    moverPunto(id, marker.getLngLat());
    dibujarTramos();
  });
  marker.on('dragend', function () {
    moverPunto(id, marker.getLngLat());
    seleccion = { tipo: 'punto', id: id };
    actualizar();
  });

  const datos = { marker: marker, elemento: elemento, etiqueta: etiqueta };
  marcadores.set(id, datos);
  return datos;
}

/** Cambia la posición de un punto y recalcula los metros de sus tramos. */
function moverPunto(id, lngLat) {
  const punto = puntoPorId(id);
  punto.lat = redondearCoordenada(lngLat.lat);
  punto.lng = redondearCoordenada(lngLat.lng);
  estado.tramos.forEach(function (t) {
    if (t.desde === id || t.hasta === id) {
      t.metros = distanciaMetros(puntoPorId(t.desde), puntoPorId(t.hasta));
    }
  });
}

function dibujarPuntos() {
  const vigentes = new Set(estado.puntos.map(function (p) { return p.id; }));
  marcadores.forEach(function (m, id) {
    if (!vigentes.has(id)) { m.marker.remove(); marcadores.delete(id); }
  });
  estado.puntos.forEach(function (p) {
    const nuevo = !marcadores.has(p.id);
    const m = nuevo ? crearMarcador(p.id) : marcadores.get(p.id);
    m.marker.setLngLat([p.lng, p.lat]).setDraggable(modo === 'puntos');
    if (nuevo) m.marker.addTo(mapa);
    m.elemento.classList.toggle('destino', p.tipo === 'destino');
    m.elemento.classList.toggle('seleccionado', esPuntoSeleccionado(p.id));
    m.elemento.classList.toggle('inicio-tramo', tramoInicio === p.id);
    m.elemento.title = p.nombre;
    m.etiqueta.textContent = p.nombre;
  });
}

function esPuntoSeleccionado(id) { return Boolean(seleccion) && seleccion.tipo === 'punto' && seleccion.id === id; }
function esTramoSeleccionado(i) { return Boolean(seleccion) && seleccion.tipo === 'tramo' && seleccion.indice === i; }

function alTocarPunto(id) {
  if (modo === 'tramo') {
    if (tramoInicio === null) {
      tramoInicio = id;
      seleccion = { tipo: 'punto', id: id };
    } else if (tramoInicio === id) {
      tramoInicio = null; // clic otra vez en el mismo punto: se cancela
    } else {
      pedirNuevoTramo(tramoInicio, id);
      return;
    }
  } else {
    seleccion = { tipo: 'punto', id: id };
  }
  actualizar();
}

/* ---------- Crear un punto ---------- */

let coordenadaNueva = null;

function pedirNuevoPunto(lngLat) {
  coordenadaNueva = lngLat;
  const dialogo = el('dialogo-punto');
  el('punto-nombre').value = '';
  dialogo.querySelector('input[value="' + ultimoTipo + '"]').checked = true;
  dialogo.returnValue = '';
  dialogo.showModal();
  el('punto-nombre').focus();
}

el('dialogo-punto').addEventListener('close', function () {
  if (this.returnValue !== 'ok') return;
  const nombre = el('punto-nombre').value.trim();
  if (!nombre) return;
  ultimoTipo = this.querySelector('input[name="punto-tipo"]:checked').value;

  registrarCambio();
  const id = estado.puntos.reduce(function (max, p) { return Math.max(max, p.id); }, 0) + 1;
  estado.puntos.push({
    id: id,
    nombre: nombre,
    tipo: ultimoTipo,
    lat: redondearCoordenada(coordenadaNueva.lat),
    lng: redondearCoordenada(coordenadaNueva.lng)
  });
  seleccion = { tipo: 'punto', id: id };
  actualizar();
  mostrarMensaje('Punto «' + nombre + '» creado.', 'ok');
});

/* ---------- Crear un tramo ---------- */

let tramoNuevo = null;

function existeTramo(a, b) {
  return estado.tramos.some(function (t) {
    return (t.desde === a && t.hasta === b) || (t.desde === b && t.hasta === a);
  });
}

function pedirNuevoTramo(desde, hasta) {
  const a = puntoPorId(desde);
  const b = puntoPorId(hasta);
  tramoNuevo = { desde: desde, hasta: hasta };
  el('tramo-descripcion').textContent = a.nombre + ' ↔ ' + b.nombre + ' · ' + formatearCosto(distanciaMetros(a, b));
  el('tramo-repetido').hidden = !existeTramo(desde, hasta);
  const dialogo = el('dialogo-tramo');
  dialogo.querySelector('input[value="' + ultimaCondicion + '"]').checked = true;
  dialogo.returnValue = '';
  dialogo.showModal();
}

el('dialogo-tramo').addEventListener('close', function () {
  tramoInicio = null;
  if (this.returnValue === 'ok') {
    ultimaCondicion = this.querySelector('input[name="tramo-condicion"]:checked').value;
    registrarCambio();
    estado.tramos.push({
      desde: tramoNuevo.desde,
      hasta: tramoNuevo.hasta,
      metros: distanciaMetros(puntoPorId(tramoNuevo.desde), puntoPorId(tramoNuevo.hasta)),
      condicion: ultimaCondicion
    });
    seleccion = { tipo: 'tramo', indice: estado.tramos.length - 1 };
    mostrarMensaje('Tramo creado. Elija otro punto para crear el siguiente.', 'ok');
  }
  actualizar();
});

/* ---------- Eliminar ---------- */

function eliminarPunto(id) {
  registrarCambio();
  const antes = estado.tramos.length;
  estado.puntos = estado.puntos.filter(function (p) { return p.id !== id; });
  estado.tramos = estado.tramos.filter(function (t) { return t.desde !== id && t.hasta !== id; });
  seleccion = null;
  actualizar();
  const borrados = antes - estado.tramos.length;
  mostrarMensaje('Punto eliminado' + (borrados ? ' junto con ' + borrados + (borrados === 1 ? ' tramo.' : ' tramos.') : '.'));
}

function eliminarTramo(indice) {
  registrarCambio();
  estado.tramos.splice(indice, 1);
  seleccion = null;
  actualizar();
  mostrarMensaje('Tramo eliminado.');
}

/* ------------------------------------------------------------------ */
/* Tramos sobre el mapa                                                */
/* ------------------------------------------------------------------ */

function dibujarTramos() {
  if (!mapaListo) return;
  const features = [];
  estado.tramos.forEach(function (t, i) {
    const a = puntoPorId(t.desde);
    const b = puntoPorId(t.hasta);
    if (!a || !b) return;
    features.push({
      type: 'Feature',
      id: i,
      properties: { condicion: t.condicion, seleccionado: esTramoSeleccionado(i), texto: formatearCosto(t.metros) },
      geometry: { type: 'LineString', coordinates: [[a.lng, a.lat], [b.lng, b.lat]] }
    });
  });
  mapa.getSource('tramos').setData({ type: 'FeatureCollection', features: features });
}

/* ------------------------------------------------------------------ */
/* Plano: transparencia y calibración con las cuatro esquinas          */
/* ------------------------------------------------------------------ */

const asas = estado.plano.esquinas.map(function (_, i) {
  const elemento = document.createElement('div');
  elemento.className = 'esquina';
  elemento.title = ['Superior izquierda', 'Superior derecha', 'Inferior derecha', 'Inferior izquierda'][i];
  const marker = new maplibregl.Marker({ element: elemento, draggable: true });
  marker.on('dragstart', registrarCambio);
  marker.on('drag', function () {
    const p = marker.getLngLat();
    estado.plano.esquinas[i] = [redondearCoordenada(p.lng), redondearCoordenada(p.lat)];
    dibujarPlano();
  });
  marker.on('dragend', actualizar);
  return marker;
});

// Asa central: mueve el plano completo sin deformarlo.
let asasVisibles = false;
let arrastrandoCentro = false;
const asaCentro = (function () {
  const elemento = document.createElement('div');
  elemento.className = 'centro-plano';
  elemento.textContent = '✥';
  elemento.title = 'Mover el plano completo';
  const marker = new maplibregl.Marker({ element: elemento, draggable: true });
  let inicio = null;
  marker.on('dragstart', function () {
    registrarCambio();
    arrastrandoCentro = true;
    inicio = { centro: marker.getLngLat(), esquinas: estado.plano.esquinas.map(function (c) { return c.slice(); }) };
  });
  marker.on('drag', function () {
    const p = marker.getLngLat();
    const dLng = p.lng - inicio.centro.lng;
    const dLat = p.lat - inicio.centro.lat;
    estado.plano.esquinas = inicio.esquinas.map(function (c) {
      return [redondearCoordenada(c[0] + dLng), redondearCoordenada(c[1] + dLat)];
    });
    dibujarPlano();
  });
  marker.on('dragend', function () {
    arrastrandoCentro = false;
    actualizar();
  });
  return marker;
})();

function centroPlano() {
  const e = estado.plano.esquinas;
  return [(e[0][0] + e[1][0] + e[2][0] + e[3][0]) / 4, (e[0][1] + e[1][1] + e[2][1] + e[3][1]) / 4];
}

function dibujarPlano() {
  const editable = Boolean(imagenPlano) && !planoFijo && mapaListo;
  if (editable) {
    asas.forEach(function (marker, i) { marker.setLngLat(estado.plano.esquinas[i]); });
    if (!arrastrandoCentro) asaCentro.setLngLat(centroPlano());
    if (!asasVisibles) {
      asas.forEach(function (marker) { marker.addTo(mapa); });
      asaCentro.addTo(mapa);
    }
  } else if (asasVisibles) {
    asas.forEach(function (marker) { marker.remove(); });
    asaCentro.remove();
  }
  asasVisibles = editable;

  if (mapaListo && mapa.getSource('plano')) {
    mapa.getSource('plano').setCoordinates(estado.plano.esquinas);
    mapa.setPaintProperty('plano', 'raster-opacity', estado.plano.opacidad);
  }

  el('opacidad').value = estado.plano.opacidad;
  el('opacidad').disabled = !imagenPlano;
  el('sin-imagen').hidden = Boolean(imagenPlano);
  el('fijar-plano').disabled = !imagenPlano;
  el('fijar-plano').textContent = planoFijo ? '🔒 Calibración fijada — desbloquear' : 'Fijar calibración';
  el('ayuda-plano').textContent = planoFijo
    ? 'El plano no se puede mover. Desbloquéelo para volver a calibrarlo.'
    : 'Arrastre los cuadros de las esquinas hasta que el plano coincida con las calles y edificios reales; el círculo central mueve todo el plano. Luego pulse «Fijar calibración».';
}

el('opacidad').addEventListener('input', function () {
  estado.plano.opacidad = Math.round(Number(this.value) * 100) / 100;
  dibujarPlano();
});
el('opacidad').addEventListener('change', function () { actualizar(); });

el('fijar-plano').addEventListener('click', function () {
  planoFijo = !planoFijo;
  escribirLocal(CLAVE_PLANO_FIJO, planoFijo);
  dibujarPlano();
});

el('imagen-plano').addEventListener('change', function () {
  const archivo = this.files[0];
  this.value = '';
  if (!archivo) return;
  const lector = new FileReader();
  lector.onload = function () {
    const nueva = lector.result;
    const aplicar = mapa.getSource('plano')
      ? prepararImagenPlano(nueva).then(function (url) { mapa.getSource('plano').updateImage({ url: url, coordinates: estado.plano.esquinas }); })
      : agregarPlano(mapa, estado.plano, nueva, 'guia');
    aplicar.then(function () {
      imagenPlano = nueva;
      registrarCambio();
      estado.plano.imagen = archivo.name;
      planoFijo = false;
      escribirLocal(CLAVE_PLANO_FIJO, false);
      actualizar();
      const texto = '// Imagen del plano del campus (' + archivo.name + ') incrustada para que funcione sin servidor.\n' +
        '// Se regenera desde el editor con el botón "Cambiar imagen del plano".\n' +
        'const PLANO_IMAGEN = \'' + nueva + '\';\n';
      return escribirArchivo('imagen', 'plano_imagen.js', texto, 'js/plano_imagen.js');
    }).then(function (escrito) {
      if (escrito) mostrarMensaje('Imagen cambiada. Calibre el plano y pulse «Guardar».', 'ok');
    }).catch(function (e) { mostrarMensaje(e.message, 'error'); });
  };
  lector.readAsDataURL(archivo);
});

/* ------------------------------------------------------------------ */
/* Panel: selección, avisos y listas                                   */
/* ------------------------------------------------------------------ */

function crear(etiqueta, clase, texto) {
  const nodo = document.createElement(etiqueta);
  if (clase) nodo.className = clase;
  if (texto !== undefined) nodo.textContent = texto;
  return nodo;
}

function campoSelect(titulo, opciones, valor, alCambiar) {
  const label = crear('label', 'campo', titulo);
  const select = crear('select');
  Object.keys(opciones).forEach(function (clave) {
    const opcion = crear('option', null, opciones[clave]);
    opcion.value = clave;
    select.appendChild(opcion);
  });
  select.value = valor;
  select.addEventListener('change', function () { alCambiar(select.value); });
  label.appendChild(select);
  return label;
}

function dato(titulo, valor) {
  const p = crear('p', 'dato', titulo + ': ');
  p.appendChild(crear('strong', null, valor));
  return p;
}

function dibujarSeleccion() {
  const caja = el('seleccion');
  caja.innerHTML = '';

  if (seleccion && seleccion.tipo === 'punto' && puntoPorId(seleccion.id)) {
    const p = puntoPorId(seleccion.id);

    const campoNombre = crear('label', 'campo', 'Nombre');
    const entrada = crear('input');
    entrada.value = p.nombre;
    entrada.addEventListener('change', function () {
      const nombre = entrada.value.trim();
      if (!nombre || nombre === p.nombre) { entrada.value = p.nombre; return; }
      registrarCambio();
      puntoPorId(p.id).nombre = nombre;
      actualizar();
    });
    entrada.addEventListener('keydown', function (e) { if (e.key === 'Enter') entrada.blur(); });
    campoNombre.appendChild(entrada);
    caja.appendChild(campoNombre);

    caja.appendChild(campoSelect('Tipo', { destino: 'Destino', cruce: 'Cruce o giro' }, p.tipo, function (tipo) {
      registrarCambio();
      puntoPorId(p.id).tipo = tipo;
      actualizar();
    }));

    const conectados = estado.tramos.filter(function (t) { return t.desde === p.id || t.hasta === p.id; }).length;
    caja.appendChild(dato('Número', String(p.id)));
    caja.appendChild(dato('Coordenadas', p.lat.toFixed(6) + ', ' + p.lng.toFixed(6)));
    caja.appendChild(dato('Tramos conectados', String(conectados)));

    const borrar = crear('button', 'boton peligro ancho', 'Eliminar punto' + (conectados ? ' y sus ' + conectados + (conectados === 1 ? ' tramo' : ' tramos') : ''));
    borrar.addEventListener('click', function () { eliminarPunto(p.id); });
    caja.appendChild(borrar);
    return;
  }

  if (seleccion && seleccion.tipo === 'tramo' && estado.tramos[seleccion.indice]) {
    const i = seleccion.indice;
    const t = estado.tramos[i];
    const a = puntoPorId(t.desde);
    const b = puntoPorId(t.hasta);
    caja.appendChild(dato('Tramo', (a ? a.nombre : '?') + ' ↔ ' + (b ? b.nombre : '?')));
    caja.appendChild(dato('Longitud', formatearCosto(t.metros)));

    const nombresCondicion = {};
    Object.keys(CONDICIONES).forEach(function (c) { nombresCondicion[c] = CONDICIONES[c].nombre; });
    caja.appendChild(campoSelect('Condición', nombresCondicion, t.condicion, function (condicion) {
      registrarCambio();
      estado.tramos[i].condicion = condicion;
      actualizar();
    }));

    const costo = costoTramo(t);
    caja.appendChild(dato('Costo para Dijkstra', costo === null ? 'no se puede usar' : formatearCosto(costo)));

    const borrar = crear('button', 'boton peligro ancho', 'Eliminar tramo');
    borrar.addEventListener('click', function () { eliminarTramo(i); });
    caja.appendChild(borrar);
    return;
  }

  caja.appendChild(crear('p', 'ayuda', 'Haga clic en un punto o en un tramo para editarlo.'));
}

function calcularAvisos() {
  const conTramo = new Set();
  estado.tramos.forEach(function (t) { conTramo.add(t.desde); conTramo.add(t.hasta); });
  const aislados = estado.puntos.filter(function (p) { return !conTramo.has(p.id); });

  const vistos = new Set();
  const repetidos = new Set();
  estado.tramos.forEach(function (t, i) {
    const clave = Math.min(t.desde, t.hasta) + '-' + Math.max(t.desde, t.hasta);
    if (vistos.has(clave)) repetidos.add(i);
    vistos.add(clave);
  });
  return { aislados: aislados, repetidos: repetidos };
}

function botonDeLista(contenido, alElegir) {
  const boton = crear('button');
  contenido.forEach(function (n) { boton.appendChild(n); });
  boton.addEventListener('click', alElegir);
  return boton;
}

function enfocar(lng, lat) {
  if (!mapa.getBounds().contains([lng, lat])) mapa.easeTo({ center: [lng, lat] });
}

function elegirPunto(id) {
  const p = puntoPorId(id);
  seleccion = { tipo: 'punto', id: id };
  actualizar();
  enfocar(p.lng, p.lat);
}

function elegirTramo(i) {
  const t = estado.tramos[i];
  const a = puntoPorId(t.desde);
  const b = puntoPorId(t.hasta);
  seleccion = { tipo: 'tramo', indice: i };
  actualizar();
  if (a && b) enfocar((a.lng + b.lng) / 2, (a.lat + b.lat) / 2);
}

function dibujarPanel() {
  const avisos = calcularAvisos();

  // Avisos
  const listaAvisos = el('lista-avisos');
  listaAvisos.innerHTML = '';
  avisos.aislados.forEach(function (p) {
    const li = crear('li');
    const enlace = crear('a', null, p.nombre);
    enlace.href = '#';
    enlace.addEventListener('click', function (e) { e.preventDefault(); elegirPunto(p.id); });
    li.append('Punto sin tramos: ', enlace);
    listaAvisos.appendChild(li);
  });
  avisos.repetidos.forEach(function (i) {
    const t = estado.tramos[i];
    const li = crear('li');
    const enlace = crear('a', null, (puntoPorId(t.desde) || {}).nombre + ' ↔ ' + (puntoPorId(t.hasta) || {}).nombre);
    enlace.href = '#';
    enlace.addEventListener('click', function (e) { e.preventDefault(); elegirTramo(i); });
    li.append('Tramo repetido: ', enlace);
    listaAvisos.appendChild(li);
  });
  el('avisos').hidden = !listaAvisos.children.length;

  // Lista de puntos
  const aislados = new Set(avisos.aislados.map(function (p) { return p.id; }));
  const conteo = new Map();
  estado.tramos.forEach(function (t) {
    conteo.set(t.desde, (conteo.get(t.desde) || 0) + 1);
    conteo.set(t.hasta, (conteo.get(t.hasta) || 0) + 1);
  });
  el('titulo-puntos').textContent = 'Puntos (' + estado.puntos.length + ')';
  const listaPuntos = el('lista-puntos');
  listaPuntos.innerHTML = '';
  estado.puntos.forEach(function (p) {
    const li = crear('li', esPuntoSeleccionado(p.id) ? 'seleccionado' : null);
    const n = conteo.get(p.id) || 0;
    li.appendChild(botonDeLista([
      crear('span', 'icono-punto' + (p.tipo === 'destino' ? ' destino' : '')),
      crear('span', 'nombre', p.nombre),
      aislados.has(p.id) ? crear('span', 'alerta-icono', '⚠') : crear('span'),
      crear('span', 'detalle', '#' + p.id + ' · ' + n + (n === 1 ? ' tramo' : ' tramos'))
    ], function () { elegirPunto(p.id); }));
    listaPuntos.appendChild(li);
  });
  if (!estado.puntos.length) listaPuntos.appendChild(crear('li', 'vacia', 'Todavía no hay puntos. Haga clic en el mapa para crear uno.'));

  // Lista de tramos
  el('titulo-tramos').textContent = 'Tramos (' + estado.tramos.length + ')';
  const listaTramos = el('lista-tramos');
  listaTramos.innerHTML = '';
  estado.tramos.forEach(function (t, i) {
    const li = crear('li', esTramoSeleccionado(i) ? 'seleccionado' : null);
    const color = crear('span', 'color' + (t.condicion === 'escaleras' ? ' muestra discontinua' : ''));
    if (t.condicion !== 'escaleras') color.style.background = CONDICIONES[t.condicion].color;
    color.title = CONDICIONES[t.condicion].nombre;
    li.appendChild(botonDeLista([
      color,
      crear('span', 'nombre', (puntoPorId(t.desde) || {}).nombre + ' ↔ ' + (puntoPorId(t.hasta) || {}).nombre),
      avisos.repetidos.has(i) ? crear('span', 'alerta-icono', '⚠') : crear('span'),
      crear('span', 'detalle', formatearCosto(t.metros))
    ], function () { elegirTramo(i); }));
    listaTramos.appendChild(li);
  });
  if (!estado.tramos.length) listaTramos.appendChild(crear('li', 'vacia', 'Todavía no hay tramos. Use «Crear tramo».'));

  dibujarSeleccion();

  // Herramientas
  el('modo-puntos').classList.toggle('activo', modo === 'puntos');
  el('modo-tramo').classList.toggle('activo', modo === 'tramo');
  el('modo-puntos').setAttribute('aria-pressed', modo === 'puntos');
  el('modo-tramo').setAttribute('aria-pressed', modo === 'tramo');
  el('ayuda-modo').textContent = modo === 'puntos'
    ? 'Clic en el mapa: crea un punto. Clic en un punto o tramo: lo selecciona. Arrastre un punto para moverlo.'
    : tramoInicio === null
      ? 'Clic en el primer punto del tramo.'
      : 'Ahora clic en el segundo punto (Esc o clic en el mismo punto para cancelar).';
  el('deshacer').disabled = !historial.length;

  const pendiente = huella(estado) !== ultimoGuardado;
  el('estado-guardado').textContent = pendiente ? 'Cambios sin guardar' : 'Todo guardado en js/datos.js';
  el('estado-guardado').classList.toggle('pendiente', pendiente);
}

/** Redibuja todo y guarda el borrador (para no perder el trabajo al recargar). */
function actualizar() {
  if (mapaListo) {
    dibujarPuntos();
    dibujarTramos();
    mapa.getCanvas().style.cursor = cursorDelModo();
    if (tramoInicio === null) mapa.getSource('guia').setData({ type: 'FeatureCollection', features: [] });
    ajustarLimites();
  }
  dibujarPlano();
  dibujarPanel();
  escribirLocal(CLAVE_BORRADOR, { datos: estado, fecha: Date.now() });
}

function cambiarModo(nuevo) {
  modo = nuevo;
  tramoInicio = null;
  actualizar();
}

let temporizadorMensaje = null;
function mostrarMensaje(texto, tipo) {
  const p = el('mensaje');
  p.textContent = texto;
  p.className = 'mensaje' + (tipo ? ' ' + tipo : '');
  clearTimeout(temporizadorMensaje);
  if (tipo !== 'error') temporizadorMensaje = setTimeout(function () { p.textContent = ''; }, 6000);
}

/* ------------------------------------------------------------------ */
/* Guardar: sobre el archivo (Chrome/Edge) o como descarga             */
/* ------------------------------------------------------------------ */

const puedeEscribirArchivos = 'showSaveFilePicker' in window;
el('cambiar-destino').hidden = !puedeEscribirArchivos;

// El "permiso" sobre el archivo elegido se recuerda en IndexedDB.
function baseDeDatos() {
  return new Promise(function (resolver, rechazar) {
    const pedido = indexedDB.open('editorCampus', 1);
    pedido.onupgradeneeded = function () { pedido.result.createObjectStore('archivos'); };
    pedido.onsuccess = function () { resolver(pedido.result); };
    pedido.onerror = function () { rechazar(pedido.error); };
  });
}
function leerArchivoRecordado(clave) {
  return baseDeDatos().then(function (bd) {
    return new Promise(function (resolver) {
      const pedido = bd.transaction('archivos').objectStore('archivos').get(clave);
      pedido.onsuccess = function () { resolver(pedido.result || null); };
      pedido.onerror = function () { resolver(null); };
    });
  }).catch(function () { return null; });
}
function recordarArchivo(clave, manejador) {
  return baseDeDatos().then(function (bd) {
    return new Promise(function (resolver) {
      const tx = bd.transaction('archivos', 'readwrite');
      if (manejador) tx.objectStore('archivos').put(manejador, clave);
      else tx.objectStore('archivos').delete(clave);
      tx.oncomplete = tx.onerror = function () { resolver(); };
    });
  }).catch(function () {});
}

function descargar(nombre, texto, tipo) {
  const url = URL.createObjectURL(new Blob([texto], { type: tipo || 'text/javascript;charset=utf-8' }));
  const enlace = crear('a');
  enlace.href = url;
  enlace.download = nombre;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
}

function preguntarArchivo(ruta) {
  el('archivo-titulo').textContent = 'Elegir ' + ruta;
  el('archivo-texto').textContent = 'Solo esta vez: en la ventana que se abrirá, entre a la carpeta del proyecto, ' +
    'elija el archivo ' + ruta + ' y acepte reemplazarlo. Las próximas veces se guardará directamente.';
  const dialogo = el('dialogo-archivo');
  dialogo.returnValue = '';
  dialogo.showModal();
  return new Promise(function (resolver) {
    dialogo.addEventListener('close', function () { resolver(dialogo.returnValue === 'ok'); }, { once: true });
  });
}

/**
 * Escribe un archivo del proyecto. Devuelve true si quedó escrito (o descargado).
 * clave: nombre con que se recuerda el archivo elegido ('datos' o 'imagen').
 */
async function escribirArchivo(clave, nombre, texto, ruta) {
  if (!puedeEscribirArchivos) {
    descargar(nombre, texto);
    mostrarMensaje('Se descargó ' + nombre + '. Reemplace con él el archivo ' + ruta + ' del proyecto.', 'ok');
    return true;
  }
  try {
    let manejador = await leerArchivoRecordado(clave);
    if (manejador && (await manejador.requestPermission({ mode: 'readwrite' })) !== 'granted') manejador = null;
    if (!manejador) {
      if (!(await preguntarArchivo(ruta))) return false;
      manejador = await window.showSaveFilePicker({
        suggestedName: nombre,
        types: [{ description: 'Archivo JavaScript', accept: { 'text/javascript': ['.js'] } }]
      });
      await recordarArchivo(clave, manejador);
    }
    const escritor = await manejador.createWritable();
    await escritor.write(texto);
    await escritor.close();
    const hora = new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
    if (manejador.name !== nombre) {
      mostrarMensaje('Guardado en «' + manejador.name + '» (' + hora + '). Ojo: la demo lee ' + ruta + '.', 'error');
    } else {
      mostrarMensaje('Guardado en ' + nombre + ' (' + hora + ').', 'ok');
    }
    return true;
  } catch (e) {
    if (e.name === 'AbortError') return false; // el usuario cerró la ventana
    descargar(nombre, texto);
    mostrarMensaje('No se pudo escribir el archivo (' + e.message + '). Se descargó ' + nombre +
      '; reemplace con él ' + ruta + '.', 'error');
    return true;
  }
}

el('guardar').addEventListener('click', async function () {
  const copia = JSON.parse(JSON.stringify(estado));
  if (await escribirArchivo('datos', 'datos.js', generarDatosJs(copia), 'js/datos.js')) {
    ultimoGuardado = huella(copia);
    el('aviso-borrador').hidden = true;
    dibujarPanel();
  }
});

el('cambiar-destino').addEventListener('click', function () {
  recordarArchivo('datos', null).then(function () {
    mostrarMensaje('La próxima vez que guarde se le pedirá elegir el archivo.');
  });
});

el('exportar').addEventListener('click', function () {
  descargar('puntos.csv', csvPuntos(estado), 'text/csv;charset=utf-8');
  setTimeout(function () { descargar('tramos.csv', csvTramos(estado), 'text/csv;charset=utf-8'); }, 400);
  mostrarMensaje('Se descargaron puntos.csv y tramos.csv (se abren con Excel).', 'ok');
});

/* ------------------------------------------------------------------ */
/* Botones y teclado                                                   */
/* ------------------------------------------------------------------ */

document.querySelectorAll('[data-cerrar]').forEach(function (boton) {
  boton.addEventListener('click', function () { boton.closest('dialog').close('cancelar'); });
});

el('modo-puntos').addEventListener('click', function () { cambiarModo('puntos'); });
el('modo-tramo').addEventListener('click', function () { cambiarModo('tramo'); });
el('deshacer').addEventListener('click', deshacer);

el('descartar-borrador').addEventListener('click', function () {
  if (!confirm('¿Descartar los cambios sin guardar y volver a lo que hay en js/datos.js?')) return;
  registrarCambio();
  estado = datosDelArchivo();
  seleccion = null;
  el('aviso-borrador').hidden = true;
  actualizar();
});

document.addEventListener('keydown', function (e) {
  if (document.querySelector('dialog[open]')) return;
  if (e.target.closest('input, select, textarea')) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    deshacer();
  } else if (e.key === 'Escape') {
    tramoInicio = null;
    seleccion = null;
    actualizar();
  } else if (e.key === 'Delete' && seleccion) {
    if (seleccion.tipo === 'punto') eliminarPunto(seleccion.id);
    else eliminarTramo(seleccion.indice);
  }
});

actualizar();
if (typeof DATOS_CAMPUS === 'undefined') {
  mostrarMensaje('No se pudo leer js/datos.js. Se empieza con un grafo vacío.', 'error');
}
