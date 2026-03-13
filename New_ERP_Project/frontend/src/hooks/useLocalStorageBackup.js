import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';

const useLocalStorageBackup = (key, initialValue = null) => {
  const [storedValue, setStoredValue] = useState(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.error(`Error reading localStorage key "${key}":`, error);
      return initialValue;
    }
  });

  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [backupStatus, setBackupStatus] = useState('idle'); // 'idle', 'saving', 'saved', 'error'

  // Monitor online status
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      // Attempt to sync when coming back online
      syncWithServer();
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Save to localStorage
  const saveToLocalStorage = useCallback((value) => {
    try {
      setBackupStatus('saving');
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      const backupData = {
        value: valueToStore,
        timestamp: new Date().toISOString(),
        isBackup: true
      };
      
      window.localStorage.setItem(key, JSON.stringify(backupData));
      setStoredValue(valueToStore);
      setBackupStatus('saved');
      
      // Clear status after a delay
      setTimeout(() => setBackupStatus('idle'), 2000);
      
      return true;
    } catch (error) {
      console.error(`Error setting localStorage key "${key}":`, error);
      setBackupStatus('error');
      toast.error('Failed to save data locally');
      return false;
    }
  }, [key, storedValue]);

  // Sync with server (placeholder for actual implementation)
  const syncWithServer = useCallback(async () => {
    try {
      const backupData = localStorage.getItem(key);
      if (backupData) {
        const { value, timestamp, isBackup } = JSON.parse(backupData);
        
        if (isBackup && timestamp) {
          // Here you would normally send the data to your server
          console.log('Syncing backup data with server:', { value, timestamp });
          
          // Simulate server sync
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          // Clear backup after successful sync
          const cleanData = {
            value,
            timestamp: new Date().toISOString(),
            isBackup: false
          };
          localStorage.setItem(key, JSON.stringify(cleanData));
          
          toast.success('Data synced with server');
        }
      }
    } catch (error) {
      console.error('Error syncing with server:', error);
      toast.error('Failed to sync data with server');
    }
  }, [key]);

  // Restore from backup
  const restoreFromBackup = useCallback(() => {
    try {
      const backupData = localStorage.getItem(key);
      if (backupData) {
        const { value, timestamp, isBackup } = JSON.parse(backupData);
        
        if (isBackup && timestamp) {
          const timeDiff = Date.now() - new Date(timestamp).getTime();
          const hoursDiff = timeDiff / (1000 * 60 * 60);
          
          // Only restore if backup is less than 24 hours old
          if (hoursDiff < 24) {
            setStoredValue(value);
            toast.success('Data restored from local backup');
            return true;
          } else {
            // Clear old backup
            localStorage.removeItem(key);
            toast.info('Old backup cleared');
            return false;
          }
        }
      }
      return false;
    } catch (error) {
      console.error('Error restoring from backup:', error);
      toast.error('Failed to restore data from backup');
      return false;
    }
  }, [key]);

  // Clear backup
  const clearBackup = useCallback(() => {
    try {
      localStorage.removeItem(key);
      setStoredValue(initialValue);
      setBackupStatus('idle');
      toast.success('Backup cleared');
      return true;
    } catch (error) {
      console.error(`Error clearing localStorage key "${key}":`, error);
      toast.error('Failed to clear backup');
      return false;
    }
  }, [key, initialValue]);

  // Get backup info
  const getBackupInfo = useCallback(() => {
    try {
      const backupData = localStorage.getItem(key);
      if (backupData) {
        const { timestamp, isBackup } = JSON.parse(backupData);
        return {
          hasBackup: true,
          timestamp,
          isBackup,
          age: timestamp ? Date.now() - new Date(timestamp).getTime() : null
        };
      }
      return { hasBackup: false };
    } catch (error) {
      console.error('Error getting backup info:', error);
      return { hasBackup: false };
    }
  }, [key]);

  // Auto-save when value changes
  const setValue = useCallback((value) => {
    saveToLocalStorage(value);
  }, [saveToLocalStorage]);

  // Auto-sync when coming online
  useEffect(() => {
    if (isOnline) {
      const timer = setTimeout(() => {
        syncWithServer();
      }, 1000);
      
      return () => clearTimeout(timer);
    }
  }, [isOnline, syncWithServer]);

  return {
    value: storedValue,
    setValue,
    isOnline,
    backupStatus,
    saveToLocalStorage,
    restoreFromBackup,
    clearBackup,
    syncWithServer,
    getBackupInfo,
    hasBackup: getBackupInfo().hasBackup
  };
};

// Hook for form data backup
export const useFormBackup = (formKey, initialData = {}) => {
  const [formData, setFormData] = useLocalStorageBackup(`form_backup_${formKey}`, initialData);
  const [isDirty, setIsDirty] = useState(false);

  const updateField = useCallback((field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
    setIsDirty(true);
  }, [setFormData]);

  const updateMultipleFields = useCallback((updates) => {
    setFormData(prev => ({
      ...prev,
      ...updates
    }));
    setIsDirty(true);
  }, [setFormData]);

  const resetForm = useCallback(() => {
    setFormData(initialData);
    setIsDirty(false);
  }, [setFormData, initialData]);

  const clearForm = useCallback(() => {
    setFormData({});
    setIsDirty(false);
  }, [setFormData]);

  // Auto-save form data periodically
  useEffect(() => {
    if (isDirty) {
      const timer = setTimeout(() => {
        setFormData(formData);
        setIsDirty(false);
      }, 2000); // Auto-save after 2 seconds of inactivity

      return () => clearTimeout(timer);
    }
  }, [formData, isDirty, setFormData]);

  return {
    formData,
    updateField,
    updateMultipleFields,
    resetForm,
    clearForm,
    isDirty,
    setIsDirty
  };
};

// Hook for draft backup (for long-form content)
export const useDraftBackup = (draftKey, initialContent = '') => {
  const [content, setContent] = useLocalStorageBackup(`draft_${draftKey}`, initialContent);
  const [lastSaved, setLastSaved] = useState(null);

  const saveDraft = useCallback((newContent) => {
    setContent(newContent);
    setLastSaved(new Date());
  }, [setContent]);

  const clearDraft = useCallback(() => {
    setContent('');
    setLastSaved(null);
  }, [setContent]);

  // Auto-save draft periodically
  useEffect(() => {
    const timer = setInterval(() => {
      if (content && content !== initialContent) {
        setContent(content);
        setLastSaved(new Date());
      }
    }, 30000); // Auto-save every 30 seconds

    return () => clearInterval(timer);
  }, [content, initialContent, setContent]);

  return {
    content,
    setContent: saveDraft,
    clearDraft,
    lastSaved
  };
};

export default useLocalStorageBackup;
