import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase, type EnrollRequest } from './supabase';
import { subscribeToRow } from './realtime';

export async function getNextFingerprintId(): Promise<number> {
  const { data, error } = await supabase
    .from('users')
    .select('fingerprint_id')
    .not('fingerprint_id', 'is', null)
    .order('fingerprint_id', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;

  const currentMax = data?.fingerprint_id ?? 0;
  return currentMax + 1;
}

export async function createEnrollRequest(input: {
  type: EnrollRequest['type'];
  user_name: string;
  fingerprint_id?: number | null;
}): Promise<EnrollRequest> {
  const { data, error } = await supabase
    .from('enroll_requests')
    .insert({
      type: input.type,
      user_name: input.user_name,
      fingerprint_id: input.fingerprint_id ?? null,
      processed: false,
    })
    .select('*')
    .single();

  if (error) throw error;
  return data as EnrollRequest;
}

export function watchEnrollRequest(
  id: string,
  onUpdate: (row: EnrollRequest) => void,
  options?: { channelName?: string }
): RealtimeChannel {
  return subscribeToRow<EnrollRequest>('enroll_requests', id, onUpdate, options);
}

