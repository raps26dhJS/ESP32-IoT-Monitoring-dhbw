// E-Mail, falls Ampel Gelb oder Rot wird
// zusätzliche ANgabe der Messwerte und Uhrzeit

const t = Number(msg.payload?.traffic);
if (!Number.isFinite(t)) return null;  

// Letzten versendeten Zustand aus dem Flow-Context lesen
const last = flow.get("lastTrafficMail");
const lastVal = (last === undefined || last === null) ? -1 : Number(last);

// Wenn keine Änderung: nichts senden
if (t === lastVal) return null;

// Neuen Zustand merken
flow.set("lastTrafficMail", t);

// Messwerte für den Mailtext
const temp = Number(msg.payload?.temp_c);
const hum = Number(msg.payload?.hum_pct);

// Werte darstellen
const tempText = Number.isFinite(temp) ? `${temp.toFixed(1)} °C` : "n/a";
const humText = Number.isFinite(hum) ? `${hum.toFixed(0)} %` : "n/a";

// Ampeltext für Betreff und Textfeld
const stateText =
    (t === 2) ? "ROT (ALARM)" :
        (t === 1) ? "GELB (WARNUNG)" :
            "GRÜN (OK)";

// Optional: nur GELB/ROT senden (GRÜN wird nur intern gemerkt)
if (t === 0) return null;

// Betreff + Textfeld für Email-Node setzen
msg.topic = `[Office Klima] ${stateText}`;   // Betreff
msg.payload =
    `Statuswechsel erkannt: ${stateText}
Zeit: ${new Date().toLocaleString("de-DE")}
Temperatur: ${tempText}
Luftfeuchte: ${humText}`;

return msg;
