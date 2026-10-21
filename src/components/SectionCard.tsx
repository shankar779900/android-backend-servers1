import { StyleSheet, Text, View } from 'react-native';
import type { ReactNode } from 'react';

interface SectionCardProps {
  title: string;
  children: ReactNode;
  style?: object;
}

export default function SectionCard({ title, children, style }: SectionCardProps) {
  return (
    <View style={[styles.card, style]}>
      <Text style={styles.title}>{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#111827',
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: '#1f2937',
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
    marginBottom: 12,
  },
  title: {
    color: '#cbd5e1',
    fontSize: 15,
    textTransform: 'uppercase',
    letterSpacing: 1.1,
    fontWeight: '600',
    marginBottom: 10,
  },
});
