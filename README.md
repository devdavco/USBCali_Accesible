# Rutas accesibles USB Cali — demo de Dijkstra

Demostración de cálculo de rutas accesibles para silla de ruedas en el campus de la
Universidad de San Buenaventura Cali, con el algoritmo de Dijkstra animado paso a paso,
y un editor para construir el grafo del campus sobre el plano de la universidad.

## Cómo abrir la página

1. Abra `index.html` con doble clic (Chrome, Firefox o Edge).
2. Elija **Origen** y **Destino** y pulse **Calcular ruta**.

No hay que instalar nada ni usar servidor. Solo se necesita conexión a internet para
cargar el mapa (OpenFreeMap) y la librería MapLibre GL JS.

## Archivos

| Archivo | Contenido |
|---|---|
| `index.html` | Demo: estructura de la página |
| `editor.html` | Editor del grafo |
| `css/estilos.css` | Diseño (se adapta al celular) |
| `css/editor.css` | Diseño propio del editor |
| `js/datos.js` | **Puntos, tramos y calibración del plano** — lo escribe el editor |
| `js/dijkstra.js` | Costo de los tramos, construcción del grafo y algoritmo de Dijkstra (comentado) |
| `js/app.js` | Demo: mapa, controles, animación, tabla y resultado |
| `js/plano.js` | Muestra el plano sobre el mapa (lo usan la demo y el editor) |
| `js/plano_imagen.js` | La imagen `plano_campus.png` incrustada (ver nota abajo) |
| `js/editor.js`, `js/editor-datos.js` | Editor: mapa y panel / escritura de archivos y distancias |
| `plano_campus.png` | Plano original de la universidad |

## Editor del grafo, paso a paso

Abra `editor.html` con doble clic (o use el botón **Editor del grafo →** de la demo).
Al abrirse carga los puntos y tramos que ya hay en `js/datos.js`.

### 1. Calibrar el plano (la primera vez)

1. El plano aparece encima del mapa en una posición aproximada.
2. Con el deslizador **Transparencia** déjelo semitransparente para ver las calles debajo.
3. Arrastre el **círculo central (✥)** para mover el plano completo y los **cuatro cuadros
   de las esquinas** hasta que calles y edificios coincidan con el mapa.
4. Pulse **Fijar calibración**. Las esquinas desaparecen y el plano ya no se mueve por
   accidente. Para volver a calibrar, pulse **Calibración fijada — desbloquear**.

### 2. Marcar puntos

- Con el modo **● Puntos** activo, haga clic en el mapa donde va el punto.
- Escriba el nombre, elija el tipo (**Destino**, o **Cruce o giro** para los giros) y pulse **Crear punto** (o Enter).
- Para editar un punto, haga clic en él: en **Selección** puede cambiar el nombre o el
  tipo, o **eliminarlo** (se borran también sus tramos).
- Para moverlo, arrástrelo. Los metros de sus tramos se recalculan solos.

### 3. Unir puntos con tramos

1. Pulse **╱ Crear tramo**.
2. Haga clic en el primer punto y luego en el segundo (una línea punteada guía el trazo;
   Esc cancela).
3. Elija la condición: **Plano**, **Rampa**, **Escaleras** o **Pendiente fuerte** y pulse **Crear tramo**.

Los metros se calculan con la distancia entre las coordenadas de los dos puntos. Cada
condición tiene su color en el mapa (las escaleras en línea discontinua). Haga clic en
un tramo para cambiar su condición o eliminarlo.

### 4. Revisar

- **Avisos** señala los puntos sin ningún tramo y los tramos repetidos (clic para ir a ellos).
- Las listas **Puntos** y **Tramos** muestran todo, con los metros de cada tramo.
- **↶ Deshacer** (o Ctrl+Z) revierte la última acción. La tecla Supr elimina lo seleccionado.

### 5. Guardar

Pulse **Guardar**. El archivo queda con el mismo formato que usa la demo; recargue
`index.html` para ver los cambios (incluido el plano calibrado).

- **Chrome o Edge:** la primera vez se abre una ventana: entre a la carpeta del proyecto,
  elija `js/datos.js` y acepte reemplazarlo. Desde entonces se guarda directamente sobre
  ese archivo (el navegador puede pedir permiso de nuevo al reabrir). **Cambiar archivo
  de destino** permite elegir otro.
- **Otros navegadores (Firefox, Safari):** se descarga `datos.js`; reemplace con él el
  archivo `js/datos.js` del proyecto.

El trabajo en curso se guarda solo en el navegador: si recarga la página por accidente,
se recupera con un aviso. **Descartar y cargar js/datos.js** vuelve a lo que hay en el archivo.

**Exportar a Excel** descarga `puntos.csv` y `tramos.csv`, que se abren con Excel.

### Cambiar la imagen del plano

Por seguridad, los navegadores no dejan que una página abierta con doble clic use una
imagen suelta en el mapa; por eso la imagen va incrustada en `js/plano_imagen.js`.
Si hay un plano nuevo, use **Cambiar imagen del plano…** en el editor: elige la imagen,
la muestra y guarda `js/plano_imagen.js` (igual que con `datos.js`). Luego calíbrelo
de nuevo y pulse **Guardar**.

## Editar los datos a mano (opcional)

También se puede editar `js/datos.js` directamente.

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
