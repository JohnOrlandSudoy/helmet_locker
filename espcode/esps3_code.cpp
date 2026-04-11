#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <SPI.h>
#include <MFRC522.h>
#include <Adafruit_Fingerprint.h>
#include <HardwareSerial.h>
#include <LiquidCrystal_I2C.h>
#include <Wire.h>

#define SS_PIN 10
#define RST_PIN 4
#define RELAY_PIN 9
#define BUZZER_PIN 8
#define LED_PIN 5

LiquidCrystal_I2C lcd(0x27, 16, 2);

HardwareSerial fingerSerial(2);
Adafruit_Fingerprint finger = Adafruit_Fingerprint(&fingerSerial);

MFRC522 rfid(SS_PIN, RST_PIN);

const char* ssid = "helmet_locker";
const char* password = "1234567890";

const String SUPABASE_URL = "https://ragmtumnoouapfcbrync.supabase.co";
const String SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJhZ210dW1ub291YXBmY2JyeW5jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxOTM3ODUsImV4cCI6MjA5MDc2OTc4NX0.cIeNcXoLl55SnvEp8HKpJ94b8iQKNA-4ycm1ZX88Uyc";

String lastRfid = "";
unsigned long lastRfidSeenAt = 0;
unsigned long lastFpSeenAt = 0;

bool enrollMode = false;
String currentEnrollType = "";
String currentEnrollRequestId = "";
int currentEnrollFingerprintId = -1;

String lastMatchedUserId = "";
String lastMatchedUserName = "";
String lastUnlockMethod = "";

unsigned long lastPollTime = 0;
unsigned long unlockStartTime = 0;
bool doorUnlocked = false;
unsigned long enrollStartTime = 0;

unsigned long lcdHoldUntil = 0;
bool lcdHoldActive = false;
String lcdLastLine0 = "";
String lcdLastLine1 = "";

enum FingerEnrollState {
  FP_IDLE,
  FP_WAIT_FIRST,
  FP_WAIT_REMOVE,
  FP_WAIT_SECOND,
};

FingerEnrollState fpEnrollState = FP_IDLE;

const unsigned long UNLOCK_DURATION = 5000;
const unsigned long ENROLL_TIMEOUT = 30000;
const unsigned long POLL_INTERVAL = 1000;

void beep(int times);
void connectWiFi();
void unlockDoor(const String& method);
void handleDoorTimer();
void cancelEnrollMode();
void pollEnrollRequests();
void finishRFIDEnroll(const String& uid);
void finishFingerprintEnroll(int fingerID);
void updateEnrollRequest(const String& requestId, const String& rfidUid, int fingerId);
void checkRFID();
void checkFingerprint();
void processFingerprintEnroll();
bool checkUserInSupabase(const String& identifier, const String& method);
void pollFaceUnlock();
void markRequestProcessed(const String& requestId);
void logAccess(const String& method);
String getUserNameById(const String& userId);
String uidForLcd(const String& uid);

void lcdPrintIfChanged(const String& line0, const String& line1);
void showReadyScreen();
void showRegisteredCardOnLcd();
void showNotRegisteredOnLcd();
void showNotRegisteredFingerOnLcd();
void showEnrollPrompt();
void showUnlockScreen(const String& method);
void showEnrollSaved(const String& line1);
void showEnrollPatchFailed(int code);

void setup() {
  Serial.begin(115200);
  Serial.println("\n=== HELMET LOCKER ESP32-S3 STARTING ===");

  Wire.begin(21, 3);
  lcd.init();
  lcd.backlight();
  lcdPrintIfChanged("Helmet Locker", "Starting...");
  delay(800);

  pinMode(RELAY_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, LOW);
  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);

  connectWiFi();

  SPI.begin(12, 13, 11, 10);
  rfid.PCD_Init();

  fingerSerial.begin(57600, SERIAL_8N1, 16, 17);
  bool fpOK = finger.verifyPassword();

  lcdPrintIfChanged(String("RFID: OK"), String("FP: ") + (fpOK ? "OK" : "ERR"));
  delay(1200);

  showReadyScreen();
  beep(3);
  Serial.println("=== SYSTEM READY ===");
}

