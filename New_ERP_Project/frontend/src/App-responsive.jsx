import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import ResponsiveLayout from './components/Layout/ResponsiveLayout';
import './styles/theme.css';
import './styles/responsive.css';

// Lazy load components for better performance
const ResponsiveDashboard = lazy(() => import('./components/Dashboard/ResponsiveDashboard'));
const AssetManagement = lazy(() => import('./components/Assets/AssetManagement'));
const PatientManagement = lazy(() => import('./components/Patients/PatientManagement'));
const InventoryManagement = lazy(() => import('./components/Inventory/InventoryManagement'));
const FinancialManagement = lazy(() => import('./components/Financial/FinancialManagement'));
const CenterManagement = lazy(() => import('./components/Centers/CenterManagement'));
const Settings = lazy(() => import('./components/Settings/Settings'));
const Login = lazy(() => import('./components/Auth/Login'));

// Create a client for React Query
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000, // 5 minutes
    },
    mutations: {
      retry: 1,
    },
  },
});

// Loading component with responsive design
const LoadingSpinner = () => (
  <div className="min-h-screen bg-gray-50 flex items-center justify-center">
    <div className="text-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
      <span className="text-gray-600">Loading...</span>
    </div>
  </div>
);

// Mobile-friendly loading component
const MobileLoadingSpinner = () => (
  <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
    <div className="text-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-3"></div>
      <span className="text-sm text-gray-600">Loading...</span>
    </div>
  </div>
);

// Protected route component
const ProtectedRoute = ({ children }) => {
  // Check if user is authenticated
  const isAuthenticated = localStorage.getItem('token') !== null;
  
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  
  return children;
};

// Error boundary component
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
          <div className="text-center max-w-md">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-red-600 mb-2">Something went wrong</h1>
            <p className="text-gray-600 mb-4">
              {this.state.error?.message || 'An unexpected error occurred'}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

function App() {
  // Detect if mobile on initial load
  const [isMobile, setIsMobile] = React.useState(false);
  
  React.useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  return (
    <ErrorBoundary>
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
                  fontSize: isMobile ? '14px' : '16px',
                  maxWidth: isMobile ? '300px' : '400px',
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
            
            <Suspense fallback={isMobile ? <MobileLoadingSpinner /> : <LoadingSpinner />}>
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
                  <Route path="dashboard" element={<ResponsiveDashboard />} />
                  
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
                  <Route path="users" element={<Settings />} />
                  <Route path="security" element={<Settings />} />
                  <Route path="backup" element={<Settings />} />
                </Route>
                
                {/* 404 Page */}
                <Route path="*" element={
                  <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
                    <div className="text-center max-w-md">
                      <div className="w-24 h-24 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-8">
                        <svg className="w-12 h-12 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.707.293H19a2 2 0 012 2v11a2 2 0 01-2 2z" />
                        </svg>
                      </div>
                      <h1 className="text-4xl font-bold text-gray-900 mb-4">404</h1>
                      <p className="text-xl text-gray-600 mb-8">Page not found</p>
                      <button
                        onClick={() => window.history.back()}
                        className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors w-full sm:w-auto"
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
    </ErrorBoundary>
  );
}

export default App;
