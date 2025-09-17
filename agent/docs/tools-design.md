````markdown
# **Lean LangChain Tooling for a Browser‑Agent (v2)**  

*A minimal contract for inputs **and now outputs***  

This memo explains **why** and **how** to expose your existing browser‑automation classes as LangChain tools while keeping the framework footprint microscopic.  It updates the original design with a **single, universal output contract**:

> **Every tool must return either**  
> *a plain, human‑readable sentence* **or**  
> *a 2‑field JSON envelope* → `{ ok: boolean, output: string }`.

No other structure or nesting is allowed.

---

## 1  Objectives & Philosophy
| Goal | Design Choice |
|------|---------------|
| Keep LangChain “just a thin adapter” | Use *dynamic* helpers instead of subclassing `BaseTool`. |
| Preserve rich TS classes (`FindElementTool`, …) | Wrap each class in a one‑line closure. |
| Strong runtime validation of **inputs** | Re‑use existing **Zod** schemas. |
| Predictable, tiny **outputs** | Plain string **or** `{ ok, output }` JSON. |
| Easy to eject LangChain later | All wrappers in one folder; delete them and nothing else breaks. |

---

## 2  Helper Selection Cheat‑Sheet

| When you need… | Use | Reason |
|----------------|-----|--------|
| **One** raw string argument (e.g. DNS lookup) | `DynamicTool` | Zero schema, one property (`func(input: string)`), minimal overhead. |
| **Multiple** named arguments (most browser actions) | `DynamicStructuredTool` | Accepts full Zod/JSON schema, validated, LLM‑friendly. |
| Compile‑time/static tools | `tool()` or `StructuredTool.from_function` | Leaner if you never create tools at run‑time. |

---

## 3  Universal **Output Contract**

### 3.1 Decision rule

| Situation | Return |
|-----------|--------|
| Simple acknowledgement / status | `"Clicked element #15"` *(plain string)* |
| You need the caller to know success/failure | `{"ok": true,  "output": "Clicked element #15"}` or `{"ok": false, "output": "Selector not found"}` (JSON stringified) |

> The agent will coerce anything to a string; **you** decide if you wrap it in JSON.  
> Keep `output` short—under 200 chars—to stay LLM‑friendly.

### 3.2 Type alias (copy‑paste)

```ts
type Envelope =
  | { ok: true;  output: string }
  | { ok: false; output: string };
````

---

## 4  Wrapper Pattern (Copy–Paste‑Ready)

### 4.1 `DynamicStructuredTool` example

```ts
// tools/wrappers/findElement.ts
import { DynamicStructuredTool } from "@langchain/core/tools";
import { FindElementTool }   from "../legacy/FindElementTool";
import type { Envelope }     from "../types/envelope";

const finder = new FindElementTool(executionContext);

export const findElement = new DynamicStructuredTool({
  name: "find_element",
  description: finder.config.description,
  schema: finder.config.inputSchema,
  func: async (args): Promise<string> => {
    try {
      const idx = await finder.invoke(args);      // <-- your heavy logic
      const res: Envelope = { ok: true, output: idx.toString() };
      return JSON.stringify(res);
    } catch (err) {
      const res: Envelope = {
        ok: false,
        output: err instanceof Error ? err.message : String(err)
      };
      return JSON.stringify(res);
    }
  },
});
```

### 4.2 `DynamicTool` example (single‑string input)

```ts
// tools/wrappers/dnsLookup.ts
import { DynamicTool } from "@langchain/core/tools";
import dns from "node:dns/promises";
import type { Envelope } from "../types/envelope";

export const dnsLookup = new DynamicTool({
  name: "dns_lookup",
  description: "Resolve A records for a domain",
  func: async (domain): Promise<string> => {
    try {
      const ips = (await dns.resolve4(domain)).join(", ");
      return ips;                                  // plain string is fine
    } catch (err) {
      const res: Envelope = {
        ok: false,
        output: err instanceof Error ? err.message : String(err)
      };
      return JSON.stringify(res);
    }
  },
});
```

> **Never throw**: wrap every failure path inside the tool and return `{ ok:false, output:"…" }`.

---

## 5  Agent Integration

```ts
import { ChatOpenAI }  from "@langchain/openai";
import { createReactAgent } from "@langchain/agents";
import { findElement, interact, extract, tabOps, dnsLookup } from "./tools";

const tools = [findElement, interact, extract, tabOps, dnsLookup];
const model = new ChatOpenAI({ modelName: "gpt-4o-mini" });

export const browserAgent = await createReactAgent({
  llm: model,
  tools,
  systemPrompt: "You are an expert browser assistant…",
});
```

---

## 6  Gotchas & Tips

1. **Flat schemas** – deep nesting confuses the model.
2. **Short descriptions** – keep under 1‑2 sentences; name should be snake\_cased.
3. **Return shape discipline** – decide once per tool: plain string *or* envelope, and never mix.
4. **Split supersized tools** – if an LLM struggles, make narrower commands.
5. **No UI‑only metadata** – leave `streamingConfig`, icons, etc. out of the wrapper.
6. **Token sanity** – truncate `output` if it might exceed a few hundred characters.

---


## 8  Future‑Proofing

* **OpenAI / Anthropic tool‑calling** – The `{ ok, output }` envelope is already JSON; it travels through function‑calling untouched.
* **If you eject LangChain** – Replace each wrapper with `(args) => {…}` that still returns the same envelope. Nothing else in your app changes.

---

### ✨ With this update, each tool speaks a *single, predictable dialect*: a very small string—either raw or wrapped—so your agent stays lean and your downstream code remains blissfully simple.

```
::contentReference[oaicite:0]{index=0}
```
