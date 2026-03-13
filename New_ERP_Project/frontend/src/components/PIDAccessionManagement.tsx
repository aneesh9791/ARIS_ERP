import React, { useState, useEffect } from 'react';
import { Search, User, FileText, Calendar, Clock, CheckCircle, AlertCircle, Send, ExternalLink, Copy, Download, Check, X, RefreshCw, AlertTriangle } from 'lucide-react';

interface PatientWithPID {
  patient_id: number;
  pid: string;
  name: string;
  phone: string;
  email?: string;
  date_of_birth?: string;
  gender?: string;
  address?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  id_proof_type?: string;
  id_proof_number?: string;
  id_proof_verified: boolean;
  blood_group?: string;
  allergies?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  center_id: number;
  center_name: string;
  total_studies: number;
  last_study_date?: string;
  studies_with_accession: Array<{
    study_id: number;
    study_code: string;
    study_name: string;
    accession_number?: string;
    status: string;
    scheduled_date?: string;
    completion_date?: string;
    report_date?: string;
    bill_id?: number;
    bill_amount?: number;
    payment_status?: string;
    created_at: string;
  }>;
  latest_accession_number?: string;
}

interface StudyByAccession {
  study_id: number;
  accession_number: string;
  patient_id: number;
  patient_pid: string;
  patient_name: string;
  patient_phone: string;
  study_code: string;
  study_name: string;
  modality: string;
  status: string;
  scheduled_date?: string;
  scheduled_time?: string;
  completion_date?: string;
  report_date?: string;
  radiologist_name?: string;
  center_name: string;
  bill_id?: number;
  bill_amount?: number;
  payment_status?: string;
  created_at: string;
}

interface BillByAccession {
  id: number;
  bill_number: string;
  patient_id: number;
  patient_pid: string;
  patient_name: string;
  patient_phone: string;
  patient_email?: string;
  date_of_birth?: string;
  gender?: string;
  address?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  study_id?: number;
  study_code?: string;
  study_name?: string;
  modality?: string;
  total_amount: number;
  discount_amount: number;
  gst_amount: number;
  net_amount: number;
  payment_status: 'BILLED' | 'PAID' | 'CANCELLED' | 'REFUNDED';
  payment_mode?: string;
  center_id: number;
  center_name: string;
  accession_number: string;
  accession_generated: boolean;
  accession_generated_at?: string;
  api_sent: boolean;
  api_success: boolean;
  api_response_code?: number;
  api_error_message?: string;
  api_retry_count: number;
  api_sent_at?: string;
  scheduled_date?: string;
  completion_date?: string;
  created_at: string;
}

interface PIDAccessionManagementProps {
  onPatientSelect?: (patient: PatientWithPID) => void;
  onStudySelect?: (study: StudyByAccession) => void;
  onBillSelect?: (bill: BillByAccession) => void;
}

