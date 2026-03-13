import React, { useState, useEffect } from 'react';
import { 
  Building, 
  Plus, 
  Search, 
  Filter, 
  Download, 
  RefreshCw, 
  Edit, 
  Trash2, 
  Eye,
  Users,
  MapPin,
  Phone,
  Mail,
  Calendar,
  CheckCircle,
  AlertTriangle,
  Clock,
  Settings,
  User
} from 'lucide-react';
import ResponsiveCard from '../Common/ResponsiveCard';
import ResponsiveTable from '../Common/ResponsiveTable';
import ResponsiveForm from '../Common/ResponsiveForm';
import '../styles/theme.css';

const CenterManagement = () => {
  const [centers, setCenters] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedItems, setSelectedItems] = useState(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [screenSize, setScreenSize] = useState('desktop');
  const [viewMode, setViewMode] = useState('table');
  const [activeTab, setActiveTab] = useState('centers');

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
    fetchCenters();
    fetchDepartments();
    fetchStaff();
  }, []);

  const fetchCenters = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const mockCenters = [
        {
          id: 1,
          centerCode: 'HC-001',
          centerName: 'Main Hospital',
          centerType: 'HOSPITAL',
          description: 'Primary healthcare facility with comprehensive medical services',
          address: '123 Hospital Road, Kochi, Kerala 682020',
          city: 'Kochi',
          state: 'Kerala',
          postalCode: '682020',
          country: 'India',
          phone: '+91 484 1234567',
          email: 'info@mainhospital.com',
          website: 'www.mainhospital.com',
          establishedDate: '2010-01-15',
          licenseNumber: 'LIC-HC-001',
          gstNumber: 'GST123456789HC001',
          panNumber: 'PAN123456HC001',
          capacity: 200,
          bedCount: 150,
          operatingHours: '24/7',
          emergencyServices: true,
          status: 'ACTIVE',
          isHeadquarters: true,
          parentCenterId: null,
          totalDepartments: 8,
          totalStaff: 125,
          totalDoctors: 25,
          totalNurses: 50,
          lastInspectionDate: '2024-01-15',
          nextInspectionDate: '2024-07-15',
          rating: 4.5,
          totalPatients: 5000,
          monthlyRevenue: 2500000,
          monthlyExpenses: 1800000,
          notes: 'Main hospital facility with all major departments'
        },
        {
          id: 2,
          centerCode: 'DC-001',
          centerName: 'Diagnostic Center',
          centerType: 'DIAGNOSTIC',
          description: 'Specialized diagnostic center with advanced imaging facilities',
          address: '456 Diagnostic Avenue, Ernakulam, Kerala 682016',
          city: 'Ernakulam',
          state: 'Kerala',
          postalCode: '682016',
          country: 'India',
          phone: '+91 484 2345678',
          email: 'info@diagnostic.com',
          website: 'www.diagnostic.com',
          establishedDate: '2015-06-20',
          licenseNumber: 'LIC-DC-001',
          gstNumber: 'GST987654321DC001',
          panNumber: 'PAN987654DC001',
          capacity: 100,
          bedCount: 0,
          operatingHours: '8 AM - 8 PM',
          emergencyServices: false,
          status: 'ACTIVE',
          isHeadquarters: false,
          parentCenterId: 1,
          totalDepartments: 4,
          totalStaff: 35,
          totalDoctors: 8,
          totalNurses: 12,
          lastInspectionDate: '2024-02-01',
          nextInspectionDate: '2024-08-01',
          rating: 4.2,
          totalPatients: 2000,
          monthlyRevenue: 800000,
          monthlyExpenses: 600000,
          notes: 'Specialized diagnostic services'
        },
        {
          id: 3,
          centerCode: 'CL-001',
          centerName: 'Clinic Branch',
          centerType: 'CLINIC',
          description: 'Outpatient clinic for general medical consultations',
          address: '789 Clinic Street, Thrissur, Kerala 680001',
          city: 'Thrissur',
          state: 'Kerala',
          postalCode: '680001',
          country: 'India',
          phone: '+91 487 3456789',
          email: 'info@clinic.com',
          website: 'www.clinic.com',
          establishedDate: '2018-03-10',
          licenseNumber: 'LIC-CL-001',
          gstNumber: 'GST456789123CL001',
          panNumber: 'PAN456789CL001',
          capacity: 50,
          bedCount: 0,
          operatingHours: '9 AM - 6 PM',
          emergencyServices: false,
          status: 'ACTIVE',
          isHeadquarters: false,
          parentCenterId: 1,
          totalDepartments: 3,
          totalStaff: 15,
          totalDoctors: 5,
          totalNurses: 5,
          lastInspectionDate: '2024-01-20',
          nextInspectionDate: '2024-07-20',
          rating: 4.0,
          totalPatients: 800,
          monthlyRevenue: 300000,
          monthlyExpenses: 200000,
          notes: 'General outpatient clinic'
        },
        {
          id: 4,
          centerCode: 'SC-001',
          centerName: 'Specialty Center',
          centerType: 'SPECIALTY',
          description: 'Specialized center for cardiology and neurology services',
          address: '321 Specialty Road, Kottayam, Kerala 686001',
          city: 'Kottayam',
          state: 'Kerala',
          postalCode: '686001',
          country: 'India',
          phone: '+91 481 4567890',
          email: 'info@specialty.com',
          website: 'www.specialty.com',
          establishedDate: '2020-09-15',
          licenseNumber: 'LIC-SC-001',
          gstNumber: 'GST789012345SC001',
          panNumber: 'PAN789012SC001',
          capacity: 80,
          bedCount: 30,
          operatingHours: '8 AM - 10 PM',
          emergencyServices: true,
          status: 'ACTIVE',
          isHeadquarters: false,
          parentCenterId: 1,
          totalDepartments: 5,
          totalStaff: 45,
          totalDoctors: 12,
          totalNurses: 18,
          lastInspectionDate: '2024-02-10',
          nextInspectionDate: '2024-08-10',
          rating: 4.7,
          totalPatients: 1500,
          monthlyRevenue: 1200000,
          monthlyExpenses: 900000,
          notes: 'Specialized medical services'
        }
      ];
      
      setCenters(mockCenters);
    } catch (err) {
      setError('Failed to fetch centers');
      console.error('Error fetching centers:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchDepartments = async () => {
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const mockDepartments = [
        {
          id: 1,
          departmentCode: 'DEPT-001',
          departmentName: 'General Medicine',
          centerId: 1,
          centerName: 'Main Hospital',
          headOfDepartment: 'Dr. Smith',
          description: 'General medical consultations and treatments',
          establishedDate: '2010-01-15',
          totalStaff: 25,
          totalDoctors: 8,
          totalNurses: 12,
          totalBeds: 30,
          operatingHours: '24/7',
          emergencyServices: true,
          status: 'ACTIVE',
          monthlyBudget: 500000,
          monthlyRevenue: 800000,
          specializations: ['General Practice', 'Preventive Care', 'Chronic Disease Management'],
          equipment: ['ECG Machine', 'X-Ray', 'Ultrasound', 'Pathology Lab'],
          notes: 'Primary care department'
        },
        {
          id: 2,
          departmentCode: 'DEPT-002',
          departmentName: 'Radiology',
          centerId: 1,
          centerName: 'Main Hospital',
          headOfDepartment: 'Dr. Johnson',
          description: 'Diagnostic imaging services',
          establishedDate: '2010-01-15',
          totalStaff: 20,
          totalDoctors: 6,
          totalNurses: 8,
          totalBeds: 0,
          operatingHours: '8 AM - 8 PM',
          emergencyServices: true,
          status: 'ACTIVE',
          monthlyBudget: 1500000,
          monthlyRevenue: 2000000,
          specializations: ['MRI', 'CT Scan', 'X-Ray', 'Ultrasound', 'Mammography'],
          equipment: ['MRI Machine', 'CT Scanner', 'X-Ray Machine', 'Ultrasound Machine'],
          notes: 'Advanced imaging services'
        },
        {
          id: 3,
          departmentCode: 'DEPT-003',
          departmentName: 'Cardiology',
          centerId: 4,
          centerName: 'Specialty Center',
          headOfDepartment: 'Dr. Williams',
          description: 'Cardiac care and treatment',
          establishedDate: '2020-09-15',
          totalStaff: 15,
          totalDoctors: 5,
          totalNurses: 8,
          totalBeds: 20,
          operatingHours: '8 AM - 10 PM',
          emergencyServices: true,
          status: 'ACTIVE',
          monthlyBudget: 800000,
          monthlyRevenue: 1200000,
          specializations: ['Interventional Cardiology', 'Electrophysiology', 'Cardiac Rehabilitation'],
          equipment: ['ECHO Machine', 'Stress Test Equipment', 'Cath Lab'],
          notes: 'Specialized cardiac care'
        },
        {
          id: 4,
          departmentCode: 'DEPT-004',
          departmentName: 'Laboratory',
          centerId: 2,
          centerName: 'Diagnostic Center',
          headOfDepartment: 'Dr. Brown',
          description: 'Pathology and laboratory services',
          establishedDate: '2015-06-20',
          totalStaff: 12,
          totalDoctors: 3,
          totalNurses: 5,
          totalBeds: 0,
          operatingHours: '8 AM - 8 PM',
          emergencyServices: false,
          status: 'ACTIVE',
          monthlyBudget: 300000,
          monthlyRevenue: 500000,
          specializations: ['Clinical Pathology', 'Biochemistry', 'Microbiology', 'Histopathology'],
          equipment: ['Auto Analyzer', 'Microscope', 'Centrifuge'],
          notes: 'Diagnostic laboratory services'
        }
      ];
      
      setDepartments(mockDepartments);
    } catch (err) {
      console.error('Error fetching departments:', err);
    }
  };

  const fetchStaff = async () => {
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const mockStaff = [
        {
          id: 1,
          staffCode: 'STAFF-001',
          firstName: 'John',
          lastName: 'Smith',
          email: 'john.smith@hospital.com',
          phone: '+91 9876543210',
          employeeType: 'DOCTOR',
          designation: 'Senior Doctor',
          departmentId: 1,
          departmentName: 'General Medicine',
          centerId: 1,
          centerName: 'Main Hospital',
          qualification: 'MBBS, MD',
          specialization: 'General Medicine',
          experience: 15,
          joinDate: '2010-01-15',
          salary: 150000,
          status: 'ACTIVE',
          workingHours: '9 AM - 6 PM',
          emergencyDuty: true,
          consultationFee: 500,
          availableDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
          notes: 'Senior physician with extensive experience'
        },
        {
          id: 2,
          staffCode: 'STAFF-002',
          firstName: 'Jane',
          lastName: 'Doe',
          email: 'jane.doe@hospital.com',
          phone: '+91 9876543211',
          employeeType: 'NURSE',
          designation: 'Head Nurse',
          departmentId: 1,
          departmentName: 'General Medicine',
          centerId: 1,
          centerName: 'Main Hospital',
          qualification: 'B.Sc Nursing',
          specialization: 'General Nursing',
          experience: 12,
          joinDate: '2010-03-20',
          salary: 45000,
          status: 'ACTIVE',
          workingHours: '8 AM - 4 PM',
          emergencyDuty: true,
          consultationFee: 0,
          availableDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
          notes: 'Head of nursing department'
        },
        {
          id: 3,
          staffCode: 'STAFF-003',
          firstName: 'Robert',
          lastName: 'Johnson',
          email: 'robert.johnson@hospital.com',
          phone: '+91 9876543212',
          employeeType: 'DOCTOR',
          designation: 'Radiologist',
          departmentId: 2,
          departmentName: 'Radiology',
          centerId: 1,
          centerName: 'Main Hospital',
          qualification: 'MBBS, MD Radiology',
          specialization: 'Diagnostic Radiology',
          experience: 10,
          joinDate: '2012-06-15',
          salary: 180000,
          status: 'ACTIVE',
          workingHours: '9 AM - 6 PM',
          emergencyDuty: true,
          consultationFee: 800,
          availableDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
          notes: 'Specialized in diagnostic imaging'
        },
        {
          id: 4,
          staffCode: 'STAFF-004',
          firstName: 'Mary',
          lastName: 'Williams',
          email: 'mary.williams@hospital.com',
          phone: '+91 9876543213',
          employeeType: 'DOCTOR',
          designation: 'Cardiologist',
          departmentId: 3,
          departmentName: 'Cardiology',
          centerId: 4,
          centerName: 'Specialty Center',
          qualification: 'MBBS, MD Cardiology',
          specialization: 'Interventional Cardiology',
          experience: 8,
          joinDate: '2020-09-20',
          salary: 200000,
          status: 'ACTIVE',
          workingHours: '9 AM - 6 PM',
          emergencyDuty: true,
          consultationFee: 1200,
          availableDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
          notes: 'Specialized in cardiac interventions'
        },
        {
          id: 5,
          staffCode: 'STAFF-005',
          firstName: 'Michael',
          lastName: 'Brown',
          email: 'michael.brown@hospital.com',
          phone: '+91 9876543214',
          employeeType: 'ADMIN',
          designation: 'Center Manager',
          departmentId: null,
          departmentName: 'Administration',
          centerId: 2,
          centerName: 'Diagnostic Center',
          qualification: 'MBA',
          specialization: 'Healthcare Management',
          experience: 6,
          joinDate: '2018-04-10',
          salary: 80000,
          status: 'ACTIVE',
          workingHours: '9 AM - 6 PM',
          emergencyDuty: false,
          consultationFee: 0,
          availableDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
          notes: 'Center operations manager'
        }
      ];
      
      setStaff(mockStaff);
    } catch (err) {
      console.error('Error fetching staff:', err);
    }
  };

  const handleAddCenter = async (formData) => {
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const newCenter = {
        id: centers.length + 1,
        centerCode: formData.centerCode,
        ...formData,
        status: 'ACTIVE',
        establishedDate: new Date().toISOString().split('T')[0],
        totalDepartments: 0,
        totalStaff: 0,
        totalDoctors: 0,
        totalNurses: 0,
        totalPatients: 0,
        monthlyRevenue: 0,
        monthlyExpenses: 0
      };
      
      setCenters([...centers, newCenter]);
      setShowAddModal(false);
      alert('Center added successfully!');
    } catch (err) {
      console.error('Error adding center:', err);
      alert('Failed to add center');
    }
  };

  const handleEditCenter = async (formData) => {
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      setCenters(centers.map(center => 
        center.id === editingItem.id 
          ? { ...center, ...formData }
          : center
      ));
      setShowEditModal(false);
      setEditingItem(null);
      alert('Center updated successfully!');
    } catch (err) {
      console.error('Error updating center:', err);
      alert('Failed to update center');
    }
  };

  const handleDeleteCenter = async (centerId) => {
    if (!confirm('Are you sure you want to delete this center?')) {
      return;
    }
    
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      setCenters(centers.filter(center => center.id !== centerId));
      alert('Center deleted successfully!');
    } catch (err) {
      console.error('Error deleting center:', err);
      alert('Failed to delete center');
    }
  };

  const getCenterTypeColor = (type) => {
    switch (type) {
      case 'HOSPITAL': return 'text-blue-600 bg-blue-100';
      case 'DIAGNOSTIC': return 'text-purple-600 bg-purple-100';
      case 'CLINIC': return 'text-green-600 bg-green-100';
      case 'SPECIALTY': return 'text-orange-600 bg-orange-100';
      default: return 'text-gray-600 bg-gray-100';
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

  const getEmployeeTypeColor = (type) => {
    switch (type) {
      case 'DOCTOR': return 'text-blue-600 bg-blue-100';
      case 'NURSE': return 'text-green-600 bg-green-100';
      case 'ADMIN': return 'text-purple-600 bg-purple-100';
      case 'TECHNICIAN': return 'text-orange-600 bg-orange-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(amount);
  };

  // Centers table columns
  const centerColumns = [
    {
      key: 'centerCode',
      title: 'Center Code',
      sortable: true,
      render: (value) => <span className="font-medium">{value}</span>
    },
    {
      key: 'centerName',
      title: 'Center Name',
      sortable: true,
      render: (value, row) => (
        <div>
          <div className="font-medium">{value}</div>
          <div className="text-sm text-gray-500">{row.address}</div>
        </div>
      )
    },
    {
      key: 'centerType',
      title: 'Type',
      sortable: true,
      render: (value) => (
        <span className={`px-2 py-1 text-xs font-medium rounded-full ${getCenterTypeColor(value)}`}>
          {value}
        </span>
      )
    },
    {
      key: 'capacity',
      title: 'Capacity',
      sortable: true,
      render: (value, row) => (
        <div>
          <div>{value} patients</div>
          <div className="text-sm text-gray-500">{row.bedCount} beds</div>
        </div>
      )
    },
    {
      key: 'totalStaff',
      title: 'Staff',
      sortable: true,
      render: (value, row) => (
        <div>
          <div>{value} total</div>
          <div className="text-sm text-gray-500">{row.totalDoctors} doctors</div>
        </div>
      )
    },
    {
      key: 'monthlyRevenue',
      title: 'Monthly Revenue',
      sortable: true,
      render: (value) => formatCurrency(value)
    },
    {
      key: 'rating',
      title: 'Rating',
      sortable: true,
      render: (value) => (
        <div className="flex items-center">
          <span className="text-yellow-500">★</span>
          <span className="ml-1">{value}</span>
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

  // Departments table columns
  const departmentColumns = [
    {
      key: 'departmentCode',
      title: 'Department Code',
      sortable: true,
      render: (value) => <span className="font-medium">{value}</span>
    },
    {
      key: 'departmentName',
      title: 'Department Name',
      sortable: true,
      render: (value, row) => (
        <div>
          <div className="font-medium">{value}</div>
          <div className="text-sm text-gray-500">{row.centerName}</div>
        </div>
      )
    },
    {
      key: 'headOfDepartment',
      title: 'Head',
      sortable: true
    },
    {
      key: 'totalStaff',
      title: 'Staff',
      sortable: true,
      render: (value, row) => (
        <div>
          <div>{value} total</div>
          <div className="text-sm text-gray-500">{row.totalDoctors} doctors</div>
        </div>
      )
    },
    {
      key: 'totalBeds',
      title: 'Beds',
      sortable: true
    },
    {
      key: 'monthlyBudget',
      title: 'Monthly Budget',
      sortable: true,
      render: (value) => formatCurrency(value)
    },
    {
      key: 'monthlyRevenue',
      title: 'Monthly Revenue',
      sortable: true,
      render: (value) => formatCurrency(value)
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

  // Staff table columns
  const staffColumns = [
    {
      key: 'staffCode',
      title: 'Staff Code',
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
      key: 'employeeType',
      title: 'Type',
      sortable: true,
      render: (value) => (
        <span className={`px-2 py-1 text-xs font-medium rounded-full ${getEmployeeTypeColor(value)}`}>
          {value}
        </span>
      )
    },
    {
      key: 'designation',
      title: 'Designation',
      sortable: true
    },
    {
      key: 'departmentName',
      title: 'Department',
      sortable: true,
      render: (value, row) => (
        <div>
          <div>{value}</div>
          <div className="text-sm text-gray-500">{row.centerName}</div>
        </div>
      )
    },
    {
      key: 'experience',
      title: 'Experience',
      sortable: true,
      render: (value) => `${value} years`
    },
    {
      key: 'salary',
      title: 'Salary',
      sortable: true,
      render: (value) => formatCurrency(value)
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

  // Form fields for centers
  const centerFormFields = [
    {
      name: 'centerCode',
      label: 'Center Code',
      type: 'text',
      required: true,
      placeholder: 'Enter center code'
    },
    {
      name: 'centerName',
      label: 'Center Name',
      type: 'text',
      required: true,
      placeholder: 'Enter center name'
    },
    {
      name: 'centerType',
      label: 'Center Type',
      type: 'select',
      required: true,
      options: [
        { value: 'HOSPITAL', label: 'Hospital' },
        { value: 'DIAGNOSTIC', label: 'Diagnostic Center' },
        { value: 'CLINIC', label: 'Clinic' },
        { value: 'SPECIALTY', label: 'Specialty Center' }
      ]
    },
    {
      name: 'description',
      label: 'Description',
      type: 'textarea',
      placeholder: 'Enter description'
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
      name: 'phone',
      label: 'Phone',
      type: 'tel',
      required: true,
      placeholder: 'Enter phone number'
    },
    {
      name: 'email',
      label: 'Email',
      type: 'email',
      required: true,
      placeholder: 'Enter email address'
    },
    {
      name: 'capacity',
      label: 'Capacity',
      type: 'number',
      required: true,
      placeholder: 'Enter patient capacity'
    },
    {
      name: 'bedCount',
      label: 'Bed Count',
      type: 'number',
      required: true,
      placeholder: 'Enter bed count'
    },
    {
      name: 'operatingHours',
      label: 'Operating Hours',
      type: 'text',
      placeholder: 'Enter operating hours'
    },
    {
      name: 'licenseNumber',
      label: 'License Number',
      type: 'text',
      required: true,
      placeholder: 'Enter license number'
    },
    {
      name: 'notes',
      label: 'Notes',
      type: 'textarea',
      placeholder: 'Enter notes'
    }
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Center Management</h1>
          <p className="text-gray-600 mt-1">Manage centers, departments, and staff</p>
        </div>
        
        <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-4 space-y-2 sm:space-y-0">
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Center
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('centers')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'centers'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Centers
          </button>
          <button
            onClick={() => setActiveTab('departments')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'departments'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Departments
          </button>
          <button
            onClick={() => setActiveTab('staff')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'staff'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Staff
          </button>
        </nav>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <ResponsiveCard>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Centers</p>
              <p className="text-2xl font-bold text-gray-900">{centers.length}</p>
            </div>
            <div className="w-12 h-12 bg-blue-500 rounded-lg flex items-center justify-center">
              <Building className="w-6 h-6 text-white" />
            </div>
          </div>
        </ResponsiveCard>

        <ResponsiveCard>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Departments</p>
              <p className="text-2xl font-bold text-green-600">{departments.length}</p>
            </div>
            <div className="w-12 h-12 bg-green-500 rounded-lg flex items-center justify-center">
              <Settings className="w-6 h-6 text-white" />
            </div>
          </div>
        </ResponsiveCard>

        <ResponsiveCard>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Staff</p>
              <p className="text-2xl font-bold text-purple-600">{staff.length}</p>
            </div>
            <div className="w-12 h-12 bg-purple-500 rounded-lg flex items-center justify-center">
              <Users className="w-6 h-6 text-white" />
            </div>
          </div>
        </ResponsiveCard>

        <ResponsiveCard>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Capacity</p>
              <p className="text-2xl font-bold text-orange-600">
                {centers.reduce((sum, center) => sum + center.capacity, 0)}
              </p>
            </div>
            <div className="w-12 h-12 bg-orange-500 rounded-lg flex items-center justify-center">
              <User className="w-6 h-6 text-white" />
            </div>
          </div>
        </ResponsiveCard>
      </div>

      {/* Tab Content */}
      {activeTab === 'centers' && (
        <ResponsiveCard>
          <ResponsiveTable
            data={centers}
            columns={centerColumns}
            loading={loading}
            error={error}
            searchable={true}
            selectable={true}
            onSelectionChange={setSelectedItems}
            viewMode={viewMode}
            showViewToggle={true}
            onRefresh={fetchCenters}
          />
        </ResponsiveCard>
      )}

      {activeTab === 'departments' && (
        <ResponsiveCard>
          <ResponsiveTable
            data={departments}
            columns={departmentColumns}
            loading={loading}
            error={error}
            searchable={true}
            selectable={false}
            viewMode={viewMode}
            showViewToggle={true}
            onRefresh={fetchDepartments}
          />
        </ResponsiveCard>
      )}

      {activeTab === 'staff' && (
        <ResponsiveCard>
          <ResponsiveTable
            data={staff}
            columns={staffColumns}
            loading={loading}
            error={error}
            searchable={true}
            selectable={false}
            viewMode={viewMode}
            showViewToggle={true}
            onRefresh={fetchStaff}
          />
        </ResponsiveCard>
      )}

      {/* Add Center Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">Add New Center</h2>
            </div>
            <div className="p-6">
              <ResponsiveForm
                fields={centerFormFields}
                onSubmit={handleAddCenter}
                onCancel={() => setShowAddModal(false)}
                submitText="Add Center"
                layout="responsive"
              />
            </div>
          </div>
        </div>
      )}

      {/* Edit Center Modal */}
      {showEditModal && editingItem && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">Edit Center</h2>
            </div>
            <div className="p-6">
              <ResponsiveForm
                fields={centerFormFields}
                initialValues={editingItem}
                onSubmit={handleEditCenter}
                onCancel={() => {
                  setShowEditModal(false);
                  setEditingItem(null);
                }}
                submitText="Update Center"
                layout="responsive"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CenterManagement;
