import { useCallback, useEffect, useRef } from 'react';
import { Modal, Pressable, StyleSheet } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';

interface UnlockScreenProps {
  onUnlock: () => void;
}

export default function UnlockScreen({ onUnlock }: UnlockScreenProps) {
  const onUnlockRef = useRef(onUnlock);
  const authenticationInProgressRef = useRef(false);
  onUnlockRef.current = onUnlock;

  const authenticate = useCallback(async () => {
    if (authenticationInProgressRef.current) return;
    authenticationInProgressRef.current = true;
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Authenticate to continue',
        disableDeviceFallback: false,
      });
      if (result.success) onUnlockRef.current();
    } catch (error) {
      console.error('[UnlockScreen] Authentication failed', error);
    } finally {
      authenticationInProgressRef.current = false;
    }
  }, []);

  useEffect(() => {
    void authenticate();
  }, [authenticate]);

  return (
    <Modal
      visible
      transparent
      animationType="none"
      onRequestClose={() => undefined}
      statusBarTranslucent
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Authenticate to continue"
        onPress={() => void authenticate()}
        style={StyleSheet.absoluteFill}
      />
    </Modal>
  );
}
