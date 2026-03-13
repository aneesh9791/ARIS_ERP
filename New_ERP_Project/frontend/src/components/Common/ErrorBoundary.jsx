import React from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import '../styles/theme.css';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { 
      hasError: false, 
      error: null, 
      errorInfo: null,
      errorId: null
    };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    // Log error to console
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    
    // Generate unique error ID
    const errorId = `ERR-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Save error details
    this.setState({
      error: error,
      errorInfo: errorInfo,
      errorId: errorId
    });

    // Log to service (in production)
    if (process.env.NODE_ENV === 'production') {
      this.logErrorToService(error, errorInfo, errorId);
    }

    // Save to localStorage for debugging
    try {
      localStorage.setItem('lastError', JSON.stringify({
        errorId,
        error: error.message,
        stack: error.stack,
        componentStack: errorInfo.componentStack,
        timestamp: new Date().toISOString(),
        url: window.location.href,
        userAgent: navigator.userAgent
      }));
    } catch (e) {
      console.error('Failed to save error to localStorage:', e);
    }
  }

  logErrorToService = (error, errorInfo, errorId) => {
    // In production, send error to logging service
    try {
      fetch('/api/errors/log', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          errorId,
          message: error.message,
          stack: error.stack,
          componentStack: errorInfo.componentStack,
          timestamp: new Date().toISOString(),
          url: window.location.href,
          userAgent: navigator.userAgent,
          userId: localStorage.getItem('userId') || 'anonymous'
        })
      }).catch(e => {
        console.error('Failed to log error to service:', e);
      });
    } catch (e) {
      console.error('Error logging failed:', e);
    }
  };

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null, errorId: null });
  };

  handleGoHome = () => {
    window.location.href = '/dashboard';
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      const isDevelopment = process.env.NODE_ENV === 'development';
      
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
          <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-6">
            {/* Error Icon */}
            <div className="flex items-center justify-center w-16 h-16 bg-red-100 rounded-full mx-auto mb-4">
              <AlertTriangle className="w-8 h-8 text-red-600" />
            </div>

            {/* Error Title */}
            <h2 className="text-xl font-bold text-center text-gray-900 mb-2">
              Something went wrong
            </h2>

            {/* Error Message */}
            <p className="text-gray-600 text-center mb-6">
              We're sorry, but something unexpected happened. 
              Our team has been notified and is working on a fix.
            </p>

            {/* Error ID (for support) */}
            {this.state.errorId && (
              <div className="bg-gray-100 rounded-lg p-3 mb-6">
                <p className="text-sm text-gray-600">
                  <span className="font-semibold">Error ID:</span> {this.state.errorId}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Please reference this ID if you contact support
                </p>
              </div>
            )}

            {/* Action Buttons */}
            <div className="space-y-3">
              <button
                onClick={this.handleRetry}
                className="w-full flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Try Again
              </button>
              
              <button
                onClick={this.handleGoHome}
                className="w-full flex items-center justify-center px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
              >
                <Home className="w-4 h-4 mr-2" />
                Go to Dashboard
              </button>
              
              <button
                onClick={this.handleReload}
                className="w-full px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm"
              >
                Reload Page
              </button>
            </div>

            {/* Development Details */}
            {isDevelopment && this.state.error && (
              <details className="mt-6">
                <summary className="cursor-pointer text-sm font-medium text-gray-700 hover:text-gray-900">
                  Error Details (Development Only)
                </summary>
                <div className="mt-3 p-3 bg-red-50 rounded-lg text-xs">
                  <div className="mb-2">
                    <strong>Error:</strong>
                    <pre className="mt-1 text-red-700 overflow-x-auto whitespace-pre-wrap">
                      {this.state.error.toString()}
                    </pre>
                  </div>
                  
                  {this.state.errorInfo && (
                    <div className="mb-2">
                      <strong>Component Stack:</strong>
                      <pre className="mt-1 text-red-700 overflow-x-auto whitespace-pre-wrap">
                        {this.state.errorInfo.componentStack}
                      </pre>
                    </div>
                  )}
                  
                  {this.state.error.stack && (
                    <div>
                      <strong>Stack Trace:</strong>
                      <pre className="mt-1 text-red-700 overflow-x-auto whitespace-pre-wrap">
                        {this.state.error.stack}
                      </pre>
                    </div>
                  )}
                </div>
              </details>
            )}

            {/* Support Information */}
            <div className="mt-6 pt-6 border-t border-gray-200">
              <p className="text-xs text-gray-500 text-center">
                If this problem persists, please contact our support team
              </p>
              <div className="flex justify-center space-x-4 mt-2">
                <a href="mailto:support@aris.com" className="text-xs text-blue-600 hover:text-blue-800">
                  Email Support
                </a>
                <a href="tel:+1234567890" className="text-xs text-blue-600 hover:text-blue-800">
                  Call Support
                </a>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
