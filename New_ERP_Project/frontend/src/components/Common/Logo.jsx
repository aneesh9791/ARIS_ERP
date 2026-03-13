import React, { useState, useEffect } from 'react';
import { Building, Heart, Activity } from 'lucide-react';
import '../styles/theme.css';

const Logo = ({ size = 'medium', variant = 'default', className = '' }) => {
  const [logoConfig, setLogoConfig] = useState({
    type: 'default', // 'default', 'custom', 'text'
    customLogo: null,
    companyName: 'ARIS Healthcare',
    tagline: 'Advanced ERP Solutions',
    primaryColor: '#3b82f6',
    secondaryColor: '#10b981',
    showTagline: true
  });

  useEffect(() => {
    // Load logo configuration from localStorage or API
    const savedConfig = localStorage.getItem('logoConfig');
    if (savedConfig) {
      setLogoConfig(JSON.parse(savedConfig));
    }
  }, []);

  const getSizeClasses = () => {
    switch (size) {
      case 'small':
        return 'w-8 h-8';
      case 'medium':
        return 'w-10 h-10';
      case 'large':
        return 'w-12 h-12';
      case 'xlarge':
        return 'w-16 h-16';
      default:
        return 'w-10 h-10';
    }
  };

  const getTextSizeClasses = () => {
    switch (size) {
      case 'small':
        return 'text-lg';
      case 'medium':
        return 'text-xl';
      case 'large':
        return 'text-2xl';
      case 'xlarge':
        return 'text-3xl';
      default:
        return 'text-xl';
    }
  };

  const renderDefaultLogo = () => (
    <div className={`flex items-center justify-center ${getSizeClasses()} ${className}`}>
      <div className="relative">
        {/* Main Logo Circle */}
        <div 
          className="absolute inset-0 rounded-full flex items-center justify-center"
          style={{ backgroundColor: logoConfig.primaryColor }}
        >
          <Building className="w-1/2 h-1/2 text-white" />
        </div>
        
        {/* Accent Circle */}
        <div 
          className="absolute -bottom-1 -right-1 w-1/3 h-1/3 rounded-full flex items-center justify-center"
          style={{ backgroundColor: logoConfig.secondaryColor }}
        >
          <Heart className="w-1/2 h-1/2 text-white" />
        </div>
      </div>
    </div>
  );

  const renderTextLogo = () => (
    <div className={`flex items-center space-x-2 ${className}`}>
      <div className={`flex items-center justify-center ${getSizeClasses()}`}>
        <div 
          className="w-full h-full rounded-lg flex items-center justify-center font-bold text-white"
          style={{ backgroundColor: logoConfig.primaryColor }}
        >
          <span className={getTextSizeClasses()}>ARIS</span>
        </div>
      </div>
      {size !== 'small' && (
        <div className="flex flex-col">
          <span 
            className={`font-bold ${getTextSizeClasses()}`}
            style={{ color: logoConfig.primaryColor }}
          >
            {logoConfig.companyName.split(' ')[0]}
          </span>
          {logoConfig.showTagline && size !== 'small' && (
            <span className="text-xs text-gray-500">
              {logoConfig.tagline}
            </span>
          )}
        </div>
      )}
    </div>
  );

  const renderCustomLogo = () => {
    if (logoConfig.customLogo) {
      return (
        <img 
          src={logoConfig.customLogo} 
          alt={logoConfig.companyName}
          className={`${getSizeClasses()} ${className} object-contain`}
        />
      );
    }
    return renderDefaultLogo();
  };

  const renderIconLogo = () => (
    <div className={`flex items-center space-x-2 ${className}`}>
      <div className={`flex items-center justify-center ${getSizeClasses()}`}>
        <div className="relative">
          <Activity 
            className="w-full h-full"
            style={{ color: logoConfig.primaryColor }}
          />
          <div 
            className="absolute -bottom-1 -right-1 w-1/4 h-1/4 rounded-full"
            style={{ backgroundColor: logoConfig.secondaryColor }}
          />
        </div>
      </div>
      {size !== 'small' && (
        <div className="flex flex-col">
          <span 
            className={`font-bold ${getTextSizeClasses()}`}
            style={{ color: logoConfig.primaryColor }}
          >
            ARIS
          </span>
          {logoConfig.showTagline && size !== 'small' && (
            <span className="text-xs text-gray-500">
              Healthcare ERP
            </span>
          )}
        </div>
      )}
    </div>
  );

  const renderLogo = () => {
    switch (logoConfig.type) {
      case 'text':
        return renderTextLogo();
      case 'custom':
        return renderCustomLogo();
      case 'icon':
        return renderIconLogo();
      default:
        return renderDefaultLogo();
    }
  };

  return renderLogo();
};

export default Logo;
