import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

interface User {
  username: string;
  email: string;
  balance: number;
  phoneNumber?: string;
  twoFactorEnabled?: boolean;
  referralCode?: string | null;
  referralBonusEarned?: number;
  referralCount?: number;
}

interface AuthContextValue {
  user: User | null;
  token: string | null;
  loading: boolean;
  signIn: (userData: User, token: string) => Promise<void>;
  signOut: () => Promise<void>;
  updateUser: (userData: Partial<User>) => Promise<void>;
  bankAccounts: any[];
  transactions: any[];
  portfolio: any | null;
  setBankAccounts: (accounts: any[]) => void;
  setTransactions: (txs: any[]) => void;
  setPortfolio: (p: any) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [bankAccounts, setBankAccountsState] = useState<any[]>([]);
  const [transactions, setTransactionsState] = useState<any[]>([]);
  const [portfolio, setPortfolioState] = useState<any | null>(null);

  useEffect(() => {
    const loadAuth = async () => {
      try {
        const stored = await AsyncStorage.getItem('user');
        const storedToken = await AsyncStorage.getItem('sessionToken');
        if (stored && storedToken) {
          setUser(JSON.parse(stored));
          setToken(storedToken);
        } else {
          await AsyncStorage.removeItem('user');
          await AsyncStorage.removeItem('sessionToken');
          setUser(null);
          setToken(null);
        }
        // load cached bank accounts and wallet transactions into memory so they persist
        try {
          const cachedBank = await AsyncStorage.getItem('cachedBankAccounts');
          if (cachedBank) setBankAccountsState(JSON.parse(cachedBank));
        } catch (e) {}
        try {
          const cachedWallet = await AsyncStorage.getItem('cachedWallet');
          if (cachedWallet) {
            const parsed = JSON.parse(cachedWallet);
            setTransactionsState(parsed.transactions || []);
          }
        } catch (e) {}
        try {
          const cachedPortfolio = await AsyncStorage.getItem('cachedPortfolio');
          if (cachedPortfolio) {
            setPortfolioState(JSON.parse(cachedPortfolio));
          }
        } catch (e) {}
      } catch (e) {
        setUser(null);
        setToken(null);
      } finally {
        setLoading(false);
      }
    };
    loadAuth();
  }, []);

  const signIn = async (userData: User, sessionToken: string) => {
    await AsyncStorage.setItem('user', JSON.stringify(userData));
    await AsyncStorage.setItem('sessionToken', sessionToken);
    setUser(userData);
    setToken(sessionToken);
  };

  const setBankAccounts = (accounts: any[]) => {
    setBankAccountsState(accounts || []);
    try {
      AsyncStorage.setItem('cachedBankAccounts', JSON.stringify(accounts || []));
    } catch (e) {}
  };

  const setTransactions = (txs: any[]) => {
    setTransactionsState(txs || []);
    try {
      AsyncStorage.setItem('cachedWallet', JSON.stringify({ balance: user?.balance ?? 0, transactions: txs || [] }));
    } catch (e) {}
  };

  const setPortfolio = (p: any) => {
    setPortfolioState(p || null);
    try {
      AsyncStorage.setItem('cachedPortfolio', JSON.stringify(p || null));
    } catch (e) {}
  };

  const updateUser = async (updates: Partial<User>) => {
    if (!user) return;
    const nextUser = { ...user, ...updates };
    try {
      const current = JSON.stringify(user);
      const next = JSON.stringify(nextUser);
      if (current === next) return; // nothing changed
    } catch (e) {
      // fallback to always update if serialization fails
    }

    try {
      await AsyncStorage.setItem('user', JSON.stringify(nextUser));
    } catch (e) {
      // ignore storage errors
    }
    setUser(nextUser);
  };

  const signOut = async () => {
    await AsyncStorage.removeItem('user');
    await AsyncStorage.removeItem('sessionToken');
    setUser(null);
    setToken(null);
  };

  return (
    <AuthContext.Provider
      value={{ user, token, loading, signIn, signOut, updateUser, bankAccounts, transactions, portfolio, setBankAccounts, setTransactions, setPortfolio }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return value;
}
