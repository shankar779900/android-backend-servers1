import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle, type TextStyle } from 'react-native';
import type { GestureResponderEvent } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

type Variant = 'primary' | 'secondary' | 'ghost';

interface PrimaryButtonProps {
  title: string;
  onPress: (event: GestureResponderEvent) => void;
  disabled?: boolean;
  loading?: boolean;
  compact?: boolean;
  variant?: Variant;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}

export default function PrimaryButton({
  title,
  onPress,
  disabled = false,
  loading = false,
  compact = false,
  variant = 'primary',
  style,
  textStyle,
}: PrimaryButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.button,
        isDisabled && styles.disabled,
        pressed && !isDisabled && styles.pressed,
        style,
      ]}
    >
      <LinearGradient
        colors={isDisabled ? ['#64748b', '#475569'] : ['#38bdf8', '#f59e0b']}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={[styles.gradient, compact && styles.compactGradient]}
      >
        {loading ? <ActivityIndicator size="small" color="#ffffff" style={styles.spinner} /> : null}
        <Text style={[styles.text, isDisabled && styles.disabledText, textStyle]}>{title}</Text>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: 999,
    shadowColor: '#38bdf8',
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
    overflow: 'hidden',
  },
  gradient: {
    minHeight: 58,
    paddingVertical: 16,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactGradient: {
    minHeight: 36,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  pressed: {
    opacity: 0.85,
  },
  disabled: {
    opacity: 0.6,
  },
  text: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 15,
  },
  disabledText: {
    color: '#94a3b8',
  },
  spinner: {
    marginBottom: 8,
  },
});
