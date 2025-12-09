# ZERANT Implementation Guide

## Phase 1: Core Setup

### Step 1.1: Project Initialization
```bash
npx create-expo-app zerant-browser --template blank-typescript
cd zerant-browser
npm install react-native-webview
npm install @google/generative-ai
```

### Step 1.2: Basic Structure
```
Create folders:
- src/components
- src/screens
- src/services
- src/hooks
- src/types
- src/utils
- src/config
```

## Phase 2: Browser Mode Implementation

### Sequence Diagram: Browser Navigation

```
User          SearchBar       BrowserService      WebView
 │                │                  │               │
 │──Enter URL────>│                  │               │
 │                │                  │               │
 │                │──Validate────────>│               │
 │                │                  │               │
 │                │<─Valid URL───────│               │
 │                │                  │               │
 │                │──Navigate────────┼──────────────>│
 │                │                  │               │
 │                │                  │<──Loading─────│
 │                │                  │               │
 │<──Show Loading─┤                  │               │
 │                │                  │               │
 │                │                  │<──Loaded──────│
 │                │                  │               │
 │<──Show Page────┤                  │               │
 │                │                  │               │
```

### Implementation Steps

**Step 2.1: Create WebViewComponent**
```typescript
// src/components/WebViewComponent.tsx
import { WebView } from 'react-native-webview'

export const WebViewComponent = ({ url, onNavigationStateChange }) => {
  const webViewRef = useRef<WebView>(null)
  
  return (
    <WebView
      ref={webViewRef}
      source={{ uri: url }}
      onNavigationStateChange={onNavigationStateChange}
      javaScriptEnabled={true}
    />
  )
}
```

**Step 2.2: Create SearchBar**
```typescript
// src/components/SearchBar.tsx
export const SearchBar = ({ onSubmit }) => {
  const [input, setInput] = useState('')
  
  const handleSubmit = () => {
    const url = validateUrl(input)
    onSubmit(url)
  }
  
  return (
    <TextInput
      value={input}
      onChangeText={setInput}
      onSubmitEditing={handleSubmit}
    />
  )
}
```

**Step 2.3: Create BrowserScreen**
```typescript
// src/screens/BrowserScreen.tsx
export const BrowserScreen = () => {
  const [url, setUrl] = useState('https://google.com')
  
  return (
    <View>
      <SearchBar onSubmit={setUrl} />
      <WebViewComponent url={url} />
    </View>
  )
}
```

## Phase 3: Agent Mode Implementation

### Sequence Diagram: Agent Command Execution

```
User      CommandBar    AgentService    GeminiClient    ActionExecutor    WebView
 │            │              │               │                │              │
 │──Command──>│              │               │                │              │
 │            │              │               │                │              │
 │            │──Execute────>│               │                │              │
 │            │              │               │                │              │
 │            │              │──Get Context──┼────────────────┼─────────────>│
 │            │              │               │                │              │
 │            │              │<──Context─────┼────────────────┼──────────────│
 │            │              │               │                │              │
 │            │              │──Generate─────>│                │              │
 │            │              │   Actions     │                │              │
 │            │              │               │                │              │
 │            │              │<──Actions─────│                │              │
 │            │              │               │                │              │
 │            │              │──Queue Actions┼───────────────>│              │
 │            │              │               │                │              │
 │            │              │               │                │──Execute────>│
 │            │              │               │                │   Action 1   │
 │            │              │               │                │              │
 │            │              │               │                │<──Result─────│
 │            │              │               │                │              │
 │            │              │               │                │──Execute────>│
 │            │              │               │                │   Action 2   │
 │            │              │               │                │              │
 │<──Status───┤<─────────────┤<──────────────┼────────────────┤<──Result─────│
 │  Complete  │              │               │                │              │
```

### Implementation Steps

**Step 3.1: Create GeminiClient**
```typescript
// src/services/gemini/GeminiClient.ts
export class GeminiClient {
  private apiKey: string
  
  async generateActions(command: string, context: PageContext): Promise<Action[]> {
    const prompt = this.buildPrompt(command, context)
    const response = await this.callAPI(prompt)
    return this.parseActions(response)
  }
  
  private buildPrompt(command: string, context: PageContext): string {
    return `
      Command: ${command}
      Current URL: ${context.url}
      Page Title: ${context.title}
      Available Elements: ${JSON.stringify(context.elements)}
      
      Generate a JSON array of actions to execute this command.
      Available actions: click, type, scroll, navigate, extract
    `
  }
}
```

