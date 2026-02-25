// ----------------------------------------------------
// Aufsummierung der Zeitanteile je Ampelzustand (grün / gelb / rot)
// - Sensordaten: msg.payload.traffic (0 = grün, 1 = gelb, 2 = rot)
// - 60-Sekunden-Injects: kein traffic-Wert → letzter Zustand wird weiterverwendet
// - dauerhafte Speicherung über den Datei-Context von Node-RED (bleibt nach Neustart erhalten)
// ----------------------------------------------------

const STORE = "file";   // dauerhafter Context-Store (Speicherung auf SD-Karte)
const MAX_GAP_S = 120;  // Maximale Zeitlücke: längere Ausfälle werden nicht nachgezählt

const nowMs = Date.now();
const nowDate = new Date(nowMs);

// ---------- Ermittlung und Validierung des Ampelzustands ----------
let traffic = (msg.payload && typeof msg.payload.traffic === "number")
  ? msg.payload.traffic
  : flow.get("lastTraffic", STORE);

if (traffic === undefined || traffic === null) traffic = 0;
traffic = Number(traffic);
if (!Number.isFinite(traffic)) traffic = 0;

// Begrenzung auf gültige Zustände: 0 = grün, 1 = gelb, 2 = rot
traffic = Math.max(0, Math.min(2, Math.trunc(traffic)));

// ---------- Laden des fest gespeicherten Zustands ----------
let state = flow.get("trafficStats", STORE);
if (!state || typeof state !== "object") {
  state = {
    lastTs: nowMs,
    lastTraffic: traffic,

    // Tageszähler in Sekunden: [grün, gelb, rot]
    today: [0, 0, 0],

    // Wochenzähler in Sekunden: [grün, gelb, rot]
    week: [0, 0, 0],

    // Referenz für aktuellen Tag und aktuelle Kalenderwoche (lokale Zeit)
    dayKey: getLocalDayKey(nowDate),
    weekKey: getWeekKeyLocal(nowDate)
  };
}

// ---------- Zeitdifferenz seit letztem Zyklus ----------
let dt = Math.floor((nowMs - Number(state.lastTs || nowMs)) / 1000);
if (dt < 0) dt = 0;

// Bei längerer Abschaltung wird keine zusätzliche Zeit aufaddiert
if (dt > MAX_GAP_S) dt = 0;

// ---------- Prüfung auf Tages- und Wochenwechsel ----------
const currentDay = getLocalDayKey(nowDate);
if (currentDay !== state.dayKey) {
  state.today = [0, 0, 0];
  state.dayKey = currentDay;
}

const currentWeek = getWeekKeyLocal(nowDate);
if (currentWeek !== state.weekKey) {
  state.week = [0, 0, 0];
  state.weekKey = currentWeek;
}

// ---------- Aufsummierung der Zeit für den zuletzt aktiven Zustand ----------
const idx = Number(state.lastTraffic);
if (idx === 0 || idx === 1 || idx === 2) {
  state.today[idx] += dt;
  state.week[idx] += dt;
}

// ---------- Aktualisierung des Systemzustands ----------
state.lastTs = nowMs;
state.lastTraffic = traffic;

// ---------- Persistente Speicherung ----------
flow.set("trafficStats", state, STORE);
flow.set("lastTraffic", traffic, STORE);

// ---------- Ausgabe für Speicherung in InfluxDB ----------
msg.payload = {
  green_s_today: state.today[0],
  yellow_s_today: state.today[1],
  red_s_today: state.today[2],

  green_s_week: state.week[0],
  yellow_s_week: state.week[1],
  red_s_week: state.week[2],

  day: state.dayKey,
  week: state.weekKey
};

msg.tags = { room: "office", app: "climate" }; // Metadaten für InfluxDB
delete msg.payload.room; // Vermeidung doppelter Feldspeicherung

return msg;

// ----------------------------------------------------
// Hilfsfunktionen
// ----------------------------------------------------

// Erzeugt einen Tages-Schlüssel im lokalen Zeitformat (YYYY-MM-DD)
function getLocalDayKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Ermittelt die ISO-Kalenderwoche auf Basis lokaler Zeit (Wochenstart: Montag)
function getWeekKeyLocal(d) {
  const date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dayNum = date.getDay() || 7;
  date.setDate(date.getDate() + 4 - dayNum);
  const yearStart = new Date(date.getFullYear(), 0, 1);
  const weekNo = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return `${date.getFullYear()}-W${weekNo}`;
}
