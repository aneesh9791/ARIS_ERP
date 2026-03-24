import React, { useState, useEffect } from 'react';
import { Eye, EyeOff, AlertCircle, CheckCircle, Info, Plus, Minus, ChevronDown, ChevronUp } from 'lucide-react';
import '../../styles/theme.css';
import '../../styles/responsive.css';

const ResponsiveForm = ({
  fields = [],
  initialValues = {},
  onSubmit,
  onSubmitSuccess,
  onSubmitError,
  loading = false,
  submitText = 'Submit',
  cancelText = 'Cancel',
  onCancel,
  className = '',
  layout = 'responsive', // responsive, vertical, horizontal, inline, stacked
  size = 'medium', // small, medium, large
  showErrors = true,
  showSuccess = false,
  successMessage = 'Form submitted successfully!',
  disabled = false,
  collapsible = false,
  defaultExpanded = true,
  multiStep = false,
  currentStep = 0,
  onStepChange
}) => {
  const [formData, setFormData] = useState(initialValues);
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [showPassword, setShowPassword] = useState({});
  const [focused, setFocused] = useState({});
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [screenSize, setScreenSize] = useState('mobile');
  const [dynamicFields, setDynamicFields] = useState([]);

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

  // Initialize form data
  useEffect(() => {
    setFormData(initialValues);
  }, [initialValues]);

  // Handle field changes
  const handleChange = (name, value) => {
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    
    // Clear error when user starts typing
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: ''
      }));
    }
  };

  // Handle field blur
  const handleBlur = (name) => {
    setTouched(prev => ({
      ...prev,
      [name]: true
    }));
    setFocused(prev => ({
      ...prev,
      [name]: false
    }));
  };

  // Handle field focus
  const handleFocus = (name) => {
    setFocused(prev => ({
      ...prev,
      [name]: true
    }));
  };

  // Validate field
  const validateField = (field, value) => {
    if (field.required && (!value || value.toString().trim() === '')) {
      return `${field.label} is required`;
    }

    if (field.type === 'email' && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      return 'Please enter a valid email address';
    }

    if (field.type === 'number' && value && isNaN(Number(value))) {
      return 'Please enter a valid number';
    }

    if (field.minLength && value && value.toString().length < field.minLength) {
      return `${field.label} must be at least ${field.minLength} characters`;
    }

    if (field.maxLength && value && value.toString().length > field.maxLength) {
      return `${field.label} must not exceed ${field.maxLength} characters`;
    }

    if (field.min && value && Number(value) < field.min) {
      return `${field.label} must be at least ${field.min}`;
    }

    if (field.max && value && Number(value) > field.max) {
      return `${field.label} must not exceed ${field.max}`;
    }

    if (field.pattern && value && !new RegExp(field.pattern).test(value)) {
      return field.patternMessage || `${field.label} format is invalid`;
    }

    if (field.customValidator && value) {
      const customError = field.customValidator(value);
      if (customError) return customError;
    }

    return '';
  };

  // Validate all fields
  const validateForm = () => {
    const newErrors = {};
    
    fields.forEach(field => {
      const error = validateField(field, formData[field.name]);
      if (error) {
        newErrors[field.name] = error;
      }
    });

    // Validate dynamic fields
    dynamicFields.forEach((field, index) => {
      const error = validateField(field, formData[`dynamic_${index}`]);
      if (error) {
        newErrors[`dynamic_${index}`] = error;
      }
    });
    
    setErrors(newErrors);
    setTouched(fields.reduce((acc, field) => ({ ...acc, [field.name]: true }), {}));
    
    return Object.keys(newErrors).length === 0;
  };

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }
    
    try {
      await onSubmit(formData);
      onSubmitSuccess?.();
    } catch (error) {
      onSubmitError?.(error);
    }
  };

  // Add dynamic field
  const addDynamicField = () => {
    const newField = {
      name: `dynamic_${dynamicFields.length}`,
      type: 'text',
      label: `Dynamic Field ${dynamicFields.length + 1}`,
      required: false
    };
    setDynamicFields([...dynamicFields, newField]);
  };

  // Remove dynamic field
  const removeDynamicField = (index) => {
    const newFields = dynamicFields.filter((_, i) => i !== index);
    setDynamicFields(newFields);
    
    // Remove form data
    const newFormData = { ...formData };
    delete newFormData[`dynamic_${index}`];
    setFormData(newFormData);
  };

  // Get responsive layout classes
  const getLayoutClasses = () => {
    let classes = 'space-y-6';
    
    if (layout === 'responsive') {
      if (screenSize === 'mobile') {
        classes = 'space-y-4';
      } else if (screenSize === 'tablet') {
        classes = 'space-y-5';
      } else {
        classes = 'grid grid-cols-1 md:grid-cols-2 gap-6';
      }
    } else if (layout === 'horizontal') {
      classes = 'flex items-end space-x-4';
    } else if (layout === 'inline') {
      classes = 'flex items-end space-x-4';
    } else if (layout === 'stacked') {
      classes = 'space-y-6';
    }
    
    return classes;
  };

  // Get field size classes
  const getFieldSizeClasses = (fieldSize) => {
    const sizes = {
      small: 'px-3 py-2 text-sm',
      medium: 'px-4 py-3 text-base',
      large: 'px-5 py-4 text-lg'
    };
    return sizes[fieldSize] || sizes.medium;
  };

  // Get field classes
  const getFieldClasses = (field) => {
    let classes = `w-full border border-gray-300 rounded-lg transition-colors duration-200 ${getFieldSizeClasses(field.size || size)}`;
    
    if (focused[field.name]) {
      classes += ' ring-2 ring-blue-500 ring-opacity-50 border-blue-500';
    } else if (errors[field.name] && touched[field.name]) {
      classes += ' border-red-500 ring-2 ring-red-500 ring-opacity-50';
    } else if (touched[field.name]) {
      classes += ' border-gray-400';
    }
    
    if (disabled) {
      classes += ' bg-gray-100 cursor-not-allowed opacity-50';
    }
    
    // Responsive adjustments
    if (screenSize === 'mobile') {
      classes += ' text-base'; // Prevent zoom on iOS
    }
    
    return classes;
  };

  // Get label classes
  const getLabelClasses = () => {
    let classes = 'block text-sm font-medium text-gray-700 mb-2';
    
    if (screenSize === 'mobile') {
      classes += ' text-xs';
    }
    
    return classes;
  };

  // Get error message classes
  const getErrorClasses = () => {
    let classes = 'text-sm text-red-600 mt-1 flex items-center';
    
    if (screenSize === 'mobile') {
      classes += ' text-xs';
    }
    
    return classes;
  };

  // Get responsive form group classes
  const getFormGroupClasses = (field) => {
    let classes = '';
    
    if (layout === 'responsive' && screenSize !== 'mobile') {
      if (field.span === 2) {
        classes += ' md:col-span-2';
      } else if (field.span === 3) {
        classes += ' md:col-span-3';
      }
    }
    
    return classes;
  };

  // Render field based on type
  const renderField = (field, index = null) => {
    const fieldName = index !== null ? `dynamic_${index}` : field.name;
    const fieldValue = formData[fieldName] || '';
    
    const commonProps = {
      id: fieldName,
      name: fieldName,
      value: fieldValue,
      onChange: (e) => handleChange(fieldName, e.target.value),
      onBlur: () => handleBlur(fieldName),
      onFocus: () => handleFocus(fieldName),
      placeholder: field.placeholder,
      disabled: disabled || field.disabled,
      className: getFieldClasses(field)
    };

    switch (field.type) {
      case 'text':
      case 'email':
      case 'number':
      case 'tel':
      case 'url':
        return (
          <input
            type={field.type}
            {...commonProps}
          />
        );

      case 'password':
        return (
          <div className="relative">
            <input
              type={showPassword[fieldName] ? 'text' : 'password'}
              {...commonProps}
            />
            <button
              type="button"
              onClick={() => setShowPassword(prev => ({ ...prev, [fieldName]: !prev[fieldName] }))}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showPassword[fieldName] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        );

      case 'textarea':
        return (
          <textarea
            {...commonProps}
            rows={field.rows || (screenSize === 'mobile' ? 3 : 4)}
            className={`${commonProps.className} resize-none`}
          />
        );

      case 'select':
        return (
          <select {...commonProps}>
            <option value="">Select {field.label}</option>
            {field.options?.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        );

      case 'radio':
        return (
          <div className="space-y-2">
            {field.options?.map(option => (
              <label key={option.value} className="flex items-center">
                <input
                  type="radio"
                  name={fieldName}
                  value={option.value}
                  checked={fieldValue === option.value}
                  onChange={(e) => handleChange(fieldName, e.target.value)}
                  className="mr-2 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">{option.label}</span>
              </label>
            ))}
          </div>
        );

      case 'checkbox':
        return (
          <label className="flex items-center">
            <input
              type="checkbox"
              name={fieldName}
              checked={fieldValue}
              onChange={(e) => handleChange(fieldName, e.target.checked)}
              className="mr-2 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">{field.label}</span>
          </label>
        );

      case 'date':
        return (
          <input
            type="date"
            {...commonProps}
          />
        );

      case 'time':
        return (
          <input
            type="time"
            {...commonProps}
          />
        );

      case 'datetime-local':
        return (
          <input
            type="datetime-local"
            {...commonProps}
          />
        );

      case 'file':
        return (
          <input
            type="file"
            {...commonProps}
            className={`${commonProps.className} file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100`}
          />
        );

      case 'dynamic':
        return (
          <div className="border border-gray-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-sm font-medium text-gray-900">{field.label}</h4>
              <button
                type="button"
                onClick={() => removeDynamicField(index)}
                className="p-1 text-red-500 hover:text-red-700 rounded"
              >
                <Minus className="w-4 h-4" />
              </button>
            </div>
            <input
              type="text"
              value={fieldValue}
              onChange={(e) => handleChange(fieldName, e.target.value)}
              placeholder={field.placeholder}
              className={getFieldClasses(field)}
            />
          </div>
        );

      default:
        return (
          <input
            type="text"
            {...commonProps}
          />
        );
    }
  };

  // Render form header
  const renderHeader = () => {
    return (
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Form Title</h3>
          <p className="text-sm text-gray-600 mt-1">Form description</p>
        </div>
        {collapsible && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-2 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
          >
            {expanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </button>
        )}
      </div>
    );
  };

  // Render form actions
  const renderActions = () => {
    const isCompact = screenSize === 'mobile';
    
    return (
      <div className={`flex ${isCompact ? 'flex-col space-y-2' : 'items-center justify-end space-x-3'} mt-6`}>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className={`w-full sm:w-auto px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors`}
          >
            {cancelText}
          </button>
        )}
        
        <button
          type="submit"
          disabled={loading || disabled}
          className={`w-full sm:w-auto flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors`}
        >
          {loading && (
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
          )}
          {submitText}
        </button>
      </div>
    );
  };

  // Render dynamic fields section
  const renderDynamicFields = () => {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-medium text-gray-900">Dynamic Fields</h4>
          <button
            type="button"
            onClick={addDynamicField}
            className="flex items-center px-3 py-1 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Plus className="w-4 h-4 mr-1" />
            Add Field
          </button>
        </div>
        
        {dynamicFields.map((field, index) => (
          <div key={index} className={getFormGroupClasses(field)}>
            {renderField(field, index)}
            
            {showErrors && errors[`dynamic_${index}`] && touched[`dynamic_${index}`] && (
              <div className={getErrorClasses()}>
                <AlertCircle className="w-4 h-4 mr-1" />
                {errors[`dynamic_${index}`]}
              </div>
            )}
            
            {field.helpText && (
              <p className="text-sm text-gray-500 mt-1">{field.helpText}</p>
            )}
          </div>
        ))}
      </div>
    );
  };

  return (
    <form onSubmit={handleSubmit} className={`space-y-6 ${className}`}>
      {/* Success Message */}
      {showSuccess && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg flex items-center">
          <CheckCircle className="w-5 h-5 text-green-600 mr-3" />
          <span className="text-green-800">{successMessage}</span>
        </div>
      )}

      {/* Form Header */}
      {collapsible && renderHeader()}

      {/* Form Content */}
      {!collapsible || expanded ? (
        <div className={getLayoutClasses()}>
          {/* Regular Fields */}
          {fields.map((field) => (
            <div key={field.name} className={getFormGroupClasses(field)}>
              {/* Label */}
              {field.type !== 'checkbox' && field.type !== 'radio' && (
                <label htmlFor={field.name} className={getLabelClasses()}>
                  {field.label}
                  {field.required && <span className="text-red-500 ml-1">*</span>}
                  {field.tooltip && (
                    <span className="ml-1 text-gray-400 cursor-help" title={field.tooltip}>
                      <Info className="w-4 h-4" />
                    </span>
                  )}
                </label>
              )}

              {/* Field */}
              <div className={field.type === 'checkbox' || field.type === 'radio' ? '' : ''}>
                {renderField(field)}

                {/* Error Message */}
                {showErrors && errors[field.name] && touched[field.name] && (
                  <div className={getErrorClasses()}>
                    <AlertCircle className="w-4 h-4 mr-1" />
                    {errors[field.name]}
                  </div>
                )}

                {/* Help Text */}
                {field.helpText && (
                  <p className="text-sm text-gray-500 mt-1">{field.helpText}</p>
                )}
              </div>
            </div>
          ))}

          {/* Dynamic Fields */}
          {dynamicFields.length > 0 && renderDynamicFields()}
        </div>
      ) : null}

      {/* Actions */}
      {(!collapsible || expanded) && renderActions()}
    </form>
  );
};

export default ResponsiveForm;
