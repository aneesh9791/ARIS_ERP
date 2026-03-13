import { useQuery, useMutation, useQueryClient, QueryClient } from '@tanstack/react-query';
import { dashboardApi, authApi, patientApi, studyApi, billingApi, reportsApi } from './api';
import { DashboardData, DashboardFilters, Patient, Study, PatientBill } from '../types';

// Create a client
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 3,
      staleTime: 5 * 60 * 1000, // 5 minutes
      refetchOnWindowFocus: false,
    },
  },
});

// Dashboard Hooks
export const useDashboardData = (filters?: DashboardFilters) => {
  return useQuery({
    queryKey: ['dashboard', filters],
    queryFn: () => dashboardApi.getDashboardData(filters),
    staleTime: 2 * 60 * 1000, // 2 minutes for dashboard data
  });
};

export const useDashboardFilters = () => {
  return useQuery({
    queryKey: ['dashboard-filters'],
    queryFn: () => dashboardApi.getDashboardFilters(),
    staleTime: 30 * 60 * 1000, // 30 minutes for filters
  });
};

// Authentication Hooks
export const useLogin = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: authApi.login,
    onSuccess: (data) => {
      // Store token
      localStorage.setItem('token', data.data.token);
      // Update user data
      queryClient.setQueryData(['user'], data.data.user);
    },
    onError: (error) => {
      console.error('Login failed:', error);
    },
  });
};

export const useLogout = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: authApi.logout,
    onSuccess: () => {
      // Clear token
      localStorage.removeItem('token');
      // Clear all queries
      queryClient.clear();
    },
  });
};

export const useCurrentUser = () => {
  return useQuery({
    queryKey: ['user'],
    queryFn: authApi.getCurrentUser,
    staleTime: 10 * 60 * 1000, // 10 minutes
    enabled: !!localStorage.getItem('token'),
  });
};

// Patient Hooks
export const usePatients = (params?: any) => {
  return useQuery({
    queryKey: ['patients', params],
    queryFn: () => patientApi.getPatients(params),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};

export const usePatient = (id: number) => {
  return useQuery({
    queryKey: ['patient', id],
    queryFn: () => patientApi.getPatient(id),
    enabled: !!id,
  });
};

export const useCreatePatient = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: patientApi.createPatient,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patients'] });
    },
  });
};

export const useUpdatePatient = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => 
      patientApi.updatePatient(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['patient', id] });
      queryClient.invalidateQueries({ queryKey: ['patients'] });
    },
  });
};

export const useDeletePatient = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: patientApi.deletePatient,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patients'] });
    },
  });
};

export const useSearchPatients = () => {
  return useMutation({
    mutationFn: patientApi.searchPatients,
  });
};

