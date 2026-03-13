import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Plus, 
  Search, 
  Filter, 
  Download, 
  RefreshCw, 
  Edit, 
  Trash2, 
  Eye,
  Calendar,
  Phone,
  Mail,
  MapPin,
  CreditCard,
  FileText,
  AlertTriangle,
  CheckCircle,
  Clock,
  User
} from 'lucide-react';
import ResponsiveCard from '../Common/ResponsiveCard';
import ResponsiveTable from '../Common/ResponsiveTable';
import ResponsiveForm from '../Common/ResponsiveForm';
import '../styles/theme.css';

const PatientManagement = () => {
  const [patients, setPatients] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedPatients, setSelectedPatients] = useState(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showAppointmentModal, setShowAppointmentModal] = useState(false);
  const [editingPatient, setEditingPatient] = useState(null);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [screenSize, setScreenSize] = useState('desktop');
  const [viewMode, setViewMode] = useState('table');
  const [activeTab, setActiveTab] = useState('patients');

  // Detect screen size
  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      if (width < 768) {
        setScreenSize('mobile');
        setViewMode('cards');
      } else if (width < 1024) {
        setScreenSize('tablet');
        setViewMode('table');
      } else {
        setScreenSize('desktop');
        setViewMode('table');
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Mock API calls - replace with real APIs
  useEffect(() => {
    fetchPatients();
    fetchAppointments();
  }, []);

  const fetchPatients = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const mockPatients = [
        {
          id: 1,
          patientId: 'PAT-2024-001',
          firstName: 'John',
          lastName: 'Doe',
          dateOfBirth: '1985-06-15',
          age: 38,
          gender: 'MALE',
          email: 'john.doe@email.com',
          phone: '+91 9876543210',
          address: '123 Main Street, Kochi, Kerala 682020',
          city: 'Kochi',
          state: 'Kerala',
          postalCode: '682020',
          country: 'India',
          bloodGroup: 'O+',
          emergencyContact: 'Jane Doe',
          emergencyPhone: '+91 9876543211',
          emergencyRelation: 'Spouse',
          insuranceProvider: 'Health Insurance Co.',
          insurancePolicyNumber: 'POL-123456',
          allergies: ['Penicillin', 'Peanuts'],
          medicalHistory: ['Hypertension', 'Diabetes Type 2'],
          currentMedications: ['Metformin', 'Lisinopril'],
          lastVisitDate: '2024-02-15',
          totalVisits: 15,
          status: 'ACTIVE',
          registrationDate: '2023-01-15',
          doctor: 'Dr. Smith',
          preferredLanguage: 'English',
          maritalStatus: 'Married',
          occupation: 'Software Engineer',
          notes: 'Regular patient for diabetes management'
        },
        {
          id: 2,
          patientId: 'PAT-2024-002',
          firstName: 'Jane',
          lastName: 'Smith',
          dateOfBirth: '1990-03-22',
          age: 33,
          gender: 'FEMALE',
          email: 'jane.smith@email.com',
          phone: '+91 9876543212',
          address: '456 Oak Avenue, Ernakulam, Kerala 682016',
          city: 'Ernakulam',
          state: 'Kerala',
          postalCode: '682016',
          country: 'India',
          bloodGroup: 'A+',
          emergencyContact: 'John Smith',
          emergencyPhone: '+91 9876543213',
          emergencyRelation: 'Husband',
          insuranceProvider: 'Life Insurance Corp.',
          insurancePolicyNumber: 'POL-789012',
          allergies: ['None'],
          medicalHistory: ['Asthma'],
          currentMedications: ['Albuterol'],
          lastVisitDate: '2024-02-20',
          totalVisits: 8,
          status: 'ACTIVE',
          registrationDate: '2023-06-20',
          doctor: 'Dr. Johnson',
          preferredLanguage: 'Malayalam',
          maritalStatus: 'Single',
          occupation: 'Teacher',
          notes: 'Patient for asthma management'
        },
        {
          id: 3,
          patientId: 'PAT-2024-003',
          firstName: 'Robert',
          lastName: 'Johnson',
          dateOfBirth: '1978-11-08',
          age: 45,
          gender: 'MALE',
          email: 'robert.johnson@email.com',
          phone: '+91 9876543214',
          address: '789 Pine Road, Thrissur, Kerala 680001',
          city: 'Thrissur',
          state: 'Kerala',
          postalCode: '680001',
          country: 'India',
          bloodGroup: 'B+',
          emergencyContact: 'Mary Johnson',
          emergencyPhone: '+91 9876543215',
          emergencyRelation: 'Wife',
          insuranceProvider: 'General Insurance',
          insurancePolicyNumber: 'POL-345678',
          allergies: ['Latex'],
          medicalHistory: ['Hypertension', 'High Cholesterol'],
          currentMedications: ['Atenolol', 'Simvastatin'],
          lastVisitDate: '2024-02-10',
          totalVisits: 22,
          status: 'ACTIVE',
          registrationDate: '2022-12-10',
          doctor: 'Dr. Williams',
          preferredLanguage: 'English',
          maritalStatus: 'Married',
          occupation: 'Business Owner',
          notes: 'Regular patient for cardiovascular health'
        },
        {
          id: 4,
          patientId: 'PAT-2024-004',
          firstName: 'Mary',
          lastName: 'Davis',
          dateOfBirth: '1995-07-30',
          age: 28,
          gender: 'FEMALE',
          email: 'mary.davis@email.com',
          phone: '+91 9876543216',
          address: '321 Elm Street, Kozhikode, Kerala 673001',
          city: 'Kozhikode',
          state: 'Kerala',
          postalCode: '673001',
          country: 'India',
          bloodGroup: 'AB+',
          emergencyContact: 'David Davis',
          emergencyPhone: '+91 9876543217',
          emergencyRelation: 'Brother',
          insuranceProvider: 'Health Insurance Co.',
          insurancePolicyNumber: 'POL-901234',
          allergies: ['None'],
          medicalHistory: ['None'],
          currentMedications: ['None'],
          lastVisitDate: '2024-02-25',
          totalVisits: 3,
          status: 'ACTIVE',
          registrationDate: '2024-01-25',
          doctor: 'Dr. Brown',
          preferredLanguage: 'Malayalam',
          maritalStatus: 'Single',
          occupation: 'Student',
          notes: 'New patient for general checkup'
        },
        {
          id: 5,
          patientId: 'PAT-2024-005',
          firstName: 'Michael',
          lastName: 'Wilson',
          dateOfBirth: '1982-09-12',
          age: 41,
          gender: 'MALE',
          email: 'michael.wilson@email.com',
          phone: '+91 9876543218',
          address: '654 Maple Drive, Kottayam, Kerala 686001',
          city: 'Kottayam',
          state: 'Kerala',
          postalCode: '686001',
          country: 'India',
          bloodGroup: 'A-',
          emergencyContact: 'Sarah Wilson',
          emergencyPhone: '+91 9876543219',
          emergencyRelation: 'Wife',
          insuranceProvider: 'Life Insurance Corp.',
          insurancePolicyNumber: 'POL-567890',
          allergies: ['Sulfa drugs'],
          medicalHistory: ['Arthritis'],
          currentMedications: ['Ibuprofen'],
          lastVisitDate: '2024-02-18',
          totalVisits: 12,
          status: 'ACTIVE',
          registrationDate: '2023-03-18',
          doctor: 'Dr. Miller',
          preferredLanguage: 'English',
          maritalStatus: 'Married',
          occupation: 'Accountant',
          notes: 'Patient for arthritis management'
        }
      ];
      
      setPatients(mockPatients);
    } catch (err) {
      setError('Failed to fetch patients');
      console.error('Error fetching patients:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchAppointments = async () => {
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const mockAppointments = [
        {
          id: 1,
          patientId: 'PAT-2024-001',
          patientName: 'John Doe',
          appointmentDate: '2024-03-15',
          appointmentTime: '09:00 AM',
          doctor: 'Dr. Smith',
          department: 'General Medicine',
          appointmentType: 'Follow-up',
          status: 'SCHEDULED',
          notes: 'Diabetes follow-up',
          duration: 30,
          room: 'Consultation Room 1'
        },
        {
          id: 2,
          patientId: 'PAT-2024-002',
          patientName: 'Jane Smith',
          appointmentDate: '2024-03-15',
          appointmentTime: '10:00 AM',
          doctor: 'Dr. Johnson',
          department: 'Pulmonology',
          appointmentType: 'Consultation',
          status: 'SCHEDULED',
          notes: 'Asthma review',
          duration: 30,
          room: 'Consultation Room 2'
        },
        {
          id: 3,
          patientId: 'PAT-2024-003',
          patientName: 'Robert Johnson',
          appointmentDate: '2024-03-15',
          appointmentTime: '11:00 AM',
          doctor: 'Dr. Williams',
          department: 'Cardiology',
          appointmentType: 'Follow-up',
          status: 'CONFIRMED',
          notes: 'Cardiovascular review',
          duration: 45,
          room: 'Consultation Room 3'
        },
        {
          id: 4,
          patientId: 'PAT-2024-004',
          patientName: 'Mary Davis',
          appointmentDate: '2024-03-16',
          appointmentTime: '02:00 PM',
          doctor: 'Dr. Brown',
          department: 'General Medicine',
          appointmentType: 'New Patient',
          status: 'SCHEDULED',
          notes: 'General checkup',
          duration: 30,
          room: 'Consultation Room 1'
        }
      ];
      
      setAppointments(mockAppointments);
    } catch (err) {
      console.error('Error fetching appointments:', err);
    }
  };

  const handleAddPatient = async (formData) => {
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const newPatient = {
        id: patients.length + 1,
        patientId: `PAT-2024-${String(patients.length + 1).padStart(3, '0')}`,
        ...formData,
        age: new Date().getFullYear() - new Date(formData.dateOfBirth).getFullYear(),
        totalVisits: 0,
        status: 'ACTIVE',
        registrationDate: new Date().toISOString().split('T')[0],
        lastVisitDate: null
      };
      
      setPatients([...patients, newPatient]);
      setShowAddModal(false);
      alert('Patient added successfully!');
    } catch (err) {
      console.error('Error adding patient:', err);
      alert('Failed to add patient');
    }
  };

  const handleEditPatient = async (formData) => {
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      setPatients(patients.map(patient => 
        patient.id === editingPatient.id 
          ? { ...patient, ...formData }
          : patient
      ));
      setShowEditModal(false);
      setEditingPatient(null);
      alert('Patient updated successfully!');
    } catch (err) {
      console.error('Error updating patient:', err);
      alert('Failed to update patient');
    }
  };

  const handleDeletePatient = async (patientId) => {
    if (!confirm('Are you sure you want to delete this patient?')) {
      return;
    }
    
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      setPatients(patients.filter(patient => patient.id !== patientId));
      alert('Patient deleted successfully!');
    } catch (err) {
      console.error('Error deleting patient:', err);
      alert('Failed to delete patient');
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'ACTIVE': return 'text-green-600 bg-green-100';
      case 'INACTIVE': return 'text-gray-600 bg-gray-100';
      case 'SUSPENDED': return 'text-red-600 bg-red-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getAppointmentStatusColor = (status) => {
    switch (status) {
      case 'SCHEDULED': return 'text-blue-600 bg-blue-100';
      case 'CONFIRMED': return 'text-green-600 bg-green-100';
      case 'CANCELLED': return 'text-red-600 bg-red-100';
      case 'COMPLETED': return 'text-gray-600 bg-gray-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  // Patient table columns
  const patientColumns = [
    {
      key: 'patientId',
      title: 'Patient ID',
      sortable: true,
      render: (value) => <span className="font-medium">{value}</span>
    },
    {
      key: 'firstName',
      title: 'Name',
      sortable: true,
      render: (value, row) => (
        <div>
          <div className="font-medium">{value} {row.lastName}</div>
          <div className="text-sm text-gray-500">{row.email}</div>
        </div>
      )
    },
    {
      key: 'age',
      title: 'Age',
      sortable: true,
      render: (value, row) => (
        <div>
          <div>{value} years</div>
          <div className="text-sm text-gray-500">{row.gender}</div>
        </div>
      )
    },
    {
      key: 'phone',
      title: 'Contact',
      sortable: true,
      render: (value, row) => (
        <div>
          <div className="flex items-center">
            <Phone className="w-4 h-4 mr-1" />
            {value}
          </div>
          <div className="text-sm text-gray-500">{row.bloodGroup}</div>
        </div>
      )
    },
    {
      key: 'city',
      title: 'Location',
      sortable: true,
      render: (value, row) => (
        <div>
          <div className="flex items-center">
            <MapPin className="w-4 h-4 mr-1" />
            {value}, {row.state}
          </div>
        </div>
      )
    },
    {
      key: 'doctor',
      title: 'Primary Doctor',
      sortable: true
    },
    {
      key: 'lastVisitDate',
      title: 'Last Visit',
      sortable: true,
      render: (value, row) => (
        <div>
          <div>{value || 'Never'}</div>
          <div className="text-sm text-gray-500">{row.totalVisits} visits</div>
        </div>
      )
    },
    {
      key: 'status',
      title: 'Status',
      sortable: true,
      render: (value) => (
        <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(value)}`}>
          {value}
        </span>
      )
    }
  ];

  // Appointment table columns
  const appointmentColumns = [
    {
      key: 'patientName',
      title: 'Patient',
      sortable: true,
      render: (value, row) => (
        <div>
          <div className="font-medium">{value}</div>
          <div className="text-sm text-gray-500">{row.patientId}</div>
        </div>
      )
    },
    {
      key: 'appointmentDate',
      title: 'Date',
      sortable: true,
      render: (value, row) => (
        <div>
          <div className="flex items-center">
            <Calendar className="w-4 h-4 mr-1" />
            {value}
          </div>
          <div className="text-sm text-gray-500">{row.appointmentTime}</div>
        </div>
      )
    },
    {
      key: 'doctor',
      title: 'Doctor',
      sortable: true
    },
    {
      key: 'department',
      title: 'Department',
      sortable: true
    },
    {
      key: 'appointmentType',
      title: 'Type',
      sortable: true,
      render: (value) => (
        <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
          {value}
        </span>
      )
    },
    {
      key: 'status',
      title: 'Status',
      sortable: true,
      render: (value) => (
        <span className={`px-2 py-1 text-xs font-medium rounded-full ${getAppointmentStatusColor(value)}`}>
          {value}
        </span>
      )
    }
  ];

  // Patient form fields
  const patientFormFields = [
    {
      name: 'firstName',
      label: 'First Name',
      type: 'text',
      required: true,
      placeholder: 'Enter first name'
    },
    {
      name: 'lastName',
      label: 'Last Name',
      type: 'text',
      required: true,
      placeholder: 'Enter last name'
    },
    {
      name: 'dateOfBirth',
      label: 'Date of Birth',
      type: 'date',
      required: true
    },
    {
      name: 'gender',
      label: 'Gender',
      type: 'select',
      required: true,
      options: [
        { value: 'MALE', label: 'Male' },
        { value: 'FEMALE', label: 'Female' },
        { value: 'OTHER', label: 'Other' }
      ]
    },
    {
      name: 'email',
      label: 'Email',
      type: 'email',
      required: true,
      placeholder: 'Enter email address'
    },
    {
      name: 'phone',
      label: 'Phone',
      type: 'tel',
      required: true,
      placeholder: 'Enter phone number'
    },
    {
      name: 'address',
      label: 'Address',
      type: 'text',
      required: true,
      placeholder: 'Enter address'
    },
    {
      name: 'city',
      label: 'City',
      type: 'text',
      required: true,
      placeholder: 'Enter city'
    },
    {
      name: 'state',
      label: 'State',
      type: 'text',
      required: true,
      placeholder: 'Enter state'
    },
    {
      name: 'postalCode',
      label: 'Postal Code',
      type: 'text',
      required: true,
      placeholder: 'Enter postal code'
    },
    {
      name: 'bloodGroup',
      label: 'Blood Group',
      type: 'select',
      required: true,
      options: [
        { value: 'A+', label: 'A+' },
        { value: 'A-', label: 'A-' },
        { value: 'B+', label: 'B+' },
        { value: 'B-', label: 'B-' },
        { value: 'O+', label: 'O+' },
        { value: 'O-', label: 'O-' },
        { value: 'AB+', label: 'AB+' },
        { value: 'AB-', label: 'AB-' }
      ]
    },
    {
      name: 'emergencyContact',
      label: 'Emergency Contact',
      type: 'text',
      required: true,
      placeholder: 'Enter emergency contact name'
    },
    {
      name: 'emergencyPhone',
      label: 'Emergency Phone',
      type: 'tel',
      required: true,
      placeholder: 'Enter emergency phone number'
    },
    {
      name: 'emergencyRelation',
      label: 'Relation',
      type: 'select',
      required: true,
      options: [
        { value: 'Spouse', label: 'Spouse' },
        { value: 'Parent', label: 'Parent' },
        { value: 'Child', label: 'Child' },
        { value: 'Sibling', label: 'Sibling' },
        { value: 'Friend', label: 'Friend' },
        { value: 'Other', label: 'Other' }
      ]
    },
    {
      name: 'insuranceProvider',
      label: 'Insurance Provider',
      type: 'text',
      placeholder: 'Enter insurance provider'
    },
    {
      name: 'insurancePolicyNumber',
      label: 'Policy Number',
      type: 'text',
      placeholder: 'Enter policy number'
    },
    {
      name: 'doctor',
      label: 'Primary Doctor',
      type: 'select',
      required: true,
      options: [
        { value: 'Dr. Smith', label: 'Dr. Smith' },
        { value: 'Dr. Johnson', label: 'Dr. Johnson' },
        { value: 'Dr. Williams', label: 'Dr. Williams' },
        { value: 'Dr. Brown', label: 'Dr. Brown' }
      ]
    },
    {
      name: 'notes',
      label: 'Medical Notes',
      type: 'textarea',
      placeholder: 'Enter medical notes'
    }
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Patient Management</h1>
          <p className="text-gray-600 mt-1">Manage patient records and appointments</p>
        </div>
        
        <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-4 space-y-2 sm:space-y-0">
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Patient
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('patients')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'patients'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Patients
          </button>
          <button
            onClick={() => setActiveTab('appointments')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'appointments'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Appointments
          </button>
        </nav>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <ResponsiveCard>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Patients</p>
              <p className="text-2xl font-bold text-gray-900">{patients.length}</p>
            </div>
            <div className="w-12 h-12 bg-blue-500 rounded-lg flex items-center justify-center">
              <Users className="w-6 h-6 text-white" />
            </div>
          </div>
        </ResponsiveCard>

        <ResponsiveCard>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Active Patients</p>
              <p className="text-2xl font-bold text-green-600">
                {patients.filter(p => p.status === 'ACTIVE').length}
              </p>
            </div>
            <div className="w-12 h-12 bg-green-500 rounded-lg flex items-center justify-center">
              <CheckCircle className="w-6 h-6 text-white" />
            </div>
          </div>
        </ResponsiveCard>

        <ResponsiveCard>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Today's Appointments</p>
              <p className="text-2xl font-bold text-blue-600">
                {appointments.filter(a => a.appointmentDate === '2024-03-15').length}
              </p>
            </div>
            <div className="w-12 h-12 bg-purple-500 rounded-lg flex items-center justify-center">
              <Calendar className="w-6 h-6 text-white" />
            </div>
          </div>
        </ResponsiveCard>

        <ResponsiveCard>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Pending Appointments</p>
              <p className="text-2xl font-bold text-yellow-600">
                {appointments.filter(a => a.status === 'SCHEDULED').length}
              </p>
            </div>
            <div className="w-12 h-12 bg-yellow-500 rounded-lg flex items-center justify-center">
              <Clock className="w-6 h-6 text-white" />
            </div>
          </div>
        </ResponsiveCard>
      </div>

      {/* Tab Content */}
      {activeTab === 'patients' && (
        <ResponsiveCard>
          <ResponsiveTable
            data={patients}
            columns={patientColumns}
            loading={loading}
            error={error}
            searchable={true}
            selectable={true}
            onSelectionChange={setSelectedPatients}
            viewMode={viewMode}
            showViewToggle={true}
            onRefresh={fetchPatients}
          />
        </ResponsiveCard>
      )}

      {activeTab === 'appointments' && (
        <ResponsiveCard>
          <ResponsiveTable
            data={appointments}
            columns={appointmentColumns}
            loading={loading}
            error={error}
            searchable={true}
            selectable={false}
            viewMode={viewMode}
            showViewToggle={true}
            onRefresh={fetchAppointments}
          />
        </ResponsiveCard>
      )}

      {/* Add Patient Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">Add New Patient</h2>
            </div>
            <div className="p-6">
              <ResponsiveForm
                fields={patientFormFields}
                onSubmit={handleAddPatient}
                onCancel={() => setShowAddModal(false)}
                submitText="Add Patient"
                layout="responsive"
              />
            </div>
          </div>
        </div>
      )}

      {/* Edit Patient Modal */}
      {showEditModal && editingPatient && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">Edit Patient</h2>
            </div>
            <div className="p-6">
              <ResponsiveForm
                fields={patientFormFields}
                initialValues={editingPatient}
                onSubmit={handleEditPatient}
                onCancel={() => {
                  setShowEditModal(false);
                  setEditingPatient(null);
                }}
                submitText="Update Patient"
                layout="responsive"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PatientManagement;
