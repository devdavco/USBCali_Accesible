import {Map, setWorkerUrl} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

// MapLibre GL JS v6 + a bundler: set the worker URL once (Vite shown)
setWorkerUrl(workerUrl);

const map = new Map({
  container: 'map', // <div id="map" style="height: 400px"></div>
  style: 'https://tiles.openfreemap.org/styles/liberty',
  center: [0, 20], // [lng, lat]
  zoom: 2
});
