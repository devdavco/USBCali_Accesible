/*
 * PLANO DEL CAMPUS SOBRE EL MAPA
 * Lo usan la demo (index.html) y el editor (editor.html).
 *
 * La imagen viene de js/plano_imagen.js (PLANO_IMAGEN) y su ubicación de
 * DATOS_CAMPUS.plano: las cuatro esquinas [lng, lat] en el orden
 * superior izquierda, superior derecha, inferior derecha, inferior izquierda.
 */

// Muchos celulares no aceptan imágenes de más de 4096 px de lado en el mapa.
const PLANO_LADO_MAXIMO = 4096;

/** Si la imagen es muy grande, la reduce para que el mapa la pueda mostrar. */
function prepararImagenPlano(imagen) {
  return new Promise(function (resolver, rechazar) {
    const img = new Image();
    img.onload = function () {
      const lado = Math.max(img.width, img.height);
      if (lado <= PLANO_LADO_MAXIMO) return resolver(imagen);
      const escala = PLANO_LADO_MAXIMO / lado;
      const lienzo = document.createElement('canvas');
      lienzo.width = Math.round(img.width * escala);
      lienzo.height = Math.round(img.height * escala);
      lienzo.getContext('2d').drawImage(img, 0, 0, lienzo.width, lienzo.height);
      resolver(lienzo.toDataURL('image/png'));
    };
    img.onerror = function () { rechazar(new Error('No se pudo leer la imagen del plano.')); };
    img.src = imagen;
  });
}

/** Agrega el plano al mapa debajo de la capa indicada (antesDe). */
function agregarPlano(mapa, plano, imagen, antesDe) {
  return prepararImagenPlano(imagen).then(function (url) {
    mapa.addSource('plano', { type: 'image', url: url, coordinates: plano.esquinas });
    mapa.addLayer({
      id: 'plano',
      type: 'raster',
      source: 'plano',
      paint: {
        'raster-opacity': plano.opacidad !== undefined ? plano.opacidad : 0.7,
        'raster-fade-duration': 0
      }
    }, mapa.getLayer(antesDe) ? antesDe : undefined);
  });
}

/* ------------------------------------------------------------------ */
/* Límites del mapa: solo el campus                                    */
/* ------------------------------------------------------------------ */

/** Rectángulo [[oeste, sur], [este, norte]] que cubre el plano y todos los puntos. */
function areaDelCampus(plano, puntos) {
  const coordenadas = puntos.map(function (p) { return [p.lng, p.lat]; });
  if (plano) plano.esquinas.forEach(function (c) { coordenadas.push(c); });
  const lngs = coordenadas.map(function (c) { return c[0]; });
  const lats = coordenadas.map(function (c) { return c[1]; });
  return [[Math.min.apply(null, lngs), Math.min.apply(null, lats)], [Math.max.apply(null, lngs), Math.max.apply(null, lats)]];
}

/**
 * Impide alejarse más allá de ver el campus completo y desplazarse fuera de él.
 * obtenerArea() devuelve el área del campus; el límite se recalcula si cambia
 * el tamaño del mapa. Devuelve la función que recalcula (por si el área cambia).
 */
function limitarMapaAlCampus(mapa, obtenerArea) {
  const MARGEN = 0.1;   // 10 % de espacio extra para desplazarse
  const BORDE_PX = 20;  // espacio entre el campus y el borde de la pantalla al alejarse

  function ajustar() {
    const area = obtenerArea();
    const so = maplibregl.MercatorCoordinate.fromLngLat(area[0]);
    const ne = maplibregl.MercatorCoordinate.fromLngLat(area[1]);
    const ancho = ne.x - so.x;
    const alto = so.y - ne.y; // en Mercator, "y" crece hacia el sur
    const W = mapa.getContainer().clientWidth;
    const H = mapa.getContainer().clientHeight;
    if (!W || !H || ancho <= 0 || alto <= 0) return;

    // Zoom con el que el campus completo cabe en pantalla: es el mínimo permitido.
    const escala = Math.min((W - 2 * BORDE_PX) / ancho, (H - 2 * BORDE_PX) / alto);
    const zoomMinimo = Math.log2(escala / 512);

    // Zona permitida: lo que se ve con ese zoom alrededor del campus, más el margen.
    const cx = (so.x + ne.x) / 2;
    const cy = (so.y + ne.y) / 2;
    const medioAncho = (W / escala / 2) * (1 + MARGEN);
    const medioAlto = (H / escala / 2) * (1 + MARGEN);
    const suroeste = new maplibregl.MercatorCoordinate(cx - medioAncho, cy + medioAlto).toLngLat();
    const noreste = new maplibregl.MercatorCoordinate(cx + medioAncho, cy - medioAlto).toLngLat();

    mapa.setMaxBounds([suroeste, noreste]);
    mapa.setMinZoom(zoomMinimo);
  }

  ajustar();
  mapa.on('resize', ajustar);
  return ajustar;
}
