import { Linking, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import PrimaryButton from '../components/PrimaryButton';
import SectionCard from '../components/SectionCard';

export default function SupportScreen() {
  const navigation = useNavigation<any>();
  const openTelegram = () => {
    void Linking.openURL('https://t.me/smartGrow_up_Investments').catch(() => {});
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.contentContainer} showsVerticalScrollIndicator={false}>
        <Text style={styles.heading}>Customer support</Text>
        <SectionCard title="Support channels">
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="Open Telegram support @smartGrow_up_Investments"
            onPress={openTelegram}
            style={({ pressed }) => [styles.supportRow, pressed && styles.supportRowPressed]}
          >
            <MaterialCommunityIcons name="send" size={30} color="#229ED9" style={styles.supportIcon} />
            <View>
              <Text style={styles.supportLabel}>Telegram</Text>
              <Text style={styles.supportText}>@smartGrow_up_Investments</Text>
            </View>
          </Pressable>
        </SectionCard>
        <View style={styles.bottomButtonRow}>
          <PrimaryButton title="Back" onPress={() => navigation.goBack()} compact />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#090b15',
  },
  contentContainer: {
    padding: 24,
    paddingBottom: 48,
  },
  heading: {
    color: '#ffffff',
    fontSize: 32,
    fontWeight: '800',
    marginBottom: 16,
  },
  supportRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  supportRowPressed: {
    opacity: 0.7,
  },
  supportIcon: {
    fontSize: 24,
    marginRight: 14,
    marginTop: 2,
  },
  supportLabel: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  supportText: {
    color: '#94a3b8',
    fontSize: 14,
    lineHeight: 20,
  },
  bottomButtonRow: {
    alignItems: 'center',
    marginTop: 24,
  },
});
