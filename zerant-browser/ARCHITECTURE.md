# ZERANT Architecture

## System Overview

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

## High-Level Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                         Presentation Layer                        │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────┐     │
│  │   UI/UX     │  │  Input Bar   │  │  Mode Switcher     │     │
│  │  Components │  │  (Search/Cmd)│  │  (Browser/Agent)   │     │
│  └─────────────┘  └──────────────┘  └────────────────────┘     │
│                                                                   │
└───────────────────────────────┬───────────────────────────────────┘
                                │
┌───────────────────────────────▼───────────────────────────────────┐
│                         Application Layer                         │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────────────┐         ┌──────────────────────┐      │
│  │   Browser Service    │         │    Agent Service     │      │
│  │  - URL Navigation    │         │  - Command Parser    │      │
│  │  - Search Handling   │         │  - Action Executor   │      │
│  │  - History Mgmt      │         │  - State Manager     │      │
│  └──────────────────────┘         └──────────────────────┘      │
│                                                                   │
└───────────────────────────────┬───────────────────────────────────┘
                                │
┌───────────────────────────────▼───────────────────────────────────┐
│                         Integration Layer                         │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────────────┐         ┌──────────────────────┐      │
│  │   WebView Manager    │         │   Gemini AI Client   │      │
│  │  - Inject Scripts    │         │  - API Integration   │      │
│  │  - DOM Manipulation  │         │  - Prompt Engine     │      │
│  │  - Event Handling    │         │  - Response Parser   │      │
│  └──────────────────────┘         └──────────────────────┘      │
│                                                                   │
└───────────────────────────────┬───────────────────────────────────┘
                                │
┌───────────────────────────────▼───────────────────────────────────┐
│                         Platform Layer                            │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   React      │  │    Expo      │  │   Native     │          │
│  │   Native     │  │   Runtime    │  │   Modules    │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

## Component Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                          App.tsx (Root)                          │
└────────────────────────────────┬────────────────────────────────┘
                                 │
                 ┌───────────────┴───────────────┐
                 │                               │
        ┌────────▼────────┐            ┌────────▼────────┐
        │  BrowserScreen  │            │  AgentScreen    │
        └────────┬────────┘            └────────┬────────┘
                 │                               │
     ┌───────────┴──────────┐        ┌──────────┴──────────┐
     │                      │        │                      │
┌────▼─────┐      ┌────────▼───┐  ┌─▼──────┐    ┌────────▼────┐
│ WebView  │      │ SearchBar  │  │ CmdBar │    │ ActionPanel │
│Component │      │            │  │        │    │             │
└──────────┘      └────────────┘  └────────┘    └─────────────┘
```

## Data Flow - Browser Mode

```
User Input (URL/Search)
        │
        ▼
┌───────────────┐
│  Input Bar    │
└───────┬───────┘
        │
        ▼
┌───────────────────┐
│ Validate Input    │
│ - URL? → Navigate │
│ - Text? → Search  │
└───────┬───────────┘
        │
        ▼
┌───────────────────┐
│  WebView Load     │
│  - Render Page    │
│  - Update State   │
└───────────────────┘
```

## Data Flow - Agent Mode

```
User Command ("Find news about AI")
        │
        ▼
┌────────────────────┐
│  Command Parser    │
│  - Extract Intent  │
│  - Get Context     │
└────────┬───────────┘
         │
         ▼
┌────────────────────┐
│  Gemini AI API     │
│  - Send Prompt     │
│  - Get Actions     │
└────────┬───────────┘
         │
         ▼
┌────────────────────┐
│  Action Executor   │
│  - Parse Response  │
│  - Execute Steps   │
└────────┬───────────┘
         │
         ▼
┌────────────────────┐
│  WebView Actions   │
│  - Click           │
│  - Scroll          │
│  - Extract Data    │
│  - Navigate        │
└────────────────────┘
```

## Agent Action Pipeline

```
┌──────────────────────────────────────────────────────────────┐
│                      Agent Execution Flow                     │
└──────────────────────────────────────────────────────────────┘

