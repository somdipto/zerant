# Phase 1 — /snapshot: Accessibility Tree with @refs

> **Goal:** A `/snapshot` endpoint bouwen that the accessibility tree or the huidige page teruggeeft,
> with stabiele element-refs (@e1, @e2, ...) that andere endpoints can use.
> **Sessions:** 1.1 (basis) + 1.2 (filters + @ref interactie)
> **Priority:** HIGH — this is the grootste missing feature vs agent-browser

---

## Context — Read this eerst

### Wat is a accessibility tree?

A gestructureerde boom or alle UI-elementen op a page, zoals a browser that the sees.
Browsers bouwen this for screenreaders. LLMs can this read without CSS selectors te kennen.

Voorbeeld output (same stijl if agent-browser):

```
- document [document]
  - banner [banner]
    - heading "Zerant Browser" [@e1] level=1
  - navigation [navigation]
    - link "Home" [@e2] (focused)
    - link "About" [@e3]
  - main [main]
    - button "Sign In" [@e4]
    - textbox "Email" [@e5] value=""
    - textbox "Password" [@e6] value=""
```

### Why CDP and not a injected script?

- `document.querySelectorAll()` in the webview zou detecteerbaar are
- CDP `Accessibility.getFullAXTree()` works vanuit the main process — onzichtbaar for the page
- Zie AGENTS.md — "Alles wat Kees doet must onzichtbaar are vanuit the webpagina's JavaScript context"

---

## Existing code to read (required)

Read this files (usage Read tool, NIET cat):

1. **`AGENTS.md`** — Anti-detect rules (KRITISCH)
2. **`src/devtools/manager.ts`** — CDP attach/detach pattern + `sendCommand()` methode (regel ~733)
   - Let op: network capture zit OOK inline in this file (no apart network-capture.ts!)
3. **`src/devtools/types.ts`** — Existing CDP types (DOMNodeInfo, StorageData, etc.)
4. **`src/api/server.ts`** — ~2385 rules, ~170 endpoints
   - Focus op the DevTools section (regel ~2162): zoek to `// DEVTOOLS — CDP Bridge`
   - Kijk to the response-pattern: `try/catch` + `res.json({ ok: true, ... })`
   - Kijk to ZerantAPIOptions interface (regel ~64) — hier must SnapshotManager bij
5. **`src/tabs/manager.ts`** — `getActiveWebContents()` methode + Tab interface
6. **`src/main.ts`** — `startAPI()` function (regel ~250) + `will-quit` handler (regel ~852)

---

## Architectuur

```
GET /snapshot
      │
      ▼
SnapshotManager.getSnapshot(options)
      │
      ├─ this.devtools.sendCommand('Accessibility.enable', {})
      ├─ this.devtools.sendCommand('Accessibility.getFullAXTree', {})
      ├─ filterNodes(tree, options)     ← interactive/compact/selector/depth
      ├─ assignRefs(nodes)              ← @e1, @e2, ... save in RefMap
      └─ formatTree(nodes)              ← text output
```

**CDP Aanroep — ALTIJD via devToolsManager:**

```typescript
// ✅ GOED — via the existing DevToolsManager.sendCommand()
const result = await this.devtools.sendCommand('Accessibility.getFullAXTree', {});

// ❌ FOUT — nooit zelf debugger.attach() or sendCommand op wc aanroepen
const wc = tabManager.getActiveWebContents();
wc.debugger.sendCommand(...)  // NOOIT! DevToolsManager beheert the CDP verbinding
```

### Ref-folder lifecycle

- Refs be opgeslagen in memory (Folder<string, nodeId>)
- Reset bij elke navigatie: luister op `did-navigate` event
- Stabiel within a page: same element → always same @ref
- **Navigatie-event registreren:** via `tabManager.getActiveWebContents()` + `wc.on('did-navigate', ...)`
  Or via the existing DevToolsManager event subscriber pattern (zie `subscribe()` methode)

---

## New files

### `src/snapshot/types.ts`

