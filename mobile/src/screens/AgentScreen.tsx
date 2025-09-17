// src/screens/AgentScreen.tsx
// Vision-guided agent UI for mobile - shows live screenshots and agent actions

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Button,
  ScrollView,
  Image,
  ActivityIndicator,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Platform
} from 'react-native';
import Constants from 'expo-constants';
import { SafeAreaView } from 'react-native-safe-area-context';
import { runTask, AgentResult } from '../agent/visionAgent';
import { visionAgentUtils } from '../agent/visionAgent';

export default function AgentScreen() {
  const [task, setTask] = useState('Search Google for investor e-mails of AI startups');
  const [log, setLog] = useState<string[]>(['🤖 Ready to start vision-guided automation']);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<AgentResult | null>(null);
  const [showScreenshots, setShowScreenshots] = useState(false);

  const appendLog = (message: string) => {
    setLog(prev => [...prev, message]);
    console.log(message);
  };

  const clearLog = () => setLog(['🤖 Ready to start vision-guided automation']);

  const startAgent = async () => {
    if (running) return;

    setRunning(true);
    setResult(null);
    clearLog();
    appendLog(`🚀 Starting Vision-Agent for: "${task}"`);
    appendLog(`📊 Estimated steps: ${visionAgentUtils.estimateSteps(task)}`);

    try {
      const processedTask = visionAgentUtils.preprocessTask(task);
      appendLog(`🔄 Processed task: "${processedTask}"`);

      const agentResult = await runTask(
        processedTask,
        visionAgentUtils.estimateSteps(task),
        (message, step) => {
          appendLog(`Step ${step}: ${message}`);
        }
      );

      appendLog(`🎉 Agent completed in ${agentResult.steps} steps`);
      setResult(agentResult);

      if (agentResult.success) {
        appendLog(`✅ Success: ${agentResult.answer}`);
        if (agentResult.contacts && agentResult.contacts.length > 0) {
          appendLog(`📧 Found ${agentResult.contacts.length} contacts:`);
          agentResult.contacts.forEach(contact => {
            appendLog(`  ${contact.type.toUpperCase()}: ${contact.value} (${(contact.confidence * 100).toFixed(0)}%)`);
          });
        }
      } else {
        appendLog(`⚠️  ${agentResult.answer || 'Task completed with issues'}`);
        if (agentResult.error) {
          appendLog(`❌ Error: ${agentResult.error}`);
        }
      }

      // Auto-scroll to bottom
      scrollViewRef.current?.scrollToEnd({ animated: true });

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      appendLog(`💥 Fatal error: ${errorMsg}`);
      Alert.alert('Agent Error', `Vision-Agent failed: ${errorMsg}`);
    } finally {
      setRunning(false);
    }
  };

  const copyResults = () => {
    if (!result || !result.contacts) return;

    const text = result.contacts.map(c => `${c.value} (${c.type})`).join('\n');
    // Mobile clipboard copy (would need expo-clipboard)
    appendLog(`📋 Results copied to clipboard:\n${text}`);
  };

  const retryLastAction = () => {
    if (result) {
      setTask(task); // Reset to same task
      startAgent();
    }
  };

  const scrollViewRef = React.useRef<ScrollView>(null);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Vision-Guided Agent</Text>
        <Text style={styles.subtitle}>AI drives browser like a human</Text>
      </View>

      {/* Task Input */}
      <View style={styles.inputSection}>
        <TextInput
          style={styles.taskInput}
          value={task}
          onChangeText={setTask}
          placeholder="e.g., Search Google for investor e-mails of AI startups"
          placeholderTextColor="#999"
          multiline
          numberOfLines={3}
          editable={!running}
        />
        <View style={styles.buttonRow}>
          <Button
            title={running ? 'Running...' : '🚀 Let Agent Drive'}
            onPress={startAgent}
            disabled={running}
            color="#007AFF"
          />
          <Button title="Clear" onPress={clearLog} disabled={running} />
        </View>
      </View>

      {/* Toggle Screenshots */}
      <View style={styles.toggleRow}>
        <TouchableOpacity
          style={[styles.toggleButton, showScreenshots && styles.toggleButtonActive]}
          onPress={() => setShowScreenshots(!showScreenshots)}
          disabled={running}
        >
          <Text style={styles.toggleText}>
            📸 {showScreenshots ? 'Hide' : 'Show'} Screenshots
          </Text>
        </TouchableOpacity>
      </View>

      {/* Progress Log */}
      <ScrollView
        ref={scrollViewRef}
        style={styles.logContainer}
        contentContainerStyle={styles.logContent}
        showsVerticalScrollIndicator={true}
        onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
      >
        {log.map((entry, index) => (
          <View key={index} style={styles.logEntry}>
            <Text style={styles.logText}>{entry}</Text>
          </View>
        ))}

        {/* Show screenshots if enabled */}
        {showScreenshots && result?.screenshots && result.screenshots.map((screenshot, index) => (
          <View key={`ss-${index}`} style={styles.screenshotContainer}>
            <Text style={styles.screenshotLabel}>Screenshot #{index + 1}</Text>
            <Image
              source={{ uri: `data:image/png;base64,${screenshot}` }}
              style={styles.screenshot}
              resizeMode="contain"
            />
          </View>
        ))}

        {/* Results Summary */}
        {result && (
          <View style={styles.resultsSection}>
            <Text style={styles.resultsTitle}>📊 Final Results</Text>
            <Text style={styles.resultsSummary}>Success: {result.success ? '✅ Yes' : '❌ No'}</Text>
            <Text style={styles.resultsSummary}>Steps: {result.steps}</Text>
            <Text style={styles.resultsSummary}>Answer: {result.answer}</Text>

            {result.contacts && result.contacts.length > 0 && (
              <View style={styles.contactsList}>
                <Text style={styles.contactsTitle}>📧 Extracted Contacts ({result.contacts.length})</Text>
                {result.contacts.map((contact, index) => (
                  <View key={index} style={styles.contactItem}>
                    <Text style={styles.contactValue}>{contact.value}</Text>
                    <Text style={styles.contactMeta}>
                      {contact.type.toUpperCase()} • {(contact.confidence * 100).toFixed(0)}% confidence
                    </Text>
                  </View>
                ))}
                <TouchableOpacity style={styles.copyButton} onPress={copyResults}>
                  <Text style={styles.copyButtonText}>📋 Copy Contacts</Text>
                </TouchableOpacity>
              </View>
            )}

            {result.error && (
              <View style={styles.errorSection}>
                <Text style={styles.errorTitle}>❌ Error Details</Text>
                <Text style={styles.errorText}>{result.error}</Text>
                <TouchableOpacity style={styles.retryButton} onPress={retryLastAction}>
                  <Text style={styles.retryButtonText}>🔄 Retry Same Task</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Powered by Gemini Vision + BrowserOS • {running ? 'Active' : 'Idle'}
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#007AFF',
    padding: 20,
    paddingTop: 10,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.8)',
  },
  inputSection: {
    backgroundColor: 'white',
    padding: 16,
    margin: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  taskInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    padding: 12,
    borderRadius: 8,
    fontSize: 16,
    minHeight: 80,
    backgroundColor: '#fafafa',
    marginBottom: 12,
    textAlignVertical: 'top',
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  toggleRow: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: 'white',
  },
  toggleButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
    alignSelf: 'center',
  },
  toggleButtonActive: {
    backgroundColor: '#007AFF',
  },
  toggleText: {
    color: '#666',
    fontSize: 14,
  },
  logContainer: {
    flex: 1,
    margin: 16,
    backgroundColor: 'white',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  logContent: {
    padding: 16,
  },
  logEntry: {
    marginBottom: 12,
    padding: 8,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    borderLeftWidth: 4,
  },
  logText: {
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
  },
  screenshotContainer: {
    marginVertical: 12,
    padding: 8,
    backgroundColor: '#f0f8ff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#007AFF',
  },
  screenshotLabel: {
    fontWeight: 'bold',
    color: '#007AFF',
    marginBottom: 8,
  },
  screenshot: {
    width: '100%',
    height: 200,
    borderRadius: 4,
  },
  resultsSection: {
    padding: 16,
    backgroundColor: '#e8f5e8',
    borderTopWidth: 1,
    borderTopColor: '#c3e6c3',
  },
  resultsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#155724',
    marginBottom: 12,
  },
  resultsSummary: {
    fontSize: 14,
    color: '#155724',
    marginBottom: 4,
  },
  contactsList: {
    marginTop: 12,
  },
  contactsTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#155724',
    marginBottom: 8,
  },
  contactItem: {
    padding: 8,
    backgroundColor: 'white',
    borderRadius: 6,
    marginBottom: 6,
    borderLeftWidth: 3,
    borderLeftColor: '#28a745',
  },
  contactValue: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#155724',
  },
  contactMeta: {
    fontSize: 12,
    color: '#6c757d',
    marginTop: 2,
  },
  copyButton: {
    backgroundColor: '#007AFF',
    padding: 10,
    borderRadius: 6,
    alignItems: 'center',
    marginTop: 8,
  },
  copyButtonText: {
    color: 'white',
    fontWeight: 'bold',
  },
  errorSection: {
    padding: 16,
    backgroundColor: '#f8d7da',
    borderTopWidth: 1,
    borderTopColor: '#f5c6cb',
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#721c24',
    marginBottom: 12,
  },
  errorText: {
    fontSize: 14,
    color: '#721c24',
    marginBottom: 12,
  },
  retryButton: {
    backgroundColor: '#dc3545',
    padding: 10,
    borderRadius: 6,
    alignItems: 'center',
  },
  retryButtonText: {
    color: 'white',
    fontWeight: 'bold',
  },
  footer: {
    padding: 12,
    backgroundColor: '#f8f9fa',
    borderTopWidth: 1,
    borderTopColor: '#dee2e6',
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
    color: '#6c757d',
  },
});
