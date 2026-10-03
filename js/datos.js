/*
 * DATOS DEL CAMPUS — Universidad de San Buenaventura Cali
 *
 * Este es el único archivo que hay que editar para agregar puntos o tramos.
 * La lógica (js/dijkstra.js) y la página (js/app.js) los leen desde aquí.
 *
 * PUNTOS
 *   id      número único del punto
 *   nombre  texto que se muestra en la página
 *   tipo    'destino' (aparece en las listas Origen/Destino y con su nombre en el mapa)
 *           'cruce'   (giros y cruces: punto pequeño, solo sirve de paso)
 *   lat,lng coordenadas en grados decimales
 *
 * TRAMOS (se pueden recorrer en ambos sentidos)
 *   desde, hasta  id de los puntos que une
 *   metros        longitud real del tramo
 *   condicion     'plano' | 'rampa'   → costo = metros
 *                 'pendiente'         → costo = 2 × metros (pendiente fuerte)
 *                 'escaleras'         → no se puede usar en silla de ruedas
 */
const DATOS_CAMPUS = {
  puntos: [
    { id: 1,  nombre: 'Entrada principal',  tipo: 'destino', lat: 3.342663,         lng: -76.543935 },
    { id: 3,  nombre: 'Los Cerezos',        tipo: 'destino', lat: 3.34489316850776, lng: -76.5449292850362 },
    { id: 5,  nombre: 'Biblioteca',         tipo: 'destino', lat: 3.34486426722663, lng: -76.5437665392817 },
    { id: 13, nombre: 'Giro A Los Cerezos', tipo: 'cruce',   lat: 3.34468663300737, lng: -76.5442978823531 },
    { id: 14, nombre: 'Giro B Los Cerezos', tipo: 'cruce',   lat: 3.34473652658041, lng: -76.5449520838129 },
    { id: 15, nombre: 'Cruce A Biblioteca', tipo: 'cruce',   lat: 3.34494939894085, lng: -76.5442788493477 },
    { id: 16, nombre: 'Giro B Biblioteca',  tipo: 'cruce',   lat: 3.34499685915966, lng: -76.5437763776676 }
  ],

  tramos: [
    { desde: 1,  hasta: 13, metros: 228.6, condicion: 'plano' },
    { desde: 13, hasta: 14, metros: 72.8,  condicion: 'plano' },
    { desde: 14, hasta: 3,  metros: 17.6,  condicion: 'plano' },
    { desde: 1,  hasta: 15, metros: 257.1, condicion: 'plano' },
    { desde: 15, hasta: 16, metros: 56.0,  condicion: 'plano' },
    { desde: 16, hasta: 5,  metros: 14.8,  condicion: 'plano' }
  ]
};

if (typeof module !== 'undefined') module.exports = DATOS_CAMPUS;
