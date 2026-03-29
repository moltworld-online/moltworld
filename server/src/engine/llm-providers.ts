/**
 * LLM Provider abstraction - supports multiple backends per agent.
 *
 * Each agent can use a different LLM:
 * - Anthropic (Claude)
 * - OpenAI (GPT-4, etc.)
 * - Ollama (local open-source models: Llama, Mistral, Qwen, etc.)
 * - OpenRouter (access to many models via one API)
 * - Any OpenAI-compatible API (Grok/xAI, Together, Groq, etc.)
 *
 * Users configure their agent's LLM at deployment time.
 */

export interface LLMConfig {
  provider: "anthropic" | "openai" | "ollama" | "openrouter" | "custom";
  model: string;
  api_key?: string; // Not needed for Ollama
  base_url?: string; // For Ollama or custom endpoints
}

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMResponse {
  content: string;
  model: string;
  tokens_used: number;
}

/**
 * Call any LLM with a unified interface.
 * All providers are called via fetch to avoid heavy SDK dependencies.
 */
export async function callLLM(config: LLMConfig, messages: LLMMessage[]): Promise<LLMResponse> {
  switch (config.provider) {
    case "anthropic":
      return callAnthropic(config, messages);
    case "openai":
      return callOpenAICompatible(
        "https://api.openai.com/v1/chat/completions",
        config.api_key!,
        config.model,
        messages
      );
    case "ollama":
      return callOpenAICompatible(
        `${config.base_url || "http://localhost:11434"}/v1/chat/completions`,
        "ollama", // Ollama doesn't need a real key
        config.model,
        messages
      );
    case "openrouter":
      return callOpenAICompatible(
        "https://openrouter.ai/api/v1/chat/completions",
        config.api_key!,
        config.model,
        messages
      );
    case "custom":
      return callOpenAICompatible(
        config.base_url!,
        config.api_key || "",
        config.model,
        messages
      );
    default:
      throw new Error(`Unknown LLM provider: ${config.provider}`);
  }
}

// ── Anthropic (Messages API) ──

async function callAnthropic(config: LLMConfig, messages: LLMMessage[]): Promise<LLMResponse> {
  const apiKey = config.api_key || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Anthropic API key required (set ANTHROPIC_API_KEY or provide in config)");

  // Separate system message from user/assistant messages
  const systemMsg = messages.find((m) => m.role === "system");
  const chatMessages = messages.filter((m) => m.role !== "system");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: config.model || "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: systemMsg?.content || "",
      messages: chatMessages.map((m) => ({ role: m.role, content: m.content })),
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${errText}`);
  }

  const data = await res.json() as {
    content: Array<{ type: string; text: string }>;
    model: string;
    usage: { input_tokens: number; output_tokens: number };
  };

  return {
    content: data.content.filter((b) => b.type === "text").map((b) => b.text).join(""),
    model: data.model,
    tokens_used: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
  };
}

// ── OpenAI-Compatible (works for OpenAI, Ollama, OpenRouter, Grok, Together, Groq, etc.) ──

async function callOpenAICompatible(
  baseUrl: string,
  apiKey: string,
  model: string,
  messages: LLMMessage[],
): Promise<LLMResponse> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (apiKey && apiKey !== "ollama") {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  const res = await fetch(baseUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      max_tokens: 4096,
      temperature: 0.8,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`LLM API error ${res.status} (${model}): ${errText}`);
  }

  const data = await res.json() as {
    choices: Array<{ message: { content: string } }>;
    model: string;
    usage?: { total_tokens: number };
  };

  return {
    content: data.choices[0]?.message?.content || "",
    model: data.model || model,
    tokens_used: data.usage?.total_tokens || 0,
  };
}

// ── Preset configs for common setups ──

export const LLM_PRESETS: Record<string, LLMConfig> = {
  // Cloud models
  "claude-sonnet": { provider: "anthropic", model: "claude-sonnet-4-20250514" },
  "claude-haiku": { provider: "anthropic", model: "claude-haiku-4-5-20251001" },
  "gpt-4o": { provider: "openai", model: "gpt-4o" },
  "gpt-4o-mini": { provider: "openai", model: "gpt-4o-mini" },

  // Local via Ollama
  "llama3.1-8b": { provider: "ollama", model: "llama3.1:8b" },
  "llama3.1-70b": { provider: "ollama", model: "llama3.1:70b" },
  "mistral-7b": { provider: "ollama", model: "mistral" },
  "qwen2.5-32b": { provider: "ollama", model: "qwen2.5:32b" },
  "gemma2-27b": { provider: "ollama", model: "gemma2:27b" },
  "deepseek-r1-8b": { provider: "ollama", model: "deepseek-r1:8b" },

  // Via OpenRouter (access everything with one key)
  "openrouter-claude": { provider: "openrouter", model: "anthropic/claude-sonnet-4-20250514" },
  "openrouter-gpt4o": { provider: "openrouter", model: "openai/gpt-4o" },
  "openrouter-llama70b": { provider: "openrouter", model: "meta-llama/llama-3.1-70b-instruct" },

  // xAI (Grok) - OpenAI-compatible API
  "grok": { provider: "custom", model: "grok-3", base_url: "https://api.x.ai/v1/chat/completions" },
};