void loop() {
  checkRFID();

  if (enrollMode && currentEnrollType == "fingerprint") {
    processFingerprintEnroll();
  } else {
    checkFingerprint();
  }

  handleDoorTimer();

  if (lcdHoldActive && millis() > lcdHoldUntil) {
    lcdHoldActive = false;
    if (doorUnlocked) {
      showUnlockScreen(lastUnlockMethod.length() > 0 ? lastUnlockMethod : "UNLOCK");
    } else if (enrollMode) {
      showEnrollPrompt();
    } else {
      showReadyScreen();
    }
  }

  if (millis() - lastPollTime > POLL_INTERVAL) {
    if (WiFi.status() == WL_CONNECTED) {
      pollEnrollRequests();
      pollFaceUnlock();
    } else {
      connectWiFi();
    }
    lastPollTime = millis();
  }

  if (enrollMode && millis() - enrollStartTime > ENROLL_TIMEOUT) {
    cancelEnrollMode();
  }

  delay(1);
}

void beep(int times) {
  for (int i = 0; i < times; i++) {
    tone(BUZZER_PIN, 1000, 120);
    delay(170);
  }
}

void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;
  WiFi.begin(ssid, password);
  Serial.print("Connecting to WiFi");
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(300);
    Serial.print(".");
    attempts++;
  }
  Serial.println(WiFi.status() == WL_CONNECTED ? "\nWiFi Connected!" : "\nWiFi Failed!");
}

void lcdPrintIfChanged(const String& line0, const String& line1) {
  if (line0 == lcdLastLine0 && line1 == lcdLastLine1) return;
  lcdLastLine0 = line0;
  lcdLastLine1 = line1;

  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print(line0.substring(0, 16));
  lcd.setCursor(0, 1);
  lcd.print(line1.substring(0, 16));
}

void showReadyScreen() {
  lcdPrintIfChanged("System Ready", "Tap Card/Finger");
}

void showUnlockScreen(const String& method) {
  lcdPrintIfChanged("DOOR UNLOCKED", method);
}

void showEnrollPrompt() {
  if (currentEnrollType == "rfid") {
    lcdPrintIfChanged("Enroll RFID", "Tap card now");
  } else if (currentEnrollType == "fingerprint") {
    lcdPrintIfChanged("Enroll Finger", "ID:" + String(currentEnrollFingerprintId));
  }
}

void showEnrollSaved(const String& line1) {
  lcdPrintIfChanged("Enroll Saved", line1);
  lcdHoldActive = true;
  lcdHoldUntil = millis() + 1200;
}

void showEnrollPatchFailed(int code) {
  lcdPrintIfChanged("Enroll PATCH", "FAILED " + String(code));
  lcdHoldActive = true;
  lcdHoldUntil = millis() + 1500;
}

void showRegisteredCardOnLcd() {
  String line1 = lastMatchedUserName.length() > 0 ? lastMatchedUserName : uidForLcd(lastRfid);
  lcdPrintIfChanged("Registered", line1);
  lcdHoldActive = true;
  lcdHoldUntil = millis() + 800;
}

void showNotRegisteredOnLcd() {
  lcdPrintIfChanged("Not Register!", "Please enroll");
  lcdHoldActive = true;
  lcdHoldUntil = millis() + 1200;
}

void showNotRegisteredFingerOnLcd() {
  lcdPrintIfChanged("Not Register!", "Enroll Finger");
  lcdHoldActive = true;
  lcdHoldUntil = millis() + 1200;
}

void unlockDoor(const String& method) {
  lastUnlockMethod = method;
  if (doorUnlocked) {
    unlockStartTime = millis();
    showUnlockScreen(method);
    beep(1);
    lastRfid = "";
    lastRfidSeenAt = 0;
    return;
  }

  digitalWrite(RELAY_PIN, HIGH);
  digitalWrite(LED_PIN, HIGH);
  beep(3);
  showUnlockScreen(method);

  Serial.println("DOOR UNLOCKED via " + method);

  doorUnlocked = true;
  unlockStartTime = millis();
  lastRfid = "";
  lastRfidSeenAt = 0;
}

void handleDoorTimer() {
  if (doorUnlocked && millis() - unlockStartTime >= UNLOCK_DURATION) {
    digitalWrite(RELAY_PIN, LOW);
    digitalWrite(LED_PIN, LOW);
    doorUnlocked = false;
    showReadyScreen();
  }
}

void cancelEnrollMode() {
  enrollMode = false;
  currentEnrollType = "";
  currentEnrollRequestId = "";
  currentEnrollFingerprintId = -1;
  fpEnrollState = FP_IDLE;
  Serial.println("Enroll mode timed out");
  beep(2);
  showReadyScreen();
}

