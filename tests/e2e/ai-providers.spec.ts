import { test, expect } from "@playwright/test";
import { AI_PROVIDERS, providerById, providerFromBaseUrl, providerForKey, keyMismatch } from "../../apps/web/src/lib/ai-providers";

/** Browser-less checks of the pure AI provider presets used by Settings → AI Configuration. */

test.describe("AI provider presets", () => {
  test("every preset has the fields the form fills, and https URLs for hosted providers", () => {
    const ids = AI_PROVIDERS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of AI_PROVIDERS) {
      expect(p.label.length).toBeGreaterThan(2);
      if (p.id === "custom") continue;
      expect(typeof p.baseURL).toBe("string");
      expect(typeof p.model).toBe("string");
      expect(typeof p.embeddingModel).toBe("string");
      if (p.id !== "ollama") expect(p.baseURL === "" || p.baseURL.startsWith("https://")).toBe(true);
    }
    expect(providerById("gemini")?.baseURL).toBe("https://generativelanguage.googleapis.com/v1beta/openai/");
    expect(providerById("gemini")?.model).toBe("gemini-2.5-flash");
    expect(providerById("gemini")?.embeddingModel).toBe("gemini-embedding-001");
    expect(providerById("openai")?.baseURL).toBe("");
    expect(providerById("nope" as never)).toBeUndefined();
  });

  test("a key shape points at its provider", () => {
    expect(providerForKey("AIzaSyExampleExampleExampleExample0000000")?.id).toBe("gemini");
    expect(providerForKey("sk-or-v1-example")?.id).toBe("openrouter");
    expect(providerForKey("sk-proj-example")?.id).toBe("openai");
    expect(providerForKey("sk-example")?.id).toBe("openai");
    expect(providerForKey("")).toBeUndefined();
    expect(providerForKey("   ")).toBeUndefined();
    expect(providerForKey("something-else")).toBeUndefined();
    expect(providerForKey(null as never)).toBeUndefined();
  });

  test("a base URL points at its provider (host match only)", () => {
    expect(providerFromBaseUrl("https://generativelanguage.googleapis.com/v1beta/openai/")?.id).toBe("gemini");
    expect(providerFromBaseUrl("https://openrouter.ai/api/v1")?.id).toBe("openrouter");
    expect(providerFromBaseUrl("")?.id).toBe("openai");
    expect(providerFromBaseUrl("https://api.openai.com/v1")?.id).toBe("openai");
    expect(providerFromBaseUrl("http://localhost:11434/v1")?.id).toBe("ollama");
    expect(providerFromBaseUrl("https://my-proxy.example.com/v1")?.id).toBe("custom");
    // the provider name inside a path or a look-alike host never counts
    expect(providerFromBaseUrl("https://evil.example.com/generativelanguage.googleapis.com")?.id).toBe("custom");
    expect(providerFromBaseUrl("https://generativelanguage.googleapis.com.evil.example/v1")?.id).toBe("custom");
    expect(providerFromBaseUrl("not a url")?.id).toBe("custom");
  });

  test("the mismatch warning fires for a Gemini key with the OpenAI (empty) base URL, the exact mistake seen in practice", () => {
    expect(keyMismatch("AIzaSyExampleExampleExampleExample0000000", "")?.suggest).toBe("gemini");
    expect(keyMismatch("AIzaSyExampleExampleExampleExample0000000", "https://api.openai.com/v1")?.suggest).toBe("gemini");
    expect(keyMismatch("sk-or-v1-example", "")?.suggest).toBe("openrouter");
    // no warning when they agree, when there is no key, when the key shape is unknown, or for a custom/local base URL
    expect(keyMismatch("AIzaSyExampleExampleExampleExample0000000", "https://generativelanguage.googleapis.com/v1beta/openai/")).toBeNull();
    expect(keyMismatch("sk-proj-example", "")).toBeNull();
    expect(keyMismatch("", "")).toBeNull();
    expect(keyMismatch("something-else", "")).toBeNull();
    expect(keyMismatch("AIzaSyExampleExampleExampleExample0000000", "https://my-proxy.example.com/v1")).toBeNull();
    expect(keyMismatch("AIzaSyExampleExampleExampleExample0000000", "http://localhost:11434/v1")).toBeNull();
  });

  test("the module is pure: no secrets, no network, no React, no API imports", async () => {
    const fs = await import("node:fs");
    const src = fs.readFileSync("apps/web/src/lib/ai-providers.ts", "utf8");
    expect(src).not.toMatch(/use client|from "react"|fetch\(|apps\/api|localStorage|AIzaSy[\w-]{20,}/);
  });
});