// Study Hooks
export const useStudies = (params?: any) => {
  return useQuery({
    queryKey: ['studies', params],
    queryFn: () => studyApi.getStudies(params),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};

export const useStudy = (id: number) => {
  return useQuery({
    queryKey: ['study', id],
    queryFn: () => studyApi.getStudy(id),
    enabled: !!id,
  });
};

export const useCreateStudy = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: studyApi.createStudy,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['studies'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
};

export const useUpdateStudy = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => 
      studyApi.updateStudy(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['study', id] });
      queryClient.invalidateQueries({ queryKey: ['studies'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
};

export const useUpdateStudyStatus = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => 
      studyApi.updateStudyStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['studies'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
};

// Billing Hooks
export const useBills = (params?: any) => {
  return useQuery({
    queryKey: ['bills', params],
    queryFn: () => billingApi.getBills(params),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};

export const useBill = (id: number) => {
  return useQuery({
    queryKey: ['bill', id],
    queryFn: () => billingApi.getBill(id),
    enabled: !!id,
  });
};

export const useCreateBill = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: billingApi.createBill,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bills'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
};

export const useUpdateBill = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => 
      billingApi.updateBill(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['bill', id] });
      queryClient.invalidateQueries({ queryKey: ['bills'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
};

export const useAddPayment = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => 
      billingApi.addPayment(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bills'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
};

// Reports Hooks
export const useReports = () => {
  return useQuery({
    queryKey: ['reports'],
    queryFn: () => reportsApi.getReports(),
    staleTime: 30 * 60 * 1000, // 30 minutes
  });
};

export const useGenerateReport = () => {
  return useMutation({
    mutationFn: reportsApi.generateReport,
    onSuccess: (data, variables) => {
      // Handle successful report generation
      console.log('Report generated:', data);
    },
  });
};

export const useDownloadReport = () => {
  return useMutation({
    mutationFn: ({ reportId, format, filters }: { 
      reportId: string; 
      format: string; 
      filters?: any 
    }) => reportsApi.downloadReport(reportId, format, filters),
  });
};

// Utility Hooks
export const useInvalidateDashboard = () => {
  const queryClient = useQueryClient();
  
  return () => {
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };
};

export const useInvalidatePatients = () => {
  const queryClient = useQueryClient();
  
  return () => {
    queryClient.invalidateQueries({ queryKey: ['patients'] });
  };
};

export const useInvalidateStudies = () => {
  const queryClient = useQueryClient();
  
  return () => {
    queryClient.invalidateQueries({ queryKey: ['studies'] });
  };
};

export const useInvalidateBills = () => {
  const queryClient = useQueryClient();
  
  return () => {
    queryClient.invalidateQueries({ queryKey: ['bills'] });
  };
};

// Custom hook for optimistic updates
export const useOptimisticUpdate = <T>(
  queryKey: string[],
  updateFn: (oldData: T | undefined, newData: any) => T
) => {
  const queryClient = useQueryClient();
  
  return (newData: any) => {
    // Cancel any outgoing refetches
    queryClient.cancelQueries({ queryKey });
    
    // Snapshot the previous value
    const previousData = queryClient.getQueryData<T>(queryKey);
    
    // Optimistically update to the new value
    queryClient.setQueryData<T>(queryKey, (old) => updateFn(old, newData));
    
    // Return a function with the old value to rollback on error
    return () => {
      queryClient.setQueryData<T>(queryKey, previousData);
    };
  };
};

// Hook for pagination
export const usePagination = (defaultLimit = 10) => {
  const [page, setPage] = React.useState(1);
  const [limit, setLimit] = React.useState(defaultLimit);
  
  const nextPage = () => setPage((p) => p + 1);
  const prevPage = () => setPage((p) => Math.max(1, p - 1));
  const resetPage = () => setPage(1);
  
  return {
    page,
    limit,
    setPage,
    setLimit,
    nextPage,
    prevPage,
    resetPage,
    offset: (page - 1) * limit,
  };
};

// Hook for search and filtering
export const useSearchFilter = <T extends Record<string, any>>(
  defaultFilters: T
) => {
  const [filters, setFilters] = React.useState<T>(defaultFilters);
  const [search, setSearch] = React.useState('');
  
  const updateFilter = (key: keyof T, value: any) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };
  
  const resetFilters = () => {
    setFilters(defaultFilters);
    setSearch('');
  };
  
  const clearFilter = (key: keyof T) => {
    setFilters((prev) => ({ ...prev, [key]: defaultFilters[key] }));
  };
  
  return {
    filters,
    search,
    setSearch,
    setFilters,
    updateFilter,
    resetFilters,
    clearFilter,
  };
};

// Hook for debounced search
export const useDebounce = <T>(value: T, delay: number): T => {
  const [debouncedValue, setDebouncedValue] = React.useState<T>(value);
  
  React.useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    
    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);
  
  return debouncedValue;
};

// Hook for local storage
export const useLocalStorage = <T>(
  key: string,
  initialValue: T
): [T, (value: T) => void] => {
  const [storedValue, setStoredValue] = React.useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.error(`Error reading localStorage key "${key}":`, error);
      return initialValue;
    }
  });
  
  const setValue = (value: T) => {
    try {
      setStoredValue(value);
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.error(`Error setting localStorage key "${key}":`, error);
    }
  };
  
  return [storedValue, setValue];
};

// Hook for window size
export const useWindowSize = () => {
  const [windowSize, setWindowSize] = React.useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });
  
  React.useEffect(() => {
    const handleResize = () => {
      setWindowSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  return windowSize;
};

// Hook for online status
export const useOnlineStatus = () => {
  const [isOnline, setIsOnline] = React.useState(navigator.onLine);
  
  React.useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);
  
  return isOnline;
};

// Hook for copy to clipboard
export const useCopyToClipboard = () => {
  const [copied, setCopied] = React.useState(false);
  
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy text: ', error);
    }
  };
  
  return { copied, copy };
};