void pollEnrollRequests() {
  if (enrollMode) return;

  HTTPClient http;
  String base = SUPABASE_URL + "/rest/v1/enroll_requests?select=id,type,fingerprint_id,user_name&processed=eq.false&order=";
  String url = base + "requested_at.desc&limit=1";
  http.begin(url);
  http.addHeader("apikey", SUPABASE_KEY);
  http.addHeader("Authorization", "Bearer " + SUPABASE_KEY);

  int code = http.GET();
  if (code == 400) {
    http.end();
    http.begin(base + "created_at.desc&limit=1");
    http.addHeader("apikey", SUPABASE_KEY);
    http.addHeader("Authorization", "Bearer " + SUPABASE_KEY);
    code = http.GET();
  }

  if (code == 200) {
    String payload = http.getString();
    JsonDocument doc;
    if (deserializeJson(doc, payload) == DeserializationError::Ok && doc.size() > 0) {
      currentEnrollRequestId = doc[0]["id"].as<String>();
      currentEnrollType = doc[0]["type"].as<String>();
      currentEnrollFingerprintId = doc[0]["fingerprint_id"].isNull() ? -1 : doc[0]["fingerprint_id"].as<int>();
      enrollMode = true;
      enrollStartTime = millis();
      Serial.println("ENROLL MODE → " + currentEnrollType);
      if (currentEnrollType == "rfid") lastRfid = "";
      if (currentEnrollType == "fingerprint") fpEnrollState = FP_WAIT_FIRST;
      showEnrollPrompt();
      beep(2);
    }
  }
  http.end();
}

void finishRFIDEnroll(const String& uid) {
  lcdPrintIfChanged("RFID Read", uidForLcd(uid));
  updateEnrollRequest(currentEnrollRequestId, uid, -1);
  enrollMode = false;
  lastRfid = "";
  lastRfidSeenAt = 0;
  Serial.println("RFID Enroll SUCCESS: " + uid);
  beep(2);
}

void finishFingerprintEnroll(int fingerID) {
  updateEnrollRequest(currentEnrollRequestId, "", fingerID);
  enrollMode = false;
  fpEnrollState = FP_IDLE;
  Serial.println("Fingerprint Enroll SUCCESS: ID " + String(fingerID));
  beep(2);
}

void updateEnrollRequest(const String& requestId, const String& rfidUid, int fingerId) {
  HTTPClient http;
  String url = SUPABASE_URL + "/rest/v1/enroll_requests?id=eq." + requestId;
  http.begin(url);
  http.addHeader("apikey", SUPABASE_KEY);
  http.addHeader("Authorization", "Bearer " + SUPABASE_KEY);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Prefer", "return=minimal");

  JsonDocument doc;
  if (rfidUid.length() > 0) doc["rfid_uid"] = rfidUid;
  if (fingerId != -1) doc["fingerprint_id"] = fingerId;
  doc["processed"] = true;

  String json;
  serializeJson(doc, json);
  int code = http.PATCH(json);
  Serial.println("PATCH enroll_requests (" + requestId + ") code: " + String(code));
  if (code < 200 || code >= 300) {
    String resp = http.getString();
    if (resp.length() > 0) Serial.println("PATCH failed response: " + resp);
    Serial.println("PATCH failed payload: " + json);
    showEnrollPatchFailed(code);
  } else {
    if (rfidUid.length() > 0) showEnrollSaved(uidForLcd(rfidUid));
    else if (fingerId != -1) showEnrollSaved("FP ID:" + String(fingerId));
    else showEnrollSaved("OK");
  }
  http.end();
}

void checkRFID() {
  if (!rfid.PICC_IsNewCardPresent() || !rfid.PICC_ReadCardSerial()) return;

  String uid = "";
  for (byte i = 0; i < rfid.uid.size; i++) {
    if (rfid.uid.uidByte[i] < 0x10) uid += "0";
    uid += String(rfid.uid.uidByte[i], HEX);
  }
  uid.toUpperCase();
  rfid.PICC_HaltA();
  rfid.PCD_StopCrypto1();

  if (uid == lastRfid && millis() - lastRfidSeenAt < 600) return;
  lastRfid = uid;
  lastRfidSeenAt = millis();

  Serial.println("RFID detected: " + uid);
  lcdPrintIfChanged("RFID UID", uidForLcd(uid));

  if (enrollMode && currentEnrollType == "rfid") {
    if (checkUserInSupabase(uid, "rfid")) {
      showRegisteredCardOnLcd();
      beep(1);
      return;
    }
    finishRFIDEnroll(uid);
    return;
  }

  if (checkUserInSupabase(uid, "rfid")) {
    showRegisteredCardOnLcd();
    logAccess("rfid");
    unlockDoor("RFID");
  } else {
    showNotRegisteredOnLcd();
    beep(2);
  }
}

