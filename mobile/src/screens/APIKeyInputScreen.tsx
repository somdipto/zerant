// src/screens/APIKeyInputScreen.tsx
// Secure API key input screen for vision-agent

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Button,
  Alert,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  TouchableOpacity
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { saveApiKey, getApiKey, deleteApiKey, StorageResult } from '../services/SecureStorage';
import { validateApiKey, testApiKey, KeyValidationResult, ApiTestResult } from '../utils/KeyValidator';

interface Props {
  navigation: any;
}

export default function APIKeyInputScreen({ navigation }: Props) {
  const [apiKey, setApiKey] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [validation, setValidation] = useState<KeyValidationResult | null>(null);
  const [testResult, setTestResult] = useState<ApiTestResult | null>(null);
  const [hasStoredKey, setHasStoredKey] = useState(false);

  // Check for existing key on mount
  React.useEffect(() => {
    checkStoredKey();
  }, []);

  const checkStoredKey = async () => {
    const result = await getApiKey();
    setHasStoredKey(result.success);
    if (result.success) {
      setValidation({
        isValid: true,
        isReal: true,
        format: 'valid',
        maskedKey: result.key || ''
      });
    }
  };

  const handleInputChange = (text: string) => {
    setApiKey(text);
    setTestResult(null);

    if (text.length > 10) {
      validateApiKey(text).then(setValidation);
    } else {
      setValidation(null);
    }
  };

  const handleSave = async () => {
    if (!apiKey.trim()) {
      Alert.alert('Error', 'Please enter your API key');
      return;
    }

    setIsSaving(true);
    try {
      const saveResult = await saveApiKey(apiKey.trim());

      if (saveResult.success) {
        Alert.alert('Success', `API key saved securely!\nKey: ${saveResult.key}`);

        // Test the key
        const test = await testApiKey(apiKey.trim());
        setTestResult(test);

        if (test.success && test.isConnected) {
          Alert.alert('Connected', 'API key is working! You can now use the vision agent.');
          navigation.navigate('AgentScreen');
        } else {
          Alert.alert('Warning', `Key saved but couldn't connect to API:\n${test.error}`);
        }

        setHasStoredKey(true);
        setApiKey('');
        setValidation(null);
      } else {
        Alert.alert('Error', saveResult.error || 'Failed to save API key');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to save API key. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    Alert.alert(
      'Delete API Key',
      'This will remove your stored API key. You can add it again later.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const result = await deleteApiKey();
            if (result.success) {
              Alert.alert('Deleted', 'API key removed successfully');
              setHasStoredKey(false);
              setValidation(null);
              navigation.navigate('APIKeyInputScreen');
            } else {
              Alert.alert('Error', result.error || 'Failed to delete API key');
            }
          }
        }
      ]
    );
  };

  const handleTest = async () => {
    if (!apiKey.trim()) {
      Alert.alert('Test Failed', 'Please enter an API key first');
      return;
    }

    setIsSaving(true);
    try {
      const test = await testApiKey(apiKey.trim());
      setTestResult(test);

      if (test.success && test.isConnected) {
        Alert.alert('Success', `API key is valid and connected!\nResponse time: ${test.responseTime}ms`);
      } else {
        Alert.alert('Connection Failed', test.error || 'Could not connect to Gemini API');
      }
    } catch (error) {
      Alert.alert('Test Failed', 'Failed to test API key');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Vision Agent Setup</Text>
          <Text style={styles.subtitle}>
            Enter your Gemini API key to enable AI-powered browser automation
          </Text>
        </View>

        {/* Current Status */}
        {hasStoredKey && validation && (
          <View style={styles.statusCard}>
            <Text style={styles.statusTitle}>Current API Key</Text>
            <Text style={styles.statusKey}>Key: {validation.maskedKey}</Text>
            <Text style={[
              styles.statusValid,
              { color: validation.isValid ? '#28a745' : '#dc3545' }
            ]}>
              Status: {validation.isValid ? 'Valid' : 'Invalid'}
            </Text>
            <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
              <Text style={styles.deleteButtonText}>Delete Key</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* API Key Input */}
        <View style={styles.inputCard}>
          <Text style={styles.inputTitle}>Gemini API Key</Text>
          <TextInput
            style={styles.input}
            value={apiKey}
            onChangeText={handleInputChange}
            placeholder="AIzaSyC... (39 characters)"
            placeholderTextColor="#999"
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
          />

          {/* Validation Feedback */}
          {validation && (
            <View style={[
              styles.validation,
              {
                backgroundColor: validation.isValid ? '#d4edda' :
                                validation.format === 'placeholder' ? '#fff3cd' : '#f8d7da'
              }
            ]}>
              <Text style={[
                styles.validationText,
                {
                  color: validation.isValid ? '#155724' :
                         validation.format === 'placeholder' ? '#856404' : '#721c24'
                }
              ]}>
                {validation.error || `Key ${validation.isValid ? 'looks valid' : 'is invalid'}`}
              </Text>
            </View>
          )}

          {/* Buttons */}
          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={[styles.button, styles.primaryButton, isSaving && styles.disabledButton]}
              onPress={handleSave}
              disabled={isSaving || !apiKey.trim()}
            >
              {isSaving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Save & Test Key</Text>
              )}
            </TouchableOpacity>

            {apiKey.trim() && !isSaving && (
              <TouchableOpacity
                style={[styles.button, styles.secondaryButton]}
                onPress={handleTest}
              >
                <Text style={styles.buttonText}>Test Connection</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Test Results */}
          {testResult && (
            <View style={[
              styles.testResult,
              {
                backgroundColor: testResult.success ? '#d4edda' : '#f8d7da'
              }
            ]}>
              <Text style={[
                styles.testText,
                { color: testResult.success ? '#155724' : '#721c24' }
              ]}>
                {testResult.success
                  ? `✅ Connected! Response time: ${testResult.responseTime}ms`
                  : `❌ ${testResult.error}`
                }
              </Text>
            </View>
          )}
        </View>

        {/* Instructions */}
        <View style={styles.instructions}>
          <Text style={styles.instructionsTitle}>How to Get Your API Key</Text>
          <Text style={styles.instructionsText}>
            1. Go to{' '}
            <Text style={styles.linkText}>ai.google.dev</Text>
          </Text>
          <Text style={styles.instructionsText}>
            2. Create a Google Cloud project (or use existing)
          </Text>
          <Text style={styles.instructionsText}>
            3. Enable Gemini API in APIs & Services
          </Text>
          <Text style={styles.instructionsText}>
            4. Create API key (free tier: 60 req/min)
          </Text>
          <Text style={styles.instructionsText}>
            5. Copy the key (starts with AIzaSy...) and paste above
          </Text>
          <Text style={[styles.instructionsText, styles.note]}>
            💡 Free tier includes 60 requests per minute - perfect for vision-agent
          </Text>
        </View>

        {/* Navigation */}
        {hasStoredKey && (
          <TouchableOpacity
            style={styles.navButton}
            onPress={() => navigation.navigate('AgentScreen')}
          >
            <Text style={styles.navButtonText}>🚀 Go to Vision Agent</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  content: {
    padding: 16,
  },
  header: {
    backgroundColor: '#007AFF',
    padding: 20,
    borderRadius: 12,
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.9)',
  },
  statusCard: {
    backgroundColor: '#e7f3ff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#b3d9ff',
  },
  statusTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0056b3',
    marginBottom: 8,
  },
  statusKey: {
    fontSize: 14,
    color: '#0066cc',
    marginBottom: 4,
  },
  statusValid: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
  },
  deleteButton: {
    backgroundColor: '#dc3545',
    padding: 10,
    borderRadius: 6,
    alignItems: 'center',
  },
  deleteButtonText: {
    color: 'white',
    fontWeight: 'bold',
  },
  inputCard: {
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 12,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  inputTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
    marginLeft: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    padding: 12,
    borderRadius: 8,
    fontSize: 16,
    backgroundColor: '#fafafa',
    marginBottom: 12,
    fontFamily: 'monospace',
    height: 60,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    minHeight: 44,
  },
  primaryButton: {
    backgroundColor: '#007AFF',
  },
  secondaryButton: {
    backgroundColor: '#6c757d',
  },
  disabledButton: {
    backgroundColor: '#ccc',
  },
  buttonText: {
    color: 'white',
    fontWeight: '600',
  },
  validation: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  validationText: {
    fontSize: 14,
  },
  testResult: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  testText: {
    fontSize: 14,
  },
  instructions: {
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
  },
  instructionsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  instructionsText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    marginBottom: 8,
  },
  linkText: {
    color: '#007AFF',
    fontWeight: '600',
  },
  note: {
    backgroundColor: '#fff3cd',
    padding: 8,
    borderRadius: 6,
    marginTop: 8,
  },
  navButton: {
    backgroundColor: '#28a745',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  navButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16,
  },
});