1. Command Input
   │
   ├─► "Search for weather in Bangalore"
   │
   ▼
2. Context Gathering
   │
   ├─► Current URL: https://google.com
   ├─► Page Title: Google
   ├─► DOM State: [search box visible]
   │
   ▼
3. AI Processing (Gemini 2.0)
   │
   ├─► Prompt: {command + context + available_actions}
   ├─► Response: [
   │       {action: "type", selector: "input[name='q']", value: "weather Bangalore"},
   │       {action: "click", selector: "button[type='submit']"}
   │   ]
   │
   ▼
4. Action Execution
   │
   ├─► Execute Action 1: Type in search box
   ├─► Wait for DOM update
   ├─► Execute Action 2: Click search button
   │
   ▼
5. Result Feedback
   │
   └─► Update UI with status
       └─► Ready for next command
```

## WebView Integration Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      React Native App                        │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │              JavaScript Bridge                      │    │
│  │                                                     │    │
│  │  postMessage() ◄──────────────► onMessage()       │    │
│  └────────┬──────────────────────────────┬────────────┘    │
│           │                              │                  │
│           ▼                              ▼                  │
│  ┌─────────────────┐          ┌──────────────────┐        │
│  │  Injected JS    │          │  Message Handler │        │
│  │  - DOM Access   │          │  - Parse Events  │        │
│  │  - Execute Cmds │          │  - Trigger Acts  │        │
│  └─────────────────┘          └──────────────────┘        │
│           │                                                 │
└───────────┼─────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────┐
│                      WebView (Native)                        │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                    Web Content                        │  │
│  │  - HTML/CSS/JS                                       │  │
│  │  - DOM Tree                                          │  │
│  │  - Event Listeners                                   │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## State Management

```
┌─────────────────────────────────────────────────────────────┐
│                      Application State                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────┐                                       │
│  │   Browser State  │                                       │
│  ├──────────────────┤                                       │
│  │ - currentUrl     │                                       │
│  │ - pageTitle      │                                       │
│  │ - canGoBack      │                                       │
│  │ - canGoForward   │                                       │
│  │ - loading        │                                       │
│  └──────────────────┘                                       │
│                                                              │
│  ┌──────────────────┐                                       │
│  │   Agent State    │                                       │
│  ├──────────────────┤                                       │
│  │ - mode           │ (browser | agent)                     │
│  │ - executing      │ (boolean)                             │
│  │ - currentAction  │ (string)                              │
│  │ - actionQueue    │ (Action[])                            │
│  │ - history        │ (Command[])                           │
│  └──────────────────┘                                       │
│                                                              │
│  ┌──────────────────┐                                       │
│  │   UI State       │                                       │
│  ├──────────────────┤                                       │
│  │ - inputValue     │                                       │
│  │ - showActions    │                                       │
│  │ - errorMessage   │                                       │
│  └──────────────────┘                                       │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## API Integration

```
┌─────────────────────────────────────────────────────────────┐
│                    Gemini AI Integration                     │
└─────────────────────────────────────────────────────────────┘

Request Flow:
─────────────

App → Gemini API
│
├─► Endpoint: https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp
│
├─► Headers:
│   └─► Content-Type: application/json
│   └─► x-goog-api-key: [API_KEY]
│
├─► Payload:
│   {
│     "contents": [{
│       "parts": [{
│         "text": "Command: [user_command]\nContext: [page_context]\nGenerate actions..."
│       }]
│     }],
│     "generationConfig": {
│       "temperature": 0.7,
│       "maxOutputTokens": 1024
│     }
│   }
│
└─► Response:
    {
      "candidates": [{
        "content": {
          "parts": [{
            "text": "[{action: 'click', selector: '...'}]"
          }]
        }
      }]
    }
```

