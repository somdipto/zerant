import 'react-native-gesture-handler';
import React, { useState, createContext, useContext, useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppNavigator from './src/screens/AppNavigator';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Dimensions, ActivityIndicator, Alert, Switch, ScrollView, Linking } from 'react-native';
import captureRef from 'react-native-view-shot';
import { WebView } from 'react-native-webview';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

const Tab = createBottomTabNavigator();
const { width: screenWidth } = Dimensions.get('window');

// Theme Context
const ThemeContext = createContext({
  theme: 'system' as 'light' | 'dark' | 'system',
  setTheme: (theme: 'light' | 'dark' | 'system') => {},
  colors: {
    background: '#FFFFFF',
    text: '#111827',
    textLight: '#6B7280',
    primary: '#6366F1',
    border: '#E5E7EB',
    browserBar: '#F3F4F6',
    tabActive: '#FFFFFF',
    chatBubble: '#F8FAFC',
    chatBubbleSent: '#DBEAFE',
  } as const,
});

// AI Settings Context
interface AIConfig {
  enabled: boolean;
  visionEnabled: boolean;
  provider: 'openai' | 'google' | 'openrouter';
  model: string;
  apiKey: string;
  baseUrl: string;
  temperature: number;
  maxTokens: number;
  maxInputTokens: number;
  rateLimit: {
    requestsPerMinute: number;
    requestsPerDay: number;
  };
}

// Gemini Model Configurations
const GEMINI_MODELS = {
  'gemini-1.5-flash': {
    maxInputTokens: 1000000,  // 1M tokens
    maxOutputTokens: 8192,
    defaultMaxTokens: 4096,
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent'
  },
  'gemini-1.5-pro': {
    maxInputTokens: 2000000,  // 2M tokens
    maxOutputTokens: 8192,
    defaultMaxTokens: 4096,
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent'
  },
  'gemini-2.5-pro': {
    maxInputTokens: 2000000,  // 2M tokens
    maxOutputTokens: 8192,
    defaultMaxTokens: 4096,
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent'
  },
  'gemini-2.5-flash': {
    maxInputTokens: 1000000,  // 1M tokens
    maxOutputTokens: 8192,
    defaultMaxTokens: 4096,
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'
  },
  'gemini-2.5-flash-lite': {
    maxInputTokens: 1000000,  // 1M tokens
    maxOutputTokens: 8192,
    defaultMaxTokens: 2048,
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent'
  }
};

const AIContext = createContext({
  aiConfig: {
    enabled: false,
    visionEnabled: true,
    provider: 'google' as 'openai' | 'google' | 'openrouter',
    model: 'gemini-1.5-pro',
    apiKey: '',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    temperature: 0.7,
    maxTokens: GEMINI_MODELS['gemini-1.5-pro'].defaultMaxTokens,
    maxInputTokens: GEMINI_MODELS['gemini-1.5-pro'].maxInputTokens,
    rateLimit: {
      requestsPerMinute: 15,  // Free tier limit
      requestsPerDay: 1500    // Free tier limit
    },
  } as AIConfig,
  updateAIConfig: (config: Partial<AIConfig>) => {},
});

const useAI = () => useContext(AIContext);

// Theme Provider Component
const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('system');

  const colors = React.useMemo(() => {
    if (theme === 'dark') {
      return {
        background: '#1F2937',
        text: '#F9FAFB',
        textLight: '#D1D5DB',
        primary: '#A5B4FC',
        border: '#374151',
        browserBar: '#111827',
        tabActive: '#1F2937',
        chatBubble: '#374151',
        chatBubbleSent: '#1E40AF',
      };
    }
    return {
      background: '#FFFFFF',
      text: '#111827',
      textLight: '#6B7280',
      primary: '#6366F1',
      border: '#E5E7EB',
      browserBar: '#F3F4F6',
      tabActive: '#FFFFFF',
      chatBubble: '#F8FAFC',
      chatBubbleSent: '#DBEAFE',
    };
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, colors }}>
      {children}
    </ThemeContext.Provider>
  );
};

// AI Provider Component
const AIProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [aiConfig, setAIConfig] = useState<AIConfig>({
    enabled: false,
    visionEnabled: true,
    provider: 'google',
    model: 'gemini-1.5-pro',
    apiKey: '',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    temperature: 0.7,
    maxTokens: 4096,
    maxInputTokens: 2000000,
    rateLimit: {
      requestsPerMinute: 15,
      requestsPerDay: 1500
    },
  });

  // Load settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settingsStr = await AsyncStorage.getItem('ai_settings');
        if (settingsStr) {
          const savedConfig = JSON.parse(settingsStr);
          setAIConfig(prev => ({ ...prev, ...savedConfig }));
        }
      } catch (error) {
        console.error('Failed to load AI settings:', error);
      }
    };
    loadSettings();
  }, []);

  // Save settings
  const updateAIConfig = async (config: Partial<AIConfig>) => {
    const newConfig = { ...aiConfig, ...config };
    setAIConfig(newConfig);
    try {
      await AsyncStorage.setItem('ai_settings', JSON.stringify(newConfig));
    } catch (error) {
      console.error('Failed to save AI settings:', error);
    }
  };

  return (
    <AIContext.Provider value={{ aiConfig, updateAIConfig }}>
      {children}
    </AIContext.Provider>
  );
};

// API Service
// Global variable for rate limiting (non-hook approach)
let lastRequestTime = 0;
const minInterval = 1000; // 1 second between requests (increased from 4s to allow more frequent requests)

// Add interface for chat message
interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  name?: string;
}