export default function PIDAccessionManagement({
  onPatientSelect,
  onStudySelect,
  onBillSelect
}: PIDAccessionManagementProps) {
  const [activeTab, setActiveTab] = useState<'pid' | 'accession' | 'billing'>('pid');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [sendingToSystem, setSendingToSystem] = useState(false);
  const [systemResponse, setSystemResponse] = useState<any>(null);

  // Search patients by PID
  const searchByPID = async (pid: string) => {
    if (pid.length < 3) return;
    
    setLoading(true);
    try {
      const response = await fetch('/api/patients/quick-search', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ search_term: pid })
      });

      const data = await response.json();
      if (data.success) {
        setSearchResults(data.patients);
      }
    } catch (error) {
      console.error('Error searching by PID:', error);
    } finally {
      setLoading(false);
    }
  };

  // Search studies by accession number
  const searchByAccession = async (accessionNumber: string) => {
    if (accessionNumber.length < 3) return;
    
    setLoading(true);
    try {
      const response = await fetch(`/api/studies/accession/${accessionNumber}`);
      const data = await response.json();
      
      if (data.success) {
        setSearchResults([data.study]);
      }
    } catch (error) {
      console.error('Error searching by accession number:', error);
    } finally {
      setLoading(false);
    }
  };

  // Search bills by accession number
  const searchBillsByAccession = async (accessionNumber: string) => {
    if (accessionNumber.length < 3) return;
    
    setLoading(true);
    try {
      const response = await fetch(`/api/billing/accession/${accessionNumber}`);
      const data = await response.json();
      
      if (data.success) {
        setSearchResults([data.bill]);
      }
    } catch (error) {
      console.error('Error searching bills by accession number:', error);
    } finally {
      setLoading(false);
    }
  };

  // Send demographics to local system
  const sendToLocalSystem = async (patientId: number) => {
    setSendingToSystem(true);
    setSystemResponse(null);
    
    try {
      const response = await fetch(`/api/patients/${patientId}/send-to-local-system`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({})
      });

      const data = await response.json();
      setSystemResponse(data);
      
      if (data.success) {
        console.log('Demographics sent successfully');
      }
    } catch (error) {
      console.error('Error sending to local system:', error);
      setSystemResponse({
        success: false,
        message: 'Failed to send to local system'
      });
    } finally {
      setSendingToSystem(false);
    }
  };

  // Get patient demographics with accession numbers
  const getPatientDemographics = async (patientId: number) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/patients/${patientId}/demographics`);
      const data = await response.json();
      
      if (data.success) {
        setSelectedItem(data.patient);
      }
    } catch (error) {
      console.error('Error getting patient demographics:', error);
    } finally {
      setLoading(false);
    }
  };

  // Copy to clipboard
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  // Helper function to get payment status color
  const getPaymentStatusColor = (status: string) => {
    switch (status) {
      case 'PAID': return 'text-green-700 bg-green-50 border-green-200';
      case 'BILLED': return 'text-blue-700 bg-blue-50 border-blue-200';
      case 'CANCELLED': return 'text-red-700 bg-red-50 border-red-200';
      case 'REFUNDED': return 'text-orange-700 bg-orange-50 border-orange-200';
      default: return 'text-gray-700 bg-gray-50 border-gray-200';
    }
  };

  // Helper function to get API status indicator
  const getAPIStatusIndicator = (apiSuccess: boolean, apiSent: boolean, apiResponseCode?: number, apiRetryCount?: number) => {
    if (!apiSent) {
      return {
        icon: <Clock className="w-4 h-4 text-gray-400" />,
        color: 'text-gray-400',
        bgColor: 'bg-gray-50',
        text: 'Not Sent'
      };
    }
    
    if (apiSuccess) {
      return {
        icon: <Check className="w-4 h-4 text-green-500" />,
        color: 'text-green-600',
        bgColor: 'bg-green-50',
        text: `Success (${apiResponseCode})`
      };
    }
    
    if (apiRetryCount && apiRetryCount > 1) {
      return {
        icon: <RefreshCw className="w-4 h-4 text-orange-500" />,
        color: 'text-orange-600',
        bgColor: 'bg-orange-50',
        text: `Retrying (${apiRetryCount})`
      };
    }
    
    return {
      icon: <X className="w-4 h-4 text-red-500" />,
      color: 'text-red-600',
      bgColor: 'bg-red-50',
      text: `Failed (${apiResponseCode})`
    };
  };

  // Handle search based on active tab
  useEffect(() => {
    if (searchTerm.length >= 3) {
      const timeoutId = setTimeout(() => {
        switch (activeTab) {
          case 'pid':
            searchByPID(searchTerm);
            break;
          case 'accession':
            searchByAccession(searchTerm);
            break;
          case 'billing':
            searchBillsByAccession(searchTerm);
            break;
        }
      }, 300);

      return () => clearTimeout(timeoutId);
    } else {
      setSearchResults([]);
    }
  }, [searchTerm, activeTab]);

  const renderPIDSearch = () => (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="text-lg font-semibold mb-2 flex items-center">
          <User className="w-5 h-5 mr-2" />
          Search by Patient ID (PID)
        </h3>
        <p className="text-sm text-gray-600 mb-4">
          Enter PID (format: AR********) to search for patients
        </p>
        
        <div className="relative">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value.toUpperCase())}
            placeholder="Enter PID (e.g., AR00000001)"
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
          {loading && (
            <div className="absolute right-3 top-3">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
            </div>
          )}
        </div>
      </div>

      {/* Search Results */}
      {searchResults.length > 0 && (
        <div className="border border-gray-200 rounded-lg max-h-64 overflow-y-auto">
          {searchResults.map((patient: PatientWithPID) => (
            <div
              key={patient.patient_id}
              onClick={() => {
                setSelectedItem(patient);
                onPatientSelect?.(patient);
              }}
              className="p-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="text-blue-600 font-mono font-bold">
                    {patient.pid}
                  </div>
                  <div>
                    <div className="font-medium text-gray-900">{patient.name}</div>
                    <div className="text-sm text-gray-500">{patient.phone}</div>
                    <div className="text-sm text-gray-500">{patient.center_name}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm text-gray-500">{patient.total_studies} studies</div>
                  {patient.latest_accession_number && (
                    <div className="text-xs text-green-600 font-mono">
                      {patient.latest_accession_number}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Selected Patient Details */}
      {selectedItem && activeTab === 'pid' && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <h4 className="font-semibold mb-3">Patient Details</h4>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <div className="text-sm text-gray-500">PID</div>
              <div className="font-mono font-bold text-blue-600">{selectedItem.pid}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500">Name</div>
              <div className="font-medium">{selectedItem.name}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500">Phone</div>
              <div className="font-medium">{selectedItem.phone}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500">Center</div>
              <div className="font-medium">{selectedItem.center_name}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500">Total Studies</div>
              <div className="font-medium">{selectedItem.total_studies}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500">Latest Accession</div>
              <div className="font-mono text-green-600">
                {selectedItem.latest_accession_number || 'None'}
              </div>
            </div>
          </div>

          {/* Studies with Accession Numbers */}
          {selectedItem.studies_with_accession && selectedItem.studies_with_accession.length > 0 && (
            <div className="mb-4">
              <h5 className="font-medium mb-2">Recent Studies</h5>
              <div className="space-y-2">
                {selectedItem.studies_with_accession.slice(0, 3).map((study: any) => (
                  <div key={study.study_id} className="flex items-center justify-between text-sm bg-white p-2 rounded">
                    <div>
                      <span className="font-medium">{study.study_name}</span>
                      {study.accession_number && (
                        <span className="ml-2 font-mono text-green-600">{study.accession_number}</span>
                      )}
                    </div>
                    <div className="text-gray-500">{study.status}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex space-x-2">
            <button
              onClick={() => sendToLocalSystem(selectedItem.patient_id)}
              disabled={sendingToSystem}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center"
            >
              <Send className="w-4 h-4 mr-2" />
              {sendingToSystem ? 'Sending...' : 'Send to Local System'}
            </button>
            
            <button
              onClick={() => copyToClipboard(selectedItem.pid)}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center"
            >
              <Copy className="w-4 h-4 mr-2" />
              Copy PID
            </button>
          </div>

          {/* System Response */}
          {systemResponse && (
            <div className={`mt-4 p-3 rounded-lg ${
              systemResponse.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
            }`}>
              <div className="flex items-center">
                {systemResponse.success ? (
                  <CheckCircle className="w-4 h-4 mr-2" />
                ) : (
                  <AlertCircle className="w-4 h-4 mr-2" />
                )}
                {systemResponse.message}
              </div>
              {systemResponse.response_code && (
                <div className="text-sm mt-1">Response Code: {systemResponse.response_code}</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );

  const renderAccessionSearch = () => (
    <div className="space-y-4">
      <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
        <h3 className="text-lg font-semibold mb-2 flex items-center">
          <FileText className="w-5 h-5 mr-2" />
          Search by Accession Number
        </h3>
        <p className="text-sm text-gray-600 mb-4">
          Enter accession number (format: ACC-YY-********) to find studies
        </p>
        
        <div className="relative">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value.toUpperCase())}
            placeholder="Enter accession number (e.g., ACC-24-00000001)"
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
          />
          <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
          {loading && (
            <div className="absolute right-3 top-3">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-purple-600"></div>
            </div>
          )}
        </div>
      </div>

      {/* Search Results */}
      {searchResults.length > 0 && (
        <div className="border border-gray-200 rounded-lg">
          {searchResults.map((study: StudyByAccession) => (
            <div
              key={study.study_id}
              onClick={() => {
                setSelectedItem(study);
                onStudySelect?.(study);
              }}
              className="p-4 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-3">
                  <div className="text-purple-600 font-mono font-bold">
                    {study.accession_number}
                  </div>
                  <div>
                    <div className="font-medium text-gray-900">{study.study_name}</div>
                    <div className="text-sm text-gray-500">{study.modality}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-medium text-gray-900">{study.patient_name}</div>
                  <div className="text-sm text-gray-500">{study.patient_pid}</div>
                </div>
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                <div>
                  <span className="text-gray-500">Status:</span>
                  <span className="ml-1 font-medium">{study.status}</span>
                </div>
                <div>
                  <span className="text-gray-500">Center:</span>
                  <span className="ml-1">{study.center_name}</span>
                </div>
                <div>
                  <span className="text-gray-500">Scheduled:</span>
                  <span className="ml-1">{study.scheduled_date || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-gray-500">Payment:</span>
                  <span className="ml-1">{study.payment_status || 'N/A'}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Selected Study Details */}
      {selectedItem && activeTab === 'accession' && (
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
          <h4 className="font-semibold mb-3">Study Details</h4>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <div className="text-sm text-gray-500">Accession Number</div>
              <div className="font-mono font-bold text-purple-600">{selectedItem.accession_number}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500">Study Name</div>
              <div className="font-medium">{selectedItem.study_name}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500">Patient</div>
              <div className="font-medium">{selectedItem.patient_name}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500">Patient PID</div>
              <div className="font-mono text-blue-600">{selectedItem.patient_pid}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500">Modality</div>
              <div className="font-medium">{selectedItem.modality}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500">Status</div>
              <div className="font-medium">{selectedItem.status}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500">Center</div>
              <div className="font-medium">{selectedItem.center_name}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500">Payment Status</div>
              <div className="font-medium">{selectedItem.payment_status || 'N/A'}</div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex space-x-2">
            <button
              onClick={() => copyToClipboard(selectedItem.accession_number)}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center"
            >
              <Copy className="w-4 h-4 mr-2" />
              Copy Accession
            </button>
            
            <button
              onClick={() => getPatientDemographics(selectedItem.patient_id)}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center"
            >
              <User className="w-4 h-4 mr-2" />
              View Patient
            </button>
          </div>
        </div>
      )}
    </div>
  );

  const renderBillingSearch = () => (
    <div className="space-y-4">
      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
        <h3 className="text-lg font-semibold mb-2 flex items-center">
          <FileText className="w-5 h-5 mr-2" />
          Search Bills by Accession Number
        </h3>
        <p className="text-sm text-gray-600 mb-4">
          Enter accession number to find billing information
        </p>
        
        <div className="relative">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value.toUpperCase())}
            placeholder="Enter accession number (e.g., ACC-24-00000001)"
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
          />
          <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
          {loading && (
            <div className="absolute right-3 top-3">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-green-600"></div>
            </div>
          )}
        </div>
      </div>

      {/* Search Results */}
      {searchResults.length > 0 && (
        <div className="border border-gray-200 rounded-lg">
          {searchResults.map((bill: BillByAccession) => (
            <div
              key={bill.id}
              onClick={() => {
                setSelectedItem(bill);
                onBillSelect?.(bill);
              }}
              className="p-4 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-3">
                  <div className="text-green-600 font-mono font-bold">
                    {bill.accession_number}
                  </div>
                  <div>
                    <div className="font-medium text-gray-900">{bill.bill_number}</div>
                    <div className="text-sm text-gray-500">{bill.patient_name}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-gray-900">₹{bill.net_amount}</div>
                  <div className={`text-sm px-2 py-1 rounded-full inline-block ${getPaymentStatusColor(bill.payment_status)}`}>
                    {bill.payment_status}
                  </div>
                </div>
              </div>
              
              {/* API Status Indicator */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-2">
                  {(() => {
                    const apiStatus = getAPIStatusIndicator(
                      bill.api_success, 
                      bill.api_sent, 
                      bill.api_response_code, 
                      bill.api_retry_count
                    );
                    return (
                      <>
                        <div className={`p-1 rounded-full ${apiStatus.bgColor}`}>
                          {apiStatus.icon}
                        </div>
                        <span className={`text-xs font-medium ${apiStatus.color}`}>
                          {apiStatus.text}
                        </span>
                      </>
                    );
                  })()}
                </div>
                {bill.api_sent_at && (
                  <div className="text-xs text-gray-500">
                    API: {new Date(bill.api_sent_at).toLocaleString()}
                  </div>
                )}
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                <div>
                  <span className="text-gray-500">Study:</span>
                  <span className="ml-1">{bill.study_name || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-gray-500">Center:</span>
                  <span className="ml-1">{bill.center_name}</span>
                </div>
                <div>
                  <span className="text-gray-500">Payment Mode:</span>
                  <span className="ml-1">{bill.payment_mode || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-gray-500">Created:</span>
                  <span className="ml-1">{new Date(bill.created_at).toLocaleDateString()}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Selected Bill Details */}
      {selectedItem && activeTab === 'billing' && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <h4 className="font-semibold mb-3">Bill Details</h4>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <div className="text-sm text-gray-500">Bill Number</div>
              <div className="font-bold">{selectedItem.bill_number}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500">Accession Number</div>
              <div className="font-mono font-bold text-green-600">{selectedItem.accession_number}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500">Patient</div>
              <div className="font-medium">{selectedItem.patient_name}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500">Patient PID</div>
              <div className="font-mono text-blue-600">{selectedItem.patient_pid}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500">Total Amount</div>
              <div className="font-bold">₹{selectedItem.total_amount}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500">GST Amount</div>
              <div className="font-medium">₹{selectedItem.gst_amount}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500">Net Amount</div>
              <div className="font-bold text-lg">₹{selectedItem.net_amount}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500">Payment Status</div>
              <div className={`font-medium px-2 py-1 rounded-full inline-block ${getPaymentStatusColor(selectedItem.payment_status)}`}>
                {selectedItem.payment_status}
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-500">API Status</div>
              <div className="flex items-center space-x-2">
                {(() => {
                  const apiStatus = getAPIStatusIndicator(
                    selectedItem.api_success, 
                    selectedItem.api_sent, 
                    selectedItem.api_response_code, 
                    selectedItem.api_retry_count
                  );
                  return (
                    <>
                      <div className={`p-1 rounded-full ${apiStatus.bgColor}`}>
                        {apiStatus.icon}
                      </div>
                      <span className={`text-sm font-medium ${apiStatus.color}`}>
                        {apiStatus.text}
                      </span>
                    </>
                  );
                })()}
              </div>
            </div>
          </div>

          {/* API Status Details */}
          {selectedItem.api_sent && (
            <div className="mt-4 p-3 bg-gray-50 rounded-lg">
              <h5 className="font-medium text-sm text-gray-700 mb-2">API Integration Details</h5>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-gray-500">API Sent:</span>
                  <span className="ml-1">{selectedItem.api_sent_at ? new Date(selectedItem.api_sent_at).toLocaleString() : 'No'}</span>
                </div>
                <div>
                  <span className="text-gray-500">Response Code:</span>
                  <span className="ml-1">{selectedItem.api_response_code || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-gray-500">Retry Count:</span>
                  <span className="ml-1">{selectedItem.api_retry_count || 0}</span>
                </div>
                <div>
                  <span className="text-gray-500">Last Attempt:</span>
                  <span className="ml-1">{selectedItem.last_api_attempt ? new Date(selectedItem.last_api_attempt).toLocaleString() : 'N/A'}</span>
                </div>
                {selectedItem.api_error_message && (
                  <div className="col-span-2">
                    <span className="text-gray-500">Error Message:</span>
                    <span className="ml-1 text-red-600">{selectedItem.api_error_message}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex space-x-2">
            <button
              onClick={() => copyToClipboard(selectedItem.accession_number)}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center"
            >
              <Copy className="w-4 h-4 mr-2" />
              Copy Accession
            </button>
            
            <button
              onClick={() => copyToClipboard(selectedItem.bill_number)}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center"
            >
              <Copy className="w-4 h-4 mr-2" />
              Copy Bill No
            </button>
            
            <button
              onClick={() => getPatientDemographics(selectedItem.patient_id)}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center"
            >
              <User className="w-4 h-4 mr-2" />
              View Patient
            </button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto p-6 bg-white rounded-lg shadow-lg">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">PID & Accession Number Management</h2>
        <p className="text-gray-600 mt-1">Search patients, studies, and bills using PID and accession numbers</p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => {
              setActiveTab('pid');
              setSearchTerm('');
              setSearchResults([]);
              setSelectedItem(null);
            }}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'pid'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <User className="w-4 h-4 inline mr-2" />
            PID Search
          </button>
          <button
            onClick={() => {
              setActiveTab('accession');
              setSearchTerm('');
              setSearchResults([]);
              setSelectedItem(null);
            }}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'accession'
                ? 'border-purple-500 text-purple-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <FileText className="w-4 h-4 inline mr-2" />
            Study Accession
          </button>
          <button
            onClick={() => {
              setActiveTab('billing');
              setSearchTerm('');
              setSearchResults([]);
              setSelectedItem(null);
            }}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'billing'
                ? 'border-green-500 text-green-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <FileText className="w-4 h-4 inline mr-2" />
            Billing Accession
          </button>
        </nav>
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === 'pid' && renderPIDSearch()}
        {activeTab === 'accession' && renderAccessionSearch()}
        {activeTab === 'billing' && renderBillingSearch()}
      </div>

      {/* Quick Actions */}
      <div className="mt-6 pt-6 border-t border-gray-200">
        <div className="flex justify-between items-center">
          <div className="text-sm text-gray-500">
            {activeTab === 'pid' && 'Search patients using their unique PID (AR********)'}
            {activeTab === 'accession' && 'Find studies using accession numbers (ACC-YY-********)'}
            {activeTab === 'billing' && 'Access billing information via accession numbers'}
          </div>
          <div className="flex space-x-2">
            <button
              onClick={() => setSearchTerm('')}
              className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
            >
              Clear Search
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
