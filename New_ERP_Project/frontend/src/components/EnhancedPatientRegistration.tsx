import React, { useState, useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { Eye, EyeOff, Upload, FileText, User, Phone, Mail, Calendar, MapPin, Shield, AlertCircle } from 'lucide-react';

interface IdProofType {
  type_code: string;
  type_name: string;
  description: string;
}

interface PatientFormData {
  name: string;
  email: string;
  phone: string;
  gender: 'MALE' | 'FEMALE' | 'OTHER';
  date_of_birth: string;
  address: string;
  city: string;
  state: string;
  postal_code: string;
  has_insurance: boolean;
  insurance_provider_id?: number;
  policy_number?: string;
  insured_name?: string;
  relationship?: string;
  referring_physician_code?: string;
  center_id: number;
  // ID Proof
  id_proof_type?: string;
  id_proof_number?: string;
  id_proof_issued_date?: string;
  id_proof_expiry_date?: string;
  // Emergency Contact
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  emergency_contact_relation?: string;
  emergency_contact_email?: string;
  // Medical Information
  blood_group?: string;
  allergies?: string;
  chronic_diseases?: string;
  current_medications?: string;
  previous_surgeries?: string;
  // Consent
  consent_for_treatment: boolean;
  consent_for_data_sharing: boolean;
}

interface EnhancedPatientRegistrationProps {
  onSubmit: (data: PatientFormData) => void;
  onCancel: () => void;
  initialData?: Partial<PatientFormData>;
  isLoading?: boolean;
}

const bloodGroups = [
  'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'
];

const relationships = [
  'Self', 'Spouse', 'Parent', 'Child', 'Sibling', 'Other'
];

const emergencyRelations = [
  'Spouse', 'Parent', 'Child', 'Sibling', 'Friend', 'Relative', 'Other'
];

export default function EnhancedPatientRegistration({
  onSubmit,
  onCancel,
  initialData,
  isLoading = false
}: EnhancedPatientRegistrationProps) {
  const [idProofTypes, setIdProofTypes] = useState<IdProofType[]>([]);
  const [showPassword, setShowPassword] = useState(false);
  const [uploadedPhoto, setUploadedPhoto] = useState<File | null>(null);
  const [uploadedIdProof, setUploadedIdProof] = useState<File | null>(null);
  const [idProofValidationError, setIdProofValidationError] = useState('');
  const [isVerifyingIdProof, setIsVerifyingIdProof] = useState(false);

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors, isValid }
  } = useForm<PatientFormData>({
    defaultValues: {
      gender: 'MALE',
      has_insurance: false,
      consent_for_treatment: false,
      consent_for_data_sharing: false,
      ...initialData
    }
  });

  const watchedIdProofType = watch('id_proof_type');
  const watchedIdProofNumber = watch('id_proof_number');
  const hasInsurance = watch('has_insurance');

  useEffect(() => {
    fetchIdProofTypes();
  }, []);

  useEffect(() => {
    if (watchedIdProofType && watchedIdProofNumber) {
      validateIdProofFormat();
    }
  }, [watchedIdProofType, watchedIdProofNumber]);

  const fetchIdProofTypes = async () => {
    try {
      const response = await fetch('/api/patients/id-proof-types');
      const data = await response.json();
      if (data.success) {
        setIdProofTypes(data.id_proof_types);
      }
    } catch (error) {
      console.error('Error fetching ID proof types:', error);
    }
  };

  const validateIdProofFormat = async () => {
    if (!watchedIdProofType || !watchedIdProofNumber) {
      setIdProofValidationError('');
      return;
    }

    setIsVerifyingIdProof(true);
    try {
      const response = await fetch('/api/patients/validate-id-proof', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id_proof_type: watchedIdProofType,
          id_proof_number: watchedIdProofNumber
        })
      });

      const data = await response.json();
      
      if (!data.is_valid) {
        setIdProofValidationError(data.error_message);
      } else {
        setIdProofValidationError('');
      }
    } catch (error) {
      console.error('Error validating ID proof:', error);
    } finally {
      setIsVerifyingIdProof(false);
    }
  };

  const handlePhotoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setUploadedPhoto(file);
    }
  };

  const handleIdProofUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setUploadedIdProof(file);
    }
  };

  const onFormSubmit = (data: PatientFormData) => {
    // Create FormData for file uploads
    const formData = new FormData();
    
    // Add all form fields
    Object.keys(data).forEach(key => {
      if (data[key as keyof PatientFormData] !== undefined) {
        formData.append(key, String(data[key as keyof PatientFormData]));
      }
    });

    // Add files if uploaded
    if (uploadedPhoto) {
      formData.append('photo', uploadedPhoto);
    }
    if (uploadedIdProof) {
      formData.append('id_proof_document', uploadedIdProof);
    }

    onSubmit(data);
  };

  return (
    <div className="max-w-4xl mx-auto p-6 bg-white rounded-lg shadow-lg">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Patient Registration</h2>
        <p className="text-gray-600 mt-1">Register a new patient with comprehensive information</p>
      </div>

      <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-6">
        {/* Basic Information */}
        <div className="bg-gray-50 p-4 rounded-lg">
          <h3 className="text-lg font-semibold mb-4 flex items-center">
            <User className="w-5 h-5 mr-2" />
            Basic Information
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Full Name *</label>
              <input
                type="text"
                {...register('name', { required: 'Full name is required' })}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border"
                placeholder="Enter patient name"
              />
              {errors.name && (
                <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Email</label>
              <input
                type="email"
                {...register('email')}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border"
                placeholder="patient@example.com"
              />
              {errors.email && (
                <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Phone *</label>
              <input
                type="tel"
                {...register('phone', { required: 'Phone number is required' })}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border"
                placeholder="+91 98765 43210"
              />
              {errors.phone && (
                <p className="text-red-500 text-xs mt-1">{errors.phone.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Gender *</label>
              <select
                {...register('gender', { required: 'Gender is required' })}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border"
              >
                <option value="MALE">Male</option>
                <option value="FEMALE">Female</option>
                <option value="OTHER">Other</option>
              </select>
              {errors.gender && (
                <p className="text-red-500 text-xs mt-1">{errors.gender.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Date of Birth *</label>
              <input
                type="date"
                {...register('date_of_birth', { required: 'Date of birth is required' })}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border"
              />
              {errors.date_of_birth && (
                <p className="text-red-500 text-xs mt-1">{errors.date_of_birth.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Center *</label>
              <select
                {...register('center_id', { required: 'Center is required' })}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border"
              >
                <option value="">Select Center</option>
                {/* Options would be populated from API */}
              </select>
              {errors.center_id && (
                <p className="text-red-500 text-xs mt-1">{errors.center_id.message}</p>
              )}
            </div>
          </div>
        </div>

        {/* Address Information */}
        <div className="bg-gray-50 p-4 rounded-lg">
          <h3 className="text-lg font-semibold mb-4 flex items-center">
            <MapPin className="w-5 h-5 mr-2" />
            Address Information
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700">Address *</label>
              <textarea
                {...register('address', { required: 'Address is required' })}
                rows={2}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border"
                placeholder="Enter complete address"
              />
              {errors.address && (
                <p className="text-red-500 text-xs mt-1">{errors.address.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">City *</label>
              <input
                type="text"
                {...register('city', { required: 'City is required' })}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border"
                placeholder="Kochi"
              />
              {errors.city && (
                <p className="text-red-500 text-xs mt-1">{errors.city.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">State *</label>
              <input
                type="text"
                {...register('state', { required: 'State is required' })}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border"
                placeholder="Kerala"
              />
              {errors.state && (
                <p className="text-red-500 text-xs mt-1">{errors.state.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Postal Code *</label>
              <input
                type="text"
                {...register('postal_code', { required: 'Postal code is required' })}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border"
                placeholder="682024"
              />
              {errors.postal_code && (
                <p className="text-red-500 text-xs mt-1">{errors.postal_code.message}</p>
              )}
            </div>
          </div>
        </div>

        {/* ID Proof Information */}
        <div className="bg-gray-50 p-4 rounded-lg">
          <h3 className="text-lg font-semibold mb-4 flex items-center">
            <Shield className="w-5 h-5 mr-2" />
            ID Proof Information
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">ID Proof Type</label>
              <select
                {...register('id_proof_type')}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border"
              >
                <option value="">Select ID Proof Type</option>
                {idProofTypes.map((type) => (
                  <option key={type.type_code} value={type.type_code}>
                    {type.type_name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">ID Proof Number</label>
              <input
                type="text"
                {...register('id_proof_number')}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border"
                placeholder="Enter ID proof number"
              />
              {idProofValidationError && (
                <p className="text-red-500 text-xs mt-1 flex items-center">
                  <AlertCircle className="w-3 h-3 mr-1" />
                  {idProofValidationError}
                </p>
              )}
              {isVerifyingIdProof && (
                <p className="text-blue-500 text-xs mt-1">Validating ID proof format...</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Issued Date</label>
              <input
                type="date"
                {...register('id_proof_issued_date')}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Expiry Date</label>
              <input
                type="date"
                {...register('id_proof_expiry_date')}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border"
              />
            </div>
          </div>

          {/* ID Proof Document Upload */}
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700">ID Proof Document</label>
            <div className="mt-1 flex items-center space-x-4">
              <label className="flex items-center justify-center w-64 h-32 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-500">
                <input
                  type="file"
                  onChange={handleIdProofUpload}
                  accept="image/*,.pdf"
                  className="hidden"
                />
                <div className="text-center">
                  <FileText className="w-8 h-8 mx-auto text-gray-400" />
                  <p className="text-xs text-gray-600 mt-1">
                    {uploadedIdProof ? uploadedIdProof.name : 'Upload ID Proof'}
                  </p>
                </div>
              </label>
              {uploadedIdProof && (
                <div className="flex-1">
                  <p className="text-sm text-green-600">✓ {uploadedIdProof.name}</p>
                  <p className="text-xs text-gray-500">
                    {(uploadedIdProof.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Emergency Contact */}
        <div className="bg-gray-50 p-4 rounded-lg">
          <h3 className="text-lg font-semibold mb-4">Emergency Contact</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Contact Name</label>
              <input
                type="text"
                {...register('emergency_contact_name')}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border"
                placeholder="Emergency contact name"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Contact Phone</label>
              <input
                type="tel"
                {...register('emergency_contact_phone')}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border"
                placeholder="+91 98765 43210"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Relationship</label>
              <select
                {...register('emergency_contact_relation')}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border"
              >
                <option value="">Select Relationship</option>
                {emergencyRelations.map((relation) => (
                  <option key={relation} value={relation}>{relation}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Contact Email</label>
              <input
                type="email"
                {...register('emergency_contact_email')}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border"
                placeholder="emergency@example.com"
              />
            </div>
          </div>
        </div>

        {/* Medical Information */}
        <div className="bg-gray-50 p-4 rounded-lg">
          <h3 className="text-lg font-semibold mb-4">Medical Information</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Blood Group</label>
              <select
                {...register('blood_group')}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border"
              >
                <option value="">Select Blood Group</option>
                {bloodGroups.map((group) => (
                  <option key={group} value={group}>{group}</option>
                ))}
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700">Allergies</label>
              <textarea
                {...register('allergies')}
                rows={2}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border"
                placeholder="List any known allergies"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700">Chronic Diseases</label>
              <textarea
                {...register('chronic_diseases')}
                rows={2}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border"
                placeholder="List any chronic conditions"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700">Current Medications</label>
              <textarea
                {...register('current_medications')}
                rows={2}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border"
                placeholder="List current medications"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700">Previous Surgeries</label>
              <textarea
                {...register('previous_surgeries')}
                rows={2}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border"
                placeholder="List previous surgeries"
              />
            </div>
          </div>
        </div>

        {/* Insurance Information */}
        <div className="bg-gray-50 p-4 rounded-lg">
          <h3 className="text-lg font-semibold mb-4">Insurance Information</h3>
          
          <div className="mb-4">
            <label className="flex items-center">
              <input
                type="checkbox"
                {...register('has_insurance')}
                className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              />
              <span className="ml-2 text-sm text-gray-700">Patient has insurance</span>
            </label>
          </div>

          {hasInsurance && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Insurance Provider</label>
                <select
                  {...register('insurance_provider_id')}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border"
                >
                  <option value="">Select Insurance Provider</option>
                  {/* Options would be populated from API */}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Policy Number</label>
                <input
                  type="text"
                  {...register('policy_number')}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border"
                  placeholder="Policy number"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Insured Name</label>
                <input
                  type="text"
                  {...register('insured_name')}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border"
                  placeholder="Insured person name"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Relationship</label>
                <select
                  {...register('relationship')}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border"
                >
                  <option value="">Select Relationship</option>
                  {relationships.map((relation) => (
                    <option key={relation} value={relation}>{relation}</option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Photo Upload */}
        <div className="bg-gray-50 p-4 rounded-lg">
          <h3 className="text-lg font-semibold mb-4">Patient Photo</h3>
          
          <div className="flex items-center space-x-4">
            <label className="flex items-center justify-center w-32 h-32 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-500">
              <input
                type="file"
                onChange={handlePhotoUpload}
                accept="image/*"
                className="hidden"
              />
              <div className="text-center">
                <User className="w-8 h-8 mx-auto text-gray-400" />
                <p className="text-xs text-gray-600 mt-1">Photo</p>
              </div>
            </label>
            {uploadedPhoto && (
              <div className="flex-1">
                <p className="text-sm text-green-600">✓ {uploadedPhoto.name}</p>
                <p className="text-xs text-gray-500">
                  {(uploadedPhoto.size / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Consent */}
        <div className="bg-gray-50 p-4 rounded-lg">
          <h3 className="text-lg font-semibold mb-4">Consent & Privacy</h3>
          
          <div className="space-y-3">
            <label className="flex items-start">
              <input
                type="checkbox"
                {...register('consent_for_treatment', { required: 'Treatment consent is required' })}
                className="mt-1 rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              />
              <span className="ml-2 text-sm text-gray-700">
                I consent to medical treatment and procedures as deemed necessary by the healthcare providers.
              </span>
            </label>
            {errors.consent_for_treatment && (
              <p className="text-red-500 text-xs">{errors.consent_for_treatment.message}</p>
            )}

            <label className="flex items-start">
              <input
                type="checkbox"
                {...register('consent_for_data_sharing', { required: 'Data sharing consent is required' })}
                className="mt-1 rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              />
              <span className="ml-2 text-sm text-gray-700">
                I consent to sharing my medical information with healthcare providers involved in my treatment.
              </span>
            </label>
            {errors.consent_for_data_sharing && (
              <p className="text-red-500 text-xs">{errors.consent_for_data_sharing.message}</p>
            )}
          </div>
        </div>

        {/* Form Actions */}
        <div className="flex justify-end space-x-4">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isLoading || !isValid || isVerifyingIdProof}
            className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Registering...' : 'Register Patient'}
          </button>
        </div>
      </form>
    </div>
  );
}
