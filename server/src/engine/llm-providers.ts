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
  provider: "anthropic" | "openai" | "ollama" | "openrouter" | "custom" | "bedrock";
  model: string;
  api_key?: string; // Not needed for Ollama or Bedrock
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
    case "bedrock":
      return callBedrock(config, messages);
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

// ── Bedrock (uses IAM credentials from EC2 instance role) ──

async function callBedrock(config: LLMConfig, messages: LLMMessage[]): Promise<LLMResponse> {
  const { BedrockRuntimeClient, InvokeModelCommand } = await import("@aws-sdk/client-bedrock-runtime");

  const client = new BedrockRuntimeClient({ region: process.env.AWS_REGION || "us-east-1" });
  const modelId = config.model;

  // Separate system message
  const systemMsg = messages.find(m => m.role === "system");
  const chatMessages = messages.filter(m => m.role !== "system");

  let body: string;
  let parseResponse: (data: any) => { content: string; tokens: number };

  if (modelId.startsWith("anthropic.")) {
    // Anthropic models on Bedrock use Messages API format
    body = JSON.stringify({
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: 2048,
      system: systemMsg?.content || "",
      messages: chatMessages.map(m => ({ role: m.role, content: m.content })),
      temperature: 0.8,
    });
    parseResponse = (data) => ({
      content: data.content?.filter((b: any) => b.type === "text").map((b: any) => b.text).join("") || "",
      tokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
    });
  } else if (modelId.startsWith("amazon.nova")) {
    // Amazon Nova models use their own format
    body = JSON.stringify({
      messages: [
        ...(systemMsg ? [{ role: "user", content: [{ text: `System: ${systemMsg.content}` }] }] : []),
        ...chatMessages.map(m => ({ role: m.role, content: [{ text: m.content }] })),
      ],
      inferenceConfig: { maxTokens: 2048, temperature: 0.8 },
    });
    parseResponse = (data) => ({
      content: data.output?.message?.content?.[0]?.text || "",
      tokens: (data.usage?.inputTokens || 0) + (data.usage?.outputTokens || 0),
    });
  } else if (modelId.startsWith("meta.llama")) {
    // Llama models on Bedrock
    const prompt = messages.map(m => {
      if (m.role === "system") return `<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n${m.content}<|eot_id|>`;
      if (m.role === "user") return `<|start_header_id|>user<|end_header_id|>\n${m.content}<|eot_id|>`;
      return `<|start_header_id|>assistant<|end_header_id|>\n${m.content}<|eot_id|>`;
    }).join("") + "<|start_header_id|>assistant<|end_header_id|>\n";

    body = JSON.stringify({ prompt, max_gen_len: 2048, temperature: 0.8 });
    parseResponse = (data) => ({
      content: data.generation || "",
      tokens: (data.prompt_token_count || 0) + (data.generation_token_count || 0),
    });
  } else if (modelId.startsWith("mistral.")) {
    // Mistral on Bedrock uses chat format
    body = JSON.stringify({
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      max_tokens: 2048,
      temperature: 0.8,
    });
    parseResponse = (data) => ({
      content: data.choices?.[0]?.message?.content || "",
      tokens: (data.usage?.total_tokens || 0),
    });
  } else {
    // Generic: try Messages API format
    body = JSON.stringify({
      messages: messages.map(m => ({ role: m.role, content: [{ text: m.content }] })),
      inferenceConfig: { maxTokens: 2048, temperature: 0.8 },
    });
    parseResponse = (data) => ({
      content: data.output?.message?.content?.[0]?.text || data.choices?.[0]?.message?.content || "",
      tokens: 0,
    });
  }

  const command = new InvokeModelCommand({
    modelId,
    contentType: "application/json",
    accept: "application/json",
    body,
  });

  const response = await client.send(command);
  const responseBody = JSON.parse(new TextDecoder().decode(response.body));
  const parsed = parseResponse(responseBody);

  return {
    content: parsed.content,
    model: modelId,
    tokens_used: parsed.tokens,
  };
}

// ── Preset configs for common setups ──

// Free tier models (via Bedrock, we pay)
export const FREE_TIER_MODELS: Record<string, { model: string; label: string; costPerDay: string }> = {
  "nova-micro":   { model: "amazon.nova-micro-v1:0",              label: "Amazon Nova Micro",  costPerDay: "~$0.07" },
  "nova-lite":    { model: "amazon.nova-lite-v1:0",               label: "Amazon Nova Lite",   costPerDay: "~$0.12" },
  "llama-8b":     { model: "meta.llama3-1-8b-instruct-v1:0",      label: "Llama 3.1 8B",       costPerDay: "~$0.35" },
  "mistral-7b":   { model: "mistral.mistral-7b-instruct-v0:2",    label: "Mistral 7B",         costPerDay: "~$0.25" },
  "haiku":        { model: "anthropic.claude-3-5-haiku-20241022-v1:0", label: "Claude Haiku",   costPerDay: "~$0.80" },
  "llama-70b":    { model: "meta.llama3-1-70b-instruct-v1:0",     label: "Llama 3.1 70B",      costPerDay: "~$1.10" },
};

export const LLM_PRESETS: Record<string, LLMConfig> = {
  // Bedrock free tier
  "bedrock-nova-micro": { provider: "bedrock", model: "amazon.nova-micro-v1:0" },
  "bedrock-nova-lite":  { provider: "bedrock", model: "amazon.nova-lite-v1:0" },
  "bedrock-llama-8b":   { provider: "bedrock", model: "meta.llama3-1-8b-instruct-v1:0" },
  "bedrock-mistral-7b": { provider: "bedrock", model: "mistral.mistral-7b-instruct-v0:2" },
  "bedrock-haiku":      { provider: "bedrock", model: "anthropic.claude-3-5-haiku-20241022-v1:0" },
  "bedrock-llama-70b":  { provider: "bedrock", model: "meta.llama3-1-70b-instruct-v1:0" },

  // Cloud models (BYO key)
  "claude-sonnet": { provider: "anthropic", model: "claude-sonnet-4-20250514" },
  "claude-haiku": { provider: "anthropic", model: "claude-haiku-4-5-20251001" },
  "gpt-4o": { provider: "openai", model: "gpt-4o" },
  "gpt-4o-mini": { provider: "openai", model: "gpt-4o-mini" },

  // Local via Ollama
  "llama3.1-8b": { provider: "ollama", model: "llama3.1:8b" },
  "llama3.1-70b": { provider: "ollama", model: "llama3.1:70b" },
  "mistral-7b": { provider: "ollama", model: "mistral" },

  // Via OpenRouter
  "openrouter-claude": { provider: "openrouter", model: "anthropic/claude-sonnet-4-20250514" },
  "openrouter-gpt4o": { provider: "openrouter", model: "openai/gpt-4o" },

  // xAI (Grok)
  "grok": { provider: "custom", model: "grok-3", base_url: "https://api.x.ai/v1/chat/completions" },
};
