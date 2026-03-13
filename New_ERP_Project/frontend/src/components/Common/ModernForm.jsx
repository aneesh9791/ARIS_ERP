import React, { useState, useEffect } from 'react';
import { Eye, EyeOff, AlertCircle, CheckCircle, Info } from 'lucide-react';
import '../styles/theme.css';

const ModernForm = ({
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
  layout = 'vertical', // vertical, horizontal, inline
  size = 'medium', // small, medium, large
  showErrors = true,
  showSuccess = false,
  successMessage = 'Form submitted successfully!',
  disabled = false
}) => {
  const [formData, setFormData] = useState(initialValues);
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [showPassword, setShowPassword] = useState({});
  const [focused, setFocused] = useState({});

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
    
    return classes;
  };

  // Get label classes
  const getLabelClasses = () => {
    return 'block text-sm font-medium text-gray-700 mb-2';
  };

  // Get error message classes
  const getErrorClasses = () => {
    return 'text-sm text-red-600 mt-1 flex items-center';
  };

  // Render field based on type
  const renderField = (field) => {
    const commonProps = {
      id: field.name,
      name: field.name,
      value: formData[field.name] || '',
      onChange: (e) => handleChange(field.name, e.target.value),
      onBlur: () => handleBlur(field.name),
      onFocus: () => handleFocus(field.name),
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
              type={showPassword[field.name] ? 'text' : 'password'}
              {...commonProps}
            />
            <button
              type="button"
              onClick={() => setShowPassword(prev => ({ ...prev, [field.name]: !prev[field.name] }))}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showPassword[field.name] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        );

      case 'textarea':
        return (
          <textarea
            {...commonProps}
            rows={field.rows || 4}
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
                  name={field.name}
                  value={option.value}
                  checked={formData[field.name] === option.value}
                  onChange={(e) => handleChange(field.name, e.target.value)}
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
              name={field.name}
              checked={formData[field.name]}
              onChange={(e) => handleChange(field.name, e.target.checked)}
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

      default:
        return (
          <input
            type="text"
            {...commonProps}
          />
        );
    }
  };

  // Get layout classes
  const getLayoutClasses = () => {
    const layouts = {
      vertical: 'space-y-6',
      horizontal: 'space-x-6 items-end',
      inline: 'flex items-end space-x-4'
    };
    return layouts[layout] || layouts.vertical;
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

      {/* Form Fields */}
      <div className={getLayoutClasses()}>
        {fields.map(field => (
          <div key={field.name} className={layout === 'horizontal' ? 'flex-1' : ''}>
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
      </div>

      {/* Actions */}
      <div className={`flex items-center justify-end space-x-3 ${layout === 'inline' ? 'mt-0' : ''}`}>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {cancelText}
          </button>
        )}
        
        <button
          type="submit"
          disabled={loading || disabled}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
        >
          {loading && (
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
          )}
          {submitText}
        </button>
      </div>
    </form>
  );
};

export default ModernForm;