void checkFingerprint() {
  int p = finger.getImage();
  if (p != FINGERPRINT_OK) return;
  p = finger.image2Tz();
  if (p != FINGERPRINT_OK) return;

  p = finger.fingerFastSearch();
  if (p == FINGERPRINT_OK) {
    Serial.print("Fingerprint matched! ID: ");
    Serial.println(finger.fingerID);

    if (checkUserInSupabase(String(finger.fingerID), "fingerprint")) {
      logAccess("fingerprint");
      unlockDoor("FINGERPRINT");
    } else {
      if (millis() - lastFpSeenAt > 1200) {
        showNotRegisteredFingerOnLcd();
        beep(2);
        lastFpSeenAt = millis();
      }
    }
  } else if (p == FINGERPRINT_NOTFOUND) {
    if (millis() - lastFpSeenAt > 1200) {
      showNotRegisteredFingerOnLcd();
      beep(2);
      lastFpSeenAt = millis();
    }
  }
}

void processFingerprintEnroll() {
  if (!enrollMode || currentEnrollType != "fingerprint") return;
  if (currentEnrollFingerprintId < 0) {
    cancelEnrollMode();
    return;
  }

  if (fpEnrollState == FP_IDLE) fpEnrollState = FP_WAIT_FIRST;

  if (fpEnrollState == FP_WAIT_FIRST) {
    lcdPrintIfChanged("Enroll Finger", "Place " + String(currentEnrollFingerprintId));

    int p = finger.getImage();
    if (p == FINGERPRINT_NOFINGER) return;
    if (p != FINGERPRINT_OK) return;

    p = finger.image2Tz(1);
    if (p != FINGERPRINT_OK) return;

    beep(1);
    lcdPrintIfChanged("Remove finger", "");
    fpEnrollState = FP_WAIT_REMOVE;
    return;
  }

  if (fpEnrollState == FP_WAIT_REMOVE) {
    int p = finger.getImage();
    if (p != FINGERPRINT_NOFINGER) return;
    lcdPrintIfChanged("Place same", "finger again");
    fpEnrollState = FP_WAIT_SECOND;
    return;
  }

  if (fpEnrollState == FP_WAIT_SECOND) {
    int p = finger.getImage();
    if (p == FINGERPRINT_NOFINGER) return;
    if (p != FINGERPRINT_OK) return;

    p = finger.image2Tz(2);
    if (p != FINGERPRINT_OK) return;

    p = finger.createModel();
    if (p != FINGERPRINT_OK) return;

    p = finger.storeModel(currentEnrollFingerprintId);
    if (p != FINGERPRINT_OK) return;

    finishFingerprintEnroll(currentEnrollFingerprintId);
    return;
  }
}

bool checkUserInSupabase(const String& identifier, const String& method) {
  HTTPClient http;
  String url = SUPABASE_URL + "/rest/v1/users?select=id,name";

  if (method == "rfid") {
    url += "&rfid_uid=eq." + identifier;
  } else if (method == "fingerprint") {
    url += "&fingerprint_id=eq." + identifier;
  } else if (method == "id") {
    url += "&id=eq." + identifier;
  }

  http.begin(url);
  http.addHeader("apikey", SUPABASE_KEY);
  http.addHeader("Authorization", "Bearer " + SUPABASE_KEY);

  int httpCode = http.GET();
  bool found = false;

  if (httpCode == 200) {
    String payload = http.getString();
    JsonDocument doc;
    if (deserializeJson(doc, payload) == DeserializationError::Ok && doc.size() > 0) {
      lastMatchedUserId = doc[0]["id"].isNull() ? "" : doc[0]["id"].as<String>();
      lastMatchedUserName = doc[0]["name"].isNull() ? "" : doc[0]["name"].as<String>();
      found = true;
    }
  } else {
    Serial.println("Users lookup HTTP: " + String(httpCode));
  }
  http.end();
  return found;
}

