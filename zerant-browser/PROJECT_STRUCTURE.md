# ZERANT Project Structure

## Directory Layout

```
zerant-browser/
│
├── src/
│   ├── components/           # Reusable UI components
│   │   ├── WebViewComponent.tsx
│   │   ├── SearchBar.tsx
│   │   ├── CommandBar.tsx
│   │   ├── ModeToggle.tsx
│   │   ├── ActionPanel.tsx
│   │   └── LoadingIndicator.tsx
│   │
│   ├── screens/              # Main screen components
│   │   ├── BrowserScreen.tsx
│   │   ├── AgentScreen.tsx
│   │   └── HomeScreen.tsx
│   │
│   ├── services/             # Business logic & API calls
│   │   ├── gemini/
│   │   │   ├── GeminiClient.ts
│   │   │   ├── PromptBuilder.ts
│   │   │   └── ResponseParser.ts
│   │   ├── browser/
│   │   │   ├── BrowserService.ts
│   │   │   ├── NavigationService.ts
│   │   │   └── HistoryManager.ts
│   │   └── agent/
│   │       ├── AgentService.ts
│   │       ├── ActionExecutor.ts
│   │       └── CommandParser.ts
│   │
│   ├── hooks/                # Custom React hooks
│   │   ├── useWebView.ts
│   │   ├── useAgent.ts
│   │   ├── useBrowser.ts
│   │   └── useGemini.ts
│   │
│   ├── utils/                # Helper functions
│   │   ├── validators.ts
│   │   ├── formatters.ts
│   │   ├── constants.ts
│   │   └── logger.ts
│   │
│   ├── types/                # TypeScript definitions
│   │   ├── agent.types.ts
│   │   ├── browser.types.ts
│   │   ├── gemini.types.ts
│   │   └── common.types.ts
│   │
│   ├── config/               # Configuration files
│   │   ├── api.config.ts
│   │   ├── app.config.ts
│   │   └── webview.config.ts
│   │
│   └── assets/               # Static assets
│       ├── icons/
│       ├── images/
│       └── fonts/
│
├── App.tsx                   # Root component
├── app.json                  # Expo configuration
├── package.json              # Dependencies
├── tsconfig.json             # TypeScript config
├── babel.config.js           # Babel config
├── metro.config.js           # Metro bundler config
│
├── docs/                     # Documentation
│   ├── ARCHITECTURE.md
│   ├── API.md
│   └── CONTRIBUTING.md
│
└── README.md                 # Project overview
```

## Component Hierarchy

```
App
└── NavigationContainer
    └── Stack.Navigator
        ├── HomeScreen
        │   ├── ModeToggle
        │   └── WelcomeMessage
        │
        ├── BrowserScreen
        │   ├── SearchBar
        │   ├── WebViewComponent
        │   └── NavigationControls
        │       ├── BackButton
        │       ├── ForwardButton
        │       └── RefreshButton
        │
        └── AgentScreen
            ├── CommandBar
            ├── WebViewComponent
            ├── ActionPanel
            │   ├── ActionList
            │   └── StatusIndicator
            └── ExecutionControls
                ├── ExecuteButton
                └── StopButton
```

## File Responsibilities

### Core Components

**WebViewComponent.tsx**
- Renders native WebView
- Handles JavaScript injection
- Manages WebView events
- Bridges native ↔ JS communication

**SearchBar.tsx**
- Input field for URLs/search queries
- Validation logic
- Search suggestions
- History dropdown

**CommandBar.tsx**
- Input field for agent commands
- Command history
- Auto-complete suggestions
- Voice input (future)

**ModeToggle.tsx**
- Switch between Browser/Agent mode
- Visual mode indicator
- Mode-specific UI changes

**ActionPanel.tsx**
- Display current action
- Show action queue
- Execution progress
- Error messages

### Services

**GeminiClient.ts**
```typescript
class GeminiClient {
  - apiKey: string
  - baseUrl: string
  
  + generateActions(command: string, context: PageContext): Promise<Action[]>
  + sendPrompt(prompt: string): Promise<GeminiResponse>
  - buildHeaders(): Headers
  - handleError(error: Error): void
}
```

**AgentService.ts**
```typescript
class AgentService {
  - geminiClient: GeminiClient
  - actionExecutor: ActionExecutor
  
  + executeCommand(command: string): Promise<void>
  + getPageContext(): Promise<PageContext>
  + queueActions(actions: Action[]): void
  - validateCommand(command: string): boolean
}
```

**ActionExecutor.ts**
```typescript
class ActionExecutor {
  - webViewRef: WebView
  - actionQueue: Action[]
  
  + execute(action: Action): Promise<void>
  + executeQueue(): Promise<void>
  + click(selector: string): Promise<void>
  + type(selector: string, text: string): Promise<void>
  + scroll(direction: string, amount: number): Promise<void>
  + extract(selector: string): Promise<string>
}
```

### Hooks

**useAgent.ts**
```typescript
function useAgent() {
  return {
    executeCommand: (cmd: string) => void
    isExecuting: boolean
    currentAction: string | null
    actionQueue: Action[]
    error: Error | null
  }
}
```

**useWebView.ts**
```typescript
function useWebView() {
  return {
    webViewRef: RefObject<WebView>
    currentUrl: string
    pageTitle: string
    canGoBack: boolean
    canGoForward: boolean
    loading: boolean
    injectJavaScript: (js: string) => void
    reload: () => void
  }
}
```

## Data Models

### Action Types

```typescript
type Action = {
  id: string
  type: 'click' | 'type' | 'scroll' | 'navigate' | 'extract' | 'wait'
  selector?: string
  value?: string
  timeout?: number
  metadata?: Record<string, any>
}
```

### Page Context

```typescript
type PageContext = {
  url: string
  title: string
  html?: string
  visibleText?: string
  links: Array<{href: string, text: string}>
  inputs: Array<{type: string, name: string, id: string}>
  buttons: Array<{text: string, id: string}>
}
```

### Command History

```typescript
type CommandHistory = {
  id: string
  command: string
  timestamp: Date
  success: boolean
  actions: Action[]
  result?: string
  error?: string
}
```

## Configuration Files

### api.config.ts
```typescript
export const API_CONFIG = {
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  GEMINI_MODEL: 'gemini-2.0-flash-exp',
  GEMINI_BASE_URL: 'https://generativelanguage.googleapis.com',
  TIMEOUT: 30000,
  MAX_RETRIES: 3
}
```

### webview.config.ts
```typescript
export const WEBVIEW_CONFIG = {
  javaScriptEnabled: true,
  domStorageEnabled: true,
  allowsInlineMediaPlayback: true,
  mediaPlaybackRequiresUserAction: false,
  userAgent: 'ZERANT/1.0 Mobile'
}
```

## Naming Conventions

- **Components**: PascalCase (e.g., `WebViewComponent.tsx`)
- **Services**: PascalCase (e.g., `GeminiClient.ts`)
- **Hooks**: camelCase with 'use' prefix (e.g., `useAgent.ts`)
- **Utils**: camelCase (e.g., `validators.ts`)
- **Types**: PascalCase with '.types' suffix (e.g., `agent.types.ts`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `API_BASE_URL`)
- **Functions**: camelCase (e.g., `executeAction()`)
- **Interfaces**: PascalCase with 'I' prefix (e.g., `IAgentService`)
