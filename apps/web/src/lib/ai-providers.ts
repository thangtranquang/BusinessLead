/** Presets for Settings → AI Configuration. Pure: no React, no network, no secrets. */

export type ProviderId = "openai" | "gemini" | "openrouter" | "ollama" | "custom";

export interface AiProvider {
  id: ProviderId;
  label: string;
  /** Empty means the OpenAI default endpoint. */
  baseURL: string;
  model: string;
  embeddingModel: string;
  keyPlaceholder: string;
  /** Host that identifies this provider inside a base URL. */
  host?: string;
}

export const AI_PROVIDERS: AiProvider[] = [
  { id: "openai", label: "OpenAI", baseURL: "", model: "gpt-4o-mini", embeddingModel: "text-embedding-3-small", keyPlaceholder: "sk-...", host: "api.openai.com" },
  {
    id: "gemini",
    label: "Google Gemini",
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
    model: "gemini-2.5-flash",
    embeddingModel: "gemini-embedding-001",
    keyPlaceholder: "AIza...",
    host: "generativelanguage.googleapis.com",
  },
  { id: "openrouter", label: "OpenRouter", baseURL: "https://openrouter.ai/api/v1", model: "openai/gpt-4o-mini", embeddingModel: "openai/text-embedding-3-small", keyPlaceholder: "sk-or-...", host: "openrouter.ai" },
  { id: "ollama", label: "Ollama (local)", baseURL: "http://localhost:11434/v1", model: "llama3.1", embeddingModel: "nomic-embed-text", keyPlaceholder: "ollama" },
  { id: "custom", label: "Custom (OpenAI-compatible)", baseURL: "", model: "", embeddingModel: "", keyPlaceholder: "" },
];

export function providerById(id: ProviderId): AiProvider | undefined {
  return AI_PROVIDERS.find((p) => p.id === id);
}

/** Which provider a key looks like, from its prefix; undefined when unsure. */
export function providerForKey(key: string | null | undefined): AiProvider | undefined {
  const k = typeof key === "string" ? key.trim() : "";
  if (!k) return undefined;
  if (k.startsWith("AIza")) return providerById("gemini");
  if (k.startsWith("sk-or-")) return providerById("openrouter");
  if (k.startsWith("sk-")) return providerById("openai");
  return undefined;
}

/** Which provider a base URL belongs to; matches the host only. */
export function providerFromBaseUrl(baseURL: string | null | undefined): AiProvider {
  const raw = typeof baseURL === "string" ? baseURL.trim() : "";
  if (!raw) return providerById("openai")!;
  let host: string;
  try {
    host = new URL(raw).hostname.toLowerCase();
  } catch {
    return providerById("custom")!;
  }
  if (host === "localhost" || host === "127.0.0.1" || host === "[::1]") return providerById("ollama")!;
  return AI_PROVIDERS.find((p) => p.host === host) ?? providerById("custom")!;
}

/** A key that clearly belongs to another provider than the base URL: the mistake of a Gemini key with an empty Base URL. */
export function keyMismatch(key: string, baseURL: string): { suggest: ProviderId } | null {
  const fromKey = providerForKey(key);
  if (!fromKey || fromKey.id === "openai") return null;
  const current = providerFromBaseUrl(baseURL);
  if (current.id === fromKey.id) return null;
  if (current.id === "openai") return { suggest: fromKey.id };
  return null;
}
