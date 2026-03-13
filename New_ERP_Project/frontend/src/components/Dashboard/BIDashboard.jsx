import React, { useState, useEffect } from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  CreditCard, 
  FileText, 
  Users,
  Building,
  Calendar,
  Filter,
  Search,
  Download,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  ArrowUpRight,
  ArrowDownRight,
  Eye,
  EyeOff,
  Maximize2,
  Minimize2,
  BarChart3,
  PieChart,
  LineChart,
  Activity,
  Database,
  FileSpreadsheet,
  Receipt,
  Calculator,
  Briefcase,
  UserCheck,
  Clock,
  AlertTriangle,
  CheckCircle,
  Info,
  Layers,
  Zap,
  Target,
  TrendingUp as TrendingUpIcon
} from 'lucide-react';
import ResponsiveCard from '../Common/ResponsiveCard';
import ResponsiveTable from '../Common/ResponsiveTable';
import {
  LineChart,
  AreaChart,
  BarChart,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  RadialBarChart,
  RadialBar,
  ComposedChart,
  ScatterChart,
  Scatter,
  Treemap
} from 'recharts';
import '../styles/theme.css';

const BIDashboard = () => {
  const [drillDownPath, setDrillDownPath] = useState([]);
  const [currentView, setCurrentView] = useState('overview');
  const [selectedMetric, setSelectedMetric] = useState('revenue');
  const [dateRange, setDateRange] = useState('month');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [screenSize, setScreenSize] = useState('desktop');
  const [expandedSections, setExpandedSections] = useState({});
  const [showFilters, setShowFilters] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [compareMode, setCompareMode] = useState(false);
  const [selectedItems, setSelectedItems] = useState(new Set());

  // Detect screen size
  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      if (width < 768) {
        setScreenSize('mobile');
      } else if (width < 1024) {
        setScreenSize('tablet');
      } else {
        setScreenSize('desktop');
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Comprehensive BI data structure
  const [biData, setBiData] = useState({
    overview: {
      totalRevenue: 12456789,
      totalExpenses: 8765432,
      netProfit: 3691357,
      totalPayables: 2345678,
      totalReceivables: 3456789,
      totalPayroll: 2345678,
      operatingMargin: 29.6,
      cashFlow: 1345678,
      employeeCount: 567,
      patientCount: 45678,
      bedOccupancy: 78.5,
      collectionRate: 94.3,
      staffProductivity: 87.2
    },
    revenue: {
      monthly: [
        { month: 'Jan', revenue: 8900000, target: 9500000, variance: -600000, growth: 8.5 },
        { month: 'Feb', revenue: 9200000, target: 9800000, variance: -600000, growth: 3.4 },
        { month: 'Mar', revenue: 12456789, target: 12000000, variance: 456789, growth: 35.5 },
        { month: 'Apr', revenue: 11200000, target: 11500000, variance: -300000, growth: -10.1 },
        { month: 'May', revenue: 13500000, target: 13000000, variance: 500000, growth: 20.5 },
        { month: 'Jun', revenue: 14200000, target: 14000000, variance: 200000, growth: 5.2 }
      ],
      byCategory: [
        { 
          category: 'Consultations', 
          amount: 4567890, 
          percentage: 36.7, 
          growth: 12.5,
          subCategories: [
            { name: 'General Medicine', amount: 2345678, patients: 5678 },
            { name: 'Specialist Consultations', amount: 1234567, patients: 2345 },
            { name: 'Emergency', amount: 987655, patients: 1234 }
          ]
        },
        { 
          category: 'Diagnostics', 
          amount: 3456789, 
          percentage: 27.7, 
          growth: 8.3,
          subCategories: [
            { name: 'Radiology', amount: 1987654, tests: 3456 },
            { name: 'Pathology', amount: 987654, tests: 5678 },
            { name: 'Cardiology', amount: 481481, tests: 1234 }
          ]
        },
        { 
          category: 'Pharmacy', 
          amount: 2345678, 
          percentage: 18.8, 
          growth: 15.2,
          subCategories: [
            { name: 'Prescription Drugs', amount: 1876542, items: 12345 },
            { name: 'OTC Products', amount: 345678, items: 5678 },
            { name: 'Medical Supplies', amount: 123458, items: 2345 }
          ]
        },
        { 
          category: 'Lab Tests', 
          amount: 1234567, 
          percentage: 9.9, 
          growth: 6.7,
          subCategories: [
            { name: 'Blood Tests', amount: 678901, tests: 8901 },
            { name: 'Urine Tests', amount: 345678, tests: 4567 },
            { name: 'Other Tests', amount: 209988, tests: 2345 }
          ]
        },
        { 
          category: 'Imaging', 
          amount: 987654, 
          percentage: 7.9, 
          growth: 18.9,
          subCategories: [
            { name: 'X-Ray', amount: 456789, scans: 1234 },
            { name: 'CT Scan', amount: 321456, scans: 567 },
            { name: 'MRI', amount: 209409, scans: 234 }
          ]
        }
      ],
      byCenter: [
        { 
          center: 'Main Hospital', 
          revenue: 7234567, 
          percentage: 58.1, 
          patients: 28901,
          departments: [
            { name: 'General Medicine', revenue: 3456789, patients: 12345 },
            { name: 'Radiology', revenue: 1987654, patients: 6789 },
            { name: 'Pharmacy', revenue: 1234567, patients: 5678 },
            { name: 'Laboratory', revenue: 555557, patients: 4089 }
          ]
        },
        { 
          center: 'Diagnostic Center', 
          revenue: 3456789, 
          percentage: 27.8, 
          patients: 13456,
          departments: [
            { name: 'Radiology', revenue: 1987654, patients: 6789 },
            { name: 'Pathology', revenue: 987654, patients: 4567 },
            { name: 'Cardiology', revenue: 481481, patients: 2100 }
          ]
        },
        { 
          center: 'Clinic Branch', 
          revenue: 1234567, 
          percentage: 9.9, 
          patients: 5678,
          departments: [
            { name: 'General Medicine', revenue: 987654, patients: 4567 },
            { name: 'Pharmacy', revenue: 234567, patients: 1111 }
          ]
        },
        { 
          center: 'Specialty Center', 
          revenue: 1234567, 
          percentage: 4.2, 
          patients: 2343,
          departments: [
            { name: 'Cardiology', revenue: 987654, patients: 1234 },
            { name: 'Orthopedics', revenue: 234567, patients: 890 },
            { name: 'Neurology', revenue: 12346, patients: 219 }
          ]
        }
      ],
      byPayer: [
        { 
          payer: 'Insurance Companies', 
          amount: 6789012, 
          percentage: 54.5, 
          growth: 12.3,
          companies: [
            { name: 'Health Insurance Co.', amount: 3456789, claims: 1234 },
            { name: 'Life Insurance Corp.', amount: 2345678, claims: 987 },
            { name: 'General Insurance', amount: 987545, claims: 456 }
          ]
        },
        { 
          payer: 'Corporate Clients', 
          amount: 3456789, 
          percentage: 27.8, 
          growth: 8.7,
          companies: [
            { name: 'Corporate A', amount: 1987654, employees: 5678 },
            { name: 'Corporate B', amount: 987654, employees: 3456 },
            { name: 'Corporate C', amount: 481481, employees: 1234 }
          ]
        },
        { 
          payer: 'Individual Patients', 
          amount: 1987654, 
          percentage: 16.0, 
          growth: 5.4,
          paymentMethods: [
            { name: 'Cash', amount: 987654, transactions: 2345 },
            { name: 'Card', amount: 678901, transactions: 1234 },
            { name: 'UPI', amount: 321099, transactions: 3456 }
          ]
        },
        { 
          payer: 'Government Schemes', 
          amount: 234567, 
          percentage: 1.9, 
          growth: 15.6,
          schemes: [
            { name: 'Ayushman Bharat', amount: 123456, beneficiaries: 1234 },
            { name: 'State Health Scheme', amount: 87654, beneficiaries: 567 },
            { name: 'Central Govt Scheme', amount: 23457, beneficiaries: 234 }
          ]
        }
      ]
    },
    payables: {
      total: 2345678,
      aging: [
        { period: '0-30 days', amount: 876543, percentage: 37.4, count: 45 },
        { period: '31-60 days', amount: 654321, percentage: 27.9, count: 32 },
        { period: '61-90 days', amount: 456789, percentage: 19.5, count: 23 },
        { period: '90+ days', amount: 358025, percentage: 15.2, count: 18 }
      ],
      byVendor: [
        { 
          vendor: 'Medical Supplies Co.', 
          amount: 678901, 
          percentage: 28.9, 
          dueDate: '2024-03-20',
          aging: '0-30 days',
          invoices: [
            { number: 'INV-001', amount: 234567, dueDate: '2024-03-15', status: 'Pending' },
            { number: 'INV-002', amount: 198765, dueDate: '2024-03-20', status: 'Pending' },
            { number: 'INV-003', amount: 245569, dueDate: '2024-03-25', status: 'Pending' }
          ]
        },
        { 
          vendor: 'Pharma Corp', 
          amount: 567890, 
          percentage: 24.2, 
          dueDate: '2024-03-25',
          aging: '31-60 days',
          invoices: [
            { number: 'INV-004', amount: 345678, dueDate: '2024-04-01', status: 'Pending' },
            { number: 'INV-005', amount: 222212, dueDate: '2024-04-05', status: 'Pending' }
          ]
        },
        { 
          vendor: 'Equipment Ltd', 
          amount: 456789, 
          percentage: 19.5, 
          dueDate: '2024-04-01',
          aging: '61-90 days',
          invoices: [
            { number: 'INV-006', amount: 456789, dueDate: '2024-04-01', status: 'Pending' }
          ]
        },
        { 
          vendor: 'Lab Supplies', 
          amount: 345678, 
          percentage: 14.7, 
          dueDate: '2024-03-18',
          aging: '0-30 days',
          invoices: [
            { number: 'INV-007', amount: 198765, dueDate: '2024-03-18', status: 'Pending' },
            { number: 'INV-008', amount: 146913, dueDate: '2024-03-22', status: 'Pending' }
          ]
        },
        { 
          vendor: 'Others', 
          amount: 296420, 
          percentage: 12.7, 
          dueDate: 'Various',
          aging: 'Mixed',
          invoices: [
            { number: 'INV-009', amount: 123456, dueDate: '2024-03-30', status: 'Pending' },
            { number: 'INV-010', amount: 98765, dueDate: '2024-04-10', status: 'Pending' },
            { number: 'INV-011', amount: 74199, dueDate: '2024-04-15', status: 'Pending' }
          ]
        }
      ],
      byCategory: [
        { category: 'Medical Supplies', amount: 987654, percentage: 42.1 },
        { category: 'Pharmaceuticals', amount: 678901, percentage: 28.9 },
        { category: 'Equipment', amount: 456789, percentage: 19.5 },
        { category: 'Services', amount: 234567, percentage: 10.0 },
        { category: 'Other', amount: 98767, percentage: 4.2 }
      ],
      trends: [
        { month: 'Jan', amount: 2100000, new: 450000, overdue: 1650000 },
        { month: 'Feb', amount: 2250000, new: 500000, overdue: 1750000 },
        { month: 'Mar', amount: 2345678, new: 567890, overdue: 1777788 },
        { month: 'Apr', amount: 2450000, new: 600000, overdue: 1850000 },
        { month: 'May', amount: 2380000, new: 550000, overdue: 1830000 },
        { month: 'Jun', amount: 2345678, new: 523456, overdue: 1822222 }
      ]
    },
    receivables: {
      total: 3456789,
      aging: [
        { period: '0-30 days', amount: 1987654, percentage: 57.5, count: 234 },
        { period: '31-60 days', amount: 876543, percentage: 25.4, count: 123 },
        { period: '61-90 days', amount: 456789, percentage: 13.2, count: 67 },
        { period: '90+ days', amount: 135803, percentage: 3.9, count: 23 }
      ],
      byPayer: [
        { 
          payer: 'Insurance Companies', 
          amount: 1987654, 
          percentage: 57.5, 
          aging: '0-30 days',
          companies: [
            { name: 'Health Insurance Co.', amount: 987654, claims: 567 },
            { name: 'Life Insurance Corp.', amount: 678901, claims: 345 },
            { name: 'General Insurance', amount: 321099, claims: 234 }
          ]
        },
        { 
          payer: 'Corporate Clients', 
          amount: 987654, 
          percentage: 28.6, 
          aging: '31-60 days',
          companies: [
            { name: 'Corporate A', amount: 567890, employees: 2345 },
            { name: 'Corporate B', amount: 321099, employees: 1234 },
            { name: 'Corporate C', amount: 98665, employees: 456 }
          ]
        },
        { 
          payer: 'Individual Patients', 
          amount: 456789, 
          percentage: 13.2, 
          aging: '0-30 days',
          paymentMethods: [
            { name: 'Cash', amount: 234567, transactions: 1234 },
            { name: 'Card', amount: 156789, transactions: 678 },
            { name: 'UPI', amount: 65433, transactions: 2345 }
          ]
        },
        { 
          payer: 'Government Schemes', 
          amount: 234567, 
          percentage: 6.8, 
          aging: '61-90 days',
          schemes: [
            { name: 'Ayushman Bharat', amount: 123456, beneficiaries: 567 },
            { name: 'State Health Scheme', amount: 87654, beneficiaries: 234 },
            { name: 'Central Govt Scheme', amount: 23457, beneficiaries: 123 }
          ]
        }
      ],
      byService: [
        { service: 'Consultations', amount: 1456789, percentage: 42.2 },
        { service: 'Diagnostics', amount: 987654, percentage: 28.6 },
        { service: 'Pharmacy', amount: 678901, percentage: 19.6 },
        { service: 'Lab Tests', amount: 234567, percentage: 6.8 },
        { service: 'Imaging', amount: 9878, percentage: 0.3 }
      ],
      collection: {
        monthlyRate: [
          { month: 'Jan', rate: 92.5, target: 95.0 },
          { month: 'Feb', rate: 93.2, target: 95.0 },
          { month: 'Mar', rate: 94.3, target: 95.0 },
          { month: 'Apr', rate: 93.8, target: 95.0 },
          { month: 'May', rate: 94.7, target: 95.0 },
          { month: 'Jun', rate: 94.3, target: 95.0 }
        ],
        byPayer: [
          { payer: 'Insurance', rate: 96.5, amount: 1987654 },
          { payer: 'Corporate', rate: 92.3, amount: 987654 },
          { payer: 'Individual', rate: 88.7, amount: 456789 },
          { payer: 'Government', rate: 78.9, amount: 234567 }
        ]
      }
    },
    expenses: {
      total: 8765432,
      categories: [
        { 
          category: 'Salaries & Wages', 
          amount: 4234567, 
          percentage: 48.3, 
          budget: 4500000,
          variance: -265433,
          subCategories: [
            { name: 'Doctors', amount: 2345678, count: 45, avgSalary: 52126 },
            { name: 'Nurses', amount: 1234567, count: 89, avgSalary: 13872 },
            { name: 'Administrative Staff', amount: 456789, count: 23, avgSalary: 19860 },
            { name: 'Support Staff', amount: 198533, count: 34, avgSalary: 5845 }
          ]
        },
        { 
          category: 'Medical Supplies', 
          amount: 2345678, 
          percentage: 26.8, 
          budget: 2500000,
          variance: -154322,
          subCategories: [
            { name: 'Consumables', amount: 1234567, items: 12345 },
            { name: 'Pharmaceuticals', amount: 876543, items: 5678 },
            { name: 'Equipment', amount: 234568, items: 234 }
          ]
        },
        { 
          category: 'Facility Costs', 
          amount: 1234567, 
          percentage: 14.1, 
          budget: 1300000,
          variance: -65433,
          subCategories: [
            { name: 'Rent', amount: 567890, sqft: 25000 },
            { name: 'Utilities', amount: 345678, units: 'Various' },
            { name: 'Maintenance', amount: 321099, workOrders: 123 }
          ]
        },
        { 
          category: 'Administrative', 
          amount: 678901, 
          percentage: 7.7, 
          budget: 700000,
          variance: -21099,
          subCategories: [
            { name: 'Office Supplies', amount: 123456, items: 2345 },
            { name: 'Legal', amount: 234567, cases: 12 },
            { name: 'Insurance', amount: 321878, policies: 45 }
          ]
        },
        { 
          category: 'Other Expenses', 
          amount: 271719, 
          percentage: 3.1, 
          budget: 300000,
          variance: -28281,
          subCategories: [
            { name: 'Marketing', amount: 123456, campaigns: 12 },
            { name: 'Training', amount: 98765, programs: 8 },
            { name: 'Travel', amount: 49498, trips: 34 }
          ]
        }
      ],
      trends: [
        { month: 'Jan', amount: 7500000, budget: 7800000, variance: -300000 },
        { month: 'Feb', amount: 7800000, budget: 8000000, variance: -200000 },
        { month: 'Mar', amount: 8765432, budget: 9000000, variance: -234568 },
        { month: 'Apr', amount: 8200000, budget: 8500000, variance: -300000 },
        { month: 'May', amount: 8900000, budget: 9200000, variance: -300000 },
        { month: 'Jun', amount: 8765432, budget: 9000000, variance: -234568 }
      ],
      byCenter: [
        { center: 'Main Hospital', amount: 5234567, percentage: 59.7 },
        { center: 'Diagnostic Center', amount: 2345678, percentage: 26.8 },
        { center: 'Clinic Branch', amount: 876543, percentage: 10.0 },
        { center: 'Specialty Center', amount: 308644, percentage: 3.5 }
      ]
    },
    payroll: {
      total: 2345678,
      employees: 567,
      departments: [
        { 
          department: 'Medical', 
          employees: 156, 
          totalSalary: 1456789, 
          percentage: 62.1,
          roles: [
            { title: 'Senior Doctors', count: 25, totalSalary: 678901, avgSalary: 27156 },
            { title: 'Junior Doctors', count: 45, totalSalary: 456789, avgSalary: 10151 },
            { title: 'Nurses', count: 67, totalSalary: 234567, avgSalary: 3502 },
            { title: 'Technicians', count: 19, totalSalary: 87532, avgSalary: 4607 }
          ]
        },
        { 
          department: 'Administrative', 
          employees: 89, 
          totalSalary: 456789, 
          percentage: 19.5,
          roles: [
            { title: 'Management', count: 12, totalSalary: 234567, avgSalary: 19547 },
            { title: 'Accounting', count: 15, totalSalary: 123456, avgSalary: 8230 },
            { title: 'HR', count: 8, totalSalary: 56789, avgSalary: 7099 },
            { title: 'Support Staff', count: 54, totalSalary: 41977, avgSalary: 777 }
          ]
        },
        { 
          department: 'Support Services', 
          employees: 234, 
          totalSalary: 345678, 
          percentage: 14.7,
          roles: [
            { title: 'Housekeeping', count: 67, totalSalary: 123456, avgSalary: 1842 },
            { title: 'Security', count: 34, totalSalary: 98765, avgSalary: 2905 },
            { title: 'Maintenance', count: 23, totalSalary: 67890, avgSalary: 2952 },
            { title: 'Other Support', count: 110, totalSalary: 55567, avgSalary: 505 }
          ]
        },
        { 
          department: 'Management', 
          employees: 88, 
          totalSalary: 86422, 
          percentage: 3.7,
          roles: [
            { title: 'Senior Management', count: 8, totalSalary: 45678, avgSalary: 5709 },
            { title: 'Middle Management', count: 25, totalSalary: 34567, avgSalary: 1383 },
            { title: 'Supervisors', count: 55, totalSalary: 6177, avgSalary: 112 }
          ]
        }
      ],
      trends: [
        { month: 'Jan', amount: 2100000, employees: 550, avgSalary: 3818 },
        { month: 'Feb', amount: 2200000, employees: 555, avgSalary: 3964 },
        { month: 'Mar', amount: 2345678, employees: 567, avgSalary: 4135 },
        { month: 'Apr', amount: 2380000, employees: 570, avgSalary: 4175 },
        { month: 'May', amount: 2420000, employees: 575, avgSalary: 4217 },
        { month: 'Jun', amount: 2345678, employees: 567, avgSalary: 4135 }
      ],
      benefits: [
        { type: 'Health Insurance', amount: 345678, percentage: 14.7, employees: 567 },
        { type: 'Provident Fund', amount: 234567, percentage: 10.0, employees: 567 },
        { type: 'Gratuity', amount: 123456, percentage: 5.3, employees: 567 },
        { type: 'Other Benefits', amount: 198765, percentage: 8.5, employees: 567 }
      ],
      performance: [
        { metric: 'Productivity', score: 87.2, target: 90.0 },
        { metric: 'Attendance', score: 94.5, target: 95.0 },
        { metric: 'Overtime', hours: 1234, budget: 1500 },
        { metric: 'Training', hours: 567, target: 600 }
      ]
    }
  });

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(amount);
  };

  const formatPercentage = (value) => {
    return `${value.toFixed(1)}%`;
  };

  // Drill-down navigation
  const handleDrillDown = (path, data) => {
    setDrillDownPath([...drillDownPath, { path, data }]);
    setCurrentView(path);
  };

  const handleDrillUp = () => {
    if (drillDownPath.length > 0) {
      const newPath = drillDownDownPath.slice(0, -1);
      setDrillDownPath(newPath);
      setCurrentView(newPath.length > 0 ? newPath[newPath.length - 1].path : 'overview');
    }
  };

  const handleReset = () => {
    setDrillDownPath([]);
    setCurrentView('overview');
    setSelectedMetric('revenue');
    setSelectedItems(new Set());
  };

  // Custom tooltip for BI charts
  const BITooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-4 border border-gray-200 rounded-lg shadow-lg max-w-xs">
          <p className="font-semibold text-gray-900 mb-2">{label}</p>
          {payload.map((entry, index) => (
            <div key={index} className="mb-1">
              <p className="text-sm font-medium" style={{ color: entry.color }}>
                {entry.name}: {entry.name.includes('Amount') || entry.name.includes('Revenue') || entry.name.includes('Salary') ? 
                  formatCurrency(entry.value) : 
                  entry.name.includes('Percentage') || entry.name.includes('Rate') ? 
                  formatPercentage(entry.value) : 
                  entry.value
                }
              </p>
              {entry.payload?.growth && (
                <p className="text-xs text-gray-500">
                  Growth: {formatPercentage(entry.payload.growth)}
                </p>
              )}
              {entry.payload?.variance && (
                <p className="text-xs text-gray-500">
                  Variance: {formatCurrency(entry.payload.variance)}
                </p>
              )}
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  // Render breadcrumb navigation
  const renderBreadcrumb = () => (
    <div className="flex items-center space-x-2 mb-6">
      <button
        onClick={handleReset}
        className={`px-3 py-1 rounded-lg transition-colors ${
          drillDownPath.length === 0 
            ? 'bg-blue-600 text-white' 
            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
        }`}
      >
        Overview
      </button>
      {drillDownPath.map((item, index) => (
        <React.Fragment key={index}>
          <ChevronRight className="w-4 h-4 text-gray-400" />
          <button
            onClick={() => {
              setDrillDownPath(drillDownPath.slice(0, index + 1));
              setCurrentView(item.path);
            }}
            className="px-3 py-1 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
          >
            {item.path}
          </button>
        </React.Fragment>
      ))}
    </div>
  );

  // Render overview metrics
  const renderOverviewMetrics = () => (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <ResponsiveCard>
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-600">Total Revenue</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">
              {formatCurrency(biData.overview.totalRevenue)}
            </p>
            <div className="flex items-center mt-2">
              <ArrowUpRight className="w-4 h-4 text-green-500 mr-1" />
              <span className="text-sm text-green-600">+12.5%</span>
            </div>
          </div>
          <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
            <DollarSign className="w-6 h-6 text-green-600" />
          </div>
        </div>
      </ResponsiveCard>

      <ResponsiveCard>
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-600">Total Payables</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">
              {formatCurrency(biData.overview.totalPayables)}
            </p>
            <div className="flex items-center mt-2">
              <ArrowDownRight className="w-4 h-4 text-red-500 mr-1" />
              <span className="text-sm text-red-600">+5.2%</span>
            </div>
          </div>
          <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
            <CreditCard className="w-6 h-6 text-orange-600" />
          </div>
        </div>
      </ResponsiveCard>

      <ResponsiveCard>
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-600">Total Receivables</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">
              {formatCurrency(biData.overview.totalReceivables)}
            </p>
            <div className="flex items-center mt-2">
              <ArrowUpRight className="w-4 h-4 text-green-500 mr-1" />
              <span className="text-sm text-green-600">+8.7%</span>
            </div>
          </div>
          <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
            <FileText className="w-6 h-6 text-blue-600" />
          </div>
        </div>
      </ResponsiveCard>

      <ResponsiveCard>
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-600">Total Payroll</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">
              {formatCurrency(biData.overview.totalPayroll)}
            </p>
            <div className="flex items-center mt-2">
              <ArrowUpRight className="w-4 h-4 text-green-500 mr-1" />
              <span className="text-sm text-green-600">+3.2%</span>
            </div>
          </div>
          <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
            <Users className="w-6 h-6 text-purple-600" />
          </div>
        </div>
      </ResponsiveCard>
    </div>
  );

  // Render revenue drill-down
  const renderRevenueView = () => {
    if (currentView === 'revenue') {
      return (
        <div className="space-y-6">
          {/* Revenue Trend */}
          <ResponsiveCard>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900">Revenue Trend</h3>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => handleDrillDown('revenue-monthly', biData.revenue.monthly)}
                  className="px-3 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                >
                  Drill Down
                </button>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={biData.revenue.monthly}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis tickFormatter={(value) => `${(value / 1000000).toFixed(1)}M`} />
                <Tooltip content={<BITooltip />} />
                <Legend />
                <Bar dataKey="target" fill="#e5e7eb" name="Target" />
                <Bar dataKey="revenue" fill="#3b82f6" name="Revenue" />
                <Line type="monotone" dataKey="growth" stroke="#10b981" strokeWidth={2} name="Growth %" />
              </ComposedChart>
            </ResponsiveContainer>
          </ResponsiveCard>

          {/* Revenue by Category */}
          <ResponsiveCard>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900">Revenue by Category</h3>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => handleDrillDown('revenue-category', biData.revenue.byCategory)}
                  className="px-3 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                >
                  Drill Down
                </button>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <RechartsPieChart>
                <Pie
                  data={biData.revenue.byCategory}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percentage, growth }) => (
                    <div>
                      <div className="font-medium">{name}</div>
                      <div className="text-xs text-gray-500">{formatPercentage(percentage)}</div>
                      <div className="text-xs text-green-600">↑{formatPercentage(growth)}</div>
                    </div>
                  )}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="amount"
                >
                  {biData.revenue.byCategory.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => formatCurrency(value)} />
              </RechartsPieChart>
            </ResponsiveContainer>
          </ResponsiveCard>

          {/* Revenue by Center */}
          <ResponsiveCard>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900">Revenue by Center</h3>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => handleDrillDown('revenue-center', biData.revenue.byCenter)}
                  className="px-3 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                >
                  Drill Down
                </button>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={biData.revenue.byCenter}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="center" />
                <YAxis tickFormatter={(value) => `${(value / 1000000).toFixed(1)}M`} />
                <Tooltip content={<BITooltip />} />
                <Bar dataKey="revenue" fill="#3b82f6" name="Revenue" />
              </BarChart>
            </ResponsiveContainer>
          </ResponsiveCard>
        </div>
      );
    }

    if (currentView === 'revenue-monthly') {
      const monthlyData = drillDownPath.find(item => item.path === 'revenue-monthly')?.data || biData.revenue.monthly;
      
      return (
        <div className="space-y-6">
          <ResponsiveCard>
            <h3 className="text-lg font-semibold text-gray-900 mb-6">Monthly Revenue Details</h3>
            <ResponsiveTable
              data={monthlyData}
              columns={[
                { key: 'month', title: 'Month', sortable: true },
                { 
                  key: 'revenue', 
                  title: 'Revenue', 
                  sortable: true,
                  render: (value) => formatCurrency(value)
                },
                { 
                  key: 'target', 
                  title: 'Target', 
                  sortable: true,
                  render: (value) => formatCurrency(value)
                },
                { 
                  key: 'variance', 
                  title: 'Variance', 
                  sortable: true,
                  render: (value) => (
                    <span className={value >= 0 ? 'text-green-600' : 'text-red-600'}>
                      {formatCurrency(value)}
                    </span>
                  )
                },
                { 
                  key: 'growth', 
                  title: 'Growth', 
                  sortable: true,
                  render: (value) => (
                    <span className={value >= 0 ? 'text-green-600' : 'text-red-600'}>
                      {formatPercentage(value)}
                    </span>
                  )
                }
              ]}
              searchable={true}
              selectable={true}
              onSelectionChange={setSelectedItems}
            />
          </ResponsiveCard>
        </div>
      );
    }

    if (currentView === 'revenue-category') {
      const categoryData = drillDownPath.find(item => item.path === 'revenue-category')?.data || biData.revenue.byCategory;
      
      return (
        <div className="space-y-6">
          <ResponsiveCard>
            <h3 className="text-lg font-semibold text-gray-900 mb-6">Revenue by Category Details</h3>
            <ResponsiveTable
              data={categoryData}
              columns={[
                { key: 'category', title: 'Category', sortable: true },
                { 
                  key: 'amount', 
                  title: 'Amount', 
                  sortable: true,
                  render: (value) => formatCurrency(value)
                },
                { 
                  key: 'percentage', 
                  title: 'Percentage', 
                  sortable: true,
                  render: (value) => formatPercentage(value)
                },
                { 
                  key: 'growth', 
                  title: 'Growth', 
                  sortable: true,
                  render: (value) => (
                    <span className={value >= 0 ? 'text-green-600' : 'text-red-600'}>
                      {formatPercentage(value)}
                    </span>
                  )
                },
                {
                  key: 'actions',
                  title: 'Actions',
                  render: (value, row) => (
                    <button
                      onClick={() => handleDrillDown(`revenue-category-${row.category}`, row.subCategories)}
                      className="px-3 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                    >
                      View Subcategories
                    </button>
                  )
                }
              ]}
              searchable={true}
              selectable={true}
              onSelectionChange={setSelectedItems}
            />
          </ResponsiveCard>
        </div>
      );
    }

    return null;
  };

  // Render payables drill-down
  const renderPayableView = () => {
    if (currentView === 'payables') {
      return (
        <div className="space-y-6">
          {/* Payables Aging */}
          <ResponsiveCard>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900">Payables Aging</h3>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => handleDrillDown('payables-aging', biData.payables.aging)}
                  className="px-3 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                >
                  Drill Down
                </button>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={biData.payables.aging}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="period" />
                <YAxis tickFormatter={(value) => `${(value / 1000000).toFixed(1)}M`} />
                <Tooltip content={<BITooltip />} />
                <Bar dataKey="amount" fill="#ef4444" name="Amount" />
              </BarChart>
            </ResponsiveContainer>
          </ResponsiveCard>

          {/* Payables by Vendor */}
          <ResponsiveCard>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900">Payables by Vendor</h3>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => handleDrillDown('payables-vendor', biData.payables.byVendor)}
                  className="px-3 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                >
                  Drill Down
                </button>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={biData.payables.byVendor} layout="horizontal">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" tickFormatter={(value) => `${(value / 1000000).toFixed(1)}M`} />
                <YAxis dataKey="vendor" type="category" width={120} />
                <Tooltip content={<BITooltip />} />
                <Bar dataKey="amount" fill="#f59e0b" name="Amount" />
              </BarChart>
            </ResponsiveContainer>
          </ResponsiveCard>

          {/* Payables Trends */}
          <ResponsiveCard>
            <h3 className="text-lg font-semibold text-gray-900 mb-6">Payables Trends</h3>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={biData.payables.trends}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis tickFormatter={(value) => `${(value / 1000000).toFixed(1)}M`} />
                <Tooltip content={<BITooltip />} />
                <Legend />
                <Area type="monotone" dataKey="amount" stackId="1" stroke="#ef4444" fill="#ef4444" fillOpacity={0.6} name="Total" />
                <Area type="monotone" dataKey="new" stackId="1" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.6} name="New" />
                <Area type="monotone" dataKey="overdue" stackId="1" stroke="#dc2626" fill="#dc2626" fillOpacity={0.6} name="Overdue" />
              </AreaChart>
            </ResponsiveContainer>
          </ResponsiveCard>
        </div>
      );
    }

    if (currentView === 'payables-aging') {
      const agingData = drillDownPath.find(item => item.path === 'payables-aging')?.data || biData.payables.aging;
      
      return (
        <div className="space-y-6">
          <ResponsiveCard>
            <h3 className="text-lg font-semibold text-gray-900 mb-6">Payables Aging Details</h3>
            <ResponsiveTable
              data={agingData}
              columns={[
                { key: 'period', title: 'Period', sortable: true },
                { 
                  key: 'amount', 
                  title: 'Amount', 
                  sortable: true,
                  render: (value) => formatCurrency(value)
                },
                { 
                  key: 'percentage', 
                  title: 'Percentage', 
                  sortable: true,
                  render: (value) => formatPercentage(value)
                },
                { 
                  key: 'count', 
                  title: 'Count', 
                  sortable: true,
                  render: (value) => value.toLocaleString()
                }
              ]}
              searchable={true}
              selectable={true}
              onSelectionChange={setSelectedItems}
            />
          </ResponsiveCard>
        </div>
      );
    }

    if (currentView === 'payables-vendor') {
      const vendorData = drillDownPath.find(item => item.path === 'payables-vendor')?.data || biData.payables.byVendor;
      
      return (
        <div className="space-y-6">
          <ResponsiveCard>
            <h3 className="text-lg font-semibold text-gray-900 mb-6">Payables by Vendor Details</h3>
            <ResponsiveTable
              data={vendorData}
              columns={[
                { key: 'vendor', title: 'Vendor', sortable: true },
                { 
                  key: 'amount', 
                  title: 'Amount', 
                  sortable: true,
                  render: (value) => formatCurrency(value)
                },
                { 
                  key: 'percentage', 
                  title: 'Percentage', 
                  sortable: true,
                  render: (value) => formatPercentage(value)
                },
                { 
                  key: 'dueDate', 
                  title: 'Due Date', 
                  sortable: true
                },
                { 
                  key: 'aging', 
                  title: 'Aging', 
                  sortable: true
                },
                {
                  key: 'actions',
                  title: 'Actions',
                  render: (value, row) => (
                    <button
                      onClick={() => handleDrillDown(`payables-vendor-${row.vendor}`, row.invoices)}
                      className="px-3 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                    >
                      View Invoices
                    </button>
                  )
                }
              ]}
              searchable={true}
              selectable={true}
              onSelectionChange={setSelectedItems}
            />
          </ResponsiveCard>
        </div>
      );
    }

    return null;
  };

  // Render receivables drill-down
  const renderReceivableView = () => {
    if (currentView === 'receivables') {
      return (
        <div className="space-y-6">
          {/* Receivables Aging */}
          <ResponsiveCard>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900">Receivables Aging</h3>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => handleDrillDown('receivables-aging', biData.receivables.aging)}
                  className="px-3 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                >
                  Drill Down
                </button>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={biData.receivables.aging}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="period" />
                <YAxis tickFormatter={(value) => `${(value / 1000000).toFixed(1)}M`} />
                <Tooltip content={<BITooltip />} />
                <Bar dataKey="amount" fill="#10b981" name="Amount" />
              </BarChart>
            </ResponsiveContainer>
          </ResponsiveCard>

          {/* Receivables by Payer */}
          <ResponsiveCard>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900">Receivables by Payer</h3>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => handleDrillDown('receivables-payer', biData.receivables.byPayer)}
                  className="px-3 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                >
                  Drill Down
                </button>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <RechartsPieChart>
                <Pie
                  data={biData.receivables.byPayer}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percentage }) => (
                    <div>
                      <div className="font-medium">{name}</div>
                      <div className="text-xs text-gray-500">{formatPercentage(percentage)}</div>
                    </div>
                  )}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="amount"
                >
                  {biData.receivables.byPayer.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => formatCurrency(value)} />
              </RechartsPieChart>
            </ResponsiveContainer>
          </ResponsiveCard>

          {/* Collection Rates */}
          <ResponsiveCard>
            <h3 className="text-lg font-semibold text-gray-900 mb-6">Collection Rates</h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={biData.receivables.collection.monthlyRate}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis tickFormatter={(value) => `${value}%`} />
                <Tooltip content={<BITooltip />} />
                <Legend />
                <Line type="monotone" dataKey="rate" stroke="#3b82f6" strokeWidth={2} name="Collection Rate" />
                <Line type="monotone" dataKey="target" stroke="#ef4444" strokeWidth={2} strokeDasharray="5 5" name="Target" />
              </LineChart>
            </ResponsiveContainer>
          </ResponsiveCard>
        </div>
      );
    }

    if (currentView === 'receivables-aging') {
      const agingData = drillDownPath.find(item => item.path === 'receivables-aging')?.data || biData.receivables.aging;
      
      return (
        <div className="space-y-6">
          <ResponsiveCard>
            <h3 className="text-lg font-semibold text-gray-900 mb-6">Receivables Aging Details</h3>
            <ResponsiveTable
              data={agingData}
              columns={[
                { key: 'period', title: 'Period', sortable: true },
                { 
                  key: 'amount', 
                  title: 'Amount', 
                  sortable: true,
                  render: (value) => formatCurrency(value)
                },
                { 
                  key: 'percentage', 
                  title: 'Percentage', 
                  sortable: true,
                  render: (value) => formatPercentage(value)
                },
                { 
                  key: 'count', 
                  title: 'Count', 
                  sortable: true,
                  render: (value) => value.toLocaleString()
                }
              ]}
              searchable={true}
              selectable={true}
              onSelectionChange={setSelectedItems}
            />
          </ResponsiveCard>
        </div>
      );
    }

    return null;
  };

  // Render expenses drill-down
  const renderExpensesView = () => {
    if (currentView === 'expenses') {
      return (
        <div className="space-y-6">
          {/* Expenses by Category */}
          <ResponsiveCard>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900">Expenses by Category</h3>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => handleDrillDown('expenses-category', biData.expenses.categories)}
                  className="px-3 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                >
                  Drill Down
                </button>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <RechartsPieChart>
                <Pie
                  data={biData.expenses.categories}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percentage }) => (
                    <div>
                      <div className="font-medium">{name}</div>
                      <div className="text-xs text-gray-500">{formatPercentage(percentage)}</div>
                    </div>
                  )}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="amount"
                >
                  {biData.expenses.categories.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => formatCurrency(value)} />
              </RechartsPieChart>
            </ResponsiveContainer>
          </ResponsiveCard>

          {/* Expense Trends */}
          <ResponsiveCard>
            <h3 className="text-lg font-semibold text-gray-900 mb-6">Expense Trends</h3>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={biData.expenses.trends}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis tickFormatter={(value) => `${(value / 1000000).toFixed(1)}M`} />
                <Tooltip content={<BITooltip />} />
                <Legend />
                <Bar dataKey="budget" fill="#e5e7eb" name="Budget" />
                <Bar dataKey="amount" fill="#ef4444" name="Actual" />
                <Line type="monotone" dataKey="variance" stroke="#f59e0b" strokeWidth={2} name="Variance" />
              </ComposedChart>
            </ResponsiveContainer>
          </ResponsiveCard>

          {/* Expenses by Center */}
          <ResponsiveCard>
            <h3 className="text-lg font-semibold text-gray-900 mb-6">Expenses by Center</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={biData.expenses.byCenter}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="center" />
                <YAxis tickFormatter={(value) => `${(value / 1000000).toFixed(1)}M`} />
                <Tooltip content={<BITooltip />} />
                <Bar dataKey="amount" fill="#ef4444" name="Amount" />
              </BarChart>
            </ResponsiveContainer>
          </ResponsiveCard>
        </div>
      );
    }

    if (currentView === 'expenses-category') {
      const categoryData = drillDownPath.find(item => item.path === 'expenses-category')?.data || biData.expenses.categories;
      
      return (
        <div className="space-y-6">
          <ResponsiveCard>
            <h3 className="text-lg font-semibold text-gray-900 mb-6">Expense Categories Details</h3>
            <ResponsiveTable
              data={categoryData}
              columns={[
                { key: 'category', title: 'Category', sortable: true },
                { 
                  key: 'amount', 
                  title: 'Amount', 
                  sortable: true,
                  render: (value) => formatCurrency(value)
                },
                { 
                  key: 'percentage', 
                  title: 'Percentage', 
                  sortable: true,
                  render: (value) => formatPercentage(value)
                },
                { 
                  key: 'budget', 
                  title: 'Budget', 
                  sortable: true,
                  render: (value) => formatCurrency(value)
                },
                { 
                  key: 'variance', 
                  title: 'Variance', 
                  sortable: true,
                  render: (value) => (
                    <span className={value >= 0 ? 'text-green-600' : 'text-red-600'}>
                      {formatCurrency(value)}
                    </span>
                  )
                },
                {
                  key: 'actions',
                  title: 'Actions',
                  render: (value, row) => (
                    <button
                      onClick={() => handleDrillDown(`expenses-category-${row.category}`, row.subCategories)}
                      className="px-3 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                    >
                      View Subcategories
                    </button>
                  )
                }
              ]}
              searchable={true}
              selectable={true}
              onSelectionChange={setSelectedItems}
            />
          </ResponsiveCard>
        </div>
      );
    }

    return null;
  };

  // Render payroll drill-down
  const renderPayrollView = () => {
    if (currentView === 'payroll') {
      return (
        <div className="space-y-6">
          {/* Payroll by Department */}
          <ResponsiveCard>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900">Payroll by Department</h3>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => handleDrillDown('payroll-department', biData.payroll.departments)}
                  className="px-3 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                >
                  Drill Down
                </button>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={biData.payroll.departments}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="department" />
                <YAxis tickFormatter={(value) => `${(value / 1000000).toFixed(1)}M`} />
                <Tooltip content={<BITooltip />} />
                <Bar dataKey="totalSalary" fill="#8b5cf6" name="Total Salary" />
              </BarChart>
            </ResponsiveContainer>
          </ResponsiveCard>

          {/* Payroll Trends */}
          <ResponsiveCard>
            <h3 className="text-lg font-semibold text-gray-900 mb-6">Payroll Trends</h3>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={biData.payroll.trends}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis tickFormatter={(value) => `${(value / 1000000).toFixed(1)}M`} />
                <Tooltip content={<BITooltip />} />
                <Legend />
                <Bar dataKey="amount" fill="#8b5cf6" name="Total Payroll" />
                <Line type="monotone" dataKey="avgSalary" stroke="#10b981" strokeWidth={2} name="Avg Salary" />
              </ComposedChart>
            </ResponsiveContainer>
          </ResponsiveCard>

          {/* Benefits Breakdown */}
          <ResponsiveCard>
            <h3 className="text-lg font-semibold text-gray-900 mb-6">Benefits Breakdown</h3>
            <ResponsiveContainer width="100%" height={300}>
              <RechartsPieChart>
                <Pie
                  data={biData.payroll.benefits}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percentage }) => (
                    <div>
                      <div className="font-medium">{name}</div>
                      <div className="text-xs text-gray-500">{formatPercentage(percentage)}</div>
                    </div>
                  )}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="amount"
                >
                  {biData.payroll.benefits.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => formatCurrency(value)} />
              </RechartsPieChart>
            </ResponsiveContainer>
          </ResponsiveCard>

          {/* Performance Metrics */}
          <ResponsiveCard>
            <h3 className="text-lg font-semibold text-gray-900 mb-6">Performance Metrics</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {biData.payroll.performance.map((metric, index) => (
                <ResponsiveCard key={index}>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-gray-900">
                      {metric.score !== undefined ? formatPercentage(metric.score) : metric.hours}
                    </div>
                    <div className="text-sm text-gray-600 mt-1">{metric.metric}</div>
                    {metric.target && (
                      <div className="text-xs text-gray-500 mt-1">
                        Target: {typeof metric.target === 'number' ? 
                          (metric.target > 100 ? metric.target : formatPercentage(metric.target)) : 
                          metric.target}
                      </div>
                    )}
                  </div>
                </ResponsiveCard>
              ))}
            </div>
          </ResponsiveCard>
        </div>
      );
    }

    if (currentView === 'payroll-department') {
      const departmentData = drillDownPath.find(item => item.path === 'payroll-department')?.data || biData.payroll.departments;
      
      return (
        <div className="space-y-6">
          <ResponsiveCard>
            <h3 className="text-lg font-semibold text-gray-900 mb-6">Payroll by Department Details</h3>
            <ResponsiveTable
              data={departmentData}
              columns={[
                { key: 'department', title: 'Department', sortable: true },
                { 
                  key: 'employees', 
                  title: 'Employees', 
                  sortable: true,
                  render: (value) => value.toLocaleString()
                },
                { 
                  key: 'totalSalary', 
                  title: 'Total Salary', 
                  sortable: true,
                  render: (value) => formatCurrency(value)
                },
                { 
                  key: 'percentage', 
                  title: 'Percentage', 
                  sortable: true,
                  render: (value) => formatPercentage(value)
                },
                {
                  key: 'actions',
                  title: 'Actions',
                  render: (value, row) => (
                    <button
                      onClick={() => handleDrillDown(`payroll-department-${row.department}`, row.roles)}
                      className="px-3 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                    >
                      View Roles
                    </button>
                  )
                }
              ]}
              searchable={true}
              selectable={true}
              onSelectionChange={setSelectedItems}
            />
          </ResponsiveCard>
        </div>
      );
    }

    return null;
  };

  // Render main content based on current view
  const renderMainContent = () => {
    switch (currentView) {
      case 'overview':
        return (
          <div className="space-y-6">
            {renderOverviewMetrics()}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <ResponsiveCard>
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-semibold text-gray-900">Quick Access</h3>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <button
                    onClick={() => handleDrillDown('revenue', biData.revenue)}
                    className="flex items-center justify-center p-4 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 transition-colors"
                  >
                    <DollarSign className="w-6 h-6 text-green-600 mr-2" />
                    <span className="text-sm font-medium text-green-700">Revenue</span>
                  </button>
                  <button
                    onClick={() => handleDrillDown('payables', biData.payables)}
                    className="flex items-center justify-center p-4 bg-orange-50 border border-orange-200 rounded-lg hover:bg-orange-100 transition-colors"
                  >
                    <CreditCard className="w-6 h-6 text-orange-600 mr-2" />
                    <span className="text-sm font-medium text-orange-700">Payables</span>
                  </button>
                  <button
                    onClick={() => handleDrillDown('receivables', biData.receivables)}
                    className="flex items-center justify-center p-4 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"
                  >
                    <FileText className="w-6 h-6 text-blue-600 mr-2" />
                    <span className="text-sm font-medium text-blue-700">Receivables</span>
                  </button>
                  <button
                    onClick={() => handleDrillDown('expenses', biData.expenses)}
                    className="flex items-center justify-center p-4 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors"
                  >
                    <TrendingDown className="w-6 h-6 text-red-600 mr-2" />
                    <span className="text-sm font-medium text-red-700">Expenses</span>
                  </button>
                  <button
                    onClick={() => handleDrillDown('payroll', biData.payroll)}
                    className="flex items-center justify-center p-4 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100 transition-colors"
                  >
                    <Users className="w-6 h-6 text-purple-600 mr-2" />
                    <span className="text-sm font-medium text-purple-700">Payroll</span>
                  </button>
                  <button
                    onClick={() => handleDrillDown('cashflow', biData.cashFlow)}
                    className="flex items-center justify-center p-4 bg-teal-50 border border-teal-200 rounded-lg hover:bg-teal-100 transition-colors"
                  >
                    <Activity className="w-6 h-6 text-teal-600 mr-2" />
                    <span className="text-sm font-medium text-teal-700">Cash Flow</span>
                  </button>
                </div>
              </ResponsiveCard>
              <ResponsiveCard>
                <h3 className="text-lg font-semibold text-gray-900 mb-6">KPI Summary</h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-600">Operating Margin</span>
                    <span className="text-lg font-bold text-green-600">{formatPercentage(biData.overview.operatingMargin)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-600">Collection Rate</span>
                    <span className="text-lg font-bold text-blue-600">{formatPercentage(biData.overview.collectionRate)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-600">Bed Occupancy</span>
                    <span className="text-lg font-bold text-purple-600">{formatPercentage(biData.overview.bedOccupancy)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-600">Staff Productivity</span>
                    <span className="text-lg font-bold text-orange-600">{formatPercentage(biData.overview.staffProductivity)}</span>
                  </div>
                </div>
              </ResponsiveCard>
            </div>
          </div>
        );
      case 'revenue':
        return renderRevenueView();
      case 'payables':
        return renderPayableView();
      case 'receivables':
        return renderReceivableView();
      case 'expenses':
        return renderExpensesView();
      case 'payroll':
        return renderPayrollView();
      default:
        return renderOverviewMetrics();
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-gray-900">BI Dashboard</h1>
          <p className="text-gray-600 mt-1">Business Intelligence & Analytics Platform</p>
        </div>
        
        <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-3 space-y-2 sm:space-y-0">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search dashboard..."
              className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent w-full sm:w-64"
            />
          </div>
          
          {/* Date Range */}
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="today">Today</option>
            <option value="week">This Week</option>
            <option value="month">This Month</option>
            <option value="quarter">This Quarter</option>
            <option value="year">This Year</option>
            <option value="custom">Custom Range</option>
          </select>
          
          {/* Actions */}
          <div className="flex items-center space-x-2">
            <button className="p-2 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors">
              <RefreshCw className="w-4 h-4" />
            </button>
            <button className="p-2 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors">
              <Download className="w-4 h-4" />
            </button>
            <button className="p-2 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors">
              <Maximize2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Breadcrumb Navigation */}
      {renderBreadcrumb()}

      {/* Navigation Actions */}
      {drillDownPath.length > 0 && (
        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
          <div className="flex items-center space-x-4">
            <button
              onClick={handleDrillUp}
              className="flex items-center px-3 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <ChevronLeft className="w-4 h-4 mr-2" />
              Back
            </button>
            <span className="text-sm text-gray-600">
              Current Level: {currentView}
            </span>
          </div>
          <button
            onClick={handleReset}
            className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Reset to Overview
          </button>
        </div>
      )}

      {/* Main Content */}
      {renderMainContent()}
    </div>
  );
};

export default BIDashboard;
