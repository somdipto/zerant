# Agent-Browser Gaps — TODO Checklist

> Vink af (`[x]`) wat complete is. Zet date + sessienummer erbij.
> Zie fase-documenten for details per taak.

---

## Pre-requisites (check for elke session)

```bash
TOKEN=$(cat ~/.tandem/api-token)
```

- [ ] `curl http://localhost:8765/status` — Zerant draait
- [ ] `curl -H "Authorization: Bearer $TOKEN" http://localhost:8765/devtools/status` — CDP attached
- [ ] `npx tsc` — zero errors
- [ ] `git status` — clean

---

## Phase 1: /snapshot — Accessibility Tree with @refs

> **Sessions:** 1-2
> **Files:** `src/snapshot/manager.ts`, `src/snapshot/types.ts`, `src/api/server.ts`, `src/main.ts`
> **Detail:** `fase-1-snapshot.md`

### Sessie 1.1: SnapshotManager + basis endpoint

- [x] `src/snapshot/types.ts` — interfaces (AccessibilityNode, RefMap, SnapshotOptions, SnapshotResult) _(2026-02-20, session 1.1)_
- [x] `src/snapshot/manager.ts` — SnapshotManager class _(2026-02-20, session 1.1)_
- [x] `getSnapshot()` — CDP `Accessibility.getFullAXTree()` via `devtools.sendCommand()` _(2026-02-20, session 1.1)_
- [x] `assignRefs()` — @e1, @e2, ... toewijzen (stabiel per page, reset bij navigatie) _(2026-02-20, session 1.1)_
- [x] `formatTree()` — output if text (same stijl if agent-browser) _(2026-02-20, session 1.1)_
- [x] **Manager Wiring:** ZerantAPIOptions + main.ts startAPI() + will-quit handler _(2026-02-20, session 1.1)_
- [x] `GET /snapshot` endpoint in server.ts (SNAPSHOT section, for WINGMAN STREAM) _(2026-02-20, session 1.1)_
- [x] `GET /snapshot?interactive=true` — filter op buttons/inputs/links _(2026-02-20, session 1.1)_
- [x] `npx tsc` — zero errors _(2026-02-20, session 1.1)_
- [x] Test: `curl -H "Authorization: Bearer $TOKEN" http://localhost:8765/snapshot` _(2026-02-20, session 1.1)_
- [x] Test: `curl -H "Authorization: Bearer $TOKEN" "http://localhost:8765/snapshot?interactive=true"` _(2026-02-20, session 1.1)_
- [ ] Commit: `feat: /snapshot endpoint with accessibility tree refs`

### Sessie 1.2: Filters + @ref interactie

- [x] `GET /snapshot?compact=true` — lege structurele nodes weggooien _(2026-02-21, session 1.2)_
- [x] `GET /snapshot?selector=%23main` — scope via `DOM.querySelector` + subtree _(2026-02-21, session 1.2)_
- [x] `GET /snapshot?depth=3` — max diepte beperken _(2026-02-21, session 1.2)_
- [x] `POST /snapshot/click {"ref":"@e2"}` — click via @ref (kopieer pattern or `/click` endpoint) _(2026-02-21, session 1.2)_
- [x] `POST /snapshot/fill {"ref":"@e3","value":"test"}` — fill via @ref (kopieer pattern or `/type` endpoint) _(2026-02-21, session 1.2)_
- [x] `GET /snapshot/text?ref=@e1` — text ophalen via @ref _(2026-02-21, session 1.2)_
- [x] Refs resetten bij navigatie (`Page.frameNavigated` CDP subscriber) _(2026-02-21, session 1.2)_
- [x] `npx tsc` — zero errors _(2026-02-21, session 1.2)_
- [x] Test: `curl -X POST` `/snapshot/click` — click op "Learn more" link op example.com navigeert _(2026-02-21, session 1.2)_
- [x] Test: refs stabiel op same page, reset na navigatie — old ref fails after navigate _(2026-02-21, session 1.2)_
- [x] Commit: `feat: /snapshot filters + @ref click/fill/text`

