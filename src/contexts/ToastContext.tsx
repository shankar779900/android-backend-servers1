import React, { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import ToastMessage from '../components/ToastMessage';
import { getUserFriendlyError } from '../utils/networkErrors';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void;
  showSuccess: (message: string) => void;
  showError: (message: string) => void;
}

interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = (message: string, type: ToastType = 'info') => {
    // sanitize message: suppress technical/network/db errors
    const friendly = getUserFriendlyError(message);
    // if it's a transient/network/server error, don't show any toast
    if (!friendly && type === 'error') return;

    // show a generic error message instead of raw technical text
    const displayMessage = type === 'error' ? (friendly || 'Something went wrong. Please try again.') : (friendly || message);

    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const toast: ToastItem = { id, message: displayMessage, type };
    setToasts((current) => [...current, toast]);

    setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id));
    }, 3200);
  };

  const showSuccess = (message: string) => showToast(message, 'success');
  const showError = (message: string) => showToast(message, 'error');

  const value = useMemo(
    () => ({ showToast, showSuccess, showError }),
    [],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <View pointerEvents="box-none" style={styles.container}>
        {toasts.map((toast) => (
          <ToastMessage key={toast.id} type={toast.type} message={toast.message} />
        ))}
      </View>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 50,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 999,
    elevation: 999,
    pointerEvents: 'box-none',
  },
});
