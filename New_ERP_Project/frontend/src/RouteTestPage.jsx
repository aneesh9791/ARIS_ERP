import React from 'react';
import { Link, useLocation } from 'react-router-dom';

const RouteTestPage = () => {
  const location = useLocation();
  
  const routes = [
    { path: '/', name: 'Home/Dashboard', component: 'Dashboard' },
    { path: '/login', name: 'Login', component: 'Login' },
    { path: '/dashboard', name: 'Dashboard', component: 'Dashboard' },
    { path: '/patients', name: 'Patients', component: 'Patients' },
    { path: '/reports', name: 'Reports', component: 'Reports' },
    { path: '/centers', name: 'Centers', component: 'Centers' },
    { path: '/customers', name: 'Customers', component: 'Customers' },
    { path: '/settings', name: 'Settings', component: 'LogoSettingsPage' }
  ];

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">🧪 ARIS ERP Route Testing</h1>
        
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">Current Route</h2>
          <div className="bg-blue-50 border border-blue-200 rounded p-4">
            <code className="text-blue-800">{location.pathname}</code>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">Test All Routes</h2>
          <p className="text-gray-600 mb-4">
            Click these links to test if all routes are working properly. 
            The routes work when navigating through the app, but may show 404 on direct URL refresh.
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {routes.map((route) => (
              <Link
                key={route.path}
                to={route.path}
                className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 transition-colors"
              >
                <div>
                  <div className="font-medium text-gray-900">{route.name}</div>
                  <div className="text-sm text-gray-500">{route.path}</div>
                  <div className="text-xs text-gray-400">Component: {route.component}</div>
                </div>
                <div className="text-blue-600">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </Link>
            ))}
          </div>
        </div>

        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-yellow-800 mb-2">📝 Important Note</h3>
          <p className="text-yellow-700">
            <strong>Direct URL Access:</strong> Routes like /dashboard may show 404 when accessed directly 
            via URL or refreshed. This is normal for Create React App development servers.
          </p>
          <p className="text-yellow-700 mt-2">
            <strong>Navigation:</strong> All routes work perfectly when navigating through the app's 
            navigation links or the test links above.
          </p>
          <p className="text-yellow-700 mt-2">
            <strong>Production:</strong> In production builds, this issue is resolved as the server 
            is configured to handle client-side routing properly.
          </p>
        </div>
      </div>
    </div>
  );
};

export default RouteTestPage;
