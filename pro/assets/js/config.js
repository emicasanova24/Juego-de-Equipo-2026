/* ============================================================
   config.js — Configuración del Panel PRO
   Editá acá los widgets disponibles y las estadísticas.
   Las rutas 'file' son relativas a la raíz del servidor; el panel
   las enlaza como Browser Source de OBS (http://localhost:3000/<file>).
   ============================================================ */

// Lista de widgets controlables desde el panel.
// key  → clave usada en state.widgets
// file → archivo del overlay (Browser Source en OBS)
const WIDGETS_CONFIG = [
  { key: 'marcador',        label: '📺 Marcador',              file: 'pro/overlays/marcador.html' },
  { key: 'cortina',         label: '🎬 Cortina',               file: 'pro/overlays/cortina.html' },
  { key: 'formaciones',     label: '👕 Formaciones titulares', file: 'pro/overlays/formaciones.html' },
  { key: 'otrosPartidos',   label: '⚽ Otros Partidos',        file: 'pro/overlays/otros-partidos.html' },
  { key: 'tablaPosiciones', label: '📊 Tabla de Posiciones',   file: 'pro/overlays/tabla.html' },
  { key: 'ticker',          label: '📰 Ticker',                file: 'pro/overlays/ticker.html' },
  { key: 'publicidad',      label: '💰 Publicidad',            file: 'pro/overlays/banner.html' },
  { key: 'estadisticas',    label: '📈 Estadísticas',          file: 'pro/overlays/stats.html' },
  { key: 'formacionPrevia', label: '🗂 Previa Formaciones',    file: 'pro/overlays/formaciones-previa.html' },
];

// Estadísticas en vivo (la posesión se maneja aparte con slider).
const STAT_KEYS = [
  { key: 'tiros',       label: 'Tiros' },
  { key: 'tirosPuerta', label: 'Al arco' },
  { key: 'corners',     label: 'Corners' },
  { key: 'faltas',      label: 'Faltas' },
  { key: 'offsides',    label: 'Offsides' },
];
