import { useState, useEffect } from 'react';
import { Users, Activity, Unlock, Clock } from 'lucide-react';
import { supabase, AccessLog } from '../lib/supabase';
import { toast } from 'sonner';
import { subscribeToTable } from '../lib/realtime';
import { getErrorMessage } from '../lib/errors';

export default function Dashboard() {
  const [stats, setStats] = useState({
    totalUsers: 0,
    accessToday: 0,
  });
  const [recentLogs, setRecentLogs] = useState<AccessLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [unlocking, setUnlocking] = useState(false);

  useEffect(() => {
    loadData();

    const logsChannel = subscribeToTable('access_logs', loadData, { channelName: 'access_logs_changes' });
    const usersChannel = subscribeToTable('users', loadData, { channelName: 'users_changes' });
    const unlockChannel = subscribeToTable('unlock_requests', loadData, { channelName: 'unlock_requests_changes' });

    return () => {
      logsChannel.unsubscribe();
      usersChannel.unsubscribe();
      unlockChannel.unsubscribe();
    };
  }, []);

  const loadData = async () => {
    try {
      const { data: users } = await supabase.from('users').select('id');

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const { data: todayLogs } = await supabase
        .from('access_logs')
        .select('id')
        .gte('created_at', today.toISOString());

      const { data: logs } = await supabase
        .from('access_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);

      setStats({
        totalUsers: users?.length || 0,
        accessToday: todayLogs?.length || 0,
      });

      setRecentLogs(logs || []);
    } catch (error) {
      toast.error(getErrorMessage(error) ?? 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const handleUnlock = async () => {
    setUnlocking(true);
    try {
      const { error } = await supabase
        .from('unlock_requests')
        .insert({ method: 'admin', processed: false });

      if (error) throw error;

      toast.success('Unlock request sent to locker');
    } catch (error) {
      toast.error(getErrorMessage(error) ?? 'Failed to send unlock request');
    } finally {
      setUnlocking(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 hover:border-blue-500 transition-all">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm font-medium">Total Users</p>
              <p className="text-3xl font-bold text-white mt-2">{stats.totalUsers}</p>
            </div>
            <div className="bg-blue-600/10 p-3 rounded-lg">
              <Users className="w-8 h-8 text-blue-500" />
            </div>
          </div>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 hover:border-green-500 transition-all">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm font-medium">Access Today</p>
              <p className="text-3xl font-bold text-white mt-2">{stats.accessToday}</p>
            </div>
            <div className="bg-green-600/10 p-3 rounded-lg">
              <Activity className="w-8 h-8 text-green-500" />
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl p-6 col-span-1 sm:col-span-2 lg:col-span-1 hover:shadow-lg hover:shadow-blue-500/20 transition-all">
          <button
            onClick={handleUnlock}
            disabled={unlocking}
            className="w-full h-full flex flex-col items-center justify-center gap-3 disabled:opacity-50"
          >
            <Unlock className="w-10 h-10 text-white" />
            <span className="text-white font-semibold text-lg">
              {unlocking ? 'Unlocking...' : 'Quick Unlock'}
            </span>
          </button>
        </div>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="p-6 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-blue-500" />
            <h2 className="text-xl font-semibold text-white">Recent Activity</h2>
          </div>
        </div>

        <div className="divide-y divide-gray-800">
          {recentLogs.length === 0 ? (
            <div className="p-8 text-center text-gray-400">
              No recent activity
            </div>
          ) : (
            recentLogs.map((log) => (
              <div key={log.id} className="p-4 sm:p-6 hover:bg-gray-800/50 transition-colors">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-4">
                    <div className={`p-2 rounded-lg ${
                      log.status === 'success' ? 'bg-green-600/10' : 'bg-red-600/10'
                    }`}>
                      <Activity className={`w-5 h-5 ${
                        log.status === 'success' ? 'text-green-500' : 'text-red-500'
                      }`} />
                    </div>
                    <div>
                      <p className="text-white font-medium">{log.user_name}</p>
                      <div className="flex flex-wrap items-center gap-2 mt-1">
                        <span className="text-xs px-2 py-1 bg-gray-800 rounded text-gray-400 capitalize">
                          {log.method}
                        </span>
                        <span className={`text-xs px-2 py-1 rounded font-medium ${
                          log.status === 'success'
                            ? 'bg-green-600/20 text-green-400'
                            : 'bg-red-600/20 text-red-400'
                        }`}>
                          {log.status}
                        </span>
                      </div>
                    </div>
                  </div>
                  <span className="text-sm text-gray-400">
                    {new Date(log.created_at).toLocaleString()}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
