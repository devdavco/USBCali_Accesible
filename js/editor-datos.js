/*
 * EDITOR — funciones de datos (sin mapa ni página).
 * Distancias, escritura de js/datos.js y exportación a Excel (CSV).
 */

/**
 * Distancia en metros entre dos puntos {lat, lng} (fórmula de haversine),
 * redondeada a un decimal, igual que en js/datos.js.
 */
function distanciaMetros(a, b) {
  const R = 6371008.8; // radio medio de la Tierra en metros
  const rad = function (g) { return g * Math.PI / 180; };
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)) * 10) / 10;
}

/** Redondea coordenadas a 8 decimales (≈ 1 mm), suficiente para el campus. */
function redondearCoordenada(valor) {
  return Number(valor.toFixed(8));
}

/** Copia los datos con un orden de campos fijo, para poder compararlos. */
function normalizarDatos(datos) {
  return {
    puntos: datos.puntos.map(function (p) {
      return { id: p.id, nombre: p.nombre, tipo: p.tipo, lat: p.lat, lng: p.lng };
    }),
    tramos: datos.tramos.map(function (t) {
      return { desde: t.desde, hasta: t.hasta, metros: t.metros, condicion: t.condicion };
    }),
    plano: datos.plano ? {
      imagen: datos.plano.imagen,
      opacidad: datos.plano.opacidad,
      esquinas: datos.plano.esquinas.map(function (c) { return [c[0], c[1]]; })
    } : null
  };
}

/* ------------------------------------------------------------------ */
/* Escritura de js/datos.js (mismo formato que usa la demo)            */
/* ------------------------------------------------------------------ */

const CABECERA_DATOS = [
  '/*',
  ' * DATOS DEL CAMPUS — Universidad de San Buenaventura Cali',
  ' *',
  ' * Este archivo se puede editar a mano o con el editor (editor.html).',
  ' * La lógica (js/dijkstra.js) y la página (js/app.js) los leen desde aquí.',
  ' *',
  ' * PUNTOS',
  ' *   id      número único del punto',
  ' *   nombre  texto que se muestra en la página',
  ' *   tipo    \'destino\' (aparece en las listas Origen/Destino y con su nombre en el mapa)',
  ' *           \'cruce\'   (giros y cruces: punto pequeño, solo sirve de paso)',
  ' *   lat,lng coordenadas en grados decimales',
  ' *',
  ' * TRAMOS (se pueden recorrer en ambos sentidos)',
  ' *   desde, hasta  id de los puntos que une',
  ' *   metros        longitud real del tramo',
  ' *   condicion     \'plano\' | \'rampa\'   → costo = metros',
  ' *                 \'pendiente\'         → costo = 2 × metros (pendiente fuerte)',
  ' *                 \'escaleras\'         → no se puede usar en silla de ruedas',
  ' *',
  ' * PLANO (opcional: imagen del campus calibrada con el editor)',
  ' *   imagen    archivo original de la imagen (la página usa js/plano_imagen.js)',
  ' *   opacidad  de 0 (invisible) a 1 (opaco)',
  ' *   esquinas  [lng, lat] de las esquinas: superior izquierda, superior derecha,',
  ' *             inferior derecha, inferior izquierda',
  ' */'
].join('\n');

function textoJs(valor) {
  return '\'' + String(valor).replace(/\\/g, '\\\\').replace(/'/g, '\\\'').replace(/[\r\n]+/g, ' ') + '\'';
}

/** Arma filas alineadas en columnas: { a: 1,  b: 'x' } */
function filasAlineadas(objetos, campos) {
  const celdas = objetos.map(function (o) {
    return campos.map(function (c, i) {
      return c.clave + ': ' + c.formato(o[c.clave]) + (i < campos.length - 1 ? ',' : '');
    });
  });
  const anchos = campos.map(function (_, i) {
    return Math.max.apply(null, celdas.map(function (fila) { return fila[i].length; }));
  });
  return celdas.map(function (fila, n) {
    const texto = fila.map(function (celda, i) {
      return i < fila.length - 1 ? celda.padEnd(anchos[i]) : celda;
    }).join(' ');
    return '    { ' + texto + ' }' + (n < celdas.length - 1 ? ',' : '');
  }).join('\n');
}

