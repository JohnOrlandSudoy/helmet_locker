import { useState } from 'react';
import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import AddUser from './pages/AddUser';
import Users from './pages/Users';
import AccessLogs from './pages/AccessLogs';
import { Toaster } from 'sonner';

function App() {
  const [currentPage, setCurrentPage] = useState('dashboard');

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <Dashboard />;
      case 'add-user':
        return <AddUser />;
      case 'users':
        return <Users />;
      case 'logs':
        return <AccessLogs />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <AuthProvider>
      <Toaster position="top-right" richColors theme="dark" />
      <ProtectedRoute>
        <Layout currentPage={currentPage} onNavigate={setCurrentPage}>
          {renderPage()}
        </Layout>
      </ProtectedRoute>
    </AuthProvider>
  );
}

export default App;
