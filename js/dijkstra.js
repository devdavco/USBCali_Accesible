/*
 * ALGORITMO DE DIJKSTRA — escrito a mano, sin librerías de rutas.
 *
 * Este archivo solo contiene lógica: no toca el mapa ni la página.
 * Recibe los datos de js/datos.js y devuelve la ruta más corta junto con
 * la lista de pasos que dio el algoritmo (la página los usa para la animación).
 */

/* ------------------------------------------------------------------ */
/* 1. COSTO DE UN TRAMO SEGÚN SU CONDICIÓN                             */
/* ------------------------------------------------------------------ */

/**
 * Calcula cuánto "cuesta" recorrer un tramo en silla de ruedas.
 *   - plano o rampa     → costo = metros
 *   - pendiente fuerte  → costo = 2 × metros (cuesta el doble de esfuerzo)
 *   - escaleras         → null: el tramo no se puede usar
 */
function costoTramo(tramo) {
  switch (tramo.condicion) {
    case 'plano':
    case 'rampa':
      return tramo.metros;
    case 'pendiente':
      return tramo.metros * 2;
    case 'escaleras':
      return null;
    default:
      throw new Error('Condición desconocida en el tramo ' + tramo.desde + '–' + tramo.hasta +
        ': "' + tramo.condicion + '". Use plano, rampa, pendiente o escaleras.');
  }
}

/* ------------------------------------------------------------------ */
/* 2. CONSTRUCCIÓN DEL GRAFO                                           */
/* ------------------------------------------------------------------ */

/**
 * Convierte los puntos y tramos en un grafo representado como
 * "lista de adyacencia": para cada punto se guarda la lista de sus vecinos
 * y el costo de llegar a cada uno.
 *
 * Como los tramos se recorren en ambos sentidos, cada tramo se agrega dos
 * veces: de A hacia B y de B hacia A.
 * Los tramos con costo null (escaleras) no se agregan: para el algoritmo
 * simplemente no existen.
 */
function construirGrafo(puntos, tramos) {
  const adyacencia = new Map(); // id del punto → [{ vecino, costo, metros, tramo }]
  const nombres = new Map();    // id del punto → nombre (para los mensajes)

  for (const punto of puntos) {
    adyacencia.set(punto.id, []);
    nombres.set(punto.id, punto.nombre);
  }

  tramos.forEach(function (tramo, indice) {
    if (!adyacencia.has(tramo.desde) || !adyacencia.has(tramo.hasta)) {
      throw new Error('El tramo ' + tramo.desde + '–' + tramo.hasta + ' usa un punto que no existe.');
    }
    const costo = costoTramo(tramo);
    if (costo === null) return; // escaleras: el tramo se descarta

    // Sentido de ida y sentido de vuelta
    adyacencia.get(tramo.desde).push({ vecino: tramo.hasta, costo: costo, metros: tramo.metros, tramo: indice });
    adyacencia.get(tramo.hasta).push({ vecino: tramo.desde, costo: costo, metros: tramo.metros, tramo: indice });
  });

  return { adyacencia: adyacencia, nombres: nombres };
}

/* ------------------------------------------------------------------ */
/* 3. ALGORITMO DE DIJKSTRA                                            */
/* ------------------------------------------------------------------ */

/**
 * Busca la ruta de menor costo entre origen y destino.
 *
 * Idea general:
 *   - Cada punto tiene un "costo acumulado": lo más barato que se conoce
 *     hasta ahora para llegar a él desde el origen. Empieza en infinito,
 *     excepto el origen, que vale 0.
 *   - En cada ronda se toma el punto pendiente con menor costo acumulado.
 *     Ese costo ya no puede mejorar (todos los costos son positivos),
 *     así que el punto queda DEFINITIVO.
 *   - Desde ese punto se revisan sus vecinos: si llegar a un vecino pasando
 *     por él es más barato que lo conocido, se actualiza su costo y se anota
 *     "desde qué punto se llegó" (previo). A esto se le llama "relajar".
 *   - Se repite hasta que el destino queda definitivo o no quedan puntos
 *     alcanzables.
 *
 * Devuelve { pasos, ruta, costoTotal, metrosTotal }.
 * "pasos" es una lista de fotografías del estado del algoritmo, para animarlo.
 */
