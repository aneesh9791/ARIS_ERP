import React, { useState, useEffect, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';

// Import CSS
import './styles/output.css';
import './styles/theme.css';

// Lazy-loaded pages (code splitting — each page loads on demand)
const Login               = React.lazy(() => import('./pages/Login'));
const Dashboard           = React.lazy(() => import('./pages/Dashboard'));
const Patients            = React.lazy(() => import('./pages/Patients'));
const PIDManagement       = React.lazy(() => import('./pages/PIDManagement'));
const StudyManagement     = React.lazy(() => import('./pages/StudyManagement'));
const MasterDataSettings  = React.lazy(() => import('./pages/MasterDataSettings'));
const Reports             = React.lazy(() => import('./pages/Reports'));
const Centers             = React.lazy(() => import('./pages/Centers'));
const Customers           = React.lazy(() => import('./pages/Customers'));
const Billing             = React.lazy(() => import('./pages/Billing'));
const Invoices            = React.lazy(() => import('./pages/Invoices'));
const Equipment           = React.lazy(() => import('./pages/Equipment'));
const HR                  = React.lazy(() => import('./pages/HR'));
const Payroll             = React.lazy(() => import('./pages/Payroll'));
const Assets              = React.lazy(() => import('./pages/Assets'));
const AssetMaintenance    = React.lazy(() => import('./pages/AssetMaintenance'));
const Procurement         = React.lazy(() => import('./pages/Procurement'));
const Stock               = React.lazy(() => import('./pages/Stock'));
const PettyCash           = React.lazy(() => import('./pages/PettyCash'));
const StudyReporting      = React.lazy(() => import('./pages/StudyReporting'));
const Finance             = React.lazy(() => import('./pages/Finance'));
const Equity              = React.lazy(() => import('./pages/Equity'));
const ItemMaster          = React.lazy(() => import('./pages/ItemMaster'));
const SimpleSettingsPage  = React.lazy(() => import('./pages/Settings/SimpleSettingsPage'));
const UserManagement      = React.lazy(() => import('./pages/Settings/UserManagement'));
const RoleManagement      = React.lazy(() => import('./pages/Settings/RoleManagement'));
const MWLGatewaySettings  = React.lazy(() => import('./pages/Settings/MWLGatewaySettings'));
const AuditLog            = React.lazy(() => import('./pages/Settings/AuditLog'));
const PatientHistory      = React.lazy(() => import('./pages/PatientHistory'));
const ReferringPhysicians = React.lazy(() => import('./pages/ReferringPhysicians'));
import Layout from './components/Layout';

// Spinner shown while a lazy page chunk is loading
const PageSpinner = () => (
  <div className="flex h-screen items-center justify-center bg-slate-50">
    <div className="w-8 h-8 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
  </div>
);

// Permission-gated route — redirects to /dashboard if user lacks the required permission
// permission can be a string or an array of strings (any match = allowed)
const ProtectedRoute = ({ element, permission }) => {
  const user = (() => { try { return JSON.parse(localStorage.getItem('user')) || {}; } catch { return {}; } })();
  const perms = Array.isArray(user.permissions) ? user.permissions : [];
  const required = Array.isArray(permission) ? permission : (permission ? [permission] : []);
  const allowed = !required.length || perms.includes('ALL_ACCESS') || required.some(p => perms.includes(p));
  return allowed ? element : <Navigate to="/dashboard" replace />;
};

// Create QueryClient
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
    mutations: { retry: 1 },
  },
});

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('token');
    setIsAuthenticated(!!token);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <div className="App">
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 4000,
              style: { fontSize: '14px' },
              success: { iconTheme: { primary: '#0d9488', secondary: '#fff' } },
            }}
          />
          <Suspense fallback={<PageSpinner />}>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route
                path="/"
                element={isAuthenticated ? <Layout /> : <Login />}
              >
                <Route index element={<Dashboard />} />
                <Route path="dashboard"        element={<ProtectedRoute permission="DASHBOARD_VIEW"        element={<Dashboard />} />} />
                <Route path="patients"         element={<ProtectedRoute permission="PATIENT_VIEW"          element={<Patients />} />} />
                <Route path="patient-history"  element={<ProtectedRoute permission="PATIENT_VIEW"          element={<PatientHistory />} />} />
                <Route path="pid-management"   element={<ProtectedRoute permission="PATIENT_VIEW"          element={<PIDManagement />} />} />
                <Route path="study-management" element={<ProtectedRoute permission="STUDY_VIEW"            element={<StudyManagement />} />} />
                <Route path="study-reporting"       element={<ProtectedRoute permission="STUDY_VIEW"       element={<StudyReporting />} />} />
                <Route path="referring-physicians" element={<ProtectedRoute permission="PHYSICIAN_VIEW"    element={<ReferringPhysicians />} />} />
                <Route path="finance"          element={<ProtectedRoute permission="JE_VIEW"               element={<Finance />} />} />
                <Route path="equity"           element={<ProtectedRoute permission="EQUITY_VIEW"           element={<Equity />} />} />
                <Route path="petty-cash"       element={<ProtectedRoute permission="PETTY_CASH_VIEW"       element={<PettyCash />} />} />
                <Route path="hr"               element={<ProtectedRoute permission={['HR_DASHBOARD_VIEW','EMPLOYEE_VIEW','ATTENDANCE_VIEW','ATTENDANCE_MARK','LEAVE_APPLY','LEAVE_APPROVE','PAYROLL_VIEW']} element={<HR />} />} />
                <Route path="payroll"          element={<ProtectedRoute permission="PAYROLL_VIEW"          element={<Payroll />} />} />
                <Route path="assets"           element={<ProtectedRoute permission="ASSET_VIEW"            element={<Assets />} />} />
                <Route path="asset-maintenance"element={<ProtectedRoute permission="ASSET_MAINTENANCE_VIEW"element={<AssetMaintenance />} />} />
                <Route path="procurement"      element={<ProtectedRoute permission={['PR_VIEW','PO_VIEW','GRN_VIEW']} element={<Procurement />} />} />
                <Route path="stock"            element={<ProtectedRoute permission="INVENTORY_VIEW"        element={<Stock />} />} />
                <Route path="item-master"      element={<ProtectedRoute permission="INVENTORY_VIEW"        element={<ItemMaster />} />} />
                <Route path="reports"          element={<ProtectedRoute permission="REPORTS_VIEW"          element={<Reports />} />} />
                <Route path="master-data"      element={<ProtectedRoute permission={['MASTER_DATA_VIEW','RAD_REPORTING_MASTER_VIEW']} element={<MasterDataSettings />} />} />
                <Route path="settings"         element={<ProtectedRoute permission="MASTER_DATA_VIEW"      element={<SimpleSettingsPage />} />} />
                <Route path="settings/users"   element={<ProtectedRoute permission={['USER_VIEW','USER_WRITE']} element={<UserManagement />} />} />
                <Route path="settings/roles"   element={<ProtectedRoute permission={['USER_VIEW','USER_WRITE']} element={<RoleManagement />} />} />
                <Route path="settings/mwl"     element={<ProtectedRoute permission="MWL_VIEW"              element={<MWLGatewaySettings />} />} />
                <Route path="settings/audit"   element={<ProtectedRoute permission={['USER_VIEW','USER_WRITE']} element={<AuditLog />} />} />
                <Route path="centers"          element={<ProtectedRoute permission="CENTER_VIEW"           element={<Centers />} />} />
                <Route path="customers"        element={<ProtectedRoute permission="PATIENT_VIEW"          element={<Customers />} />} />
                <Route path="billing"          element={<ProtectedRoute permission="BILLING_VIEW"          element={<Billing />} />} />
                <Route path="invoices"         element={<ProtectedRoute permission="BILLING_VIEW"          element={<Invoices />} />} />
                <Route path="scanners"         element={<ProtectedRoute permission="MWL_VIEW"              element={<Equipment />} />} />
              </Route>
            </Routes>
          </Suspense>
        </div>
      </Router>
    </QueryClientProvider>
  );
}

export default App;
