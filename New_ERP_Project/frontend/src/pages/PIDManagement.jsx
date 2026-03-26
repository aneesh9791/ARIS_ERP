import React, { useState, useEffect, useCallback } from 'react';

const AUTH_HEADER = () => {
  const token = localStorage.getItem('token');
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
};

// ─── UI Components ────────────────────────────────────────────────────────
const Badge = ({ children, color }) => {
  const colors = {
    green: 'bg-green-100 text-green-700',
    red: 'bg-red-100 text-red-700',
    blue: 'bg-blue-100 text-blue-700',
    pink: 'bg-pink-100 text-pink-700',
    slate: 'bg-slate-100 text-slate-600',
    orange: 'bg-orange-100 text-orange-700',
    yellow: 'bg-yellow-100 text-yellow-700',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${colors[color] || colors.slate}`}>
      {children}
    </span>
  );
};

const inputCls = `w-full px-3 py-2 text-sm border border-slate-300 rounded-lg text-slate-800
  focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500
  placeholder:text-slate-400 transition-colors`;

// ─── PID Search Component ─────────────────────────────────────────────────────
const PIDSearch = ({ onPatientSelect, onClose }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);

  const handleSearch = async (term) => {
    setSearchTerm(term);
    if (term.length < 2) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    try {
      const res = await fetch(`/api/patients/search-by-pid`, {
        method: 'POST',
        headers: AUTH_HEADER(),
        body: JSON.stringify({ pid: term }),
      });
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.patients || []);
      }
    } catch (err) {
      console.error('Search error:', err);
    } finally {
      setSearching(false);
    }
  };

  const debouncedSearch = useCallback(
    debounce(handleSearch, 300),
    []
  );

  useEffect(() => {
    debouncedSearch(searchTerm);
  }, [searchTerm, debouncedSearch]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden">
        <div className="bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
          <h2 className="text-xl font-semibold text-gray-900">Search by PID</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6">
          <div className="relative">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-4 py-3 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              placeholder="Enter PID (AR********)..."
              autoFocus
            />
            <svg className="absolute right-3 top-3.5 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            {searching && (
              <div className="absolute right-10 top-3.5">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-teal-500"></div>
              </div>
            )}
          </div>

          {searchResults.length > 0 && (
            <div className="mt-4 border border-gray-200 rounded-lg max-h-96 overflow-y-auto">
              {searchResults.map((patient) => (
                <div
                  key={patient.id}
                  onClick={() => onPatientSelect(patient)}
                  className="p-4 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-1">
                        <span className="font-medium text-gray-900">{patient.name}</span>
                        <Badge color="blue">{patient.pid}</Badge>
                      </div>
                      <div className="text-sm text-gray-600 space-y-1">
                        <div>📞 {patient.phone}</div>
                        {patient.email && <div>📧 {patient.email}</div>}
                        <div>📍 {patient.city}, {patient.state}</div>
                        <div>🎂 DOB: {new Date(patient.date_of_birth).toLocaleDateString()}</div>
                        <div>🆔 PID Generated: {new Date(patient.pid_generated_at).toLocaleDateString()}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <Badge color="green">✓ Active</Badge>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {searchTerm.length >= 2 && !searching && searchResults.length === 0 && (
            <div className="mt-4 text-center py-8 text-gray-500">
              <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <p>No patients found with PID matching "{searchTerm}"</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Accession Number Search Component ─────────────────────────────────────────
const AccessionSearch = ({ onStudySelect, onClose }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);

  const handleSearch = async (term) => {
    setSearchTerm(term);
    if (term.length < 2) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    try {
      const res = await fetch(`/api/studies/accession/${encodeURIComponent(term)}`, {
        headers: AUTH_HEADER(),
      });
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.studies ? [data.study] : []);
      }
    } catch (err) {
      console.error('Search error:', err);
    } finally {
      setSearching(false);
    }
  };

  const debouncedSearch = useCallback(
    debounce(handleSearch, 300),
    []
  );

  useEffect(() => {
    debouncedSearch(searchTerm);
  }, [searchTerm, debouncedSearch]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden">
        <div className="bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
          <h2 className="text-xl font-semibold text-gray-900">Search by Accession Number</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6">
          <div className="relative">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-4 py-3 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              placeholder="Enter Accession Number (ACC-YY-********)..."
              autoFocus
            />
            <svg className="absolute right-3 top-3.5 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            {searching && (
              <div className="absolute right-10 top-3.5">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-teal-500"></div>
              </div>
            )}
          </div>

          {searchResults.length > 0 && (
            <div className="mt-4 border border-gray-200 rounded-lg max-h-96 overflow-y-auto">
              {searchResults.map((study) => (
                <div
                  key={study.id}
                  onClick={() => onStudySelect(study)}
                  className="p-4 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-1">
                        <span className="font-medium text-gray-900">{study.study_name}</span>
                        <Badge color="blue">{study.accession_number}</Badge>
                      </div>
                      <div className="text-sm text-gray-600 space-y-1">
                        <div>👤 {study.patient_name}</div>
                        <div>🏥 {study.modality}</div>
                        <div>📅 {new Date(study.scheduled_date).toLocaleDateString()}</div>
                        <div>💰 Total: ₹{study.total_amount}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <Badge color={study.payment_status === 'PAID' ? 'green' : 'orange'}>
                        {study.payment_status}
                      </Badge>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {searchTerm.length >= 2 && !searching && searchResults.length === 0 && (
            <div className="mt-4 text-center py-8 text-gray-500">
              <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <p>No studies found with Accession Number matching "{searchTerm}"</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Send to Local System Component ─────────────────────────────────────────
const SendToLocalSystem = ({ patient, onClose, onSuccess }) => {
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);

  const handleSend = async () => {
    setSending(true);
    setResult(null);
    
    try {
      const res = await fetch(`/api/patients/${patient.id}/send-to-local-system`, {
        method: 'POST',
        headers: AUTH_HEADER(),
      });
      
      const data = await res.json();
      setResult(data);
      
      if (res.ok) {
        setTimeout(() => {
          onSuccess(data);
          onClose();
        }, 2000);
      }
    } catch (err) {
      setResult({
        success: false,
        message: 'Network error occurred',
        error: err.message
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg">
        <div className="bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
          <h2 className="text-xl font-semibold text-gray-900">Send to Local System</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6">
          <div className="mb-6">
            <div className="flex items-center space-x-3 mb-4">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                <span className="text-blue-600 font-semibold">{patient.name.charAt(0)}</span>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">{patient.name}</h3>
                <p className="text-sm text-gray-600">PID: {patient.pid}</p>
                <p className="text-sm text-gray-600">{patient.phone}</p>
              </div>
            </div>
            
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="font-semibold text-blue-900 mb-2">Patient Demographics</h4>
              <div className="text-sm text-blue-800 space-y-1">
                <div><strong>PID:</strong> {patient.pid}</div>
                <div><strong>Name:</strong> {patient.name}</div>
                <div><strong>Phone:</strong> {patient.phone}</div>
                <div><strong>Email:</strong> {patient.email || 'N/A'}</div>
                <div><strong>Address:</strong> {patient.address}, {patient.city}, {patient.state}</div>
                <div><strong>DOB:</strong> {new Date(patient.date_of_birth).toLocaleDateString()}</div>
                {patient.id_proof_type && (
                  <div><strong>ID Proof:</strong> {patient.id_proof_type} - {patient.id_proof_number}</div>
                )}
              </div>
            </div>
          </div>

          {result && (
            <div className={`mb-6 p-4 rounded-lg ${
              result.success 
                ? 'bg-green-50 border border-green-200 text-green-700' 
                : 'bg-red-50 border border-red-200 text-red-700'
            }`}>
              <div className="font-semibold mb-2">
                {result.success ? '✅ Success!' : '❌ Failed'}
              </div>
              <div className="text-sm">
                {result.message}
              </div>
              {result.patient_data && (
                <div className="mt-3 text-xs">
                  <div><strong>Endpoint:</strong> {result.api_endpoint}</div>
                  <div><strong>Response Code:</strong> {result.response_code}</div>
                </div>
              )}
            </div>
          )}

          <div className="flex space-x-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              {result && result.success ? 'Close' : 'Cancel'}
            </button>
            {!result && (
              <button
                onClick={handleSend}
                disabled={sending}
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 disabled:opacity-50 transition-colors"
              >
                {sending ? 'Sending...' : 'Send Demographics'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Main PID Management Component ─────────────────────────────────────────
const PIDManagement = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('pid');
  const [showPIDSearch, setShowPIDSearch] = useState(false);
  const [showAccessionSearch, setShowAccessionSearch] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [showSendModal, setShowSendModal] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/patients/stats/pid-accession', {
        headers: AUTH_HEADER(),
      });
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      } else {
        setError('Failed to fetch PID statistics');
      }
    } catch (err) {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const handlePatientSelected = (patient) => {
    setSelectedPatient(patient);
    setShowPIDSearch(false);
  };

  const handleStudySelected = (_study) => {
    setShowAccessionSearch(false);
  };

  const handleSendSuccess = (result) => {
    setSuccess('Patient demographics sent successfully to local system');
    fetchStats();
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setSuccess(`Copied: ${text}`);
    setTimeout(() => setSuccess(''), 2000);
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">PID & Accession Management</h1>
        <p className="text-gray-600">Manage Patient IDs and Accession Numbers with Local System Integration</p>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg text-green-700">
          {success}
        </div>
      )}

      {/* Statistics Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="p-3 bg-blue-100 rounded-lg">
                <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total Patients</p>
                <p className="text-2xl font-bold text-gray-900">{stats.total_patients || 0}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="p-3 bg-green-100 rounded-lg">
                <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Patients with PIDs</p>
                <p className="text-2xl font-bold text-gray-900">{stats.patients_with_pids || 0}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="p-3 bg-purple-100 rounded-lg">
                <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                </svg>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total Accession Numbers</p>
                <p className="text-2xl font-bold text-gray-900">{stats.total_accession_numbers || 0}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="p-3 bg-orange-100 rounded-lg">
                <svg className="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Highest PID</p>
                <p className="text-lg font-bold text-gray-900 font-mono">{stats.highest_pid || 'N/A'}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="bg-white rounded-lg shadow mb-6">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex">
            {[
              { id: 'pid', label: 'PID Search', icon: '🆔' },
              { id: 'accession', label: 'Study Accession', icon: '🏥' },
              { id: 'billing', label: 'Billing Accession', icon: '💰' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-4 px-6 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === tab.id
                    ? 'border-teal-500 text-teal-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <span className="mr-2">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="p-6">
          {activeTab === 'pid' && (
            <div className="text-center">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Search Patients by PID</h3>
              <p className="text-gray-600 mb-6">Find patients quickly using their unique Patient ID (AR********)</p>
              <button
                onClick={() => setShowPIDSearch(true)}
                className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 flex items-center space-x-2 mx-auto"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <span>Search by PID</span>
              </button>
            </div>
          )}

          {activeTab === 'accession' && (
            <div className="text-center">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Search Studies by Accession Number</h3>
              <p className="text-gray-600 mb-6">Find studies using their unique Accession Number (ACC-YY-********)</p>
              <button
                onClick={() => setShowAccessionSearch(true)}
                className="bg-purple-600 text-white px-6 py-3 rounded-lg hover:bg-purple-700 flex items-center space-x-2 mx-auto"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                <span>Search by Accession</span>
              </button>
            </div>
          )}

          {activeTab === 'billing' && (
            <div className="text-center">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Billing Accession Search</h3>
              <p className="text-gray-600 mb-6">Find billing records using Accession Numbers</p>
              <button
                onClick={() => setShowAccessionSearch(true)}
                className="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 flex items-center space-x-2 mx-auto"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span>Search Billing</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Recent Activity */}
      {stats && (
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-800">Recent Activity</h2>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-3">Latest PID Generated</h3>
                <div className="text-lg font-mono text-blue-600">{stats.highest_pid || 'N/A'}</div>
              </div>
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-3">Latest Accession Number</h3>
                <div className="text-lg font-mono text-purple-600">{stats.highest_accession_number || 'N/A'}</div>
              </div>
            </div>
            
            <div className="mt-6 pt-6 border-t border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-medium text-gray-700">System Integration</h3>
                  <p className="text-sm text-gray-500">Last updated: {stats.last_updated ? new Date(stats.last_updated).toLocaleString() : 'Never'}</p>
                </div>
                <button
                  onClick={() => {
                    setSuccess('PID and Accession system is active and working');
                    setTimeout(() => setSuccess(''), 3000);
                  }}
                  className="bg-teal-600 text-white px-4 py-2 rounded-lg hover:bg-teal-700 text-sm"
                >
                  Check System Status
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      {showPIDSearch && (
        <PIDSearch
          onPatientSelect={handlePatientSelected}
          onClose={() => setShowPIDSearch(false)}
        />
      )}

      {showAccessionSearch && (
        <AccessionSearch
          onStudySelect={handleStudySelected}
          onClose={() => setShowAccessionSearch(false)}
        />
      )}

      {selectedPatient && showSendModal && (
        <SendToLocalSystem
          patient={selectedPatient}
          onClose={() => setShowSendModal(false)}
          onSuccess={handleSendSuccess}
        />
      )}
    </div>
  );
};

// ─── Utility Functions ─────────────────────────────────────────────────────
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

export default PIDManagement;
