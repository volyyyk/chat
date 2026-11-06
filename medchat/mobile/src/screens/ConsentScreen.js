/**
 * Consent Screen
 * 
 * Displays privacy policy and obtains user consent
 */

import React, { useState } from 'react';
import { 
  View, 
  Text, 
  TouchableOpacity, 
  StyleSheet, 
  SafeAreaView,
  ScrollView,
  Linking
} from 'react-native';
import { useTheme } from '../utils/ThemeContext';
import config from '../config';

const ConsentScreen = ({ onConsent = () => {} }) => {
  const { theme } = useTheme();
  const [agreed, setAgreed] = useState(false);

  const handleAgree = () => {
    setAgreed(true);
    onConsent(true);
  };

  const handleDisagree = () => {
    setAgreed(false);
    onConsent(false);
  };

  const openPrivacyPolicy = () => {
    if (config.legal.privacyPolicyUrl) {
      Linking.openURL(config.legal.privacyPolicyUrl);
    }
  };

  const openTermsOfService = () => {
    if (config.legal.termsOfServiceUrl) {
      Linking.openURL(config.legal.termsOfServiceUrl);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.colors.text }]}>
            Welcome to {config.name}
          </Text>
        </View>

        <View style={styles.content}>
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
            Privacy Policy
          </Text>
          
          <Text style={[styles.text, { color: theme.colors.textSecondary }]}>
            This application is designed to provide secure communication between doctors and patients 
            in compliance with Russian Federal Law No. 152-FZ "On Personal Data".
          </Text>
          
          <Text style={[styles.text, { color: theme.colors.textSecondary }, styles.marginTop]}>
            <Text style={{ fontWeight: 'bold' }}>Key Points:</Text>
          </Text>
          
          <View style={styles.list}>
            <Text style={[styles.listItem, { color: theme.colors.textSecondary }]}>
              • All data is stored locally on your device
            </Text>
            <Text style={[styles.listItem, { color: theme.colors.textSecondary }]}>
              • No central database stores your personal information
            </Text>
            <Text style={[styles.listItem, { color: theme.colors.textSecondary }]}>
              • All communication is end-to-end encrypted
            </Text>
            <Text style={[styles.listItem, { color: theme.colors.textSecondary }]}>
              • Your unique identifier is only visible to your doctor/patient
            </Text>
            <Text style={[styles.listItem, { color: theme.colors.textSecondary }]}>
              • You can delete your data at any time
            </Text>
          </View>

          <Text style={[styles.sectionTitle, { color: theme.colors.text }, styles.marginTop]}>
            What We Collect
          </Text>
          
          <Text style={[styles.text, { color: theme.colors.textSecondary }]}>
            For doctors: We generate a unique ID and cryptographic keys for secure communication.
          </Text>
          <Text style={[styles.text, { color: theme.colors.textSecondary }, styles.marginTop]}>
            For patients: We store your unique ID (provided by you) and cryptographic keys.
          </Text>
          <Text style={[styles.text, { color: theme.colors.textSecondary }, styles.marginTop]}>
            <Text style={{ fontWeight: 'bold' }}>We do not collect:</Text> Full names, addresses, phone numbers, email addresses, 
            or any other personally identifiable information unless you choose to include it in messages.
          </Text>

          <Text style={[styles.sectionTitle, { color: theme.colors.text }, styles.marginTop]}>
            Your Rights
          </Text>
          
          <Text style={[styles.text, { color: theme.colors.textSecondary }]}>
            Under Russian law, you have the right to:
          </Text>
          
          <View style={styles.list}>
            <Text style={[styles.listItem, { color: theme.colors.textSecondary }]}>
              • Access your data
            </Text>
            <Text style={[styles.listItem, { color: theme.colors.textSecondary }]}>
              • Correct your data
            </Text>
            <Text style={[styles.listItem, { color: theme.colors.textSecondary }]}>
              • Delete your data
            </Text>
            <Text style={[styles.listItem, { color: theme.colors.textSecondary }]}>
              • Withdraw your consent at any time
            </Text>
          </View>

          <Text style={[styles.text, { color: theme.colors.textSecondary }, styles.marginTop]}>
            By using this application, you consent to the processing of your data as described above.
          </Text>

          <View style={[styles.links, styles.marginTop]}>
            <TouchableOpacity onPress={openPrivacyPolicy}>
              <Text style={[styles.link, { color: theme.colors.primary }]}>
                Read full Privacy Policy
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={openTermsOfService}>
              <Text style={[styles.link, { color: theme.colors.primary }]}>
                Read Terms of Service
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.buttons}>
          <TouchableOpacity
            style={[styles.button, styles.buttonSecondary, { 
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border
            }]}
            onPress={handleDisagree}
          >
            <Text style={[styles.buttonText, { color: theme.colors.text }]}>
              Disagree
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.buttonPrimary, { 
              backgroundColor: theme.colors.primary,
              opacity: agreed ? 1 : 0.6
            }]}
            onPress={handleAgree}
            disabled={agreed}
          >
            <Text style={styles.buttonText}>I Agree</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.consentText}>
          <Text style={[styles.consentLabel, { color: theme.colors.textSecondary }]}>
            {config.legal.consentText}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1
  },
  scrollContainer: {
    padding: 24,
    paddingBottom: 48
  },
  header: {
    marginBottom: 24
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center'
  },
  content: {
    marginBottom: 32
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12
  },
  text: {
    fontSize: 14,
    lineHeight: 22
  },
  marginTop: {
    marginTop: 16
  },
  list: {
    marginLeft: 16,
    marginTop: 8
  },
  listItem: {
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 4
  },
  links: {
    flexDirection: 'row',
    gap: 24,
    marginTop: 16
  },
  link: {
    fontSize: 14,
    textDecorationLine: 'underline'
  },
  buttons: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 24
  },
  button: {
    flex: 1,
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center'
  },
  buttonPrimary: {
    minHeight: 50
  },
  buttonSecondary: {
    borderWidth: 1
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF'
  },
  consentText: {
    padding: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    borderRadius: 8
  },
  consentLabel: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20
  }
});

export default ConsentScreen;
