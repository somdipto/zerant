# ZERANT API Reference

## Core Services API

### GeminiClient

```typescript
class GeminiClient {
  constructor(apiKey: string)
  
  /**
   * Generate actions from natural language command
   * @param command - User's natural language command
   * @param context - Current page context
   * @returns Promise<Action[]> - Array of executable actions
   */
  generateActions(command: string, context: PageContext): Promise<Action[]>
  
  /**
   * Send raw prompt to Gemini API
   * @param prompt - Formatted prompt string
   * @returns Promise<GeminiResponse> - Raw API response
   */
  sendPrompt(prompt: string): Promise<GeminiResponse>
}
```

**Example Usage:**
```typescript
const client = new GeminiClient(API_KEY)
const actions = await client.generateActions(
  'Search for weather in Bangalore',
  { url: 'https://google.com', title: 'Google', elements: {...} }
)
// Returns: [
//   { type: 'type', selector: 'input[name="q"]', value: 'weather Bangalore' },
//   { type: 'click', selector: 'button[type="submit"]' }
// ]
```

---

### ActionExecutor

```typescript
class ActionExecutor {
  constructor(webViewRef: RefObject<WebView>)
  
  /**
   * Execute a single action
   * @param action - Action object to execute
   * @returns Promise<void>
   */
  execute(action: Action): Promise<void>
  
  /**
   * Execute multiple actions sequentially
   * @param actions - Array of actions
   * @returns Promise<void>
   */
  executeQueue(actions: Action[]): Promise<void>
  
  /**
   * Click an element
   * @param selector - CSS selector
   * @returns Promise<void>
   */
  click(selector: string): Promise<void>
  
  /**
   * Type text into an input
   * @param selector - CSS selector
   * @param text - Text to type
   * @returns Promise<void>
   */
  type(selector: string, text: string): Promise<void>
  
  /**
   * Scroll the page
   * @param direction - 'up' | 'down' | 'left' | 'right'
   * @param amount - Pixels to scroll (default: 300)
   * @returns Promise<void>
   */
  scroll(direction: ScrollDirection, amount?: number): Promise<void>
  
  /**
   * Navigate to URL
   * @param url - Target URL
   * @returns Promise<void>
   */
  navigate(url: string): Promise<void>
  
  /**
   * Extract data from page
   * @param selector - CSS selector
   * @returns Promise<string> - Extracted text content
   */
  extract(selector: string): Promise<string>
  
  /**
   * Wait for specified duration
   * @param ms - Milliseconds to wait
   * @returns Promise<void>
   */
  wait(ms: number): Promise<void>
}
```

**Example Usage:**
```typescript
const executor = new ActionExecutor(webViewRef)

// Click element
await executor.click('button.search-btn')

// Type text
await executor.type('input[name="q"]', 'hello world')

// Scroll down
await executor.scroll('down', 500)

// Extract data
const title = await executor.extract('h1.title')
```

---

### AgentService

```typescript
class AgentService {
  constructor(geminiClient: GeminiClient, actionExecutor: ActionExecutor)
  
  /**
   * Execute natural language command
   * @param command - User's command
   * @returns Promise<ExecutionResult>
   */
  executeCommand(command: string): Promise<ExecutionResult>
  
  /**
   * Get current page context
   * @returns Promise<PageContext>
   */
  getPageContext(): Promise<PageContext>
  
  /**
   * Queue actions for execution
   * @param actions - Array of actions
   */
  queueActions(actions: Action[]): void
  
  /**
   * Clear action queue
   */
  clearQueue(): void
  
  /**
   * Stop current execution
   */
  stop(): void
}
```

**Example Usage:**
```typescript
const service = new AgentService(geminiClient, actionExecutor)

// Execute command
const result = await service.executeCommand('Find news about AI')
console.log(result.success) // true
console.log(result.actionsExecuted) // 3

// Get page context
const context = await service.getPageContext()
console.log(context.url) // 'https://google.com'
```

---

## Custom Hooks API

### useAgent

```typescript
function useAgent(webViewRef: RefObject<WebView>): UseAgentReturn

interface UseAgentReturn {
  executeCommand: (command: string) => Promise<void>
  isExecuting: boolean
  currentAction: string | null
  actionQueue: Action[]
  error: Error | null
  clearError: () => void
}
```

