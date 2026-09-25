/* ============================================================
   panel.js — Lógica del Panel PRO (index.html)
   Requiere: config.js (WIDGETS_CONFIG, STAT_KEYS) cargado antes.
   Comunicación: REST (POST/PATCH/DELETE) + SSE (/overlay-events).
   ============================================================ */

const API = window.location.origin;

// ─── STATE ───────────────────────────────────────────
let state = null;
let allEquipos = [];
let allJugadores = [];
let equiposLogos = {};   // mapa nombre → ruta del logo (catálogo)
let resultadosData = []; // partidos cargados en "Otros Partidos"
const plantel = {
  local:     { titulares: [], suplentes: [] },
  visitante: { titulares: [], suplentes: [] }
};
const statsData = {
  local:     { posesion:50, tiros:0, tirosPuerta:0, corners:0, faltas:0, offsides:0 },
  visitante: { posesion:50, tiros:0, tirosPuerta:0, corners:0, faltas:0, offsides:0 }
};
let statsDebounce = null;
let adCountdownInterval = null;
let quickAction = null;

// ─── INIT ─────────────────────────────────────────────
async function init() {
  setWorkspaceMode(localStorage.getItem('proWorkspaceMode') || 'live');
  buildStatsGrids();
  buildWidgetsPanel();
  buildSponsorLibrary();
  await loadEquipos();
  await loadEquiposLogos();
  buildResultadosSelects();
  await fetchState();
  connectSSE();
}

async function loadEquipos() {
  try {
    const r = await fetch(API + '/equipos');
    allEquipos = await r.json();
    const opts = allEquipos.map(e => `<option value="${e.nombre}">${e.nombre}</option>`).join('');
    document.getElementById('localTeam').innerHTML    = '<option value="">— Equipo Local —</option>' + opts;
    document.getElementById('visitanteTeam').innerHTML = '<option value="">— Equipo Visitante —</option>' + opts;
  } catch(e) { console.error('Error cargando equipos:', e); }
}

async function loadEquiposLogos() {
  try {
    equiposLogos = await fetch(API + '/overlay-equipos').then(r => r.json());
  } catch(e) { console.error('Error cargando logos:', e); equiposLogos = {}; }
}

async function fetchState() {
  try {
    const r = await fetch(API + '/overlay-state');
    state = await r.json();
    renderAll(state);
    setBadge('green');
  } catch(e) { setBadge('red'); tryLoadLocal(); }
}

function connectSSE() {
  const es = new EventSource(API + '/overlay-events');
  es.onmessage = e => {
    setBadge('green');
    try {
      const data = JSON.parse(e.data);
      if (data.type === 'timer-tick') {
        applyTimer({ baseMinute: data.baseMinute, startTimestamp: data.startTimestamp, running: data.running, addedTime: data.addedTime, period: data.period });
        return;
      }
      state = data;
      renderAll(state);
    } catch(err) { console.error(err); }
  };
  es.onopen  = () => setBadge('green');
  es.onerror = () => { setBadge('red'); es.close(); setTimeout(connectSSE, 3000); };
}

function setBadge(color) {
  const el = document.getElementById('connectionBadge');
  if (color === 'green') { el.textContent = 'Conectado';    el.className = 'px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest bg-green-900 text-green-300'; }
  else                   { el.textContent = 'Desconectado'; el.className = 'px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest bg-red-900 text-red-300'; }
}

function tryLoadLocal() {
  const s = localStorage.getItem('proState');
  if (s) { try { state = JSON.parse(s); renderAll(state); } catch(e){} }
}

// ─── RENDER ALL ───────────────────────────────────────
function renderAll(s) {
  if (!s) return;
  localStorage.setItem('proState', JSON.stringify(s));

  // Status badge
  document.getElementById('matchStatusBadge').textContent = s.match?.status || 'NO INICIADO';

  // Scores
  document.getElementById('localScore').textContent     = s.local?.goles ?? 0;
  document.getElementById('visitanteScore').textContent  = s.visitante?.goles ?? 0;

  // Team selects + logos
  if (s.local?.nombre)    setSelectVal('localTeam', s.local.nombre);
  if (s.visitante?.nombre) setSelectVal('visitanteTeam', s.visitante.nombre);
  setImgSrc('logoLocalMini',    s.local?.logo);
  setImgSrc('logoVisitanteMini', s.visitante?.logo);

  // Colors
  setVal('localColor',            s.local?.color);
  setVal('localColorNumero',      s.local?.colorNumero);
  setVal('visitanteColor',        s.visitante?.color);
  setVal('visitanteColorNumero',  s.visitante?.colorNumero);

  // Match info
  setVal('matchTournament', s.match?.tournament);
  setVal('matchReferee',    s.match?.referee);
  setVal('matchStadium',    s.match?.stadium);
  setSelectVal('matchStatus', s.match?.status);

  // DT
  setVal('dtLocal',     s.dt?.local);
  setVal('dtVisitante', s.dt?.visitante);

  // Formaciones
  setSelectVal('localFormacion',    s.local?.formacion);
  setSelectVal('visitanteFormacion', s.visitante?.formacion);

  // Timer
  if (s.timer) {
    applyTimer(s.timer);
  }

  // Plantel (solo actualizar contadores sin pisar edición activa)
  if (s.local?.jugadores && plantel.local.titulares.length === 0) {
    plantel.local.titulares = JSON.parse(JSON.stringify(s.local.jugadores || []));
    plantel.local.suplentes = JSON.parse(JSON.stringify(s.local.suplentes || []));
    renderPlantel('local');
  }
  if (s.visitante?.jugadores && plantel.visitante.titulares.length === 0) {
    plantel.visitante.titulares = JSON.parse(JSON.stringify(s.visitante.jugadores || []));
    plantel.visitante.suplentes = JSON.parse(JSON.stringify(s.visitante.suplentes || []));
    renderPlantel('visitante');
  }

  // Plantel names
  document.getElementById('plantelLocalName').textContent    = s.local?.nombre    || '—';
  document.getElementById('plantelVisitanteName').textContent = s.visitante?.nombre || '—';

  // Widgets
  renderWidgets(s.widgets || {});

  // Stats
  if (s.stats) {
    Object.assign(statsData.local,     s.stats.local     || {});
    Object.assign(statsData.visitante, s.stats.visitante || {});
    renderStats();
    setEl('statsLocalName', s.local?.nombre    || 'LOCAL');
    setEl('statsVisitName', s.visitante?.nombre || 'VISITANTE');
  }

  // Ticker
  if (s.ticker) renderTicker(s.ticker.items || []);

  // Otros Partidos (sincroniza lista/título/libre sin pisar edición activa)
  syncResultados(s);
  syncCortinaBtns(s);

  // Incidencias
  renderIncidents(s.incidents || []);
  refreshIncPlayers();

  // Historial
  renderHistory(s.history || []);

  // Publicidad
  if (s.ads) {
    setVal('adSponsor',    s.ads.sponsor);
    setVal('adInterval',   s.ads.autoIntervalMin);
    updateAdBtnStates(s.ads);
    const btn = document.getElementById('btnAutoAd');
    btn.textContent  = s.ads.autoEnabled ? 'Desactivar Auto' : 'Activar Auto';
    btn.className    = s.ads.autoEnabled ? 'btn-brand px-3 py-1 rounded-sm text-xs' : 'btn-gray px-3 py-1 rounded-sm text-xs';
    if (s.ads.nextAt) updateAdCountdown(s.ads.nextAt);
  }

  renderCockpit(s);
  renderReadiness(s);
  renderBroadcastStatus(s);
  renderSetupConsole(s);
  renderContentDeck(s);
}

// ─── TIMER ────────────────────────────────────────────
const PERIOD_LABELS = { PT:'1er TIEMPO', ET:'ENTRETIEMPO', ST:'2do TIEMPO', PROL:'PRÓRROGA', PEN:'PENALES', FIN:'FINALIZADO' };

function pad(n) { return String(n).padStart(2,'0'); }

// Estado local del cronómetro. Un único reloj evita parpadeos/conflictos.
const _timer = { base: 0, startTs: null, running: false, added: 0, period: 'PT' };

function applyTimer(t) {
  if (!t) return;
  _timer.base    = t.baseMinute || 0;
  _timer.startTs = t.startTimestamp || null;
  _timer.running = !!t.running;
  _timer.added   = t.addedTime || 0;
  _timer.period  = t.period || 'PT';
  renderPanelTimer();
  if (_timer.running) startPanelTimer(); else stopPanelTimer();
}

