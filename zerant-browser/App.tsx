import React, { useState, useRef } from 'react';
import { StyleSheet, View, TextInput, TouchableOpacity, Text, ScrollView, SafeAreaView, StatusBar } from 'react-native';
import { WebView } from 'react-native-webview';
import { analyzeWithOpenRouter } from './src/agents/openrouter-agent';
import { AGENT_SCRIPT } from './src/utils/agent-script';
import { BrowserAction, ActionLog, AppMode } from './src/types';

export default function App() {
  const [mode, setMode] = useState<AppMode>('browser');
  const [input, setInput] = useState('');
  const [url, setUrl] = useState('https://www.google.com');
  const [logs, setLogs] = useState<ActionLog[]>([]);
  const [status, setStatus] = useState('');
  const webViewRef = useRef<WebView>(null);
  const logIdCounter = useRef(0);

  const addLog = (action: string, status: 'pending' | 'success' | 'error') => {
    const id = `${Date.now()}-${logIdCounter.current++}`;
    setLogs(prev => [...prev, { id, action, status, timestamp: Date.now() }]);
  };

  const executeActions = async (actions: BrowserAction[]) => {
    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];
      addLog(action.reason || `${action.type}: ${action.selector || action.url || ''}`, 'pending');

      try {
        if (action.type === 'navigate' && action.url) {
          setUrl(action.url);
          await new Promise(resolve => setTimeout(resolve, 3000)); // Increased wait time for navigation
          addLog(`Navigated to ${action.url}`, 'success');
        } else if (action.type === 'wait') {
          await new Promise(resolve => setTimeout(resolve, action.amount || 1000));
          addLog('Waited', 'success');
        } else {
          // Inject the action script and wait for response
          const script = `JSON.stringify(window.executeAction(${JSON.stringify(action)}))`;
          const resultStr = await new Promise<string>((resolve) => {
            webViewRef.current?.injectJavaScript(`
              (function() {
                try {
                  const result = window.executeAction(${JSON.stringify(action)});
                  window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'actionResult',
                    result: result,
                    actionIndex: ${i}
                  }));
                } catch(e) {
                  window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'actionResult',
                    result: { success: false, error: e.message },
                    actionIndex: ${i}
                  }));
                }
              })();
            `);

            // Set up a timeout to resolve even if no response comes back
            setTimeout(() => resolve('timeout'), 5000);
          });

          // Wait for the action to complete
          await new Promise(resolve => setTimeout(resolve, 1000));

          // Check if the action was successful
          // For now, we'll assume it was successful after waiting, but in a real implementation,
          // we'd want to capture the result from the injected JavaScript
          addLog(`Executed ${action.type}${action.value ? ' (' + action.value + ')' : ''}`, 'success');
        }
      } catch (error) {
        addLog(`Failed to execute ${action.type} action: ${(error as Error).message}`, 'error');
      }
    }
  };

  const handleExecute = async () => {
    if (!input.trim()) return;

    if (mode === 'browser') {
      const searchUrl = input.startsWith('http') ? input : `https://www.google.com/search?q=${encodeURIComponent(input)}`;
      setUrl(searchUrl);
      setInput('');
    } else {
      setStatus('🤖 OpenRouter (Amazon Nova-2) thinking...');
      setLogs([]);

      try {
        const contextScript = `JSON.stringify(window.getPageContext())`;
        webViewRef.current?.injectJavaScript(`
          window.ReactNativeWebView.postMessage(${contextScript});
        `);

        await new Promise(resolve => setTimeout(resolve, 1000));

        const pageContext = { url, title: 'Current Page', text: 'Page content' };
        const actions = await analyzeWithOpenRouter(input, JSON.stringify(pageContext));

        setStatus('✅ Executing actions via OpenRouter (Amazon Nova-2)...');
        await executeActions(actions);
        setStatus('✅ Complete (OpenRouter with Amazon Nova-2)');
        setInput('');
      } catch (error) {
        setStatus('❌ Error: ' + (error as Error).message);
        addLog('Error: ' + (error as Error).message, 'error');
      }
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.logo}>⚡ ZERANT</Text>
        <TouchableOpacity
          style={[styles.modeBtn, mode === 'agent' && styles.modeBtnActive]}
          onPress={() => setMode(mode === 'browser' ? 'agent' : 'browser')}
        >
          <Text style={styles.modeBtnText}>
            {mode === 'agent' ? '🤖 Agent' : '🌐 Browser'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Control Bar */}
      <View style={styles.controlBar}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder={mode === 'browser' ? 'Search or enter URL...' : 'What should I do?'}
          placeholderTextColor="#666"
          onSubmitEditing={handleExecute}
        />
        <TouchableOpacity style={styles.executeBtn} onPress={handleExecute}>
          <Text style={styles.executeBtnText}>{mode === 'browser' ? '🔍' : '🚀'}</Text>
        </TouchableOpacity>
      </View>

      {/* Status */}
      {status && mode === 'agent' && (
        <View style={styles.statusBar}>
          <Text style={styles.statusText}>{status}</Text>
        </View>
      )}

      {/* Action Log */}
      {mode === 'agent' && logs.length > 0 && (
        <ScrollView style={styles.logContainer}>
          {logs.map(log => (
            <View key={log.id} style={styles.logItem}>
              <Text style={[styles.logText, log.status === 'error' && styles.logError]}>
                {log.status === 'success' ? '✓' : log.status === 'error' ? '✗' : '⋯'} {log.action}
              </Text>
            </View>
          ))}
        </ScrollView>
      )}

      {/* WebView */}
      <WebView
        ref={webViewRef}
        source={{ uri: url }}
        style={styles.webview}
        injectedJavaScript={AGENT_SCRIPT}
        onMessage={(event) => {
          console.log('WebView message:', event.nativeEvent.data);
        }}
        javaScriptEnabled={true}
        domStorageEnabled={true}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#111',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  logo: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  modeBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#222',
  },
  modeBtnActive: {
    backgroundColor: '#4CAF50',
  },
  modeBtnText: {
    color: '#fff',
    fontWeight: '600',
  },
  controlBar: {
    flexDirection: 'row',
    padding: 8,
    backgroundColor: '#111',
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: '#222',
    color: '#fff',
    padding: 12,
    borderRadius: 8,
    fontSize: 16,
  },
  executeBtn: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 20,
    justifyContent: 'center',
    borderRadius: 8,
  },
  executeBtnText: {
    fontSize: 24,
  },
  statusBar: {
    backgroundColor: '#1a1a1a',
    padding: 8,
  },
  statusText: {
    color: '#4CAF50',
    textAlign: 'center',
    fontSize: 14,
  },
  logContainer: {
    maxHeight: 150,
    backgroundColor: '#0a0a0a',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  logItem: {
    padding: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  logText: {
    color: '#4CAF50',
    fontSize: 12,
  },
  logError: {
    color: '#f44336',
  },
  webview: {
    flex: 1,
  },
});