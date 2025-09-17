import React, { useState, useEffect, useRef } from 'react';
import { View, Text, Alert, Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import { GoogleGenerativeAI } from '@google/generative-ai';
import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';

// Mobile-compatible contact search parameters
export type MobileContactSearchParams = {
  target: string;
  contactType: 'email' | 'phone' | 'address' | 'social' | 'general';
  location?: string;
  additionalFilters?: string;
  analysisDepth: 'quick' | 'thorough';
  maxResults: number;
};

export interface MobileContactResult {
  value: string;
  type: 'email' | 'phone' | 'address' | 'social' | 'general';
  confidence: number;
  source: 'text' | 'vision' | 'webview';
  context: string;
  validation: {
    domainMatch?: boolean;
    patternMatch?: boolean;
    locationMatch?: boolean;
  };
}

interface WebViewMessage {
  type: 'dom_content' | 'screenshot' | 'error';
  data: any;
  url: string;
  timestamp: number;
}

export const ContactSearchAgentMobile: React.FC<{
  params: MobileContactSearchParams;
  onResults: (results: MobileContactResult[]) => void;
  onProgress: (message: string) => void;
}> = ({ params, onResults, onProgress }) => {
  const [webViewRef] = useRef<WebView>(null);
  const [genAI] = useState(() => {
    const apiKey = Constants.expoConfig?.extra?.GEMINI_API_KEY as string;
    if (!apiKey || apiKey === 'your_gemini_api_key_here') {
      console.warn('GEMINI_API_KEY not configured for mobile');
      return null;
    }
    return new GoogleGenerativeAI(apiKey);
  });
  const [currentUrl, setCurrentUrl] = useState('');
  const [searchResults, setSearchResults] = useState<MobileContactResult[]>([]);
  const [isSearching, setIsSearching] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Mobile-compatible injected JavaScript for DOM extraction
  const injectedJavaScript = `
    (function() {
      // Mobile DOM extraction script
      window.postMobileMessage = function(type, data) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type,
          data,
          url: window.location.href,
          timestamp: Date.now()
        }));
      };

      // Extract emails from DOM
      function extractEmails() {
        const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,})/gi;
        const text = document.body.innerText;
        const emails = [...text.matchAll(emailRegex)].map(match => ({
          value: match[1],
          context: 'body text',
          location: 'text content'
        }));
        return emails.filter(email =>
          email.value.toLowerCase().includes('${params.target.toLowerCase()}') ||
          email.value.includes('contact') ||
          email.value.includes('info')
        );
      }

      // Extract phone numbers
      function extractPhones() {
        const phoneRegex = /(\\(\\+?1[-.\\s]?\\)?\\(?([0-9]{3})\\)?[-.\\s]?([0-9]{3})[-.\\s]?([0-9]{4})\\)?/g;
        const text = document.body.innerText;
        const phones = [...text.matchAll(phoneRegex)].map(match => ({
          value: match[0],
          context: 'body text',
          location: 'text content'
        }));
        return phones;
      }

      // Extract contact links
      function extractContactLinks() {
        const links = Array.from(document.querySelectorAll('a[href]')).filter(link => {
          const href = link.getAttribute('href') || '';
          return href.includes('mailto:') ||
                 href.includes('contact') ||
                 href.includes('about') ||
                 link.textContent?.toLowerCase().includes('contact');
        }).map(link => ({
          value: link.getAttribute('href') || '',
          text: link.textContent || '',
          context: link.closest('section')?.tagName || 'unknown',
          location: 'link element'
        }));
        return links;
      }

      // Extract from common contact sections
      function extractFromContactSections() {
        const selectors = [
          '.contact', '.contacts', '#contact', '#contacts',
          '.footer', '.footers', '#footer',
          '.about', '.about-us', '#about',
          '[class*="contact"]', '[id*="contact"]'
        ];

        const contacts = [];
        selectors.forEach(selector => {
          const elements = document.querySelectorAll(selector);
          elements.forEach(el => {
            const text = el.textContent || '';
            const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,})/gi;
            const emails = [...text.matchAll(emailRegex)].map(match => ({
              value: match[1],
              context: selector,
              location: 'contact section'
            }));
            contacts.push(...emails);
          });
        });
        return contacts;
      }

      // Main extraction function
      function extractAllContacts() {
        const allContacts = [
          ...extractEmails(),
          ...extractPhones(),
          ...extractContactLinks(),
          ...extractFromContactSections()
        ];

        // Remove duplicates and filter relevant
        const uniqueContacts = allContacts.filter((contact, index, self) =>
          index === self.findIndex(c => c.value.toLowerCase() === contact.value.toLowerCase())
        ).filter(contact =>
          contact.value.toLowerCase().includes('${params.target.toLowerCase()}') ||
          contact.context.toLowerCase().includes('contact') ||
          contact.value.includes('@') ||
          contact.value.match(/\\d{3}[-.\\s]\\d{3}[-.\\s]\\d{4}/)
        );

        window.postMobileMessage('dom_content', {
          contacts: uniqueContacts,
          pageTitle: document.title,
          url: window.location.href,
          bodyTextLength: document.body.innerText.length,
          contactSectionsFound: extractFromContactSections().length
        });
      }

      // Run extraction when DOM is ready
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', extractAllContacts);
      } else {
        extractAllContacts();
      }

      // Also run on page changes (SPA support)
      let currentUrl = window.location.href;
      new MutationObserver(() => {
        if (window.location.href !== currentUrl) {
          currentUrl = window.location.href;
          setTimeout(extractAllContacts, 1000);
        }
      }).observe(document.body, { childList: true, subtree: true });

      // Extract on initial load
      setTimeout(extractAllContacts, 2000);
    })();
  `;

  // Mobile-compatible Gemini vision analysis
  const analyzeWithGemini = async (imageUri: string, context: string): Promise<MobileContactResult[]> => {
    if (!genAI) {
      onProgress('⚠️ Gemini API not available on mobile. Using text extraction only.');
      return [];
    }

    try {
      onProgress('👁️ Analyzing screenshot with Gemini...');

      // Get image data for mobile
      const imageData = await FileSystem.readAsStringAsync(imageUri, {
        encoding: FileSystem.EncodingType.Base64
      });

      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
      const prompt = `Analyze this webpage screenshot for contact information about "${params.target}".

Look for:
- Email addresses (especially company domain emails)
- Phone numbers in contact sections
- Physical addresses in footers
- Social media links (LinkedIn, Twitter)
- Contact forms or "Get in touch" buttons

Return JSON format:
{
  "contacts": [
    {
      "value": "contact@example.com",
      "type": "email",
      "confidence": 0.95,
      "location": "footer section",
      "context": "Found in contact information"
    }
  ],
  "insights": ["Page appears to be contact page", "Multiple contact methods found"],
  "pageType": "contact page"
}

Focus on high-quality contacts relevant to ${params.target}.`;

      const result = await model.generateContent([
        prompt,
        {
          inlineData: {
            data: imageData,
            mimeType: 'image/png'
          }
        }
      ]);

      const response = result.response.text();
      onProgress(`✅ Gemini analysis complete: ${response.substring(0, 100)}...`);

      // Parse response
      try {
        const parsed = JSON.parse(response);
        return parsed.contacts || [];
      } catch {
        // Fallback parsing
        const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,})/g;
        const emails = [...response.matchAll(emailRegex)].map(match => ({
          value: match[1],
          type: 'email' as const,
          confidence: 0.7,
          source: 'vision_text',
          context: 'Extracted from Gemini text response',
          validation: {}
        }));
        return emails;
      }
    } catch (error) {
      console.error('Mobile Gemini analysis failed:', error);
      onProgress(`❌ Gemini analysis failed: ${error}`);
      return [];
    }
  };

  // Handle WebView messages
  const handleWebViewMessage = async (event: { nativeEvent: { data: string } }) => {
    try {
      const message: WebViewMessage = JSON.parse(event.nativeEvent.data);

      if (message.type === 'dom_content') {
        onProgress(`📄 Extracted ${message.data.contacts.length} contacts from ${message.url}`);

        // Process extracted contacts
        const processedContacts: MobileContactResult[] = message.data.contacts.map((contact: any) => ({
          value: contact.value,
          type: contact.type || 'general' as any,
          confidence: 0.75, // Base confidence for DOM extraction
          source: 'webview',
          context: `${contact.context} on ${message.url}`,
          validation: {
            domainMatch: contact.value.includes(params.target.toLowerCase()),
            patternMatch: true
          }
        }));

        setSearchResults(prev => [...prev, ...processedContacts]);

        // If we have vision enabled, take screenshot and analyze
        if (params.analysisDepth === 'thorough' && genAI) {
          // For mobile, we need to implement screenshot capture
          // This is a placeholder - actual implementation would use device screenshot APIs
          onProgress('📸 Screenshot analysis not available on mobile. Using DOM extraction only.');

          // In a full implementation, you'd use:
          // - expo-media-library for screenshot capture
          // - Device APIs for screen capture
          // - Send to Gemini for analysis
        }
      } else if (message.type === 'error') {
        setError(message.data.error);
        onProgress(`❌ WebView error: ${message.data.error}`);
      }
    } catch (parseError) {
      console.error('Failed to parse WebView message:', parseError);
    }
  };

  // Perform Google search via WebView
  const performMobileSearch = () => {
    const searchQuery = `${params.target} ${params.contactType} contact ${params.location || ''} ${params.additionalFilters || ''}`.trim();

    onProgress(`🔍 Searching Google for: "${searchQuery}"`);

    const googleSearchUrl = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`;
    setCurrentUrl(googleSearchUrl);
    setSearchResults([]);
    setIsSearching(true);
    setError(null);
  };

  // Navigate to specific URL (for following links)
  const navigateToUrl = (url: string) => {
    setCurrentUrl(url);
    onProgress(`🌐 Navigating to: ${url}`);
  };

  useEffect(() => {
    performMobileSearch();
  }, [params]);

  if (error) {
    return (
      <View style={{ padding: 20, backgroundColor: '#fee' }}>
        <Text style={{ color: 'red', fontWeight: 'bold' }}>Error: {error}</Text>
        <Text style={{ marginTop: 10, color: '#666' }}>
          Mobile contact search encountered an issue. This may be due to:
        </Text>
        <Text style={{ marginTop: 5, color: '#666' }}>- Network connectivity</Text>
        <Text style={{ marginTop: 5, color: '#666' }}>- Website blocking automated access</Text>
        <Text style={{ marginTop: 5, color: '#666' }}>- Missing API configuration</Text>
        <Text style={{ marginTop: 10, color: 'blue' }} onPress={() => setError(null)}>
          🔄 Retry Search
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      {/* Progress Header */}
      <View style={{ padding: 15, backgroundColor: '#f8f9fa', borderBottomWidth: 1, borderBottomColor: '#e9ecef' }}>
        <Text style={{ fontWeight: 'bold', marginBottom: 5 }}>
          Contact Finder - {params.target}
        </Text>
        <Text style={{ color: '#666', fontSize: 12 }}>
          Searching for {params.contactType} {isSearching ? '...' : `(${searchResults.length} found)`}
        </Text>
        {currentUrl && (
          <Text style={{ color: '#007bff', fontSize: 10, marginTop: 5 }}>
            Current: {currentUrl.replace('https://', '').substring(0, 50)}...
          </Text>
        )}
      </View>

      {/* WebView */}
      <WebView
        ref={webViewRef}
        source={{ uri: currentUrl || 'https://www.google.com' }}
        injectedJavaScript={injectedJavaScript}
        onMessage={handleWebViewMessage}
        onLoadStart={() => onProgress(`🌐 Loading ${currentUrl}`)}
        onLoad={() => {
          onProgress(`✅ Loaded ${currentUrl}. Extracting contacts...`);
          setIsSearching(false);
        }}
        onError={(syntheticEvent) => {
          const { nativeEvent } = syntheticEvent;
          setError(`Failed to load ${currentUrl}: ${nativeEvent.description}`);
          onProgress(`❌ Failed to load page: ${nativeEvent.description}`);
        }}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        startInLoadingState={true}
        scalesPageToFit={true}
        sharedCookiesEnabled={true}
        thirdPartyCookiesEnabled={true}
        allowsInlineMediaPlayback={true}
        mediaPlaybackRequiresUserAction={false}
        style={{ flex: 1 }}
      />

      {/* Results Preview (Mobile Optimized) */}
      {searchResults.length > 0 && (
        <View style={{
          padding: 15,
          backgroundColor: '#f8f9fa',
          borderTopWidth: 1,
          borderTopColor: '#e9ecef',
          maxHeight: 200
        }}>
          <Text style={{ fontWeight: 'bold', marginBottom: 10 }}>
            📧 Found {searchResults.length} Contacts:
          </Text>
          {searchResults.slice(0, 3).map((contact, index) => (
            <View key={index} style={{
              padding: 8,
              backgroundColor: '#fff',
              marginBottom: 5,
              borderRadius: 5,
              borderLeftWidth: 3,
              borderLeftColor: contact.confidence > 0.8 ? '#28a745' : '#ffc107'
            }}>
              <Text style={{ fontWeight: 'bold', color: contact.type === 'email' ? '#007bff' : '#28a745' }}>
                {contact.value}
              </Text>
              <Text style={{ fontSize: 12, color: '#666' }}>
                {contact.context} ({(contact.confidence * 100).toFixed(0)}% confidence)
              </Text>
            </View>
          ))}
          {searchResults.length > 3 && (
            <Text style={{ fontSize: 12, color: '#666', textAlign: 'center' }}>
              ... and {searchResults.length - 3} more
            </Text>
          )}
        </View>
      )}
    </View>
  );
};

// Mobile utility functions
export const mobileContactSearchUtils = {
  // Validate mobile environment
  validateMobileSetup: (): { isValid: boolean; issues: string[] } => {
    const issues: string[] = [];

    // Check API key
    const apiKey = Constants.expoConfig?.extra?.GEMINI_API_KEY as string;
    if (!apiKey || apiKey === 'your_gemini_api_key_here') {
      issues.push('GEMINI_API_KEY not configured in app.json');
    }

    // Check permissions
    if (Platform.OS === 'ios') {
      // iOS WebView limitations
      issues.push('iOS WebView has limited screenshot capabilities');
    }

    return {
      isValid: issues.length === 0,
      issues
    };
  },

  // Build mobile search URL
  buildSearchUrl: (params: MobileContactSearchParams): string => {
    const query = `${params.target} ${params.contactType} contact ${params.location || ''} ${params.additionalFilters || ''}`.trim();
    return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
  },

  // Simple mobile screenshot (placeholder - needs native implementation)
  captureMobileScreenshot: async (): Promise<string | null> => {
    // This would require native module implementation
    // For now, return null to use DOM extraction only
    console.warn('Mobile screenshot capture not implemented. Using DOM extraction only.');
    return null;
  }
};

export default ContactSearchAgentMobile;