function generarDatosJs(datos) {
  const d = normalizarDatos(datos);
  const partes = [];

  partes.push('  puntos: [\n' + filasAlineadas(d.puntos, [
    { clave: 'id', formato: String },
    { clave: 'nombre', formato: textoJs },
    { clave: 'tipo', formato: textoJs },
    { clave: 'lat', formato: String },
    { clave: 'lng', formato: String }
  ]) + '\n  ]');

  partes.push('  tramos: [\n' + filasAlineadas(d.tramos, [
    { clave: 'desde', formato: String },
    { clave: 'hasta', formato: String },
    { clave: 'metros', formato: function (m) { return m.toFixed(1); } },
    { clave: 'condicion', formato: textoJs }
  ]) + '\n  ]');

  if (d.plano) {
    const nombresEsquinas = ['superior izquierda', 'superior derecha', 'inferior derecha', 'inferior izquierda'];
    partes.push('  plano: {\n' +
      '    imagen: ' + textoJs(d.plano.imagen) + ',\n' +
      '    opacidad: ' + d.plano.opacidad + ',\n' +
      '    esquinas: [\n' +
      d.plano.esquinas.map(function (c, i) {
        return '      [' + c[0] + ', ' + c[1] + ']' + (i < 3 ? ',' : ' ') + ' // ' + nombresEsquinas[i];
      }).join('\n') + '\n' +
      '    ]\n' +
      '  }');
  }

  return CABECERA_DATOS + '\n' +
    'const DATOS_CAMPUS = {\n' + partes.join(',\n\n') + '\n};\n\n' +
    'if (typeof module !== \'undefined\') module.exports = DATOS_CAMPUS;\n';
}

/* ------------------------------------------------------------------ */
/* Exportación a Excel (CSV con ";" y coma decimal, como usa Excel     */
/* en español)                                                         */
/* ------------------------------------------------------------------ */

function celdaCsv(valor) {
  if (typeof valor === 'number') return String(valor).replace('.', ',');
  const texto = String(valor);
  return /[;"\r\n]/.test(texto) ? '"' + texto.replace(/"/g, '""') + '"' : texto;
}

function tablaCsv(filas) {
  // El BOM (﻿) hace que Excel reconozca las tildes (UTF-8).
  return '﻿' + filas.map(function (f) { return f.map(celdaCsv).join(';'); }).join('\r\n') + '\r\n';
}

function csvPuntos(datos) {
  const conteo = new Map();
  datos.tramos.forEach(function (t) {
    conteo.set(t.desde, (conteo.get(t.desde) || 0) + 1);
    conteo.set(t.hasta, (conteo.get(t.hasta) || 0) + 1);
  });
  return tablaCsv([['id', 'nombre', 'tipo', 'latitud', 'longitud', 'tramos conectados']].concat(
    datos.puntos.map(function (p) { return [p.id, p.nombre, p.tipo, p.lat, p.lng, conteo.get(p.id) || 0]; })
  ));
}

function csvTramos(datos) {
  const nombre = new Map(datos.puntos.map(function (p) { return [p.id, p.nombre]; }));
  return tablaCsv([['desde', 'punto desde', 'hasta', 'punto hasta', 'metros', 'condicion', 'costo']].concat(
    datos.tramos.map(function (t) {
      const costo = costoTramo(t);
      return [t.desde, nombre.get(t.desde) || '?', t.hasta, nombre.get(t.hasta) || '?', t.metros, t.condicion,
        costo === null ? 'no utilizable' : Math.round(costo * 10) / 10];
    })
  ));
}

// Permite revisar este archivo con Node.js (en el navegador se ignora).
if (typeof module !== 'undefined') {
  module.exports = { distanciaMetros, redondearCoordenada, normalizarDatos, generarDatosJs, csvPuntos, csvTramos };
}
