# Helmet Locker Admin + Hardware Guide (Step-by-Step)

This guide explains how to use the Admin Dashboard and the ESP32 locker hardware to register users (RFID / Fingerprint / Face) and unlock the solenoid.

---

## 1) What You Need

### Admin (Web App)
- A working Supabase project (URL + Anon key configured in `.env`)
- An Admin user in Supabase Auth (email/password)
- Phone (recommended) for Face registration and Face unlock

### Hardware
- ESP32-S3
- MFRC522 RFID reader + RFID cards/tags
- AS608 Fingerprint sensor
- 16x2 I2C LCD (0x27 usually)
- 5V Relay module (to switch the solenoid)
- 12V Solenoid lock + 12V power supply
- Buzzer + Red LED + resistors

---

## 2) Wiring (Based on Current ESP32 Code)

These are the pins used by the firmware at `espcode/esps3_code.cpp`.

### 2.1 MFRC522 RFID (SPI)
MFRC522 **must use 3.3V**.

MFRC522 → ESP32-S3
- VCC → 3.3V
- GND → GND
- SDA/SS → GPIO10
- SCK → GPIO12
- MOSI → GPIO11
- MISO → GPIO13
- RST → GPIO4
- IRQ → (not connected)

### 2.2 AS608 Fingerprint (UART)
AS608 → ESP32-S3
- VCC → 3.3V (recommended; if module is 5V-only use level shifter)
- GND → GND
- TX → GPIO16 (ESP RX2)
- RX → GPIO17 (ESP TX2)

### 2.3 LCD 16x2 (I2C)
I2C LCD → ESP32-S3
- VCC → 3.3V (recommended). If you power LCD at 5V, use an I2C level shifter.
- GND → GND
- SDA → GPIO21
- SCL → GPIO3

### 2.4 Relay + Solenoid
Relay module → ESP32-S3
- IN → GPIO9
- VCC → 5V (relay supply)
- GND → GND (must be common with ESP32 GND)

Relay contacts (12V solenoid)
- 12V+ → Relay COM
- Relay NO → Solenoid +
- Solenoid − → 12V−

Add a flyback diode across the solenoid:
- Diode stripe (cathode) → Solenoid +
- Diode other side (anode) → Solenoid −

### 2.5 Buzzer + LED
- BUZZER (+) → GPIO8 (use resistor or transistor driver depending on buzzer type)
- BUZZER (−) → GND
- LED anode (+) → GPIO5 through 220Ω resistor
- LED cathode (−) → GND

---

## 3) Supabase Setup Checklist

### 3.1 Tables
Tables expected by the app/firmware:
- `users`
- `enroll_requests`
- `unlock_requests`
- `access_logs`

### 3.2 RLS Policies (Important)
Admin Dashboard inserts `users` using an authenticated session.
ESP32 reads/updates enroll + unlock requests and inserts access logs using the anon key.

If your device cannot update `enroll_requests` or insert `access_logs`, the admin will not receive enrolled UIDs/IDs.

Confirm:
- `enroll_requests`: anon can SELECT pending + UPDATE processed
- `unlock_requests`: anon can SELECT pending + UPDATE processed
- `users`: anon can SELECT lookup by `rfid_uid` and `fingerprint_id`
- `access_logs`: anon can INSERT

---

## 4) Flashing ESP32 Firmware (PlatformIO)

### 4.1 Build/Upload
- Open the PlatformIO project
- Put the code from `espcode/esps3_code.cpp` into your `src/main.cpp` (or include it correctly)
- Upload to ESP32-S3

### 4.2 Serial Monitor
Always keep Serial Monitor open during testing.
Look for logs like:
- `ENROLL MODE → rfid`
- `RFID detected: ...`
- `PATCH enroll_requests (...) code: 2xx`
- `POST access_logs code: 2xx`

---

## 5) Using the Admin Dashboard (Step-by-Step)

### 5.1 Login
1. Open the dashboard in your phone browser (or install as PWA).
2. Login using the Supabase Auth admin email/password.

### 5.2 Register a New User (Manual Save)
1. Go to **Add User**
2. Enter the user’s full name

#### A) Enroll RFID
1. Tap **RFID** enrollment
2. The dashboard creates a row in `enroll_requests` (`type='rfid'`, `processed=false`)
3. On the locker LCD you should see: `Enroll RFID / Tap card now`
4. Tap the RFID card on the reader
5. ESP32 updates that request row with `rfid_uid` and `processed=true`
6. The dashboard should show the RFID UID as enrolled

If the LCD shows `Registered`, that card is already in the `users` table.

#### B) Enroll Fingerprint
1. Tap **Fingerprint** enrollment
2. The dashboard creates a row in `enroll_requests` with `type='fingerprint'` and a `fingerprint_id`
3. Follow the LCD prompts:
   - Place finger
   - Remove finger
   - Place the same finger again
4. After success, the dashboard should show the fingerprint ID as enrolled

#### C) Enroll Face (Phone Camera)
1. Tap **Face Capture**
2. Allow camera permission (front camera)
3. Follow the steps shown in the UI (Front, Left, Right) and keep your face inside the guide
4. After success, the face descriptor is stored in the form

#### D) Save User (creates row in `users`)
1. Press **Save User**
2. If successful, the user is inserted into `users`
3. Verify in **Users** page that RFID / FP / Face are present

If you see “row violates row-level security policy for table users”, you are not authenticated or your `users` insert policy is missing.

---

## 6) Normal Use (Unlocking)

### 6.1 RFID Unlock
1. Tap a registered RFID card
2. ESP32 checks `users` by `rfid_uid`
3. If found, it unlocks the relay/solenoid and logs `access_logs`
4. If not found, LCD shows `Not Register! / Please enroll`

### 6.2 Fingerprint Unlock
1. Place registered finger
2. ESP32 searches the stored templates
3. If the template ID exists and matches a user in Supabase, it unlocks and logs
4. If not registered, LCD shows `Not Register! / Enroll Finger`

### 6.3 Face Unlock (Mobile → Unlock Request)
1. On the dashboard, go to **Dashboard**
2. Tap **Face Unlock**
3. The app matches your face to a registered user
4. If matched, the app inserts `unlock_requests` (processed=false)
5. ESP32 polls `unlock_requests`, unlocks, then marks processed=true

### 6.4 Quick Unlock (Admin Button)
1. Tap **Quick Unlock**
2. The app inserts an `unlock_requests` row
3. ESP32 polls, unlocks, then marks processed=true

---

## 7) Troubleshooting (Common)

### 7.1 Admin doesn’t receive RFID UID after tap
Check in this order:
1. On the locker LCD, do you see `Enroll Saved`?
2. In Supabase table `enroll_requests`, does `processed` become true and `rfid_uid` get filled?
3. In Serial Monitor, do you see `PATCH enroll_requests ... code: 2xx`?
4. If PATCH shows 401/403 → fix RLS policies for anon UPDATE on `enroll_requests`
5. If the row updates in Supabase but Admin UI doesn’t update → enable Realtime replication for `enroll_requests`

### 7.2 Access logs not appearing
1. Look for `POST access_logs code: ...` in Serial
2. If 400, the response will show which column is missing/wrong
3. Ensure the `access_logs` schema matches what the device sends:
   - `method`: 'rfid' | 'fingerprint' | 'face'
   - `status`: 'success' | 'failed'
   - `user_name` is required (NOT NULL)

### 7.3 Face models 404 on deployed
If you didn’t upload face-api model files to `/public/models`, the app uses a CDN fallback. If still failing, clear PWA cache and reload.