function renderPanelTimer() {
  const liveSec = _timer.running && _timer.startTs
    ? Math.floor((Date.now() - _timer.startTs) / 1000) : 0;
  const total = _timer.base * 60 + liveSec;
  const timerText = pad(Math.floor(total / 60)) + ':' + pad(total % 60);
  document.getElementById('timerDisplay').textContent = timerText;
  document.getElementById('addedDisplay').textContent = _timer.added > 0 ? '+' + _timer.added + "' de tiempo agregado" : '';
  setEl('cockpitTimer', timerText + (_timer.added > 0 ? ' +' + _timer.added : ''));
  setEl('cockpitPeriod', PERIOD_LABELS[_timer.period] || _timer.period);
  const cockpitBtn = document.getElementById('cockpitTimerButton');
  if (cockpitBtn) {
    cockpitBtn.textContent = _timer.running ? '⏸ PAUSAR' : '▶ INICIAR';
    cockpitBtn.className = _timer.running ? 'cockpit-pause' : 'cockpit-start';
  }
  ['PT','ET','ST','PROL','PEN','FIN'].forEach(p => {
    const btn = document.getElementById('p' + p);
    if (btn) btn.classList.toggle('active', p === _timer.period);
  });
  document.getElementById('btnStart').classList.toggle('hidden', _timer.running);
  document.getElementById('btnPause').classList.toggle('hidden', !_timer.running);
}

function toggleTimerFromCockpit() {
  return _timer.running ? timerPause() : timerStart();
}

function startPanelTimer() {
  if (window._timerInterval) return;
  window._timerInterval = setInterval(renderPanelTimer, 1000);
}

function stopPanelTimer() {
  if (window._timerInterval) { clearInterval(window._timerInterval); window._timerInterval = null; }
}

async function timerStart()  { await api('POST', '/overlay-state/timer/start'); ensureWidget('marcador'); }
async function timerPause()  { await api('POST', '/overlay-state/timer/pause'); }
async function timerReset()  { if (!confirm('¿Resetear el timer?')) return; await api('POST', '/overlay-state/timer/reset'); }
async function setPeriod(p, base) {
  const effectiveBase = p === 'FIN' ? getCurrentMinute() : base;
  const statusByPeriod = { PT:'PRIMER TIEMPO', ET:'ENTRETIEMPO', ST:'SEGUNDO TIEMPO', PROL:'PRÓRROGA', PEN:'PENALES', FIN:'FINALIZADO' };
  await api('PATCH', '/overlay-state/timer/period', { period: p, baseMinute: effectiveBase });
  await api('PATCH', '/overlay-state/match', { status: statusByPeriod[p] || p });
  ensureWidget('marcador');
}
async function setAdded(v)   { await api('PATCH', '/overlay-state/timer/added', { addedTime: v }); if (v) setVal('addedCustom', v); ensureWidget('marcador'); }

async function setTimerManual() {
  const input = document.getElementById('timerManualMinute');
  const minute = Number(input?.value);
  if (!Number.isFinite(minute) || minute < 0 || minute > 180 || input?.value === '') {
    showToast('Ingresá un minuto válido entre 0 y 180.', 'error');
    input?.focus();
    return;
  }
  const running = !!document.getElementById('timerManualRunning')?.checked;
  const result = await api('PATCH', '/overlay-state/timer/set', { minute: Math.floor(minute), running });
  if (!result) return;
  input.value = '';
  ensureWidget('marcador');
  showToast(`Reloj corregido a ${Math.floor(minute)}:00${running ? ' y en marcha' : ' en pausa'}.`, 'success');
}

async function adjustTimerBy(delta) {
  const minute = Math.max(0, Math.min(180, getCurrentMinute() + delta));
  const result = await api('PATCH', '/overlay-state/timer/set', { minute, running: _timer.running });
  if (!result) return;
  ensureWidget('marcador');
  showToast(`Reloj ajustado a ${minute}:00.`, 'success');
}

// ─── MARCADOR ─────────────────────────────────────────
async function changeTeam(side) {
  const nombre = document.getElementById(side + 'Team').value;
  if (!nombre) return;
  const logos = await fetch(API + '/overlay-equipos').then(r => r.json());
  const logo = logos[nombre] || '';
  await api('PATCH', '/overlay-state/' + side, { nombre, logo });
  setImgSrc(side === 'local' ? 'logoLocalMini' : 'logoVisitanteMini', logo);
  document.getElementById('plantel' + cap(side) + 'Name').textContent = nombre;
  refreshIncPlayers();
  ensureWidget('marcador');
}

async function changeScore(side, delta) {
  const curr = side === 'local' ? (state?.local?.goles ?? 0) : (state?.visitante?.goles ?? 0);
  await api('PATCH', '/overlay-state/' + side, { goles: Math.max(0, curr + delta) });
  ensureWidget('marcador');
}

async function changeColor(side, color)       { await api('PATCH', '/overlay-state/' + side, { color }); ensureWidget('marcador'); }
async function changeNumeroColor(side, color)  { await api('PATCH', '/overlay-state/' + side, { colorNumero: color }); ensureWidget('marcador'); }
async function changeDT(side, val) {
  const patch = {}; patch[side] = val;
  await api('PATCH', '/overlay-state/dt', patch);
}
async function changeFormacion(side, formacion) { await api('PATCH', '/overlay-state/' + side, { formacion }); }
async function updateMatch() {
  await api('PATCH', '/overlay-state/match', {
    tournament: document.getElementById('matchTournament').value,
    referee:    document.getElementById('matchReferee').value,
    stadium:    document.getElementById('matchStadium').value,
    status:     document.getElementById('matchStatus').value
  });
}

