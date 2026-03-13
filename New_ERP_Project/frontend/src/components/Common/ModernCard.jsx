import React, { useState } from 'react';
import { ChevronDown, ChevronUp, MoreHorizontal, Edit, Trash2, Eye, Download, Share2 } from 'lucide-react';
import '../styles/theme.css';

const ModernCard = ({
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
  elevated = false
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [showActions, setShowActions] = useState(false);

  const toggleExpanded = () => {
    setIsExpanded(!isExpanded);
  };

  const getCardClasses = () => {
    let classes = 'bg-white rounded-xl border border-gray-200 transition-all duration-300';
    
    if (hover) classes += ' hover:shadow-md hover:border-blue-300';
    if (elevated) classes += ' shadow-lg';
    if (gradient) classes += ' bg-gradient-to-br from-blue-50 to-indigo-50';
    if (loading) classes += ' opacity-50 pointer-events-none';
    if (error) classes += ' border-red-300 bg-red-50';
    
    return classes + ' ' + className;
  };

  const getHeaderClasses = () => {
    let classes = 'flex items-center justify-between p-6 border-b border-gray-200';
    
    if (gradient) classes += ' border-blue-200';
    if (collapsible) classes += ' cursor-pointer hover:bg-gray-50';
    
    return classes;
  };

  const getActionIcon = (action) => {
    const icons = {
      edit: Edit,
      delete: Trash2,
      view: Eye,
      download: Download,
      share: Share2
    };
    return icons[action.type] || MoreHorizontal;
  };

  const getActionColor = (action) => {
    const colors = {
      edit: 'text-blue-600 hover:bg-blue-50',
      delete: 'text-red-600 hover:bg-red-50',
      view: 'text-green-600 hover:bg-green-50',
      download: 'text-purple-600 hover:bg-purple-50',
      share: 'text-indigo-600 hover:bg-indigo-50'
    };
    return colors[action.type] || 'text-gray-600 hover:bg-gray-50';
  };

  return (
    <div className={getCardClasses()}>
      {/* Header */}
      {(title || actions.length > 0 || badge) && (
        <div className={getHeaderClasses()} onClick={collapsible ? toggleExpanded : undefined}>
          <div className="flex items-center space-x-3">
            <div className="flex-1">
              {title && (
                <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
              )}
              {subtitle && (
                <p className="text-sm text-gray-500 mt-1">{subtitle}</p>
              )}
              {badge && (
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  badge.type === 'success' ? 'bg-green-100 text-green-800' :
                  badge.type === 'warning' ? 'bg-yellow-100 text-yellow-800' :
                  badge.type === 'error' ? 'bg-red-100 text-red-800' :
                  badge.type === 'info' ? 'bg-blue-100 text-blue-800' :
                  'bg-gray-100 text-gray-800'
                }`}>
                  {badge.text}
                </span>
              )}
            </div>
            
            <div className="flex items-center space-x-2">
              {actions.length > 0 && (
                <div className="relative">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowActions(!showActions);
                    }}
                    className="p-1 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100 transition-colors"
                  >
                    <MoreHorizontal className="w-5 h-5" />
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
                            {action.label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
              
              {collapsible && (
                <button className="p-1 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100 transition-colors">
                  {isExpanded ? (
                    <ChevronUp className="w-5 h-5" />
                  ) : (
                    <ChevronDown className="w-5 h-5" />
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      {(!collapsible || isExpanded) && (
        <div className="p-6">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          )}
          
          {error && (
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
          )}
          
          {!loading && !error && children}
        </div>
      )}

      {/* Footer */}
      {footer && (!collapsible || isExpanded) && (
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 rounded-b-xl">
          {footer}
        </div>
      )}
    </div>
  );
};

export default ModernCard;
