/*
 * PÁGINA: mapa, controles, animación de Dijkstra y resultado.
 * Los datos vienen de js/datos.js y el algoritmo de js/dijkstra.js.
 */

const PUNTOS = DATOS_CAMPUS.puntos;
const TRAMOS = DATOS_CAMPUS.tramos;
const GRAFO = construirGrafo(PUNTOS, TRAMOS);
const PUNTO_POR_ID = new Map(PUNTOS.map(function (p) { return [p.id, p]; }));

/*
 * Edificios con varias entradas: los nombres con paréntesis, como
 * "Edificio Lago (Entrada Lateral)", se agrupan por lo que va antes del paréntesis.
 */
function nombreDeEdificio(nombre) {
  const partes = nombre.match(/^(.+?)\s*\(.*\)\s*$/);
  return partes ? partes[1] : nombre;
}

const DESTINOS = PUNTOS.filter(function (p) { return p.tipo === 'destino'; });
const EDIFICIOS = new Map(); // nombre del edificio → sus puntos de tipo destino
DESTINOS.forEach(function (p) {
  const edificio = nombreDeEdificio(p.nombre);
  if (!EDIFICIOS.has(edificio)) EDIFICIOS.set(edificio, []);
  EDIFICIOS.get(edificio).push(p);
});

function esEntradaDeEdificio(p) {
  return p.tipo === 'destino' && EDIFICIOS.get(nombreDeEdificio(p.nombre)).length > 1;
}

/*
 * Texto que muestra cada punto en el mapa: los giros y cruces nunca llevan
 * etiqueta; las entradas de un edificio tampoco (el nombre del edificio se
 * muestra una sola vez, aparte).
 */
function etiquetaEnMapa(p) {
  return p.tipo === 'destino' && !esEntradaDeEdificio(p) ? p.nombre : '';
}

const COLORES = {
  destino: '#1d4ed8',
  cruce: '#64748b',
  actual: '#f59e0b',
  pendiente: '#38bdf8',
  definitivo: '#16a34a',
  tramo: '#94a3b8',
  ruta: '#1d4ed8'
};

const el = function (id) { return document.getElementById(id); };

/* ------------------------------------------------------------------ */
/* Mapa (OpenFreeMap + MapLibre GL JS)                                 */
/* ------------------------------------------------------------------ */

const mapa = new maplibregl.Map({
  container: 'mapa',
  style: 'https://tiles.openfreemap.org/styles/liberty',
  bounds: limitesDePuntos(), // al abrir, encuadra todos los puntos del grafo
  fitBoundsOptions: { padding: 40 }
});
mapa.addControl(new maplibregl.NavigationControl(), 'top-right');

let mapaListo = false;

function limitesDe(coordenadas) {
  const limites = new maplibregl.LngLatBounds();
  coordenadas.forEach(function (c) { limites.extend(c); });
  return limites;
}

function limitesDePuntos() {
  return limitesDe(PUNTOS.map(function (p) { return [p.lng, p.lat]; }));
}

/** Margen para encuadrar, proporcional al tamaño del mapa (en celular es más pequeño). */
function margenMapa(maximo) {
  const lienzo = mapa.getContainer();
  return Math.min(maximo, Math.floor(Math.min(lienzo.clientWidth, lienzo.clientHeight) / 6));
}

/* ------------------------------------------------------------------ */
/* Mapa base atenuado y botón "plano con mapa" / "solo plano"          */
/* ------------------------------------------------------------------ */

let capasBase = []; // capas del mapa de OpenFreeMap que se ven al cargar

// Convierte un color CSS a un gris claro (el navegador interpreta el texto).
const pincel = document.createElement('canvas').getContext('2d');
function colorEnGris(texto) {
  pincel.fillStyle = '#010203';
  pincel.fillStyle = texto;
  const color = pincel.fillStyle;
  if (color === '#010203') return null; // no era un color
  let r, g, b, a = 1;
  if (color[0] === '#') {
    r = parseInt(color.slice(1, 3), 16); g = parseInt(color.slice(3, 5), 16); b = parseInt(color.slice(5, 7), 16);
  } else {
    const n = color.match(/[\d.]+/g).map(Number);
    r = n[0]; g = n[1]; b = n[2]; a = n[3] !== undefined ? n[3] : 1;
  }
  const gris = 0.299 * r + 0.587 * g + 0.114 * b;
  const claro = Math.round(gris + (255 - gris) * 0.4);
  return 'rgba(' + claro + ',' + claro + ',' + claro + ',' + a + ')';
}
// Recorre también las expresiones (por ejemplo, colores que cambian con el zoom).
function enGris(valor) {
  if (typeof valor === 'string') return colorEnGris(valor) || valor;
  if (Array.isArray(valor)) return valor.map(enGris);
  return valor;
}

