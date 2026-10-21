import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

interface SyncBannerProps {
  message: string;
  error?: boolean;
  loading?: boolean;
}

export default function SyncBanner({ message, error = false, loading = false }: SyncBannerProps) {
  return (
    <View style={[styles.banner, error ? styles.errorBanner : styles.infoBanner]}>
      {loading ? <ActivityIndicator size="small" color="#f8fafc" style={styles.spinner} /> : null}
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 16,
  },
  infoBanner: {
    backgroundColor: '#1e3a8a',
  },
  errorBanner: {
    backgroundColor: '#7f1d1d',
  },
  text: {
    color: '#f8fafc',
    fontSize: 12,
    fontWeight: '600',
    flexShrink: 1,
  },
  spinner: {
    marginRight: 8,
  },
});
