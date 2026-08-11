import axios from 'axios';
import { ModelConfig } from './ModelRegistry';

// Multi-provider chat client. A model id may be prefixed with a provider name
// ("groq:llama-3.3-70b-versatile") to route to that provider's own API — bypassing
// OpenRouter's account-level free-tier cap entirely, since Groq's free tier is a
// completely separate, far more generous allowance (30 req/min, up to 14,400 req/day,
// no card required, vs OpenRouter's 20 req/min / 50 req/day before a paid top-up).
// An id with no recognized prefix is treated as a plain OpenRouter model id (OpenRouter's
// own ids use "/", never ":", so there's no ambiguity) — this keeps every model id already
// in the DB working unchanged.
interface ProviderSpec {
  baseUrl: string;
  apiKeyEnv: string;
  label: string;
  extraHeaders?: () => Record<string, string>;
}

const PROVIDERS: Record<string, ProviderSpec> = {
  openrouter: {
    baseUrl: 'https://openrouter.ai/api/v1/chat/completions',
    apiKeyEnv: 'OPENROUTER_API_KEY',
    label: 'OpenRouter',
    extraHeaders: () => ({
      'HTTP-Referer': process.env.NEXTAUTH_URL || 'http://localhost:3000',
      'X-Title': 'StockOS Research Assistant',
    }),
  },
  groq: {
    baseUrl: 'https://api.groq.com/openai/v1/chat/completions',
    apiKeyEnv: 'GROQ_API_KEY',
    label: 'Groq',
  },
};

function resolveProvider(rawModelId: string): { spec: ProviderSpec; modelId: string } {
  const separatorIndex = rawModelId.indexOf(':');
  if (separatorIndex !== -1) {
    const prefix = rawModelId.slice(0, separatorIndex);
    const spec = PROVIDERS[prefix];
    if (spec) return { spec, modelId: rawModelId.slice(separatorIndex + 1) };
  }
  return { spec: PROVIDERS.openrouter, modelId: rawModelId };
}

export class LLMNotConfiguredError extends Error {
  constructor(providerLabel: string, envVar: string) {
    super(`${envVar} is not set — add it to .env to enable ${providerLabel} for the assistant.`);
    this.name = 'LLMNotConfiguredError';
  }
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

interface CallModelResult {
  content: string;
  usage?: TokenUsage;
}

async function callModel(rawModelId: string, messages: ChatMessage[], config: ModelConfig): Promise<CallModelResult> {
  const { spec, modelId } = resolveProvider(rawModelId);
  const apiKey = process.env[spec.apiKeyEnv];
  if (!apiKey) throw new LLMNotConfiguredError(spec.label, spec.apiKeyEnv);

  const { data } = await axios.post(
    spec.baseUrl,
    {
      model: modelId,
      messages,
      temperature: config.temperature,
      max_tokens: config.maxTokens,
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...(spec.extraHeaders?.() || {}),
      },
      timeout: 30000,
    }
  );

  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || content.trim().length === 0) {
    throw new Error(`${spec.label} returned an empty response`);
  }

  // OpenAI-compatible response body — both providers here follow it. Absent/partial on some
  // models, so this stays optional rather than defaulting missing fields to 0 (which would
  // read as "confirmed zero cost" in the trace/usage ledger instead of "unknown").
  const usage = data?.usage
    ? {
        promptTokens: data.usage.prompt_tokens ?? 0,
        completionTokens: data.usage.completion_tokens ?? 0,
        totalTokens: data.usage.total_tokens ?? 0,
      }
    : undefined;

  return { content, usage };
}

export class LLMClient {
  /** Retries once against the config's fallback model (possibly a different provider
   * entirely) on a 4xx/5xx, timeout, or missing-key error — §07's fallback behavior,
   * now also the mechanism that lets a Groq rate-limit hit fail over to OpenRouter's
   * free router rather than failing the turn. */
  static async chat(messages: ChatMessage[], config: ModelConfig): Promise<{ content: string; modelUsed: string; usage?: TokenUsage }> {
    try {
      const { content, usage } = await callModel(config.modelId, messages, config);
      return { content, modelUsed: config.modelId, usage };
    } catch (err) {
      if (!config.fallbackModelId) throw err;
      console.warn(`[ASSISTANT] Model ${config.modelId} failed, retrying with fallback ${config.fallbackModelId}:`, (err as Error).message);
      const { content, usage } = await callModel(config.fallbackModelId, messages, config);
      return { content, modelUsed: config.fallbackModelId, usage };
    }
  }
}
