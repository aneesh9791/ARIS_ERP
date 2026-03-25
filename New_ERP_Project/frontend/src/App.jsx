import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';

// Import CSS
import './styles/output.css';
import './styles/theme.css';

// Pages
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Patients from './pages/Patients';
import PIDManagement from './pages/PIDManagement';
import StudyManagement from './pages/StudyManagement';
import MasterDataSettings from './pages/MasterDataSettings';
import Reports from './pages/Reports';
import Centers from './pages/Centers';
import Customers from './pages/Customers';
import Billing from './pages/Billing';
import Invoices from './pages/Invoices';
import Equipment from './pages/Equipment';
import HR from './pages/HR';
import Payroll from './pages/Payroll';
import Assets from './pages/Assets';
import AssetMaintenance from './pages/AssetMaintenance';
import Procurement from './pages/Procurement';
import Stock from './pages/Stock';
import PettyCash from './pages/PettyCash';
import StudyReporting from './pages/StudyReporting';
import Finance from './pages/Finance';
import Equity from './pages/Equity';
import ItemMaster from './pages/ItemMaster';
import SimpleSettingsPage from './pages/Settings/SimpleSettingsPage';
import UserManagement from './pages/Settings/UserManagement';
import RoleManagement from './pages/Settings/RoleManagement';
import MWLGatewaySettings from './pages/Settings/MWLGatewaySettings';
import AuditLog from './pages/Settings/AuditLog';
import PatientHistory from './pages/PatientHistory';
import Layout from './components/Layout';

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
              <Route path="study-reporting"  element={<ProtectedRoute permission="STUDY_VIEW"            element={<StudyReporting />} />} />
              <Route path="finance"          element={<ProtectedRoute permission="JE_VIEW"               element={<Finance />} />} />
              <Route path="equity"           element={<ProtectedRoute permission="EQUITY_VIEW"           element={<Equity />} />} />
              <Route path="petty-cash"       element={<ProtectedRoute permission="PETTY_CASH_VIEW"       element={<PettyCash />} />} />
              <Route path="hr"               element={<ProtectedRoute permission="EMPLOYEE_VIEW"         element={<HR />} />} />
              <Route path="payroll"          element={<ProtectedRoute permission="PAYROLL_VIEW"          element={<Payroll />} />} />
              <Route path="assets"           element={<ProtectedRoute permission="ASSET_VIEW"            element={<Assets />} />} />
              <Route path="asset-maintenance"element={<ProtectedRoute permission="ASSET_MAINTENANCE_VIEW"element={<AssetMaintenance />} />} />
              <Route path="procurement"      element={<ProtectedRoute permission="PO_VIEW"               element={<Procurement />} />} />
              <Route path="stock"            element={<ProtectedRoute permission="INVENTORY_VIEW"        element={<Stock />} />} />
              <Route path="item-master"      element={<ProtectedRoute permission="INVENTORY_VIEW"        element={<ItemMaster />} />} />
              <Route path="reports"          element={<ProtectedRoute permission="REPORTS_VIEW"          element={<Reports />} />} />
              <Route path="master-data"      element={<ProtectedRoute permission={['MASTER_DATA_VIEW','STUDY_CATALOG_VIEW','STUDY_PRICING_VIEW','RAD_REPORTING_MASTER_VIEW']} element={<MasterDataSettings />} />} />
              <Route path="settings"         element={<ProtectedRoute permission="MASTER_DATA_VIEW"      element={<SimpleSettingsPage />} />} />
              <Route path="settings/users"   element={<ProtectedRoute permission="USER_CREATE"           element={<UserManagement />} />} />
              <Route path="settings/roles"   element={<ProtectedRoute permission="USER_ASSIGN_ROLE"      element={<RoleManagement />} />} />
              <Route path="settings/mwl"     element={<ProtectedRoute permission="MWL_VIEW"              element={<MWLGatewaySettings />} />} />
              <Route path="settings/audit"   element={<ProtectedRoute permission="USER_CREATE"            element={<AuditLog />} />} />
              <Route path="centers"          element={<ProtectedRoute permission="CENTER_VIEW"           element={<Centers />} />} />
              <Route path="customers"        element={<ProtectedRoute permission="PATIENT_VIEW"          element={<Customers />} />} />
              <Route path="billing"          element={<ProtectedRoute permission="BILLING_VIEW"          element={<Billing />} />} />
              <Route path="invoices"         element={<ProtectedRoute permission="BILLING_VIEW"          element={<Invoices />} />} />
              <Route path="scanners"         element={<ProtectedRoute permission="SCANNER_VIEW"          element={<Equipment />} />} />
            </Route>
          </Routes>
        </div>
      </Router>
    </QueryClientProvider>
  );
}

export default App;