**Step 3.2: Create ActionExecutor**
```typescript
// src/services/agent/ActionExecutor.ts
export class ActionExecutor {
  constructor(private webViewRef: RefObject<WebView>) {}
  
  async execute(action: Action): Promise<void> {
    switch (action.type) {
      case 'click':
        return this.click(action.selector)
      case 'type':
        return this.type(action.selector, action.value)
      case 'scroll':
        return this.scroll(action.direction)
      case 'navigate':
        return this.navigate(action.url)
    }
  }
  
  private click(selector: string): Promise<void> {
    const js = `
      document.querySelector('${selector}').click();
      true;
    `
    return this.injectJS(js)
  }
  
  private type(selector: string, text: string): Promise<void> {
    const js = `
      const el = document.querySelector('${selector}');
      el.value = '${text}';
      el.dispatchEvent(new Event('input', { bubbles: true }));
      true;
    `
    return this.injectJS(js)
  }
}
```

**Step 3.3: Create AgentService**
```typescript
// src/services/agent/AgentService.ts
export class AgentService {
  constructor(
    private geminiClient: GeminiClient,
    private actionExecutor: ActionExecutor
  ) {}
  
  async executeCommand(command: string): Promise<void> {
    // 1. Get page context
    const context = await this.getPageContext()
    
    // 2. Generate actions from AI
    const actions = await this.geminiClient.generateActions(command, context)
    
    // 3. Execute actions sequentially
    for (const action of actions) {
      await this.actionExecutor.execute(action)
      await this.wait(500) // Wait between actions
    }
  }
  
  private async getPageContext(): Promise<PageContext> {
    const js = `
      JSON.stringify({
        url: window.location.href,
        title: document.title,
        elements: {
          inputs: Array.from(document.querySelectorAll('input')).map(el => ({
            type: el.type,
            name: el.name,
            id: el.id
          })),
          buttons: Array.from(document.querySelectorAll('button')).map(el => ({
            text: el.textContent,
            id: el.id
          })),
          links: Array.from(document.querySelectorAll('a')).map(el => ({
            text: el.textContent,
            href: el.href
          }))
        }
      })
    `
    return this.injectJS(js)
  }
}
```

**Step 3.4: Create useAgent Hook**
```typescript
// src/hooks/useAgent.ts
export const useAgent = (webViewRef: RefObject<WebView>) => {
  const [executing, setExecuting] = useState(false)
  const [currentAction, setCurrentAction] = useState<string | null>(null)
  
  const geminiClient = useMemo(() => new GeminiClient(), [])
  const actionExecutor = useMemo(() => new ActionExecutor(webViewRef), [webViewRef])
  const agentService = useMemo(
    () => new AgentService(geminiClient, actionExecutor),
    [geminiClient, actionExecutor]
  )
  
  const executeCommand = async (command: string) => {
    setExecuting(true)
    try {
      await agentService.executeCommand(command)
    } catch (error) {
      console.error(error)
    } finally {
      setExecuting(false)
    }
  }
  
  return { executeCommand, executing, currentAction }
}
```

**Step 3.5: Create AgentScreen**
```typescript
// src/screens/AgentScreen.tsx
export const AgentScreen = () => {
  const webViewRef = useRef<WebView>(null)
  const { executeCommand, executing } = useAgent(webViewRef)
  const [command, setCommand] = useState('')
  
  return (
    <View>
      <CommandBar
        value={command}
        onChangeText={setCommand}
        onSubmit={() => executeCommand(command)}
        disabled={executing}
      />
      <WebViewComponent ref={webViewRef} />
      {executing && <LoadingIndicator />}
    </View>
  )
}
```

## Phase 4: Mode Switching

### State Diagram: Mode Management

```
                    ┌─────────────┐
                    │   Initial   │
                    └──────┬──────┘
                           │
                           ▼
                    ┌─────────────┐
          ┌─────────┤ Browser Mode├─────────┐
          │         └─────────────┘         │
          │                                 │
    Toggle Agent                      Toggle Browser
          │                                 │
          │                                 │
          ▼                                 ▼
    ┌─────────────┐                  ┌─────────────┐
    │ Agent Mode  │◄─────────────────┤ Browser Mode│
    └─────────────┘   Toggle Browser └─────────────┘
          │
          │
          ▼
    ┌─────────────┐
    │  Executing  │
    └─────────────┘
          │
          │ Complete/Error
          ▼
    ┌─────────────┐
    │ Agent Mode  │
    └─────────────┘
```

