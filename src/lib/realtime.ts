import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabase';

type PostgresChangeRowHandler<Row> = (row: Row) => void;

export function subscribeToTable(
  table: string,
  onChange: () => void,
  options?: { channelName?: string }
): RealtimeChannel {
  const channelName = options?.channelName ?? `realtime_${table}_${crypto.randomUUID()}`;

  return supabase
    .channel(channelName)
    .on('postgres_changes', { event: '*', schema: 'public', table }, () => {
      onChange();
    })
    .subscribe();
}

export function subscribeToRow<Row>(
  table: string,
  id: string,
  onUpdate: PostgresChangeRowHandler<Row>,
  options?: { channelName?: string }
): RealtimeChannel {
  const channelName = options?.channelName ?? `realtime_${table}_${id}`;

  return supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table, filter: `id=eq.${id}` },
      (payload) => {
        onUpdate(payload.new as Row);
      }
    )
    .subscribe();
}

