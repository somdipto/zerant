# Zerant Browser — Current Feature Inventory

> Updated: 2026-04-01
> Source of truth: live code under `src/`

This file is a current snapshot, not a historical build log. Zerant exposes
`301` HTTP routes and a broad Electron shell on top of them.

## Core Surfaces

- Browser control: navigation, tabs, snapshots, input simulation, screenshots
- Sessions and workspaces: isolated sessions, tab-to-workspace mapping, state save/load
- Security: network shield, outbound guard, script/content analysis, gatekeeper, prompt-injection protection
- DevTools and network tooling: console, network capture, DOM queries, CDP bridge, HAR export, request mocking
- Content and memory: content extraction, context APIs, site memory, form memory
- Media and panel features: Wingman panel, chat history, screenshots, draw overlay, voice, recordings, Google Photos integration
- Data systems: bookmarks, history, downloads, sync, previews, Chrome import, pinboards

## Key Current Endpoints

### Browser and tabs

- `POST /navigate`
- `GET /page-content`
- `GET /page-html`
- `POST /click`
- `POST /type`
- `POST /scroll`
- `POST /wait`
- `POST /tabs/open`
- `POST /tabs/close`
- `GET /tabs/list`
- `POST /tabs/focus`
- `POST /tabs/group`

### Snapshots and locators

- `GET /snapshot`
- `POST /snapshot/click`
- `POST /snapshot/fill`
- `GET /snapshot/text`
- `POST /find`
- `POST /find/click`
- `POST /find/fill`
- `POST /find/all`

### Security

- `GET /security/status`
- `GET /security/report`
- `GET /security/page/analysis`
- `GET /security/page/scripts`
- `GET /security/scripts/correlations`
- `GET /security/analyzers/status`
- `POST /security/injection-override`

### OpenClaw and panel integration

- `GET /chat`
- `POST /chat`
- `GET /config/openclaw-token`
- `GET /config/openclaw-connect`
- `GET /active-tab/context`

### Network and previews

- `GET /network/log`
- `GET /network/har`
- `POST /network/mock`
- `GET /previews`
- `POST /preview`
- `GET /preview/:id`

## Current Behaviors Worth Calling Out

- `POST /tabs/open` supports `inheritSessionFrom` and can copy IndexedDB state from an existing tab into the new tab
- agent-facing content routes are scanned for prompt injection, with `injectionWarnings` added to warning responses and hard blocking at risk score `>= 70`
- preview pages are intentionally public so they can be opened directly in a browser tab
- HAR export is live on `GET /network/har`
- Google Photos screenshot integration is live through the `/integrations/google-photos/*` routes

## Known Non-Features

These items appear in older plans but are not live in the current code:

- `GET /tabs/closed`
- `/tabs/:id/emoji`
- `/sidebar/status`
- `GET /pinboards/fetch-meta`
- `GET /split/status`

## Related Docs

- [README](../../README.md)
- [Current API Notes](../api-current.md)
- [Security Shield](../security-shield/README.md)
