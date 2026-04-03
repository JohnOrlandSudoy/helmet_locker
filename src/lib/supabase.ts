import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type User = {
  id: string;
  name: string;
  rfid_uid: string | null;
  fingerprint_id: number | null;
  face_descriptor: number[] | null;
  created_at: string;
  updated_at: string;
};

export type AccessLog = {
  id: string;
  user_id: string | null;
  user_name: string;
  method: 'rfid' | 'fingerprint' | 'face';
  status: 'success' | 'failed';
  created_at: string;
};

export type EnrollRequest = {
  id: string;
  type: 'rfid' | 'fingerprint';
  user_name: string;
  fingerprint_id: number | null;
  processed: boolean;
  rfid_uid: string | null;
  created_at: string;
};

export type UnlockRequest = {
  id: string;
  user_id: string | null;
  processed: boolean;
  requested_at: string;
};
