import { useCallback, useRef, useState } from 'react';
import { PanResponder, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, Mask, Path, Rect } from 'react-native-svg';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { fetchScratchCards, scratchScratchCard } from '../data/api';

type ScratchCard = {
  id: string;
  investmentAmount: number;
  investmentName: string;
  createdAt: string;
  scratchedAt: string | null;
  rewardAmount: number | null;
};

function formatCurrency(value: number) {
  return `₹${Number(value || 0).toLocaleString('en-IN')}`;
}

function ScratchCardTile({ card, onScratch }: { card: ScratchCard; onScratch: (id: string) => Promise<boolean> }) {
  const [scratchPath, setScratchPath] = useState('');
  const [scratchedCells, setScratchedCells] = useState<string[]>([]);
  const [scratchWidth, setScratchWidth] = useState(1);
  const widthRef = useRef(1);
  const scratchPathRef = useRef('');
  const cellsRef = useRef(new Set<string>());
  const claimingRef = useRef(false);
  const onScratchRef = useRef(onScratch);
  onScratchRef.current = onScratch;

  const addScratchPoint = (x: number, y: number, start = false) => {
    const boundedX = Math.max(0, Math.min(widthRef.current, x));
    const boundedY = Math.max(0, Math.min(104, y));
    scratchPathRef.current += `${start || !scratchPathRef.current ? 'M' : ' L'}${boundedX} ${boundedY}`;
    setScratchPath(scratchPathRef.current);

    const column = Math.min(5, Math.floor((boundedX / widthRef.current) * 6));
    const row = Math.min(2, Math.floor((boundedY / 104) * 3));
    cellsRef.current.add(`${column}-${row}`);
    setScratchedCells(Array.from(cellsRef.current));

    if (cellsRef.current.size >= 8 && !claimingRef.current) {
      claimingRef.current = true;
      void onScratchRef.current(card.id).then((success) => {
        if (success) return;
        claimingRef.current = false;
        scratchPathRef.current = '';
        cellsRef.current.clear();
        setScratchPath('');
        setScratchedCells([]);
      });
    }
  };

  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => !card.scratchedAt,
    onMoveShouldSetPanResponder: () => !card.scratchedAt,
    onPanResponderGrant: (event) => addScratchPoint(event.nativeEvent.locationX, event.nativeEvent.locationY, true),
    onPanResponderMove: (event) => addScratchPoint(event.nativeEvent.locationX, event.nativeEvent.locationY),
  })).current;

  return (
    <View style={styles.card}>
      <View style={styles.cardTopRow}>
        <View style={styles.cardIcon}><MaterialCommunityIcons name="ticket-percent-outline" size={22} color="#fbbf24" /></View>
        <View style={styles.cardDetails}>
          <Text style={styles.cardTitle}>{card.investmentName || 'Investment reward'}</Text>
          <Text style={styles.cardMeta}>Invested {formatCurrency(card.investmentAmount)} · {new Date(card.createdAt).toLocaleDateString('en-IN')}</Text>
        </View>
        <MaterialCommunityIcons name={card.scratchedAt ? 'check-circle' : 'gift-outline'} size={22} color={card.scratchedAt ? '#34d399' : '#fbbf24'} />
      </View>

      {card.scratchedAt ? (
        <View style={styles.revealedReward}>
          <MaterialCommunityIcons name="wallet-plus-outline" size={26} color="#34d399" />
          <View>
            <Text style={styles.rewardCaption}>Credited to your wallet</Text>
            <Text style={styles.rewardAmount}>{formatCurrency(card.rewardAmount || 0)}</Text>
          </View>
        </View>
      ) : (
        <>
          <View style={styles.prizePreview}>
            <Text style={styles.previewLabel}>YOUR REWARD</Text>
            <Text style={styles.previewAmount}>₹ ? ? ?</Text>
          </View>
          <View
            style={styles.scratchArea}
            onLayout={(event) => {
              widthRef.current = event.nativeEvent.layout.width;
              setScratchWidth(event.nativeEvent.layout.width);
            }}
            {...panResponder.panHandlers}
            accessibilityRole="button"
            accessibilityLabel="Scratch to reveal your reward"
          >
            <Svg width="100%" height="104" viewBox={`0 0 ${scratchWidth} 104`}>
              <Defs>
                <Mask id={`scratch-mask-${card.id}`} maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse">
                  <Rect width="100%" height="104" fill="white" />
                  <Path d={scratchPath} stroke="black" strokeWidth="34" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                </Mask>
              </Defs>
              <Rect width="100%" height="104" fill="#94a3b8" mask={`url(#scratch-mask-${card.id})`} />
              <Path d="M0 25 H500 M0 78 H500" stroke="#cbd5e1" strokeWidth="1" opacity="0.35" pointerEvents="none" />
            </Svg>
            <View pointerEvents="none" style={styles.scratchPrompt}>
              <MaterialCommunityIcons name="gesture-swipe" size={20} color="#0f172a" />
              <Text style={styles.scratchPromptText}>Scratch to reveal · {Math.min(scratchedCells.length, 8)}/8</Text>
            </View>
          </View>
        </>
      )}
    </View>
  );
}

