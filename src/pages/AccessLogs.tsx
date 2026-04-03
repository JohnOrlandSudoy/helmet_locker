import { useState, useEffect } from 'react';
import { Activity, Filter } from 'lucide-react';
import { supabase, AccessLog } from '../lib/supabase';
import { toast } from 'sonner';
import { subscribeToTable } from '../lib/realtime';
import { getErrorMessage } from '../lib/errors';

export default function AccessLogs() {
  const [logs, setLogs] = useState<AccessLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'success' | 'failed'>('all');

  useEffect(() => {
    loadLogs();

    const channel = subscribeToTable('access_logs', loadLogs, { channelName: 'access_logs_page' });

    return () => {
      channel.unsubscribe();
    };
  }, []);

  const loadLogs = async () => {
    try {
      const { data, error } = await supabase
        .from('access_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      setLogs(data || []);
    } catch (error) {
      toast.error(getErrorMessage(error) ?? 'Failed to load access logs');
    } finally {
      setLoading(false);
    }
  };

  const filteredLogs = logs.filter((log) => {
    if (filter === 'all') return true;
    return log.status === filter;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-gray-400" />
            <span className="text-gray-400 text-sm font-medium">Filter by status:</span>
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <button
              onClick={() => setFilter('all')}
              className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filter === 'all'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilter('success')}
              className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filter === 'success'
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              Success
            </button>
            <button
              onClick={() => setFilter('failed')}
              className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filter === 'failed'
                  ? 'bg-red-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              Failed
            </button>
          </div>
        </div>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-800 border-b border-gray-700">
              <tr>
                <th className="px-4 sm:px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  User
                </th>
                <th className="px-4 sm:px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider hidden sm:table-cell">
                  Method
                </th>
                <th className="px-4 sm:px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-4 sm:px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider hidden md:table-cell">
                  Time
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-gray-400">
                    No access logs found
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-800/50 transition-colors">
                    <td className="px-4 sm:px-6 py-4">
                      <div className="flex items-start gap-3">
                        <div className={`p-2 rounded-lg ${
                          log.status === 'success' ? 'bg-green-600/10' : 'bg-red-600/10'
                        }`}>
                          <Activity className={`w-4 h-4 ${
                            log.status === 'success' ? 'text-green-500' : 'text-red-500'
                          }`} />
                        </div>
                        <div>
                          <p className="text-white font-medium">{log.user_name}</p>
                          <p className="text-xs text-gray-400 sm:hidden mt-1 capitalize">
                            via {log.method}
                          </p>
                          <p className="text-xs text-gray-400 md:hidden mt-1">
                            {new Date(log.created_at).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 sm:px-6 py-4 hidden sm:table-cell">
                      <span className="text-xs px-3 py-1 bg-gray-800 rounded-full text-gray-400 capitalize">
                        {log.method}
                      </span>
                    </td>
                    <td className="px-4 sm:px-6 py-4">
                      <span className={`text-xs px-3 py-1 rounded-full font-medium ${
                        log.status === 'success'
                          ? 'bg-green-600/20 text-green-400'
                          : 'bg-red-600/20 text-red-400'
                      }`}>
                        {log.status}
                      </span>
                    </td>
                    <td className="px-4 sm:px-6 py-4 text-sm text-gray-400 hidden md:table-cell">
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="text-center text-gray-400 text-sm">
        Showing {filteredLogs.length} of {logs.length} total logs
      </div>
    </div>
  );
}
