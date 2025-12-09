<div align="center">

# 🚀 ZERANT

### AI-Powered Autonomous Mobile Browser Agent

*Built in 5 hours. Redefining mobile web interaction.*

[![React Native](https://img.shields.io/badge/React_Native-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://reactnative.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Expo](https://img.shields.io/badge/Expo-000020?style=for-the-badge&logo=expo&logoColor=white)](https://expo.dev/)
[![Gemini AI](https://img.shields.io/badge/Gemini_2.0-4285F4?style=for-the-badge&logo=google&logoColor=white)](https://deepmind.google/technologies/gemini/)

</div>

---

## 🌟 What is ZERANT?

ZERANT is an **AI-powered mobile browser** that understands natural language commands and executes them autonomously. No more tapping through menus—just tell it what you want, and watch it happen.

```
You: "Search for weather in Bangalore"
ZERANT: *Types in search box* → *Clicks search* → *Shows results*
```

---

## ✨ Features

<table>
<tr>
<td width="50%">

### 🌐 Browser Mode
Traditional web browsing experience
- URL navigation
- Search functionality
- History management
- Bookmark support

</td>
<td width="50%">

### 🤖 Agent Mode
AI-powered autonomous execution
- Natural language commands
- Multi-step action chains
- Context-aware decisions
- Real-time feedback

</td>
</tr>
</table>

### 🎯 Core Capabilities

| Feature | Description |
|---------|-------------|
| ⚡ **Gemini 2.0 Flash** | Lightning-fast AI action generation |
| 📱 **Cross-Platform** | iOS, Android & Web support |
| 🎨 **Intuitive UI** | Seamless mode switching |
| 🔒 **Secure** | Safe JavaScript injection & validation |
| 🚄 **Fast** | Optimized performance with caching |

---

## 🏗️ Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     ZERANT Mobile Browser                    │
│                                                              │
│  ┌────────────────┐              ┌────────────────┐        │
│  │  Browser Mode  │◄────────────►│   Agent Mode   │        │
│  │   (Manual)     │   Toggle     │  (Autonomous)  │        │
│  └────────────────┘              └────────────────┘        │
│           │                               │                 │
│           └───────────┬───────────────────┘                 │
│                       ▼                                     │
│              ┌─────────────────┐                           │
│              │  WebView Core   │                           │
│              └─────────────────┘                           │
└─────────────────────────────────────────────────────────────┘
```

### 4-Layer Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                      📱 PRESENTATION LAYER                        │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────┐     │
│  │   UI/UX     │  │  Input Bar   │  │  Mode Switcher     │     │
│  │  Components │  │  (Search/Cmd)│  │  (Browser/Agent)   │     │
│  └─────────────┘  └──────────────┘  └────────────────────┘     │
└──────────────────────────────────────────────────────────────────┘
                                ↕
┌──────────────────────────────────────────────────────────────────┐
│                      🧠 APPLICATION LAYER                         │
│  ┌──────────────────────┐         ┌──────────────────────┐      │
│  │   Browser Service    │         │    Agent Service     │      │
│  │  • URL Navigation    │         │  • Command Parser    │      │
│  │  • Search Handling   │         │  • Action Executor   │      │
│  │  • History Mgmt      │         │  • State Manager     │      │
│  └──────────────────────┘         └──────────────────────┘      │
└──────────────────────────────────────────────────────────────────┘
                                ↕
┌──────────────────────────────────────────────────────────────────┐
│                      🔌 INTEGRATION LAYER                         │
│  ┌──────────────────────┐         ┌──────────────────────┐      │
│  │   WebView Manager    │         │   Gemini AI Client   │      │
│  │  • Inject Scripts    │         │  • API Integration   │      │
│  │  • DOM Manipulation  │         │  • Prompt Engine     │      │
│  │  • Event Handling    │         │  • Response Parser   │      │
│  └──────────────────────┘         └──────────────────────┘      │
└──────────────────────────────────────────────────────────────────┘
                                ↕
┌──────────────────────────────────────────────────────────────────┐
│                      ⚙️ PLATFORM LAYER                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   React      │  │    Expo      │  │   Native     │          │
│  │   Native     │  │   Runtime    │  │   Modules    │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└──────────────────────────────────────────────────────────────────┘
```

### Agent Execution Flow

```
┌──────────────────────────────────────────────────────────────┐
│                   🤖 Agent Action Pipeline                    │
└──────────────────────────────────────────────────────────────┘

1️⃣ Command Input
   │  "Search for weather in Bangalore"
   ▼
2️⃣ Context Gathering
   │  • Current URL: https://google.com
   │  • Page Title: Google
   │  • DOM State: [search box visible]
   ▼
3️⃣ AI Processing (Gemini 2.0)
   │  Prompt → {command + context + available_actions}
   │  Response → [
   │      {action: "type", selector: "input[name='q']", value: "weather Bangalore"},
   │      {action: "click", selector: "button[type='submit']"}
   │  ]
   ▼
4️⃣ Action Execution
   │  ✓ Execute Action 1: Type in search box
   │  ✓ Wait for DOM update
   │  ✓ Execute Action 2: Click search button
   ▼
5️⃣ Result Feedback
   └  ✅ Update UI → Ready for next command
```

### Data Flow Comparison

<table>
<tr>
<td width="50%">

#### 🌐 Browser Mode Flow

```
User Input (URL/Search)
        ↓
┌───────────────┐
│  Input Bar    │
└───────┬───────┘
        ↓
┌───────────────────┐
│ Validate Input    │
│ • URL? → Navigate │
│ • Text? → Search  │
└───────┬───────────┘
        ↓
┌───────────────────┐
│  WebView Load     │
│  • Render Page    │
│  • Update State   │
└───────────────────┘
```

</td>
<td width="50%">

#### 🤖 Agent Mode Flow

```
User Command
        ↓
┌────────────────────┐
│  Command Parser    │
└────────┬───────────┘
         ↓
┌────────────────────┐
│  Gemini AI API     │
└────────┬───────────┘
         ↓
┌────────────────────┐
│  Action Executor   │
└────────┬───────────┘
         ↓
┌────────────────────┐
│  WebView Actions   │
│  • Click           │
│  • Scroll          │
│  • Extract Data    │
└────────────────────┘
```

</td>
</tr>
</table>

---

## 🚀 Quick Start

### Prerequisites

- Node.js 16+
- npm or yarn
- Expo CLI
- Android Studio / Xcode (for mobile)

### Installation

```bash
# Clone the repository
git clone https://github.com/somdipto/zerant.git
cd zerant

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Add your GEMINI_API_KEY to .env
```

### Run the App

```bash
# 🤖 Android
npm run android

# 🍎 iOS (macOS only)
npm run ios

# 🌐 Web
npm run web
```

---

## 📖 Usage Guide

### Browser Mode 🌐

1. **Search or Navigate**
   ```
   Type: "github.com" or "weather today"
   Press: 🔍 Search
   ```

2. **Browse Normally**
   - Tap links
   - Scroll pages
   - Use back/forward buttons

### Agent Mode 🤖

1. **Toggle to Agent Mode**
   - Switch from 🌐 to 🤖

2. **Give Commands**
   ```
   "Search for weather in Bangalore"
   "Click the first link"
   "Extract all links on this page"
   "Scroll down"
   "Find news about AI"
   ```

3. **Watch Magic Happen**
   - AI generates actions
   - Actions execute automatically
   - Real-time status updates

---

## 🎯 Demo Commands

Try these commands in Agent Mode:

| Command | What It Does |
|---------|--------------|
| `"Search for weather in Bangalore"` | Types query & clicks search |
| `"Click the first search result"` | Finds & clicks first link |
| `"Extract all links on this page"` | Scrapes all URLs |
| `"Scroll down"` | Scrolls page down |
| `"Go to github.com"` | Navigates to URL |
| `"Find the login button and click it"` | Locates & clicks button |
| `"Read the main heading"` | Extracts h1 text |

---

## 🛠️ Tech Stack

<div align="center">

| Category | Technology |
|----------|-----------|
| **Framework** | React Native + Expo |
| **Language** | TypeScript |
| **AI Engine** | Google Gemini 2.0 Flash |
| **WebView** | react-native-webview |
| **State Management** | React Hooks |
| **Navigation** | React Navigation |
| **Styling** | React Native StyleSheet |

</div>

---

## 📁 Project Structure

```
zerant/
├── src/
│   ├── components/          # Reusable UI components
│   │   ├── WebViewComponent.tsx
│   │   ├── SearchBar.tsx
│   │   ├── CommandBar.tsx
│   │   ├── ModeToggle.tsx
│   │   └── ActionPanel.tsx
│   │
│   ├── screens/             # Main screens
│   │   ├── BrowserScreen.tsx
│   │   └── AgentScreen.tsx
│   │
│   ├── services/            # Business logic
│   │   ├── gemini/
│   │   │   ├── GeminiClient.ts
│   │   │   ├── PromptBuilder.ts
│   │   │   └── ResponseParser.ts
│   │   ├── browser/
│   │   │   └── BrowserService.ts
│   │   └── agent/
│   │       ├── AgentService.ts
│   │       └── ActionExecutor.ts
│   │
│   ├── hooks/               # Custom React hooks
│   │   ├── useWebView.ts
│   │   ├── useAgent.ts
│   │   └── useBrowser.ts
│   │
│   ├── types/               # TypeScript definitions
│   │   ├── agent.types.ts
│   │   └── browser.types.ts
│   │
│   └── utils/               # Helper functions
│       ├── validators.ts
│       └── formatters.ts
│
├── App.tsx                  # Root component
├── app.json                 # Expo config
└── package.json             # Dependencies
```

---

## 🔧 Configuration

### Environment Variables

Create a `.env` file:

```env
GEMINI_API_KEY=your_api_key_here
GEMINI_MODEL=gemini-2.0-flash-exp
API_TIMEOUT=30000
```

### API Configuration

```typescript
// src/config/api.config.ts
export const API_CONFIG = {
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  GEMINI_MODEL: 'gemini-2.0-flash-exp',
  GEMINI_BASE_URL: 'https://generativelanguage.googleapis.com',
  TIMEOUT: 30000,
  MAX_RETRIES: 3
}
```

---

## 🎨 Key Components

### GeminiClient

```typescript
class GeminiClient {
  async generateActions(command: string, context: PageContext): Promise<Action[]>
  // Converts natural language → executable actions
}
```

### ActionExecutor

```typescript
class ActionExecutor {
  async click(selector: string): Promise<void>
  async type(selector: string, text: string): Promise<void>
  async scroll(direction: string): Promise<void>
  async extract(selector: string): Promise<string>
}
```

### AgentService

```typescript
class AgentService {
  async executeCommand(command: string): Promise<ExecutionResult>
  // Orchestrates: Context → AI → Actions → Execution
}
```

---

## 🔒 Security

- ✅ API key stored in environment variables
- ✅ Input validation & sanitization
- ✅ Safe JavaScript injection
- ✅ HTTPS enforcement
- ✅ XSS prevention
- ✅ Action whitelisting

---

## ⚡ Performance

- **Memoization**: Expensive computations cached
- **Debouncing**: Input throttled (300ms)
- **Lazy Loading**: Components loaded on demand
- **Response Caching**: AI responses cached for similar commands
- **Optimized Rendering**: React.memo & useMemo throughout

---

## 🧪 Testing

```bash
# Run unit tests
npm test

# Run integration tests
npm run test:integration

# Run e2e tests
npm run test:e2e
```

---

## 📦 Build & Deploy

### Android

```bash
# Development build
eas build --platform android --profile development

# Production build
eas build --platform android --profile production
```

### iOS

```bash
# Development build
eas build --platform ios --profile development

# Production build
eas build --platform ios --profile production
```

### Web

```bash
# Build for web
npm run build:web

# Deploy to hosting
npm run deploy
```

---

## 🗺️ Roadmap

- [ ] 🌍 Multi-language support
- [ ] 🎙️ Voice commands
- [ ] 📑 Multi-tab browsing
- [ ] 🔖 Advanced bookmarks
- [ ] 🔄 Cloud sync
- [ ] 🎨 Custom themes
- [ ] 🔌 Plugin system
- [ ] 📊 Analytics dashboard
- [ ] 🤝 Collaborative browsing
- [ ] 🧠 Learning from user behavior

---

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- **Google Gemini 2.0** for powerful AI capabilities
- **React Native** for cross-platform framework
- **Expo** for seamless development experience
- **Open Source Community** for inspiration

---

## 📞 Contact

**Somdipto** - [@somdipto](https://github.com/somdipto)

Project Link: [https://github.com/somdipto/zerant](https://github.com/somdipto/zerant)

---

<div align="center">

### ⭐ Star this repo if you find it useful!

**Built with ❤️ in 5 hours**

</div>