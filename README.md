# @paperclipai/adapter-openrouter

**OpenRouter adapter for Paperclip** — access 300+ AI models (free & paid) through a single API key.

> If it can receive a heartbeat, it's hired. Now it can think with *any* model.

---

## What This Does

This adapter connects Paperclip agents to [OpenRouter](https://openrouter.ai), giving every agent in your org chart access to:

- **300+ models** from OpenAI, Anthropic, Google, Meta, Mistral, DeepSeek, Qwen, and more
- **Free models** — Llama 4 Maverick, Gemma 3, DeepSeek V3, Qwen3 235B, etc.
- **Auto-routing** — let OpenRouter pick the cheapest/fastest model per request
- **Fallback routing** — automatic provider failover on 5xx errors
- **Cost tracking** — per-generation cost reported back to Paperclip budgets
- **Streaming** — SSE streaming with live transcript in the run viewer
- **Reasoning** — extended thinking for supported models (DeepSeek R1, QwQ, etc.)

---

## Quick Start

### 1. Get an OpenRouter API Key

Go to [https://openrouter.ai/keys](https://openrouter.ai/keys) and create a key.  
Free models work with $0 balance. Paid models need credits.

### 2. Copy Adapter Into Paperclip

```bash
# From your Paperclip repo root:
cp -r /path/to/openrouter-adapter packages/adapters/openrouter
```

### 3. Register the Adapter

You need to add the adapter to **three registries**:

#### a) Server Registry — `server/src/adapters/registry.ts`

```typescript
import { execute as openrouterExecute } from "@paperclipai/adapter-openrouter/server";
import { test as openrouterTest } from "@paperclipai/adapter-openrouter/server";
import { type as openrouterType, label as openrouterLabel, models as openrouterModels } from "@paperclipai/adapter-openrouter";

// Add to the adapters map:
export const adapters = {
  // ... existing adapters
  [openrouterType]: {
    type: openrouterType,
    label: openrouterLabel,
    models: openrouterModels,
    execute: openrouterExecute,
    test: openrouterTest,
  },
};
```

#### b) UI Registry — `ui/src/adapters/registry.ts`

```typescript
import { parseStdout as openrouterParseStdout, buildConfig as openrouterBuildConfig, configFields as openrouterConfigFields } from "@paperclipai/adapter-openrouter/ui";
import { type as openrouterType, label as openrouterLabel, models as openrouterModels } from "@paperclipai/adapter-openrouter";

// Add to the adapters map:
export const adapters = {
  // ... existing adapters
  [openrouterType]: {
    type: openrouterType,
    label: openrouterLabel,
    models: openrouterModels,
    parseStdout: openrouterParseStdout,
    buildConfig: openrouterBuildConfig,
    configFields: openrouterConfigFields,
  },
};
```

#### c) CLI Registry — `cli/src/adapters/registry.ts`

```typescript
import { formatEvent as openrouterFormatEvent } from "@paperclipai/adapter-openrouter/cli";
import { type as openrouterType, label as openrouterLabel } from "@paperclipai/adapter-openrouter";

// Add to the adapters map:
export const adapters = {
  // ... existing adapters
  [openrouterType]: {
    type: openrouterType,
    label: openrouterLabel,
    formatEvent: openrouterFormatEvent,
  },
};
```

#### d) Workspace Dependencies

Add to `server/package.json`, `cli/package.json`, and `ui/package.json`:

```json
{
  "dependencies": {
    "@paperclipai/adapter-openrouter": "workspace:*"
  }
}
```

Then run:

```bash
pnpm install
pnpm build
```

### 4. Set Your API Key

Option A — Environment variable:
```bash
export OPENROUTER_API_KEY="sk-or-v1-your-key-here"
```

Option B — In `.paperclip/.env`:
```
OPENROUTER_API_KEY=sk-or-v1-your-key-here
```

Option C — Per-agent in `adapterConfig.apiKey` (stored via Paperclip's secret provider).

### 5. Create an Agent Using OpenRouter

In the Paperclip UI → Org Chart → Hire Agent:

1. **Adapter Type**: Select "OpenRouter"
2. **API Key**: Paste your `sk-or-v1-...` key
3. **Model**: Pick from the dynamic dropdown (fetched live from OpenRouter)
4. **Test Environment**: Click test — it validates your key and shows available models

Or via CLI:
```bash
paperclipai agent create \
  --name "researcher" \
  --adapter-type openrouter \
  --model "deepseek/deepseek-chat-v3-0324:free" \
  --company-id <your-company-id>
```

---

## Configuration Reference

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `model` | string | `openrouter/auto` | Model ID from OpenRouter. Use `:free` suffix for free tier. |
| `apiKey` | string | env var | Your OpenRouter API key (`sk-or-v1-...`) |
| `systemPrompt` | string | — | System message prepended to all requests |
| `temperature` | number | `0.7` | Sampling temperature (0–2) |
| `maxTokens` | number | `4096` | Max completion tokens |
| `topP` | number | `1` | Nucleus sampling threshold |
| `stream` | boolean | `true` | Enable SSE streaming |
| `reasoning` | boolean | `false` | Enable extended thinking (model must support it) |
| `transforms` | string[] | — | OpenRouter transforms, e.g. `["middle-out"]` |
| `route` | string | `fallback` | `"fallback"` or `"no-fallback"` |
| `httpReferer` | string | `https://paperclip.ing` | App URL for OpenRouter leaderboards |
| `xTitle` | string | `Paperclip` | App name for OpenRouter leaderboards |

---

## Cost Tracking

The adapter reports **real USD costs** back to Paperclip's budget system:

1. After each completion, the adapter queries OpenRouter's `/api/v1/generation` endpoint
2. Returns `inputTokens`, `outputTokens`, and `costUsd` in the execution result
3. Paperclip deducts this from the agent's monthly budget
4. At 80% budget utilization → soft warning; at 100% → agent auto-pauses

Free models report `$0.00` cost — they don't eat into your budget.

---

## Dynamic Model Discovery

Unlike static adapters, this adapter **fetches models live** from OpenRouter during:

- **Environment test** — shows total model count, free vs paid breakdown
- **Agent config UI** — populates the model dropdown dynamically
- **Fallback** — if the API is unreachable, falls back to the static model list in `src/index.ts`

The model list updates automatically as OpenRouter adds new models — no adapter updates needed.

---

## Example Configs

### Free Research Agent

```json
{
  "name": "researcher",
  "adapterType": "openrouter",
  "adapterConfig": {
    "model": "deepseek/deepseek-chat-v3-0324:free",
    "temperature": 0.3,
    "maxTokens": 8192,
    "stream": true,
    "systemPrompt": "You are a research analyst. Be thorough and cite sources."
  }
}
```

### Frontier Coding Agent

```json
{
  "name": "senior-engineer",
  "adapterType": "openrouter",
  "adapterConfig": {
    "model": "anthropic/claude-sonnet-4-6",
    "temperature": 0.0,
    "maxTokens": 16384,
    "stream": true,
    "route": "fallback"
  }
}
```

### Reasoning Agent with Auto-Routing

```json
{
  "name": "strategist",
  "adapterType": "openrouter",
  "adapterConfig": {
    "model": "openrouter/auto",
    "temperature": 0.7,
    "maxTokens": 4096,
    "reasoning": true,
    "transforms": ["middle-out"]
  }
}
```

---

## How It Differs From Existing Adapters

| Feature | Claude/Codex/Gemini Local | OpenRouter |
|---------|--------------------------|------------|
| Execution | Spawns local CLI process | HTTP API call |
| Models | Single provider | 300+ across all providers |
| API key | Provider-specific | Single OpenRouter key |
| Free models | ❌ | ✅ (50+ free models) |
| Auto-routing | ❌ | ✅ (cost-optimized) |
| Fallback | ❌ | ✅ (automatic provider failover) |
| Local install | Requires CLI binary | No local install needed |
| Cost tracking | Native token counting | Via OpenRouter Generation API |

---

## File Structure

```
packages/adapters/openrouter/
├── package.json
├── tsconfig.json
├── README.md
├── REGISTRY_PATCHES.md
└── src/
    ├── index.ts                 # Root metadata, types, constants
    ├── server/
    │   ├── index.ts             # Server barrel export
    │   ├── execute.ts           # Core: calls OpenRouter chat/completions
    │   ├── parse.ts             # Response/stream parsing
    │   └── test.ts              # Env diagnostics + dynamic model fetch
    ├── ui/
    │   ├── index.ts             # UI barrel export
    │   ├── parse-stdout.ts      # Stdout → transcript entries
    │   └── build-config.ts      # Form values → adapterConfig JSON
    └── cli/
        ├── index.ts             # CLI barrel export
        └── format-event.ts      # Terminal pretty-print for --watch
```

---

## Community Submission

### Paperclip GitHub Issue

Go to [github.com/paperclipai/paperclip/issues/new](https://github.com/paperclipai/paperclip/issues/new) and paste:

**Title:**
```
[Feature] OpenRouter adapter — 300+ models (free & paid) via single API key
```

**Body:**
```markdown
## Summary

I've built a complete OpenRouter adapter for Paperclip that gives any agent access to 300+ AI models
(free and paid) through a single OpenRouter API key.

**Repo:** https://github.com/YOUR_USERNAME/paperclip-adapter-openrouter

## Why This Matters

- Addresses the most requested model-access gaps: local LLMs (#187), Gemini (#455), and broader provider support
- One adapter, one API key → instant access to OpenAI, Anthropic, Google, Meta, Mistral, DeepSeek, Qwen,
  and 50+ free models
- No local CLI install required — pure HTTP adapter
- Dynamic model discovery — fetches all models live from OpenRouter's /api/v1/models
- Auto-routing — OpenRouter picks the cheapest/fastest provider per request
- Automatic fallback — provider failover on 5xx errors

## What's Included

- Full adapter following Paperclip's standard architecture (server/ui/cli modules)
- `execute.ts` — calls OpenRouter chat/completions with SSE streaming support
- `test.ts` — validates API key, fetches live model list, validates selected model with pricing info
- `parse.ts` — response parsing including reasoning/extended thinking support
- `build-config.ts` — config form fields for the Paperclip UI with dynamic model dropdown
- `parse-stdout.ts` — transcript entries for the run viewer
- `format-event.ts` — terminal pretty-print for `paperclipai run --watch`
- Cost tracking via OpenRouter's Generation API → feeds into Paperclip budget system
- Free models report $0 cost — don't eat agent budgets
- Reasoning support for DeepSeek R1, QwQ, and other thinking models
- Complete README + copy-paste registry patches

## How to Test

1. Clone the repo into `packages/adapters/openrouter/`
2. Apply the three registry patches (exact code in `REGISTRY_PATCHES.md`)
3. Set `OPENROUTER_API_KEY` env var (get a free key at https://openrouter.ai/keys)
4. `pnpm install && pnpm build`
5. Create an agent with adapter type "openrouter" — free models work with $0 balance

## Request

Would love feedback on whether this could become a built-in adapter. Happy to open a PR if there's interest.

Related issues: #187 (Ollama/local LLM support), #455 (Gemini adapter)
```

---

### awesome-paperclip PR

1. Go to [github.com/gsxdsm/awesome-paperclip](https://github.com/gsxdsm/awesome-paperclip)
2. Click **Fork**
3. Edit `README.md`
4. Under the **Plugins/Extensions** section, add:

```markdown
- [paperclip-adapter-openrouter](https://github.com/YOUR_USERNAME/paperclip-adapter-openrouter) - OpenRouter adapter — access 300+ AI models (free & paid) via single API key. Dynamic model discovery, auto-routing, cost tracking, streaming, and reasoning support.
```

5. Commit message: `Add paperclip-adapter-openrouter`
6. Open Pull Request with title: `Add OpenRouter adapter (300+ models)`

**PR description:**

```markdown
Adds community OpenRouter adapter for Paperclip.

- 300+ models (free & paid) via single API key
- Follows Paperclip's standard adapter architecture (server/ui/cli)
- Dynamic model discovery from OpenRouter API
- Auto-routing, fallback, streaming, reasoning, cost tracking
- Copy-paste registry patches included

Repo: https://github.com/YOUR_USERNAME/paperclip-adapter-openrouter
```

---

### X / Twitter Post

```
Just shipped an OpenRouter adapter for @paperclipai 📎🔀

→ 300+ AI models (free & paid) via single API key
→ Auto-routing picks cheapest provider
→ Dynamic model discovery — no updates needed when new models drop
→ Cost tracking feeds into Paperclip budgets
→ Free models = $0 agent costs

Your Paperclip agents can now think with Llama 4, DeepSeek R1, Claude, GPT-4.1, Gemini, Qwen, Mistral — all from one adapter.

Open source 🔓 github.com/YOUR_USERNAME/paperclip-adapter-openrouter

@daborin @OpenRouterAI #Paperclip #AI #OpenSource
```

---

## Contributing

PRs welcome. If you find bugs or want to add features:

1. Fork the repo
2. Create your branch (`git checkout -b feat/my-feature`)
3. Commit (`git commit -m 'feat: add my feature'`)
4. Push (`git push origin feat/my-feature`)
5. Open a PR

---

## License

MIT — same as Paperclip.