function dijkstra(grafo, origen, destino) {
  const adyacencia = grafo.adyacencia;
  const nombres = grafo.nombres;
  const nombre = function (id) { return nombres.get(id); };

  // --- Inicialización ---
  const costos = {};          // costo acumulado de cada punto
  const previos = {};         // desde qué punto se llegó a cada uno
  const definitivos = new Set(); // puntos cuyo costo ya no cambia

  for (const id of adyacencia.keys()) {
    costos[id] = Infinity;
    previos[id] = null;
  }
  costos[origen] = 0;

  // Registro de pasos para la animación (copia del estado en cada momento)
  const pasos = [];
  function registrar(tipo, datos, mensaje) {
    pasos.push({
      tipo: tipo,
      actual: datos.actual !== undefined ? datos.actual : null,
      vecino: datos.vecino !== undefined ? datos.vecino : null,
      tramo: datos.tramo !== undefined ? datos.tramo : null,
      costos: Object.assign({}, costos),
      previos: Object.assign({}, previos),
      definitivos: Array.from(definitivos),
      mensaje: mensaje
    });
  }

  registrar('inicio', {},
    'Inicio: todos los puntos tienen costo ∞ (desconocido), excepto el origen, ' +
    nombre(origen) + ', que vale 0.');

  // --- Ciclo principal ---
  while (true) {
    // a) Elegir el punto pendiente (no definitivo) con menor costo acumulado.
    //    Se hace con una búsqueda lineal: sencillo y suficiente para un campus.
    let actual = null;
    for (const id of adyacencia.keys()) {
      if (definitivos.has(id)) continue;
      if (costos[id] === Infinity) continue; // aún no se sabe cómo llegar
      if (actual === null || costos[id] < costos[actual]) actual = id;
    }

    // b) Si no hay ningún punto pendiente alcanzable, el destino no tiene ruta.
    if (actual === null) {
      registrar('sin-ruta', {},
        'No quedan puntos alcanzables: no existe una ruta accesible hasta ' + nombre(destino) + '.');
      return { pasos: pasos, ruta: [], costoTotal: Infinity, metrosTotal: Infinity };
    }

    // c) El punto elegido queda definitivo: su costo ya no puede mejorar.
    definitivos.add(actual);
    registrar('seleccion', { actual: actual },
      'Se elige ' + nombre(actual) + ': es el punto pendiente con menor costo (' +
      formatearCosto(costos[actual]) + '). Su costo queda definitivo.');

    // d) Si el elegido es el destino, ya tenemos la ruta más corta.
    if (actual === destino) break;

    // e) Relajar: revisar cada vecino que todavía no sea definitivo.
    for (const arista of adyacencia.get(actual)) {
      const vecino = arista.vecino;
      if (definitivos.has(vecino)) continue; // su costo ya es el mejor posible

      const nuevoCosto = costos[actual] + arista.costo;
      const costoConocido = costos[vecino];

      if (nuevoCosto < costoConocido) {
        // Se encontró un camino más barato: se actualiza costo y previo.
        costos[vecino] = nuevoCosto;
        previos[vecino] = actual;
        registrar('mejora', { actual: actual, vecino: vecino, tramo: arista.tramo },
          'Se revisa ' + nombre(actual) + ': llegar a ' + nombre(vecino) + ' por aquí cuesta ' +
          formatearCosto(nuevoCosto) + ', mejor que lo conocido (' + formatearCosto(costoConocido) + ').');
      } else {
        // El camino conocido ya era igual o mejor: no se cambia nada.
        registrar('sin-mejora', { actual: actual, vecino: vecino, tramo: arista.tramo },
          'Se revisa ' + nombre(actual) + ': llegar a ' + nombre(vecino) + ' por aquí cuesta ' +
          formatearCosto(nuevoCosto) + ', no mejora lo conocido (' + formatearCosto(costoConocido) + ').');
      }
    }
  }

  // --- Resultado ---
  const ruta = reconstruirRuta(previos, destino);
  const metrosTotal = metrosDeRuta(adyacencia, ruta);
  registrar('fin', { actual: destino },
    '¡Listo! ' + nombre(destino) + ' quedó definitivo. La ruta más corta cuesta ' +
    formatearCosto(costos[destino]) + '. Se reconstruye siguiendo la columna "Viene de" hacia atrás.');

  return { pasos: pasos, ruta: ruta, costoTotal: costos[destino], metrosTotal: metrosTotal };
}

/* ------------------------------------------------------------------ */
/* 4. RECONSTRUCCIÓN DE LA RUTA                                        */
/* ------------------------------------------------------------------ */

/**
 * Parte del destino y sigue los "previos" hacia atrás hasta el origen
 * (el origen no tiene previo). Luego invierte la lista para que quede
 * en orden origen → destino.
 */
function reconstruirRuta(previos, destino) {
  const ruta = [];
  let id = destino;
  while (id !== null) {
    ruta.push(id);
    id = previos[id];
  }
  return ruta.reverse();
}

/**
 * Suma los metros reales de la ruta (puede ser distinto del costo cuando
 * hay pendientes, porque estas cuentan doble en el costo).
 */
function metrosDeRuta(adyacencia, ruta) {
  let total = 0;
  for (let i = 0; i < ruta.length - 1; i++) {
    const arista = adyacencia.get(ruta[i]).find(function (a) { return a.vecino === ruta[i + 1]; });
    total += arista.metros;
  }
  return total;
}

/* ------------------------------------------------------------------ */
/* Utilidad: formato de números en español                            */
/* ------------------------------------------------------------------ */
function formatearCosto(valor) {
  if (valor === Infinity) return '∞';
  return valor.toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' m';
}

// Permite probar este archivo con Node.js (en el navegador se ignora).
if (typeof module !== 'undefined') {
  module.exports = { costoTramo, construirGrafo, dijkstra, reconstruirRuta, formatearCosto };
}