**Example Usage:**
```typescript
const MyComponent = () => {
  const webViewRef = useRef<WebView>(null)
  const { executeCommand, isExecuting, error } = useAgent(webViewRef)
  
  const handleCommand = async () => {
    await executeCommand('Click the first link')
  }
  
  return (
    <View>
      <Button onPress={handleCommand} disabled={isExecuting} />
      {error && <Text>{error.message}</Text>}
    </View>
  )
}
```

---

### useWebView

```typescript
function useWebView(): UseWebViewReturn

interface UseWebViewReturn {
  webViewRef: RefObject<WebView>
  currentUrl: string
  pageTitle: string
  canGoBack: boolean
  canGoForward: boolean
  loading: boolean
  goBack: () => void
  goForward: () => void
  reload: () => void
  injectJavaScript: (js: string) => void
  stopLoading: () => void
}
```

**Example Usage:**
```typescript
const MyComponent = () => {
  const {
    webViewRef,
    currentUrl,
    loading,
    goBack,
    reload
  } = useWebView()
  
  return (
    <View>
      <Text>{currentUrl}</Text>
      <Button onPress={goBack} title="Back" />
      <Button onPress={reload} title="Reload" />
      <WebView ref={webViewRef} />
      {loading && <ActivityIndicator />}
    </View>
  )
}
```

---

### useBrowser

```typescript
function useBrowser(): UseBrowserReturn

interface UseBrowserReturn {
  navigate: (url: string) => void
  search: (query: string) => void
  history: string[]
  bookmarks: Bookmark[]
  addBookmark: (url: string, title: string) => void
  removeBookmark: (id: string) => void
}
```

**Example Usage:**
```typescript
const MyComponent = () => {
  const { navigate, search, history, addBookmark } = useBrowser()
  
  const handleSearch = (query: string) => {
    if (isUrl(query)) {
      navigate(query)
    } else {
      search(query)
    }
  }
  
  return (
    <SearchBar onSubmit={handleSearch} />
  )
}
```

---

### useMode

```typescript
function useMode(): UseModeReturn

interface UseModeReturn {
  mode: 'browser' | 'agent'
  toggleMode: () => void
  setMode: (mode: 'browser' | 'agent') => void
  isBrowserMode: boolean
  isAgentMode: boolean
}
```

**Example Usage:**
```typescript
const MyComponent = () => {
  const { mode, toggleMode, isBrowserMode } = useMode()
  
  return (
    <View>
      <Switch value={isAgentMode} onValueChange={toggleMode} />
      {isBrowserMode ? <BrowserScreen /> : <AgentScreen />}
    </View>
  )
}
```

---

## Type Definitions

### Action

```typescript
type ActionType = 'click' | 'type' | 'scroll' | 'navigate' | 'extract' | 'wait'

interface Action {
  id: string
  type: ActionType
  selector?: string
  value?: string
  url?: string
  direction?: ScrollDirection
  amount?: number
  timeout?: number
  metadata?: Record<string, any>
}

type ScrollDirection = 'up' | 'down' | 'left' | 'right'
```

---

### PageContext

```typescript
interface PageContext {
  url: string
  title: string
  html?: string
  visibleText?: string
  elements: PageElements
}

interface PageElements {
  inputs: InputElement[]
  buttons: ButtonElement[]
  links: LinkElement[]
  headings: HeadingElement[]
}

interface InputElement {
  type: string
  name: string
  id: string
  placeholder?: string
  value?: string
}

interface ButtonElement {
  text: string
  id: string
  className: string
}

interface LinkElement {
  text: string
  href: string
  id: string
}

interface HeadingElement {
  level: number
  text: string
}
```

---

### ExecutionResult

```typescript
interface ExecutionResult {
  success: boolean
  actionsExecuted: number
  totalActions: number
  duration: number
  error?: Error
  results?: any[]
}
```

---

### GeminiResponse

```typescript
interface GeminiResponse {
  candidates: Candidate[]
  promptFeedback?: PromptFeedback
}

interface Candidate {
  content: Content
  finishReason: string
  index: number
  safetyRatings: SafetyRating[]
}

interface Content {
  parts: Part[]
  role: string
}

interface Part {
  text: string
}
```