void pollFaceUnlock() {
  HTTPClient http;
  String base = SUPABASE_URL + "/rest/v1/unlock_requests?select=id,user_id&processed=eq.false&order=";
  String url = base + "requested_at.desc&limit=1";
  http.begin(url);
  http.addHeader("apikey", SUPABASE_KEY);
  http.addHeader("Authorization", "Bearer " + SUPABASE_KEY);

  int code = http.GET();
  if (code == 400) {
    http.end();
    http.begin(base + "created_at.desc&limit=1");
    http.addHeader("apikey", SUPABASE_KEY);
    http.addHeader("Authorization", "Bearer " + SUPABASE_KEY);
    code = http.GET();
  }

  if (code == 200) {
    String payload = http.getString();
    JsonDocument doc;
    if (deserializeJson(doc, payload) == DeserializationError::Ok && doc.size() > 0) {
      String requestId = doc[0]["id"].as<String>();
      lastMatchedUserId = doc[0]["user_id"].isNull() ? "" : doc[0]["user_id"].as<String>();
      lastMatchedUserName = lastMatchedUserId.length() > 0 ? getUserNameById(lastMatchedUserId) : "";

      unlockDoor("FACE");
      logAccess("face");
      markRequestProcessed(requestId);
    }
  }
  http.end();
}

void markRequestProcessed(const String& requestId) {
  HTTPClient http;
  String url = SUPABASE_URL + "/rest/v1/unlock_requests?id=eq." + requestId;
  http.begin(url);
  http.addHeader("apikey", SUPABASE_KEY);
  http.addHeader("Authorization", "Bearer " + SUPABASE_KEY);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Prefer", "return=minimal");

  JsonDocument doc;
  doc["processed"] = true;
  String json;
  serializeJson(doc, json);
  int code = http.PATCH(json);
  Serial.println("PATCH unlock_requests (" + requestId + ") code: " + String(code));
  http.end();
}

String getUserNameById(const String& userId) {
  if (userId.length() == 0) return "";
  HTTPClient http;
  String url = SUPABASE_URL + "/rest/v1/users?select=name&id=eq." + userId + "&limit=1";
  http.begin(url);
  http.addHeader("apikey", SUPABASE_KEY);
  http.addHeader("Authorization", "Bearer " + SUPABASE_KEY);
  int code = http.GET();
  if (code != 200) {
    http.end();
    return "";
  }
  String payload = http.getString();
  http.end();
  JsonDocument doc;
  if (deserializeJson(doc, payload) != DeserializationError::Ok || doc.size() == 0) return "";
  return doc[0]["name"].isNull() ? "" : doc[0]["name"].as<String>();
}

String uidForLcd(const String& uid) {
  if (uid.length() <= 16) return uid;
  return uid.substring(uid.length() - 16);
}

void logAccess(const String& method) {
  HTTPClient http;
  String url = SUPABASE_URL + "/rest/v1/access_logs";
  http.begin(url);
  http.addHeader("apikey", SUPABASE_KEY);
  http.addHeader("Authorization", "Bearer " + SUPABASE_KEY);
  http.addHeader("Content-Type", "application/json");

  auto tryPost = [&](JsonDocument& doc) -> bool {
    String json;
    serializeJson(doc, json);
    int code = http.POST(json);
    Serial.println("POST access_logs code: " + String(code));
    if (code < 200 || code >= 300) {
      String resp = http.getString();
      if (resp.length() > 0) Serial.println("POST access_logs response: " + resp);
      Serial.println("POST access_logs payload: " + json);
      return false;
    }
    return true;
  };

  {
    JsonDocument doc;
    if (lastMatchedUserId.length() > 0) doc["user_id"] = lastMatchedUserId;
    doc["user_name"] = lastMatchedUserName.length() > 0 ? lastMatchedUserName : "Unknown";
    doc["method"] = method;
    doc["status"] = "success";
    if (tryPost(doc)) {
      http.end();
      return;
    }
  }

  {
    JsonDocument doc;
    if (lastMatchedUserId.length() > 0) doc["user_id"] = lastMatchedUserId;
    doc["method"] = method;
    doc["status"] = "success";
    if (tryPost(doc)) {
      http.end();
      return;
    }
  }

  {
    JsonDocument doc;
    doc["method"] = method;
    doc["status"] = "success";
    tryPost(doc);
  }

  http.end();
}
