import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import ResponsiveLayout from './components/Layout/ResponsiveLayout';
import './styles/theme.css';

// Lazy load components for better performance
const ModernDashboard = lazy(() => import('./components/Dashboard/ModernDashboard'));
const AssetManagement = lazy(() => import('./components/Assets/AssetManagement'));
const PatientManagement = lazy(() => import('./components/Patients/PatientManagement'));
const InventoryManagement = lazy(() => import('./components/Inventory/InventoryManagement'));
const FinancialManagement = lazy(() => import('./components/Financial/FinancialManagement'));
const CenterManagement = lazy(() => import('./components/Centers/CenterManagement'));
const Settings = lazy(() => import('./components/Settings/Settings'));
const Login = lazy(() => import('./components/Auth/Login'));
const LogoSettingsPage = lazy(() => import('./pages/Settings/LogoSettingsPage'));

// Create a client for React Query
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 1,
    },
  },
});

// Loading component
const LoadingSpinner = () => (
  <div className="flex items-center justify-center min-h-screen">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
    <span className="ml-3 text-gray-600">Loading...</span>
  </div>
);

// Protected route component
const ProtectedRoute = ({ children }) => {
  // Check if user is authenticated
  const isAuthenticated = () => {
    const token = localStorage.getItem('token');
    if (!token) return false;
    
    try {
      // Simple token validation
      const decoded = JSON.parse(atob(token.split('.')[1]));
      return decoded.exp > Date.now() / 1000;
    } catch {
      return false;
    }
  };
  
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }
  
  return children;
};

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <div className="App">
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 4000,
              style: {
                background: '#363636',
                color: '#fff',
              },
              success: {
                duration: 3000,
                iconTheme: {
                  primary: '#4aed88',
                  secondary: '#fff',
                },
              },
              error: {
                duration: 5000,
                iconTheme: {
                  primary: '#ef4444',
                  secondary: '#fff',
                },
              },
            }}
          />
          
          <Suspense fallback={<LoadingSpinner />}>
            <Routes>
              {/* Public Routes */}
              <Route path="/login" element={<Login />} />
              
              {/* Protected Routes */}
              <Route path="/" element={
                <ProtectedRoute>
                  <ResponsiveLayout />
                </ProtectedRoute>
              }>
                <Route index element={<Navigate to="/dashboard" replace />} />
                <Route path="dashboard" element={<ModernDashboard />} />
                
                {/* Asset Management */}
                <Route path="assets" element={<AssetManagement />} />
                <Route path="asset-categories" element={<AssetManagement />} />
                <Route path="asset-maintenance" element={<AssetManagement />} />
                <Route path="loaner-assets" element={<AssetManagement />} />
                
                {/* Inventory Management */}
                <Route path="expense-items" element={<InventoryManagement />} />
                <Route path="stock" element={<InventoryManagement />} />
                <Route path="purchase-orders" element={<InventoryManagement />} />
                <Route path="vendors" element={<InventoryManagement />} />
                
                {/* Patient Management */}
                <Route path="patients" element={<PatientManagement />} />
                <Route path="appointments" element={<PatientManagement />} />
                <Route path="medical-records" element={<PatientManagement />} />
                <Route path="billing" element={<PatientManagement />} />
                
                {/* Financial Management */}
                <Route path="chart-of-accounts" element={<FinancialManagement />} />
                <Route path="journal-entries" element={<FinancialManagement />} />
                <Route path="trial-balance" element={<FinancialManagement />} />
                <Route path="financial-reports" element={<FinancialManagement />} />
                
                {/* Center Management */}
                <Route path="centers" element={<CenterManagement />} />
                <Route path="departments" element={<CenterManagement />} />
                <Route path="staff" element={<CenterManagement />} />
                
                {/* Reports */}
                <Route path="analytics" element={<FinancialManagement />} />
                <Route path="asset-reports" element={<FinancialManagement />} />
                <Route path="patient-reports" element={<FinancialManagement />} />
                
                {/* Settings */}
                <Route path="settings" element={<Settings />} />
                <Route path="settings/logo" element={<LogoSettingsPage />} />
                <Route path="users" element={<Settings />} />
                <Route path="security" element={<Settings />} />
                <Route path="backup" element={<Settings />} />
              </Route>
              
              {/* 404 Page */}
              <Route path="*" element={
                <div className="flex items-center justify-center min-h-screen bg-gray-50">
                  <div className="text-center">
                    <div className="w-24 h-24 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-8">
                      <svg className="w-12 h-12 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.707.293H19a2 2 0 012 2v11a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <h1 className="text-6xl font-bold text-gray-900 mb-4">404</h1>
                    <p className="text-xl text-gray-600 mb-8">Page not found</p>
                    <button
                      onClick={() => window.history.back()}
                      className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      Go Back
                    </button>
                  </div>
                </div>
              } />
            </Routes>
          </Suspense>
        </div>
      </Router>
    </QueryClientProvider>
  );
}

export default App;
