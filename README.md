# Rutas accesibles USB Cali — demo de Dijkstra

Demostración de cálculo de rutas accesibles para silla de ruedas en el campus de la
Universidad de San Buenaventura Cali, con el algoritmo de Dijkstra animado paso a paso.

## Cómo abrir la página

1. Abra `index.html` con doble clic (Chrome, Firefox o Edge).
2. Elija **Origen** y **Destino** y pulse **Calcular ruta**.

No hay que instalar nada ni usar servidor. Solo se necesita conexión a internet para
cargar el mapa (OpenFreeMap) y la librería MapLibre GL JS.

## Archivos

| Archivo | Contenido |
|---|---|
| `index.html` | Estructura de la página |
| `css/estilos.css` | Diseño (se adapta al celular) |
| `js/datos.js` | **Puntos y tramos del campus** — el único archivo que hay que editar para crecer |
| `js/dijkstra.js` | Costo de los tramos, construcción del grafo y algoritmo de Dijkstra (comentado) |
| `js/app.js` | Mapa, controles, animación, tabla y resultado |

## Cómo agregar puntos y tramos

Edite `js/datos.js`.

**Nuevo punto** — agregue una línea dentro de `puntos`:

```js
{ id: 20, nombre: 'Cafetería', tipo: 'destino', lat: 3.34470, lng: -76.54400 },
```

- `id`: número que no se repita.
- `tipo`: `'destino'` (aparece en las listas y con su nombre en el mapa) o `'cruce'` (giros y cruces, punto pequeño).

**Nuevo tramo** — agregue una línea dentro de `tramos`:

```js
{ desde: 16, hasta: 20, metros: 35.2, condicion: 'rampa' },
```

- `desde` / `hasta`: `id` de dos puntos existentes. El tramo sirve en ambos sentidos, no hay que repetirlo al revés.
- `condicion` y su costo:
  - `'plano'` o `'rampa'` → costo = metros
  - `'pendiente'` → costo = 2 × metros
  - `'escaleras'` → el tramo no se usa

Guarde el archivo y recargue la página.
