# BrowserOS Mobile Development Plan

## Project Overview
BrowserOS Mobile is a React Native Expo application ported from the original desktop Chromium-based BrowserOS codebase. The goal is to create a fully functional mobile browser with integrated AI assistant capabilities, mirroring the desktop agent's features (AI chat, settings, hub) while adding native mobile browser functionality using WebView.

## Technical Architecture
- **Framework**: React Native with Expo SDK 54
- **Navigation**: React Navigation v7 with BottomTabNavigator (Browser, Chat, Hub, Settings tabs)
- **State Management**: React Context API (ThemeContext for dynamic theming, AIContext for AI configuration sharing)
- **Persistence**: AsyncStorage for saving AI settings (provider, model, API key, etc.) across app sessions
- **Browser Engine**: react-native-webview v13.15.0 for rendering web content with navigation controls
- **AI Integration**: Custom LLM service using native fetch API for real-time calls to multiple providers
- **Styling**: Dynamic theme system with light/dark/system modes, using StyleSheet with color props from context
- **TypeScript**: Full type safety with interfaces for AIConfig, theme types, navigation props

## Key Components and Features

### 1. Browser Tab (BrowserScreen)
- **WebView Implementation**: Full-featured browser with address bar, back/forward navigation, reload functionality
- **URL Handling**: Auto-detects and adds https:// prefix; converts search queries to Google search URLs
- **Navigation State**: Tracks canGoBack/canGoForward states from WebView navigation events
- **Loading States**: ActivityIndicator overlay during page loads, with error handling via Alert
- **WebView Props**: JavaScript enabled, DOM storage, third-party cookies, inline media playback
- **UI Elements**: TouchableOpacity for nav buttons, TextInput for URL/search, Ionicons for icons

### 2. Chat Tab (ChatScreen)
- **Real AI Integration**: Makes live API calls based on Settings configuration
- **Message System**: ScrollView with user/bot message bubbles, timestamps, typing indicators
- **Input Handling**: Multiline TextInput with send button, disabled during loading
- **Fallback Logic**: Shows demo response if AI not enabled/configured; real responses otherwise
- **Error Handling**: Catches API errors and displays user-friendly messages (e.g., "Invalid API key")
- **Message Structure**: Array of objects with id, text, sender ('user'/'bot'), timestamp

### 3. Hub Tab (HubScreen)
- **Bookmarks**: Static list of popular sites (Google, GitHub, Twitter) with tappable items
- **Recent History**: Placeholder for future implementation (currently shows "History will appear here")
- **UI Pattern**: ScrollView with bookmark cards, section titles, placeholder text

### 4. Settings Tab (SettingsScreen)
- **Theme Controls**: Toggle between system/light/dark modes with tappable option buttons
- **App Settings**: Notifications switch (demo functionality)
- **AI Configuration**:
  - Enable/disable toggle
  - Provider selection: OpenAI, Google (Gemini), OpenRouter via dropdown buttons
  - Model selection: Provider-specific models (e.g., gpt-3.5-turbo, gemini-pro, claude-3-sonnet)
  - API Key input: Secure TextInput with provider-specific placeholders
  - Base URL: Optional for custom endpoints (OpenAI/OpenRouter)
  - Temperature slider/input (0-2 range)
  - Max Tokens input (1-4000 range)
  - Test Connection button: Makes sample API call to verify configuration
  - Save All Settings: Persists to AsyncStorage and shows success alert
- **UI Patterns**: ScrollView with setting cards, Switch components, TouchableOpacity dropdowns, validation on numeric inputs

## AI Service Implementation (callLLM Function)

### Provider-Specific API Handling
**OpenAI**:
- Endpoint: `https://api.openai.com/v1/chat/completions` (or custom baseUrl)
- Headers: `Authorization: Bearer ${apiKey}`, `Content-Type: application/json`
- Body: `{model, messages: [{role: 'user', content: message}], temperature, max_tokens}`
- Response: `data.choices[0].message.content`

**Google Gemini**:
- Endpoint: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
- Method: POST (no Authorization header needed)
- Body: `{contents: [{parts: [{text: message}]}], generationConfig: {temperature, maxOutputTokens}}`
- Response: `data.candidates[0].content.parts[0].text`

**OpenRouter**:
- Endpoint: `https://openrouter.ai/api/v1/chat/completions` (or custom baseUrl)
- Headers: `Authorization: Bearer ${apiKey}`, `HTTP-Referer`, `X-Title`, `Content-Type: application/json`
- Body: Same as OpenAI format
- Response: Same as OpenAI format

### Error Handling
- Validates enabled state and API key presence before calls
- Catches HTTP errors (non-200 status) with detailed messages from API responses
- Network/fetch errors show generic "Connection failed" alerts
- Fallback to demo response if configuration incomplete

## Development History and Error Resolution

### Initial Setup Challenges
1. **Directory Structure**: User ran Expo from root instead of /mobile; fixed with `cd mobile`
2. **Port Conflicts**: Multiple Expo processes on port 8081; resolved with `pkill -f "expo start"`
3. **Network Issues**: Phone couldn't access localhost bundle; fixed with `--lan` mode for IP-based QR codes
4. **Starter Screen**: Default Expo template showed instead of custom UI; resolved by creating self-contained App.tsx