## Security Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Security Layers                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. API Key Management                                       │
│     ├─► Environment Variables                               │
│     ├─► Never commit to repo                                │
│     └─► Secure storage on device                            │
│                                                              │
│  2. WebView Security                                         │
│     ├─► HTTPS enforcement                                   │
│     ├─► JavaScript injection validation                     │
│     └─► Origin checking                                     │
│                                                              │
│  3. User Input Sanitization                                  │
│     ├─► Command validation                                  │
│     ├─► XSS prevention                                      │
│     └─► SQL injection prevention                            │
│                                                              │
│  4. Action Execution Safety                                  │
│     ├─► Whitelist allowed actions                           │
│     ├─► Timeout limits                                      │
│     └─► Error boundaries                                    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Error Handling Flow

```
┌─────────────────────────────────────────────────────────────┐
│                      Error Handling                          │
└─────────────────────────────────────────────────────────────┘

Try: Execute Action
│
├─► Network Error
│   └─► Retry with exponential backoff
│       └─► Max 3 retries
│           └─► Show user error message
│
├─► API Error (Gemini)
│   └─► Parse error response
│       └─► Fallback to manual mode
│           └─► Log error for debugging
│
├─► WebView Error
│   └─► Catch JavaScript errors
│       └─► Reload page if critical
│           └─► Notify user
│
└─► Timeout Error
    └─► Cancel current action
        └─► Clear action queue
            └─► Reset to ready state
```

## Performance Optimization

```
┌─────────────────────────────────────────────────────────────┐
│                   Performance Strategy                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. Lazy Loading                                             │
│     └─► Load WebView only when needed                       │
│                                                              │
│  2. Debouncing                                               │
│     └─► Input debounce: 300ms                               │
│     └─► Action execution throttle: 500ms                    │
│                                                              │
│  3. Caching                                                  │
│     └─► Cache AI responses for similar commands             │
│     └─► Cache page context for 5 seconds                    │
│                                                              │
│  4. Memory Management                                        │
│     └─► Limit action history to 50 items                    │
│     └─► Clear WebView cache periodically                    │
│                                                              │
│  5. Async Operations                                         │
│     └─► Non-blocking AI calls                               │
│     └─► Background DOM parsing                              │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Deployment Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Build & Deployment                        │
└─────────────────────────────────────────────────────────────┘

Development
    │
    ├─► npm run android → Android Emulator/Device
    ├─► npm run ios → iOS Simulator/Device
    └─► npm run web → Web Browser (localhost:8081)

Production Build
    │
    ├─► Android
    │   └─► expo build:android
    │       └─► Generate APK/AAB
    │           └─► Google Play Store
    │
    └─► iOS
        └─► expo build:ios
            └─► Generate IPA
                └─► Apple App Store

Platform Support:
    ├─► Android: 5.0+ (API 21+)
    ├─► iOS: 12.0+
    └─► Web: Modern browsers (Chrome, Safari, Firefox)
```

## Scalability Considerations

```
Future Enhancements:
────────────────────

1. Multi-Tab Support
   ┌─────────┐  ┌─────────┐  ┌─────────┐
   │  Tab 1  │  │  Tab 2  │  │  Tab 3  │
   └─────────┘  └─────────┘  └─────────┘

2. Plugin System
   ┌──────────────────────────────────┐
   │  Core Engine                     │
   ├──────────────────────────────────┤
   │  Plugin API                      │
   │  ├─► Screenshot Plugin           │
   │  ├─► Translation Plugin          │
   │  └─► Custom Action Plugin        │
   └──────────────────────────────────┘

3. Cloud Sync
   Device 1 ◄──────► Cloud ◄──────► Device 2
   (History, Bookmarks, Settings)

4. Advanced AI Features
   ├─► Multi-step workflows
   ├─► Learning from user behavior
   └─► Predictive actions
```
