import { useState, useEffect } from 'react';
import { Search, Trash2, CheckCircle, XCircle } from 'lucide-react';
import { supabase, User } from '../lib/supabase';
import { toast } from 'sonner';
import { subscribeToTable } from '../lib/realtime';
import { getErrorMessage } from '../lib/errors';

export default function Users() {
  const [users, setUsers] = useState<User[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    loadUsers();

    const channel = subscribeToTable('users', loadUsers, { channelName: 'users_changes_list' });

    return () => {
      channel.unsubscribe();
    };
  }, []);

  const loadUsers = async () => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setUsers(data || []);
    } catch (error) {
      toast.error(getErrorMessage(error) ?? 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete ${name}?`)) return;

    setDeleting(id);
    try {
      const { error } = await supabase.from('users').delete().eq('id', id);

      if (error) throw error;
      toast.success('User deleted successfully');
    } catch (error) {
      toast.error(getErrorMessage(error) ?? 'Failed to delete user');
    } finally {
      setDeleting(null);
    }
  };

  const filteredUsers = users.filter((user) =>
    user.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search users by name..."
            className="w-full pl-10 pr-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
          />
        </div>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-800 border-b border-gray-700">
              <tr>
                <th className="px-4 sm:px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-4 sm:px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider hidden md:table-cell">
                  RFID
                </th>
                <th className="px-4 sm:px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider hidden lg:table-cell">
                  Fingerprint
                </th>
                <th className="px-4 sm:px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider hidden sm:table-cell">
                  Face
                </th>
                <th className="px-4 sm:px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider hidden xl:table-cell">
                  Created
                </th>
                <th className="px-4 sm:px-6 py-4 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-400">
                    {searchTerm ? 'No users found' : 'No users registered yet'}
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-800/50 transition-colors">
                    <td className="px-4 sm:px-6 py-4">
                      <div>
                        <p className="text-white font-medium">{user.name}</p>
                        <div className="flex gap-2 mt-2 md:hidden">
                          {user.rfid_uid && (
                            <span className="text-xs px-2 py-1 bg-blue-600/20 text-blue-400 rounded">
                              RFID
                            </span>
                          )}
                          {user.fingerprint_id && (
                            <span className="text-xs px-2 py-1 bg-purple-600/20 text-purple-400 rounded">
                              FP
                            </span>
                          )}
                          {user.face_descriptor && (
                            <span className="text-xs px-2 py-1 bg-green-600/20 text-green-400 rounded">
                              Face
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 sm:px-6 py-4 hidden md:table-cell">
                      {user.rfid_uid ? (
                        <div className="flex items-center gap-2">
                          <CheckCircle className="w-4 h-4 text-green-500" />
                          <span className="text-sm text-gray-400 font-mono">{user.rfid_uid}</span>
                        </div>
                      ) : (
                        <XCircle className="w-4 h-4 text-gray-600" />
                      )}
                    </td>
                    <td className="px-4 sm:px-6 py-4 hidden lg:table-cell">
                      {user.fingerprint_id ? (
                        <div className="flex items-center gap-2">
                          <CheckCircle className="w-4 h-4 text-green-500" />
                          <span className="text-sm text-gray-400">ID: {user.fingerprint_id}</span>
                        </div>
                      ) : (
                        <XCircle className="w-4 h-4 text-gray-600" />
                      )}
                    </td>
                    <td className="px-4 sm:px-6 py-4 hidden sm:table-cell">
                      {user.face_descriptor ? (
                        <CheckCircle className="w-4 h-4 text-green-500" />
                      ) : (
                        <XCircle className="w-4 h-4 text-gray-600" />
                      )}
                    </td>
                    <td className="px-4 sm:px-6 py-4 text-sm text-gray-400 hidden xl:table-cell">
                      {new Date(user.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 sm:px-6 py-4 text-right">
                      <button
                        onClick={() => handleDelete(user.id, user.name)}
                        disabled={deleting === user.id}
                        className="text-red-400 hover:text-red-300 disabled:opacity-50 transition-colors"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="text-center text-gray-400 text-sm">
        Total: {filteredUsers.length} {filteredUsers.length === 1 ? 'user' : 'users'}
      </div>
    </div>
  );
}