```typescript
export interface AccessibilityNode {
  nodeId: string;
  role: string;
  name?: string;
  ref?: string;           // "@e1", "@e2", etc.
  value?: string;
  description?: string;
  focused?: boolean;
  level?: number;         // for headings
  children: AccessibilityNode[];
}

export interface RefMap {
  // "@e1" → CDP nodeId
  [ref: string]: string;
}

export interface SnapshotOptions {
  interactive?: boolean;  // only buttons/inputs/links/etc.
  compact?: boolean;      // lege structurele nodes weggooien
  selector?: string;      // scope tot CSS selector
  depth?: number;         // max diepte
}

export interface SnapshotResult {
  text: string;           // geformatteerde tree text
  count: number;          // aantal nodes
  url: string;            // huidige page URL
}
```

### `src/snapshot/manager.ts`

```typescript
import { DevToolsManager } from '../devtools/manager';
import { AccessibilityNode, RefMap, SnapshotOptions, SnapshotResult } from './types';

export class SnapshotManager {
  private refMap: RefMap = {};
  private refCounter = 0;

  constructor(private devtools: DevToolsManager) {}

  async getSnapshot(options: SnapshotOptions): Promise<SnapshotResult>
  async clickRef(ref: string): Promise<void>
  async fillRef(ref: string, value: string): Promise<void>
  async getTextRef(ref: string): Promise<string>

  private assignRefs(nodes: AccessibilityNode[]): void
  private filterNodes(nodes: AccessibilityNode[], options: SnapshotOptions): AccessibilityNode[]
  private formatTree(nodes: AccessibilityNode[], indent?: number): string

  destroy(): void {
    // Cleanup — is aangeroepen vanuit will-quit handler
  }
}
```

---

## Manager Wiring (verplicht bij session 1.1)

Na the bouwen or SnapshotManager, must you hem op 3 plekken aansluiten:

### 1. `src/api/server.ts` — ZerantAPIOptions interface (regel ~64)

Voeg toe about the interface:

```typescript
export interface ZerantAPIOptions {
  // ... existing velden ...
  snapshotManager: SnapshotManager;
}
```

And in the ZerantAPI class a private field + toewijzing in constructor:

```typescript
private snapshotManager: SnapshotManager;
// in constructor:
this.snapshotManager = opts.snapshotManager;
```

### 2. `src/main.ts` — startAPI() (regel ~250)

```typescript
// NA devToolsManager aanmaken, VOOR new ZerantAPI():
const snapshotManager = new SnapshotManager(devToolsManager!);

// In new ZerantAPI({...}):
snapshotManager: snapshotManager!,
```

### 3. `src/main.ts` — will-quit handler (regel ~852)

```typescript
if (snapshotManager) snapshotManager.destroy();
```

---

## API Endpoints

Voeg this toe in `server.ts` setupRoutes(), NA the DevTools section (zoek `// DEVTOOLS — CDP Bridge`), VOOR the Wingman Stream section (zoek `// WINGMAN STREAM`):

```typescript
// ═══════════════════════════════════════════════
// SNAPSHOT — Accessibility Tree with @refs
// ═══════════════════════════════════════════════
```

### `GET /snapshot`

```json
// Response
{
  "ok": true,
  "snapshot": "- document [document]\n  - button \"Sign In\" [@e4]\n  ...",
  "count": 42,
  "url": "https://example.com"
}
```

### `GET /snapshot?interactive=true`

Retourneert only: `button`, `link`, `textbox`, `checkbox`, `radio`, `combobox`, `menuitem`, `tab`, `searchbox`

### `GET /snapshot?compact=true`

Verwijdert nodes with: no name, no ref, no relevante kinderen

### `GET /snapshot?selector=%23main`

Scope tot element gevonden via `DOM.querySelector` → only subtree or that element

### `GET /snapshot?depth=3`

Retourneert max 3 niveaus diep

### `POST /snapshot/click`

```json
// Request
{"ref": "@e4"}

// Response
{"ok": true, "ref": "@e4", "nodeId": "123"}
```

Implementatie: ref → nodeId out refMap → `DOM.resolveNode` → boundingBox → `webContents.sendInputEvent`

Kijk hoe the existing `/click` endpoint in server.ts the doet (zoek `// CLICK — via sendInputEvent`).
Hetzelfde pattern: `DOM.getBoxModel` → x,y berekenen → `wc.sendInputEvent({type:'mouseDown',...})`.

### `POST /snapshot/fill`

