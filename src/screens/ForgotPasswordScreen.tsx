import { useState } from 'react';
import { KeyboardAvoidingView, Platform, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useToast } from '../contexts/ToastContext';
import { sendPasswordResetOtp, resetPassword } from '../data/api';
import PrimaryButton from '../components/PrimaryButton';
import SectionCard from '../components/SectionCard';

export default function ForgotPasswordScreen() {
  const navigation = useNavigation<any>();
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);

  const { showSuccess, showError } = useToast();

  const handleSendOtp = async () => {
    if (!email) {
      showError('Please enter your registered email');
      return;
    }

    setSendingOtp(true);
    try {
      await sendPasswordResetOtp(email);
      setOtpSent(true);
      showSuccess('OTP sent. A 4-digit code was sent to your email.');
    } catch (error: any) {
      showError(error.message || 'Unable to send OTP');
    } finally {
      setSendingOtp(false);
    }
  };

  const handleResetPassword = async () => {
    if (!otp || otp.length !== 4) {
      showError('Please enter the 4-digit OTP');
      return;
    }
    if (!password || !confirmPassword) {
      showError('Please enter and confirm your new password');
      return;
    }
    if (password !== confirmPassword) {
      showError('Passwords must match');
      return;
    }

    setResettingPassword(true);
    try {
      await resetPassword(email, otp, password);
      showSuccess('Your password has been updated. Please log in with your new password.');
      navigation.navigate('Login');
    } catch (error: any) {
      showError(error.message || 'Unable to reset password');
    } finally {
      setResettingPassword(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <Text style={styles.heading}>Reset password</Text>
          <Text style={styles.description}>Enter your registered email to get a password reset code.</Text>

          <SectionCard title="Forgot password">
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="Registered email"
              keyboardType="email-address"
              placeholderTextColor="#94a3b8"
              style={styles.input}
              autoCapitalize="none"
            />
            <PrimaryButton
              title={sendingOtp ? 'Sending OTP…' : otpSent ? 'Resend OTP' : 'Send OTP'}
              onPress={handleSendOtp}
              disabled={sendingOtp || resettingPassword || !email}
              compact
              style={styles.actionButton}
            />
            {otpSent ? (
              <>
                <TextInput
                  value={otp}
                  onChangeText={setOtp}
                  placeholder="Enter OTP"
                  keyboardType="number-pad"
                  maxLength={4}
                  placeholderTextColor="#94a3b8"
                  style={styles.input}
                />
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder="New password"
                  placeholderTextColor="#94a3b8"
                  secureTextEntry
                  style={styles.input}
                />
                <TextInput
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="Confirm new password"
                  placeholderTextColor="#94a3b8"
                  secureTextEntry
                  style={styles.input}
                />
              </>
            ) : null}
            <PrimaryButton
              title={resettingPassword ? 'Resetting…' : 'Reset password'}
              onPress={handleResetPassword}
              disabled={sendingOtp || resettingPassword || !email || !otp || otp.length !== 4 || !password || !confirmPassword}
              compact
            />
          </SectionCard>

          <View style={styles.footerRow}>
            <Text style={styles.footerText}>Remembered your password?</Text>
            <Text onPress={() => navigation.navigate('Login')} style={styles.footerLink}>Login</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#090b15',
  },
  screen: {
    flex: 1,
  },
  container: {
    padding: 24,
  },
  heading: {
    color: '#ffffff',
    fontSize: 34,
    fontWeight: '800',
    marginBottom: 8,
  },
  description: {
    color: '#94a3b8',
    fontSize: 16,
    marginBottom: 24,
    lineHeight: 24,
  },
  input: {
    backgroundColor: '#0f172a',
    color: '#f8fafc',
    borderColor: '#1f2937',
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
  },
  actionButton: {
    marginBottom: 14,
  },
  footerRow: {
    marginTop: 20,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  footerText: {
    color: '#94a3b8',
    marginRight: 8,
  },
  footerLink: {
    color: '#fbbf24',
    fontWeight: '700',
  },
});
