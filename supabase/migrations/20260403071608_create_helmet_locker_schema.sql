/*
  # Helmet Locker Database Schema

  ## Overview
  Complete database schema for Helmet Locker IoT system supporting RFID, fingerprint, and face recognition authentication.

  ## New Tables

  ### 1. users
  Stores registered users with their biometric and RFID data
  - `id` (uuid, primary key) - Unique user identifier
  - `name` (text, required) - User's full name
  - `rfid_uid` (text, nullable) - RFID card UID
  - `fingerprint_id` (integer, nullable) - Fingerprint sensor template ID
  - `face_descriptor` (jsonb, nullable) - Face recognition descriptor array
  - `created_at` (timestamptz) - Registration timestamp
  - `updated_at` (timestamptz) - Last update timestamp

  ### 2. access_logs
  Records all access attempts and successful unlocks
  - `id` (uuid, primary key) - Log entry identifier
  - `user_id` (uuid, nullable) - Reference to users table
  - `user_name` (text) - User name at time of access
  - `method` (text) - Authentication method: 'rfid', 'fingerprint', or 'face'
  - `status` (text) - Access result: 'success' or 'failed'
  - `created_at` (timestamptz) - Access attempt timestamp

  ### 3. enroll_requests
  Temporary storage for enrollment requests from admin dashboard to ESP32
  - `id` (uuid, primary key) - Request identifier
  - `type` (text) - Enrollment type: 'rfid' or 'fingerprint'
  - `user_name` (text) - Name of user being enrolled
  - `fingerprint_id` (integer, nullable) - Assigned fingerprint ID for fingerprint enrollments
  - `processed` (boolean) - Whether ESP32 has processed this request
  - `rfid_uid` (text, nullable) - Captured RFID UID after processing
  - `created_at` (timestamptz) - Request creation timestamp

  ### 4. unlock_requests
  Queue for remote unlock commands from admin dashboard
  - `id` (uuid, primary key) - Request identifier
  - `user_id` (uuid, nullable) - User requesting unlock
  - `method` (text) - Unlock method: 'admin' or 'face'
  - `processed` (boolean) - Whether ESP32 has processed this request
  - `created_at` (timestamptz) - Request creation timestamp

  ## Security
  - Row Level Security (RLS) enabled on all tables
  - Authenticated users can read all data
  - Only authenticated users can insert/update/delete
  - Public read access disabled by default
*/

-- Create users table
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  rfid_uid text UNIQUE,
  fingerprint_id integer UNIQUE,
  face_descriptor jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create access_logs table
CREATE TABLE IF NOT EXISTS access_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  user_name text NOT NULL,
  method text NOT NULL CHECK (method IN ('rfid', 'fingerprint', 'face')),
  status text NOT NULL CHECK (status IN ('success', 'failed')),
  created_at timestamptz DEFAULT now()
);

-- Create enroll_requests table
CREATE TABLE IF NOT EXISTS enroll_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('rfid', 'fingerprint')),
  user_name text NOT NULL,
  fingerprint_id integer,
  processed boolean DEFAULT false,
  rfid_uid text,
  created_at timestamptz DEFAULT now()
);

-- Create unlock_requests table
CREATE TABLE IF NOT EXISTS unlock_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  method text NOT NULL CHECK (method IN ('admin', 'face')),
  processed boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE access_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE enroll_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE unlock_requests ENABLE ROW LEVEL SECURITY;

-- RLS Policies for users table
CREATE POLICY "Authenticated users can read all users"
  ON users FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert users"
  ON users FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update users"
  ON users FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete users"
  ON users FOR DELETE
  TO authenticated
  USING (true);

-- RLS Policies for access_logs table
CREATE POLICY "Authenticated users can read access logs"
  ON access_logs FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert access logs"
  ON access_logs FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update access logs"
  ON access_logs FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete access logs"
  ON access_logs FOR DELETE
  TO authenticated
  USING (true);

-- RLS Policies for enroll_requests table
CREATE POLICY "Authenticated users can read enroll requests"
  ON enroll_requests FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert enroll requests"
  ON enroll_requests FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update enroll requests"
  ON enroll_requests FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete enroll requests"
  ON enroll_requests FOR DELETE
  TO authenticated
  USING (true);

-- RLS Policies for unlock_requests table
CREATE POLICY "Authenticated users can read unlock requests"
  ON unlock_requests FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert unlock requests"
  ON unlock_requests FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update unlock requests"
  ON unlock_requests FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete unlock requests"
  ON unlock_requests FOR DELETE
  TO authenticated
  USING (true);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_users_rfid ON users(rfid_uid);
CREATE INDEX IF NOT EXISTS idx_users_fingerprint ON users(fingerprint_id);
CREATE INDEX IF NOT EXISTS idx_access_logs_user_id ON access_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_access_logs_created_at ON access_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_enroll_requests_processed ON enroll_requests(processed);
CREATE INDEX IF NOT EXISTS idx_unlock_requests_processed ON unlock_requests(processed);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();