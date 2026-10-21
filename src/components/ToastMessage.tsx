import { useEffect, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import type { ToastType } from '../contexts/ToastContext';

interface ToastMessageProps {
  message: string;
  type: ToastType;
}

export default function ToastMessage({ message, type }: ToastMessageProps) {
  const [opacity] = useState(new Animated.Value(0));

  useEffect(() => {
    Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.delay(2800),
      Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start();
  }, [opacity]);

  return (
    <Animated.View style={[styles.toast, styles[type], { opacity }]}> 
      <Text style={styles.text}>{message}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toast: {
    minWidth: '80%',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
    marginBottom: 10,
  },
  text: {
    color: '#fff',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
  success: {
    backgroundColor: '#10b981',
  },
  error: {
    backgroundColor: '#ef4444',
  },
  info: {
    backgroundColor: '#2563eb',
  },
});