```json
// Request
{"ref": "@e5", "value": "test@example.com"}

// Response
{"ok": true, "ref": "@e5"}
```

Kijk hoe the existing `/type` endpoint the doet (zoek `// TYPE — via sendInputEvent`).
Hetzelfde pattern: per karakter `wc.sendInputEvent({type:'char', keyCode: char})`.

### `GET /snapshot/text?ref=@e1`

```json
{"ok": true, "ref": "@e1", "text": "Zerant Browser"}
```

---

## Sessie 1.1 — Implementatie stappen

1. Maak `src/snapshot/types.ts` — only the interfaces, no logica
2. Maak `src/snapshot/manager.ts` — SnapshotManager class skelet
3. Implementeer `getSnapshot()` — CDP calls via `this.devtools.sendCommand()`
4. Implementeer `assignRefs()` — simpele teller, @e1 @e2 etc.
5. Implementeer `formatTree()` — recursief, inspringing per niveau
6. **Manager Wiring:** voeg SnapshotManager toe about ZerantAPIOptions, main.ts startAPI(), will-quit
7. Voeg section + `GET /snapshot` endpoint toe about `src/api/server.ts`
8. `npx tsc` — fix errors
9. Test: `curl -H "Authorization: Bearer $(cat ~/.tandem/api-token)" http://localhost:8765/snapshot`
10. Implementeer `?interactive=true` filter
11. Test: `curl -H "Authorization: Bearer $(cat ~/.tandem/api-token)" "http://localhost:8765/snapshot?interactive=true"`
12. Commit

## Sessie 1.2 — Implementatie stappen

1. `?compact=true` filter — delete lege nodes
2. `?selector=` filter — CDP `DOM.querySelector` via `this.devtools.sendCommand()` + subtree scope
3. `?depth=` filter — recursie begrenzen
4. `POST /snapshot/click` — ref → nodeId → DOM.getBoxModel → sendInputEvent (kopieer pattern or `/click`)
5. `POST /snapshot/fill` — ref → nodeId → sendInputEvent type events (kopieer pattern or `/type`)
6. `GET /snapshot/text` — ref → nodeId → CDP `DOM.getOuterHTML` or node.name
7. Navigatie reset: luister op `did-navigate` → `refMap = {}`, `refCounter = 0`
8. `npx tsc` — zero errors
9. Curl test alle endpoints
10. Commit

---

## Verificatie commando's

```bash
TOKEN=$(cat ~/.tandem/api-token)

# Basis snapshot
curl -H "Authorization: Bearer $TOKEN" http://localhost:8765/snapshot \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['snapshot'][:2000])"

# Only interactieve elementen
curl -H "Authorization: Bearer $TOKEN" "http://localhost:8765/snapshot?interactive=true" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['snapshot'])"

# Klik via ref (usage a @ref out the snapshot output)
curl -X POST http://localhost:8765/snapshot/click \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"ref":"@e1"}'

# Fill via ref
curl -X POST http://localhost:8765/snapshot/fill \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"ref":"@e5","value":"test@example.com"}'

# Text ophalen via ref
curl -H "Authorization: Bearer $TOKEN" "http://localhost:8765/snapshot/text?ref=@e1"
```

---

## Veelgemaakte fouten (voorkom ze)

**Anti-detect:**

- ❌ `document.querySelectorAll()` in webview — detecteerbaar
- ✅ CDP `Accessibility.getFullAXTree()` via `devtools.sendCommand()`

**CDP:**

- ❌ Zelf `debugger.attach()` aanroepen or direct op `wc.debugger` werken
- ✅ Altijd via `this.devtools.sendCommand('Method', params)`

**Refs:**

- ❌ Refs op basis or DOM positie (breekt bij dynamische page's)
- ✅ Refs op basis or CDP nodeId (stabiel for lifetime or the node)

**Performance:**

- ❌ Alle nodes always teruggeven (te large for LLM context)
- ✅ `interactive` and `compact` filters implementeren

**TypeScript:**

- ❌ `any` types use (behalve in catch blocks)
- ✅ Volledige TypeScript types in `src/snapshot/types.ts`

**Wiring:**

- ❌ Only endpoint add about server.ts and vergeten the manager te registreren
- ✅ Altijd 3 plekken: ZerantAPIOptions, startAPI(), will-quit
