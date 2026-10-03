/*
 * PÁGINA: mapa, controles, animación de Dijkstra y resultado.
 * Los datos vienen de js/datos.js y el algoritmo de js/dijkstra.js.
 */

const PUNTOS = DATOS_CAMPUS.puntos;
const TRAMOS = DATOS_CAMPUS.tramos;
const GRAFO = construirGrafo(PUNTOS, TRAMOS);
const PUNTO_POR_ID = new Map(PUNTOS.map(function (p) { return [p.id, p]; }));

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
  center: [-76.543861, 3.345040], // [lng, lat]
  zoom: 17
});
mapa.addControl(new maplibregl.NavigationControl(), 'top-right');

let mapaListo = false;

function limitesDePuntos() {
  const limites = new maplibregl.LngLatBounds();
  PUNTOS.forEach(function (p) { limites.extend([p.lng, p.lat]); });
  return limites;
}

mapa.on('load', function () {
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
          properties: { id: p.id, nombre: p.nombre, tipo: p.tipo },
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

  // Nombres: solo para los destinos.
  mapa.addLayer({
    id: 'nombres',
    type: 'symbol',
    source: 'puntos',
    filter: esDestino,
    layout: {
      'text-field': ['get', 'nombre'],
      'text-font': ['Noto Sans Bold'],
      'text-size': 14,
      'text-offset': [0, 1.4],
      'text-anchor': 'top',
      'text-allow-overlap': true
    },
    paint: { 'text-color': '#0f172a', 'text-halo-color': '#ffffff', 'text-halo-width': 2 }
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
  }

  mapa.fitBounds(limitesDePuntos(), { padding: 60, duration: 0 });
  mapaListo = true;
  if (animacion.resultado) mostrarPaso(animacion.indice);
});

/* ------------------------------------------------------------------ */
/* Listas de origen y destino (solo puntos de tipo destino)            */
/* ------------------------------------------------------------------ */

const destinos = PUNTOS.filter(function (p) { return p.tipo === 'destino'; });
['origen', 'destino'].forEach(function (idLista, n) {
  const lista = el(idLista);
  destinos.forEach(function (p) {
    const opcion = document.createElement('option');
    opcion.value = p.id;
    opcion.textContent = p.nombre;
    lista.appendChild(opcion);
  });
  lista.selectedIndex = Math.min(n, destinos.length - 1); // valores iniciales distintos
});

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

  animacion.resultado = dijkstra(GRAFO, origen, destino);
  animacion.indice = 0;
  mostrarPaso(0);
  reproducir();
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
  let texto = 'Distancia total: <strong>' + formatearCosto(resultado.metrosTotal) + '</strong>';
  if (Math.abs(resultado.costoTotal - resultado.metrosTotal) > 1e-9) {
    texto += '<br><small>Costo con penalización por pendientes: ' + formatearCosto(resultado.costoTotal) + '</small>';
  }
  el('distancia').innerHTML = texto;

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
el('reproducir').addEventListener('click', reproducir);
el('pausar').addEventListener('click', pausar);
el('paso').addEventListener('click', function () { pausar(); avanzar(); });
el('reiniciar').addEventListener('click', reiniciar);
