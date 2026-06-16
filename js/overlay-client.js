/**
 * overlay-client.js
 * Script compartido que incluyen los overlays HTML.
 * Se conecta al backend por SSE y llama a window.onOverlayState(state)
 * cada vez que hay una actualización.
 *
 * Uso en un overlay:
 *   <script src="/js/overlay-client.js"></script>
 *   <script>
 *     window.onOverlayState = function(state) { ... render ... };
 *   </script>
 */
(function () {
  const API = window.OVERLAY_API || 'http://localhost:3000';
  let lastJson = '';

  function connect() {
    const es = new EventSource(API + '/overlay-events');

    es.onmessage = function (e) {
      // Evitar re-render si los datos son idénticos
      if (e.data === lastJson) return;
      lastJson = e.data;
      try {
        const state = JSON.parse(e.data);
        if (typeof window.onOverlayState === 'function') {
          window.onOverlayState(state);
        }
      } catch (err) {
        console.error('[overlay-client] Error parseando estado:', err);
      }
    };

    es.onerror = function () {
      // Si se pierde la conexión, reintentar en 3 segundos
      es.close();
      setTimeout(connect, 3000);
    };
  }

  // Arrancar conexión cuando el DOM esté listo
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', connect);
  } else {
    connect();
  }
})();
