import React, { useState } from 'react';
import { ChevronDown, ChevronUp, MoreHorizontal, Edit, Trash2, Eye, Download, Share2, Maximize2, Minimize2 } from 'lucide-react';
import '../../styles/theme.css';
import '../../styles/responsive.css';

const ResponsiveCard = ({
  title,
  subtitle,
  children,
  className = '',
  hover = true,
  collapsible = false,
  defaultExpanded = true,
  actions = [],
  badge = null,
  loading = false,
  error = null,
  footer = null,
  gradient = false,
  elevated = false,
  responsive = true,
  compact = false,
  size = 'medium', // small, medium, large
  variant = 'default' // default, outlined, elevated
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [showActions, setShowActions] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const toggleExpanded = () => {
    setIsExpanded(!isExpanded);
  };

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  const getCardClasses = () => {
    let classes = 'bg-white rounded-xl border transition-all duration-300';
    
    // Base styling
    if (variant === 'outlined') {
      classes += ' border-2 border-gray-300';
    } else if (variant === 'elevated') {
      classes += ' border-gray-200 shadow-lg';
    } else {
      classes += ' border-gray-200 shadow-sm';
    }
    
    // Hover effects
    if (hover && !isFullscreen) {
      classes += ' hover:shadow-md hover:border-blue-300';
    }
    
    // Gradient background
    if (gradient) {
      classes += ' bg-gradient-to-br from-blue-50 to-indigo-50';
    }
    
    // Loading state
    if (loading) {
      classes += ' opacity-50 pointer-events-none';
    }
    
    // Error state
    if (error) {
      classes += ' border-red-300 bg-red-50';
    }
    
    // Fullscreen mode
    if (isFullscreen) {
      classes += ' fixed inset-4 z-50 overflow-auto';
    }
    
    // Size variations
    if (size === 'small') {
      classes += ' p-3';
    } else if (size === 'large') {
      classes += ' p-6';
    } else {
      classes += ' p-4';
    }
    
    // Compact mode
    if (compact) {
      classes += ' p-3';
    }
    
    // Responsive adjustments
    if (responsive) {
      classes += ' xs:p-3 sm:p-4 md:p-5 lg:p-6';
    }
    
    return classes + ' ' + className;
  };

  const getHeaderClasses = () => {
    let classes = 'flex items-center justify-between';
    
    if (size === 'small') {
      classes += ' pb-2';
    } else if (size === 'large') {
      classes += ' pb-4';
    } else {
      classes += ' pb-3';
    }
    
    if (collapsible) {
      classes += ' cursor-pointer hover:bg-gray-50 rounded-t-xl';
    }
    
    if (gradient) {
      classes += ' border-b border-blue-200';
    } else {
      classes += ' border-b border-gray-200';
    }
    
    // Responsive header
    if (responsive) {
      classes += ' xs:pb-2 sm:pb-3 md:pb-4';
    }
    
    return classes;
  };

  const getTitleClasses = () => {
    let classes = 'font-semibold text-gray-900';
    
    if (size === 'small') {
      classes += ' text-sm';
    } else if (size === 'large') {
      classes += ' text-xl';
    } else {
      classes += ' text-lg';
    }
    
    // Responsive title
    if (responsive) {
      classes += ' xs:text-sm sm:text-base md:text-lg lg:text-xl';
    }
    
    return classes;
  };

  const getSubtitleClasses = () => {
    let classes = 'text-gray-500';
    
    if (size === 'small') {
      classes += ' text-xs';
    } else if (size === 'large') {
      classes += ' text-base';
    } else {
      classes += ' text-sm';
    }
    
    // Responsive subtitle
    if (responsive) {
      classes += ' xs:text-xs sm:text-sm md:text-base';
    }
    
    return classes;
  };

  const getActionIcon = (action) => {
    const icons = {
      edit: Edit,
      delete: Trash2,
      view: Eye,
      download: Download,
      share: Share2,
      fullscreen: Maximize2,
      minimize: Minimize2
    };
    return icons[action.type] || MoreHorizontal;
  };

  const getActionColor = (action) => {
    const colors = {
      edit: 'text-blue-600 hover:bg-blue-50',
      delete: 'text-red-600 hover:bg-red-50',
      view: 'text-green-600 hover:bg-green-50',
      download: 'text-purple-600 hover:bg-purple-50',
      share: 'text-indigo-600 hover:bg-indigo-50',
      fullscreen: 'text-gray-600 hover:bg-gray-50',
      minimize: 'text-gray-600 hover:bg-gray-50'
    };
    return colors[action.type] || 'text-gray-600 hover:bg-gray-50';
  };

  const getBadgeClasses = () => {
    let classes = 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium';
    
    if (badge?.type === 'success') {
      classes += ' bg-green-100 text-green-800';
    } else if (badge?.type === 'warning') {
      classes += ' bg-yellow-100 text-yellow-800';
    } else if (badge?.type === 'error') {
      classes += ' bg-red-100 text-red-800';
    } else if (badge?.type === 'info') {
      classes += ' bg-blue-100 text-blue-800';
    } else {
      classes += ' bg-gray-100 text-gray-800';
    }
    
    return classes;
  };

  const getActionClasses = () => {
    let classes = 'w-8 h-8 rounded-lg flex items-center justify-center transition-colors';
    
    if (size === 'small') {
      classes += ' w-6 h-6';
    } else if (size === 'large') {
      classes += ' w-10 h-10';
    }
    
    // Responsive actions
    if (responsive) {
      classes += ' xs:w-6 xs:h-6 sm:w-8 sm:h-8 md:w-10 md:h-10';
    }
    
    return classes;
  };

  const renderHeader = () => {
    return (
      <div className={getHeaderClasses()} onClick={collapsible ? toggleExpanded : undefined}>
        <div className="flex items-center space-x-3 flex-1 min-w-0">
          <div className="flex-1 min-w-0">
            {title && (
              <h3 className={getTitleClasses()}>
                <span className="truncate">{title}</span>
              </h3>
            )}
            {subtitle && (
              <p className={getSubtitleClasses()}>
                <span className="truncate">{subtitle}</span>
              </p>
            )}
            {badge && (
              <span className={getBadgeClasses()}>
                {badge.text}
              </span>
            )}
          </div>
        </div>
        
        <div className="flex items-center space-x-1 sm:space-x-2">
          {/* Actions dropdown */}
          {actions.length > 0 && (
            <div className="relative">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowActions(!showActions);
                }}
                className={getActionClasses()}
              >
                <MoreHorizontal className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
              
              {showActions && (
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 z-10">
                  {actions.map((action, index) => {
                    const Icon = getActionIcon(action);
                    return (
                      <button
                        key={index}
                        onClick={(e) => {
                          e.stopPropagation();
                          action.onClick?.();
                          setShowActions(false);
                        }}
                        className={`w-full flex items-center px-3 py-2 text-sm transition-colors ${getActionColor(action)}`}
                      >
                        <Icon className="w-4 h-4 mr-2" />
                        <span className="truncate">{action.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
          
          {/* Fullscreen toggle */}
          {!isFullscreen && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleFullscreen();
              }}
              className={getActionClasses()}
            >
              <Maximize2 className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          )}
          
          {/* Collapse toggle */}
          {collapsible && (
            <button className={getActionClasses()}>
              {isExpanded ? (
                <ChevronUp className="w-4 h-4 sm:w-5 sm:h-5" />
              ) : (
                <ChevronDown className="w-4 h-4 sm:w-5 sm:h-5" />
              )}
            </button>
          )}
        </div>
      </div>
    );
  };

  const renderContent = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-600">Loading...</span>
        </div>
      );
    }
    
    if (error) {
      return (
        <div className="flex items-center justify-center py-8">
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
    
    return children;
  };

  const renderFooter = () => {
    if (!footer) return null;
    
    return (
      <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 rounded-b-xl">
        {footer}
      </div>
    );
  };

  const renderFullscreenCard = () => {
    return (
      <div className={getCardClasses()}>
        {/* Fullscreen header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <button
            onClick={toggleFullscreen}
            className="p-2 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <Minimize2 className="w-5 h-5" />
          </button>
        </div>
        
        {/* Fullscreen content */}
        <div className="p-4">
          {renderContent()}
        </div>
      </div>
    );
  };

  if (isFullscreen) {
    return (
      <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center p-4">
        {renderFullscreenCard()}
      </div>
    );
  }

  return (
    <div className={getCardClasses()}>
      {/* Header */}
      {(title || actions.length > 0 || badge || collapsible) && renderHeader()}

      {/* Content */}
      {(!collapsible || isExpanded) && (
        <div className={size === 'small' ? '' : 'p-4'}>
          {renderContent()}
        </div>
      )}

      {/* Footer */}
      {footer && (!collapsible || isExpanded) && renderFooter()}
    </div>
  );
};

export default ResponsiveCard;