---

## Phase 2: /network/mock — Intercept & Mocking

> **Sessions:** 1
> **Files:** `src/network/mocker.ts`, `src/network/types.ts`, `src/api/server.ts`, `src/main.ts`
> **Detail:** `fase-2-network-mock.md`

### Sessie 2.1: NetworkMocker + alle endpoints

- [x] `src/network/types.ts` — interfaces (MockRule) _(2026-02-21, session 2.1)_
- [x] `src/network/mocker.ts` — NetworkMocker class (with CDP subscriber for Fetch.requestPaused) _(2026-02-21, session 2.1)_
- [x] **Manager Wiring:** ZerantAPIOptions + main.ts startAPI() + will-quit handler _(2026-02-21, session 2.1)_
- [x] CDP: `Fetch.enable` via `devtools.sendCommand()` bij first mock, `Fetch.disable` bij mock-clear _(2026-02-21, session 2.1)_
- [x] `handleRequestPaused()` — match URL pattern, fulfillRequest/failRequest/continueRequest _(2026-02-21, session 2.1)_
- [x] Glob matching for URL patterns (bijv. `**/api/**`) _(2026-02-21, session 2.1)_
- [x] Body base64 encoding for `Fetch.fulfillRequest` _(2026-02-21, session 2.1)_
- [x] `POST /network/mock` — mock add (body: JSON response) _(2026-02-21, session 2.1)_
- [x] `POST /network/mock` with `"abort":true` — request blokkeren _(2026-02-21, session 2.1)_
- [x] `GET /network/mocks` — actieve mocks tonen _(2026-02-21, session 2.1)_
- [x] `POST /network/unmock {"pattern":"..."}` — specific mock verwijderen _(2026-02-21, session 2.1)_
- [x] `POST /network/mock-clear` — alles wissen + Fetch.disable _(2026-02-21, session 2.1)_
- [x] Alias: `POST /network/route` → same if `/network/mock` _(2026-02-21, session 2.1)_
- [x] Existing `/network/log`, `/network/apis` etc. werken still _(2026-02-21, session 2.1)_
- [x] `npx tsc` — zero errors _(2026-02-21, session 2.1)_
- [x] Test: mock instellen → request doen → gemockte response ontvangen _(2026-02-21, session 2.1)_
- [x] Test: abort mock → network error in browser _(2026-02-21, session 2.1)_
- [x] Test: mock-clear → gewoon internet weer _(2026-02-21, session 2.1)_
- [x] Commit: `feat: network mocking via CDP Fetch (/network/mock)`

---

## Phase 3: /sessions — Geïsoleerde Browser Sessions

> **Sessions:** 3 (3.1 partition plumbing, 3.2 CRUD, 3.3 state + X-Session)
> **Files:** `shell/index.html`, `src/tabs/manager.ts`, `src/sessions/*`, `src/api/server.ts`, `src/main.ts`
> **Detail:** `fase-3-sessions.md`

### Sessie 3.1: Partition Plumbing (renderer + TabManager)

> No new files or endpoints — only existing code aanpassen.
> Na this session works alles still exact hetzelfde (default = 'persist:tandem').