interface AgentResponse {
  needsSearch: boolean;
  searchQuery: string;
  response: string;
  imageBase64?: string;
  visionPrompt?: string;
}

const callLLM = async (message: string, config: AIConfig, messageHistory: ChatMessage[] = []): Promise<AgentResponse> => {
  if (!config.enabled || !config.apiKey) {
    throw new Error('AI is not enabled or API key is missing. Configure in Settings.');
  }

  let url = '';
  let body = {};
  let headers = {
    'Content-Type': 'application/json',
  };

  // Enhanced system prompt for BrowserOS browser agent with 99% search bias and strict JSON output
  const systemPrompt = `You are BrowserOS AI, a web browsing agent in BrowserOS Mobile. For 99% of queries, perform web search using the browser tab. Only 1% pure chat (greetings, math, app help).

Search triggers: 'find', 'search', 'look up', 'current/latest', 'email/phone', 'price/stock', 'news', 'website content', factual questions.

IMPORTANT: Respond with ONLY valid JSON. No markdown, no explanations, no code blocks. Start directly with { and end with }. If not JSON, the app will crash.

JSON format exactly:
{
  "needsSearch": true,  // true for 99% cases (any current/factual info)
  "searchQuery": "precise Google search terms",
  "response": "brief explanation (if search) or full answer (if no search)"
}

Examples (exact output):
{"needsSearch":true,"searchQuery":"top AI companies contact emails","response":"Searching for AI company contacts..."}
{"needsSearch":false,"searchQuery":"","response":"4"}
{"needsSearch":false,"searchQuery":"","response":"Hi! What can I search for you?"}

Context: ${messageHistory.length > 0 ? 'Previous: ' + messageHistory.slice(-3).map(m => m.role + ': ' + m.content.substring(0, 50) + '...').join('; ') : 'New conversation.'}`;

  // Prepare messages for JSON response
  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...messageHistory,
    { role: 'user', content: message }
  ];

  switch (config.provider) {
    case 'openai':
      url = config.baseUrl || 'https://api.openai.com/v1/chat/completions';
      headers['Authorization'] = `Bearer ${config.apiKey}`;
      body = {
        model: config.model,
        messages: [...messages, { role: 'system', content: 'Respond ONLY with valid JSON matching the format in the system prompt. No additional text or explanation.' }],
        temperature: config.temperature,
        max_tokens: config.maxTokens,
        response_format: { type: 'json_object' },
        stream: false,
      };
      break;

    case 'google':
      const modelConfig = GEMINI_MODELS[config.model as keyof typeof GEMINI_MODELS] || GEMINI_MODELS['gemini-2.5-flash-lite'];
      url = `${config.baseUrl}${modelConfig.endpoint}?key=${config.apiKey}`;

      // Format for Gemini with strict JSON instruction
      const formattedMessages = [
        { role: 'user', parts: [{ text: systemPrompt }] },
        ...messageHistory.map(msg => ({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.content }]
        })),
        { role: 'user', parts: [{ text: message + '\n\nOutput ONLY valid JSON starting with { and ending with }. No other text: {"needsSearch": boolean, "searchQuery": string, "response": string}. Bias needsSearch=true for 99% queries.' }] }
      ];

      body = {
        contents: formattedMessages,
        generationConfig: {
          temperature: Math.min(Math.max(config.temperature, 0), 1),
          maxOutputTokens: Math.min(config.maxTokens, modelConfig.maxOutputTokens),
          topP: 0.95,
          topK: 40
        },
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' }
        ]
      };
      break;

    case 'openrouter':
      url = config.baseUrl || 'https://openrouter.ai/api/v1/chat/completions';
      headers['Authorization'] = `Bearer ${config.apiKey}`;
      headers['HTTP-Referer'] = 'https://browseros-mobile.com';
      headers['X-Title'] = 'BrowserOS Mobile';
      body = {
        model: config.model,
        messages: [...messages, { role: 'system', content: 'Respond ONLY with valid JSON matching the system prompt format. No other text.' }],
        temperature: config.temperature,
        max_tokens: config.maxTokens,
      };
      break;

    default:
      throw new Error(`Unsupported provider: ${config.provider}`);
  }

  // Enhanced rate limiting with better error handling
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  const minRequestInterval = 60000 / config.rateLimit.requestsPerMinute; // Convert RPM to ms
  
  if (timeSinceLastRequest < minRequestInterval) {
    const waitTime = minRequestInterval - timeSinceLastRequest;
    console.log(`Rate limiting: Waiting ${waitTime}ms before next request`);
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }
  lastRequestTime = Date.now();

  // Add timeout to the fetch request
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: controller.signal
  }).finally(() => clearTimeout(timeoutId));

  if (!response.ok) {
    let errorMsg = `API Error: ${response.status}`;
    const errorData = await response.json().catch(() => ({}));
    if (errorData.error) {
      errorMsg += ` - ${errorData.error.message}`;
      if (config.provider === 'google' && response.status === 429) {
        errorMsg += ' (Quota exceeded. Free tier limits: 15 RPM, 1500 RPD. Wait 1 minute or upgrade to paid API key.)';
        // Retry logic for 429 errors
        if (response.status === 429) {
          const retryAfter = response.headers.get('retry-after') || '60';
          const retryTime = parseInt(retryAfter, 10) * 1000;
          console.warn(`Rate limited. Retrying after ${retryTime}ms`);
          
          // Wait and retry once
          await new Promise(resolve => setTimeout(resolve, retryTime));
          const retryResponse = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
            signal: controller.signal
          });
          
          if (!retryResponse.ok) {
            const retryError = await retryResponse.json().catch(() => ({}));
            throw new Error(`API Error (retry failed): ${retryResponse.status} - ${retryError.error?.message || 'Unknown error'}`);
          }
          
          const retryData = await retryResponse.json();
          return retryData.candidates?.[0]?.content?.parts?.[0]?.text || 'No response from model';
        }
      } else if (config.provider === 'google' && config.model.startsWith('gemini-2.5-') && response.status === 404) {
        errorMsg += ' (Gemini 2.5 may have temporary availability issues. Try gemini-1.5-flash instead.)';
      }
    }
    throw new Error(errorMsg);
  }

  const data = await response.json();

  let rawResponse = '';
  switch (config.provider) {
    case 'openai':
    case 'openrouter':
      rawResponse = data.choices?.[0]?.message?.content || 'No response content';
      break;
    case 'google':
      if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
        rawResponse = data.candidates[0].content.parts[0].text;
      } else if (data.candidates?.[0]?.finishReason === 'SAFETY') {
        throw new Error('Response blocked by safety settings. Try adjusting your query.');
      } else if (data.error) {
        throw new Error(`API Error: ${data.error.message || 'Unknown error'}`);
      } else {
        console.warn('Unexpected Gemini response format:', JSON.stringify(data, null, 2));
        rawResponse = 'Received an unexpected response format from the model.';
      }
      break;
    default:
      rawResponse = data.text || 'Unexpected response format';
  }

  // Parse JSON response for agent decision with fallback extraction
  try {
    // Try direct parse
    const parsed = JSON.parse(rawResponse);
    return {
      needsSearch: parsed.needsSearch || false,
      searchQuery: parsed.searchQuery || '',
      response: parsed.response || rawResponse
    } as AgentResponse;
  } catch (e) {
    console.warn('JSON parse failed, attempting extraction:', e);
    // Fallback: extract JSON-like object from response
    const jsonMatch = rawResponse.match(/\{[^}]*\}/);
    if (jsonMatch) {
      try {
        const extracted = JSON.parse(jsonMatch[0]);
        return {
          needsSearch: extracted.needsSearch || false,
          searchQuery: extracted.searchQuery || '',
          response: extracted.response || rawResponse
        } as AgentResponse;
      } catch (extractError) {
        console.warn('Extraction failed:', extractError);
      }
    }
    // Ultimate fallback: no search, use raw
    return { needsSearch: false, searchQuery: '', response: rawResponse } as AgentResponse;
  }
};

