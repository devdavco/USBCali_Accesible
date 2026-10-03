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
