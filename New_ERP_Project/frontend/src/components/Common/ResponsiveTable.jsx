import React, { useState, useMemo } from 'react';
import { 
  ChevronUp, 
  ChevronDown, 
  Search, 
  Filter, 
  Download, 
  RefreshCw, 
  MoreHorizontal,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Eye,
  EyeOff,
  Grid3X3,
  List,
  Maximize2
} from 'lucide-react';
import '../styles/theme.css';
import '../styles/responsive.css';

const ResponsiveTable = ({
  data = [],
  columns = [],
  loading = false,
  error = null,
  pagination = {},
  onPaginationChange,
  onSort,
  onFilter,
  onRefresh,
  onExport,
  searchable = true,
  filterable = true,
  exportable = true,
  selectable = false,
  onSelectionChange,
  className = '',
  hover = true,
  striped = false,
  compact = false,
  responsive = true,
  viewMode = 'auto', // auto, table, cards, list
  cardViewColumns = 2,
  showViewToggle = true
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [selectedRows, setSelectedRows] = useState(new Set());
  const [showFilters, setShowFilters] = useState(false);
  const [currentViewMode, setCurrentViewMode] = useState('auto');
  const [screenSize, setScreenSize] = useState('mobile');
  const [expandedRows, setExpandedRows] = useState(new Set());

  // Detect screen size
  React.useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      if (width < 768) {
        setScreenSize('mobile');
        if (viewMode === 'auto') {
          setCurrentViewMode('cards');
        }
      } else if (width < 1024) {
        setScreenSize('tablet');
        if (viewMode === 'auto') {
          setCurrentViewMode('table');
        }
      } else {
        setScreenSize('desktop');
        if (viewMode === 'auto') {
          setCurrentViewMode('table');
        }
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [viewMode]);

  // Filter data based on search term
  const filteredData = useMemo(() => {
    if (!searchTerm) return data;
    
    return data.filter(row => {
      return columns.some(column => {
        const value = row[column.key];
        return value && value.toString().toLowerCase().includes(searchTerm.toLowerCase());
      });
    });
  }, [data, columns, searchTerm]);

  // Sort data
  const sortedData = useMemo(() => {
    if (!sortConfig.key) return filteredData;

    return [...filteredData].sort((a, b) => {
      const aValue = a[sortConfig.key];
      const bValue = b[sortConfig.key];

      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredData, sortConfig]);

  // Handle sorting
  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    
    const newConfig = { key, direction };
    setSortConfig(newConfig);
    onSort?.(newConfig);
  };

  // Handle row selection
  const handleRowSelect = (id) => {
    const newSelected = new Set(selectedRows);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedRows(newSelected);
    onSelectionChange?.(newSelected);
  };

  // Handle select all
  const handleSelectAll = () => {
    if (selectedRows.size === sortedData.length) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(sortedData.map(row => row.id)));
    }
    onSelectionChange?.(selectedRows.size === sortedData.length ? new Set() : new Set(sortedData.map(row => row.id)));
  };

  // Handle row expansion
  const toggleRowExpansion = (id) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedRows(newExpanded);
  };

  // Get sort icon
  const getSortIcon = (columnKey) => {
    if (sortConfig.key !== columnKey) {
      return <ArrowUpDown className="w-4 h-4 text-gray-400" />;
    }
    return sortConfig.direction === 'asc' ? 
      <ArrowUp className="w-4 h-4 text-blue-600" /> : 
      <ArrowDown className="w-4 h-4 text-blue-600" />;
  };

  // Get responsive table classes
  const getTableClasses = () => {
    let classes = 'w-full bg-white border border-gray-200 rounded-xl overflow-hidden';
    
    if (compact) classes += ' text-sm';
    if (responsive) classes += ' responsive-table';
    
    return classes + ' ' + className;
  };

  // Get card grid classes
  const getCardGridClasses = () => {
    let classes = 'grid gap-4';
    
    if (screenSize === 'mobile') {
      classes += ' grid-cols-1';
    } else if (screenSize === 'tablet') {
      classes += ` grid-cols-${Math.min(cardViewColumns, 2)}`;
    } else {
      classes += ` grid-cols-${cardViewColumns}`;
    }
    
    return classes;
  };

  // Render table view
  const renderTableView = () => {
    return (
      <div className="overflow-x-auto">
        <table className={getTableClasses()}>
          {/* Header */}
          <thead className="bg-gray-50">
            <tr>
              {selectable && (
                <th className="px-4 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={selectedRows.size === sortedData.length && sortedData.length > 0}
                    onChange={handleSelectAll}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                </th>
              )}
              {columns.map((column) => (
                <th
                  key={column.key}
                  onClick={() => column.sortable && handleSort(column.key)}
                  className={`px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider bg-gray-50 ${
                    column.sortable ? 'cursor-pointer hover:bg-gray-100' : ''
                  }`}
                >
                  <div className="flex items-center space-x-1">
                    <span className="truncate">{column.title}</span>
                    {column.sortable && getSortIcon(column.key)}
                  </div>
                </th>
              ))}
            </tr>
          </thead>

          {/* Body */}
          <tbody className="bg-white divide-y divide-gray-200">
            {sortedData.map((row, index) => (
              <tr key={row.id} className={`${hover ? 'hover:bg-gray-50' : ''} ${striped && index % 2 === 1 ? 'bg-gray-50' : ''}`}>
                {selectable && (
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedRows.has(row.id)}
                      onChange={() => handleRowSelect(row.id)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </td>
                )}
                {columns.map((column) => (
                  <td key={column.key} className="px-4 py-3">
                    <div className="truncate">
                      {column.render ? column.render(row[column.key], row) : row[column.key]}
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  // Render card view
  const renderCardView = () => {
    return (
      <div className={getCardGridClasses()}>
        {sortedData.map((row) => (
          <div key={row.id} className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
            {/* Card header */}
            <div className="flex items-center justify-between mb-3">
              {selectable && (
                <input
                  type="checkbox"
                  checked={selectedRows.has(row.id)}
                  onChange={() => handleRowSelect(row.id)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
              )}
              <button
                onClick={() => toggleRowExpansion(row.id)}
                className="p-1 text-gray-400 hover:text-gray-600 rounded"
              >
                {expandedRows.has(row.id) ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>

            {/* Card content */}
            <div className="space-y-2">
              {columns.map((column) => (
                <div key={column.key} className="flex justify-between items-start">
                  <span className="text-sm font-medium text-gray-600 truncate">
                    {column.title}:
                  </span>
                  <span className="text-sm text-gray-900 text-right truncate ml-2">
                    {column.render ? column.render(row[column.key], row) : row[column.key]}
                  </span>
                </div>
              ))}
            </div>

            {/* Expanded content */}
            {expandedRows.has(row.id) && (
              <div className="mt-3 pt-3 border-t border-gray-200">
                <div className="text-sm text-gray-600">
                  {columns.map((column) => (
                    <div key={column.key} className="mb-2">
                      <strong>{column.title}:</strong>{' '}
                      {column.render ? column.render(row[column.key], row) : row[column.key]}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };

  // Render list view
  const renderListView = () => {
    return (
      <div className="space-y-2">
        {sortedData.map((row) => (
          <div key={row.id} className="bg-white border border-gray-200 rounded-lg p-3 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              {selectable && (
                <input
                  type="checkbox"
                  checked={selectedRows.has(row.id)}
                  onChange={() => handleRowSelect(row.id)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 mr-3"
                />
              )}
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center space-x-4">
                  {columns.map((column, index) => (
                    <div key={column.key} className="flex-1 min-w-0">
                      <div className="text-sm">
                        <span className="font-medium text-gray-600">{column.title}:</span>{' '}
                        <span className="text-gray-900 truncate">
                          {column.render ? column.render(row[column.key], row) : row[column.key]}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  // Render current view
  const renderCurrentView = () => {
    if (currentViewMode === 'table') {
      return renderTableView();
    } else if (currentViewMode === 'cards') {
      return renderCardView();
    } else if (currentViewMode === 'list') {
      return renderListView();
    }
    
    // Auto mode: choose based on screen size
    if (screenSize === 'mobile') {
      return renderCardView();
    } else if (screenSize === 'tablet') {
      return renderTableView();
    } else {
      return renderTableView();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-3 text-gray-600">Loading...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-red-600 font-medium">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
        <div className="flex flex-col sm:flex-row sm:items-center space-y-2 sm:space-y-0 sm:space-x-4">
          {searchable && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search..."
                className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent w-full sm:w-64"
              />
            </div>
          )}
          
          {filterable && (
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Filter className="w-4 h-4 mr-2" />
              Filters
            </button>
          )}
        </div>

        <div className="flex items-center space-x-2">
          {selectable && (
            <div className="flex items-center text-sm text-gray-600">
              <span>{selectedRows.size} of {sortedData.length} selected</span>
            </div>
          )}
          
          {showViewToggle && (
            <div className="flex items-center border border-gray-300 rounded-lg">
              <button
                onClick={() => setCurrentViewMode('table')}
                className={`p-2 rounded-l-lg transition-colors ${
                  currentViewMode === 'table' ? 'bg-blue-50 text-blue-600' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <List className="w-4 h-4" />
              </button>
              <button
                onClick={() => setCurrentViewMode('cards')}
                className={`p-2 transition-colors ${
                  currentViewMode === 'cards' ? 'bg-blue-50 text-blue-600' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <Grid3X3 className="w-4 h-4" />
              </button>
            </div>
          )}
          
          {onRefresh && (
            <button
              onClick={onRefresh}
              className="p-2 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
          )}
          
          {exportable && (
            <button
              onClick={onExport}
              className="flex items-center px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Download className="w-4 h-4 mr-2" />
              Export
            </button>
          )}
        </div>
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {columns.map((column) => (
              column.filterable && (
                <div key={column.key}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {column.title}
                  </label>
                  <select className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                    <option value="">All</option>
                    {column.filterOptions?.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              )
            ))}
          </div>
        </div>
      )}

      {/* Table Content */}
      {renderCurrentView()}

      {/* Pagination */}
      {pagination && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between px-4 py-3 bg-gray-50 border-t border-gray-200 rounded-lg">
          <div className="flex items-center text-sm text-gray-700 mb-4 sm:mb-0">
            <span>
              Showing {((pagination.page - 1) * pagination.pageSize) + 1} to{' '}
              {Math.min(pagination.page * pagination.pageSize, pagination.total)} of{' '}
              {pagination.total} results
            </span>
          </div>
          
          <div className="flex items-center space-x-2">
            <button
              onClick={() => onPaginationChange({ ...pagination, page: pagination.page - 1 })}
              disabled={pagination.page === 1}
              className="px-3 py-1 border border-gray-300 rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
            >
              Previous
            </button>
            
            <div className="flex items-center space-x-1">
              {Array.from({ length: Math.min(5, Math.ceil(pagination.total / pagination.pageSize)) }, (_, i) => {
                const page = i + 1;
                return (
                  <button
                    key={page}
                    onClick={() => onPaginationChange({ ...pagination, page })}
                    className={`px-3 py-1 border rounded-md ${
                      page === pagination.page
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'border-gray-300 hover:bg-gray-100'
                    }`}
                  >
                    {page}
                  </button>
                );
              })}
            </div>
            
            <button
              onClick={() => onPaginationChange({ ...pagination, page: pagination.page + 1 })}
              disabled={pagination.page >= Math.ceil(pagination.total / pagination.pageSize)}
              className="px-3 py-1 border border-gray-300 rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Empty State */}
      {sortedData.length === 0 && (
        <div className="text-center py-8">
          <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.707.293H19a2 2 0 012 2v11a2 2 0 01-2 2z" />
            </svg>
          </div>
          <p className="text-gray-500">No data available</p>
        </div>
      )}
    </div>
  );
};

export default ResponsiveTable;