// ─── PLANTEL ──────────────────────────────────────────
function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function esc(s) { return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

async function loadPlayersFromDB(side) {
  const nombre = document.getElementById(side + 'Team').value;
  if (!nombre) { alert('Primero seleccioná el equipo'); return; }
  if (!allEquipos.length) allEquipos = await fetch(API + '/equipos').then(r => r.json());
  if (!allJugadores.length) allJugadores = await fetch(API + '/jugadores').then(r => r.json());
  const equipo = allEquipos.find(e => e.nombre === nombre);
  if (!equipo) { alert('Equipo no encontrado en la base de datos'); return; }
  const players = allJugadores
    .filter(j => j.equipo_id === equipo.id)
    .map((j, i) => ({ nombre: j.nombre, numero: i + 1, goles: 0, amarilla: false, roja: false, figura: false }));
  plantel[side].titulares = players.slice(0, 11);
  plantel[side].suplentes = players.slice(11);
  renderPlantel(side);
}

function clearPlayers(side) {
  if (!confirm('¿Limpiar todo el plantel de ' + (side === 'local' ? 'local' : 'visitante') + '?')) return;
  plantel[side].titulares = [];
  plantel[side].suplentes = [];
  renderPlantel(side);
}

function renderPlantel(side) {
  const tit = plantel[side].titulares;
  const sup = plantel[side].suplentes;
  const C = cap(side);
  const formacion = (state?.[side]?.formacion) || document.getElementById(side + 'Formacion')?.value || '4-3-3';
  const posLabels = getPositionLabels(formacion);
  document.getElementById('titCount' + C).textContent = tit.length;
  document.getElementById('supCount' + C).textContent = sup.length;
  const titEl = document.getElementById('titList' + C);
  const supEl = document.getElementById('supList' + C);
  titEl.innerHTML = tit.length ? tit.map((p, i) => playerRow(side, 'tit', i, p, posLabels[i] || '')).join('') : '<p class="text-gray-600 text-xs text-center py-2">Sin titulares</p>';
  supEl.innerHTML = sup.length ? sup.map((p, i) => playerRow(side, 'sup', i, p, '')).join('') : '<p class="text-gray-600 text-xs text-center py-2">Sin suplentes</p>';
}

// Etiquetas de posición derivadas de la formación (robado del panel admin).
function getPositionLabels(formacion) {
  const parts = (formacion || '4-3-3').split('-').map(Number);
  const labels = ['ARQ'];
  const tags = ['DEF', 'MED', 'DEL', 'DEL'];
  parts.forEach((count, idx) => {
    for (let c = 0; c < count; c++) labels.push(tags[idx] || 'DEL');
  });
  return labels;
}

const POS_COLOR = { ARQ: 'text-yellow-400', DEF: 'text-blue-400', MED: 'text-green-400', DEL: 'text-red-400' };

function playerRow(side, type, idx, p, label) {
  const C = cap(side);
  const isSub = type === 'sup';
  const labelColor = POS_COLOR[label] || 'text-gray-400';
  // Marcas de sustitución: titular que entró desde el banco / suplente que salió a cancha.
  const rowBorder = (!isSub && p.entro) ? 'border-l-2 border-green-500 pl-1'
                  : (isSub && p.sustituido) ? 'border-l-2 border-red-500 pl-1 opacity-50' : '';
  const nameStrike = (isSub && p.sustituido) ? 'line-through' : '';
  return `<div class="player-row flex items-center gap-1.5 bg-gray-800 rounded-lg px-2 py-1.5 mb-1 ${rowBorder}">
    ${label ? `<span class="text-[10px] font-black uppercase w-7 text-center shrink-0 ${labelColor}">${label}</span>` : ''}
    <input type="number" value="${p.numero || ''}" min="0" max="99" placeholder="#"
      class="w-10 bg-gray-700 border border-gray-600 rounded text-xs text-center text-white shrink-0"
      onchange="updatePlayer('${side}','${type}',${idx},'numero',+this.value)">
    <input value="${esc(p.nombre)}" onchange="updatePlayer('${side}','${type}',${idx},'nombre',this.value)" class="flex-1 bg-transparent border-b border-gray-600 focus:border-purple-500 outline-none text-sm text-gray-200 min-w-0 px-1 ${nameStrike}">
    <button onclick="adjGoal('${side}','${type}',${idx},-1)" class="text-gray-500 hover:text-purple-400 text-xs w-4 shrink-0">−</button>
    <span class="text-xs text-purple-400 font-black w-4 text-center shrink-0">${p.goles || 0}</span>
    <button onclick="adjGoal('${side}','${type}',${idx},1)"  class="text-purple-400 hover:text-purple-300 text-xs w-4 shrink-0">+</button>
    <button onclick="toggleProp('${side}','${type}',${idx},'amarilla')" class="text-sm shrink-0 ${p.amarilla ? '' : 'opacity-25'}" title="Amarilla">🟨</button>
    <button onclick="toggleProp('${side}','${type}',${idx},'roja')"    class="text-sm shrink-0 ${p.roja    ? '' : 'opacity-25'}" title="Roja">🟥</button>
    <button onclick="toggleProp('${side}','${type}',${idx},'figura')"  class="text-sm shrink-0 ${p.figura  ? 'text-yellow-400' : 'text-gray-700'}" title="Figura">⭐</button>
    ${isSub && !p.sustituido ? `<button onclick="startSubstitution('${side}',${idx})" class="text-sm shrink-0 text-green-400 hover:text-green-300" title="Hacer cambio (entra por un titular)">🔄</button>` : ''}
    <button onclick="moveSide('${side}','${type}',${idx})" class="text-gray-500 hover:text-white text-xs shrink-0" title="${type === 'tit' ? '→ Suplentes' : '→ Titulares'}">↕</button>
    <button onclick="removePlayer('${side}','${type}',${idx})" class="text-red-600 hover:text-red-400 text-xs shrink-0">✕</button>
  </div>`;
}

function updatePlayer(side, type, idx, field, value) {
  const list = type === 'tit' ? plantel[side].titulares : plantel[side].suplentes;
  if (list[idx]) list[idx][field] = value;
}

function adjGoal(side, type, idx, delta) {
  const list = type === 'tit' ? plantel[side].titulares : plantel[side].suplentes;
  if (list[idx]) list[idx].goles = Math.max(0, (list[idx].goles || 0) + delta);
  renderPlantel(side);
}

function toggleProp(side, type, idx, prop) {
  const list = type === 'tit' ? plantel[side].titulares : plantel[side].suplentes;
  if (list[idx]) list[idx][prop] = !list[idx][prop];
  renderPlantel(side);
}

function moveSide(side, type, idx) {
  const from = type === 'tit' ? plantel[side].titulares : plantel[side].suplentes;
  const to   = type === 'tit' ? plantel[side].suplentes : plantel[side].titulares;
  const [player] = from.splice(idx, 1);
  if (player) to.push(player);
  renderPlantel(side);
}

function removePlayer(side, type, idx) {
  const list = type === 'tit' ? plantel[side].titulares : plantel[side].suplentes;
  list.splice(idx, 1);
  renderPlantel(side);
}

function addPlayerManual(side, listType) {
  // listType: 'titulares' o 'suplentes'
  const player = { nombre: 'Jugador', numero: plantel[side].titulares.length + plantel[side].suplentes.length + 1, goles: 0, amarilla: false, roja: false, figura: false };
  if (listType === 'suplentes') plantel[side].suplentes.push(player);
  else plantel[side].titulares.push(player);
  renderPlantel(side);
}

async function savePlayers(side) {
  await api('PATCH', '/overlay-state/' + side, {
    jugadores: plantel[side].titulares,
    suplentes: plantel[side].suplentes
  });
}

// ─── SUSTITUCIONES ────────────────────────────────────
// Abre un modal para elegir qué titular sale cuando entra un suplente.
function startSubstitution(side, suplIdx) {
  const titulares = plantel[side].titulares || [];
  const suplente  = plantel[side].suplentes[suplIdx];
  if (!suplente) return;
  const formacion = (state?.[side]?.formacion) || document.getElementById(side + 'Formacion')?.value || '4-3-3';
  const posLabels = getPositionLabels(formacion);

  let overlay = document.getElementById('subOverlay');
  if (overlay) overlay.remove();
  overlay = document.createElement('div');
  overlay.id = 'subOverlay';
  overlay.className = 'fixed inset-0 bg-black/70 z-50 flex items-center justify-center';
  overlay.innerHTML = `
    <div class="bg-gray-900 border border-gray-700 rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl">
      <h3 class="text-lg font-black text-purple-400 mb-1">Sustitución — ${side === 'local' ? 'Local' : 'Visitante'}</h3>
      <p class="text-sm text-gray-400 mb-4">Entra <span class="text-green-400 font-bold">${esc(suplente.nombre)}${suplente.numero ? ' (#' + suplente.numero + ')' : ''}</span> por:</p>
      <div class="flex flex-col gap-2 max-h-[50vh] overflow-y-auto">
        ${titulares.map((t, ti) => {
          const pl = posLabels[ti] || '';
          const plColor = POS_COLOR[pl] || '';
          return `<button onclick="confirmSubstitution('${side}',${suplIdx},${ti})"
            class="flex items-center gap-3 bg-gray-800 hover:bg-gray-700 rounded-lg px-4 py-3 text-left transition">
            <span class="text-xs font-black uppercase w-8 ${plColor}">${pl}</span>
            <span class="font-bold text-white">#${t.numero || ti + 1}</span>
            <span class="flex-1 text-gray-200">${esc(t.nombre)}</span>
          </button>`;
        }).join('')}
      </div>
      <button onclick="document.getElementById('subOverlay').remove()" class="mt-4 w-full bg-gray-800 hover:bg-gray-700 rounded-lg px-4 py-2 text-sm text-gray-400">Cancelar</button>
    </div>`;
  document.body.appendChild(overlay);
}

// Confirma el cambio: el suplente toma la posición exacta del titular,
// el titular pasa al banco marcado como sustituido, y se genera la incidencia + alerta.
async function confirmSubstitution(side, suplIdx, titIdx) {
  const titular  = plantel[side].titulares[titIdx];
  const suplente = plantel[side].suplentes[suplIdx];
  if (!titular || !suplente) return;

  const entra = suplente.nombre;
  const sale  = titular.nombre;

  // Suplente entra en la posición exacta del titular.
  suplente.entro = true;
  delete suplente.sustituido;
  plantel[side].titulares[titIdx] = suplente;

  // Titular sale al banco marcado como sustituido.
  titular.sustituido = true;
  delete titular.entro;
  plantel[side].suplentes.splice(suplIdx, 1);
  plantel[side].suplentes.push(titular);

  const overlay = document.getElementById('subOverlay');
  if (overlay) overlay.remove();

  renderPlantel(side);
  await savePlayers(side);

  // Incidencia automática (alimenta el banner del marcador, el listado y el historial).
  const minute = getCurrentMinute();
  await api('POST', '/overlay-state/incidents', { type: 'cambio', team: side, player: entra, playerOut: sale, minute });
  ensureWidget('marcador');
  showLiveAlert('cambio', side, entra, sale, minute);
}

function getCurrentMinute() {
  const liveSec = _timer.running && _timer.startTs ? Math.floor((Date.now() - _timer.startTs) / 1000) : 0;
  return _timer.base + Math.floor(liveSec / 60);
}

// Banner de incidencia en vivo, debajo del header del panel.
let _liveAlertTimer = null;
function showLiveAlert(type, side, player, playerOut, minute) {
  const bar = document.getElementById('liveAlertBar');
  if (!bar) return;
  const icons = { gol: '⚽', amarilla: '🟨', roja: '🟥', cambio: '🔄', var: '📺' };
  const teamName = side === 'local' ? (state?.local?.nombre || 'Local') : (state?.visitante?.nombre || 'Visitante');
  const accent = side === 'local' ? 'border-purple-500' : 'border-cyan-500';
  const detail = type === 'cambio'
    ? `<span class="text-green-400 font-black">▲ ${esc(player)}</span><span class="text-gray-500">entra por</span><span class="text-red-400 font-black">▼ ${esc(playerOut)}</span>`
    : `<span class="text-white font-black">${esc(player)}</span>`;
  bar.innerHTML = `
    <div class="flex items-center gap-3 bg-gray-900 border-l-4 ${accent} rounded-xl px-5 py-3 shadow-lg">
      <span class="text-2xl">${icons[type] || '•'}</span>
      <span class="text-xs font-black uppercase tracking-widest text-gray-400">${type}</span>
      <span class="text-xs text-gray-500 uppercase">${esc(teamName)}</span>
      <div class="flex items-center gap-2 flex-1 text-sm">${detail}</div>
      <span class="text-purple-400 font-black">${minute !== undefined ? minute + "'" : ''}</span>
      <button onclick="document.getElementById('liveAlertBar').classList.add('hidden')" class="text-gray-600 hover:text-white text-sm">✕</button>
    </div>`;
  bar.classList.remove('hidden');
  if (_liveAlertTimer) clearTimeout(_liveAlertTimer);
  _liveAlertTimer = setTimeout(() => bar.classList.add('hidden'), 12000);
}

// ─── INCIDENCIAS ──────────────────────────────────────
function togglePlayerOut() {
  const isCambio = document.getElementById('incType').value === 'cambio';
  document.getElementById('changeOutRow').classList.toggle('hidden', !isCambio);
  const lbl = document.getElementById('incPlayerLabel');
  if (lbl) {
    lbl.textContent = isCambio ? '▲ Entra' : 'Jugador';
    lbl.className = isCambio ? 'block text-xs mb-1 uppercase font-bold text-green-400' : 'block text-xs text-gray-400 mb-1 uppercase';
  }
}

function refreshIncPlayers() {
  if (!state) return;
  const team = document.getElementById('incTeam')?.value || 'local';
  const all  = [...(state[team]?.jugadores || []), ...(state[team]?.suplentes || [])];
  const opts = '<option value="">— Seleccionar —</option>' + all.map(p => `<option value="${p.nombre}">${p.numero ? p.numero + ' - ' : ''}${p.nombre}</option>`).join('');
  document.getElementById('incPlayer').innerHTML    = opts;
  document.getElementById('incPlayerOut').innerHTML = opts;
}

function refreshDestPlayers() {
  if (!state) return;
  const team = document.getElementById('destTeam')?.value || 'local';
  const players = state[team]?.jugadores || [];
  document.getElementById('destPlayer').innerHTML = '<option value="">— Jugador —</option>' + players.map(p => `<option value="${p.nombre}">${p.numero ? p.numero + ' - ' : ''}${p.nombre}</option>`).join('');
}

async function addIncident() {
  const type      = document.getElementById('incType').value;
  const team      = document.getElementById('incTeam').value;
  const player    = document.getElementById('incPlayer').value;
  const playerOut = document.getElementById('incPlayerOut').value;
  const minuteRaw = document.getElementById('incMinute').value;
  const minute    = minuteRaw !== '' ? parseInt(minuteRaw) : getCurrentMinute();
  await api('POST', '/overlay-state/incidents', { type, team, player, playerOut, minute });
  document.getElementById('incMinute').value = '';
  ensureWidget('marcador');
}

async function removeIncident(id) { await api('DELETE', '/overlay-state/incidents/' + id); }

let _lastIncidentId = null;
let _incidentsInit = false;
function renderIncidents(incidents) {
  const el = document.getElementById('incidentList');
  // Mostrar banner debajo del header cuando llega una incidencia nueva (también vía SSE).
  const latest = incidents && incidents.length ? incidents[0] : null;
  if (latest && latest.id !== _lastIncidentId) {
    if (_incidentsInit) showLiveAlert(latest.type, latest.team, latest.player, latest.playerOut, latest.minute);
    _lastIncidentId = latest.id;
  }
  _incidentsInit = true;
  if (!incidents?.length) { el.innerHTML = '<p class="text-gray-600 text-xs text-center">Sin incidencias</p>'; return; }
  const icons = { gol:'⚽', amarilla:'🟨', roja:'🟥', cambio:'🔄', var:'📺' };
  const labels = { gol:'Gol', amarilla:'Amarilla', roja:'Roja', cambio:'Cambio', var:'VAR' };
  el.innerHTML = incidents.slice(0, 30).map(inc => {
    const min       = inc.minute !== undefined ? inc.minute + "'" : '–';
    const accent    = inc.team === 'local' ? 'border-purple-500' : 'border-cyan-500';
    const teamColor = inc.team === 'local' ? 'text-purple-300'    : 'text-cyan-300';
    const teamName  = inc.team === 'local' ? (state?.local?.nombre || 'Local') : (state?.visitante?.nombre || 'Visitante');
    const body = inc.type === 'cambio'
      ? `<div class="flex flex-col gap-0.5 flex-1 min-w-0">
           <span class="flex items-center gap-1.5 text-green-400 font-bold truncate"><span class="text-sm">▲</span>${esc(inc.player) || '—'}</span>
           <span class="flex items-center gap-1.5 text-red-400 font-bold truncate"><span class="text-sm">▼</span>${esc(inc.playerOut) || '—'}</span>
         </div>`
      : `<span class="font-bold text-white truncate flex-1">${esc(inc.player) || '—'}</span>`;
    return `<div class="flex items-center gap-3 bg-gray-800 rounded-lg px-3 py-2 text-xs border-l-2 ${accent}">
      <div class="flex flex-col items-center justify-center shrink-0 w-10">
        <span class="text-lg leading-none">${icons[inc.type] || '•'}</span>
        <span class="text-purple-400 font-black mt-0.5 text-[11px]">${min}</span>
      </div>
      <div class="flex flex-col gap-0.5 flex-1 min-w-0">
        <span class="text-[10px] font-black uppercase tracking-wider ${teamColor} truncate">${labels[inc.type] || inc.type} · ${esc(teamName)}</span>
        ${body}
      </div>
      <button onclick="removeIncident('${inc.id}')" class="text-red-500 hover:text-red-400 shrink-0" title="Eliminar">✕</button>
    </div>`;
  }).join('');
}

// ─── WIDGETS ─────────────────────────────────────────
function buildWidgetsPanel() {
  document.getElementById('widgetsPanel').innerHTML = WIDGETS_CONFIG.map(w => `
    <div class="flex items-center justify-between bg-gray-800 rounded-lg px-3 py-2">
      <div class="min-w-0">
        <span class="text-sm font-medium">${w.label}</span>
        <a href="/${w.file}" target="_blank" class="block text-xs text-gray-500 hover:text-purple-400 truncate">${w.file}</a>
      </div>
      <button id="widget-${w.key}" onclick="toggleWidget('${w.key}')" class="toggle-switch ml-2">
        <span class="toggle-knob"></span>
      </button>
    </div>`).join('');
}

function renderWidgets(widgets) {
  WIDGETS_CONFIG.forEach(w => {
    const btn = document.getElementById('widget-' + w.key);
    if (btn) btn.classList.toggle('on', !!widgets[w.key]);
    const hdrBtn = document.getElementById('hdr-widget-' + w.key);
    if (hdrBtn) hdrBtn.classList.toggle('on', !!widgets[w.key]);
  });
}

async function toggleWidget(key) {
  const current = state?.widgets?.[key] || false;
  await api('PATCH', '/overlay-state/widgets', { [key]: !current });
}

// ─── OTROS PARTIDOS ───────────────────────────────────
function buildResultadosSelects() {
  const opts = (allEquipos || []).map(e => `<option value="${e.nombre}">${e.nombre}</option>`).join('');
  const local = document.getElementById('resLocal');
  const visit = document.getElementById('resVisitante');
  const libre = document.getElementById('resLibre');
  if (local) local.innerHTML = '<option value="">— Local —</option>' + opts;
  if (visit) visit.innerHTML = '<option value="">— Visitante —</option>' + opts;
  if (libre) libre.innerHTML = '<option value="">— Sin equipo libre —</option>' + opts;
}

function addResultado() {
  const local     = document.getElementById('resLocal').value;
  const visitante = document.getElementById('resVisitante').value;
  if (!local || !visitante) { alert('Elegí ambos equipos.'); return; }
  if (local === visitante)  { alert('Los equipos deben ser distintos.'); return; }
  resultadosData.push({
    local,
    logoLocal: equiposLogos[local] || '',
    gl: Number(document.getElementById('resGl').value) || 0,
    visitante,
    logoVisitante: equiposLogos[visitante] || '',
    gv: Number(document.getElementById('resGv').value) || 0
  });
  // Reset de los campos para el próximo
  document.getElementById('resLocal').value = '';
  document.getElementById('resVisitante').value = '';
  document.getElementById('resGl').value = 0;
  document.getElementById('resGv').value = 0;
  renderResultadosList();
  saveResultados();
}

function removeResultado(i) {
  resultadosData.splice(i, 1);
  renderResultadosList();
  saveResultados();
}

function renderResultadosList() {
  const cont = document.getElementById('resultadosList');
  if (!cont) return;
  if (resultadosData.length === 0) {
    cont.innerHTML = '<p class="text-gray-600 text-xs text-center">Sin partidos cargados</p>';
    return;
  }
  const btnCls = 'w-5 h-5 flex items-center justify-center rounded text-xs font-black leading-none flex-shrink-0';
  cont.innerHTML = resultadosData.map((p, i) => `
    <div class="flex items-center gap-1 bg-gray-800 rounded px-2 py-1.5 text-xs">
      <span class="flex-1 text-right truncate text-gray-200">${p.local}</span>
      <div class="flex items-center gap-0.5 flex-shrink-0">
        <button onclick="changeResultadoScore(${i},'gl',-1)" class="${btnCls} bg-gray-700 hover:bg-gray-600 text-gray-300">−</button>
        <strong class="w-5 text-center text-purple-300 tabular-nums">${p.gl ?? 0}</strong>
        <button onclick="changeResultadoScore(${i},'gl',1)"  class="${btnCls} bg-purple-800 hover:bg-purple-700 text-white">+</button>
        <span class="text-gray-500 px-0.5">-</span>
        <button onclick="changeResultadoScore(${i},'gv',-1)" class="${btnCls} bg-gray-700 hover:bg-gray-600 text-gray-300">−</button>
        <strong class="w-5 text-center text-purple-300 tabular-nums">${p.gv ?? 0}</strong>
        <button onclick="changeResultadoScore(${i},'gv',1)"  class="${btnCls} bg-purple-800 hover:bg-purple-700 text-white">+</button>
      </div>
      <span class="flex-1 truncate text-gray-200">${p.visitante}</span>
      <button onclick="removeResultado(${i})" class="text-red-400 hover:text-red-300 ml-1 font-black flex-shrink-0 text-[10px]">✕</button>
    </div>`).join('');
}

function changeResultadoScore(i, field, delta) {
  const p = resultadosData[i];
  if (!p) return;
  p[field] = Math.max(0, (p[field] ?? 0) + delta);
  renderResultadosList();
  saveResultados();
}

async function saveResultados() {
  const titulo = document.getElementById('resTitulo')?.value || '';
  const libre  = document.getElementById('resLibre')?.value || '';
  await api('PUT', '/overlay-state/resultados', { resultados: resultadosData, libre, titulo });
}

// Refleja en el panel los resultados/libre/título del estado, sin interrumpir
// la edición que el usuario pueda estar haciendo en un campo enfocado.
function syncResultados(s) {
  const sig = JSON.stringify(s.resultados || []);
  if (sig !== JSON.stringify(resultadosData)) {
    resultadosData = JSON.parse(sig);
    renderResultadosList();
  }
  const tituloEl = document.getElementById('resTitulo');
  if (tituloEl && document.activeElement !== tituloEl) {
    tituloEl.value = s.resultadosTitulo || '';
  }
  const libreEl = document.getElementById('resLibre');
  if (libreEl && document.activeElement !== libreEl) {
    libreEl.value = s.libre || '';
  }
}

// ─── CORTINA ──────────────────────────────────────────
function syncCortinaBtns(s) {
  const isOn = !!s.widgets?.cortina;
  const mode = s.cortina?.mode || 'entretiempo';
  ['inicio', 'entretiempo', 'final'].forEach(m => {
    const btn = document.getElementById('cortinaBtn-' + m);
    if (!btn) return;
    const active = isOn && mode === m;
    btn.style.cssText = active
      ? 'flex:1;padding:8px 4px;font-size:11px;font-weight:900;text-transform:uppercase;background:#7c3aed;color:#fff;border:1px solid #6d28d9;cursor:pointer;border-radius:2px'
      : 'flex:1;padding:8px 4px;font-size:11px;font-weight:900;text-transform:uppercase;background:#374151;color:#9ca3af;border:1px solid #4b5563;cursor:pointer;border-radius:2px';
  });
}

async function setCortinaModo(mode) {
  const isOn = !!state?.widgets?.cortina;
  const currentMode = state?.cortina?.mode;
  if (isOn && currentMode === mode) {
    await api('PATCH', '/overlay-state/widgets', { cortina: false });
  } else {
    await api('PATCH', '/overlay-state/cortina', { mode });
    await api('PATCH', '/overlay-state/widgets', { cortina: true });
  }
}

// ─── PUBLICIDAD ───────────────────────────────────────
const _adLogos = {};
function cacheAdLogo(type, url) { _adLogos[type] = url; }

// ── Multi-banner list ──
function renderBannersList(ads) {
  const banners  = ads?.banners || [];
  const activeId = ads?.activeBannerId;
  const isOn     = ads?.active && ads?.current === 'banner';
  const container = document.getElementById('bannersList');
  if (!container) return;
  if (banners.length === 0) {
    container.innerHTML = '<p class="text-gray-600 text-xs text-center py-2">Sin banners cargados</p>';
    return;
  }
  container.innerHTML = banners.map(b => {
    const active = isOn && activeId === b.id;
    const btnStyle = active
      ? 'padding:3px 12px;font-size:11px;font-weight:900;text-transform:uppercase;background:#7c3aed;color:#fff;border:1px solid #6d28d9;border-radius:2px;cursor:pointer;flex-shrink:0'
      : 'padding:3px 12px;font-size:11px;font-weight:900;text-transform:uppercase;background:#374151;color:#9ca3af;border:1px solid #4b5563;border-radius:2px;cursor:pointer;flex-shrink:0';
    const rowStyle = active ? 'background:#1e1b4b;border:1px solid #4c1d95;border-radius:4px;padding:6px 10px;display:flex;align-items:center;gap:8px' : 'background:#1f2937;border:1px solid #374151;border-radius:4px;padding:6px 10px;display:flex;align-items:center;gap:8px';
    return `<div style="${rowStyle}">
      <span style="font-size:11px;color:#d1d5db;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escHtml(b.url)}">${escHtml(b.name)}</span>
      <button onclick="activateBanner('${b.id}')" style="${btnStyle}">${active ? 'ON' : 'OFF'}</button>
      <button onclick="deleteBanner('${b.id}')" style="font-size:14px;color:#f87171;background:none;border:none;cursor:pointer;flex-shrink:0;line-height:1" title="Eliminar">×</button>
    </div>`;
  }).join('');
}

function escHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

async function activateBanner(id) {
  const banners  = state?.ads?.banners || [];
  const isActive = state?.ads?.active && state?.ads?.current === 'banner' && state?.ads?.activeBannerId === id;
  if (isActive) {
    await api('PATCH', '/overlay-state/ads', { active: false, current: null, activeBannerId: null, logoBanner: '' });
    await api('PATCH', '/overlay-state/widgets', { publicidad: false });
  } else {
    const banner = banners.find(b => b.id === id);
    if (!banner) return;
    await api('PATCH', '/overlay-state/ads', { active: true, current: 'banner', activeBannerId: id, logoBanner: banner.url, logoSponsor: banner.url });
    await api('PATCH', '/overlay-state/widgets', { publicidad: true });
  }
}

async function addBanner() {
  const nameEl = document.getElementById('newBannerName');
  const urlEl  = document.getElementById('newBannerUrl');
  const addBtn = document.querySelector('button[onclick="addBanner()"]');
  const name   = nameEl?.value.trim();
  const url    = urlEl?.value.trim();
  if (!name || !url) {
    if (nameEl && !name) nameEl.style.outline = '2px solid #f87171';
    if (urlEl  && !url)  urlEl.style.outline  = '2px solid #f87171';
    return;
  }
  if (nameEl) nameEl.style.outline = '';
  if (urlEl)  urlEl.style.outline  = '';
  if (addBtn) { addBtn.textContent = '…'; addBtn.disabled = true; }
  const banners = [...(state?.ads?.banners || []), { id: Date.now().toString(), name, url }];
  await api('PATCH', '/overlay-state/ads', { banners });
  if (nameEl) nameEl.value = '';
  if (urlEl)  urlEl.value  = '';
  if (addBtn) { addBtn.textContent = '+'; addBtn.disabled = false; }
}

async function deleteBanner(id) {
  const banners = (state?.ads?.banners || []).filter(b => b.id !== id);
  const patch = { banners };
  if (state?.ads?.activeBannerId === id) {
    Object.assign(patch, { activeBannerId: null, active: false, current: null, logoBanner: '' });
    await api('PATCH', '/overlay-state/widgets', { publicidad: false });
  }
  await api('PATCH', '/overlay-state/ads', patch);
}

async function toggleAdType(type) {
  const isActive = state?.ads?.active && state?.ads?.current === type;
  if (isActive) {
    await api('PATCH', '/overlay-state/ads', { active: false, current: null });
    await api('PATCH', '/overlay-state/widgets', { publicidad: false });
  } else {
    const logoUrl = _adLogos[type] || document.getElementById('adLogo' + cap(type))?.value || '';
    const sponsor = document.getElementById('adSponsor')?.value || '';
    await api('PATCH', '/overlay-state/ads', { active: true, current: type, logoSponsor: logoUrl, sponsor });
    await api('PATCH', '/overlay-state/widgets', { publicidad: true });
  }
}

function updateAdBtnStates(ads) {
  renderBannersList(ads);
  ['cortina','overlay'].forEach(type => {
    const btn = document.getElementById('ad' + cap(type) + 'Btn');
    if (!btn) return;
    const active = ads?.active && ads?.current === type;
    btn.textContent = active ? 'ON' : 'OFF';
    btn.style.cssText = active
      ? 'padding:4px 14px;font-size:11px;font-weight:900;text-transform:uppercase;background:#7c3aed;color:#fff;border:1px solid #6d28d9;cursor:pointer;flex-shrink:0;margin-left:auto'
      : 'padding:4px 14px;font-size:11px;font-weight:900;text-transform:uppercase;background:#374151;color:#9ca3af;border:1px solid #4b5563;cursor:pointer;flex-shrink:0;margin-left:auto';
  });
}

async function setAd(type)  { await api('PATCH', '/overlay-state/ads', { active: true, current: type }); await api('PATCH', '/overlay-state/widgets', { publicidad: true }); }
async function clearAd()    { await api('PATCH', '/overlay-state/ads', { active: false, current: null }); await api('PATCH', '/overlay-state/widgets', { publicidad: false }); }
async function updateAdSponsor() {
  await api('PATCH', '/overlay-state/ads', {
    sponsor:     document.getElementById('adSponsor').value,
    logoSponsor: _adLogos[state?.ads?.current] || ''
  });
}
async function toggleAutoAd() {
  const current  = state?.ads?.autoEnabled || false;
  const interval = parseInt(document.getElementById('adInterval').value) || 10;
  await api('PATCH', '/overlay-state/ads', { autoEnabled: !current, autoIntervalMin: interval });
}
function updateAdCountdown(nextAt) {
  if (adCountdownInterval) clearInterval(adCountdownInterval);
  function tick() {
    const rem = Math.max(0, Math.floor((nextAt - Date.now()) / 1000));
    document.getElementById('adNextLabel').textContent = rem > 0
      ? `Próxima inserción en ${Math.floor(rem/60)}:${(rem%60).toString().padStart(2,'0')}`
      : 'Próxima inserción ahora';
  }
  tick(); adCountdownInterval = setInterval(tick, 1000);
}

// ─── ESTADÍSTICAS ─────────────────────────────────────
function buildStatsGrids() {
  const grid = document.getElementById('statsUnifiedGrid');
  if (!grid) return;
  grid.innerHTML = STAT_KEYS.map(s => `
    <div class="grid items-center gap-1 px-1" style="grid-template-columns:auto 1fr auto">
      <div class="flex items-center gap-1">
        <button onclick="adjStat('local','${s.key}',-1)" class="bg-gray-700 w-5 h-5 rounded text-xs flex items-center justify-center">−</button>
        <span id="st-local-${s.key}" class="text-sm font-bold w-6 text-center text-purple-300">0</span>
        <button onclick="adjStat('local','${s.key}',1)"  class="bg-purple-700 w-5 h-5 rounded text-xs flex items-center justify-center">+</button>
      </div>
      <span class="text-[10px] text-gray-400 text-center uppercase tracking-wider">${s.label}</span>
      <div class="flex items-center gap-1 justify-end">
        <button onclick="adjStat('visitante','${s.key}',-1)" class="bg-gray-700 w-5 h-5 rounded text-xs flex items-center justify-center">−</button>
        <span id="st-visitante-${s.key}" class="text-sm font-bold w-6 text-center text-cyan-300">0</span>
        <button onclick="adjStat('visitante','${s.key}',1)"  class="bg-purple-700 w-5 h-5 rounded text-xs flex items-center justify-center">+</button>
      </div>
    </div>`).join('');
}

function updatePosesion(val) {
  const v = parseInt(val);
  statsData.local.posesion     = v;
  statsData.visitante.posesion = 100 - v;
  document.getElementById('posLocalLabel').textContent = (state?.local?.nombre || 'LOCAL') + ' ' + v + '%';
  document.getElementById('posVisitLabel').textContent = (100 - v) + '% ' + (state?.visitante?.nombre || 'VISITANTE');
  debounceStats();
}

function adjStat(team, key, delta) {
  statsData[team][key] = Math.max(0, (statsData[team][key] || 0) + delta);
  renderStats();
  debounceStats();
}

function debounceStats() { clearTimeout(statsDebounce); statsDebounce = setTimeout(() => { api('PATCH', '/overlay-state/stats', { local: statsData.local, visitante: statsData.visitante }); ensureWidget('estadisticas'); }, 800); }

function renderStats() {
  STAT_KEYS.forEach(s => {
    setEl('st-local-' + s.key,     statsData.local[s.key] ?? 0);
    setEl('st-visitante-' + s.key, statsData.visitante[s.key] ?? 0);
  });
  const sl = document.getElementById('posesionSlider');
  if (sl) sl.value = statsData.local.posesion ?? 50;
  const posL = statsData.local.posesion ?? 50;
  document.getElementById('posLocalLabel').textContent = (state?.local?.nombre || 'LOCAL') + ' ' + posL + '%';
  document.getElementById('posVisitLabel').textContent = (statsData.visitante.posesion ?? 50) + '% ' + (state?.visitante?.nombre || 'VISITANTE');
  const bl = document.getElementById('posBarLocal');
  const bv = document.getElementById('posBarVisit');
  if (bl) bl.style.width = posL + '%';
  if (bv) bv.style.width = (100 - posL) + '%';
}

async function saveDestacado() {
  const team   = document.getElementById('destTeam').value;
  const nombre = document.getElementById('destPlayer').value;
  const stat   = document.getElementById('destStat').value;
  const numero = state?.[team]?.jugadores?.find(j => j.nombre === nombre)?.numero || null;
  await api('PATCH', '/overlay-state/stats', { jugadorDestacado: { team, nombre, numero, stat } });
}

// ─── TICKER ───────────────────────────────────────────
async function addTickerItem() {
  const input = document.getElementById('tickerInput');
  const text  = input.value.trim();
  if (!text) return;
  const items = [...(state?.ticker?.items || []), text];
  await api('PATCH', '/overlay-state/ticker', { items });
  input.value = '';
  ensureWidget('ticker');
}
async function removeTickerItem(idx) {
  const items = [...(state?.ticker?.items || [])];
  items.splice(idx, 1);
  await api('PATCH', '/overlay-state/ticker', { items });
}
function renderTicker(items) {
  const el = document.getElementById('tickerList');
  if (!items?.length) { el.innerHTML = '<p class="text-gray-600 text-xs text-center">Sin items</p>'; return; }
  el.innerHTML = items.map((item, i) => `
    <div class="flex items-center gap-2 bg-gray-800 rounded px-2 py-1 text-xs">
      <span class="flex-1 text-gray-300">${item}</span>
      <button onclick="removeTickerItem(${i})" class="text-red-500 hover:text-red-400 shrink-0">✕</button>
    </div>`).join('');
}

// ─── HISTORIAL ────────────────────────────────────────
function renderHistory(history) {
  const el = document.getElementById('historyList');
  if (!history?.length) { el.innerHTML = '<p class="text-gray-600 text-center">Sin acciones</p>'; return; }
  const labels = { 'timer-start':'▶ Timer', 'timer-pause':'⏸ Pausa', 'timer-reset':'↺ Reset', 'timer-period':'📌 Período', 'timer-set':'✎ Reloj corregido', incident:'📋 Incidencia', emergency:'🚨 Emergencia' };
  el.innerHTML = history.slice(0, 30).map(h => {
    const time   = new Date(h.timestamp).toLocaleTimeString('es-AR', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
    const label  = labels[h.action] || h.action;
    const detail = h.payload?.type ? ' · ' + h.payload.type : h.payload?.period ? ' · ' + h.payload.period : '';
    return `<div class="flex gap-2 py-1 border-b border-gray-800 text-xs">
      <span class="text-gray-600 w-16 shrink-0">${time}</span>
      <span class="text-gray-400">${label}${detail}</span>
    </div>`;
  }).join('');
}

// ─── CONSOLAS PROFESIONALES ─────────────────────────
const CONTENT_WIDGET_KEYS = ['publicidad', 'cortina', 'ticker', 'otrosPartidos', 'tablaPosiciones', 'formacionPrevia'];
const ALL_OUTPUT_WIDGET_KEYS = ['marcador', 'formaciones', 'otrosPartidos', 'tablaPosiciones', 'ticker', 'publicidad', 'estadisticas', 'formacionPrevia', 'cortina'];

function buildSponsorLibrary() {
  const el = document.getElementById('sponsorLibrary');
  if (!el) return;
  el.innerHTML = Array.from({ length: 19 }, (_, i) => i + 1).map(n => `
    <button id="sponsorAsset-${n}" onclick="activateSponsorAsset(${n})" title="Enviar sponsor ${n} al aire">
      <img src="/pro/sponsor/${n}.png" alt="Sponsor ${n}">
      <em>${n}</em>
    </button>`).join('');
}

async function activateSponsorAsset(number) {
  const path = `/pro/sponsor/${number}.png`;
  const isActive = state?.widgets?.publicidad && state?.ads?.active && state?.ads?.logoBanner === path;
  if (isActive) {
    await clearAd();
    showToast('Banner retirado de pantalla.');
    return;
  }
  await api('PATCH', '/overlay-state/widgets', { cortina: false, publicidad: true });
  await api('PATCH', '/overlay-state/ads', {
    active: true,
    current: 'banner',
    activeBannerId: 'library-' + number,
    logoBanner: path,
    logoSponsor: path,
    sponsor: document.getElementById('adSponsor')?.value || `Sponsor ${number}`
  });
  showToast('Sponsor enviado al aire.', 'success');
}

async function controlContentModule(key) {
  if (!state) return;
  if (key === 'banner') {
    const active = state.widgets?.publicidad && state.ads?.active && ['banner', 'overlay'].includes(state.ads?.current);
    if (active) return clearAd();
    if (state.ads?.logoBanner || state.ads?.logoSponsor) {
      await api('PATCH', '/overlay-state/widgets', { cortina: false, publicidad: true });
      await api('PATCH', '/overlay-state/ads', { active: true, current: 'banner' });
    } else {
      showToast('Elegí primero un sponsor de la biblioteca.', 'error');
      document.getElementById('sponsorLibrary')?.scrollIntoView({ behavior:'smooth', block:'center' });
    }
    return;
  }
  if (key === 'cortina') {
    if (state.widgets?.cortina) return api('PATCH', '/overlay-state/widgets', { cortina: false });
    await api('PATCH', '/overlay-state/widgets', {
      publicidad:false, ticker:false, otrosPartidos:false, tablaPosiciones:false, formacionPrevia:false, cortina:true
    });
    await api('PATCH', '/overlay-state/ads', { active:false, current:null });
    await api('PATCH', '/overlay-state/cortina', { mode:'entretiempo' });
    return;
  }
  const next = !state.widgets?.[key];
  const patch = { [key]: next };
  if (next) patch.cortina = false;
  await api('PATCH', '/overlay-state/widgets', patch);
}

async function stopAllContent(silent = false) {
  const patch = Object.fromEntries(CONTENT_WIDGET_KEYS.map(key => [key, false]));
  await api('PATCH', '/overlay-state/widgets', patch);
  await api('PATCH', '/overlay-state/ads', { active:false, current:null });
  if (!silent) showToast('Todo el contenido complementario quedó fuera del aire.');
}

function renderContentDeck(s) {
  const active = {
    banner: !!(s.widgets?.publicidad && s.ads?.active && ['banner','overlay'].includes(s.ads?.current)),
    cortina: !!s.widgets?.cortina,
    ticker: !!s.widgets?.ticker,
    otrosPartidos: !!s.widgets?.otrosPartidos,
    tablaPosiciones: !!s.widgets?.tablaPosiciones,
    formacionPrevia: !!s.widgets?.formacionPrevia
  };
  Object.entries(active).forEach(([key, on]) => {
    const btn = document.getElementById('deck-' + key);
    if (!btn) return;
    btn.classList.toggle('active', on);
    const badge = btn.querySelector('.deck-status');
    if (badge) badge.textContent = on ? 'AL AIRE' : 'OFF';
  });
  for (let n = 1; n <= 19; n++) {
    const btn = document.getElementById('sponsorAsset-' + n);
    const path = `/pro/sponsor/${n}.png`;
    if (btn) btn.classList.toggle('active', active.banner && (s.ads?.logoBanner === path || s.ads?.logoSponsor === path));
  }
  const collisions = [];
  if (active.cortina && Object.entries(active).some(([key, on]) => key !== 'cortina' && on)) collisions.push('La cortina completa está activa junto con otro contenido.');
  const warning = document.getElementById('contentCollisionWarning');
  if (warning) {
    warning.textContent = collisions.join(' ');
    warning.classList.toggle('hidden', collisions.length === 0);
  }
}

async function setBroadcastPreset(preset) {
  const widgets = Object.fromEntries(ALL_OUTPUT_WIDGET_KEYS.map(key => [key, false]));
  if (preset === 'match') widgets.marcador = true;
  if (preset === 'stats') { widgets.marcador = true; widgets.estadisticas = true; }
  if (preset === 'halftime') widgets.cortina = true;
  if (preset === 'lineups') widgets.formaciones = true;
  await api('PATCH', '/overlay-state/widgets', widgets);
  await api('PATCH', '/overlay-state/ads', { active:false, current:null });
  if (preset === 'halftime') await api('PATCH', '/overlay-state/cortina', { mode:'entretiempo' });
  const names = { match:'Partido', stats:'Estadísticas', halftime:'Entretiempo', lineups:'Formaciones', clean:'Salida limpia' };
  showToast(`Modo ${names[preset] || preset} activado.`, 'success');
}

function renderBroadcastStatus(s) {
  const el = document.getElementById('onAirSummary');
  if (!el) return;
  const labels = { marcador:'Marcador', formaciones:'Formaciones', otrosPartidos:'Resultados', tablaPosiciones:'Tabla', ticker:'Ticker', publicidad:'Sponsor', estadisticas:'Estadísticas', formacionPrevia:'Previa', cortina:'Cortina' };
  const active = Object.entries(s.widgets || {}).filter(([key, value]) => value && labels[key]).map(([key]) => labels[key]);
  el.classList.toggle('clean', active.length === 0);
  el.classList.toggle('emergency', !!s.emergencyMode);
  const label = s.emergencyMode ? 'EMERGENCIA: salida oculta' : active.length ? `Al aire: ${active.join(' + ')}` : 'Salida limpia: sin gráficos';
  el.querySelector('strong').textContent = label;
}

function renderSetupConsole(s) {
  const teamsOk = !!(s.local?.nombre && s.visitante?.nombre);
  const localCount = (s.local?.jugadores || []).filter(p => p.nombre?.trim()).length;
  const visitCount = (s.visitante?.jugadores || []).filter(p => p.nombre?.trim()).length;
  const lineupsOk = localCount >= 11 && visitCount >= 11;
  const previewOn = !!s.widgets?.formacionPrevia;
  const steps = [
    { id:'setupStepTeams', ok:teamsOk, label:teamsOk ? 'LISTO' : 'REVISAR' },
    { id:'setupStepLineups', ok:lineupsOk, label:lineupsOk ? 'LISTO' : `${localCount}/${visitCount}` },
    { id:'setupStepOutput', ok:previewOn, label:previewOn ? 'AL AIRE' : 'OFF' }
  ];
  steps.forEach(step => {
    const el = document.getElementById(step.id);
    if (!el) return;
    el.classList.toggle('complete', step.ok);
    const badge = el.querySelector('b');
    if (badge) badge.textContent = step.label;
  });
  const guidance = document.getElementById('setupGuidance');
  if (guidance) guidance.textContent = teamsOk && lineupsOk
    ? 'La base del partido está lista. Podés mostrar la previa o pasar al control en vivo.'
    : !teamsOk ? 'Primero elegí ambos equipos y completá los datos del partido.' : 'Revisá que ambos equipos tengan al menos 11 titulares con nombre.';
}

function focusSetupCard(target) {
  const card = document.querySelector(`[data-setup-target="${target}"]`);
  if (!card) return;
  card.scrollIntoView({ behavior:'smooth', block:'start' });
  card.classList.remove('setup-focus');
  requestAnimationFrame(() => card.classList.add('setup-focus'));
}

async function saveAllPlayers() {
  await Promise.all([savePlayers('local'), savePlayers('visitante')]);
  showToast('Los dos planteles fueron guardados en pantalla.', 'success');
}

async function goLiveFromSetup() {
  if (!state?.local?.nombre || !state?.visitante?.nombre) {
    showToast('Todavía faltan definir los equipos.', 'error');
    focusSetupCard('teams');
    return;
  }
  await ensureWidget('marcador');
  setWorkspaceMode('live');
}

// ─── EXPERIENCIA DE OPERACIÓN ────────────────────────
function setWorkspaceMode(mode) {
  if (!['live', 'setup', 'content'].includes(mode)) mode = 'live';
  document.body.dataset.workspaceMode = mode;
  localStorage.setItem('proWorkspaceMode', mode);
  document.querySelectorAll('.workspace-tab').forEach(btn => btn.classList.toggle('active', btn.dataset.mode === mode));
  document.querySelectorAll('[data-workspace]').forEach(card => {
    const modes = (card.dataset.workspace || '').split(/\s+/);
    card.classList.toggle('workspace-hidden', !modes.includes(mode));
  });
  window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
}

function renderCockpit(s) {
  setEl('cockpitLocalName', s.local?.nombre || 'Sin definir');
  setEl('cockpitVisitanteName', s.visitante?.nombre || 'Sin definir');
  setEl('cockpitLocalScore', s.local?.goles ?? 0);
  setEl('cockpitVisitanteScore', s.visitante?.goles ?? 0);
  setImgSrc('cockpitLogoLocal', s.local?.logo);
  setImgSrc('cockpitLogoVisitante', s.visitante?.logo);
}

function renderReadiness(s) {
  const issues = [];
  if (!s.local?.nombre || !s.visitante?.nombre) issues.push('faltan equipos');
  const localNamed = (s.local?.jugadores || []).filter(p => p.nombre?.trim()).length;
  const visitNamed = (s.visitante?.jugadores || []).filter(p => p.nombre?.trim()).length;
  if (localNamed < 11 || visitNamed < 11) issues.push('planteles incompletos');
  if (!s.widgets?.marcador) issues.push('marcador oculto');
  const el = document.getElementById('readinessSummary');
  const text = document.getElementById('readinessText');
  if (!el || !text) return;
  el.classList.toggle('ready', issues.length === 0);
  el.classList.toggle('warning', issues.length > 0);
  el.querySelector('strong').textContent = issues.length === 0 ? 'Listo para transmitir' : 'Preparación pendiente';
  text.textContent = issues.length === 0 ? 'Equipos, planteles y marcador verificados' : issues.join(' · ');
}

function quickPlayerOptions(side, listMode = 'all') {
  const titulares = state?.[side]?.jugadores || [];
  const suplentes = state?.[side]?.suplentes || [];
  const rows = listMode === 'titulares'
    ? titulares.map((p, i) => ({ p, value: 'j:' + i }))
    : listMode === 'suplentes'
      ? suplentes.map((p, i) => ({ p, value: 's:' + i }))
      : [...titulares.map((p, i) => ({ p, value: 'j:' + i })), ...suplentes.map((p, i) => ({ p, value: 's:' + i }))];
  return '<option value="">— Sin jugador —</option>' + rows
    .filter(row => row.p?.nombre?.trim())
    .map(row => `<option value="${row.value}">${row.p.numero ? row.p.numero + ' · ' : ''}${esc(row.p.nombre)}</option>`)
    .join('');
}

function openQuickAction(type, side) {
  if (!state) return;
  quickAction = { type, side };
  const labels = { gol:'Gol', amarilla:'Tarjeta amarilla', roja:'Tarjeta roja', cambio:'Sustitución', var:'Revisión VAR' };
  const teamName = state?.[side]?.nombre || (side === 'local' ? 'Local' : 'Visitante');
  setEl('quickActionTitle', labels[type] || 'Incidencia');
  setEl('quickActionTeam', teamName);
  const player = document.getElementById('quickPlayer');
  const playerOut = document.getElementById('quickPlayerOut');
  const outWrap = document.getElementById('quickPlayerOutWrap');
  const playerLabel = document.getElementById('quickPlayerLabel');
  const autoWrap = document.getElementById('quickAutoUpdateWrap');
  const autoText = document.getElementById('quickAutoUpdateText');
  const minute = document.getElementById('quickMinute');
  minute.value = '';
  document.getElementById('quickAutoUpdate').checked = true;

  if (type === 'cambio') {
    playerLabel.textContent = 'Entra';
    player.innerHTML = quickPlayerOptions(side, 'suplentes');
    playerOut.innerHTML = quickPlayerOptions(side, 'titulares');
    outWrap.classList.remove('hidden');
    autoWrap.classList.remove('hidden');
    autoText.textContent = 'Actualizar también la formación';
  } else {
    playerLabel.textContent = 'Jugador';
    player.innerHTML = quickPlayerOptions(side, type === 'var' ? 'titulares' : 'all');
    outWrap.classList.add('hidden');
    autoWrap.classList.toggle('hidden', type === 'var');
    autoText.textContent = type === 'gol' ? 'Sumar también el gol al marcador' : 'Marcar también la tarjeta en el plantel';
  }

  document.getElementById('quickConfirmBtn').textContent = type === 'gol' ? 'Confirmar gol' : 'Registrar jugada';
  document.getElementById('quickActionModal').classList.remove('hidden');
  setTimeout(() => player.focus(), 20);
}

function closeQuickAction() {
  document.getElementById('quickActionModal')?.classList.add('hidden');
  quickAction = null;
}

function quickEntry(side, value, lists) {
  if (!value) return null;
  const [listKey, rawIndex] = value.split(':');
  const index = Number(rawIndex);
  const list = listKey === 's' ? lists.suplentes : lists.jugadores;
  return { list, index, player: list[index] };
}

async function confirmQuickAction() {
  if (!quickAction || !state) return;
  const { type, side } = quickAction;
  const btn = document.getElementById('quickConfirmBtn');
  const autoUpdate = document.getElementById('quickAutoUpdate').checked;
  const minuteRaw = document.getElementById('quickMinute').value;
  const minute = minuteRaw !== '' ? Number(minuteRaw) : getCurrentMinute();
  const lists = {
    jugadores: JSON.parse(JSON.stringify(state?.[side]?.jugadores || [])),
    suplentes: JSON.parse(JSON.stringify(state?.[side]?.suplentes || []))
  };
  const selected = quickEntry(side, document.getElementById('quickPlayer').value, lists);
  const selectedOut = quickEntry(side, document.getElementById('quickPlayerOut').value, lists);
  const player = selected?.player?.nombre || '';
  const playerOut = selectedOut?.player?.nombre || '';

  if (type === 'cambio' && (!selected || !selectedOut)) {
    showToast('Elegí quién entra y quién sale.', 'error');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Guardando…';
  try {
    if (autoUpdate && type === 'cambio') {
      const entering = selected.player;
      const leaving = selectedOut.player;
      entering.entro = true;
      delete entering.sustituido;
      leaving.sustituido = true;
      delete leaving.entro;
      lists.jugadores[selectedOut.index] = entering;
      lists.suplentes.splice(selected.index, 1);
      lists.suplentes.push(leaving);
      await api('PATCH', '/overlay-state/' + side, lists);
      plantel[side].titulares = JSON.parse(JSON.stringify(lists.jugadores));
      plantel[side].suplentes = JSON.parse(JSON.stringify(lists.suplentes));
      renderPlantel(side);
    } else if (autoUpdate && type === 'gol') {
      if (selected?.player) selected.player.goles = (selected.player.goles || 0) + 1;
      await api('PATCH', '/overlay-state/' + side, { goles: (state?.[side]?.goles || 0) + 1, ...lists });
    } else if (autoUpdate && (type === 'amarilla' || type === 'roja') && selected?.player) {
      selected.player[type] = true;
      await api('PATCH', '/overlay-state/' + side, lists);
    }

    if (autoUpdate && ['gol', 'amarilla', 'roja'].includes(type)) {
      plantel[side].titulares = JSON.parse(JSON.stringify(lists.jugadores));
      plantel[side].suplentes = JSON.parse(JSON.stringify(lists.suplentes));
      renderPlantel(side);
    }

    await api('POST', '/overlay-state/incidents', { type, team: side, player, playerOut, minute });
    await ensureWidget('marcador');
    showToast(type === 'gol' ? 'Gol registrado y marcador actualizado.' : 'Jugada registrada en pantalla.', 'success');
    closeQuickAction();
  } finally {
    btn.disabled = false;
  }
}

function showToast(message, type = 'success') {
  const stack = document.getElementById('toastStack');
  if (!stack) return;
  const toast = document.createElement('div');
  toast.className = 'panel-toast ' + type;
  toast.textContent = message;
  stack.appendChild(toast);
  setTimeout(() => toast.remove(), 3600);
}

// ─── EMERGENCIA ───────────────────────────────────────
async function toggleEmergency() {
  await api('POST', '/overlay-state/emergency');
  document.getElementById('emergencyOverlay').classList.toggle('hidden', !state?.emergencyMode);
}

// ─── PLANTILLAS ───────────────────────────────────────
async function applyTemplate(tpl) {
  if (!tpl) return;
  const map = { liga:'LIGA APERTURA 2026', copa:'COPA REGIONAL 2026', amistoso:'PARTIDO AMISTOSO', liguilla:'LIGUILLA FINAL 2026' };
  if (map[tpl]) { document.getElementById('matchTournament').value = map[tpl]; await api('PATCH', '/overlay-state/match', { tournament: map[tpl] }); }
  document.getElementById('templateSel').value = '';
}

// ─── RESET ────────────────────────────────────────────
async function resetState() {
  if (!confirm('¿Resetear TODO el estado? No se puede deshacer.')) return;
  await fetch(API + '/overlay-state/reset', { method: 'POST' });
  plantel.local.titulares    = []; plantel.local.suplentes    = [];
  plantel.visitante.titulares = []; plantel.visitante.suplentes = [];
  renderPlantel('local'); renderPlantel('visitante');
}

// ─── API HELPER ───────────────────────────────────────
async function api(method, endpoint, body) {
  try {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    const r = await fetch(API + endpoint, opts);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } catch(e) {
    console.error(endpoint, e);
    showToast('No se pudo guardar el cambio. Revisá la conexión.', 'error');
  }
}

// ─── WIDGET TOGGLE ────────────────────────────────────
async function ensureWidget(key) {
  const current = await api('GET', '/overlay-state');
  if (!current?.widgets?.[key]) {
    await api('PATCH', '/overlay-state/widgets', { [key]: true });
  }
}

// ─── UTILS ────────────────────────────────────────────
function setVal(id, val) { const el = document.getElementById(id); if (el && val != null) el.value = val; }
function setEl(id, val)  { const el = document.getElementById(id); if (el) el.textContent = val; }
function setImgSrc(id, src) {
  const el = document.getElementById(id);
  if (!el) return;
  if (src) {
    el.src = src.startsWith('http') ? src : '/' + src.replace(/^\//, '');
    el.style.display = '';
  } else {
    el.style.display = 'none';
  }
}
function setSelectVal(id, val) {
  const el = document.getElementById(id); if (!el || !val) return;
  for (const opt of el.options) { if (opt.value === val || opt.text === val) { el.value = opt.value; break; } }
}

// ─── START ────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !document.getElementById('quickActionModal')?.classList.contains('hidden')) closeQuickAction();
});
