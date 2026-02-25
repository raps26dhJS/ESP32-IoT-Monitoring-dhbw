#include <WiFi.h>
#include <PubSubClient.h>
#include <Adafruit_Sensor.h>
#include <DHT.h>
#include <DHT_U.h>

// ---------- DHT ----------
#define DHTPIN 14
#define DHTTYPE DHT11
DHT_Unified dht(DHTPIN, DHTTYPE);

// ---------- WIFI / MQTT ----------
const char* WIFI_SSID     = "";
const char* WIFI_PASSWORD = "";

const char* MQTT_HOST = "192.168.0.107";
const uint16_t MQTT_PORT = 1883;

const char* MQTT_USER = "esp32";
const char* MQTT_PASS = "";

const char* MQTT_TOPIC = "sensors/esp32/dht11";

// ---------- Timing ----------
const unsigned long READ_INTERVAL_MS = 20000UL;
unsigned long lastReadMs = 0;

WiFiClient espClient;
PubSubClient mqtt(espClient);

// 1) DHT lesen (Messwerte: Temp und Hum)
bool readDht(float &tempC, float &humPct) {
  sensors_event_t e;

  dht.temperature().getEvent(&e);
  if (isnan(e.temperature)) return false;
  tempC = e.temperature;

  dht.humidity().getEvent(&e);
  if (isnan(e.relative_humidity)) return false;
  humPct = e.relative_humidity;

  return true;
}

// 2) Werte zuerst seriell ausgeben
void printValues(float t, float h) {
  Serial.print("Temperature: ");
  Serial.print(t);
  Serial.println("°C");

  Serial.print("Humidity: ");
  Serial.print(h);
  Serial.println("%");
}

// 3) WLAN verbinden (mit Timeout)
bool ensureWiFi(uint32_t timeoutMs = 15000) {
  if (WiFi.status() == WL_CONNECTED) return true;

  Serial.print("WiFi connecting");
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  uint32_t start = millis();
  while (WiFi.status() != WL_CONNECTED) {
    delay(300);
    Serial.print(".");
    if (millis() - start > timeoutMs) {
      Serial.println("\nWiFi TIMEOUT");
      return false;
    }
  }

  Serial.print("\nWiFi OK, IP=");
  Serial.println(WiFi.localIP());
  return true;
}

// 4) MQTT verbinden (mit Timeout)
bool ensureMQTT(uint32_t timeoutMs = 8000) {
  if (mqtt.connected()) return true;

  mqtt.setServer(MQTT_HOST, MQTT_PORT);

  String clientId = "esp32-dht11-" + String((uint32_t)ESP.getEfuseMac(), HEX);

  Serial.print("MQTT connecting");
  uint32_t start = millis();
  while (!mqtt.connected()) {
    bool ok = mqtt.connect(clientId.c_str(), MQTT_USER, MQTT_PASS);
    if (ok) {
      Serial.println("\nMQTT OK");
      return true;
    }

    Serial.print(".");
    delay(500);

    if (millis() - start > timeoutMs) {
      Serial.print("\nMQTT TIMEOUT (state=");
      Serial.print(mqtt.state());
      Serial.println(")");
      return false;
    }
  }
  return true;
}

// 5) NACH serieller Ausgabe Daten via MQTT senden
void publishMQTT(float t, float h) {
  if (!ensureWiFi()) return;
  if (!ensureMQTT()) return;

  char payload[96];
  snprintf(payload, sizeof(payload), "{\"temp\":%.1f,\"hum\":%.1f}", t, h);

  bool ok = mqtt.publish(MQTT_TOPIC, payload, false);
  Serial.print("MQTT publish: ");
  Serial.println(ok ? "OK" : "FAIL");
}

void setup() {
  Serial.begin(115200);
  delay(200);
  Serial.println("\n--- DHT11 -> Serial -> MQTT ---");

  dht.begin();
  lastReadMs = millis() - READ_INTERVAL_MS; //erste Messung
}

void loop() {
  mqtt.loop();

  unsigned long now = millis();
  if (now - lastReadMs >= READ_INTERVAL_MS) {
    lastReadMs = now;

    float t, h;
    if (!readDht(t, h)) {
      Serial.println("Error reading DHT!");
      return;
    }

    // 1) Daten werden zuerst seriell ausgeben
    printValues(t, h);

    // 2) Danach via MQTT versendet
    publishMQTT(t, h);
  }

  delay(5);
}
