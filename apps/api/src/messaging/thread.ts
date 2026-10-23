/**
 * The conversation as the reply writer sees it. People answer in several quick bubbles ("boleh", "kirim aja", "harganya?"), so the
 * bubbles written together are answered together. But only bubbles written together: a shop's canned greeting from half an hour
 * earlier, or yesterday's chat, is history, never part of "what they just said".
 */
import { ME_PREFIX, speakerLine } from "../common/conversation-markers";
import { capThenNfc } from "../common/text";

export interface ThreadLine { mine: boolean; text: string; at: number }

/** Bubbles this close to the next one belong to the same answer. */
export const SAME_ANSWER_MS = 3 * 60_000;
const MAX_BUBBLE = 500;
const HISTORY_LINES = 6;

export function buildThread(lines: ThreadLine[], latest: string): { history: string; incoming: string } {
  const sorted = [...lines].sort((a, b) => a.at - b.at);
  let cut = sorted.length;
  while (cut > 0 && !sorted[cut - 1].mine && (cut === sorted.length || sorted[cut].at - sorted[cut - 1].at <= SAME_ANSWER_MS)) cut--;
  const bubble = (text: string) => capThenNfc(text.trim(), MAX_BUBBLE);
  const burst = sorted.slice(cut).map((l) => bubble(l.text)).filter(Boolean);
  const earlier = sorted.slice(0, cut).slice(-HISTORY_LINES);
  return {
    // every line of a bubble carries its speaker, so a customer line written as "Me: ..." stays the customer's
    history: earlier.map((l) => speakerLine(l.mine, bubble(l.text))).join("\n"),
    incoming: burst.length ? burst.join("\n") : bubble(latest),
  };
}

/** The text of every line of ours in a history built by `buildThread`, oldest first (a customer line is labelled `Them:`, never `Me:`). */
export function ownLines(history: string): string[] {
  return typeof history === "string" ? history.split("\n").filter((l) => l.startsWith(ME_PREFIX)).map((l) => l.slice(ME_PREFIX.length).trim()) : [];
}

/** The text of our own last line in a history built by `buildThread` (a line the customer wrote can never start with our label). */
export function lastOwnLine(history: string): string {
  const lines = ownLines(history);
  return lines.length ? lines[lines.length - 1] : "";
}

/** One message of a lead's conversation, from either side. `auto` marks a shop's automatic message (not a person speaking). */
export interface ConversationMessage { mine: boolean; at: number; text: string; auto?: boolean }

export interface ConversationState {
  /** When they last said something a person said (automatic messages do not count). */
  newestReply: number | null;
  /** When we last wrote to them, from Prospex or from the owner's phone. */
  newestOwn: number | null;
  /** The owner wrote after their last reply: nothing is waiting for an answer. */
  answered: boolean;
  history: string;
  /** What they just said when they spoke last; empty once the owner has written after them (use `theirLast` then). */
  incoming: string;
  /** The last things they wrote together (bubbles within the same-answer window), whoever spoke after them. What their last words meant. */
  theirLast: string;
}

/**
 * Who said what, in order, and whether the last word is theirs. Used when a message arrives, when a draft is about to be
 * written, and when the pipeline is re-read, so all three agree on "is anyone waiting for an answer?".
 */
export function analyzeConversation(messages: ConversationMessage[], latest = ""): ConversationState {
  const people = messages.filter((m) => !m.mine && !m.auto);
  const newestReply = people.length ? Math.max(...people.map((m) => m.at)) : null;
  const own = messages.filter((m) => m.mine);
  const newestOwn = own.length ? Math.max(...own.map((m) => m.at)) : null;
  const t = buildThread(people.length || own.length ? messages.filter((m) => m.mine || !m.auto).map((m) => ({ mine: m.mine, at: m.at, text: m.text })) : [], latest);
  const all = messages.filter((m) => m.mine || !m.auto).sort((a, b) => a.at - b.at);
  let last = -1;
  for (let i = all.length - 1; i >= 0; i--) if (!all[i].mine) { last = i; break; }
  let start = last;
  while (last >= 0 && start > 0 && !all[start - 1].mine && all[start].at - all[start - 1].at <= SAME_ANSWER_MS) start--;
  const theirLast = last >= 0 ? all.slice(start, last + 1).map((m) => capThenNfc(m.text.trim(), MAX_BUBBLE)).filter(Boolean).join("\n") : "";
  return { newestReply, newestOwn, answered: newestReply !== null && newestOwn !== null && newestOwn > newestReply, history: t.history, incoming: t.incoming, theirLast };
}
