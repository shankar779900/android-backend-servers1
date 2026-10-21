import { useEffect } from 'react';
import * as LocalAuthentication from 'expo-local-authentication';

interface UnlockScreenProps {
  onUnlock: () => void;
}

export default function UnlockScreen({ onUnlock }: UnlockScreenProps) {
  useEffect(() => {
    const initialize = async () => {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      const supported = hasHardware && enrolled;

      if (!supported) {
        // If device doesn't support biometrics, allow access (no visible UI).
        onUnlock();
        return;
      }

      try {
        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: 'Unlock app',
          disableDeviceFallback: false,
        });

        if (result.success) {
          onUnlock();
        }
      } catch (err) {
        // Do nothing; keep the screen locked if authentication fails.
      }
    };

    void initialize();
  }, [onUnlock]);

  return null;
}