export default function RewardsScreen() {
  const navigation = useNavigation<any>();
  const { updateUser } = useAuth();
  const { showSuccess, showError } = useToast();
  const [cards, setCards] = useState<ScratchCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [scratchingId, setScratchingId] = useState<string | null>(null);

  const loadCards = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchScratchCards();
      setCards(Array.isArray(result.cards) ? result.cards : []);
    } catch (error: any) {
      showError(error?.message || 'Unable to load rewards');
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useFocusEffect(useCallback(() => {
    void loadCards();
  }, [loadCards]));

  const handleScratch = async (cardId: string): Promise<boolean> => {
    if (scratchingId) return false;
    setScratchingId(cardId);
    try {
      const result = await scratchScratchCard(cardId);
      setCards((current) => current.map((card) => card.id === cardId
        ? { ...card, scratchedAt: new Date().toISOString(), rewardAmount: Number(result.rewardAmount || 0) }
        : card));
      if (typeof result.balance === 'number') await updateUser({ balance: result.balance });
      showSuccess(`${formatCurrency(Number(result.rewardAmount || 0))} credited to your wallet.`);
      return true;
    } catch (error: any) {
      showError(error?.message || 'Unable to scratch this card');
      void loadCards();
      return false;
    } finally {
      setScratchingId(null);
    }
  };

  const pendingCount = cards.filter((card) => !card.scratchedAt).length;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton} accessibilityLabel="Go back">
          <MaterialCommunityIcons name="arrow-left" size={24} color="#e2e8f0" />
        </Pressable>
        <Text style={styles.heading}>Rewards</Text>
        <View style={styles.headerSpacer} />
      </View>
      <Text style={styles.subtitle}>Scratch a card from your successful investment to reveal your reward. It will be added to your wallet automatically.</Text>

      <View style={styles.listHeader}>
        <Text style={styles.sectionTitle}>Your scratch cards</Text>
        <Text style={styles.pendingCount}>{pendingCount} to scratch</Text>
      </View>

      {loading ? <Text style={styles.statusText}>Loading rewards…</Text> : null}
      {!loading && cards.length === 0 ? (
        <View style={styles.emptyCard}>
          <MaterialCommunityIcons name="gift-outline" size={38} color="#64748b" />
          <Text style={styles.emptyTitle}>No scratch cards yet</Text>
          <Text style={styles.emptyText}>A card will appear here after your first successful investment.</Text>
        </View>
      ) : null}
      {cards.map((card) => <ScratchCardTile key={card.id} card={card} onScratch={handleScratch} />)}
      {scratchingId ? <Text style={styles.statusText}>Adding your reward to the wallet…</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#090b15' },
  container: { padding: 22, paddingBottom: 48 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  backButton: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#111827' },
  heading: { color: '#fff', fontSize: 28, fontWeight: '800' },
  headerSpacer: { width: 42 },
  subtitle: { color: '#94a3b8', fontSize: 14, lineHeight: 21, marginBottom: 18 },
  listHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sectionTitle: { color: '#f8fafc', fontSize: 19, fontWeight: '800' },
  pendingCount: { color: '#fbbf24', fontSize: 12, fontWeight: '700' },
  card: { backgroundColor: '#111827', borderRadius: 20, borderWidth: 1, borderColor: '#263449', padding: 15, marginBottom: 14, overflow: 'hidden' },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  cardIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#29230f', alignItems: 'center', justifyContent: 'center', marginRight: 11 },
  cardDetails: { flex: 1 },
  cardTitle: { color: '#f8fafc', fontSize: 14, fontWeight: '700' },
  cardMeta: { color: '#94a3b8', fontSize: 11, marginTop: 4 },
  prizePreview: { height: 70, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0f2c29', borderRadius: 14, marginBottom: 9 },
  previewLabel: { color: '#6ee7b7', fontSize: 10, fontWeight: '800', letterSpacing: 1.6 },
  previewAmount: { color: '#fff', fontSize: 23, fontWeight: '900', marginTop: 2 },
  scratchArea: { height: 104, borderRadius: 12, overflow: 'hidden', backgroundColor: '#94a3b8' },
  scratchPrompt: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  scratchPromptText: { color: '#0f172a', fontSize: 12, fontWeight: '800', marginTop: 3 },
  revealedReward: { minHeight: 104, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: '#0f2c29', borderRadius: 14 },
  rewardCaption: { color: '#a7f3d0', fontSize: 12, fontWeight: '700' },
  rewardAmount: { color: '#fff', fontSize: 26, fontWeight: '900', marginTop: 2 },
  statusText: { color: '#94a3b8', textAlign: 'center', paddingVertical: 20 },
  emptyCard: { alignItems: 'center', padding: 28, borderRadius: 18, backgroundColor: '#111827', borderWidth: 1, borderColor: '#243247' },
  emptyTitle: { color: '#f8fafc', fontWeight: '800', fontSize: 16, marginTop: 12 },
  emptyText: { color: '#94a3b8', fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 6 },
});