import React, { useState, useEffect } from 'react';
import { 
  Database, 
  Plus, 
  Search, 
  Filter, 
  Download, 
  RefreshCw, 
  Edit, 
  Trash2, 
  Eye,
  AlertTriangle,
  CheckCircle,
  Clock,
  Package,
  ShoppingCart,
  TrendingDown,
  TrendingUp,
  Building
} from 'lucide-react';
import ResponsiveCard from '../Common/ResponsiveCard';
import ResponsiveTable from '../Common/ResponsiveTable';
import ResponsiveForm from '../Common/ResponsiveForm';
import '../styles/theme.css';

const InventoryManagement = () => {
  const [expenseItems, setExpenseItems] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedItems, setSelectedItems] = useState(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [screenSize, setScreenSize] = useState('desktop');
  const [viewMode, setViewMode] = useState('table');
  const [activeTab, setActiveTab] = useState('items');

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
    fetchExpenseItems();
    fetchVendors();
    fetchPurchaseOrders();
  }, []);

  const fetchExpenseItems = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const mockItems = [
        {
          id: 1,
          itemCode: 'EXP-001',
          itemName: 'Syringes 5ml',
          category: 'Consumables',
          subcategory: 'Injection Supplies',
          description: 'Disposable syringes for medical use',
          unit: 'pieces',
          currentStock: 45,
          minStock: 100,
          maxStock: 500,
          reorderLevel: 100,
          unitCost: 5.50,
          sellingPrice: 8.00,
          vendorId: 1,
          vendorName: 'Medical Supplies Co.',
          lastPurchaseDate: '2024-02-15',
          lastPurchaseQuantity: 200,
          averageMonthlyUsage: 120,
          status: 'ACTIVE',
          storageLocation: 'Store Room A',
          expiryDate: '2025-12-31',
          batchNumber: 'BATCH-001',
          manufacturedDate: '2024-01-01',
          notes: 'Essential consumable item'
        },
        {
          id: 2,
          itemCode: 'EXP-002',
          itemName: 'Gloves Medium',
          category: 'Consumables',
          subcategory: 'Protective Equipment',
          description: 'Disposable medical gloves',
          unit: 'boxes',
          currentStock: 12,
          minStock: 50,
          maxStock: 200,
          reorderLevel: 50,
          unitCost: 150.00,
          sellingPrice: 200.00,
          vendorId: 1,
          vendorName: 'Medical Supplies Co.',
          lastPurchaseDate: '2024-02-10',
          lastPurchaseQuantity: 100,
          averageMonthlyUsage: 60,
          status: 'ACTIVE',
          storageLocation: 'Store Room B',
          expiryDate: '2025-06-30',
          batchNumber: 'BATCH-002',
          manufacturedDate: '2024-01-15',
          notes: 'Essential protective equipment'
        },
        {
          id: 3,
          itemCode: 'EXP-003',
          itemName: 'Face Masks',
          category: 'Consumables',
          subcategory: 'Protective Equipment',
          description: 'Disposable face masks',
          unit: 'boxes',
          currentStock: 8,
          minStock: 25,
          maxStock: 100,
          reorderLevel: 25,
          unitCost: 80.00,
          sellingPrice: 120.00,
          vendorId: 2,
          vendorName: 'Safety Equipment Ltd.',
          lastPurchaseDate: '2024-02-05',
          lastPurchaseQuantity: 50,
          averageMonthlyUsage: 40,
          status: 'ACTIVE',
          storageLocation: 'Store Room B',
          expiryDate: '2025-03-31',
          batchNumber: 'BATCH-003',
          manufacturedDate: '2024-01-20',
          notes: 'Essential protective equipment'
        },
        {
          id: 4,
          itemCode: 'EXP-004',
          itemName: 'Alcohol Swabs',
          category: 'Consumables',
          subcategory: 'Antiseptics',
          description: 'Alcohol prep pads',
          unit: 'packets',
          currentStock: 15,
          minStock: 30,
          maxStock: 150,
          reorderLevel: 30,
          unitCost: 2.50,
          sellingPrice: 4.00,
          vendorId: 1,
          vendorName: 'Medical Supplies Co.',
          lastPurchaseDate: '2024-02-20',
          lastPurchaseQuantity: 100,
          averageMonthlyUsage: 50,
          status: 'ACTIVE',
          storageLocation: 'Store Room A',
          expiryDate: '2025-09-30',
          batchNumber: 'BATCH-004',
          manufacturedDate: '2024-02-01',
          notes: 'Antiseptic swabs for skin preparation'
        },
        {
          id: 5,
          itemCode: 'EXP-005',
          itemName: 'IV Catheters',
          category: 'Consumables',
          subcategory: 'Infusion Supplies',
          description: 'Intravenous catheters',
          unit: 'pieces',
          currentStock: 85,
          minStock: 50,
          maxStock: 200,
          reorderLevel: 50,
          unitCost: 25.00,
          sellingPrice: 35.00,
          vendorId: 3,
          vendorName: 'Infusion Solutions Inc.',
          lastPurchaseDate: '2024-02-18',
          lastPurchaseQuantity: 100,
          averageMonthlyUsage: 70,
          status: 'ACTIVE',
          storageLocation: 'Store Room C',
          expiryDate: '2025-08-31',
          batchNumber: 'BATCH-005',
          manufacturedDate: '2024-01-25',
          notes: 'IV access devices'
        },
        {
          id: 6,
          itemCode: 'EXP-006',
          itemName: 'Bandages',
          category: 'Consumables',
          subcategory: 'Wound Care',
          description: 'Sterile bandages',
          unit: 'pieces',
          currentStock: 120,
          minStock: 100,
          maxStock: 300,
          reorderLevel: 100,
          unitCost: 15.00,
          sellingPrice: 22.00,
          vendorId: 1,
          vendorName: 'Medical Supplies Co.',
          lastPurchaseDate: '2024-02-12',
          lastPurchaseQuantity: 150,
          averageMonthlyUsage: 80,
          status: 'ACTIVE',
          storageLocation: 'Store Room A',
          expiryDate: '2026-01-31',
          batchNumber: 'BATCH-006',
          manufacturedDate: '2024-01-10',
          notes: 'Wound dressing supplies'
        }
      ];
      
      setExpenseItems(mockItems);
    } catch (err) {
      setError('Failed to fetch expense items');
      console.error('Error fetching expense items:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchVendors = async () => {
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const mockVendors = [
        {
          id: 1,
          vendorCode: 'VEN-001',
          vendorName: 'Medical Supplies Co.',
          contactPerson: 'John Smith',
          email: 'john@medsupplies.com',
          phone: '+91 9876543210',
          address: '123 Supply Street, Kochi, Kerala 682020',
          city: 'Kochi',
          state: 'Kerala',
          postalCode: '682020',
          country: 'India',
          gstNumber: 'GST123456789',
          panNumber: 'PAN123456',
          paymentTerms: 'NET 30',
          status: 'ACTIVE',
          rating: 4.5,
          totalOrders: 25,
          lastOrderDate: '2024-02-15',
          notes: 'Primary supplier for medical consumables'
        },
        {
          id: 2,
          vendorCode: 'VEN-002',
          vendorName: 'Safety Equipment Ltd.',
          contactPerson: 'Jane Doe',
          email: 'jane@safetyequip.com',
          phone: '+91 9876543211',
          address: '456 Safety Road, Ernakulam, Kerala 682016',
          city: 'Ernakulam',
          state: 'Kerala',
          postalCode: '682016',
          country: 'India',
          gstNumber: 'GST987654321',
          panNumber: 'PAN987654',
          paymentTerms: 'NET 45',
          status: 'ACTIVE',
          rating: 4.2,
          totalOrders: 15,
          lastOrderDate: '2024-02-05',
          notes: 'Supplier for safety equipment'
        },
        {
          id: 3,
          vendorCode: 'VEN-003',
          vendorName: 'Infusion Solutions Inc.',
          contactPerson: 'Robert Johnson',
          email: 'robert@infusion.com',
          phone: '+91 9876543212',
          address: '789 Infusion Lane, Thrissur, Kerala 680001',
          city: 'Thrissur',
          state: 'Kerala',
          postalCode: '680001',
          country: 'India',
          gstNumber: 'GST456789123',
          panNumber: 'PAN456789',
          paymentTerms: 'NET 30',
          status: 'ACTIVE',
          rating: 4.8,
          totalOrders: 20,
          lastOrderDate: '2024-02-18',
          notes: 'Specialized infusion supplies'
        }
      ];
      
      setVendors(mockVendors);
    } catch (err) {
      console.error('Error fetching vendors:', err);
    }
  };

  const fetchPurchaseOrders = async () => {
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const mockOrders = [
        {
          id: 1,
          orderNumber: 'PO-2024-001',
          orderDate: '2024-02-15',
          expectedDeliveryDate: '2024-02-20',
          actualDeliveryDate: '2024-02-19',
          vendorId: 1,
          vendorName: 'Medical Supplies Co.',
          status: 'DELIVERED',
          totalAmount: 1100.00,
          paymentStatus: 'PAID',
          items: [
            {
              itemCode: 'EXP-001',
              itemName: 'Syringes 5ml',
              quantity: 200,
              unitPrice: 5.50,
              totalPrice: 1100.00
            }
          ],
          notes: 'Regular stock replenishment'
        },
        {
          id: 2,
          orderNumber: 'PO-2024-002',
          orderDate: '2024-02-10',
          expectedDeliveryDate: '2024-02-15',
          actualDeliveryDate: null,
          vendorId: 2,
          vendorName: 'Safety Equipment Ltd.',
          status: 'PENDING',
          totalAmount: 4000.00,
          paymentStatus: 'PENDING',
          items: [
            {
              itemCode: 'EXP-003',
              itemName: 'Face Masks',
              quantity: 50,
              unitPrice: 80.00,
              totalPrice: 4000.00
            }
          ],
          notes: 'Safety equipment order'
        },
        {
          id: 3,
          orderNumber: 'PO-2024-003',
          orderDate: '2024-02-18',
          expectedDeliveryDate: '2024-02-25',
          actualDeliveryDate: null,
          vendorId: 3,
          vendorName: 'Infusion Solutions Inc.',
          status: 'PROCESSING',
          totalAmount: 2500.00,
          paymentStatus: 'PARTIAL',
          items: [
            {
              itemCode: 'EXP-005',
              itemName: 'IV Catheters',
              quantity: 100,
              unitPrice: 25.00,
              totalPrice: 2500.00
            }
          ],
          notes: 'Infusion supplies order'
        }
      ];
      
      setPurchaseOrders(mockOrders);
    } catch (err) {
      console.error('Error fetching purchase orders:', err);
    }
  };

  const handleAddItem = async (formData) => {
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const newItem = {
        id: expenseItems.length + 1,
        itemCode: `EXP-${String(expenseItems.length + 1).padStart(3, '0')}`,
        ...formData,
        currentStock: 0,
        averageMonthlyUsage: 0,
        status: 'ACTIVE',
        lastPurchaseDate: null,
        lastPurchaseQuantity: 0
      };
      
      setExpenseItems([...expenseItems, newItem]);
      setShowAddModal(false);
      alert('Item added successfully!');
    } catch (err) {
      console.error('Error adding item:', err);
      alert('Failed to add item');
    }
  };

  const handleEditItem = async (formData) => {
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      setExpenseItems(expenseItems.map(item => 
        item.id === editingItem.id 
          ? { ...item, ...formData }
          : item
      ));
      setShowEditModal(false);
      setEditingItem(null);
      alert('Item updated successfully!');
    } catch (err) {
      console.error('Error updating item:', err);
      alert('Failed to update item');
    }
  };

  const handleDeleteItem = async (itemId) => {
    if (!confirm('Are you sure you want to delete this item?')) {
      return;
    }
    
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      setExpenseItems(expenseItems.filter(item => item.id !== itemId));
      alert('Item deleted successfully!');
    } catch (err) {
      console.error('Error deleting item:', err);
      alert('Failed to delete item');
    }
  };

  const getStockStatusColor = (currentStock, minStock) => {
    if (currentStock <= minStock * 0.5) return 'text-red-600 bg-red-100';
    if (currentStock <= minStock) return 'text-yellow-600 bg-yellow-100';
    return 'text-green-600 bg-green-100';
  };

  const getStockStatus = (currentStock, minStock) => {
    if (currentStock <= minStock * 0.5) return 'CRITICAL';
    if (currentStock <= minStock) return 'LOW';
    return 'ADEQUATE';
  };

  const getOrderStatusColor = (status) => {
    switch (status) {
      case 'DELIVERED': return 'text-green-600 bg-green-100';
      case 'PROCESSING': return 'text-blue-600 bg-blue-100';
      case 'PENDING': return 'text-yellow-600 bg-yellow-100';
      case 'CANCELLED': return 'text-red-600 bg-red-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2
    }).format(amount);
  };

  // Expense items table columns
  const expenseItemColumns = [
    {
      key: 'itemCode',
      title: 'Item Code',
      sortable: true,
      render: (value) => <span className="font-medium">{value}</span>
    },
    {
      key: 'itemName',
      title: 'Item Name',
      sortable: true,
      render: (value, row) => (
        <div>
          <div className="font-medium">{value}</div>
          <div className="text-sm text-gray-500">{row.category} - {row.subcategory}</div>
        </div>
      )
    },
    {
      key: 'currentStock',
      title: 'Stock Status',
      sortable: true,
      render: (value, row) => (
        <div>
          <div className="flex items-center">
            <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStockStatusColor(value, row.minStock)}`}>
              {getStockStatus(value, row.minStock)}
            </span>
          </div>
          <div className="text-sm text-gray-500 mt-1">
            {value} / {row.minStock} {row.unit}
          </div>
        </div>
      )
    },
    {
      key: 'unitCost',
      title: 'Unit Cost',
      sortable: true,
      render: (value) => formatCurrency(value)
    },
    {
      key: 'vendorName',
      title: 'Vendor',
      sortable: true
    },
    {
      key: 'lastPurchaseDate',
      title: 'Last Purchase',
      sortable: true,
      render: (value, row) => (
        <div>
          <div>{value || 'Never'}</div>
          <div className="text-sm text-gray-500">{row.lastPurchaseQuantity || 0} {row.unit}</div>
        </div>
      )
    },
    {
      key: 'averageMonthlyUsage',
      title: 'Monthly Usage',
      sortable: true,
      render: (value, row) => (
        <div>
          <div>{value} {row.unit}</div>
          <div className="text-sm text-gray-500">Avg. per month</div>
        </div>
      )
    },
    {
      key: 'expiryDate',
      title: 'Expiry Date',
      sortable: true,
      render: (value) => (
        <div className={`text-sm ${
          new Date(value) < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) 
            ? 'text-red-600' 
            : 'text-gray-900'
        }`}>
          {value}
        </div>
      )
    }
  ];

  // Vendors table columns
  const vendorColumns = [
    {
      key: 'vendorCode',
      title: 'Vendor Code',
      sortable: true,
      render: (value) => <span className="font-medium">{value}</span>
    },
    {
      key: 'vendorName',
      title: 'Vendor Name',
      sortable: true,
      render: (value, row) => (
        <div>
          <div className="font-medium">{value}</div>
          <div className="text-sm text-gray-500">{row.contactPerson}</div>
        </div>
      )
    },
    {
      key: 'email',
      title: 'Contact',
      sortable: true,
      render: (value, row) => (
        <div>
          <div className="text-sm">{value}</div>
          <div className="text-sm text-gray-500">{row.phone}</div>
        </div>
      )
    },
    {
      key: 'city',
      title: 'Location',
      sortable: true,
      render: (value, row) => (
        <div>
          <div>{value}, {row.state}</div>
          <div className="text-sm text-gray-500">{row.postalCode}</div>
        </div>
      )
    },
    {
      key: 'paymentTerms',
      title: 'Payment Terms',
      sortable: true
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
      key: 'totalOrders',
      title: 'Total Orders',
      sortable: true
    },
    {
      key: 'lastOrderDate',
      title: 'Last Order',
      sortable: true
    }
  ];

  // Purchase orders table columns
  const purchaseOrderColumns = [
    {
      key: 'orderNumber',
      title: 'Order Number',
      sortable: true,
      render: (value) => <span className="font-medium">{value}</span>
    },
    {
      key: 'vendorName',
      title: 'Vendor',
      sortable: true
    },
    {
      key: 'orderDate',
      title: 'Order Date',
      sortable: true,
      render: (value, row) => (
        <div>
          <div>{value}</div>
          <div className="text-sm text-gray-500">Expected: {row.expectedDeliveryDate}</div>
        </div>
      )
    },
    {
      key: 'totalAmount',
      title: 'Total Amount',
      sortable: true,
      render: (value) => formatCurrency(value)
    },
    {
      key: 'status',
      title: 'Status',
      sortable: true,
      render: (value) => (
        <span className={`px-2 py-1 text-xs font-medium rounded-full ${getOrderStatusColor(value)}`}>
          {value}
        </span>
      )
    },
    {
      key: 'paymentStatus',
      title: 'Payment',
      sortable: true,
      render: (value) => (
        <span className={`px-2 py-1 text-xs font-medium rounded-full ${
          value === 'PAID' ? 'text-green-600 bg-green-100' :
          value === 'PARTIAL' ? 'text-yellow-600 bg-yellow-100' :
          'text-red-600 bg-red-100'
        }`}>
          {value}
        </span>
      )
    }
  ];

  // Form fields for expense items
  const expenseItemFormFields = [
    {
      name: 'itemName',
      label: 'Item Name',
      type: 'text',
      required: true,
      placeholder: 'Enter item name'
    },
    {
      name: 'category',
      label: 'Category',
      type: 'select',
      required: true,
      options: [
        { value: 'Consumables', label: 'Consumables' },
        { value: 'Equipment', label: 'Equipment' },
        { value: 'Medications', label: 'Medications' },
        { value: 'Stationery', label: 'Stationery' }
      ]
    },
    {
      name: 'subcategory',
      label: 'Subcategory',
      type: 'text',
      required: true,
      placeholder: 'Enter subcategory'
    },
    {
      name: 'description',
      label: 'Description',
      type: 'textarea',
      placeholder: 'Enter description'
    },
    {
      name: 'unit',
      label: 'Unit',
      type: 'select',
      required: true,
      options: [
        { value: 'pieces', label: 'Pieces' },
        { value: 'boxes', label: 'Boxes' },
        { value: 'packets', label: 'Packets' },
        { value: 'bottles', label: 'Bottles' },
        { value: 'kg', label: 'Kilograms' },
        { value: 'liters', label: 'Liters' }
      ]
    },
    {
      name: 'minStock',
      label: 'Minimum Stock',
      type: 'number',
      required: true,
      placeholder: 'Enter minimum stock level'
    },
    {
      name: 'maxStock',
      label: 'Maximum Stock',
      type: 'number',
      required: true,
      placeholder: 'Enter maximum stock level'
    },
    {
      name: 'reorderLevel',
      label: 'Reorder Level',
      type: 'number',
      required: true,
      placeholder: 'Enter reorder level'
    },
    {
      name: 'unitCost',
      label: 'Unit Cost',
      type: 'number',
      required: true,
      placeholder: 'Enter unit cost'
    },
    {
      name: 'sellingPrice',
      label: 'Selling Price',
      type: 'number',
      required: true,
      placeholder: 'Enter selling price'
    },
    {
      name: 'vendorId',
      label: 'Preferred Vendor',
      type: 'select',
      required: true,
      options: vendors.map(v => ({ value: v.id, label: v.vendorName }))
    },
    {
      name: 'storageLocation',
      label: 'Storage Location',
      type: 'text',
      placeholder: 'Enter storage location'
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
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Inventory Management</h1>
          <p className="text-gray-600 mt-1">Manage expense items, vendors, and purchase orders</p>
        </div>
        
        <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-4 space-y-2 sm:space-y-0">
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Item
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('items')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'items'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Expense Items
          </button>
          <button
            onClick={() => setActiveTab('vendors')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'vendors'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Vendors
          </button>
          <button
            onClick={() => setActiveTab('orders')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'orders'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Purchase Orders
          </button>
        </nav>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <ResponsiveCard>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Items</p>
              <p className="text-2xl font-bold text-gray-900">{expenseItems.length}</p>
            </div>
            <div className="w-12 h-12 bg-blue-500 rounded-lg flex items-center justify-center">
              <Database className="w-6 h-6 text-white" />
            </div>
          </div>
        </ResponsiveCard>

        <ResponsiveCard>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Low Stock Items</p>
              <p className="text-2xl font-bold text-red-600">
                {expenseItems.filter(item => item.currentStock <= item.minStock).length}
              </p>
            </div>
            <div className="w-12 h-12 bg-red-500 rounded-lg flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-white" />
            </div>
          </div>
        </ResponsiveCard>

        <ResponsiveCard>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Active Vendors</p>
              <p className="text-2xl font-bold text-green-600">
                {vendors.filter(v => v.status === 'ACTIVE').length}
              </p>
            </div>
            <div className="w-12 h-12 bg-green-500 rounded-lg flex items-center justify-center">
              <Building className="w-6 h-6 text-white" />
            </div>
          </div>
        </ResponsiveCard>

        <ResponsiveCard>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Pending Orders</p>
              <p className="text-2xl font-bold text-yellow-600">
                {purchaseOrders.filter(order => order.status === 'PENDING').length}
              </p>
            </div>
            <div className="w-12 h-12 bg-yellow-500 rounded-lg flex items-center justify-center">
              <ShoppingCart className="w-6 h-6 text-white" />
            </div>
          </div>
        </ResponsiveCard>
      </div>

      {/* Tab Content */}
      {activeTab === 'items' && (
        <ResponsiveCard>
          <ResponsiveTable
            data={expenseItems}
            columns={expenseItemColumns}
            loading={loading}
            error={error}
            searchable={true}
            selectable={true}
            onSelectionChange={setSelectedItems}
            viewMode={viewMode}
            showViewToggle={true}
            onRefresh={fetchExpenseItems}
          />
        </ResponsiveCard>
      )}

      {activeTab === 'vendors' && (
        <ResponsiveCard>
          <ResponsiveTable
            data={vendors}
            columns={vendorColumns}
            loading={loading}
            error={error}
            searchable={true}
            selectable={false}
            viewMode={viewMode}
            showViewToggle={true}
            onRefresh={fetchVendors}
          />
        </ResponsiveCard>
      )}

      {activeTab === 'orders' && (
        <ResponsiveCard>
          <ResponsiveTable
            data={purchaseOrders}
            columns={purchaseOrderColumns}
            loading={loading}
            error={error}
            searchable={true}
            selectable={false}
            viewMode={viewMode}
            showViewToggle={true}
            onRefresh={fetchPurchaseOrders}
          />
        </ResponsiveCard>
      )}

      {/* Add Item Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">Add New Expense Item</h2>
            </div>
            <div className="p-6">
              <ResponsiveForm
                fields={expenseItemFormFields}
                onSubmit={handleAddItem}
                onCancel={() => setShowAddModal(false)}
                submitText="Add Item"
                layout="responsive"
              />
            </div>
          </div>
        </div>
      )}

      {/* Edit Item Modal */}
      {showEditModal && editingItem && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">Edit Expense Item</h2>
            </div>
            <div className="p-6">
              <ResponsiveForm
                fields={expenseItemFormFields}
                initialValues={editingItem}
                onSubmit={handleEditItem}
                onCancel={() => {
                  setShowEditModal(false);
                  setEditingItem(null);
                }}
                submitText="Update Item"
                layout="responsive"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InventoryManagement;
