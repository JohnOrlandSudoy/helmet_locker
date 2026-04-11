#include <SPI.h>
#include <MFRC522.h>
#include <LiquidCrystal_I2C.h>
#include <Wire.h>

// ================== RFID PINS ==================
#define SS_PIN   10
#define RST_PIN   4

MFRC522 rfid(SS_PIN, RST_PIN);

// ================== LCD PINS (Bagong SCL mo) ==================
LiquidCrystal_I2C lcd(0x27, 16, 2);   // Palitan sa 0x3F kung hindi gumana

void setup() {
  Wire.begin(21, 3);        // SDA = GPIO21, SCL = GPIO3 (bagong SCL mo)

  lcd.init();
  lcd.backlight();
  lcd.clear();

  lcd.setCursor(0, 0);
  lcd.print("Helmet Locker");
  lcd.setCursor(0, 1);
  lcd.print("RFID Test Mode");
  delay(2000);
  lcd.clear();

  SPI.begin(12, 13, 11, 10);   // SCK, MISO, MOSI, SS
  rfid.PCD_Init();

  lcd.setCursor(0, 0);
  lcd.print("Tap RFID Card");
  lcd.setCursor(0, 1);
  lcd.print("to show UID");
}

void loop() {
  if (!rfid.PICC_IsNewCardPresent() || !rfid.PICC_ReadCardSerial()) {
    return;
  }

  String uid = "";
  for (byte i = 0; i < rfid.uid.size; i++) {
    uid += String(rfid.uid.uidByte[i], HEX);
    if (i < rfid.uid.size - 1) uid += " ";
  }

  // Display sa LCD
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("UID DETECTED!");

  lcd.setCursor(0, 1);
  lcd.print(uid);

  rfid.PICC_HaltA();
  delay(3000);               // 3 seconds na display

  // Balik sa waiting screen
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("Tap next card");
  lcd.setCursor(0, 1);
  lcd.print("to show UID");
}