### Implementation

```typescript
// src/hooks/useMode.ts
export const useMode = () => {
  const [mode, setMode] = useState<'browser' | 'agent'>('browser')
  
  const toggleMode = () => {
    setMode(prev => prev === 'browser' ? 'agent' : 'browser')
  }
  
  return { mode, toggleMode, isBrowserMode: mode === 'browser' }
}

// App.tsx
export default function App() {
  const { mode, toggleMode } = useMode()
  
  return (
    <View>
      <ModeToggle mode={mode} onToggle={toggleMode} />
      {mode === 'browser' ? <BrowserScreen /> : <AgentScreen />}
    </View>
  )
}
```

## Phase 5: Error Handling & Polish

### Error Handling Strategy

```
┌─────────────────────────────────────────────────────────┐
│                    Error Boundaries                      │
└─────────────────────────────────────────────────────────┘

1. Network Errors
   ├─► Retry logic (exponential backoff)
   ├─► Offline detection
   └─► User notification

2. API Errors (Gemini)
   ├─► Rate limit handling
   ├─► Invalid response parsing
   └─► Fallback to manual mode

3. WebView Errors
   ├─► JavaScript injection failures
   ├─► Page load timeouts
   └─► Crash recovery

4. Action Execution Errors
   ├─► Element not found
   ├─► Timeout exceeded
   └─► Invalid selector
```

### Implementation

```typescript
// src/utils/errorHandler.ts
export class ErrorHandler {
  static handle(error: Error, context: string): void {
    console.error(`[${context}]`, error)
    
    if (error instanceof NetworkError) {
      this.handleNetworkError(error)
    } else if (error instanceof APIError) {
      this.handleAPIError(error)
    } else {
      this.handleGenericError(error)
    }
  }
  
  private static handleNetworkError(error: NetworkError): void {
    Alert.alert('Network Error', 'Please check your connection')
  }
  
  private static handleAPIError(error: APIError): void {
    Alert.alert('AI Error', 'Failed to generate actions. Try again.')
  }
}

// Usage in services
try {
  await this.executeAction(action)
} catch (error) {
  ErrorHandler.handle(error, 'ActionExecutor')
}
```

## Phase 6: Testing Strategy

### Unit Tests
```typescript
// __tests__/GeminiClient.test.ts
describe('GeminiClient', () => {
  it('should generate valid actions', async () => {
    const client = new GeminiClient()
    const actions = await client.generateActions('click first link', mockContext)
    expect(actions).toHaveLength(1)
    expect(actions[0].type).toBe('click')
  })
})
```

### Integration Tests
```typescript
// __tests__/AgentService.test.ts
describe('AgentService', () => {
  it('should execute command end-to-end', async () => {
    const service = new AgentService(mockGemini, mockExecutor)
    await service.executeCommand('search for weather')
    expect(mockExecutor.execute).toHaveBeenCalled()
  })
})
```

## Phase 7: Optimization

### Performance Checklist
- [ ] Memoize expensive computations
- [ ] Debounce user input
- [ ] Lazy load components
- [ ] Cache AI responses
- [ ] Optimize WebView rendering
- [ ] Reduce bundle size
- [ ] Profile memory usage

### Code Example
```typescript
// Memoization
const memoizedActions = useMemo(
  () => generateActions(command, context),
  [command, context]
)

// Debouncing
const debouncedSearch = useMemo(
  () => debounce(handleSearch, 300),
  []
)

// Lazy loading
const AgentScreen = lazy(() => import('./screens/AgentScreen'))
```

## Deployment Checklist

### Pre-deployment
- [ ] Remove console.logs
- [ ] Secure API keys
- [ ] Test on real devices
- [ ] Optimize assets
- [ ] Update version numbers
- [ ] Write release notes

### Build Commands
```bash
# Android
eas build --platform android --profile production

# iOS
eas build --platform ios --profile production

# Both
eas build --platform all --profile production
```

### Post-deployment
- [ ] Monitor crash reports
- [ ] Track user analytics
- [ ] Gather feedback
- [ ] Plan next iteration
