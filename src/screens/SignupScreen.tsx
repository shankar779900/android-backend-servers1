import { useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { KeyboardAvoidingView, Platform, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useToast } from '../contexts/ToastContext';
import { register, sendSignupOtp, verifySignupOtp, validateReferralCode } from '../data/api';
import PrimaryButton from '../components/PrimaryButton';
import SectionCard from '../components/SectionCard';
import { getErrorMessage } from '../utils/networkErrors';

export default function SignupScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const { showSuccess, showError } = useToast();
  const [referralCode, setReferralCode] = useState(String(route.params?.referralCode || ''));
  const [generatedReferralCode, setGeneratedReferralCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [registrationComplete, setRegistrationComplete] = useState(false);
  const [referrerName, setReferrerName] = useState<string | null>(null);
  const [referralValidationError, setReferralValidationError] = useState<string | null>(null);
  const [pendingReferralCode, setPendingReferralCode] = useState(String(route.params?.referralCode || ''));
  const referralTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let active = true;
    const loadPendingReferral = async () => {
      try {
        const storedCode = await AsyncStorage.getItem('pendingReferralCode');
        const code = String(route.params?.referralCode || storedCode || '').trim().toUpperCase();
        if (active && code) {
          setReferralCode(code);
          setPendingReferralCode(code);
          await AsyncStorage.removeItem('pendingReferralCode');
        }
      } catch {
        // Keep signup usable if local referral handoff is unavailable.
      }
    };

    void loadPendingReferral();
    return () => {
      active = false;
    };
  }, [route.params?.referralCode]);

  const handleSendOtp = async () => {
    if (!email) {
      showError('Please enter your email first');
      return;
    }

    setSendingOtp(true);
    try {
      await sendSignupOtp(email);
      setOtpSent(true);
      showSuccess('OTP sent. A 4-digit code was sent to your email.');
    } catch (error: any) {
      showError(error.message || 'Unable to send OTP');
    } finally {
      setSendingOtp(false);
    }
  };

  const verifyOtpCode = async (code: string) => {
    if (!code || code.length !== 4) return;

    setVerifyingOtp(true);
    try {
      await verifySignupOtp(email, code);
      setOtpVerified(true);
      showSuccess('Email verified successfully.');
    } catch (error: any) {
      showError(error.message || 'OTP invalid');
    } finally {
      setVerifyingOtp(false);
    }
  };

  const validateReferral = async (text: string) => {
    const code = text.trim().toUpperCase();
    if (!code) {
      setReferrerName(null);
      setReferralValidationError(null);
      return;
    }

    try {
      const data = await validateReferralCode(code);
      setReferrerName(data.referrerName || null);
      setReferralValidationError(null);
    } catch (error: any) {
      setReferrerName(null);
      setReferralValidationError(getErrorMessage(error, 'Invalid referral code'));
    }
  };

  useEffect(() => {
    if (referralTimeout.current) {
      clearTimeout(referralTimeout.current);
    }

    if (!pendingReferralCode) {
      setReferrerName(null);
      setReferralValidationError(null);
      return;
    }

    referralTimeout.current = setTimeout(() => {
      validateReferral(pendingReferralCode);
    }, 500);

    return () => {
      if (referralTimeout.current) {
        clearTimeout(referralTimeout.current);
      }
    };
  }, [pendingReferralCode]);

  const handleSignup = async () => {
    if (password !== confirmPassword) {
      showError('Passwords must match');
      return;
    }

    if (!otpVerified) {
      showError('Please verify your email OTP first');
      return;
    }

    setRegistering(true);
    try {
      const data = await register(username, email, password, phoneNumber, referralCode.trim() || undefined);
      setGeneratedReferralCode(data.referralCode || '');
      setRegistrationComplete(true);
      showSuccess('Account created successfully');
    } catch (error: any) {
      showError(error.message || 'Unable to register');
    } finally {
      setRegistering(false);
    }
  };

  if (registrationComplete) {
    return (
      <SafeAreaView style={styles.successSafeArea}>
        <View style={styles.successContainer}>
          <View style={styles.successIcon}>
            <Text style={styles.successIconText}>✓</Text>
          </View>
          <Text style={styles.successHeading}>Account created successfully</Text>
          <Text style={styles.successDescription}>
            Your account is ready. Sign in with your email and password to get started.
          </Text>
          {generatedReferralCode ? (
            <SectionCard title="Your referral code">
              <Text style={styles.referralCodeLabel}>Share this code with friends</Text>
              <Text style={styles.referralCodeValue}>{generatedReferralCode}</Text>
            </SectionCard>
          ) : null}
          <PrimaryButton title="Continue to login" onPress={() => navigation.navigate('Login')} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <Text style={styles.heading}>Create account</Text>
          <Text style={styles.description}>Open a new account and start investing instantly.</Text>

          <SectionCard title="Register">
            <TextInput
              value={username}
              onChangeText={setUsername}
              placeholder="Full name"
              placeholderTextColor="#94a3b8"
              style={styles.input}
            />
            <View style={styles.emailRow}>
              <TextInput
                value={email}
                onChangeText={(value) => {
                  setEmail(value);
                  setOtpSent(false);
                  setOtpVerified(false);
                  setOtp('');
                }}
                placeholder="Email"
                keyboardType="email-address"
                placeholderTextColor="#94a3b8"
                style={[styles.input, styles.emailInput]}
                autoCapitalize="none"
              />
              <PrimaryButton
                title={sendingOtp ? 'Sending...' : otpSent ? 'Resend' : 'Send'}
                onPress={handleSendOtp}
                disabled={sendingOtp || !email}
                loading={sendingOtp}
                compact
                style={styles.sendButton}
                textStyle={styles.sendButtonText}
              />
            </View>
            {otpSent ? (
              <TextInput
                value={otp}
                onChangeText={(value) => {
                  const cleaned = value.replace(/[^0-9]/g, '');
                  setOtp(cleaned);
                  if (cleaned.length === 4) {
                    verifyOtpCode(cleaned);
                  }
                }}
                placeholder="Enter 4-digit OTP"
                keyboardType="number-pad"
                maxLength={4}
                placeholderTextColor="#94a3b8"
                style={styles.input}
                editable={!otpVerified}
              />
            ) : null}
            <TextInput
              value={phoneNumber}
              onChangeText={setPhoneNumber}
              placeholder="Phone number"
              keyboardType="phone-pad"
              placeholderTextColor="#94a3b8"
              style={styles.input}
            />
            <TextInput
              value={referralCode}
              onChangeText={(value) => {
                const upper = value.toUpperCase();
                setReferralCode(upper);
                setPendingReferralCode(upper);
              }}
              placeholder="Referral code (optional)"
              placeholderTextColor="#94a3b8"
              autoCapitalize="characters"
              style={styles.input}
            />
            {referrerName ? (
              <Text style={styles.referrerText}>Referred by {referrerName}</Text>
            ) : null}
            {referralValidationError ? (
              (() => {
                // sanitize referral validation errors
                // avoid showing technical messages to the user
                const { getUserFriendlyError } = require('../utils/networkErrors');
                const friendly = getUserFriendlyError(referralValidationError);
                return friendly ? <Text style={styles.errorText}>{friendly}</Text> : null;
              })()
            ) : null}
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="Password"
              placeholderTextColor="#94a3b8"
              secureTextEntry
              style={styles.input}
            />
            <TextInput
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="Confirm password"
              placeholderTextColor="#94a3b8"
              secureTextEntry
              style={styles.input}
            />
            <PrimaryButton title={registering ? 'Signing up…' : 'Create account'} onPress={handleSignup} disabled={registering || !username || !email || !password || !confirmPassword || !otpVerified} loading={registering} />
          </SectionCard>

          {generatedReferralCode ? (
            <SectionCard title="Your referral code">
              <Text style={styles.referralCodeLabel}>Share this code after signup</Text>
              <Text style={styles.referralCodeValue}>{generatedReferralCode}</Text>
            </SectionCard>
          ) : null}

          <View style={styles.footerRow}>
            <Text style={styles.footerText}>Already have an account?</Text>
            <Text onPress={() => navigation.navigate('Login')} style={styles.footerLink}>Login</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  successSafeArea: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: '#090b15',
  },
  successContainer: {
    padding: 24,
    alignItems: 'center',
  },
  successIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#14532d',
    marginBottom: 20,
  },
  successIconText: {
    color: '#bbf7d0',
    fontSize: 40,
    fontWeight: '700',
  },
  successHeading: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 10,
  },
  successDescription: {
    color: '#94a3b8',
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
    marginBottom: 24,
  },
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
  footerRow: {
    marginTop: 20,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  referrerText: {
    color: '#38bdf8',
    fontSize: 14,
    marginBottom: 10,
  },
  errorText: {
    color: '#f87171',
    fontSize: 12,
    marginBottom: 10,
  },
  referralCodeLabel: {
    color: '#94a3b8',
    fontSize: 12,
    marginBottom: 6,
  },
  referralCodeValue: {
    color: '#fbbf24',
    fontSize: 18,
    fontWeight: '700',
  },
  debugText: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 12,
  },
  footerText: {
    color: '#94a3b8',
    marginRight: 8,
  },
  footerLink: {
    color: '#fbbf24',
    fontWeight: '700',
  },
  emailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    width: '100%',
    marginBottom: 14,
  },
  emailInput: {
    flex: 1,
    minWidth: 0,
    marginRight: 8,
    marginBottom: 0,
  },
  sendButton: {
    width: 90,
    height: 48,
    borderRadius: 999,
    justifyContent: 'center',
  },
  sendButtonText: {
    fontSize: 13,
    lineHeight: 16,
  },
});