---

## Utility Functions API

### Validators

```typescript
/**
 * Check if string is valid URL
 * @param str - String to validate
 * @returns boolean
 */
function isUrl(str: string): boolean

/**
 * Check if string is valid command
 * @param str - String to validate
 * @returns boolean
 */
function isValidCommand(str: string): boolean

/**
 * Validate CSS selector
 * @param selector - CSS selector string
 * @returns boolean
 */
function isValidSelector(selector: string): boolean
```

---

### Formatters

```typescript
/**
 * Format URL with protocol
 * @param url - URL string
 * @returns Formatted URL
 */
function formatUrl(url: string): string

/**
 * Format search query for search engine
 * @param query - Search query
 * @returns Search URL
 */
function formatSearchQuery(query: string): string

/**
 * Format timestamp
 * @param date - Date object
 * @returns Formatted string
 */
function formatTimestamp(date: Date): string
```

---

### Logger

```typescript
class Logger {
  /**
   * Log info message
   * @param message - Message to log
   * @param data - Optional data
   */
  static info(message: string, data?: any): void
  
  /**
   * Log error message
   * @param message - Error message
   * @param error - Error object
   */
  static error(message: string, error?: Error): void
  
  /**
   * Log warning message
   * @param message - Warning message
   */
  static warn(message: string): void
  
  /**
   * Log debug message (only in dev)
   * @param message - Debug message
   * @param data - Optional data
   */
  static debug(message: string, data?: any): void
}
```

---

## WebView JavaScript Injection API

### Injected Functions

These functions are available in the WebView context:

```javascript
// Click element by selector
window.zerant.click(selector: string): boolean

// Type text into element
window.zerant.type(selector: string, text: string): boolean

// Get element text
window.zerant.getText(selector: string): string

// Get all links
window.zerant.getLinks(): Array<{href: string, text: string}>

// Get page context
window.zerant.getContext(): PageContext

// Scroll page
window.zerant.scroll(direction: string, amount: number): void

// Send message to React Native
window.zerant.sendMessage(type: string, data: any): void
```

**Example Usage in WebView:**
```javascript
// In injected JavaScript
const success = window.zerant.click('button.submit')
if (success) {
  window.zerant.sendMessage('action_complete', { action: 'click' })
}
```

---

## Configuration API

### API Config

```typescript
interface APIConfig {
  GEMINI_API_KEY: string
  GEMINI_MODEL: string
  GEMINI_BASE_URL: string
  TIMEOUT: number
  MAX_RETRIES: number
}

// Usage
import { API_CONFIG } from './config/api.config'
console.log(API_CONFIG.GEMINI_MODEL) // 'gemini-2.0-flash-exp'
```

---

### WebView Config

```typescript
interface WebViewConfig {
  javaScriptEnabled: boolean
  domStorageEnabled: boolean
  allowsInlineMediaPlayback: boolean
  mediaPlaybackRequiresUserAction: boolean
  userAgent: string
  cacheEnabled: boolean
  incognito: boolean
}

// Usage
import { WEBVIEW_CONFIG } from './config/webview.config'
```

---

## Event System

### Event Types

```typescript
type EventType =
  | 'navigation_start'
  | 'navigation_complete'
  | 'action_start'
  | 'action_complete'
  | 'action_error'
  | 'mode_change'
  | 'page_load'
  | 'page_error'

interface Event {
  type: EventType
  timestamp: Date
  data?: any
}
```

### Event Emitter

```typescript
class EventEmitter {
  on(event: EventType, callback: (data: any) => void): void
  off(event: EventType, callback: (data: any) => void): void
  emit(event: EventType, data?: any): void
}

// Usage
const emitter = new EventEmitter()
emitter.on('action_complete', (data) => {
  console.log('Action completed:', data)
})
```

---

## Error Types

```typescript
class NetworkError extends Error {
  constructor(message: string, public statusCode?: number)
}

class APIError extends Error {
  constructor(message: string, public code: string)
}

class ValidationError extends Error {
  constructor(message: string, public field: string)
}

class ExecutionError extends Error {
  constructor(message: string, public action: Action)
}

class TimeoutError extends Error {
  constructor(message: string, public duration: number)
}
```