function atenuarMapaBase() {
  // Propiedades de color según el tipo de capa
  const colores = {
    background: ['background-color'],
    fill: ['fill-color', 'fill-outline-color'],
    'fill-extrusion': ['fill-extrusion-color'],
    line: ['line-color'],
    circle: ['circle-color'],
    symbol: ['text-color', 'icon-color']
  };
  mapa.getStyle().layers.forEach(function (capa) {
    if ((capa.layout || {}).visibility !== 'none') capasBase.push(capa.id);
    (colores[capa.type] || []).forEach(function (prop) {
      const valor = mapa.getPaintProperty(capa.id, prop);
      if (valor === undefined) return;
      try { mapa.setPaintProperty(capa.id, prop, enGris(valor)); } catch (e) { /* se deja como estaba */ }
    });
    if (capa.type === 'symbol') mapa.setPaintProperty(capa.id, 'icon-opacity', 0.5);
  });
  // Velo blanco encima del mapa base y debajo del plano: lo aclara.
  mapa.addLayer({ id: 'velo', type: 'background', paint: { 'background-color': '#ffffff', 'background-opacity': 0.35 } });
}

function mostrarMapaBase(visible) {
  capasBase.forEach(function (id) { mapa.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none'); });
  mapa.setPaintProperty('velo', 'background-color', visible ? '#ffffff' : '#eef1f5');
  mapa.setPaintProperty('velo', 'background-opacity', visible ? 0.35 : 1);
  document.querySelectorAll('.control-fondo button').forEach(function (boton) {
    boton.setAttribute('aria-pressed', String((boton.dataset.fondo === 'mapa') === visible));
  });
}

// Botón sobre el mapa para alternar el fondo (solo si hay plano calibrado).
const controlFondo = {
  onAdd: function () {
    const caja = document.createElement('div');
    caja.className = 'maplibregl-ctrl maplibregl-ctrl-group control-fondo';
    [['mapa', 'Plano con mapa'], ['plano', 'Solo plano']].forEach(function (op) {
      const boton = document.createElement('button');
      boton.type = 'button';
      boton.dataset.fondo = op[0];
      boton.textContent = op[1];
      boton.setAttribute('aria-pressed', String(op[0] === 'mapa'));
      boton.addEventListener('click', function () { mostrarMapaBase(op[0] === 'mapa'); });
      caja.appendChild(boton);
    });
    return caja;
  },
  onRemove: function () {}
};

mapa.on('load', function () {
  atenuarMapaBase();

  // Tramos: una línea por tramo; el "id" permite resaltar el que se revisa.
  mapa.addSource('tramos', {
    type: 'geojson',
    data: {
      type: 'FeatureCollection',
      features: TRAMOS.map(function (t, i) {
        const a = PUNTO_POR_ID.get(t.desde);
        const b = PUNTO_POR_ID.get(t.hasta);
        return {
          type: 'Feature',
          id: i,
          properties: { condicion: t.condicion },
          geometry: { type: 'LineString', coordinates: [[a.lng, a.lat], [b.lng, b.lat]] }
        };
      })
    }
  });
  mapa.addLayer({
    id: 'tramos',
    type: 'line',
    source: 'tramos',
    layout: { 'line-cap': 'round' },
    paint: {
      'line-color': ['case', ['boolean', ['feature-state', 'activo'], false], COLORES.actual, COLORES.tramo],
      'line-width': ['case', ['boolean', ['feature-state', 'activo'], false], 6, 3]
    }
  });

  // Ruta final: línea gruesa con borde blanco.
  mapa.addSource('ruta', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  mapa.addLayer({
    id: 'ruta-borde', type: 'line', source: 'ruta',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#ffffff', 'line-width': 12 }
  });
  mapa.addLayer({
    id: 'ruta', type: 'line', source: 'ruta',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': COLORES.ruta, 'line-width': 7 }
  });

  // Puntos: el color depende del estado que les asigna la animación.
  mapa.addSource('puntos', {
    type: 'geojson',
    promoteId: 'id',
    data: {
      type: 'FeatureCollection',
      features: PUNTOS.map(function (p) {
        return {
          type: 'Feature',
          properties: { id: p.id, nombre: p.nombre, tipo: p.tipo, etiqueta: etiquetaEnMapa(p) },
          geometry: { type: 'Point', coordinates: [p.lng, p.lat] }
        };
      })
    }
  });
  const estado = ['coalesce', ['feature-state', 'estado'], 'normal'];
  const esDestino = ['==', ['get', 'tipo'], 'destino'];
  mapa.addLayer({
    id: 'puntos',
    type: 'circle',
    source: 'puntos',
    paint: {
      'circle-color': ['match', estado,
        'actual', COLORES.actual,
        'definitivo', COLORES.definitivo,
        'pendiente', COLORES.pendiente,
        ['case', esDestino, COLORES.destino, COLORES.cruce]],
      'circle-radius': ['+', ['case', esDestino, 10, 6], ['match', estado, 'actual', 4, 0]],
      'circle-stroke-color': ['case', ['boolean', ['feature-state', 'vecino'], false], COLORES.actual, '#ffffff'],
      'circle-stroke-width': ['case', ['boolean', ['feature-state', 'vecino'], false], 4, 2]
    }
  });

  /*
   * Nombres en el mapa. Las etiquetas que chocan entre sí se ocultan solas
   * (el mapa prueba varias posiciones alrededor del punto antes de ocultarla).
   * Las capas de más arriba tienen prioridad: primero origen y destino,
   * luego los edificios y por último los demás destinos.
   */
  const estiloTexto = { 'text-color': '#0f172a', 'text-halo-color': '#ffffff', 'text-halo-width': 2 };

  // Destinos sueltos (no las entradas de un edificio ni los cruces)
  mapa.addLayer({
    id: 'nombres',
    type: 'symbol',
    source: 'puntos',
    filter: filtroNombres([]),
    layout: {
      'text-field': ['get', 'etiqueta'],
      'text-font': ['Noto Sans Bold'],
      'text-size': 13,
      'text-max-width': 9,
      'text-variable-anchor': ['top', 'bottom', 'left', 'right'],
      'text-radial-offset': 0.9,
      'text-padding': 4
    },
    paint: estiloTexto
  });

  // Un nombre por edificio, en el centro de sus entradas
  mapa.addSource('edificios', {
    type: 'geojson',
    data: {
      type: 'FeatureCollection',
      features: Array.from(EDIFICIOS.entries()).filter(function (e) { return e[1].length > 1; }).map(function (e) {
        const entradas = e[1];
        const lng = entradas.reduce(function (s, p) { return s + p.lng; }, 0) / entradas.length;
        const lat = entradas.reduce(function (s, p) { return s + p.lat; }, 0) / entradas.length;
        return { type: 'Feature', properties: { nombre: e[0] }, geometry: { type: 'Point', coordinates: [lng, lat] } };
      })
    }
  });
  mapa.addLayer({
    id: 'nombres-edificios',
    type: 'symbol',
    source: 'edificios',
    layout: {
      'text-field': ['get', 'nombre'],
      'text-font': ['Noto Sans Bold'],
      'text-size': 14,
      'text-max-width': 9,
      'text-variable-anchor': ['center', 'top', 'bottom', 'left', 'right'],
      'text-radial-offset': 0.9,
      'text-padding': 4
    },
    paint: estiloTexto
  });

  // Origen y destino elegidos: siempre visibles, con su nombre completo
  mapa.addSource('extremos', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  mapa.addLayer({
    id: 'nombres-extremos',
    type: 'symbol',
    source: 'extremos',
    layout: {
      'text-field': ['get', 'nombre'],
      'text-font': ['Noto Sans Bold'],
      'text-size': 14,
      'text-max-width': 12,
      'text-variable-anchor': ['top', 'bottom', 'left', 'right'],
      'text-radial-offset': 1.1,
      'text-allow-overlap': true
    },
    paint: { 'text-color': '#1e3a8a', 'text-halo-color': '#ffffff', 'text-halo-width': 3 }
  });

  // Al pasar el cursor (o tocar) un punto se muestra su nombre.
  const ventana = new maplibregl.Popup({ closeButton: false, offset: 12 });
  mapa.on('mouseenter', 'puntos', function (e) {
    mapa.getCanvas().style.cursor = 'pointer';
    ventana.setLngLat(e.features[0].geometry.coordinates).setText(e.features[0].properties.nombre).addTo(mapa);
  });
  mapa.on('mouseleave', 'puntos', function () {
    mapa.getCanvas().style.cursor = '';
    ventana.remove();
  });
  mapa.on('click', 'puntos', function (e) {
    ventana.setLngLat(e.features[0].geometry.coordinates).setText(e.features[0].properties.nombre).addTo(mapa);
  });

  // Plano de la universidad, con la calibración hecha en el editor (si existe).
  if (DATOS_CAMPUS.plano && typeof PLANO_IMAGEN !== 'undefined') {
    agregarPlano(mapa, DATOS_CAMPUS.plano, PLANO_IMAGEN, 'tramos');
    mapa.addControl(controlFondo, 'top-left');
  }

  // No se puede salir del campus ni alejarse más allá de verlo completo.
  limitarMapaAlCampus(mapa, function () { return areaDelCampus(DATOS_CAMPUS.plano, PUNTOS); });

  mapa.fitBounds(limitesDePuntos(), { padding: margenMapa(60), duration: 0 });
  mapaListo = true;
  mostrarExtremos();
  mostrarSegunModo();
});

/** Filtro de la capa 'nombres': puntos con etiqueta, sin repetir origen y destino. */
function filtroNombres(idsExcluidos) {
  return ['all',
    ['!=', ['get', 'etiqueta'], ''],
    ['!', ['in', ['get', 'id'], ['literal', idsExcluidos]]]];
}

let extremos = []; // [origen, destino] del cálculo en curso

function mostrarExtremos() {
  if (!mapaListo) return;
  mapa.getSource('extremos').setData({
    type: 'FeatureCollection',
    features: extremos.map(function (id) {
      const p = PUNTO_POR_ID.get(id);
      return { type: 'Feature', properties: { nombre: p.nombre }, geometry: { type: 'Point', coordinates: [p.lng, p.lat] } };
    })
  });
  mapa.setFilter('nombres', filtroNombres(extremos));
}

/* ------------------------------------------------------------------ */
/* Listas de origen y destino (solo puntos de tipo destino)            */
/* ------------------------------------------------------------------ */

// Las entradas de un mismo edificio van juntas bajo su nombre (<optgroup>).
const porNombre = function (a, b) { return a.localeCompare(b, 'es'); };
const edificiosOrdenados = Array.from(EDIFICIOS.keys()).sort(porNombre);

function opcionDe(p) {
  const opcion = document.createElement('option');
  opcion.value = p.id;
  opcion.textContent = p.nombre;
  return opcion;
}

['origen', 'destino'].forEach(function (idLista) {
  const lista = el(idLista);
  edificiosOrdenados.forEach(function (edificio) {
    const puntos = EDIFICIOS.get(edificio);
    if (puntos.length === 1) {
      lista.appendChild(opcionDe(puntos[0]));
      return;
    }
    const grupo = document.createElement('optgroup');
    grupo.label = edificio;
    puntos.slice().sort(function (a, b) { return porNombre(a.nombre, b.nombre); }).forEach(function (p) {
      grupo.appendChild(opcionDe(p));
    });
    lista.appendChild(grupo);
  });
});

// Valores iniciales distintos: la entrada principal (si existe) y otro destino.
const entradaPrincipal = DESTINOS.find(function (p) { return /^entrada principal$/i.test(p.nombre); });
if (entradaPrincipal) el('origen').value = entradaPrincipal.id;
el('destino').selectedIndex = el('origen').selectedIndex === 0 ? 1 : 0;

/* ------------------------------------------------------------------ */
/* Animación paso a paso                                               */
/* ------------------------------------------------------------------ */

const animacion = {
  resultado: null,  // lo que devuelve dijkstra()
  indice: 0,        // paso que se está mostrando
  temporizador: null,
  reproduciendo: false
};

function retardo() {
  // Velocidad 1 → 2 s por paso; velocidad 10 → 0,2 s por paso.
  return 2200 - Number(el('velocidad').value) * 200;
}

function calcular() {
  const origen = Number(el('origen').value);
  const destino = Number(el('destino').value);
  pausar();

  if (origen === destino) {
    el('aviso').textContent = 'El origen y el destino deben ser distintos.';
    el('aviso').hidden = false;
    return;
  }
  el('aviso').hidden = true;

  extremos = [origen, destino];
  mostrarExtremos();

  // El mismo algoritmo en los dos modos: solo cambia cómo se muestra el resultado.
  animacion.resultado = dijkstra(GRAFO, origen, destino);

  if (modoCalculo === 'directa') {
    animacion.indice = animacion.resultado.pasos.length - 1;
    mostrarSegunModo();
    return;
  }
  if (mapaListo) mapa.fitBounds(limitesDePuntos(), { padding: margenMapa(60), duration: 600 });
  animacion.indice = 0;
  mostrarPaso(0);
  reproducir();
}

/* ------------------------------------------------------------------ */
/* Modo de cálculo: "Ruta directa" o "Ver paso a paso"                 */
/* ------------------------------------------------------------------ */

let modoCalculo = 'directa';

/** Ruta directa: solo la ruta final, sin colorear los puntos explorados. */
function mostrarSegunModo() {
  if (!animacion.resultado) return;
  if (modoCalculo === 'pasos') {
    mostrarPaso(animacion.indice);
    return;
  }
  const ultimo = animacion.resultado.pasos[animacion.resultado.pasos.length - 1];
  limpiarEstadosMapa();
  mostrarResultado(ultimo.tipo === 'fin' ? animacion.resultado : null, ultimo.tipo === 'sin-ruta');
}

function limpiarEstadosMapa() {
  if (!mapaListo) return;
  PUNTOS.forEach(function (p) { mapa.setFeatureState({ source: 'puntos', id: p.id }, { estado: 'normal', vecino: false }); });
  TRAMOS.forEach(function (t, n) { mapa.setFeatureState({ source: 'tramos', id: n }, { activo: false }); });
}

function cambiarModoCalculo(nuevo) {
  pausar();
  modoCalculo = nuevo;
  document.querySelectorAll('.modo-calculo button').forEach(function (boton) {
    boton.setAttribute('aria-pressed', String(boton.dataset.modo === nuevo));
  });
  el('seccion-pasos').hidden = nuevo === 'directa';
  el('titulo-resultado').textContent = (nuevo === 'directa' ? '2' : '3') + '. Ruta encontrada';
  if (!animacion.resultado) return;

  if (nuevo === 'pasos') {
    // La misma ruta ya calculada, lista para ver la animación desde el principio.
    animacion.indice = 0;
    mostrarPaso(0);
    el('contador').textContent += ' · pulse «▶ Reproducir» para ver cómo se encontró la ruta';
  } else {
    animacion.indice = animacion.resultado.pasos.length - 1;
    mostrarSegunModo();
  }
}

function reproducir() {
  if (!animacion.resultado || esUltimoPaso()) return;
  animacion.reproduciendo = true;
  programarSiguiente();
  actualizarBotones();
}

function programarSiguiente() {
  animacion.temporizador = setTimeout(function () {
    avanzar();
    if (animacion.reproduciendo && !esUltimoPaso()) programarSiguiente();
    else pausar();
  }, retardo());
}

function pausar() {
  clearTimeout(animacion.temporizador);
  animacion.reproduciendo = false;
  actualizarBotones();
}

function avanzar() {
  if (!animacion.resultado || esUltimoPaso()) return;
  animacion.indice++;
  mostrarPaso(animacion.indice);
}

function reiniciar() {
  pausar();
  animacion.indice = 0;
  mostrarPaso(0);
}

function esUltimoPaso() {
  return animacion.indice >= animacion.resultado.pasos.length - 1;
}

function actualizarBotones() {
  const hay = Boolean(animacion.resultado);
  const fin = hay && esUltimoPaso();
  el('reproducir').disabled = !hay || fin || animacion.reproduciendo;
  el('pausar').disabled = !animacion.reproduciendo;
  el('paso').disabled = !hay || fin;
  el('reiniciar').disabled = !hay || animacion.indice === 0;
}

/* ------------------------------------------------------------------ */
/* Dibujar un paso: mapa, frase, tabla y resultado                     */
/* ------------------------------------------------------------------ */

function mostrarPaso(i) {
  const pasos = animacion.resultado.pasos;
  const paso = pasos[i];
  const anterior = i > 0 ? pasos[i - 1] : null;
  const terminado = paso.tipo === 'fin' || paso.tipo === 'sin-ruta';

  // Frase explicativa
  el('contador').textContent = 'Paso ' + (i + 1) + ' de ' + pasos.length;
  el('explicacion').textContent = paso.mensaje;
  el('explicacion').className = 'explicacion ' + paso.tipo;

  // Tabla
  const definitivos = new Set(paso.definitivos);
  const tabla = el('tabla');
  tabla.innerHTML = '';
  PUNTOS.forEach(function (p) {
    const fila = document.createElement('tr');
    if (p.id === paso.actual && !terminado) fila.className = 'actual';
    else if (definitivos.has(p.id)) fila.className = 'definitivo';
    if (p.id === paso.vecino) fila.classList.add('vecino');

    const previo = paso.previos[p.id];
    const celdas = [
      { texto: p.nombre },
      { texto: formatearCosto(paso.costos[p.id]), clase: 'costo', cambio: anterior && anterior.costos[p.id] !== paso.costos[p.id] },
      { texto: previo === null ? '—' : PUNTO_POR_ID.get(previo).nombre, cambio: anterior && anterior.previos[p.id] !== previo }
    ];
    celdas.forEach(function (c) {
      const td = document.createElement('td');
      td.textContent = c.texto;
      if (c.clase) td.classList.add(c.clase);
      if (c.cambio) td.classList.add('cambio');
      fila.appendChild(td);
    });
    tabla.appendChild(fila);
  });

  // Mapa
  if (mapaListo) {
    PUNTOS.forEach(function (p) {
      let estado = 'normal';
      if (p.id === paso.actual && !terminado) estado = 'actual';
      else if (definitivos.has(p.id)) estado = 'definitivo';
      else if (paso.costos[p.id] !== Infinity) estado = 'pendiente';
      mapa.setFeatureState({ source: 'puntos', id: p.id }, { estado: estado, vecino: p.id === paso.vecino });
    });
    TRAMOS.forEach(function (t, n) {
      mapa.setFeatureState({ source: 'tramos', id: n }, { activo: n === paso.tramo });
    });
  }

  // Resultado final
  mostrarResultado(paso.tipo === 'fin' ? animacion.resultado : null, paso.tipo === 'sin-ruta');
  actualizarBotones();
}

function mostrarResultado(resultado, sinRuta) {
  const caja = el('resultado');
  const lista = el('recorrido');
  lista.innerHTML = '';

  if (mapaListo) {
    const coordenadas = resultado
      ? resultado.ruta.map(function (id) { const p = PUNTO_POR_ID.get(id); return [p.lng, p.lat]; })
      : [];
    mapa.getSource('ruta').setData({
      type: 'FeatureCollection',
      features: coordenadas.length ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coordenadas } }] : []
    });
    // Al terminar, el mapa se acerca para encuadrar la ruta encontrada.
    if (coordenadas.length) {
      mapa.fitBounds(limitesDe(coordenadas), { padding: margenMapa(80), maxZoom: 19, duration: 900 });
    }
  }

  if (sinRuta) {
    caja.hidden = false;
    el('distancia').textContent = 'No existe una ruta accesible entre los puntos elegidos.';
    return;
  }
  if (!resultado) {
    caja.hidden = true;
    return;
  }

  caja.hidden = false;
  el('distancia').innerHTML =
    'Distancia total: <strong>' + formatearCosto(resultado.metrosTotal) + '</strong><br>' +
    'Costo total: <strong>' + formatearCosto(resultado.costoTotal) + '</strong>' +
    '<br><small>El costo es igual a los metros en tramos planos y rampas, y cuenta el doble en pendientes fuertes.</small>';

  resultado.ruta.forEach(function (id) {
    const li = document.createElement('li');
    li.textContent = PUNTO_POR_ID.get(id).nombre;
    lista.appendChild(li);
  });
}

/* ------------------------------------------------------------------ */
/* Eventos                                                             */
/* ------------------------------------------------------------------ */

el('calcular').addEventListener('click', calcular);
document.querySelectorAll('.modo-calculo button').forEach(function (boton) {
  boton.addEventListener('click', function () { cambiarModoCalculo(boton.dataset.modo); });
});
el('reproducir').addEventListener('click', reproducir);
el('pausar').addEventListener('click', pausar);
el('paso').addEventListener('click', function () { pausar(); avanzar(); });
el('reiniciar').addEventListener('click', reiniciar);
