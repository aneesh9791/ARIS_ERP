import React, { useState, useEffect } from 'react';

const Reports = () => {
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedReport, setSelectedReport] = useState('dashboard');
  const [dateRange, setDateRange] = useState('30');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [centerId, setCenterId] = useState('');
  const [exportFormat, setExportFormat] = useState('csv');

  const reportTypes = [
    { value: 'dashboard', label: 'Dashboard Overview', icon: '📊' },
    { value: 'financial', label: 'Financial Reports', icon: '💰' },
    { value: 'customers', label: 'Customer Analytics', icon: '👥' },
    { value: 'inventory', label: 'Inventory Reports', icon: '📦' },
    { value: 'sales', label: 'Sales Performance', icon: '📈' }
  ];

  const dateRanges = [
    { value: '7', label: 'Last 7 Days' },
    { value: '30', label: 'Last 30 Days' },
    { value: '90', label: 'Last 90 Days' },
    { value: '365', label: 'Last Year' }
  ];

  // Fetch report data
  useEffect(() => {
    if (selectedReport) {
      fetchReportData();
    }
  }, [selectedReport, dateRange, centerId]);

  const fetchReportData = async () => {
    setLoading(true);
    setError('');
    
    try {
      const params = new URLSearchParams({
        report_type: selectedReport,
        date_range: dateRange,
        center_id: centerId
      });
      
      const response = await fetch(`/api/reports/${selectedReport}?${params}`);
      const data = await response.json();
      
      if (response.ok) {
        setReportData(data);
      } else {
        setError(data.error || 'Failed to fetch report data');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    if (!reportData) return;
    
    try {
      setLoading(true);
      
      const exportData = {
        report_type: selectedReport,
        format: exportFormat,
        start_date: startDate,
        end_date: endDate,
        center_id: centerId
      };
      
      const response = await fetch('/api/reports/export', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(exportData)
      });
      
      if (response.ok) {
        // Create download link
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `report_${selectedReport}_${new Date().toISOString().split('T')[0]}.${exportFormat}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      } else {
        setError('Failed to export report');
      }
    } catch (err) {
      setError('Export failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const renderReportData = () => {
    if (!reportData) return null;

    switch (selectedReport) {
      case 'dashboard':
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="p-6">
                <h3 className="text-lg leading-6 font-medium text-gray-900">Revenue Overview</h3>
                <div className="mt-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <h4 className="text-sm font-medium text-gray-500">Total Revenue</h4>
                      <p className="text-2xl font-bold text-gray-900">${reportData.revenue?.total_revenue || 0}</p>
                    </div>
                    <div>
                      <h4 className="text-sm font-medium text-gray-500">Pending Revenue</h4>
                      <p className="text-2xl font-bold text-yellow-600">${reportData.revenue?.pending_revenue || 0}</p>
                    </div>
                  </div>
                  <div>
                      <h4 className="text-sm font-medium text-gray-500">Average Invoice</h4>
                      <p className="text-2xl font-bold text-gray-900">${reportData.revenue?.avg_invoice || 0}</p>
                    </div>
                </div>
              </div>
            </div>
            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="p-6">
                <h3 className="text-lg leading-6 font-medium text-gray-900">Customer Metrics</h3>
                <div className="mt-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <h4 className="text-sm font-medium text-gray-500">Total Customers</h4>
                      <p className="text-2xl font-bold text-gray-900">{reportData.customers?.total_customers || 0}</p>
                    </div>
                    <div>
                      <h4 className="text-sm font-medium text-gray-500">Active Customers</h4>
                      <p className="text-2xl font-bold text-green-600">{reportData.customers?.active_customers || 0}</p>
                    </div>
                    <div>
                      <h4 className="text-sm font-medium text-gray-500">New Customers</h4>
                      <p className="text-2xl font-bold text-blue-600">{reportData.customers?.new_customers || 0}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
        );
      case 'financial':
        return (
          <div className="space-y-6">
            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="p-6">
                <h3 className="text-lg leading-6 font-medium text-gray-900">Revenue by Month</h3>
                <div className="mt-4">
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Month</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Revenue</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Invoices</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Average</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {reportData.revenue_by_month?.map((month, index) => (
                          <tr key={index}>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{month.month}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${month.revenue}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{month.invoice_count}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{month.avg_invoice}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="p-6">
                <h3 className="text-lg leading-6 font-medium text-gray-900">Profit & Loss</h3>
                <div className="mt-4">
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <h4 className="text-sm font-medium text-gray-500">Total Revenue</h4>
                      <p className="text-2xl font-bold text-green-600">{reportData.profit_loss?.total_revenue || 0}</p>
                    </div>
                    <div>
                      <h4 className="text-sm font-medium text-gray-500">Total Expenses</h4>
                      <p className="text-2xl font-bold text-red-600">{reportData.profit_loss?.total_expenses || 0}</p>
                    </div>
                    <div>
                      <h4 className="text-sm font-medium text-gray-500">Net Profit</h4>
                      <p className={`text-2xl font-bold ${reportData.profit_loss?.net_profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {reportData.profit_loss?.net_profit || 0}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
        );
      default:
        return (
          <div className="text-center text-gray-500">
            <p>Select a report type to view data</p>
          </div>
        );
    }
  };

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      <div className="sm:flex sm:items-center">
        <div className="sm:flex-auto">
          <h1 className="text-2xl font-semibold text-gray-900">Reports</h1>
        </div>
      </div>

      <div className="mt-8 sm:mt-0 sm:ml-4 sm:pl-4">
        {/* Report Controls */}
        <div className="bg-white shadow rounded-lg mb-6">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-lg leading-6 font-medium text-gray-900">Report Controls</h3>
            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700">Report Type</label>
                <select
                  value={selectedReport}
                  onChange={(e) => setSelectedReport(e.target.value)}
                  className="mt-1 block w-full pl-3 pr-3 py-2 border border-gray-300 text-base rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                >
                  {reportTypes.map(type => (
                    <option key={type.value} value={type.value}>
                      {type.icon} {type.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Date Range</label>
                <select
                  value={dateRange}
                  onChange={(e) => setDateRange(e.target.value)}
                  className="mt-1 block w-full pl-3 pr-3 py-2 border border-gray-300 text-base rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                >
                  {dateRanges.map(range => (
                    <option key={range.value} value={range.value}>
                      {range.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Start Date</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="mt-1 block w-full pl-3 pr-3 py-2 border border-gray-300 text-base rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">End Date</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="mt-1 block w-full pl-3 pr-3 py-2 border border-gray-300 text-base rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Export Format</label>
                <select
                  value={exportFormat}
                  onChange={(e) => setExportFormat(e.target.value)}
                  className="mt-1 block w-full pl-3 pr-3 py-2 border border-gray-300 text-base rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="csv">CSV</option>
                  <option value="excel">Excel</option>
                </select>
              </div>

              <div className="flex space-x-4 mt-6">
                <button
                  onClick={fetchReportData}
                  disabled={loading}
                  className="inline-flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                >
                  {loading ? 'Generating...' : 'Generate Report'}
                </button>
                
                <button
                  onClick={handleExport}
                  disabled={loading || !reportData}
                  className="inline-flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50"
                >
                  {loading ? 'Exporting...' : 'Export'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="text-center py-4">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            <p className="mt-2 text-blue-600">Generating report...</p>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="rounded-md bg-red-50 p-4 mb-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 14a2 2 0 00-2 2v12a2 2 0 002 2 2zm2 0a6 6 0 016 6 016 0zm-3.094 6a1.5 1.5 0 015-1.5 1.5 0 01-1.5 1.5 0zm-3.094 6a1.5 1.5 0 015-1.5 1.5 0z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3 text-sm text-red-700">
                <p>{error}</p>
              </div>
            </div>
          </div>
        )}

        {/* Report Data */}
        {reportData && renderReportData()}
      </div>
    </div>
  );
};

export default Reports;
