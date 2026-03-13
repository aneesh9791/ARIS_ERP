import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import toast from 'react-hot-toast';

// Custom hook for API calls with loading and error handling
export const useApi = () => {
  const queryClient = useQueryClient();

  // Generic GET hook
  const useGet = (key, fetcher, options = {}) => {
    return useQuery({
      queryKey: Array.isArray(key) ? key : [key],
      queryFn: fetcher,
      staleTime: 5 * 60 * 1000, // 5 minutes
      cacheTime: 10 * 60 * 1000, // 10 minutes
      retry: 1,
      ...options,
    });
  };

  // Generic POST hook
  const usePost = (key, fetcher, options = {}) => {
    return useMutation({
      mutationFn: fetcher,
      onSuccess: (data, variables, context) => {
        toast.success('Operation completed successfully');
        if (options.invalidateQuery) {
          queryClient.invalidateQueries(options.invalidateQuery);
        }
        if (options.onSuccess) {
          options.onSuccess(data, variables, context);
        }
      },
      onError: (error, variables, context) => {
        toast.error(error.response?.data?.error || 'Operation failed');
        if (options.onError) {
          options.onError(error, variables, context);
        }
      },
      ...options,
    });
  };

  // Generic PUT hook
  const usePut = (key, fetcher, options = {}) => {
    return useMutation({
      mutationFn: fetcher,
      onSuccess: (data, variables, context) => {
        toast.success('Update completed successfully');
        if (options.invalidateQuery) {
          queryClient.invalidateQueries(options.invalidateQuery);
        }
        if (options.onSuccess) {
          options.onSuccess(data, variables, context);
        }
      },
      onError: (error, variables, context) => {
        toast.error(error.response?.data?.error || 'Update failed');
        if (options.onError) {
          options.onError(error, variables, context);
        }
      },
      ...options,
    });
  };

  // Generic DELETE hook
  const useDelete = (key, fetcher, options = {}) => {
    return useMutation({
      mutationFn: fetcher,
      onSuccess: (data, variables, context) => {
        toast.success('Delete completed successfully');
        if (options.invalidateQuery) {
          queryClient.invalidateQueries(options.invalidateQuery);
        }
        if (options.onSuccess) {
          options.onSuccess(data, variables, context);
        }
      },
      onError: (error, variables, context) => {
        toast.error(error.response?.data?.error || 'Delete failed');
        if (options.onError) {
          options.onError(error, variables, context);
        }
      },
      ...options,
    });
  };

  return { useGet, usePost, usePut, useDelete };
};

// Specific hooks for different entities
export const useAuth = () => {
  const queryClient = useQueryClient();

  const loginMutation = useMutation({
    mutationFn: api.auth.login,
    onSuccess: (data) => {
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      toast.success('Login successful');
      queryClient.invalidateQueries('user');
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Login failed');
    },
  });

  const logoutMutation = useMutation({
    mutationFn: api.auth.logout,
    onSuccess: () => {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      toast.success('Logout successful');
      queryClient.clear();
      window.location.href = '/login';
    },
    onError: (error) => {
      toast.error('Logout failed');
    },
  });

  return {
    login: loginMutation.mutateAsync,
    logout: logoutMutation.mutateAsync,
    isLoading: loginMutation.isLoading || logoutMutation.isLoading,
  };
};

export const usePatients = () => {
  const { useGet, usePost, usePut, useDelete } = useApi();

  const patients = useGet('patients', () => api.patients.getAll());
  const createPatient = usePost('patients', api.patients.create, {
    invalidateQuery: 'patients',
  });
  const updatePatient = usePut('patients', (data) => api.patients.update(data.id, data), {
    invalidateQuery: 'patients',
  });
  const deletePatient = useDelete('patients', api.patients.delete, {
    invalidateQuery: 'patients',
  });

  return {
    patients,
    createPatient,
    updatePatient,
    deletePatient,
    isLoading: patients.isLoading,
    error: patients.error,
  };
};