// BrowserScreen (unchanged)
const BrowserScreen = ({ route }: { route: any }) => {
  const navigation = useNavigation();
  const initialUrl = route?.params?.initialUrl || 'https://www.google.com';
  const searchQuery = route?.params?.searchQuery || '';
  const [url, setUrl] = React.useState(initialUrl);
  const [currentUrl, setCurrentUrl] = React.useState(initialUrl);
  const [isLoading, setIsLoading] = React.useState(false);
  const [canGoBack, setCanGoBack] = React.useState(false);
  const [canGoForward, setCanGoForward] = React.useState(false);
  const [extractedData, setExtractedData] = React.useState<any>(null);
  const [screenshotBase64, setScreenshotBase64] = React.useState<string>('');
  const webViewRef = React.useRef<WebView>(null);
  const { colors } = useContext(ThemeContext);

  const handleNavigationStateChange = (navState: any) => {
    setCurrentUrl(navState.url);
    setCanGoBack(navState.canGoBack);
    setCanGoForward(navState.canGoForward);
    setIsLoading(false);
  };

  const handleLoadStart = () => {
    setIsLoading(true);
  };

  const goBack = () => {
    if (canGoBack) {
      webViewRef.current?.goBack();
    }
  };

  const goForward = () => {
    if (canGoForward) {
      webViewRef.current?.goForward();
    }
  };

  const reload = () => {
    webViewRef.current?.reload();
  };

  const navigateToUrl = () => {
    let targetUrl = url.trim();
    if (!targetUrl) return;

    if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
      if (targetUrl.includes('.') && !targetUrl.includes(' ')) {
        targetUrl = 'https://' + targetUrl;
      } else {
        targetUrl = 'https://www.google.com/search?q=' + encodeURIComponent(targetUrl);
      }
    }

    setUrl(targetUrl);
    setIsLoading(true);
  };

  return (
    <View style={[styles.fullScreen, { backgroundColor: colors.background }]}>
      <View style={[styles.addressBar, { backgroundColor: colors.browserBar, borderBottomColor: colors.border }]}>
        <TouchableOpacity
          style={[styles.navButton, !canGoBack && styles.disabledButton]}
          onPress={goBack}
          disabled={!canGoBack}
        >
          <Ionicons name="arrow-back" size={20} color={canGoBack ? colors.text : colors.textLight} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.navButton, !canGoForward && styles.disabledButton]}
          onPress={goForward}
          disabled={!canGoForward}
        >
          <Ionicons name="arrow-forward" size={20} color={canGoForward ? colors.text : colors.textLight} />
        </TouchableOpacity>

        <View style={[styles.urlInputContainer, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <TextInput
            style={[styles.urlInput, { color: colors.text }]}
            value={currentUrl}
            onChangeText={(text) => {
              setUrl(text);
              setCurrentUrl(text);
            }}
            placeholder="Enter URL or search"
            placeholderTextColor={colors.textLight}
            autoCapitalize="none"
            editable={!isLoading}
            onSubmitEditing={navigateToUrl}
          />
          <TouchableOpacity onPress={navigateToUrl} disabled={isLoading}>
            <Ionicons name="arrow-forward" size={16} color={isLoading ? colors.textLight : colors.primary} />
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.reloadButton, isLoading && styles.disabledButton]}
          onPress={reload}
          disabled={isLoading}
        >
          <Ionicons
            name={isLoading ? "hourglass" : "refresh"}
            size={20}
            color={isLoading ? colors.textLight : colors.text}
          />
        </TouchableOpacity>
      </View>

      <View style={styles.webviewContainer}>
        <WebView
          ref={webViewRef}
          source={{ uri: url }}
          onNavigationStateChange={handleNavigationStateChange}
          onLoadStart={handleLoadStart}
          onLoadEnd={async () => {
            setIsLoading(false);
            // Inject extraction script if searchQuery provided
            if (searchQuery && webViewRef.current) {
              let extractionScript = '';
              if (searchQuery.toLowerCase().includes('email') || searchQuery.toLowerCase().includes('contact')) {
                extractionScript = `
                  setTimeout(() => {
                    const emails = Array.from(document.querySelectorAll('a[href^="mailto:"], [href*="@"], .email, [class*="email"], [class*="contact"]'))
                      .map(el => el.href || el.textContent || el.getAttribute('href') || el.innerText)
                      .filter(text => /\S+@\S+\.\S+/.test(text))
                      .map(text => text.match(/(\S+@\S+\.\S+)/)?.[0] || text)
                      .filter((email, index, self) => self.indexOf(email) === index);
                    if (emails.length > 0) {
                      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'extracted_emails', data: emails }));
                    }
                  }, 2000);
                `;
              } else if (searchQuery.toLowerCase().includes('price') || searchQuery.toLowerCase().includes('stock')) {
                extractionScript = `
                  setTimeout(() => {
                    const prices = Array.from(document.querySelectorAll('.price, [class*="price"], .cost, .amount, [data-price]'))
                      .map(el => el.textContent?.trim() || el.getAttribute('data-price') || '')
                      .filter(text => /\$?\d+(?:,\d{3})*(?:\.\d{2})?/.test(text))
                      .filter((price, index, self) => self.indexOf(price) === index);
                    if (prices.length > 0) {
                      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'extracted_prices', data: prices }));
                    }
                  }, 2000);
                `;
              } else {
                // General text summary extraction
                extractionScript = `
                  setTimeout(() => {
                    const summary = document.body.innerText.substring(0, 2000).trim();
                    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'page_summary', data: summary }));
                  }, 2000);
                `;
              }
              webViewRef.current.injectJavaScript(extractionScript);
            }
            // Capture screenshot for vision
            try {
              const uri = await captureRef(webViewRef, { format: 'png', quality: 0.8 });
              const response = await fetch(uri);
              const blob = await response.blob();
              const reader = new FileReader();
              reader.readAsDataURL(blob);
              reader.onloadend = () => {
                const base64data = reader.result as string;
                const base64 = base64data.split(',')[1];
                setScreenshotBase64(base64);
                // Post to Chat or use for vision
                if (searchQuery) {
                  window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'screenshot_ready', data: base64 }));
                }
              };
            } catch (error) {
              console.warn('Screenshot capture failed:', error);
            }
          }}
          onMessage={(event) => {
            try {
              const data = JSON.parse(event.nativeEvent.data);
              setExtractedData(data);
              console.log('Extracted data:', data);
              // Auto-navigate back to Chat with extracted data
              setTimeout(() => {
                navigation.navigate('Chat', { extractedData: data });
              }, 1000);
            } catch (e) {
              console.warn('Failed to parse message:', event.nativeEvent.data);
            }
          }}
          startInLoadingState={true}
          style={styles.webview}
          originWhitelist={['*']}
          allowsBackForwardNavigationGestures={true}
          allowsFullscreenVideo={true}
          allowsLinkPreview={true}
          allowsInlineMediaPlayback={true}
          mediaPlaybackRequiresUserAction={false}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          cacheEnabled={true}
          cacheMode="LOAD_DEFAULT"
          thirdPartyCookiesEnabled={true}
          sharedCookiesEnabled={true}
          scrollEnabled={true}
          bounces={true}
          decelerationRate={0.998}
          onError={(syntheticEvent) => {
            const { nativeEvent } = syntheticEvent;
            console.warn('WebView error: ', nativeEvent);
            Alert.alert('Error', `Failed to load ${url}`);
          }}
          onHttpError={(syntheticEvent) => {
            const { nativeEvent } = syntheticEvent;
            console.warn('WebView HTTP error: ', nativeEvent);
          }}
          onContentProcessDidTerminate={() => {
            webViewRef.current?.reload();
          }}
        />

        {isLoading && (
          <View style={[styles.loadingOverlay, { backgroundColor: 'rgba(255, 255, 255, 0.95)' }]}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.loadingText, { color: colors.text }]}>Loading...</Text>
          </View>
        )}
      </View>
    </View>
  );
};

