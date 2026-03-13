import React from 'react';
import { Loader2 } from 'lucide-react';
import '../styles/theme.css';

const LoadingSpinner = ({ 
  size = 'medium', 
  text = 'Loading...', 
  fullScreen = false,
  className = ''
}) => {
  const getSizeClasses = () => {
    switch (size) {
      case 'small':
        return 'w-4 h-4';
      case 'medium':
        return 'w-8 h-8';
      case 'large':
        return 'w-12 h-12';
      case 'xlarge':
        return 'w-16 h-16';
      default:
        return 'w-8 h-8';
    }
  };

  const getTextSizeClasses = () => {
    switch (size) {
      case 'small':
        return 'text-sm';
      case 'medium':
        return 'text-base';
      case 'large':
        return 'text-lg';
      case 'xlarge':
        return 'text-xl';
      default:
        return 'text-base';
    }
  };

  const spinnerContent = (
    <div className={`flex items-center justify-center ${className}`}>
      <div className="flex flex-col items-center space-y-3">
        {/* Spinner Icon */}
        <div className="relative">
          <Loader2 className={`${getSizeClasses()} text-blue-600 animate-spin`} />
          {/* Optional: Add a subtle pulse effect */}
          <div className={`absolute inset-0 ${getSizeClasses()} bg-blue-200 rounded-full animate-ping opacity-20`}></div>
        </div>
        
        {/* Loading Text */}
        {text && (
          <p className={`${getTextSizeClasses()} text-gray-600 font-medium animate-pulse`}>
            {text}
          </p>
        )}
        
        {/* Optional: Progress indicator */}
        <div className="w-full max-w-xs">
          <div className="h-1 bg-gray-200 rounded-full overflow-hidden">
            <div className="h-full bg-blue-600 rounded-full animate-pulse" style={{ width: '60%' }}></div>
          </div>
        </div>
      </div>
    </div>
  );

  if (fullScreen) {
    return (
      <div className="fixed inset-0 bg-white bg-opacity-90 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-sm w-full mx-4">
          {spinnerContent}
        </div>
      </div>
    );
  }

  return spinnerContent;
};

// Specialized loading components
export const PageLoading = () => (
  <LoadingSpinner 
    size="large" 
    text="Loading page..." 
    fullScreen={true} 
  />
);

export const ButtonLoading = ({ text = 'Processing...' }) => (
  <div className="flex items-center justify-center space-x-2">
    <LoadingSpinner size="small" className="text-white" />
    <span className="text-white">{text}</span>
  </div>
);

export const TableLoading = ({ colSpan = 1 }) => (
  <tr>
    <td colSpan={colSpan} className="py-8">
      <LoadingSpinner size="medium" text="Loading data..." />
    </td>
  </tr>
);

export const CardLoading = () => (
  <div className="bg-white rounded-lg shadow-sm p-6 animate-pulse">
    <div className="space-y-4">
      <div className="h-4 bg-gray-200 rounded w-3/4"></div>
      <div className="h-4 bg-gray-200 rounded w-1/2"></div>
      <div className="h-4 bg-gray-200 rounded w-2/3"></div>
    </div>
  </div>
);

export const FormLoading = () => (
  <div className="space-y-4">
    <div className="animate-pulse">
      <div className="h-4 bg-gray-200 rounded w-1/4 mb-2"></div>
      <div className="h-10 bg-gray-200 rounded"></div>
    </div>
    <div className="animate-pulse">
      <div className="h-4 bg-gray-200 rounded w-1/3 mb-2"></div>
      <div className="h-10 bg-gray-200 rounded"></div>
    </div>
    <div className="animate-pulse">
      <div className="h-4 bg-gray-200 rounded w-1/5 mb-2"></div>
      <div className="h-24 bg-gray-200 rounded"></div>
    </div>
  </div>
);

// Skeleton loading components
export const SkeletonLoader = ({ lines = 3, className = '' }) => (
  <div className={`space-y-2 ${className}`}>
    {Array.from({ length: lines }).map((_, index) => (
      <div key={index} className="animate-pulse">
        <div 
          className="h-4 bg-gray-200 rounded"
          style={{ width: `${Math.random() * 40 + 60}%` }}
        ></div>
      </div>
    ))}
  </div>
);

export const AvatarLoader = ({ size = 'medium' }) => {
  const getSizeClasses = () => {
    switch (size) {
      case 'small':
        return 'w-8 h-8';
      case 'medium':
        return 'w-10 h-10';
      case 'large':
        return 'w-12 h-12';
      default:
        return 'w-10 h-10';
    }
  };

  return (
    <div className={`${getSizeClasses()} bg-gray-200 rounded-full animate-pulse`}></div>
  );
};

export const ImageLoader = ({ width = '100%', height = '200px' }) => (
  <div 
    className="bg-gray-200 rounded-lg animate-pulse flex items-center justify-center"
    style={{ width, height }}
  >
    <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
  </div>
);

// Contextual loading states
export const SearchLoading = () => (
  <div className="flex items-center space-x-2 px-3 py-2">
    <LoadingSpinner size="small" />
    <span className="text-sm text-gray-600">Searching...</span>
  </div>
);

export const UploadLoading = ({ progress = 0 }) => (
  <div className="space-y-2">
    <div className="flex items-center justify-between">
      <span className="text-sm text-gray-600">Uploading...</span>
      <span className="text-sm text-gray-600">{progress}%</span>
    </div>
    <div className="w-full bg-gray-200 rounded-full h-2">
      <div 
        className="bg-blue-600 h-2 rounded-full transition-all duration-300"
        style={{ width: `${progress}%` }}
      ></div>
    </div>
  </div>
);

export const ChartLoading = () => (
  <div className="h-64 bg-gray-100 rounded-lg flex items-center justify-center">
    <div className="text-center">
      <LoadingSpinner size="large" />
      <p className="text-gray-600 mt-2">Loading chart data...</p>
    </div>
  </div>
);

// Error state with retry
export const LoadingWithError = ({ 
  error = null, 
  onRetry = null, 
  text = 'Loading...' 
}) => {
  if (error) {
    return (
      <div className="text-center py-8">
        <div className="text-red-500 mb-4">
          <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <p className="text-gray-600 mb-4">Failed to load</p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Retry
          </button>
        )}
      </div>
    );
  }

  return <LoadingSpinner text={text} />;
};

export default LoadingSpinner;
