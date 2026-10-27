import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { RouteProp, useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import {
  submitDeposit,
  fetchDepositSettings,
  API_BASE_URL,
  fetchWalletBalance,
  fetchBankAccounts,
  createBankAccount,
  sendBankAccountOtp,
  deleteBankAccount,
  withdraw,
} from '../data/api';
import PrimaryButton from '../components/PrimaryButton';
import SectionCard from '../components/SectionCard';
import eventBus from '../utils/eventBus';
import { getErrorMessage } from '../utils/networkErrors';

type WalletActionParams = {
  WalletAction: {
    action: 'deposit' | 'withdraw' | 'transactions' | 'bank';
  };
};

type WalletActionRouteProp = RouteProp<WalletActionParams, 'WalletAction'>;

export default function WalletActionScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<WalletActionRouteProp>();
  const { user, updateUser, bankAccounts: authBankAccounts, transactions: authTransactions, setBankAccounts: setAuthBankAccounts, setTransactions: setAuthTransactions } = useAuth();
  const { showSuccess, showError } = useToast();
  const action = route.params?.action ?? 'deposit';

  const [loading, setLoading] = useState(true);
  const [balance, setBalance] = useState<number | null>(user?.balance ?? null);
  const [transactions, setTransactions] = useState<any[]>(authTransactions || []);
  const [depositAmount, setDepositAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('upi');
  const [selectedBankAccountId, setSelectedBankAccountId] = useState('');
  const [bankPickerOpen, setBankPickerOpen] = useState(false);
  const [processing, setProcessing] = useState(false);
    const processingRef = useRef(false);
  const [bankAccounts, setBankAccounts] = useState<Array<{ id: string; holder: string; accountNumber: string; bankName: string; ifsc: string; branchName?: string }>>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [depositSettings, setDepositSettings] = useState<{ upiId?: string; upiAccountHolder?: string; qrCodeUrl?: string | null; bankAccountHolder?: string; bankAccountNumber?: string; bankIfsc?: string; bankName?: string; bankBranch?: string; instructions?: string }>({});
  const [depositSettingsLoading, setDepositSettingsLoading] = useState(false);
  const [depositSettingsError, setDepositSettingsError] = useState('');
  const [qrImageError, setQrImageError] = useState(false);
  const [proofImage, setProofImage] = useState<{ uri: string; type: string; name: string } | null>(null);
  const [utrNumber, setUtrNumber] = useState('');
  const [bankForm, setBankForm] = useState({ holder: '', accountNumber: '', confirmAccountNumber: '', bankName: '', ifsc: '' });
  const [bankError, setBankError] = useState('');
  const [bankOtp, setBankOtp] = useState('');
  const [bankOtpSent, setBankOtpSent] = useState(false);
  const [sendingBankOtp, setSendingBankOtp] = useState(false);
  const [walletError, setWalletError] = useState('');

  useFocusEffect(
    useCallback(() => {
      let isActive = true;

      const refreshWalletData = async () => {
        if (isActive) setLoading(true);

        if (action === 'deposit') {
          if (isActive) {
            setDepositSettingsLoading(true);
            setDepositSettingsError('');
          }
          try {
            const settingsResponse = await fetchDepositSettings();
            if (isActive) {
              console.log('deposit settings response:', settingsResponse);
              setQrImageError(false);
              setDepositSettings(settingsResponse.settings || {});
              setDepositSettingsError('');
            }
          } catch (error: any) {
            if (isActive) {
              console.log('deposit settings error:', error.message || error);
              setDepositSettings({});
              setDepositSettingsError(getErrorMessage(error, 'Unable to load deposit payment details.'));
            }
          } finally {
            if (isActive) {
              setDepositSettingsLoading(false);
            }
          }
        }

        if (user?.email) {
          try {
            const data = await fetchWalletBalance();
            const nextBalance = data.balance ?? user?.balance ?? 0;
            if (isActive) {
              setBalance(nextBalance);
              setTransactions(data.transactions || []);
            }
          } catch (error: any) {
            if (isActive) {
              setWalletError(getErrorMessage(error, 'Unable to load wallet'));
            }
          }

          if (isActive) {
            await loadBankAccounts();
          }
        }

        if (action !== 'deposit') {
          if (isActive) setLoading(false);
        }

        if (isActive && user?.email) {
          setLoading(false);
        }
      };

      refreshWalletData();
      return () => {
        isActive = false;
      };
    }, [action, user?.email]),
  );

  const loadWallet = async () => {
    setLoading(true);
    setWalletError('');
    try {
      const data = await fetchWalletBalance();
      const nextBalance = data.balance ?? user?.balance ?? 0;
      await updateUser({ balance: nextBalance });
      setBalance(nextBalance);
      setTransactions(data.transactions || []);
      try { setAuthTransactions(data.transactions || []); } catch (e) {}
    } catch (error: any) {
      setWalletError(getErrorMessage(error, 'Unable to load wallet'));
    } finally {
      setLoading(false);
    }
  };

  const normalizeBankAccounts = (accounts: any[]) => {
    return Array.isArray(accounts)
      ? accounts.map((account) => ({
          id: String(account.id),
          holder: String(account.accountHolderName || account.holder || 'Unknown'),
          accountNumber: String(account.accountNumber || ''),
          bankName: String(account.bankName || ''),
          ifsc: String(account.ifscCode || account.ifsc || ''),
          branchName: String(account.branchName || account.bankBranch || ''),
        }))
      : [];
  };

  // Initialize local state from AuthContext so UI shows immediately when navigating back
  useEffect(() => {
    try {
      if (Array.isArray(authTransactions) && authTransactions.length > 0) setTransactions(authTransactions);
      if (Array.isArray(authBankAccounts) && authBankAccounts.length > 0) {
        const normalized = Array.isArray(authBankAccounts)
          ? authBankAccounts.map((account: any) => ({
              id: String(account.id),
              holder: String(account.accountHolderName || account.holder || 'Unknown'),
              accountNumber: String(account.accountNumber || ''),
              bankName: String(account.bankName || ''),
              ifsc: String(account.ifscCode || account.ifsc || ''),
              branchName: String(account.branchName || account.bankBranch || ''),
            }))
          : [];
        setBankAccounts(normalized);
        setSelectedBankAccountId((current) => (current && normalized.some((a) => a.id === current) ? current : normalized[0]?.id || ''));
      }
      if (typeof user?.balance === 'number') setBalance(user.balance);
    } catch (e) {
      // ignore
    }
  }, [authBankAccounts, authTransactions, user?.balance]);

  const loadBankAccounts = async () => {
    if (!user?.email) {
      setBankAccounts([]);
      setSelectedBankAccountId('');
      return;
    }

      try {
        // Use initial login payload if available for immediate bank accounts
          try {
            const initial = await AsyncStorage.getItem('initialLoginData');
            const parsed = initial ? JSON.parse(initial) : null;
            if (parsed?.bankAccounts) {
              const accounts = normalizeBankAccounts(parsed.bankAccounts || []);
              setBankAccounts(accounts);
              setSelectedBankAccountId((current) => (current && accounts.some((account) => account.id === current) ? current : accounts[0]?.id || ''));
              setIsSyncing(true);
              // background refresh
              (async () => {
                try {
                  const resp = await fetchBankAccounts();
                  const fresh = normalizeBankAccounts(resp.bankAccounts || []);
                  setBankAccounts(fresh);
                  setSelectedBankAccountId((current) => (current && fresh.some((a) => a.id === current) ? current : fresh[0]?.id || ''));
                  try {
                    await AsyncStorage.setItem('cachedBankAccounts', JSON.stringify(resp.bankAccounts || []));
                    try { setAuthBankAccounts(resp.bankAccounts || []); } catch (e) {}
                  } catch (e) {}
                } catch (err) {
                  // ignore
                } finally {
                  setIsSyncing(false);
                }
              })();
              await AsyncStorage.removeItem('initialLoginData');
              return;
            }
          } catch (e) {
            console.warn('initial login data read failed', (e as any)?.message || e);
          }

      const response = await fetchBankAccounts();
      const accounts = normalizeBankAccounts(response.bankAccounts || []);
      setBankAccounts(accounts);
      setSelectedBankAccountId((current) => (current && accounts.some((account) => account.id === current) ? current : accounts[0]?.id || ''));
      try {
        await AsyncStorage.setItem('cachedBankAccounts', JSON.stringify(response.bankAccounts || []));
        try { setAuthBankAccounts(response.bankAccounts || []); } catch (e) {}
        try { eventBus.emit('bankAccountsUpdated', accounts); } catch (e) {}
      } catch (e) {}
      // persist latest bank accounts for instant display on next login
      try {
        await AsyncStorage.setItem('cachedBankAccounts', JSON.stringify(response.bankAccounts || []));
      } catch (e) {
        // ignore
      }
    } catch (error: any) {
      console.warn('Unable to load bank accounts', error?.message || error);
      setBankAccounts([]);
      setSelectedBankAccountId('');
    }
  };

  // listen for external updates and refresh local state
  useEffect(() => {
    const off = eventBus.on('bankAccountsUpdated', (accounts: any[]) => {
      try {
        const normalized = normalizeBankAccounts(accounts || []);
        setBankAccounts(normalized);
        setSelectedBankAccountId((current) => (current && normalized.some((a) => a.id === current) ? current : normalized[0]?.id || ''));
      } catch (e) {
        // ignore
      }
    });
    return () => off();
  }, []);

  const handleDeposit = async () => {
    if (processingRef.current) return;
    if (!selectedMethodConfigured) {
      showError('Payment details not available. Please contact customer support.');
      return;
    }

    const amount = Number(depositAmount);
      processingRef.current = true;
      setProcessing(true);
    if (!amount || amount < 100) {
      showError('Enter deposit amount of at least ₹100');
      return;
    }
    if (!utrNumber.trim()) {
      showError('Enter the UTR number for your deposit');
      return;
    }
    if (!proofImage) {
      showError('Upload a payment screenshot proof');
      return;
    }

    setProcessing(true);
    try {
      const result = await submitDeposit(amount, paymentMethod, utrNumber.trim(), proofImage);
      showSuccess(result.message || 'Your deposit request has been submitted.');
      setDepositAmount('');
      setProofImage(null);
      setUtrNumber('');
      await loadWallet();
    } catch (error: any) {
      showError(error.message || 'Unable to submit deposit request');
    } finally {
      processingRef.current = false;
      setProcessing(false);
    }
  };

  const handleWithdraw = async () => {
    if (processingRef.current) return;

    const amount = Number(withdrawAmount);
      processingRef.current = true;
      setProcessing(true);
    if (!amount || amount < 500) {
      showError('Enter withdrawal amount of at least ₹500');
      return;
    }
    if ((balance ?? 0) < amount) {
      showError('You cannot withdraw more than your current balance.');
      return;
    }
    const selectedBankAccount = bankAccounts.find((account) => account.id === selectedBankAccountId);
    if (!selectedBankAccount) {
      showError('Add and select a bank account before requesting a withdrawal.');
      return;
    }

    setProcessing(true);
    try {
      const result = await withdraw(amount, 'bank', selectedBankAccount);
      const nextBalance = typeof result.balance === 'number' ? result.balance : (balance ?? 0) - amount;
      await updateUser({ balance: nextBalance });
      setBalance(nextBalance);
      showSuccess(result.message || 'Your withdrawal request has been placed.');
      setWithdrawAmount('');
      await loadWallet();
    } catch (error: any) {
      showError(error.message || 'Unable to process withdrawal');
    } finally {
      processingRef.current = false;
      setProcessing(false);
    }
  };

  const handleAddBankAccount = async (otp: string) => {
    if (processingRef.current) return;

    const { holder, accountNumber, confirmAccountNumber, bankName, ifsc } = bankForm;
    setBankError('');

    const normalizedAccountNumber = accountNumber.trim();
    const normalizedConfirmAccountNumber = confirmAccountNumber.trim();
    if (!holder.trim() || !normalizedAccountNumber || !normalizedConfirmAccountNumber || !bankName.trim() || !ifsc.trim()) {
      setBankError('Please fill in all fields.');
      return;
    }
    if (normalizedAccountNumber !== normalizedConfirmAccountNumber) {
      setBankError('Account numbers do not match.');
      return;
    }

    if (!bankOtpSent || otp.length !== 6) {
      setBankError('Verify your bank account request using the 6-digit email OTP first.');
      return;
    }

    processingRef.current = true;
    setProcessing(true);
    try {
      const resp = await createBankAccount({
        holder: holder.trim(),
        accountNumber: normalizedAccountNumber,
        bankName: bankName.trim(),
        ifsc: ifsc.trim().toUpperCase(),
        otp,
      });

      // If API returned the created bank account, insert it immediately
      const created = resp?.bankAccount ? normalizeBankAccounts([resp.bankAccount])[0] : null;
      if (created) {
        setBankAccounts((prev) => {
          const next = [created, ...prev.filter((a) => a.id !== created.id)];
          // persist cached bank accounts for next login
          (async () => {
            try {
              await AsyncStorage.setItem('cachedBankAccounts', JSON.stringify(next));
              try { setAuthBankAccounts(next); } catch (e) {}
              try { eventBus.emit('bankAccountsUpdated', next); } catch (e) {}
            } catch (e) {}
          })();
          // Also merge into `initialLoginData` so other screens that read it render immediately
          (async () => {
            try {
              const initialRaw = await AsyncStorage.getItem('initialLoginData');
              let initial: any = null;
              if (initialRaw) {
                try {
                  initial = JSON.parse(initialRaw || '{}');
                } catch (parseErr) {
                  initial = null;
                }
              }

              if (!initial) {
                // create a minimal initialLoginData payload when missing
                initial = { wallet: null, bankAccounts: [], portfolio: null, ts: Date.now() };
              }

              const existing = Array.isArray(initial.bankAccounts) ? initial.bankAccounts : [];
              // avoid duplicates by id
              const merged = [created, ...existing.filter((b: any) => String(b.id) !== String(created.id))];
              initial.bankAccounts = merged;
              await AsyncStorage.setItem('initialLoginData', JSON.stringify(initial));
              try { eventBus.emit('bankAccountsUpdated', merged); } catch (e) {}
            } catch (e) {
              // ignore
            }
          })();
          return next;
        });
        setSelectedBankAccountId(created.id);
      } else {
        // fallback to reloading from server
        await loadBankAccounts();
      }

      setBankForm({ holder: '', accountNumber: '', confirmAccountNumber: '', bankName: '', ifsc: '' });
      setBankOtp('');
      setBankOtpSent(false);
      showSuccess('Bank account added successfully.');
    } catch (error: any) {
      setBankError(getErrorMessage(error, 'Unable to add bank account.'));
      setBankOtp('');
    } finally {
      processingRef.current = false;
      setProcessing(false);
    }
  };

  const handleSendBankOtp = async () => {
    const { holder, accountNumber, confirmAccountNumber, bankName, ifsc } = bankForm;
    const normalizedAccountNumber = accountNumber.trim();
    if (!holder.trim() || !normalizedAccountNumber || !confirmAccountNumber.trim() || !bankName.trim() || !ifsc.trim()) {
      setBankError('Please fill in all bank account fields first.');
      return;
    }
    if (normalizedAccountNumber !== confirmAccountNumber.trim()) {
      setBankError('Account numbers do not match.');
      return;
    }

    setSendingBankOtp(true);
    setBankError('');
    try {
      await sendBankAccountOtp({
        holder: holder.trim(),
        accountNumber: normalizedAccountNumber,
        bankName: bankName.trim(),
        ifsc: ifsc.trim().toUpperCase(),
      });
      setBankOtpSent(true);
      setBankOtp('');
      showSuccess('A 6-digit bank account verification code was sent to your registered email.');
    } catch (error: any) {
      setBankError(
        error?.status === 404
          ? 'Bank account OTP verification is not available on the connected server yet. Please deploy the latest backend and try again.'
          : getErrorMessage(error, 'Unable to send bank account verification code.'),
      );
    } finally {
      setSendingBankOtp(false);
    }
  };

  const handleBankOtpChange = (value: string) => {
    const cleaned = value.replace(/\D/g, '').slice(0, 6);
    setBankOtp(cleaned);
    setBankError('');
    if (cleaned.length === 6) void handleAddBankAccount(cleaned);
  };

  const updateBankForm = (field: keyof typeof bankForm, value: string) => {
    setBankForm((current) => ({ ...current, [field]: value }));
    setBankOtpSent(false);
    setBankOtp('');
  };

  const handleRemoveBankAccount = async (id: string) => {
    if (processingRef.current) return;

    processingRef.current = true;
    try {
      await deleteBankAccount(id);
      await loadBankAccounts();
          try {
            const cachedRaw = await AsyncStorage.getItem('cachedBankAccounts');
            const cached = cachedRaw ? JSON.parse(cachedRaw) : [];
            const accounts = normalizeBankAccounts(cached || []);
            try { setAuthBankAccounts(cached || []); } catch (e) {}
            try { eventBus.emit('bankAccountsUpdated', accounts); } catch (e) {}
          } catch (e) {}
      showSuccess('Bank account removed.');
    } catch (error: any) {
      setBankError(getErrorMessage(error, 'Unable to remove bank account.'));
    } finally {
      processingRef.current = false;
    }
  };

  const titles: Record<string, string> = {
    deposit: 'Deposit funds',
    withdraw: 'Withdraw funds',
    transactions: 'Transactions',
    bank: 'Bank accounts',
  };

  const pickProofImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== 'granted') {
      showError('Please allow photo access to upload payment proof.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.8,
    });

    if (result.canceled || !result.assets || result.assets.length === 0) {
      return;
    }

    const asset = result.assets[0];
    setProofImage({
      uri: asset.uri,
      type: (asset as any).mimeType || asset.type || 'image/jpeg',
      name: asset.fileName || `proof-${Date.now()}.jpg`,
    });
  };

  const hasUpiDetails = Boolean(depositSettings.upiId || depositSettings.qrCodeUrl);
  const qrCodeImageUri = depositSettings.qrCodeUrl?.replace(
    /^http:\/\//i,
    API_BASE_URL.startsWith('https://') ? 'https://' : 'http://',
  );
  const hasBankDetails = Boolean(
    depositSettings.bankAccountHolder ||
      depositSettings.bankAccountNumber ||
      depositSettings.bankIfsc ||
      depositSettings.bankName ||
      depositSettings.bankBranch,
  );
  const hasAnyPaymentDetails = hasUpiDetails || hasBankDetails;
  const selectedMethodConfigured = paymentMethod === 'upi' ? hasUpiDetails : hasBankDetails;
  const filteredTransactions = Array.isArray(transactions)
    ? transactions.filter((item) => ['deposit', 'withdraw', 'investment', 'earning', 'bonus'].includes(item.type))
    : [];


  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <View style={styles.headerRow}>
        <Text style={styles.heading}>{titles[action]}</Text>
      </View>

      <SectionCard title={titles[action]} style={styles.expandedSection}>
        {action === 'deposit' && (
          <>
            {depositSettingsLoading ? (
              <Text style={styles.infoText}>Loading deposit payment details…</Text>
            ) : depositSettingsError ? (
              (() => {
                const { getUserFriendlyError } = require('../utils/networkErrors');
                const friendly = getUserFriendlyError(depositSettingsError);
                if (friendly) return <Text style={styles.errorText}>{friendly}</Text>;
                return <Text style={styles.errorText}>Unable to load deposit payment details. Please contact customer support.</Text>;
              })()
            ) : !hasAnyPaymentDetails ? (
              <Text style={styles.infoText}>Payment details not available — please contact customer support.</Text>
            ) : (
              <>
                <Text style={styles.infoText}>Transfer money using the payment details below, then submit your UTR and proof screenshot for admin approval.</Text>
                <View style={styles.methodRow}>
                  <Pressable
                    style={[styles.methodButton, paymentMethod === 'upi' && styles.methodButtonActive]}
                    onPress={() => setPaymentMethod('upi')}
                  >
                    <Text style={[styles.methodText, paymentMethod === 'upi' && styles.methodTextActive]}>UPI</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.methodButton, paymentMethod === 'bank' && styles.methodButtonActive]}
                    onPress={() => setPaymentMethod('bank')}
                  >
                    <Text style={[styles.methodText, paymentMethod === 'bank' && styles.methodTextActive]}>Bank</Text>
                  </Pressable>
                </View>
                {paymentMethod === 'upi' && hasUpiDetails && (
                  <View style={styles.paymentSection}>
                    <Text style={styles.sectionHeading}>UPI details</Text>
                    {depositSettings.upiAccountHolder ? (
                      <View style={styles.depositDetailRow}>
                        <Text style={styles.depositDetailLabel}>Account holder</Text>
                        <Text style={styles.depositDetailValue}>{depositSettings.upiAccountHolder}</Text>
                      </View>
                    ) : null}
                    {depositSettings.upiId ? (
                      <View style={styles.depositDetailRow}>
                        <Text style={styles.depositDetailLabel}>UPI ID</Text>
                        <Text style={styles.depositDetailValue}>{depositSettings.upiId}</Text>
                      </View>
                    ) : null}
                    {qrCodeImageUri && !qrImageError ? (
                      <View style={styles.qrPreviewContainer}>
                        <Text style={styles.depositDetailLabel}>UPI QR Code</Text>
                        <Image
                          source={{ uri: qrCodeImageUri }}
                          resizeMode="contain"
                          onError={() => setQrImageError(true)}
                          style={styles.qrPreviewImage}
                        />
                      </View>
                    ) : qrImageError ? (
                      <Text style={styles.depositInstructions}>Unable to load the QR code. Please contact customer support.</Text>
                    ) : null}
                    {!qrCodeImageUri ? (
                      <Text style={styles.depositInstructions}>QR code is optional. You can pay using the UPI ID above.</Text>
                    ) : null}
                  </View>
                )}
                {paymentMethod === 'bank' && hasBankDetails && (
                  <View style={styles.paymentSection}>
                    <Text style={styles.sectionHeading}>Bank details</Text>
                    {depositSettings.bankAccountHolder ? (
                      <View style={styles.depositDetailRow}>
                        <Text style={styles.depositDetailLabel}>Account holder</Text>
                        <Text style={styles.depositDetailValue}>{depositSettings.bankAccountHolder}</Text>
                      </View>
                    ) : null}
                    {depositSettings.bankAccountNumber ? (
                      <View style={styles.depositDetailRow}>
                        <Text style={styles.depositDetailLabel}>Account number</Text>
                        <Text style={styles.depositDetailValue}>{depositSettings.bankAccountNumber}</Text>
                      </View>
                    ) : null}
                    {depositSettings.bankIfsc ? (
                      <View style={styles.depositDetailRow}>
                        <Text style={styles.depositDetailLabel}>IFSC</Text>
                        <Text style={styles.depositDetailValue}>{depositSettings.bankIfsc}</Text>
                      </View>
                    ) : null}
                    {depositSettings.bankName ? (
                      <View style={styles.depositDetailRow}>
                        <Text style={styles.depositDetailLabel}>Bank</Text>
                        <Text style={styles.depositDetailValue}>{depositSettings.bankName}</Text>
                      </View>
                    ) : null}
                    {depositSettings.bankBranch ? (
                      <View style={styles.depositDetailRow}>
                        <Text style={styles.depositDetailLabel}>Branch</Text>
                        <Text style={styles.depositDetailValue}>{depositSettings.bankBranch}</Text>
                      </View>
                    ) : null}
                  </View>
                )}
                {depositSettings.instructions ? <Text style={styles.depositInstructions}>{depositSettings.instructions}</Text> : null}
                {!selectedMethodConfigured ? (
                  <Text style={styles.errorText}>Payment details not available for this method. Please choose another method or contact customer support.</Text>
                ) : null}
                <TextInput
                  value={depositAmount}
                  onChangeText={setDepositAmount}
                  keyboardType="numeric"
                  placeholder="Deposit amount"
                  placeholderTextColor="#64748b"
                  style={styles.input}
                />
                <TextInput
                  value={utrNumber}
                  onChangeText={setUtrNumber}
                  placeholder="Enter UTR number"
                  placeholderTextColor="#64748b"
                  style={styles.input}
                />
                <Pressable style={styles.uploadButton} onPress={pickProofImage}>
                  <Text style={styles.uploadButtonText}>{proofImage ? 'Change proof screenshot' : 'Upload proof screenshot'}</Text>
                </Pressable>
                {proofImage ? <Text style={styles.proofName}>{proofImage.name}</Text> : null}
                <PrimaryButton title={processing ? 'Processing…' : 'Submit deposit request'} onPress={handleDeposit} disabled={processing || !selectedMethodConfigured} loading={processing} compact />
              </>
            )}
          </>
        )}

        {action === 'withdraw' && (
          <>
            <Text style={styles.sectionHeading}>Withdraw to bank account</Text>
            {isSyncing ? <Text style={styles.syncingText}>Syncing…</Text> : null}
            {bankAccounts.length === 0 ? (
              <Text style={styles.errorText}>Add a bank account before requesting a withdrawal.</Text>
            ) : (
              <>
                <Pressable style={styles.withdrawAccountSelector} onPress={() => setBankPickerOpen(true)}>
                  <View style={styles.withdrawAccountSelectorText}>
                    <Text style={styles.withdrawAccountName}>{bankAccounts.find((account) => account.id === selectedBankAccountId)?.holder || 'Select bank account'}</Text>
                    <Text style={styles.withdrawAccountText}>
                      {(() => {
                        const account = bankAccounts.find((item) => item.id === selectedBankAccountId);
                        return account ? `${account.bankName} • ${account.accountNumber}` : 'Choose where to receive your withdrawal';
                      })()}
                    </Text>
                  </View>
                  <Text style={styles.withdrawAccountChevron}>▾</Text>
                </Pressable>
                <Modal visible={bankPickerOpen} transparent animationType="slide" onRequestClose={() => setBankPickerOpen(false)}>
                  <View style={styles.bankPickerBackdrop}>
                    <View style={styles.bankPickerSheet}>
                      <View style={styles.bankPickerHeader}>
                        <Text style={styles.sectionHeading}>Select bank account</Text>
                        <Pressable onPress={() => setBankPickerOpen(false)}><Text style={styles.bankPickerClose}>Close</Text></Pressable>
                      </View>
                      <ScrollView style={styles.bankPickerList}>
                        {bankAccounts.map((account) => (
                          <Pressable
                            key={account.id}
                            style={[styles.withdrawAccountOption, selectedBankAccountId === account.id && styles.withdrawAccountOptionActive]}
                            onPress={() => {
                              setSelectedBankAccountId(account.id);
                              setBankPickerOpen(false);
                            }}
                          >
                            <Text style={styles.withdrawAccountName}>{account.holder}</Text>
                            <Text style={styles.withdrawAccountText}>{account.bankName} • {account.ifsc}</Text>
                            <Text style={styles.withdrawAccountText}>{account.accountNumber}</Text>
                          </Pressable>
                        ))}
                      </ScrollView>
                    </View>
                  </View>
                </Modal>
              </>
            )}
            <TextInput
              value={withdrawAmount}
              onChangeText={setWithdrawAmount}
              keyboardType="numeric"
              placeholder="Withdrawal amount"
              placeholderTextColor="#64748b"
              style={styles.input}
            />
            <PrimaryButton title={processing ? 'Processing…' : 'Request withdrawal'} onPress={handleWithdraw} disabled={processing} loading={processing} compact />
          </>
        )}

        {action === 'transactions' && (
          <>
            {filteredTransactions.length > 0 ? (
              filteredTransactions.map((item) => {
                const status = item.status === 'completed' || item.status === 'succeeded' ? 'successful' : item.status === 'rejected' ? 'failed' : item.status;
                const isCredit = ['deposit', 'earning', 'bonus'].includes(item.type);
                const signedAmount = `${isCredit ? '+' : '-'}₹${Number(item.amount || 0).toLocaleString('en-IN')}`;
                return (
                <View key={item.id} style={styles.transactionItem}>
                  <View style={styles.transactionInfo}>
                    <Text style={styles.transactionType}>{item.type?.toUpperCase() ?? 'TRANSACTION'}</Text>
                    <Text style={styles.transactionText}>{item.description || item.paymentMethod || 'No description'}</Text>
                  </View>
                  <View style={styles.transactionMeta}>
                    <Text style={styles.transactionDate}>{new Date(item.createdAt).toLocaleDateString()}</Text>
                    <View style={styles.transactionStatusBlock}>
                      <Text style={[styles.transactionStatus, status === 'successful' ? styles.successfulStatus : status === 'failed' ? styles.failedStatus : styles.processingStatus]}>{status}</Text>
                      <Text style={[styles.transactionAmount, isCredit ? styles.creditAmount : styles.debitAmount]}>{signedAmount}</Text>
                    </View>
                  </View>
                </View>
                );
              })
            ) : (
              <Text style={styles.emptyText}>No transactions found.</Text>
            )}
          </>
        )}

        {action === 'bank' && (
          <>
            {bankError ? (
              (() => {
                const { getUserFriendlyError } = require('../utils/networkErrors');
                const friendly = getUserFriendlyError(bankError);
                return friendly ? <Text style={styles.errorText}>{friendly}</Text> : <Text style={styles.errorText}>{bankError}</Text>;
              })()
            ) : null}
            <TextInput
              value={bankForm.holder}
              onChangeText={(value) => updateBankForm('holder', value)}
              placeholder="Account holder name"
              placeholderTextColor="#64748b"
              style={styles.input}
            />
            <TextInput
              value={bankForm.accountNumber}
              onChangeText={(value) => updateBankForm('accountNumber', value)}
              keyboardType="numeric"
              placeholder="Account number"
              placeholderTextColor="#64748b"
              style={styles.input}
            />
            <TextInput
              value={bankForm.confirmAccountNumber}
              onChangeText={(value) => updateBankForm('confirmAccountNumber', value)}
              keyboardType="numeric"
              placeholder="Confirm account number"
              placeholderTextColor="#64748b"
              style={styles.input}
            />
            <TextInput
              value={bankForm.bankName}
              onChangeText={(value) => updateBankForm('bankName', value)}
              placeholder="Bank name"
              placeholderTextColor="#64748b"
              style={styles.input}
            />
            <TextInput
              value={bankForm.ifsc}
              onChangeText={(value) => updateBankForm('ifsc', value)}
              placeholder="IFSC code"
              placeholderTextColor="#64748b"
              style={styles.input}
            />
            <Text style={styles.bankVerificationHint}>Enter the email code to verify and save this account automatically.</Text>
            <View style={styles.bankOtpRow}>
              <TextInput
                value={bankOtp}
                onChangeText={handleBankOtpChange}
                placeholder="6-digit email OTP"
                placeholderTextColor="#64748b"
                keyboardType="number-pad"
                maxLength={6}
                style={[styles.input, styles.bankOtpInput]}
                editable={bankOtpSent && !processing}
              />
              <Pressable
                accessibilityRole="button"
                onPress={handleSendBankOtp}
                disabled={sendingBankOtp || processing}
                style={({ pressed }) => [styles.bankOtpSendButton, (pressed || sendingBankOtp || processing) && styles.bankOtpSendButtonDisabled]}
              >
                <Text style={styles.bankOtpSendText}>{sendingBankOtp ? 'Sending…' : bankOtpSent ? 'Resend OTP' : 'Send OTP'}</Text>
              </Pressable>
            </View>
            {processing ? <Text style={styles.bankVerificationHint}>Verifying code and saving account…</Text> : null}
            <Text style={[styles.sectionHeading, { marginTop: 20 }]}>Saved bank accounts</Text>
            {bankAccounts.length === 0 ? (
              <Text style={styles.emptyText}>No bank account added.</Text>
            ) : (
              bankAccounts.map((account) => (
                <View key={account.id} style={styles.bankAccountCard}>
                  <View style={styles.bankAccountInfo}>
                    <Text style={styles.bankAccountName}>{account.holder}</Text>
                    <Text style={styles.bankAccountText}>{account.bankName} • {account.ifsc}</Text>
                    <Text style={styles.bankAccountText}>{account.accountNumber}</Text>
                  </View>
                  <Pressable style={styles.bankRemoveButton} onPress={() => handleRemoveBankAccount(account.id)}>
                    <Text style={styles.bankRemoveText}>Remove</Text>
                  </Pressable>
                </View>
              ))
            )}
          </>
        )}
      </SectionCard>
      <View style={styles.bottomButtonRow}>
        <PrimaryButton title="Back" onPress={() => navigation.goBack()} compact />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  contentContainer: {
    padding: 24,
    paddingBottom: 48,
  },
  headerRow: {
    marginBottom: 20,
  },
  heading: {
    color: '#f8fafc',
    fontSize: 28,
    fontWeight: '700',
  },
  loader: {
    marginVertical: 24,
  },
  balanceSection: {
    marginBottom: 18,
  },
  balanceValue: {
    color: '#fbbf24',
    fontSize: 36,
    fontWeight: '700',
    marginTop: 12,
  },
  walletHint: {
    color: '#94a3b8',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 12,
  },
  expandedSection: {
    backgroundColor: '#111827',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: '#1f2937',
    padding: 22,
  },
  bottomButtonRow: {
    alignItems: 'center',
    marginTop: 24,
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
  methodRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  methodButton: {
    flex: 1,
    backgroundColor: '#111827',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#334155',
    paddingVertical: 9,
    marginRight: 8,
    alignItems: 'center',
  },
  methodButtonActive: {
    backgroundColor: '#fbbf24',
    borderColor: '#fbbf24',
  },
  methodText: {
    color: '#cbd5e1',
    fontWeight: '700',
  },
  methodTextActive: {
    color: '#070707',
  },
  transactionItem: {
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1f2937',
  },
  transactionInfo: {
    marginBottom: 10,
  },
  transactionType: {
    color: '#f8fafc',
    fontWeight: '700',
    fontSize: 15,
  },
  transactionText: {
    color: '#cbd5e1',
    fontSize: 14,
    marginTop: 4,
  },
  transactionMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  transactionStatusBlock: {
    alignItems: 'flex-end',
  },
  transactionStatus: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'capitalize',
    marginBottom: 4,
  },
  processingStatus: {
    color: '#fbbf24',
  },
  successfulStatus: {
    color: '#22c55e',
  },
  failedStatus: {
    color: '#f87171',
  },
  transactionDate: {
    color: '#94a3b8',
    fontSize: 12,
  },
  transactionAmount: {
    fontWeight: '700',
  },
  creditAmount: {
    color: '#22c55e',
  },
  debitAmount: {
    color: '#f87171',
  },
  completedAmount: {
    color: '#22c55e',
  },
  pendingAmount: {
    color: '#fbbf24',
  },
  emptyText: {
    color: '#94a3b8',
  },
  sectionHeading: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '700',
  },
  bankVerificationHint: {
    color: '#94a3b8',
    fontSize: 13,
    marginBottom: 8,
  },
  bankOtpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  bankOtpInput: {
    flex: 1,
    marginBottom: 0,
  },
  bankOtpSendButton: {
    marginLeft: 10,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
  },
  bankOtpSendButtonDisabled: {
    opacity: 0.55,
  },
  bankOtpSendText: {
    color: '#fbbf24',
    fontSize: 12,
    fontWeight: '700',
  },
  infoText: {
    color: '#cbd5e1',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
  },
  paymentSection: {
    backgroundColor: '#111827',
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
  },
  withdrawAccounts: {
    marginTop: 12,
    marginBottom: 16,
  },
  withdrawAccountSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0f172a',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#fbbf24',
    padding: 14,
    marginTop: 12,
    marginBottom: 16,
  },
  withdrawAccountSelectorText: {
    flex: 1,
    marginRight: 12,
  },
  withdrawAccountChevron: {
    color: '#fbbf24',
    fontSize: 22,
    fontWeight: '700',
  },
  withdrawAccountOption: {
    backgroundColor: '#0f172a',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#334155',
    padding: 14,
    marginBottom: 10,
  },
  withdrawAccountOptionActive: {
    borderColor: '#fbbf24',
    backgroundColor: '#172033',
  },
  withdrawAccountName: {
    color: '#f8fafc',
    fontWeight: '700',
    fontSize: 15,
  },
  withdrawAccountText: {
    color: '#cbd5e1',
    fontSize: 13,
    marginTop: 3,
  },
  bankPickerBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  bankPickerSheet: {
    maxHeight: '78%',
    backgroundColor: '#111827',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
  },
  bankPickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  bankPickerClose: {
    color: '#fbbf24',
    fontWeight: '700',
  },
  bankPickerList: {
    maxHeight: 420,
  },
  debugText: {
    color: '#64748b',
    fontSize: 11,
    marginBottom: 12,
  },
  syncingText: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 6,
  },
  bankAccountCard: {
    backgroundColor: '#0f172a',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#1f2937',
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  bankAccountInfo: {
    flex: 1,
    marginRight: 12,
  },
  bankAccountName: {
    color: '#f8fafc',
    fontWeight: '700',
    fontSize: 15,
    marginBottom: 4,
  },
  bankAccountText: {
    color: '#cbd5e1',
    fontSize: 13,
    marginTop: 2,
  },
  bankRemoveButton: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#ef4444',
  },
  bankRemoveText: {
    color: '#ef4444',
    fontWeight: '700',
  },
  uploadButton: {
    backgroundColor: '#111827',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#334155',
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 10,
  },
  uploadButtonText: {
    color: '#f8fafc',
    fontWeight: '700',
  },
  proofName: {
    color: '#94a3b8',
    fontSize: 13,
    marginBottom: 14,
  },
  depositDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  depositDetailLabel: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '700',
  },
  depositDetailValue: {
    color: '#f8fafc',
    fontSize: 13,
    flex: 1,
    textAlign: 'right',
  },
  depositInstructions: {
    color: '#cbd5e1',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 16,
  },
  qrPreviewContainer: {
    marginBottom: 14,
  },
  qrPreviewImage: {
    width: '100%',
    height: 180,
    borderRadius: 16,
    marginTop: 8,
    backgroundColor: '#ffffff',
  },
  errorText: {
    color: '#f87171',
    marginBottom: 12,
    fontSize: 14,
  },
});