export const useAppointments = () => {
  const { useGet, usePost, usePut, useDelete } = useApi();

  const appointments = useGet('appointments', () => api.appointments.getAll());
  const createAppointment = usePost('appointments', api.appointments.create, {
    invalidateQuery: 'appointments',
  });
  const updateAppointment = usePut('appointments', (data) => api.appointments.update(data.id, data), {
    invalidateQuery: 'appointments',
  });
  const deleteAppointment = useDelete('appointments', api.appointments.delete, {
    invalidateQuery: 'appointments',
  });

  return {
    appointments,
    createAppointment,
    updateAppointment,
    deleteAppointment,
    isLoading: appointments.isLoading,
    error: appointments.error,
  };
};

export const useBilling = () => {
  const { useGet, usePost, usePut, useDelete } = useApi();

  const bills = useGet('billing', () => api.billing.getAll());
  const createBill = usePost('billing', api.billing.create, {
    invalidateQuery: 'billing',
  });
  const updateBill = usePut('billing', (data) => api.billing.update(data.id, data), {
    invalidateQuery: 'billing',
  });
  const deleteBill = useDelete('billing', api.billing.delete, {
    invalidateQuery: 'billing',
  });

  return {
    bills,
    createBill,
    updateBill,
    deleteBill,
    isLoading: bills.isLoading,
    error: bills.error,
  };
};

export const useDashboard = () => {
  const stats = useGet('dashboard-stats', api.dashboard.getStats);
  const appointments = useGet('dashboard-appointments', () => api.dashboard.getAppointments());
  const revenue = useGet('dashboard-revenue', () => api.dashboard.getRevenue());
  const patients = useGet('dashboard-patients', () => api.dashboard.getPatients());

  return {
    stats,
    appointments,
    revenue,
    patients,
    isLoading: stats.isLoading || appointments.isLoading || revenue.isLoading || patients.isLoading,
  };
};

export const useSettings = () => {
  const { useGet, usePut } = useApi();

  const settings = useGet('settings', api.settings.getAll);
  const updateSettings = usePut('settings', api.settings.update);

  return {
    settings,
    updateSettings,
    isLoading: settings.isLoading,
  };
};

export const useLocalStorage = (key, initialValue) => {
  const [storedValue, setStoredValue] = useState(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.error(`Error reading localStorage key "${key}":`, error);
      return initialValue;
    }
  });

  const setValue = useCallback((value) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      setStoredValue(valueToStore);
      window.localStorage.setItem(key, JSON.stringify(valueToStore));
    } catch (error) {
      console.error(`Error setting localStorage key "${key}":`, error);
    }
  }, [key, storedValue]);

  return [storedValue, setValue];
};

export const useDebounce = (value, delay) => {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
};

export const usePagination = (initialPage = 1, initialLimit = 10) => {
  const [page, setPage] = useState(initialPage);
  const [limit, setLimit] = useState(initialLimit);

  const nextPage = () => setPage(prev => prev + 1);
  const prevPage = () => setPage(prev => Math.max(1, prev - 1));
  const goToPage = (pageNumber) => setPage(pageNumber);
  const resetPage = () => setPage(initialPage);

  return {
    page,
    limit,
    setPage,
    setLimit,
    nextPage,
    prevPage,
    goToPage,
    resetPage,
  };
};

export const useModal = (initialState = false) => {
  const [isOpen, setIsOpen] = useState(initialState);

  const open = () => setIsOpen(true);
  const close = () => setIsOpen(false);
  const toggle = () => setIsOpen(!isOpen);

  return {
    isOpen,
    open,
    close,
    toggle,
  };
};

export const useFileUpload = () => {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const uploadFile = async (file, onProgress) => {
    setUploading(true);
    setProgress(0);

    try {
      const formData = new FormData();
      formData.append('file', file);

      // Simulate upload progress
      const interval = setInterval(() => {
        setProgress(prev => {
          if (prev >= 90) {
            clearInterval(interval);
            return prev;
          }
          return prev + 10;
        });
      }, 100);

      // Here you would make the actual API call
      // const response = await api.upload.upload(formData);

      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));

      setProgress(100);
      return { success: true };
    } catch (error) {
      toast.error('Upload failed');
      return { success: false, error };
    } finally {
      setUploading(false);
      setTimeout(() => setProgress(0), 1000);
    }
  };

  return {
    uploadFile,
    uploading,
    progress,
  };
};

export default useApi;
