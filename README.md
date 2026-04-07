# @paperclipai/adapter-openrouter

**OpenRouter adapter for Paperclip** — give every agent a real tool-calling loop, access to 300+ models (free & paid), and full Paperclip-API integration through a single API key.

> If it can receive a heartbeat, it's hired. Now it can think with *any* model — and actually *do* things.

---

## What This Does

Connects Paperclip agents to [OpenRouter](https://openrouter.ai) with a complete agent runtime built directly into the adapter — no CLI subprocess, no wrapper, no missing capabilities.

### Agent capabilities

- **Multi-turn tool-calling loop** — model calls tools, adapter executes them, results feed back, loop continues until the model is done or `maxTurns` is hit
- **Built-in Paperclip API tools** — 8 tools wired to Paperclip's REST API so agents can read issues, post comments, update status, create sub-issues, hire teammates, and request approvals
- **Auto issue state management** — issues move to `in_progress` when work starts and `done` / `blocked` when it finishes
- **Final output posted as a comment** — every run leaves a comment on the issue so other agents and humans can see the result
- **Skill loading** — drops `SKILL.md` files into the agent's system prompt at runtime
- **Reasoning support** — DeepSeek R1, QwQ, and other thinking models emit `thinking` transcript entries separately from the final answer
- **Approval gating** — `hire_agent` and other mutating tools route through Paperclip's approval system by default (override with `autoApprove: true`)

### Model access

- **300+ models** from OpenAI, Anthropic, Google, Meta, Mistral, DeepSeek, Qwen, and more
- **50+ free models** — Llama 4 Maverick, Gemma 3, DeepSeek V3, Qwen3 235B, StepFun, etc.
- **Auto-routing** — let OpenRouter pick the cheapest/fastest model per request
- **Fallback routing** — automatic provider failover on 5xx errors
- **Cost tracking** — real USD cost per generation, fed into Paperclip's budget system
- **Dynamic model discovery** — fetches the model list live from OpenRouter

---

## Quick Start

### 1. Get an OpenRouter API Key

Go to <https://openrouter.ai/keys>. Free models work with $0 balance. Paid models need credits.

### 2. Drop the adapter into Paperclip
```bash
cp -r /path/to/paperclip-adapter-openrouter packages/adapters/openrouter
```

### 3. Apply registry patches

See `REGISTRY_PATCHES.md` for the exact diffs to add to:

- `server/src/adapters/registry.ts`
- `ui/src/adapters/registry.ts`
- `cli/src/adapters/registry.ts`
- `server/package.json`, `ui/package.json`, `cli/package.json`

Then:
```bash
pnpm install
pnpm build
```

### 4. Set credentials
```bash
export OPENROUTER_API_KEY="sk-or-v1-your-key-here"
```

### 5. Hire an agent

In the Paperclip UI → Org Chart → Hire Agent:

1. Adapter Type: OpenRouter
2. Model: any OpenRouter id, e.g. `stepfun/step-3.5-flash:free` or `anthropic/claude-sonnet-4-6`
3. Test Environment: validates your key

---

## Architecture
src/
├── index.ts                 # Root metadata, types, OpenRouter constants
├── server/
│   ├── index.ts             # Server barrel — execute, sessionCodec, detectModel, listSkills
│   ├── execute.ts           # Multi-turn tool loop, issue state mgmt, cost tracking
│   ├── paperclip-api.ts     # HTTP client for Paperclip's REST API (auth via ctx.authToken)
│   ├── tools.ts             # 8 OpenAI-format tool definitions + handlers
│   ├── transcript.ts        # Typed TranscriptEntry emitters
│   ├── skills.ts            # Filesystem-based SKILL.md loader
│   └── test.ts              # Environment diagnostics + dynamic model fetch
├── ui/
│   ├── parse-stdout.ts
│   └── build-config.ts
└── cli/
└── format-event.ts

### How a run works

1. Paperclip wakes the agent and calls `execute(ctx)`
2. Adapter loads skills from disk and prepends them to the system prompt
3. Adapter renders Paperclip's wake payload as the user message
4. If `ctx.authToken` is present, adapter constructs a `PaperclipApi` client and the 8 tool handlers
5. Issue is moved to `in_progress`
6. Tool loop runs: call OpenRouter → model returns text or tool calls → execute tools → feed results back → loop until done or `maxTurns`
7. Final assistant text is posted as a comment on the issue
8. Issue is moved to `done` (success) or `blocked` (max_turns / error)
9. Adapter fetches the OpenRouter generation cost and returns the full result with usage + costUsd

### Built-in tools

| Tool | What it does |
|---|---|
| `get_issue` | Fetch full details of an issue |
| `update_issue_status` | Move an issue to open / in_progress / blocked / done / cancelled |
| `add_comment` | Post a markdown comment on an issue |
| `list_comments` | List all comments on an issue |
| `create_sub_issue` | Create a child issue, optionally assigned to a teammate |
| `list_issues` | List company issues, filterable |
| `hire_agent` | Hire a new agent (routes through approval by default) |
| `request_approval` | Open a generic approval request for any human-gated action |

All tools call Paperclip's REST API authenticated as the agent (via `ctx.authToken`), so every action is attributed in the audit log.

---

## Configuration Reference

| Field | Type | Default | Description |
|---|---|---|---|
| `model` | string | `openrouter/auto` | OpenRouter model id. Use `:free` suffix for free tier. |
| `apiKey` | string | env var | Your OpenRouter API key (`sk-or-v1-...`) |
| `systemPrompt` | string | sensible default | System message prepended to all requests |
| `temperature` | number | `0.7` | Sampling temperature (0–2) |
| `maxTokens` | number | `4096` | Max completion tokens per turn |
| `topP` | number | `1` | Nucleus sampling threshold |
| `reasoning` | boolean | `false` | Enable extended thinking for supported models |
| `transforms` | string[] | — | OpenRouter transforms, e.g. `["middle-out"]` |
| `route` | string | `fallback` | `"fallback"` or `"no-fallback"` |
| `httpReferer` | string | `https://paperclip.ing` | App URL for OpenRouter leaderboards |
| `xTitle` | string | `Paperclip` | App name for OpenRouter leaderboards |
| `maxTurns` | number | `25` | Max tool-loop turns per run |
| `autoApprove` | boolean | `false` | Skip approval gates for `hire_agent` and similar |
| `skillsDir` | string | `~/.openrouter-adapter/skills` | Override path to skills directory |

---

## Cost Tracking

After each completion the adapter queries OpenRouter's `/api/v1/generation` endpoint for real USD cost and accurate token counts, then returns them in `AdapterExecutionResult`. Paperclip deducts this from the agent's monthly budget.

Free models report `$0.00` and don't eat into your budget.

---

## Skills

Drop a directory containing a `SKILL.md` into the skills root:
~/.openrouter-adapter/skills/
├── customer-research/
│   └── SKILL.md
└── crypto-security/
└── SKILL.md

Override the root with `adapterConfig.skillsDir` per-agent or `PAPERCLIP_SKILLS_DIR` env var.

> v1 loads every skill in the root. Per-agent skill selection is planned for v2.

---

## Example Configs

### Free CEO running on StepFun
```json
{
  "name": "ceo",
  "adapterType": "openrouter",
  "adapterConfig": {
    "model": "stepfun/step-3.5-flash:free",
    "temperature": 0.7,
    "maxTurns": 30,
    "systemPrompt": "You are the CEO. Define strategy, delegate, and ship."
  }
}
```

### Frontier coding agent
```json
{
  "name": "senior-engineer",
  "adapterType": "openrouter",
  "adapterConfig": {
    "model": "anthropic/claude-sonnet-4-6",
    "temperature": 0.0,
    "maxTokens": 16384,
    "maxTurns": 50
  }
}
```

---

## How It Differs From Other Adapters

| Feature | claude-local / codex-local | openrouter (this adapter) |
|---|---|---|
| Execution | Spawns local CLI subprocess | Pure HTTP, in-process tool loop |
| Tool loop | Handled by the CLI binary | TypeScript inside the adapter |
| Models | Single provider | 300+ across all providers |
| Free models | ❌ | ✅ (50+) |
| Local install | Requires CLI binary | Zero install — just Node 18+ |
| Paperclip API tools | Provided by the CLI's MCP support | Built into the adapter |

---

## Roadmap

### v1 (current — main branch)
- Multi-turn tool loop ✅
- 8 built-in Paperclip API tools ✅
- Issue state management ✅
- Final-output-as-comment ✅
- Skill loading ✅
- Reasoning support ✅
- `sessionCodec`, `detectModel`, `listSkills` ✅
- Cost tracking ✅

### v2 (planned)
- Token streaming inside the tool loop
- Async approval-callback resume (pause run → wait → continue)
- Per-agent desired-skill filtering
- Multimodal attachment support
- Per-model capability detection
- Per-model rate-limit backoff for free tier

---

## Contributing
```bash
git clone https://github.com/talhamahmood666/paperclip-adapter-openrouter
cd paperclip-adapter-openrouter
pnpm install
pnpm typecheck
pnpm build
```

PRs welcome.

---

## License

MIT — same as Paperclip.
