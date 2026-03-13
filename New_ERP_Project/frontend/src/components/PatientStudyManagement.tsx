import React, { useState, useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { Search, Plus, Calendar, Clock, User, FileText, AlertCircle, CheckCircle } from 'lucide-react';

interface Patient {
  id: number;
  name: string;
  phone: string;
  email?: string;
  id_proof_type?: string;
  id_proof_number?: string;
  id_proof_verified: boolean;
  center_name: string;
  total_studies: number;
  last_study_date?: string;
  match_type: string;
}

interface StudyMaster {
  study_code: string;
  study_name: string;
  modality: string;
  description: string;
  base_rate: number;
}

interface Radiologist {
  radiologist_code: string;
  name: string;
  type: string;
  specialty: string;
  reporting_rates: Array<{
    modality: string;
    rate: number;
    currency: string;
  }>;
}

interface Center {
  id: number;
  name: string;
  code: string;
  city: string;
  state: string;
}

interface StudyFormData {
  study_code: string;
  center_id: number;
  priority: 'ROUTINE' | 'URGENT' | 'STAT';
  scheduled_date: string;
  scheduled_time: string;
  radiologist_code?: string;
  notes?: string;
}

interface PatientStudyManagementProps {
  onStudyCreated?: (study: any) => void;
  onCancel?: () => void;
  initialPatientId?: number;
}

const priorities = [
  { value: 'ROUTINE', label: 'Routine', color: 'blue' },
  { value: 'URGENT', label: 'Urgent', color: 'yellow' },
  { value: 'STAT', label: 'Stat', color: 'red' }
];

const timeSlots = [
  '08:00', '08:30', '09:00', '09:30', '10:00', '10:30',
  '11:00', '11:30', '12:00', '12:30', '13:00', '13:30',
  '14:00', '14:30', '15:00', '15:30', '16:00', '16:30',
  '17:00', '17:30', '18:00', '18:30', '19:00', '19:30'
];

export default function PatientStudyManagement({
  onStudyCreated,
  onCancel,
  initialPatientId
}: PatientStudyManagementProps) {
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [patients, setPatients] = useState<Patient[]>([]);
  const [studyMasters, setStudyMasters] = useState<StudyMaster[]>([]);
  const [radiologists, setRadiologists] = useState<Radiologist[]>([]);
  const [centers, setCenters] = useState<Center[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showStudyForm, setShowStudyForm] = useState(false);
  const [selectedStudy, setSelectedStudy] = useState<StudyMaster | null>(null);
  const [estimatedCost, setEstimatedCost] = useState<number>(0);

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors, isValid }
  } = useForm<StudyFormData>({
    defaultValues: {
      priority: 'ROUTINE',
      scheduled_date: new Date().toISOString().split('T')[0],
      scheduled_time: '09:00'
    }
  });

  const watchedStudyCode = watch('study_code');
  const watchedRadiologistCode = watch('radiologist_code');

  useEffect(() => {
    fetchStudyMasters();
    fetchRadiologists();
    fetchCenters();
    
    if (initialPatientId) {
      fetchPatientById(initialPatientId);
    }
  }, [initialPatientId]);

  useEffect(() => {
    if (watchedStudyCode && studyMasters.length > 0) {
      const study = studyMasters.find(s => s.study_code === watchedStudyCode);
      setSelectedStudy(study || null);
      calculateEstimatedCost(study, watchedRadiologistCode);
    }
  }, [watchedStudyCode, studyMasters, watchedRadiologistCode]);

  useEffect(() => {
    if (searchTerm.length >= 2) {
      searchPatients();
    } else {
      setPatients([]);
    }
  }, [searchTerm]);

  const fetchStudyMasters = async () => {
    try {
      const response = await fetch('/api/masters/studies');
      const data = await response.json();
      if (data.success) {
        setStudyMasters(data.studies);
      }
    } catch (error) {
      console.error('Error fetching study masters:', error);
    }
  };

  const fetchRadiologists = async () => {
    try {
      const response = await fetch('/api/radiology-reporting/radiologists');
      const data = await response.json();
      if (data.success) {
        setRadiologists(data.radiologists);
      }
    } catch (error) {
      console.error('Error fetching radiologists:', error);
    }
  };

  const fetchCenters = async () => {
    try {
      const response = await fetch('/api/centers');
      const data = await response.json();
      if (data.success) {
        setCenters(data.centers);
      }
    } catch (error) {
      console.error('Error fetching centers:', error);
    }
  };

  const fetchPatientById = async (patientId: number) => {
    try {
      const response = await fetch(`/api/patients/${patientId}`);
      const data = await response.json();
      if (data.success) {
        const patient = data.patient;
        setSelectedPatient({
          id: patient.id,
          name: patient.name,
          phone: patient.phone,
          email: patient.email,
          id_proof_type: patient.id_proof_type,
          id_proof_number: patient.id_proof_number,
          id_proof_verified: patient.id_proof_verified,
          center_name: patient.center_name,
          total_studies: patient.total_studies || 0,
          last_study_date: patient.last_study_date,
          match_type: 'ID'
        });
      }
    } catch (error) {
      console.error('Error fetching patient:', error);
    }
  };

  const searchPatients = async () => {
    if (searchTerm.length < 2) return;
    
    setSearchLoading(true);
    try {
      const response = await fetch(`/api/patients/quick-search?search_term=${encodeURIComponent(searchTerm)}`);
      const data = await response.json();
      if (data.success) {
        setPatients(data.patients);
      }
    } catch (error) {
      console.error('Error searching patients:', error);
    } finally {
      setSearchLoading(false);
    }
  };

  const calculateEstimatedCost = (study: StudyMaster | null, radiologistCode?: string) => {
    if (!study) {
      setEstimatedCost(0);
      return;
    }

    let cost = study.base_rate || 0;

    if (radiologistCode && radiologists.length > 0) {
      const radiologist = radiologists.find(r => r.radiologist_code === radiologistCode);
      if (radiologist) {
        const rate = radiologist.reporting_rates.find(r => r.modality === study.modality);
        if (rate) {
          cost += rate.rate;
        }
      }
    }

    setEstimatedCost(cost);
  };

  const handlePatientSelect = (patient: Patient) => {
    setSelectedPatient(patient);
    setSearchTerm('');
    setPatients([]);
  };

  const onStudySubmit = async (data: StudyFormData) => {
    if (!selectedPatient) return;

    setLoading(true);
    try {
      const response = await fetch(`/api/patients/${selectedPatient.id}/studies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      const result = await response.json();
      
      if (result.success) {
        onStudyCreated?.(result.study);
        setShowStudyForm(false);
        // Reset form
        setValue('study_code', '');
        setValue('center_id', 0);
        setValue('priority', 'ROUTINE');
        setValue('scheduled_date', new Date().toISOString().split('T')[0]);
        setValue('scheduled_time', '09:00');
        setValue('radiologist_code', '');
        setValue('notes', '');
      } else {
        console.error('Error creating study:', result.error);
      }
    } catch (error) {
      console.error('Error creating study:', error);
    } finally {
      setLoading(false);
    }
  };

  const getPriorityColor = (priority: string) => {
    const p = priorities.find(p => p.value === priority);
    return p?.color || 'gray';
  };

  const getMatchTypeIcon = (matchType: string) => {
    switch (matchType) {
      case 'NAME':
        return <User className="w-4 h-4" />;
      case 'PHONE':
        return <Phone className="w-4 h-4" />;
      case 'EMAIL':
        return <Mail className="w-4 h-4" />;
      case 'ID_PROOF':
        return <FileText className="w-4 h-4" />;
      default:
        return <Search className="w-4 h-4" />;
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 bg-white rounded-lg shadow-lg">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Patient Study Management</h2>
        <p className="text-gray-600 mt-1">Search patients and create studies efficiently</p>
      </div>

      {/* Patient Search Section */}
      <div className="mb-6">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="text-lg font-semibold mb-4 flex items-center">
            <Search className="w-5 h-5 mr-2" />
            Search Patient
          </h3>
          
          <div className="relative">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by name, phone, email, or ID proof number..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
            {searchLoading && (
              <div className="absolute right-3 top-3">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
              </div>
            )}
          </div>

          {/* Search Results */}
          {patients.length > 0 && (
            <div className="mt-4 border border-gray-200 rounded-lg max-h-64 overflow-y-auto">
              {patients.map((patient) => (
                <div
                  key={patient.id}
                  onClick={() => handlePatientSelect(patient)}
                  className="p-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="text-gray-400">
                        {getMatchTypeIcon(patient.match_type)}
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">{patient.name}</div>
                        <div className="text-sm text-gray-500">{patient.phone}</div>
                        {patient.email && (
                          <div className="text-sm text-gray-500">{patient.email}</div>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-gray-500">{patient.center_name}</div>
                      <div className="text-xs text-gray-400">
                        {patient.total_studies} studies
                      </div>
                      {patient.id_proof_verified && (
                        <div className="flex items-center text-green-600 text-xs">
                          <CheckCircle className="w-3 h-3 mr-1" />
                          ID Verified
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Selected Patient Information */}
      {selectedPatient && (
        <div className="mb-6">
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold flex items-center">
                <User className="w-5 h-5 mr-2" />
                Selected Patient
              </h3>
              <button
                onClick={() => setShowStudyForm(!showStudyForm)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Study
              </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <div className="text-sm text-gray-500">Name</div>
                <div className="font-medium">{selectedPatient.name}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Phone</div>
                <div className="font-medium">{selectedPatient.phone}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Center</div>
                <div className="font-medium">{selectedPatient.center_name}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Previous Studies</div>
                <div className="font-medium">{selectedPatient.total_studies}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500">ID Proof</div>
                <div className="font-medium">
                  {selectedPatient.id_proof_type ? `${selectedPatient.id_proof_type} - ${selectedPatient.id_proof_number}` : 'Not provided'}
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Verification Status</div>
                <div className="font-medium">
                  {selectedPatient.id_proof_verified ? (
                    <span className="text-green-600 flex items-center">
                      <CheckCircle className="w-4 h-4 mr-1" />
                      Verified
                    </span>
                  ) : (
                    <span className="text-yellow-600 flex items-center">
                      <AlertCircle className="w-4 h-4 mr-1" />
                      Not Verified
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Study Creation Form */}
      {showStudyForm && selectedPatient && (
        <div className="bg-gray-50 rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-4">Create New Study</h3>
          
          <form onSubmit={handleSubmit(onStudySubmit)} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Study Type *</label>
                <select
                  {...register('study_code', { required: 'Study type is required' })}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border"
                >
                  <option value="">Select Study Type</option>
                  {studyMasters.map((study) => (
                    <option key={study.study_code} value={study.study_code}>
                      {study.study_name} ({study.modality})
                    </option>
                  ))}
                </select>
                {errors.study_code && (
                  <p className="text-red-500 text-xs mt-1">{errors.study_code.message}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Center *</label>
                <select
                  {...register('center_id', { required: 'Center is required' })}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border"
                >
                  <option value="">Select Center</option>
                  {centers.map((center) => (
                    <option key={center.id} value={center.id}>
                      {center.name} - {center.city}
                    </option>
                  ))}
                </select>
                {errors.center_id && (
                  <p className="text-red-500 text-xs mt-1">{errors.center_id.message}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Priority</label>
                <select
                  {...register('priority')}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border"
                >
                  {priorities.map((priority) => (
                    <option key={priority.value} value={priority.value}>
                      {priority.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Radiologist</label>
                <select
                  {...register('radiologist_code')}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border"
                >
                  <option value="">Select Radiologist</option>
                  {radiologists.map((radiologist) => (
                    <option key={radiologist.radiologist_code} value={radiologist.radiologist_code}>
                      {radiologist.name} - {radiologist.specialty}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Scheduled Date *</label>
                <input
                  type="date"
                  {...register('scheduled_date', { required: 'Date is required' })}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border"
                />
                {errors.scheduled_date && (
                  <p className="text-red-500 text-xs mt-1">{errors.scheduled_date.message}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Scheduled Time *</label>
                <select
                  {...register('scheduled_time', { required: 'Time is required' })}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border"
                >
                  {timeSlots.map((time) => (
                    <option key={time} value={time}>{time}</option>
                  ))}
                </select>
                {errors.scheduled_time && (
                  <p className="text-red-500 text-xs mt-1">{errors.scheduled_time.message}</p>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Notes</label>
              <textarea
                {...register('notes')}
                rows={3}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border"
                placeholder="Additional notes for this study..."
              />
            </div>

            {/* Study Details & Cost Estimation */}
            {selectedStudy && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="font-semibold mb-2">Study Details</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <div className="text-sm text-gray-600">Study Type</div>
                    <div className="font-medium">{selectedStudy.study_name}</div>
                    <div className="text-sm text-gray-500">Modality: {selectedStudy.modality}</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-600">Estimated Cost</div>
                    <div className="font-medium text-lg">₹{estimatedCost.toFixed(2)}</div>
                    <div className="text-xs text-gray-500">
                      Base: ₹{selectedStudy.base_rate || 0}
                      {watchedRadiologistCode && ' + Radiologist fees'}
                    </div>
                  </div>
                </div>
                {selectedStudy.description && (
                  <div className="mt-2">
                    <div className="text-sm text-gray-600">Description</div>
                    <div className="text-sm">{selectedStudy.description}</div>
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end space-x-4">
              <button
                type="button"
                onClick={() => setShowStudyForm(false)}
                className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || !isValid}
                className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Creating Study...' : 'Create Study'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Quick Actions */}
      <div className="mt-6 flex justify-between items-center">
        <div className="text-sm text-gray-500">
          {selectedPatient ? (
            <span>Creating study for: <strong>{selectedPatient.name}</strong></span>
          ) : (
            <span>Search and select a patient to create studies</span>
          )}
        </div>
        {onCancel && (
          <button
            onClick={onCancel}
            className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
          >
            Close
          </button>
        )}
      </div>
    </div>
  );
}
