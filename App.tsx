import { ActivityIndicator, AppState, Linking, StyleSheet, View, StatusBar } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { useEffect, useState, useRef } from 'react';
import { enableScreens } from 'react-native-screens';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from './src/contexts/AuthContext';
import { ToastProvider } from './src/contexts/ToastContext';
import HomeScreen from './src/screens/HomeScreen';
import LoginScreen from './src/screens/LoginScreen';
import SignupScreen from './src/screens/SignupScreen';
import ForgotPasswordScreen from './src/screens/ForgotPasswordScreen';
import WalletScreen from './src/screens/WalletScreen';
import WalletActionScreen from './src/screens/WalletActionScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import ReferralScreen from './src/screens/ReferralScreen';
import SupportScreen from './src/screens/SupportScreen';
import InvestmentScreen from './src/screens/InvestmentScreen';
import TwoFactorSetupScreen from './src/screens/TwoFactorSetupScreen';
import UnlockScreen from './src/screens/UnlockScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();
const PENDING_REFERRAL_CODE_KEY = 'pendingReferralCode';

function getReferralCodeFromUrl(url: string) {
  const match = url.match(/[?&]ref=([^&#]+)/i);
  if (!match?.[1]) return null;

  try {
    const code = decodeURIComponent(match[1]).trim().replace(/[^a-z0-9]/gi, '').toUpperCase();
    return code && code.length <= 32 ? code : null;
  } catch {
    return null;
  }
}

function MainTabs() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  return (
    <Tab.Navigator
      sceneContainerStyle={{ backgroundColor: '#090b15' }}
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: '#fbbf24',
        tabBarInactiveTintColor: '#94a3b8',
        tabBarStyle: {
          backgroundColor: '#0f172a',
          borderTopColor: '#334155',
          paddingBottom: 8 + insets.bottom,
          paddingTop: 8,
          height: 64 + insets.bottom,
        },
        tabBarIcon: ({ color, size }) => {
          let iconName: 'home' | 'wallet-outline' | 'briefcase-outline' | 'account-outline' = 'home';

          if (route.name === 'HomeTab') {
            iconName = 'home';
          } else if (route.name === 'Wallet') {
            iconName = 'wallet-outline';
          } else if (route.name === 'Investment') {
            iconName = 'briefcase-outline';
          } else if (route.name === 'Profile') {
            iconName = 'account-outline';
          }

          return <MaterialCommunityIcons name={iconName} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="HomeTab" component={HomeScreen} options={{ title: 'Home' }} />
      {user && <Tab.Screen name="Wallet" component={WalletScreen} options={{ title: 'Wallet' }} />}
      {user && <Tab.Screen name="Investment" component={InvestmentScreen} options={{ title: 'Portfolio' }} />}
      {user && <Tab.Screen name="Profile" component={ProfileScreen} options={{ title: 'Profile' }} />}
    </Tab.Navigator>
  );
}

enableScreens();

function AppNavigation() {
  const { user, token, loading } = useAuth();
  const [investmentLocked, setInvestmentLocked] = useState(false);
  const isAuthenticated = !!user && !!token;
  const navigationRef = useRef<any>(null);
  const hasPromptedRef = useRef(false);

  useEffect(() => {
    if (!isAuthenticated) {
      setInvestmentLocked(false);
      hasPromptedRef.current = false;
    }
  }, [isAuthenticated]);

  useEffect(() => {
    let active = true;
    const handleReferralUrl = async (url?: string | null) => {
      if (!url) return;
      const code = getReferralCodeFromUrl(url);
      if (!code) return;

      await AsyncStorage.setItem(PENDING_REFERRAL_CODE_KEY, code);
      if (active && !isAuthenticated && navigationRef.current?.isReady?.()) {
        navigationRef.current.navigate('Signup', { referralCode: code });
      }
    };

    void Linking.getInitialURL().then(handleReferralUrl).catch(() => {});
    const subscription = Linking.addEventListener('url', ({ url }) => {
      void handleReferralUrl(url);
    });

    return () => {
      active = false;
      subscription.remove();
    };
  }, [isAuthenticated]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      const routeName = navigationRef.current?.getCurrentRoute?.()?.name;
      if (nextAppState === 'active') {
        if (isAuthenticated && routeName === 'HomeTab' && !hasPromptedRef.current) {
          hasPromptedRef.current = true;
          setInvestmentLocked(true);
        }
      }
    });

    return () => {
      subscription.remove();
    };
  }, [isAuthenticated]);

  if (loading) {
    // Avoid rendering an in-app loading spinner before the app UI is ready.
    // Let the native splash screen remain visible instead.
    return null;
  }

  const navTheme = {
    ...DefaultTheme,
    colors: {
      ...DefaultTheme.colors,
      background: '#090b15',
    },
  };

  return (
    <>
    <View style={styles.appBackground}>
      <StatusBar backgroundColor="#090b15" barStyle="light-content" />
      <NavigationContainer
      ref={navigationRef}
      theme={navTheme}
      onReady={() => {
        const routeName = navigationRef.current?.getCurrentRoute?.()?.name;
        if (isAuthenticated && routeName === 'HomeTab' && !hasPromptedRef.current) {
            hasPromptedRef.current = true;
            setInvestmentLocked(true);
          }
        if (!isAuthenticated) {
          void AsyncStorage.getItem(PENDING_REFERRAL_CODE_KEY).then((code) => {
            if (code) navigationRef.current?.navigate('Signup', { referralCode: code });
          }).catch(() => {});
        }
      }}
      onStateChange={() => {
        const routeName = navigationRef.current?.getCurrentRoute?.()?.name;
        if (isAuthenticated && routeName === 'HomeTab' && !hasPromptedRef.current) {
          hasPromptedRef.current = true;
          setInvestmentLocked(true);
        }
      }}
    >
      <Stack.Navigator
        screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#090b15' }, animation: 'fade' }}
      >
        {isAuthenticated ? (
          <>
            <Stack.Screen name="MainTabs" component={MainTabs} />
            <Stack.Screen name="WalletAction" component={WalletActionScreen} />
            <Stack.Screen name="Referral" component={ReferralScreen} />
            <Stack.Screen name="Support" component={SupportScreen} />
            <Stack.Screen name="TwoFactorSetup" component={TwoFactorSetupScreen} />
          </>
        ) : (
          <>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Signup" component={SignupScreen} />
            <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
          </>
        )}
      </Stack.Navigator>
      </NavigationContainer>
      {isAuthenticated && investmentLocked ? <UnlockScreen onUnlock={() => setInvestmentLocked(false)} /> : null}
    </View>
    </>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <ToastProvider>
          <AppNavigation />
        </ToastProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#090b15',
  },
  appBackground: {
    flex: 1,
    backgroundColor: '#090b15',
  },
});
