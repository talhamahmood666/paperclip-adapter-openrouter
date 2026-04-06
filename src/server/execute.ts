import type {
  AdapterExecutionContext,
  AdapterExecutionResult,
  UsageSummary,
} from "@paperclipai/adapter-utils";
import {
  renderPaperclipWakePrompt,
  asString,
} from "@paperclipai/adapter-utils/server-utils";
import {
  OPENROUTER_CHAT_ENDPOINT,
  OPENROUTER_GENERATION_ENDPOINT,
  type OpenRouterConfig,
} from "../index.js";

function resolveApiKey(config: OpenRouterConfig): string {
  const key = config.apiKey || process.env.OPENROUTER_API_KEY || "";
  if (!key) throw new Error("OpenRouter API key not found. Set adapterConfig.apiKey or OPENROUTER_API_KEY env var.");
  return key;
}

function buildHeaders(apiKey: string, config: OpenRouterConfig): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "HTTP-Referer": config.httpReferer || "https://paperclip.ing",
    "X-Title": config.xTitle || "Paperclip",
  };
}

function buildRequestBody(
  config: OpenRouterConfig,
  messages: Array<{ role: string; content: string }>
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: config.model || "openrouter/auto",
    messages,
    max_tokens: config.maxTokens ?? 4096,
    temperature: config.temperature ?? 0.7,
    top_p: config.topP ?? 1,
    stream: config.stream ?? true,
  };
  if (config.reasoning) body.reasoning = { effort: "high" };
  if (config.transforms?.length) body.transforms = config.transforms;
  if (config.route) body.route = config.route;
  return body;
}

async function executeStreaming(
  apiKey: string,
  config: OpenRouterConfig,
  messages: Array<{ role: string; content: string }>,
  onLog: (stream: "stdout" | "stderr", chunk: string) => Promise<void>,
): Promise<{ output: string; generationId?: string; usage?: UsageSummary }> {
  const body = buildRequestBody(config, messages);
  body.stream = true;

  const response = await fetch(OPENROUTER_CHAT_ENDPOINT, {
    method: "POST",
    headers: buildHeaders(apiKey, config),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenRouter API error (${response.status}): ${errText}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body from OpenRouter");

  const decoder = new TextDecoder();
  let output = "";
  let generationId: string | undefined;
  let buffer = "";
  let usage: UsageSummary | undefined;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith(":")) continue;
      if (!trimmed.startsWith("data: ")) continue;

      const data = trimmed.slice(6);
      if (data === "[DONE]") continue;

      try {
        const parsed = JSON.parse(data);
        if (parsed.id && !generationId) generationId = parsed.id;

        const delta = parsed.choices?.[0]?.delta?.content;
        if (delta) {
          output += delta;
          await onLog("stdout", delta);
        }

        if (parsed.usage) {
          usage = {
            inputTokens: parsed.usage.prompt_tokens || 0,
            outputTokens: parsed.usage.completion_tokens || 0,
          };
        }
      } catch { /* skip */ }
    }
  }

  return { output, generationId, usage };
}

async function executeNonStreaming(
  apiKey: string,
  config: OpenRouterConfig,
  messages: Array<{ role: string; content: string }>,
  onLog: (stream: "stdout" | "stderr", chunk: string) => Promise<void>,
): Promise<{ output: string; generationId?: string; usage?: UsageSummary }> {
  const body = buildRequestBody(config, messages);
  body.stream = false;

  const response = await fetch(OPENROUTER_CHAT_ENDPOINT, {
    method: "POST",
    headers: buildHeaders(apiKey, config),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenRouter API error (${response.status}): ${errText}`);
  }

  const data = await response.json() as Record<string, any>;
  const output = data.choices?.[0]?.message?.content || "";
  const generationId = data.id;

  if (output) await onLog("stdout", output);

  let usage: UsageSummary | undefined;
  if (data.usage) {
    usage = {
      inputTokens: data.usage.prompt_tokens || 0,
      outputTokens: data.usage.completion_tokens || 0,
    };
  }

  return { output, generationId, usage };
}

async function fetchGenerationCost(generationId: string, apiKey: string): Promise<number | null> {
  try {
    await new Promise((r) => setTimeout(r, 2000));
    const res = await fetch(`${OPENROUTER_GENERATION_ENDPOINT}?id=${generationId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) return null;
    const data = await res.json() as Record<string, any>;
    return data.data?.total_cost ?? data.data?.usage ?? null;
  } catch { return null; }
}

export async function execute(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult> {
  const config = (ctx.agent.adapterConfig ?? ctx.config) as unknown as OpenRouterConfig;
  const { context } = ctx;

  // Build the prompt the same way other adapters do
  const resumedSession = !!ctx.runtime.sessionId;
  const wakePrompt = renderPaperclipWakePrompt(context, { resumedSession });

  const messages: Array<{ role: string; content: string }> = [];
  const defaultSystem = "You are an AI agent working inside Paperclip, an autonomous company orchestration system. When you receive a wake payload, extract the task/issue details and EXECUTE the task. Do not describe or analyze the payload. Focus on the issue title and description and produce useful work output.";
  messages.push({ role: "system", content: config.systemPrompt || defaultSystem });

  if (wakePrompt) {
    messages.push({ role: "user", content: wakePrompt });
  } else {
    messages.push({ role: "user", content: JSON.stringify(context) });
  }

  try {
    const apiKey = resolveApiKey(config);
    const useStreaming = config.stream ?? true;

    let output: string;
    let generationId: string | undefined;
    let usage: UsageSummary | undefined;

    if (useStreaming) {
      const result = await executeStreaming(apiKey, config, messages, ctx.onLog);
      output = result.output;
      generationId = result.generationId;
      usage = result.usage;
    } else {
      const result = await executeNonStreaming(apiKey, config, messages, ctx.onLog);
      output = result.output;
      generationId = result.generationId;
      usage = result.usage;
    }

    let costUsd: number | null = null;
    if (generationId) {
      costUsd = await fetchGenerationCost(generationId, apiKey);
    }

    return {
      exitCode: 0,
      signal: null,
      timedOut: false,
      usage: usage ?? { inputTokens: 0, outputTokens: 0 },
      model: config.model || "openrouter/auto",
      provider: "openrouter",
      biller: "openrouter",
      billingType: "api",
      costUsd,
      sessionParams: generationId ? { lastGenerationId: generationId } : null,
      sessionDisplayId: generationId ?? null,
      sessionId: generationId ?? null,
    };
  } catch (err: any) {
    const errorMessage = err?.message || String(err);
    await ctx.onLog("stderr", `[openrouter] Error: ${errorMessage}\n`);

    return {
      exitCode: 1,
      signal: null,
      timedOut: false,
      errorMessage,
      errorCode: "OPENROUTER_ERROR",
      usage: { inputTokens: 0, outputTokens: 0 },
    };
  }
}