- [x] `shell/index.html` regel ~1285: `createTab(tabId, url)` → `createTab(tabId, url, partition)` _(2026-02-21, session 3.1)_
- [x] `shell/index.html` regel ~1289: `'persist:tandem'` → `partition || 'persist:tandem'` _(2026-02-21, session 3.1)_
- [x] `shell/index.html` regel ~3009: monkey-patch 1 forward partition: `function(tabId, url, partition)` _(2026-02-21, session 3.1)_
- [x] `shell/index.html` regel ~3010: `_origCreateTab.call(window.__tandemTabs, tabId, url, partition)` _(2026-02-21, session 3.1)_
- [x] `shell/index.html` regel ~3629: monkey-patch 2 forward partition: `function(tabId, url, partition)` _(2026-02-21, session 3.1)_
- [x] `shell/index.html` regel ~3630: `_origCreateTab2.call(window.__tandemTabs, tabId, url, partition)` _(2026-02-21, session 3.1)_
- [x] Initial tab (regel ~1461) — NIET WIJZIGEN (always Robin's session) _(2026-02-21, session 3.1)_
- [x] `src/tabs/manager.ts` Tab interface: voeg `partition: string` toe _(2026-02-21, session 3.1)_
- [x] `src/tabs/manager.ts` openTab: voeg `partition` parameter toe (default `'persist:tandem'`) _(2026-02-21, session 3.1)_
- [x] `src/tabs/manager.ts` openTab: pas executeJavaScript call about to partition mee te geven _(2026-02-21, session 3.1)_
- [x] `src/tabs/manager.ts` registerInitialTab: voeg `partition: 'persist:tandem'` toe _(2026-02-21, session 3.1)_
- [x] `npx tsc` — zero errors _(2026-02-21, session 3.1)_
- [x] `npm start` — app start normaal, tabs werken still exact if voorheen _(2026-02-21, session 3.1)_
- [x] Test: `curl -H "Authorization: Bearer $TOKEN" http://localhost:8765/tabs/list` (tabs hebben partition field) _(2026-02-21, session 3.1)_
- [x] Commit: `refactor: make partition configurable in tab creation stack` _(2026-02-21, session 3.1)_

### Sessie 3.2: SessionManager + CRUD endpoints

> **Requires:** Sessie 3.1 compleet

- [x] `src/sessions/types.ts` — interfaces (Session, SessionState) _(2026-02-21, session 3.2)_
- [x] `src/sessions/manager.ts` — SessionManager class _(2026-02-21, session 3.2)_
- [x] **Manager Wiring:** ZerantAPIOptions + main.ts startAPI() + will-quit handler _(2026-02-21, session 3.2)_
- [x] `create(name)` — new Electron partition (`persist:session-{name}`) _(2026-02-21, session 3.2)_
- [x] `list()` — alle sessions + welke actief _(2026-02-21, session 3.2)_
- [x] `setActive(name)` — actieve API session wisselen _(2026-02-21, session 3.2)_
- [x] `destroy(name)` — tabs sluiten, gooit error bij "default" _(2026-02-21, session 3.2)_
- [x] `POST /sessions/create {"name":"agent1"}` _(2026-02-21, session 3.2)_
- [x] `GET /sessions/list` _(2026-02-21, session 3.2)_
- [x] `POST /sessions/switch {"name":"agent1"}` _(2026-02-21, session 3.2)_
- [x] `POST /sessions/destroy {"name":"agent1"}` _(2026-02-21, session 3.2)_
- [x] `npx tsc` — zero errors _(2026-02-21, session 3.2)_
- [x] Test: session aanmaken, tonen, verwijderen _(2026-02-21, session 3.2)_
- [x] Test: Robin's session onaangetast + can not removed be _(2026-02-21, session 3.2)_
- [x] Commit: `feat: /sessions create/list/switch/destroy` _(2026-02-21, session 3.2)_

### Sessie 3.3: State save/load + X-Session header

> **Requires:** Sessie 3.2 compleet

- [x] `src/sessions/state.ts` — StateManager class _(2026-02-21, session 3.3)_
- [x] `save()`: `session.fromPartition(partition).cookies.get({})` → JSON → disk _(2026-02-21, session 3.3)_
- [x] `load()`: disk → JSON → `session.fromPartition(partition).cookies.set()` per cookie _(2026-02-21, session 3.3)_
- [x] AES-256-GCM encryptie (optional, via env `TANDEM_SESSION_KEY`) _(2026-02-21, session 3.3)_
- [x] **Manager Wiring:** Voeg `stateManager` toe about ZerantAPIOptions + startAPI() _(2026-02-21, session 3.3)_
- [x] `POST /sessions/state/save {"name":"twitter"}` _(2026-02-21, session 3.3)_
- [x] `POST /sessions/state/load {"name":"twitter"}` _(2026-02-21, session 3.3)_
- [x] `GET /sessions/state/list` _(2026-02-21, session 3.3)_
- [x] `getSessionPartition()` helper methode in ZerantAPI class _(2026-02-21, session 3.3)_
- [x] `X-Session` header op existing endpoints (navigate, click, page-content, etc.) _(2026-02-21, session 3.3)_
- [x] `npx tsc` — zero errors _(2026-02-21, session 3.3)_
- [x] Test: state save → session destroyen → state laden → cookies terug _(2026-02-21, session 3.3)_
- [x] Test: `X-Session: agent1` header op `/navigate` works in agent1 session _(2026-02-21, session 3.3)_
- [ ] Commit: `feat: session state save/load + X-Session header`

---

## Phase 4: tandem CLI

> **Sessions:** 1
> **Files:** `cli/index.ts`, `cli/client.ts`, `cli/commands/*.ts`, `cli/package.json`, `cli/tsconfig.json`
> **Detail:** `fase-4-cli.md`

### Sessie 4.1: CLI — alle commands

- [x] `cli/package.json` + `cli/tsconfig.json` (aparte TypeScript config) _(2026-02-21, session 4.1)_
- [x] Root `tsconfig.json` aanpassen: `"cli"` add about exclude _(2026-02-21, session 4.1)_
- [x] `cli/client.ts` — HTTP client to localhost:8765 (Bearer auth) _(2026-02-21, session 4.1)_
- [x] `cli/index.ts` — commander.js + `#!/usr/bin/env node` + globale `--session` optie _(2026-02-21, session 4.1)_
- [x] `tandem open <url>` → POST /navigate _(2026-02-21, session 4.1)_
- [x] `tandem snapshot [--interactive] [--compact] [--selector <s>] [--depth <n>]` _(2026-02-21, session 4.1)_
- [x] `tandem click <sel-or-@ref>` (detecteer @-prefix → /snapshot/click or /click) _(2026-02-21, session 4.1)_
- [x] `tandem fill <sel-or-@ref> <text>` _(2026-02-21, session 4.1)_
- [x] `tandem eval <javascript>` _(2026-02-21, session 4.1)_
- [x] `tandem screenshot [path]` (raw PNG → Buffer.from(arrayBuffer) → file) _(2026-02-21, session 4.1)_
- [x] `tandem cookies` + `tandem cookies set <name> <value>` _(2026-02-21, session 4.1)_
- [x] `tandem session list/create/switch/destroy` _(2026-02-21, session 4.1)_
- [x] `tandem --session <name> <command>` → X-Session header _(2026-02-21, session 4.1)_
- [x] `tandem --help` + `tandem <command> --help` _(2026-02-21, session 4.1)_
- [x] `tandem --version` _(2026-02-21, session 4.1)_
- [x] `cd cli && npx tsc` — zero errors _(2026-02-21, session 4.1)_
- [x] Root `npx tsc` — zero errors (no conflict with cli/) _(2026-02-21, session 4.1)_
- [x] Test: `tandem open example.com` → navigeert _(2026-02-21, session 4.1)_
- [x] Test: `tandem snapshot -i` → interactive tree _(2026-02-21, session 4.1)_
- [x] Test: `tandem click @e2` → click via ref _(2026-02-21, session 4.1)_
- [x] Test: `tandem --session agent1 open x.com` → in agent1 session _(2026-02-21, session 4.1)_
- [ ] Commit: `feat: tandem CLI wrapper (@zerant/zerant-cli)`

---

## Sessie Protocol

### Bij start or elke session:

1. Read `LEES-MIJ-EERST.md`
2. Read the relevante `fase-X.md` document
3. Check this TODO — waar waren we gebleven?
4. Run `curl http://localhost:8765/status && npx tsc`
5. Read the te change bronbestanden

### Bij einde or elke session:

1. `npx tsc` — zero errors
2. `npm start` — app start, no crashes
3. Curl test alle new endpoints (output plakken in rapport)
4. Update TODO.md — vink [x], zet date
5. Git commit + push
6. Rapport schrijven (Gebouwd / Getest / Obstakels / Next session)
