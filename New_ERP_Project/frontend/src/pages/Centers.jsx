import React, { useState, useEffect } from 'react';

const Centers = () => {
  const [centers, setCenters] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedCenter, setSelectedCenter] = useState(null);
  const [showViewModal, setShowViewModal] = useState(false);

  // Fetch centers
  useEffect(() => {
    fetchCenters();
  }, [currentPage, searchTerm]);

  const fetchCenters = async () => {
    setLoading(true);
    setError('');
    
    try {
      const response = await fetch(`/api/centers?page=${currentPage}&limit=10&search=${searchTerm}`);
      const data = await response.json();
      
      if (response.ok) {
        setCenters(data.centers || []);
      } else {
        setError(data.error || 'Failed to fetch centers');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e) => {
    setSearchTerm(e.target.value);
    setCurrentPage(1); // Reset to first page when searching
  };

  const handlePageChange = (page) => {
    setCurrentPage(page);
  };

  const handleAddCenter = () => {
    setShowAddModal(true);
  };

  const handleViewCenter = (center) => {
    setSelectedCenter(center);
    setShowViewModal(true);
  };

  const handleDeleteCenter = async (centerId) => {
    if (window.confirm('Are you sure you want to delete this center?')) {
      try {
        const response = await fetch(`/api/centers/${centerId}`, {
          method: 'DELETE'
        });
        
        if (response.ok) {
          setCenters(centers.filter(c => c.id !== centerId));
        } else {
          setError('Failed to delete center');
        }
      } catch (err) {
        setError('Network error during deletion');
      }
    }
  };

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      <div className="sm:flex sm:items-center">
        <div className="sm:flex-auto">
          <h1 className="text-2xl font-semibold text-gray-900">Diagnostic Centers</h1>
        </div>
      </div>

      <div className="mt-8 sm:mt-0 sm:ml-4 sm:pl-4">
        {/* Search and Actions */}
        <div className="mb-6 flex justify-between items-center">
          <div className="flex-1">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <div className="absolute inset-y-0 left-0 pl-3">
                  <svg className="h-5 w-5 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8 4a4 4 0 00-8 4 018 0zm2 0a6 6 0 016 6 016 0zm0 7c0 0l-4 4m0 0l4 4m0-4 4h4a2 2 0 002-2 2v2.83c0-3.578.696 1.414-1.414 1.414A1.414 1.414 0 0-.39.393-1.414-1.414h2.83V12a2 2 0 01-2 2 2z" clipRule="evenodd" />
                  </svg>
                </div>
                <input
                  type="text"
                  className="block w-full pl-10 pr-3 py-2 border border-gray-300 leading-5 bg-white placeholder-gray-500 text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  placeholder="Search centers..."
                  value={searchTerm}
                  onChange={handleSearch}
                />
              </div>
            </div>
          </div>
          <button
            onClick={handleAddCenter}
            className="ml-3 inline-flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Add New Center
          </button>
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="text-center py-4">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
          <p className="mt-2 text-blue-600">Loading centers...</p>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="rounded-md bg-red-50 p-4 mb-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14a2 2 0 00-2 2v12a2 2 0 002 2 2zm-3.094 6a1.5 1.5 0 015-1.5 1.5 0 01-1.5 1.5 0zm-3.094 6a1.5 1.5 0 015-1.5 1.5 0zm-3.094 6a1.5 1.5 0 015-1.5 1.5 0z" />
              </svg>
            </div>
            <div className="ml-3 text-sm text-red-700">
              <p>{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Centers Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {centers.map((center) => (
          <div key={center.id} className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="h-12 w-12 bg-blue-500 rounded-full flex items-center justify-center">
                    <svg className="h-6 w-6 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M10.394 2.08a1 1 0 00-.788 0l-7 3a1 1 0 001.789 0l7 3a1 1 0 00.787 0l7-3a1 1 0 00-.788 0zM12.782 15.28l-2.828 2.828a1 1 0 01-1.415 0l-2.828-2.828a1 1 0 00-1.414 1.414l2.828 2.828a1 1 0 001.415 0l2.828-2.828a1 1 0 001.414 1.414l-2.828 2.828a1 1 0 001.415 0z" />
                    </svg>
                  </div>
                </div>
                <div className="ml-5 flex-1">
                  <h3 className="text-lg leading-6 font-medium text-gray-900">{center.name}</h3>
                  <p className="mt-1 text-sm text-gray-500">{center.code}</p>
                </div>
              </div>

              <div className="mt-6">
                <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-1">
                    <dt className="text-sm font-medium text-gray-500">Location</dt>
                    <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                      {center.city}, {center.state}
                    </dd>
                  </div>
                  <div className="sm:col-span-1">
                    <dt className="text-sm font-medium text-gray-500">Contact</dt>
                    <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                      {center.phone}
                    </dd>
                  </div>
                  <div className="sm:col-span-1">
                    <dt className="text-sm font-medium text-gray-500">Manager</dt>
                    <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                      {center.manager_name}
                    </dd>
                  </div>
                  <div className="sm:col-span-1">
                    <dt className="text-sm font-medium text-gray-500">Daily Capacity</dt>
                    <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                      {center.capacity_daily} patients
                    </dd>
                  </div>
                </dl>
              </div>

              {/* Statistics */}
              <div className="mt-6 border-t border-gray-200 pt-6">
                <h4 className="text-sm font-medium text-gray-900">Center Statistics</h4>
                <div className="mt-4 grid grid-cols-2 gap-4">
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Total Patients</dt>
                    <dd className="mt-1 text-lg font-semibold text-gray-900">{center.patient_count || 0}</dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Total Revenue</dt>
                    <dd className="mt-1 text-lg font-semibold text-gray-900">${center.total_revenue || 0}</dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Active Staff</dt>
                    <dd className="mt-1 text-lg font-semibold text-gray-900">{center.staff_count || 0}</dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Equipment</dt>
                    <dd className="mt-1 text-lg font-semibold text-gray-900">{center.scanner_count || 0}</dd>
                  </div>
                </div>
              </div>

              {/* Specialties */}
              {center.specialties && (
                <div className="mt-6 border-t border-gray-200 pt-6">
                  <h4 className="text-sm font-medium text-gray-900">Specialties</h4>
                  <div className="mt-2">
                    <div className="flex flex-wrap gap-2">
                      {center.specialties.split(',').map((specialty, index) => (
                        <span key={index} className="inline-flex items-center px-2.5 py-0.5 rounded-md text-sm font-medium bg-blue-100 text-blue-800">
                          {specialty.trim()}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="mt-6 border-t border-gray-200 pt-6">
                <div className="flex justify-between">
                  <div className="flex space-x-2">
                    <button
                      onClick={() => handleViewCenter(center)}
                      className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                    >
                      View Details
                    </button>
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => handleDeleteCenter(center.id)}
                      className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-red-700 bg-red-100 hover:bg-red-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Pagination */}
      <div className="mt-8">
        <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6 lg:px-8">
          <div className="flex-1 flex justify-between sm:hidden">
            <button
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
            >
              Previous
            </button>
          </div>
          <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
            <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className="relative inline-flex items-center px-2 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-500 bg-white hover:bg-gray-50"
              >
                Previous
              </button>
              <span className="relative inline-flex items-center px-4 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-700">
                Page {currentPage}
              </span>
              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage >= Math.ceil(centers.length / 10)}
                className="relative ml-3 inline-flex items-center px-2 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
              >
                Next
              </button>
            </nav>
          </div>
        </div>
      </div>

      {/* Center Details Modal */}
      {showViewModal && selectedCenter && (
        <div className="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="center-view-title">
          <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="relative bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-4xl sm:w-full">
              <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pt-6">
                <div className="sm:flex sm:items-start">
                  <div className="w-full sm:flex-auto">
                    <h3 className="text-lg leading-6 font-medium text-gray-900" id="center-view-title">
                      Center Details: {selectedCenter.name}
                    </h3>
                  </div>
                  <div className="mt-5 sm:mt-4 sm:ml-4 sm:text-left sm:mt-0 sm:w-0 sm:pl-6">
                    <button
                      onClick={() => setShowViewModal(false)}
                      className="bg-white border border-gray-300 rounded-md p-2 inline-flex items-center text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                    >
                      Close
                    </button>
                  </div>
                </div>

                <div className="mt-6 border-t border-gray-200 pt-6">
                  <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <div className="sm:col-span-1">
                      <dt className="text-sm font-medium text-gray-500">Center ID</dt>
                      <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">{selectedCenter.id}</dd>
                    </div>
                    <div className="sm:col-span-1">
                      <dt className="text-sm font-medium text-gray-500">Name</dt>
                      <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">{selectedCenter.name}</dd>
                    </div>
                    <div className="sm:col-span-1">
                      <dt className="text-sm font-medium text-gray-500">Code</dt>
                      <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">{selectedCenter.code}</dd>
                    </div>
                    <div className="sm:col-span-1">
                      <dt className="text-sm font-medium text-gray-500">Address</dt>
                      <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">{selectedCenter.address}</dd>
                    </div>
                    <div className="sm:col-span-1">
                      <dt className="text-sm font-medium text-gray-500">City</dt>
                      <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">{selectedCenter.city}</dd>
                    </div>
                    <div className="sm:col-span-1">
                      <dt className="text-sm font-medium text-gray-500">State</dt>
                      <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">{selectedCenter.state}</dd>
                    </div>
                    <div className="sm:col-span-1">
                      <dt className="text-sm font-medium text-gray-500">Country</dt>
                      <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">{selectedCenter.country}</dd>
                    </div>
                    <div className="sm:col-span-1">
                      <dt className="text-sm font-medium text-gray-500">Phone</dt>
                      <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">{selectedCenter.phone}</dd>
                    </div>
                    <div className="sm:col-span-1">
                      <dt className="text-sm font-medium text-gray-500">Email</dt>
                      <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">{selectedCenter.email}</dd>
                    </div>
                    <div className="sm:col-span-1">
                      <dt className="text-sm font-medium text-gray-500">Manager</dt>
                      <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">{selectedCenter.manager_name}</dd>
                    </div>
                    <div className="sm:col-span-1">
                      <dt className="text-sm font-medium text-gray-500">Daily Capacity</dt>
                      <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">{selectedCenter.capacity_daily}</dd>
                    </div>
                    <div className="sm:col-span-1">
                      <dt className="text-sm font-medium text-gray-500">AE Title</dt>
                      <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">{selectedCenter.ae_title}</dd>
                    </div>
                    <div className="sm:col-span-1">
                      <dt className="text-sm font-medium text-gray-500">Timezone</dt>
                      <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">{selectedCenter.timezone}</dd>
                    </div>
                  </dl>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Centers;
