/*
  ----------------------------------------------------
  Function Node: Compute advice + traffic
  Ziel:
  - Aus den Messwerten Temperatur (temp) und relativer Feuchte (hum) wird eine Ampel (traffic) abgebildet.
  - Die Bewertung erfolgt ausschließlich über Grenzwerte (Momentanwerte der Messungen).

  Ampel-Definition:
  - Rot (Alarm):    temp < 16 °C  ODER  hum > 70 %
  - Gelb (Warnung): 16 °C <= temp <= 18 °C  ODER  60 % <= hum <= 70 %
  - Grün (OK):      else

  Hinweis:
  - Der letzte Ampelzustand wird zusätzlich in flow.lastTraffic gespeichert.
    Dadurch kann der 60s-Inject im Accumulate-Node richtig weiterzählen.
  ----------------------------------------------------
*/

const now = Date.now(); // Zeitstempel

// ----------------------------------------------------
// 1) Eingangsdaten einlesen und validieren
//    
// ----------------------------------------------------
const temp = Number(msg.payload.temp);
const hum = Number(msg.payload.hum);

if (!Number.isFinite(temp) || !Number.isFinite(hum)) {
  
  return null;
}

// ----------------------------------------------------
// 2) Testmodus: Ampelzustand forcen
// ----------------------------------------------------
const TEST_MODE = false;   // bei Bedarf auf true setzen
const FORCE = 1;           // 0=grün, 1=gelb, 2=rot

if (TEST_MODE) {
  msg.payload = {
    room: "office",
    temp_c: temp,
    hum_pct: hum,

    // Felder bleiben bewusst bestehen
    advice_ventilate: 0,
    advice_heat: 0,

    traffic: FORCE,
    traffic_text: ["green", "yellow", "red"][FORCE] || "green",
    reason: FORCE === 1 ? "TEST_YELLOW" : (FORCE === 2 ? "TEST_RED" : "TEST_GREEN")
  };

  // lastTraffic wird gesetzt, damit Accumulate durations sauber weiterzählt
  flow.set("lastTraffic", FORCE);

  return msg;
}

// ----------------------------------------------------
// 3) Ampelzustand aus Grenzwerten bestimmen
// ----------------------------------------------------
let traffic = 0;  // 0=grün, 1=gelb, 2=rot

// Rot: Alarm, wenn Temperatur zu niedrig oder Luftfeuchte zu hoch
if (temp < 17 || hum > 70) {
  traffic = 2;
}

// Gelb: Warnbereich für Temperatur oder Luftfeuchte
else if ((temp >= 17 && temp <= 18.9) || (hum > 60 && hum <= 70)) {
  traffic = 1;
}

// Grün: sonst keine Auffälligkeit
else {
  traffic = 0;
}

const trafficText = ["green", "yellow", "red"][traffic];

// ----------------------------------------------------
// 4) Zustand für nachgelagerte Zeitakkumulation speichern
// ----------------------------------------------------
flow.set("lastTraffic", traffic);

// ----------------------------------------------------
// 5) Ausgabeformat für InfluxDB / Grafana
//    - msg.tags wird als Tag-Set genutzt (z. B. room=office)
//    - msg.payload enthält Felder (Fields)
// ----------------------------------------------------
msg.tags = { room: "office" };

msg.payload = {
  room: "office",
  temp_c: temp,
  hum_pct: hum,

  // werden aktuell nicht mehr logisch berechnet, bleiben aber als kompatible Felder erhalten
  advice_ventilate: 0,
  advice_heat: 0,

  traffic: traffic,
  traffic_text: trafficText,
};

return msg;
