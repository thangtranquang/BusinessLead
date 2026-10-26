import test from "node:test";
import assert from "node:assert/strict";
import { defaultReasoningEffort, pickAiSettings } from "./ai-client.service";

const server = { chatModel: "m", embeddingModel: "e" };

test("a Gemini base URL asks for low thinking, any other provider sends nothing", () => {
  assert.equal(defaultReasoningEffort("https://generativelanguage.googleapis.com/v1beta/openai/"), "low");
  assert.equal(defaultReasoningEffort(undefined), undefined);
  assert.equal(defaultReasoningEffort("https://api.openai.com/v1"), undefined);
  assert.equal(defaultReasoningEffort("https://generativelanguage.googleapis.com.evil.example/v1"), undefined);
  assert.equal(defaultReasoningEffort("not a url"), undefined);
});

test("only a workspace key pointed at Gemini gets it", () => {
  const gem = pickAiSettings({ apiKey: "k", baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/" }, true, server);
  assert.equal(gem.reasoningEffort, "low");
  assert.equal(pickAiSettings({ apiKey: "k" }, true, server).reasoningEffort, undefined);
});