// ChatScreen with Real AI
const ChatScreen = ({ route }: { route: any }) => {
  const navigation = useNavigation();
  const { colors } = useContext(ThemeContext);
  const messagesContainerRef = React.useRef<ScrollView>(null);
  const [messages, setMessages] = React.useState([
    {
      id: '1',
      text: `Hi! I'm your BrowserOS AI assistant. I can help you with browsing, answering questions, and more. I can also search the web when needed. How can I assist you today?`,
      sender: 'bot',
      timestamp: new Date(),
      type: 'text'
    }
  ]);
  const { aiConfig } = useAI();
  const [inputText, setInputText] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(false);
  const [typingMessageId, setTypingMessageId] = React.useState<string | null>(null);

  // Handle incoming extracted data from Browser
  useEffect(() => {
    if (route.params?.extractedData) {
      const { type, data } = route.params.extractedData;
      let messageText = '';
      if (type === 'extracted_emails') {
        messageText = `Found these emails: ${data.join(', ')}`;
      } else if (type === 'extracted_prices') {
        messageText = `Found these prices: ${data.join(', ')}`;
      } else if (type === 'page_summary') {
        messageText = `Page summary: ${data.substring(0, 200)}...`;
      } else {
        messageText = `Extracted data: ${JSON.stringify(data)}`;
      }
      const extractedMessage = {
        id: Date.now().toString(),
        text: messageText,
        sender: 'bot' as const,
        timestamp: new Date(),
        type: 'extracted' as const,
        extractedData: data
      };
      setMessages(prev => [...prev, extractedMessage]);
      // Clear params
      navigation.setParams({ extractedData: null });
    }
  }, [route.params?.extractedData]);

  const sendMessage = async () => {
    if (!inputText.trim() || isLoading) return;

    const userMessage = {
      id: Date.now().toString(),
      text: inputText,
      sender: 'user' as 'user' | 'bot',
      timestamp: new Date(),
      type: 'text'
    };
    setMessages(prev => [...prev, userMessage]);
    const tempInput = inputText;
    setInputText('');
    setIsLoading(true);

    try {
      // Add typing indicator
      const typingId = (Date.now() + 1).toString();
      const typingMessage = {
        id: typingId,
        text: 'AI is thinking...',
        sender: 'bot' as const,
        timestamp: new Date(),
        type: 'status'
      };
      setMessages(prev => [...prev, typingMessage]);
      setTypingMessageId(typingId);

      let agentResponse: AgentResponse;
      if (aiConfig.enabled && aiConfig.apiKey) {
        // Prepare message history for context
        const messageHistory = messages
          .filter(msg => msg.type === 'text')
          .slice(-10) // Keep last 10 messages for context
          .map(msg => ({
            role: msg.sender === 'user' ? 'user' as const : 'assistant' as const,
            content: msg.text
          }));

        // Real API call with conversation history
        agentResponse = await callLLM(tempInput, aiConfig, messageHistory);
      } else {
        // Demo response
        agentResponse = { needsSearch: false, searchQuery: '', response: 'This is a demo response. To use real AI, enable AI in Settings, select a provider, and enter your API key.' };
      }

      // Replace typing indicator
      if (agentResponse.needsSearch) {
        const searchMessage = {
          id: (Date.now() + 2).toString(),
          text: `Searching the web for: ${agentResponse.searchQuery}`,
          sender: 'bot' as const,
          timestamp: new Date(),
          type: 'status'
        };
        setMessages(prev => [...prev, searchMessage]);

        // Navigate to Browser tab with search query
        const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(agentResponse.searchQuery)}`;
        navigation.navigate('Browser', { initialUrl: searchUrl, searchQuery: agentResponse.searchQuery });
      } else {
        setMessages(prev => prev.map(msg =>
          msg.id === typingId
            ? { ...msg, text: agentResponse.response, type: 'text' }
            : msg
        ));
      }
    } catch (error) {
      console.error('AI Error:', error);
      const errorMessage = {
        id: (Date.now() + 2).toString(),
        text: `Error: ${error.message}. Check your API key in Settings.`,
        sender: 'bot' as const,
        timestamp: new Date(),
        type: 'text'
      };
      setMessages(prev => {
        const filtered = prev.filter(msg => msg.id !== typingMessageId);
        return [...filtered, errorMessage];
      });
    } finally {
      setTypingMessageId(null);
      setIsLoading(false);
    }
  };

  return (
    <View style={[styles.fullScreen, { backgroundColor: colors.background }]}>
      <ScrollView
        ref={messagesContainerRef}
        style={[styles.messagesContainer, { padding: 16 }]}
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 20 }}
        showsVerticalScrollIndicator={true}
        keyboardShouldPersistTaps='handled'
        onContentSizeChange={() => messagesContainerRef.current?.scrollToEnd({ animated: true })}
      >
        {messages.map(message => {
        if (message.type === 'search_results' && message.searchResults) {
          return (
            <View key={message.id} style={[styles.message, styles.botMessage, { backgroundColor: colors.chatBubble }]}>
              <Text style={[styles.messageText, { color: colors.text, marginBottom: 10 }]}>{message.text}</Text>
              {message.searchResults.map((result: any, index: number) => (
                <TouchableOpacity 
                  key={index} 
                  style={[styles.searchResult, { borderColor: colors.border }]}
                  onPress={() => Linking.openURL(result.link)}
                >
                  <Text style={[styles.searchResultTitle, { color: colors.primary }]}>{result.title}</Text>
                  <Text style={[styles.searchResultSnippet, { color: colors.text }]} numberOfLines={2}>
                    {result.snippet}
                  </Text>
                  <Text style={[styles.searchResultLink, { color: colors.textLight }]} numberOfLines={1}>
                    {result.link}
                  </Text>
                </TouchableOpacity>
              ))}
              <Text style={[styles.timestamp, { color: colors.textLight }]}>{message.timestamp.toLocaleTimeString()}</Text>
            </View>
          );
        }
        
        return (
          <View key={message.id} style={[
            styles.message,
            message.sender === 'user'
              ? [styles.userMessage, { backgroundColor: colors.chatBubbleSent }]
              : [styles.botMessage, { backgroundColor: colors.chatBubble }]
          ]}>
            <Text style={[styles.messageText, { color: colors.text }]}>{message.text}</Text>
            <Text style={[styles.timestamp, { color: colors.textLight }]}>{message.timestamp.toLocaleTimeString()}</Text>
          </View>
        );
      })}
        {isLoading && (
          <View style={[styles.message, styles.botMessage, { backgroundColor: colors.chatBubble }]}>
            <Text style={[styles.messageText, { color: colors.text }]}>AI is thinking...</Text>
          </View>
        )}
      </ScrollView>
      <View style={[styles.inputContainer, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
        <TextInput
          style={[styles.input, { borderColor: colors.border, backgroundColor: colors.background, color: colors.text }]}
          value={inputText}
          onChangeText={setInputText}
          placeholder="Type your message..."
          placeholderTextColor={colors.textLight}
          multiline
        />
        <TouchableOpacity
          style={[styles.sendButton, { backgroundColor: colors.primary }]}
          onPress={sendMessage}
          disabled={!inputText.trim() || isLoading}
        >
          <Ionicons name="send" size={20} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
    </View>
  );
};

// HubScreen (unchanged)
const HubScreen = () => {
  const bookmarks = [
    { id: '1', title: 'Google', url: 'https://google.com' },
    { id: '2', title: 'GitHub', url: 'https://github.com' },
    { id: '3', title: 'Twitter', url: 'https://twitter.com' },
  ];
  const { colors } = useContext(ThemeContext);

  return (
    <ScrollView style={[styles.fullScreen, { backgroundColor: colors.background }]}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>Bookmarks</Text>
      {bookmarks.map(item => (
        <TouchableOpacity key={item.id} style={[styles.bookmarkItem, { backgroundColor: colors.tabInactive, borderColor: colors.border }]}>
          <Text style={[styles.bookmarkTitle, { color: colors.text }]}>{item.title}</Text>
          <Text style={[styles.bookmarkUrl, { color: colors.textLight }]}>{item.url}</Text>
        </TouchableOpacity>
      ))}
      <Text style={[styles.sectionTitle, { marginTop: 20, color: colors.text }]}>Recent History</Text>
      <Text style={[styles.placeholderText, { color: colors.textLight }]}>History will appear here</Text>
    </ScrollView>
  );
};

// SettingsScreen
const SettingsScreen = () => {
  const [localTheme, setLocalTheme] = React.useState<'light' | 'dark' | 'system'>('system');
  const [notifications, setNotifications] = React.useState(true);
  const [aiEnabled, setAiEnabled] = React.useState(false);
  const [aiProvider, setAiProvider] = React.useState<'openai' | 'google' | 'openrouter'>('openai');
  const [aiModel, setAiModel] = React.useState('gpt-3.5-turbo');
  const [aiApiKey, setAiApiKey] = React.useState('');
  const [aiBaseUrl, setAiBaseUrl] = React.useState('');
  const [aiTemperature, setAiTemperature] = React.useState(0.7);
  const [aiMaxTokens, setAiMaxTokens] = React.useState(1000);
  const { theme, setTheme, colors } = useContext(ThemeContext);
  const { aiConfig, updateAIConfig } = useAI();

  const providers = [
    { label: 'OpenAI', value: 'openai' },
    { label: 'Google', value: 'google' },
    { label: 'OpenRouter', value: 'openrouter' },
  ];

  const models = {
    openai: ['gpt-3.5-turbo', 'gpt-4', 'gpt-4-turbo'],
    google: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-1.5-flash', 'gemini-1.5-pro'],
    openrouter: ['openai/gpt-3.5-turbo', 'anthropic/claude-3-sonnet', 'google/gemini-1.5-flash', 'google/gemini-2.5-flash'],
  };

  // Sync local state with context
  useEffect(() => {
    setLocalTheme(theme);
    setNotifications(true); // Demo
    setAiEnabled(aiConfig.enabled);
    setAiProvider(aiConfig.provider);
    setAiModel(aiConfig.model);
    setAiApiKey(aiConfig.apiKey);
    setAiBaseUrl(aiConfig.baseUrl);
    setAiTemperature(aiConfig.temperature);
    setAiMaxTokens(aiConfig.maxTokens);
  }, [theme, aiConfig]);

  const saveSettings = async () => {
    const newConfig = {
      enabled: aiEnabled,
      provider: aiProvider,
      model: aiModel,
      apiKey: aiApiKey,
      baseUrl: aiBaseUrl,
      temperature: aiTemperature,
      maxTokens: aiMaxTokens,
    };
    await updateAIConfig(newConfig);
    setTheme(localTheme);
    Alert.alert('Settings Saved', 'Your preferences have been updated successfully!');
  };

  const testAIConnection = async () => {
    if (!aiEnabled) {
      Alert.alert('AI Disabled', 'Please enable AI first to test the connection.');
      return;
    }

    const performTest = async () => {
      try {
        const testResponse = await callLLM('Hello, test message', {
          enabled: true,
          provider: aiProvider,
          model: aiModel,
          apiKey: aiApiKey,
          baseUrl: aiBaseUrl,
          temperature: aiTemperature,
          maxTokens: aiMaxTokens,
        });
        Alert.alert('Connection Successful', `Response: ${testResponse.substring(0, 100)}...`);
      } catch (error) {
        Alert.alert('Connection Failed', `Error: ${error.message}`);
      }
    };

    if (aiProvider === 'google' && aiModel.startsWith('gemini-1.5-')) {
      Alert.alert(
        'Legacy Model',
        'Gemini 1.5 models are stable but older. For best performance, consider newer models. Continue?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Continue', onPress: performTest }
        ]
      );
    } else {
      performTest();
    }
  };

  return (
    <ScrollView style={[styles.fullScreen, { backgroundColor: colors.background }]} contentContainerStyle={styles.scrollContent}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>App Settings</Text>

      <View style={[styles.settingItem, { backgroundColor: colors.tabInactive, borderColor: colors.border }]}>
        <Text style={[styles.settingLabel, { color: colors.text }]}>Theme</Text>
        <View style={styles.pickerContainer}>
          {['system', 'light', 'dark'].map((themeOption) => (
            <TouchableOpacity
              key={themeOption}
              style={[
                styles.themeOption,
                localTheme === themeOption && { backgroundColor: colors.primary }
              ]}
              onPress={() => setLocalTheme(themeOption as 'light' | 'dark' | 'system')}
            >
              <Text style={[
                styles.themeOptionText,
                localTheme === themeOption && { color: '#FFFFFF' }
              ]}>
                {themeOption.charAt(0).toUpperCase() + themeOption.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={[styles.settingItem, { backgroundColor: colors.tabInactive, borderColor: colors.border }]}>
        <View style={styles.settingRow}>
          <Text style={[styles.settingLabel, { color: colors.text }]}>Notifications</Text>
          <Switch
            value={notifications}
            onValueChange={setNotifications}
            trackColor={{ true: colors.primary, false: colors.border }}
            thumbColor={notifications ? '#FFFFFF' : colors.textLight}
          />
        </View>
      </View>

      <Text style={[styles.sectionTitle, { marginTop: 20, color: colors.text }]}>AI Assistant</Text>
      <Text style={[{ color: colors.textLight, marginBottom: 16, paddingHorizontal: 16, fontSize: 14, fontStyle: 'italic' }]}>
        Free Gemini API: 15 requests/min, 1500 requests/day. Wait 4s between messages to avoid quota errors.
      </Text>

      <View style={[styles.settingItem, { backgroundColor: colors.tabInactive, borderColor: colors.border }]}>
        <View style={styles.settingRow}>
          <Text style={[styles.settingLabel, { color: colors.text }]}>Enable AI Assistant</Text>
          <Switch
            value={aiEnabled}
            onValueChange={setAiEnabled}
            trackColor={{ true: colors.primary, false: colors.border }}
            thumbColor={aiEnabled ? '#FFFFFF' : colors.textLight}
          />
        </View>
      </View>

      {aiEnabled && (
        <>
          <View style={[styles.settingItem, { backgroundColor: colors.tabInactive, borderColor: colors.border }]}>
            <Text style={[styles.settingLabel, { color: colors.text }]}>Provider</Text>
            <View style={styles.pickerContainer}>
              {providers.map((provider) => (
                <TouchableOpacity
                  key={provider.value}
                  style={[
                    styles.providerOption,
                    aiProvider === provider.value && { backgroundColor: colors.primary }
                  ]}
                  onPress={() => setAiProvider(provider.value as 'openai' | 'google' | 'openrouter')}
                >
                  <Text style={[
                    styles.providerOptionText,
                    aiProvider === provider.value && { color: '#FFFFFF' }
                  ]}>
                    {provider.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={[styles.settingItem, { backgroundColor: colors.tabInactive, borderColor: colors.border }]}>
            <Text style={[styles.settingLabel, { color: colors.text }]}>Model</Text>
            <View style={styles.pickerContainer}>
              {models[aiProvider].map((model) => {
                const isGemini25 = model.startsWith('gemini-2.5-');
                const isGemini15 = model.startsWith('gemini-1.5-');
                const modelLabel = model + (isGemini15 ? ' (Stable)' : '');
                return (
                  <TouchableOpacity
                    key={model}
                    style={[
                      styles.providerOption,
                      aiModel === model && { backgroundColor: colors.primary }
                    ]}
                    onPress={() => setAiModel(model)}
                  >
                    <Text style={[
                      styles.providerOptionText,
                      aiModel === model && { color: '#FFFFFF' },
                      isGemini25 && { color: '#10B981' }, // Green for experimental
                      isGemini15 && { color: '#3B82F6' } // Blue for stable
                    ]}>
                      {modelLabel}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {(aiProvider === 'openai' || aiProvider === 'openrouter') && (
            <View style={[styles.settingItem, { backgroundColor: colors.tabInactive, borderColor: colors.border }]}>
              <Text style={[styles.settingLabel, { color: colors.text }]}>API Key</Text>
              <TextInput
                style={[styles.textInput, { borderColor: colors.border, backgroundColor: colors.background, color: colors.text }]}
                value={aiApiKey}
                onChangeText={setAiApiKey}
                placeholder="Enter your API key"
                placeholderTextColor={colors.textLight}
                secureTextEntry={true}
                autoCapitalize="none"
              />
            </View>
          )}

          {aiProvider === 'google' && (
            <View style={[styles.settingItem, { backgroundColor: colors.tabInactive, borderColor: colors.border }]}>
              <Text style={[styles.settingLabel, { color: colors.text }]}>Google API Key</Text>
              <TextInput
                style={[styles.textInput, { borderColor: colors.border, backgroundColor: colors.background, color: colors.text }]}
                value={aiApiKey}
                onChangeText={setAiApiKey}
                placeholder="Enter Google API key"
                placeholderTextColor={colors.textLight}
                secureTextEntry={true}
                autoCapitalize="none"
              />
            </View>
          )}

          {(aiProvider === 'openai' || aiProvider === 'openrouter') && (
            <View style={[styles.settingItem, { backgroundColor: colors.tabInactive, borderColor: colors.border }]}>
              <Text style={[styles.settingLabel, { color: colors.text }]}>Base URL (Optional)</Text>
              <TextInput
                style={[styles.textInput, { borderColor: colors.border, backgroundColor: colors.background, color: colors.text }]}
                value={aiBaseUrl}
                onChangeText={setAiBaseUrl}
                placeholder={aiProvider === 'openai' ? 'https://api.openai.com/v1' : 'https://openrouter.ai/api/v1'}
                placeholderTextColor={colors.textLight}
                autoCapitalize="none"
              />
            </View>
          )}

          <View style={[styles.settingItem, { backgroundColor: colors.tabInactive, borderColor: colors.border }]}>
            <Text style={[styles.settingLabel, { color: colors.text }]}>Temperature</Text>
            <TextInput
              style={[styles.smallInput, { borderColor: colors.border, backgroundColor: colors.background, color: colors.text }]}
              value={aiTemperature.toString()}
              onChangeText={(text) => {
                const num = parseFloat(text);
                if (!isNaN(num) && num >= 0 && num <= 2) setAiTemperature(num);
              }}
              placeholder="0.7"
              placeholderTextColor={colors.textLight}
              keyboardType="decimal-pad"
            />
          </View>

          <View style={[styles.settingItem, { backgroundColor: colors.tabInactive, borderColor: colors.border }]}>
            <Text style={[styles.settingLabel, { color: colors.text }]}>Max Tokens</Text>
            <TextInput
              style={[styles.smallInput, { borderColor: colors.border, backgroundColor: colors.background, color: colors.text }]}
              value={aiMaxTokens.toString()}
              onChangeText={(text) => {
                const num = parseInt(text);
                if (!isNaN(num) && num > 0 && num <= 4000) setAiMaxTokens(num);
              }}
              placeholder="1000"
              placeholderTextColor={colors.textLight}
              keyboardType="numeric"
            />
          </View>

          <TouchableOpacity style={[styles.testButton, { backgroundColor: colors.accent }]} onPress={testAIConnection}>
            <Text style={[styles.testButtonText, { color: colors.background }]}>Test Connection</Text>
          </TouchableOpacity>
        </>
      )}

      <TouchableOpacity style={[styles.saveButton, { backgroundColor: colors.primary }]} onPress={saveSettings}>
        <Text style={[styles.saveButtonText, { color: colors.background }]}>Save All Settings</Text>
      </TouchableOpacity>
    </ScrollView>
  );
};


const styles = StyleSheet.create({
  fullScreen: {
    flex: 1,
  },
  searchResult: {
    marginBottom: 12,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  searchResultTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  searchResultSnippet: {
    fontSize: 14,
    marginBottom: 4,
    opacity: 0.9,
  },
  searchResultLink: {
    fontSize: 12,
    opacity: 0.7,
  },
  addressBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 12,
    height: 56,
  },
  navButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    justifyContent: 'center',
    borderRadius: 8,
  },
  disabledButton: {
    opacity: 0.5,
  },
  urlInputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginHorizontal: 8,
    minHeight: 40,
  },
  urlInput: {
    flex: 1,
    fontSize: 14,
    marginRight: 8,
  },
  reloadButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    justifyContent: 'center',
    borderRadius: 8,
  },
  webviewContainer: {
    flex: 1,
    position: 'relative',
  },
  webview: {
    flex: 1,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    fontWeight: '500',
    marginTop: 8,
  },
  messagesContainer: {
    flex: 1,
  },
  message: {
    padding: 12,
    borderRadius: 16,
    marginVertical: 4,
    maxWidth: '80%',
  },
  userMessage: {
    alignSelf: 'flex-end',
    marginLeft: '20%',
  },
  botMessage: {
    alignSelf: 'flex-start',
    marginRight: '20%',
  },
  messageText: {
    fontSize: 16,
    lineHeight: 22,
  },
  timestamp: {
    fontSize: 12,
    marginTop: 4,
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 16,
    borderTopWidth: 1,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    marginRight: 8,
    maxHeight: 100,
  },
  sendButton: {
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
    justifyContent: 'center',
  },
  scrollContent: {
    paddingBottom: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginTop: 20,
    marginBottom: 16,
    paddingHorizontal: 16,
  },
  settingItem: {
    padding: 16,
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 12,
    borderWidth: 1,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '500',
  },
  pickerContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  themeOption: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  themeOptionText: {
    fontSize: 14,
    color: '#6366F1',
  },
  providerOption: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginRight: 8,
    marginBottom: 8,
  },
  providerOptionText: {
    fontSize: 14,
    color: '#6366F1',
  },
  textInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    marginTop: 8,
  },
  smallInput: {
    width: 80,
    textAlign: 'center',
  },
  testButton: {
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
    marginHorizontal: 16,
  },
  testButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  saveButton: {
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 20,
    marginTop: 20,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  placeholderText: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 20,
    paddingHorizontal: 16,
  },
  bookmarkItem: {
    padding: 16,
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 12,
    borderWidth: 1,
  },
  bookmarkTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  bookmarkUrl: {
    fontSize: 14,
  },
});


export default function App() {
  console.log('BrowserOS Mobile App - Full Version with Real AI Starting');
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AIProvider>
        <ThemeProvider>
          <SafeAreaProvider>
            <StatusBar style="auto" />
            <AppNavigator />
          </SafeAreaProvider>
        </ThemeProvider>
      </AIProvider>
    </GestureHandlerRootView>
  );
}