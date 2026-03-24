import React, { useState, useEffect } from 'react';
import { Upload, X, Eye, Download, RefreshCw, Palette, Type, Image, Building, Heart, Activity } from 'lucide-react';
import ResponsiveCard from '../Common/ResponsiveCard';
import ResponsiveForm from '../Common/ResponsiveForm';
import Logo from '../Common/Logo';
import '../../styles/theme.css';

const LogoSettings = () => {
  const [logoConfig, setLogoConfig] = useState({
    type: 'default',
    customLogo: null,
    companyName: 'ARIS Healthcare',
    tagline: 'Advanced ERP Solutions',
    primaryColor: '#3b82f6',
    secondaryColor: '#10b981',
    showTagline: true,
    logoStyle: 'modern',
    iconType: 'building'
  });

  const [previewSize, setPreviewSize] = useState('large');
  const [uploading, setUploading] = useState(false);
  const [logoPreview, setLogoPreview] = useState(null);

  useEffect(() => {
    // Load saved configuration
    const savedConfig = localStorage.getItem('logoConfig');
    if (savedConfig) {
      setLogoConfig(JSON.parse(savedConfig));
    }
  }, []);

  const handleLogoUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
      setUploading(true);
      
      // Create preview
      const reader = new FileReader();
      reader.onload = (e) => {
        setLogoPreview(e.target.result);
        setUploading(false);
      };
      reader.readAsDataURL(file);

      // In a real app, you'd upload to server
      setTimeout(() => {
        setLogoConfig(prev => ({
          ...prev,
          customLogo: e.target.result,
          type: 'custom'
        }));
        setUploading(false);
      }, 1000);
    }
  };

  const handleConfigChange = (field, value) => {
    const newConfig = { ...logoConfig, [field]: value };
    setLogoConfig(newConfig);
    localStorage.setItem('logoConfig', JSON.stringify(newConfig));
  };

  const handleSave = () => {
    // Save to backend API
    console.log('Saving logo configuration:', logoConfig);
    localStorage.setItem('logoConfig', JSON.stringify(logoConfig));
    
    // Show success message
    alert('Logo configuration saved successfully!');
  };

  const handleReset = () => {
    const defaultConfig = {
      type: 'default',
      customLogo: null,
      companyName: 'ARIS Healthcare',
      tagline: 'Advanced ERP Solutions',
      primaryColor: '#3b82f6',
      secondaryColor: '#10b981',
      showTagline: true,
      logoStyle: 'modern',
      iconType: 'building'
    };
    
    setLogoConfig(defaultConfig);
    setLogoPreview(null);
    localStorage.setItem('logoConfig', JSON.stringify(defaultConfig));
  };

  const logoTypes = [
    { value: 'default', label: 'Default Logo', icon: Building, description: 'Default ARIS logo with building icon' },
    { value: 'icon', label: 'Icon Logo', icon: Activity, description: 'Modern icon-based logo' },
    { value: 'text', label: 'Text Logo', icon: Type, description: 'Text-based logo with company name' },
    { value: 'custom', label: 'Custom Logo', icon: Image, description: 'Upload your custom logo' }
  ];

  const colorPresets = [
    { name: 'Blue & Green', primary: '#3b82f6', secondary: '#10b981' },
    { name: 'Purple & Pink', primary: '#8b5cf6', secondary: '#ec4899' },
    { name: 'Orange & Red', primary: '#f97316', secondary: '#ef4444' },
    { name: 'Teal & Cyan', primary: '#14b8a6', secondary: '#06b6d4' },
    { name: 'Indigo & Blue', primary: '#6366f1', secondary: '#3b82f6' },
    { name: 'Gray & Black', primary: '#6b7280', secondary: '#000000' }
  ];

  const iconTypes = [
    { value: 'building', label: 'Building', icon: Building },
    { value: 'heart', label: 'Heart', icon: Heart },
    { value: 'activity', label: 'Activity', icon: Activity }
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Logo Settings</h2>
        <p className="text-gray-600 mt-1">Customize your organization's logo appearance</p>
      </div>

      {/* Logo Preview */}
      <ResponsiveCard>
        <div className="text-center">
          <h3 className="text-lg font-semibold text-gray-900 mb-6">Logo Preview</h3>
          
          {/* Size Selector */}
          <div className="flex justify-center space-x-2 mb-6">
            {['small', 'medium', 'large', 'xlarge'].map((size) => (
              <button
                key={size}
                onClick={() => setPreviewSize(size)}
                className={`px-3 py-1 rounded-lg text-sm transition-colors ${
                  previewSize === size
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {size.charAt(0).toUpperCase() + size.slice(1)}
              </button>
            ))}
          </div>

          {/* Logo Display */}
          <div className="flex justify-center items-center py-8 bg-gray-50 rounded-lg">
            <Logo size={previewSize} className="transform scale-150" />
          </div>

          {/* Company Name Display */}
          <div className="mt-6">
            <h4 className="text-xl font-bold" style={{ color: logoConfig.primaryColor }}>
              {logoConfig.companyName}
            </h4>
            {logoConfig.showTagline && (
              <p className="text-sm text-gray-500 mt-1">{logoConfig.tagline}</p>
            )}
          </div>
        </div>
      </ResponsiveCard>

      {/* Logo Type Selection */}
      <ResponsiveCard>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Logo Type</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {logoTypes.map((type) => (
            <div
              key={type.value}
              onClick={() => handleConfigChange('type', type.value)}
              className={`p-4 border-2 rounded-lg cursor-pointer transition-all hover:shadow-md ${
                logoConfig.type === type.value
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="flex flex-col items-center space-y-2">
                <type.icon className="w-8 h-8 text-gray-600" />
                <div className="text-center">
                  <p className="font-medium text-gray-900">{type.label}</p>
                  <p className="text-xs text-gray-500 mt-1">{type.description}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </ResponsiveCard>

      {/* Custom Logo Upload */}
      {logoConfig.type === 'custom' && (
        <ResponsiveCard>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Upload Custom Logo</h3>
          
          <div className="space-y-4">
            {/* Upload Area */}
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
              <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600 mb-2">Drop your logo here or click to browse</p>
              <p className="text-sm text-gray-500">PNG, JPG, SVG up to 5MB</p>
              
              <input
                type="file"
                accept="image/*"
                onChange={handleLogoUpload}
                className="hidden"
                id="logo-upload"
              />
              <label
                htmlFor="logo-upload"
                className="inline-block px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer transition-colors"
              >
                {uploading ? 'Uploading...' : 'Choose File'}
              </label>
            </div>

            {/* Preview */}
            {logoPreview && (
              <div className="flex items-center justify-center p-4 bg-gray-50 rounded-lg">
                <img 
                  src={logoPreview} 
                  alt="Logo preview" 
                  className="w-auto max-w-full max-h-32 object-contain"
                />
                <button
                  onClick={() => {
                    setLogoPreview(null);
                    handleConfigChange('customLogo', null);
                    handleConfigChange('type', 'default');
                  }}
                  className="ml-4 p-2 text-red-500 hover:text-red-700"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            )}
          </div>
        </ResponsiveCard>
      )}

      {/* Text Configuration */}
      {(logoConfig.type === 'text' || logoConfig.showTagline) && (
        <ResponsiveCard>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Text Configuration</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Company Name
              </label>
              <input
                type="text"
                value={logoConfig.companyName}
                onChange={(e) => handleConfigChange('companyName', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter company name"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Tagline
              </label>
              <input
                type="text"
                value={logoConfig.tagline}
                onChange={(e) => handleConfigChange('tagline', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter tagline"
              />
            </div>
          </div>

          <div className="mt-4">
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={logoConfig.showTagline}
                onChange={(e) => handleConfigChange('showTagline', e.target.checked)}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <span className="text-sm font-medium text-gray-700">Show tagline</span>
            </label>
          </div>
        </ResponsiveCard>
      )}

      {/* Color Configuration */}
      <ResponsiveCard>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Color Configuration</h3>
        
        {/* Color Presets */}
        <div className="mb-6">
          <p className="text-sm font-medium text-gray-700 mb-3">Color Presets</p>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
            {colorPresets.map((preset) => (
              <div
                key={preset.name}
                onClick={() => {
                  handleConfigChange('primaryColor', preset.primary);
                  handleConfigChange('secondaryColor', preset.secondary);
                }}
                className="flex items-center space-x-2 p-2 border rounded-lg cursor-pointer hover:border-gray-400"
              >
                <div className="flex space-x-1">
                  <div 
                    className="w-4 h-4 rounded"
                    style={{ backgroundColor: preset.primary }}
                  />
                  <div 
                    className="w-4 h-4 rounded"
                    style={{ backgroundColor: preset.secondary }}
                  />
                </div>
                <span className="text-xs text-gray-600">{preset.name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Custom Colors */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Primary Color
            </label>
            <div className="flex items-center space-x-2">
              <input
                type="color"
                value={logoConfig.primaryColor}
                onChange={(e) => handleConfigChange('primaryColor', e.target.value)}
                className="w-12 h-12 border border-gray-300 rounded cursor-pointer"
              />
              <input
                type="text"
                value={logoConfig.primaryColor}
                onChange={(e) => handleConfigChange('primaryColor', e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="#3b82f6"
              />
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Secondary Color
            </label>
            <div className="flex items-center space-x-2">
              <input
                type="color"
                value={logoConfig.secondaryColor}
                onChange={(e) => handleConfigChange('secondaryColor', e.target.value)}
                className="w-12 h-12 border border-gray-300 rounded cursor-pointer"
              />
              <input
                type="text"
                value={logoConfig.secondaryColor}
                onChange={(e) => handleConfigChange('secondaryColor', e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="#10b981"
              />
            </div>
          </div>
        </div>
      </ResponsiveCard>

      {/* Icon Configuration (for default/logo types) */}
      {(logoConfig.type === 'default' || logoConfig.type === 'icon') && (
        <ResponsiveCard>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Icon Configuration</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {iconTypes.map((icon) => (
              <div
                key={icon.value}
                onClick={() => handleConfigChange('iconType', icon.value)}
                className={`flex items-center space-x-3 p-3 border-2 rounded-lg cursor-pointer transition-all hover:shadow-md ${
                  logoConfig.iconType === icon.value
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <icon.icon className="w-6 h-6 text-gray-600" />
                <span className="font-medium text-gray-900">{icon.label}</span>
              </div>
            ))}
          </div>
        </ResponsiveCard>
      )}

      {/* Action Buttons */}
      <ResponsiveCard>
        <div className="flex flex-col sm:flex-row justify-between items-center space-y-4 sm:space-y-0">
          <div className="flex space-x-2">
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Save Configuration
            </button>
            <button
              onClick={handleReset}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Reset to Default
            </button>
          </div>
          
          <div className="flex space-x-2">
            <button
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors flex items-center space-x-2"
            >
              <Download className="w-4 h-4" />
              <span>Export</span>
            </button>
            <button
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors flex items-center space-x-2"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Refresh</span>
            </button>
          </div>
        </div>
      </ResponsiveCard>
    </div>
  );
};

export default LogoSettings;
