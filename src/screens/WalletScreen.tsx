import { useCallback, useEffect, useState, useRef } from 'react';
import { Pressable, RefreshControl, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useToast } from '../contexts/ToastContext';
import { deposit, fetchWalletBalance, withdraw } from '../data/api';
import PrimaryButton from '../components/PrimaryButton';
import SectionCard from '../components/SectionCard';
import { useAutoRefresh } from '../hooks/useAutoRefresh';

export default function WalletScreen() {
  const navigation = useNavigation<any>();
  const { user, updateUser, bankAccounts, transactions: authTransactions, setBankAccounts: setAuthBankAccounts, setTransactions: setAuthTransactions } = useAuth();
  const [loading, setLoading] = useState(true);
  const [balance, setBalance] = useState<number | null>(user?.balance ?? null);
  const [transactions, setTransactions] = useState<any[]>(authTransactions || []);
  const [depositAmount, setDepositAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('upi');
  const [processing, setProcessing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const isRunningRef = useRef(false);
  const processingRef = useRef(false);

  const refreshWalletData = useCallback(async () => {
    if (!user?.email) {
      setBalance(null);
      setTransactions([]);
      return;
    }

    if (isRunningRef.current) return;
    isRunningRef.current = true;
    try {
      const data = await fetchWalletBalance();
      const nextBalance = data.balance ?? user?.balance ?? 0;
      await updateUser({ balance: nextBalance });
      setBalance(nextBalance);
      setTransactions(data.transactions || []);
    } finally {
      isRunningRef.current = false;
    }
  }, [user?.email, updateUser]);

  const { isRefreshing, error: refreshError } = useAutoRefresh(refreshWalletData, [user?.email], 10000, Boolean(user));

  const { showSuccess, showError } = useToast();

  const loadWallet = useCallback(async () => {
    setLoading(true);
    try {
      if (__DEV__) console.log('WalletScreen.loadWallet user=', user?.email);
      // Try to use initial login payload saved at sign-in for immediate UI
      if (isRunningRef.current) {
        setLoading(false);
        return;
      }
      isRunningRef.current = true;
      try {
        const initial = await AsyncStorage.getItem('initialLoginData');
        if (initial) {
          const parsed = JSON.parse(initial);
          if (parsed?.wallet) {
            if (__DEV__) console.log('WalletScreen: found initialLoginData.wallet', parsed.wallet);
            const data = parsed.wallet;
            const nextBalance = data.balance ?? user?.balance ?? 0;
            await updateUser({ balance: nextBalance });
            setBalance(nextBalance);
            setTransactions(data.transactions || []);
            setIsSyncing(true);

            // kick off a background refresh to replace cached data with fresh server data
            (async () => {
              try {
                const fresh = await fetchWalletBalance();
                const freshBalance = fresh.balance ?? nextBalance;
                await updateUser({ balance: freshBalance });
                setBalance(freshBalance);
                setTransactions(fresh.transactions || []);
                try {
                  await AsyncStorage.setItem('cachedWallet', JSON.stringify({ balance: freshBalance, transactions: fresh.transactions || [] }));
                } catch (e) {}
              } catch (e) {
                // ignore network errors here
              } finally {
                setIsSyncing(false);
              }
            })();

            // remove initial payload marker so other screens don't reuse it
            await AsyncStorage.removeItem('initialLoginData');
            setLoading(false);
            return;
          }
        }
      } catch (e) {
        console.warn('initial login data read failed', (e as any)?.message || e);
      }
      const data = await fetchWalletBalance();
      const nextBalance = data.balance ?? user?.balance ?? 0;
      await updateUser({ balance: nextBalance });
      setBalance(nextBalance);
      setTransactions(data.transactions || []);
      // persist in AuthContext so it stays until app close
      try { setAuthTransactions(data.transactions || []); } catch (e) {}
      // persist latest wallet for instant display on next login
      try {
        await AsyncStorage.setItem('cachedWallet', JSON.stringify({ balance: nextBalance, transactions: data.transactions || [] }));
      } catch (e) {
        // ignore
      }
    } catch (error: any) {
      showError(error.message || 'Unable to load wallet');
    } finally {
      isRunningRef.current = false;
      setLoading(false);
    }
  }, [updateUser, setAuthTransactions]);

  useEffect(() => {
    if (user?.email) {
      loadWallet();
    }
  }, [user?.email, loadWallet]);

  // keep local state in sync with AuthContext when it updates
  useEffect(() => {
    if (authTransactions && authTransactions.length > 0) setTransactions(authTransactions);
    if (typeof user?.balance === 'number') setBalance(user.balance);
  }, [authTransactions, user?.balance]);

  useFocusEffect(
    useCallback(() => {
      if (user?.email) {
        void loadWallet();
      }
    }, [user?.email, loadWallet]),
  );

  const handleDeposit = async () => {
    if (processingRef.current) return;

    const amount = Number(depositAmount);
      processingRef.current = true;
      setProcessing(true);
    if (!amount || amount < 100) {
      showError('Enter deposit amount of at least ₹100');
      return;
    }
    setProcessing(true);
    try {
      const result = await deposit(amount, paymentMethod);
      const nextBalance = typeof result.balance === 'number' ? result.balance : (balance ?? 0) + amount;
      await updateUser({ balance: nextBalance });
      setBalance(nextBalance);
      showSuccess(`Payment order created with id: ${result.orderId || 'N/A'}`);
      setDepositAmount('');
      await loadWallet();
    } catch (error: any) {
      showError(error.message || 'Unable to create deposit');
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
    setProcessing(true);
    try {
      const result = await withdraw(amount, paymentMethod);
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

  const walletCards = [
    {
      key: 'deposit',
      title: 'Deposit',
      description: 'Add funds to your wallet with UPI or Razorpay.',
    },
    {
      key: 'withdraw',
      title: 'Withdraw',
      description: 'Request a payout from your wallet balance.',
    },
    {
      key: 'transactions',
      title: 'Transactions',
      description: 'View your wallet history and activity.',
    },
    {
      key: 'bank',
      title: 'Bank account',
      description: 'Add or remove bank accounts for withdrawals.',
    },
  ] as const;

  if (!user) {
    return (
      <SafeAreaView style={styles.emptyState}>
        <Text style={styles.emptyText}>Please log in to access wallet features.</Text>
        <PrimaryButton title="Login" onPress={() => navigation.navigate('Login')} />
      </SafeAreaView>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => refreshWalletData()} colors={['#fbbf24']} tintColor="#fbbf24" />}
    >
      <SectionCard title="Wallet balance" style={styles.balanceSection}>
        <View style={styles.balanceHeaderRow}>
          <Text style={styles.balanceValue}>₹{balance?.toLocaleString() ?? '0'}</Text>
          {isSyncing ? <Text style={styles.syncingText}>Syncing…</Text> : null}
        </View>
        {refreshError ? (
          (() => {
            const { getUserFriendlyError } = require('../utils/networkErrors');
            const friendly = getUserFriendlyError(refreshError);
            return friendly ? <Text style={styles.errorText}>{friendly}</Text> : null;
          })()
        ) : null}
      </SectionCard>

      <View style={styles.quickGrid}>
        {walletCards.map((card) => (
          <Pressable
            key={card.key}
            onPress={() => navigation.navigate('WalletAction', { action: card.key })}
            style={({ pressed }) => [styles.cardPressable, pressed && styles.cardPressed]}
          >
            <SectionCard title={card.title} style={styles.optionCard}>
              <View />
            </SectionCard>
          </Pressable>
        ))}
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
  heading: {
    color: '#f8fafc',
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 8,
  },
  subheading: {
    color: '#cbd5e1',
    fontSize: 16,
    marginBottom: 20,
  },
  loader: {
    marginVertical: 24,
  },
  balanceSection: {
    marginBottom: 18,
  },
  balanceValue: {
    color: '#10b981',
    fontSize: 36,
    fontWeight: '700',
    marginTop: 12,
  },
  syncingText: {
    color: '#94a3b8',
    fontSize: 12,
    marginLeft: 10,
    marginTop: 16,
  },
  quickGrid: {
    marginBottom: 16,
  },
  cardPressable: {
    marginBottom: 14,
  },
  cardPressed: {
    opacity: 0.95,
  },
  optionCard: {
    borderRadius: 24,
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#1f2937',
    padding: 20,
  },
  optionCardActive: {
    backgroundColor: '#0f172a',
    borderColor: '#fbbf24',
  },
  featureDescription: {
    color: '#94a3b8',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  sectionHint: {
    color: '#94a3b8',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
  },
  sectionHeading: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '700',
  },
  errorText: {
    color: '#f87171',
    marginBottom: 12,
    fontSize: 14,
  },
  statusText: {
    color: '#93c5fd',
    fontSize: 12,
    marginTop: 6,
  },
  balanceHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
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
    marginBottom: 18,
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
    paddingVertical: 14,
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
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    padding: 24,
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
  transactionDate: {
    color: '#94a3b8',
    fontSize: 12,
  },
  transactionAmount: {
    fontWeight: '700',
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
});