### Dependency Management
- **React Version Conflict**: Expo SDK 54 expects React 18.x, but installed React 19.1.0; fixed with `npm install --legacy-peer-deps`
- **Peer Dependencies**: react-native-web and react-dom version mismatches; legacy flag bypasses strict validation
- **Missing Packages**: Added `@react-native-async-storage/async-storage` for persistence, `react-native-web` for web support

### Code Evolution
1. **Phase 1 - Basic Structure**: Minimal App.tsx test to verify bundling, then added tab navigation
2. **Phase 2 - UI Interactivity**: Converted static Settings text to interactive toggles/dropdowns using useState
3. **Phase 3 - Theme System**: Added ThemeContext with dynamic colors (light/dark modes) applied via style props
4. **Phase 4 - AI Integration**: Implemented AIContext, AsyncStorage persistence, real API calls replacing demo responses
5. **Phase 5 - Error Handling**: Added try-catch blocks, user alerts, input validation, loading states

## File Structure
```
mobile/
├── App.tsx (main entry - all components, contexts, screens in single file for simplicity)
├── package.json (Expo SDK 54, React 19.1.0, navigation, webview, async-storage)
├── app.json (Expo config: name, platforms, plugins)
├── plan.md (this file - development documentation)
└── assets/ (icon.png, splash-icon.png, adaptive-icon.png, favicon.png)
```

## Key Decisions and Patterns
- **Monolithic App.tsx**: Single file to avoid import path errors during early development; can be modularized later
- **Context over Redux**: Simple global state needs (theme, AI config) don't require complex store; Context API sufficient
- **Provider-Specific Models**: Dynamic model lists based on selected provider (e.g., Gemini models for Google)
- **Mobile-First UI**: TouchableOpacity buttons instead of desktop dropdowns; larger touch targets, scrollable settings
- **Secure Storage**: API keys use secureTextEntry; could upgrade to expo-secure-store for enhanced security
- **Fallback Strategy**: Demo responses ensure Chat works without configuration; real APIs when ready
- **Type Safety**: Full TypeScript interfaces for AIConfig, theme types, navigation props throughout

## Known Limitations and Future Enhancements
- **Single-File Structure**: App.tsx is ~1000+ lines; should be split into separate screen files (BrowserScreen.tsx, etc.)
- **History Persistence**: Hub shows placeholder; needs AsyncStorage implementation for real history
- **Bookmark Management**: Static list; needs add/edit/delete functionality with persistence
- **Security**: API keys stored in AsyncStorage; recommend expo-secure-store for production
- **Offline Support**: No caching for AI responses or web pages; could add service worker-like functionality
- **Cross-Platform Testing**: Verified on web/emulator; needs physical device testing for iOS/Android specifics
- **Performance**: WebView with JavaScript enabled may have memory issues on low-end devices; needs optimization

## Testing and Deployment
- **Development Commands**:
  - Start: `cd mobile && npx expo start --clear --lan`
  - Android: `npx expo run:android`
  - iOS: `npx expo run:ios`
  - Web: `npx expo start --web`
- **Device Testing**: Scan QR code with Expo Go app; ensure LAN mode for network stability
- **API Testing**: Use Test Connection button in Settings; verify responses from all providers
- **Production Build**: `eas build` for app store submission; configure environment variables for API keys

## Summary of Work Done
- Ported BrowserOS desktop codebase to React Native Expo app for mobile.
- Created single-file App.tsx with bottom tab navigation (Browser, Chat, Hub, Settings).
- Implemented WebView browser with URL bar, navigation controls.
- Added interactive Settings: theme toggle, AI enable/disable, provider dropdown (OpenAI/Google/OpenRouter), model selection, API key input, temperature/max tokens.
- Integrated real AI API calls via fetch: OpenAI chat completions, Google Gemini generateContent, OpenRouter chat completions.
- Used Context API for Theme and AI state sharing; AsyncStorage for persistence.
- Fixed errors: Port conflicts (`pkill`), dependency conflicts (`--legacy-peer-deps`), network issues (`--lan`), starter screen by self-contained App.tsx.
- UI patterns: Switches, TouchableOpacity dropdowns, TextInput, Alerts for errors.

## Todo List
1. [completed] Implement real AI API integration for all providers
2. [completed] Create SettingsContext for shared AI configuration
3. [completed] Update ChatScreen to use real API calls
4. [completed] Add API error handling and loading states
5. [pending] Test Gemini, OpenAI, OpenRouter integrations on physical devices
6. [completed] Persist AI settings with AsyncStorage

## Next Steps
- Test real API calls on physical iOS/Android devices
- Modularize App.tsx into separate screen files (BrowserScreen.tsx, ChatScreen.tsx, etc.)
- Implement real bookmarks and history persistence in Hub tab
- Add expo-secure-store for enhanced API key security
- Optimize WebView performance for low-end devices
- Create production builds with `eas build`
- Ensure cross-platform compatibility testing (iOS, Android, web)