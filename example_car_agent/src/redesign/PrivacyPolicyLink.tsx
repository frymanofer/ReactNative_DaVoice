import React from 'react';
import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { C, F } from './theme';

/** The app's privacy policy (Google Play asks for it in the store listing and inside the app). */
export const PRIVACY_POLICY_URL = 'https://davoice.io/privacy/car-agent';

/** A settings row that opens the privacy policy in the browser. */
export default function PrivacyPolicyLink() {
  const open = () => {
    Linking.openURL(PRIVACY_POLICY_URL).catch((error) => console.log('[PrivacyPolicy] could not open the link:', error));
  };
  return (
    <View style={styles.row}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.label}>Privacy policy</Text>
        <Text style={styles.value} numberOfLines={2}>davoice.io/privacy/car-agent</Text>
      </View>
      <TouchableOpacity accessibilityRole="link" accessibilityLabel="Open the privacy policy" onPress={open} style={styles.action}>
        <Text style={styles.actionText}>Open</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  label: { fontFamily: F.semibold, fontSize: 14, color: C.text },
  value: { fontFamily: F.regular, fontSize: 12, color: C.text2 },
  action: { height: 44, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(52, 211, 153, 0.5)', justifyContent: 'center' },
  actionText: { fontFamily: F.semibold, fontSize: 14, color: C.mint },
});
