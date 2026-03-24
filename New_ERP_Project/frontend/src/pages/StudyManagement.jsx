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
    purple: 'bg-purple-100 text-purple-700',
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

// ─── Study Creation Modal ─────────────────────────────────────────────────
const CreateStudyModal = ({ patient, onClose, onCreated }) => {
  const [form, setForm] = useState({
    study_code: '',
    center_id: '',
    priority: 'ROUTINE',
    scheduled_date: '',
    scheduled_time: '09:00',
    radiologist_code: '',
    notes: '',
    contrast_used: false,
    emergency_study: false,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [studyTypes, setStudyTypes] = useState([]);
  const [centerModalities, setCenterModalities] = useState([]);
  const [centers, setCenters] = useState([]);
  const [radiologists, setRadiologists] = useState([]);
  const [costEstimate, setCostEstimate] = useState(null);

  const userCenterId = (() => {
    try { const u = JSON.parse(localStorage.getItem('user') || '{}'); return u.center_id || u.centerId || ''; }
    catch { return ''; }
  })();

  // When center changes, reload study types for that center and its active modalities
  useEffect(() => {
    if (!form.center_id) return;
    const loadForCenter = async () => {
      try {
        const [studyRes, modRes] = await Promise.all([
          fetch(`/api/masters/study-definitions?active_only=true&center_id=${form.center_id}`, { headers: AUTH_HEADER() }),
          fetch(`/api/masters/center-modalities?center_id=${form.center_id}`, { headers: AUTH_HEADER() }),
        ]);
        if (studyRes.ok) { const d = await studyRes.json(); setStudyTypes(d.studies || []); }
        if (modRes.ok)   { const d = await modRes.json();   setCenterModalities(d.modalities || []); }
      } catch (err) {
        console.error('Failed to load center study data:', err);
      }
    };
    loadForCenter();
    // Reset study selection when center changes
    setForm(f => ({ ...f, study_code: '' }));
  }, [form.center_id]);

  useEffect(() => {
    const loadCenters = async () => {
      try {
        const res = await fetch('/api/centers', { headers: AUTH_HEADER() });
        if (res.ok) {
          const data = await res.json();
          const realCenters = (data.centers || []).filter(c => c.corporate_entity_id != null);
          setCenters(realCenters);
        }
      } catch (err) {
        console.error('Failed to load centers:', err);
      }
    };

    const loadRadiologists = async () => {
      try {
        const res = await fetch('/api/masters/radiologist-master', { headers: AUTH_HEADER() });
        if (res.ok) {
          const data = await res.json();
          setRadiologists(data.radiologists || []);
        }
      } catch (err) {
        console.error('Failed to load radiologists:', err);
      }
    };

    loadCenters();
    loadRadiologists();
    // Default to user's center
    if (userCenterId) setForm(f => ({ ...f, center_id: String(userCenterId) }));
  }, []);

  const calculateCost = useCallback(() => {
    if (!form.study_code) {
      setCostEstimate(null);
      return;
    }

    const studyType = studyTypes.find(st => st.study_code === form.study_code);
    if (!studyType) {
      setCostEstimate(null);
      return;
    }

    let baseRate = studyType.center_price || studyType.base_rate || 0;
    let radiologistFee = 0;

    // Add contrast charge
    if (form.contrast_used) {
      baseRate += studyType.contrast_rate || 0;
    }

    // Add emergency charge
    if (form.emergency_study) {
      baseRate += studyType.emergency_rate || 0;
    }

    // Add weekend charge
    if (form.scheduled_date) {
      const date = new Date(form.scheduled_date);
      const dayOfWeek = date.getDay();
      if (dayOfWeek === 0 || dayOfWeek === 6) { // Sunday or Saturday
        baseRate += studyType.weekend_rate || 0;
      }
    }

    // Calculate radiologist fee
    const radiologist = radiologists.find(r => r.radiologist_code === form.radiologist_code);
    if (radiologist) {
      if (radiologist.contract_type === 'PER_STUDY') {
        radiologistFee = radiologist.per_study_rate || 0;
      }
    }

    const totalCost = baseRate + radiologistFee;
    const taxAmount = totalCost * (studyType.tax_rate || 0);
    const totalWithTax = totalCost + taxAmount;

    setCostEstimate({
      baseRate,
      radiologistFee,
      taxAmount,
      totalCost: totalWithTax,
      breakdown: {
        study: studyType.study_name,
        modality: studyType.modality,
        base: studyType.base_rate,
        contrast: form.contrast_used ? studyType.contrast_rate : 0,
        emergency: form.emergency_study ? studyType.emergency_rate : 0,
        weekend: form.scheduled_date && (new Date(form.scheduled_date).getDay() === 0 || new Date(form.scheduled_date).getDay() === 6) ? studyType.weekend_rate : 0,
        radiologist: radiologistFee,
        tax: taxAmount,
      }
    });
  }, [form.study_code, form.contrast_used, form.emergency_study, form.scheduled_date, form.radiologist_code, studyTypes, radiologists]);

  useEffect(() => {
    calculateCost();
  }, [calculateCost]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm(f => ({ 
      ...f, 
      [name]: type === 'checkbox' ? checked : value 
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    
    try {
      const res = await fetch(`/api/patients/${patient.id}/studies`, {
        method: 'POST',
        headers: AUTH_HEADER(),
        body: JSON.stringify(form),
      });
      
      if (res.ok) {
        const data = await res.json();
        onCreated(data.study);
        onClose();
      } else {
        const errorData = await res.json();
        setError(errorData.message || 'Failed to create study');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
          <h2 className="text-xl font-semibold text-gray-900">Create Study</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          {/* Patient Information */}
          <div className="bg-blue-50 p-4 rounded-lg mb-6">
            <h3 className="text-sm font-semibold text-blue-900 mb-2">Patient Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <span className="font-medium">Name:</span> {patient.name}
              </div>
              <div>
                <span className="font-medium">PID:</span> {patient.pid || 'N/A'}
              </div>
              <div>
                <span className="font-medium">Phone:</span> {patient.phone}
              </div>
              <div>
                <span className="font-medium">Email:</span> {patient.email || 'N/A'}
              </div>
            </div>
          </div>

          {/* Study Configuration */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Study Configuration</h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Study Type *</label>
                  <select
                    name="study_code"
                    value={form.study_code}
                    onChange={handleChange}
                    className={inputCls}
                    required
                  >
                    <option value="">Select Study Type</option>
                    {studyTypes
                      .filter(s => centerModalities.length === 0 || centerModalities.includes(s.modality))
                      .map(study => (
                        <option key={study.study_code || study.id} value={study.study_code}>
                          {study.study_name}{study.is_contrast_study ? ' · Contrast' : ''} ({study.modality})
                        </option>
                      ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Center *</label>
                  <select
                    name="center_id"
                    value={form.center_id}
                    onChange={handleChange}
                    className={inputCls}
                    required
                  >
                    <option value="">Select Center</option>
                    {centers.map(center => (
                      <option key={center.id} value={center.id}>
                        {center.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Priority *</label>
                  <select
                    name="priority"
                    value={form.priority}
                    onChange={handleChange}
                    className={inputCls}
                    required
                  >
                    <option value="ROUTINE">Routine</option>
                    <option value="URGENT">Urgent</option>
                    <option value="STAT">Stat</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Scheduled Date *</label>
                    <input
                      type="date"
                      name="scheduled_date"
                      value={form.scheduled_date}
                      onChange={handleChange}
                      className={inputCls}
                      min={new Date().toISOString().split('T')[0]}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Scheduled Time *</label>
                    <input
                      type="time"
                      name="scheduled_time"
                      value={form.scheduled_time}
                      onChange={handleChange}
                      className={inputCls}
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Radiologist</label>
                  <select
                    name="radiologist_code"
                    value={form.radiologist_code}
                    onChange={handleChange}
                    className={inputCls}
                  >
                    <option value="">Select Radiologist (Optional)</option>
                    {radiologists.map(radiologist => (
                      <option key={radiologist.radiologist_code} value={radiologist.radiologist_code}>
                        Dr. {radiologist.radiologist_name} ({radiologist.specialty})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                  <textarea
                    name="notes"
                    value={form.notes}
                    onChange={handleChange}
                    className={inputCls}
                    placeholder="Additional notes or instructions"
                    rows="3"
                  />
                </div>

                <div className="space-y-2">
                  <label className="flex items-center space-x-3">
                    <input
                      type="checkbox"
                      name="contrast_used"
                      checked={form.contrast_used}
                      onChange={handleChange}
                      className="rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                    />
                    <span className="text-sm text-gray-700">Contrast Required</span>
                  </label>

                  <label className="flex items-center space-x-3">
                    <input
                      type="checkbox"
                      name="emergency_study"
                      checked={form.emergency_study}
                      onChange={handleChange}
                      className="rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                    />
                    <span className="text-sm text-gray-700">Emergency Study</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Cost Estimation */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Cost Estimation</h3>
              
              {costEstimate ? (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">Base Rate:</span>
                      <span>₹{costEstimate.breakdown.base.toFixed(2)}</span>
                    </div>
                    {costEstimate.breakdown.contrast > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="font-medium">Contrast:</span>
                        <span>₹{costEstimate.breakdown.contrast.toFixed(2)}</span>
                      </div>
                    )}
                    {costEstimate.breakdown.emergency > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="font-medium">Emergency:</span>
                        <span>₹{costEstimate.breakdown.emergency.toFixed(2)}</span>
                      </div>
                    )}
                    {costEstimate.breakdown.weekend > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="font-medium">Weekend:</span>
                        <span>₹{costEstimate.breakdown.weekend.toFixed(2)}</span>
                      </div>
                    )}
                    {costEstimate.radiologistFee > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="font-medium">Radiologist Fee:</span>
                        <span>₹{costEstimate.radiologistFee.toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">Tax:</span>
                      <span>₹{costEstimate.taxAmount.toFixed(2)}</span>
                    </div>
                    <div className="border-t border-green-300 pt-2 mt-2">
                      <div className="flex justify-between">
                        <span className="font-semibold text-green-900">Total Cost:</span>
                        <span className="font-bold text-green-900 text-lg">₹{costEstimate.totalCost.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center text-gray-500">
                  Select a study type to see cost estimation
                </div>
              )}
            </div>
          </div>

          {/* Form Actions */}
          <div className="flex justify-end space-x-3 pt-6 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Creating Study...' : 'Create Study'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ─── Patient Search Modal ─────────────────────────────────────────────────────
const PatientSearchModal = ({ onPatientSelect, onClose }) => {
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
      const res = await fetch(`/api/patients/quick-search?search_term=${encodeURIComponent(term)}&limit=10`, {
        headers: AUTH_HEADER(),
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

  const getMatchTypeBadge = (patient) => {
    if (patient.pid && searchTerm.toUpperCase().includes(patient.pid)) {
      return <Badge color="blue">PID</Badge>;
    }
    if (patient.name && patient.name.toLowerCase().includes(searchTerm.toLowerCase())) {
      return <Badge color="green">NAME</Badge>;
    }
    if (patient.phone && patient.phone.includes(searchTerm)) {
      return <Badge color="orange">PHONE</Badge>;
    }
    if (patient.email && patient.email.toLowerCase().includes(searchTerm.toLowerCase())) {
      return <Badge color="pink">EMAIL</Badge>;
    }
    return <Badge color="slate">UNKNOWN</Badge>;
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden">
        <div className="bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
          <h2 className="text-xl font-semibold text-gray-900">Search Patient</h2>
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
              placeholder="Search by name, phone, email, or PID..."
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
                        {patient.pid && (
                          <Badge color="blue">{patient.pid}</Badge>
                        )}
                        {getMatchTypeBadge(patient)}
                      </div>
                      <div className="text-sm text-gray-600 space-y-1">
                        <div>📞 {patient.phone}</div>
                        {patient.email && <div>📧 {patient.email}</div>}
                        <div>📍 {patient.city}, {patient.state}</div>
                        {patient.date_of_birth && (
                          <div>🎂 DOB: {new Date(patient.date_of_birth).toLocaleDateString()}</div>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <Badge color={patient.active ? 'green' : 'red'}>
                        {patient.active ? 'Active' : 'Inactive'}
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
              <p>No patients found matching "{searchTerm}"</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Main Study Management Component ─────────────────────────────────────────
const StudyManagement = () => {
  const [studies, setStudies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showPatientSearch, setShowPatientSearch] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [showCreateStudy, setShowCreateStudy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterDate, setFilterDate] = useState('');


  const fetchStudies = useCallback(async () => {
    setLoading(true);
    try {
      let url = '/api/studies';
      const params = new URLSearchParams();
      
      if (filterStatus !== 'all') {
        params.append('status', filterStatus);
      }
      if (filterDate) {
        params.append('date', filterDate);
      }
      
      if (params.toString()) {
        url += `?${params.toString()}`;
      }

      const res = await fetch(url, { headers: AUTH_HEADER() });
      if (res.ok) {
        const data = await res.json();
        setStudies(data.studies || []);
      } else {
        setError('Failed to fetch studies');
      }
    } catch (err) {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterDate]);

  useEffect(() => {
    fetchStudies();
  }, [fetchStudies]);

  const handlePatientSelected = (patient) => {
    setSelectedPatient(patient);
    setShowPatientSearch(false);
    setShowCreateStudy(true);
  };

  const handleStudyCreated = (_study) => {
    setSuccess('Study created successfully');
    fetchStudies();
    setShowCreateStudy(false);
    setSelectedPatient(null);
  };

  const getStatusBadge = (study) => {
    switch (study.status) {
      case 'SCHEDULED':
        return <Badge color="blue">Scheduled</Badge>;
      case 'IN_PROGRESS':
        return <Badge color="orange">In Progress</Badge>;
      case 'COMPLETED':
        return <Badge color="green">Completed</Badge>;
      case 'CANCELLED':
        return <Badge color="red">Cancelled</Badge>;
      default:
        return <Badge color="slate">{study.status}</Badge>;
    }
  };

  const getPriorityBadge = (study) => {
    switch (study.priority) {
      case 'STAT':
        return <Badge color="red">Stat</Badge>;
      case 'URGENT':
        return <Badge color="orange">Urgent</Badge>;
      case 'ROUTINE':
        return <Badge color="green">Routine</Badge>;
      default:
        return <Badge color="slate">{study.priority}</Badge>;
    }
  };

  const handleStatusChange = async (studyId, newStatus) => {
    try {
      const res = await fetch(`/api/studies/${studyId}/status`, {
        method: 'PATCH',
        headers: AUTH_HEADER(),
        body: JSON.stringify({ status: newStatus }),
      });
      
      if (res.ok) {
        setSuccess('Study status updated successfully');
        fetchStudies();
      } else {
        setError('Failed to update study status');
      }
    } catch (err) {
      setError('Network error');
    }
  };

  const handleDeleteStudy = async (studyId) => {
    if (!confirm('Are you sure you want to delete this study?')) return;
    
    try {
      const res = await fetch(`/api/studies/${studyId}`, {
        method: 'DELETE',
        headers: AUTH_HEADER(),
      });
      
      if (res.ok) {
        setSuccess('Study deleted successfully');
        fetchStudies();
      } else {
        setError('Failed to delete study');
      }
    } catch (err) {
      setError('Network error');
    }
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Study Management</h1>
        <p className="text-gray-600">Schedule and manage patient studies with appointment booking</p>
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

      {(
        <div className="bg-white rounded-lg shadow mb-6">
          <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
            <h2 className="text-lg font-semibold text-gray-800">Studies</h2>
            <div className="flex space-x-3">
              <button
                onClick={() => setShowPatientSearch(true)}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center space-x-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                <span>New Study</span>
              </button>
            </div>
          </div>

          {/* Filters */}
          <div className="p-4 border-b border-gray-200">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status Filter</label>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className={inputCls}
                >
                  <option value="all">All Status</option>
                  <option value="SCHEDULED">Scheduled</option>
                  <option value="IN_PROGRESS">In Progress</option>
                  <option value="COMPLETED">Completed</option>
                  <option value="CANCELLED">Cancelled</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date Filter</label>
                <input
                  type="date"
                  value={filterDate}
                  onChange={(e) => setFilterDate(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div className="flex items-end">
                <button
                  onClick={() => {
                    setFilterStatus('all');
                    setFilterDate('');
                  }}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Clear Filters
                </button>
              </div>
            </div>
          </div>

          {/* Studies Table */}
          <div className="overflow-x-auto">
            {loading ? (
              <div className="p-8 text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-500 mx-auto"></div>
                <p className="mt-2 text-gray-500">Loading studies...</p>
              </div>
            ) : studies.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                <p>No studies found</p>
                <button
                  onClick={() => setShowPatientSearch(true)}
                  className="mt-3 text-teal-600 hover:text-teal-700 font-medium"
                >
                  Create your first study
                </button>
              </div>
            ) : (
              <table className="min-w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Study</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Patient</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Schedule</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {studies.map((s) => (
                    <tr key={s.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div>
                          <div className="text-sm font-medium text-gray-900">{s.study_name}</div>
                          <div className="text-xs text-gray-500">{s.modality}</div>
                          {s.accession_number && (
                            <div className="text-xs text-blue-600 font-mono">{s.accession_number}</div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-900">{s.patient_name}</div>
                        {s.patient_pid && (
                          <div className="text-xs text-gray-500 font-mono">{s.patient_pid}</div>
                        )}
                        <div className="text-xs text-gray-500">{s.patient_phone}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-900">
                          {new Date(s.scheduled_date).toLocaleDateString()} {s.scheduled_time}
                        </div>
                        <div className="text-xs text-gray-500">{s.center_name}</div>
                        <div className="mt-1">
                          {getPriorityBadge(s)}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="mt-1">
                          {getStatusBadge(s)}
                        </div>
                        {s.radiologist_name && (
                          <div className="text-xs text-gray-500 mt-1">
                            Dr. {s.radiologist_name}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <button className="text-teal-600 hover:text-teal-900 mr-3">View</button>
                        <button className="text-blue-600 hover:text-blue-900 mr-3">Edit</button>
                        {s.status === 'SCHEDULED' && (
                          <button
                            onClick={() => handleStatusChange(s.id, 'IN_PROGRESS')}
                            className="text-green-600 hover:text-green-900 mr-3"
                          >
                            Start
                          </button>
                        )}
                        {s.status === 'IN_PROGRESS' && (
                          <button
                            onClick={() => handleStatusChange(s.id, 'COMPLETED')}
                            className="text-purple-600 hover:text-purple-900 mr-3"
                          >
                            Complete
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteStudy(s.id)}
                          className="text-red-600 hover:text-red-900"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Modals */}
      {showPatientSearch && (
        <PatientSearchModal
          onPatientSelect={handlePatientSelected}
          onClose={() => setShowPatientSearch(false)}
        />
      )}

      {showCreateStudy && selectedPatient && (
        <CreateStudyModal
          patient={selectedPatient}
          onClose={() => {
            setShowCreateStudy(false);
            setSelectedPatient(null);
          }}
          onCreated={handleStudyCreated}
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

export default StudyManagement;
