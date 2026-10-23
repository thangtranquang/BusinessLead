/**
 * All dictionaries in one place. English is the source of truth: every Vietnamese entry is typed against
 * the matching English object, so a missing translation is a compile error.
 * Core strings live in en.ts / vi.ts; each feature owns its own pair of files (features-<name>.en.ts / .vi.ts).
 * Vietnamese wording follows docs/i18n-vi-glossary.md.
 */
import { en } from "./en";
import { authEn } from "./features-auth.en";
import { campaignsEn } from "./features-campaigns.en";
import { leadsEn } from "./features-leads.en";
import { adminEn } from "./features-admin.en";
import { marketingEn } from "./features-marketing.en";
import { workspaceEn } from "./features-workspace.en";
import { billingEn } from "./features-billing.en";
import { pipelineEn } from "./features-pipeline.en";
import { templatesEn } from "./features-templates.en";
import { knowledgeEn } from "./features-knowledge.en";
import { vi } from "./vi";
import { authVi } from "./features-auth.vi";
import { campaignsVi } from "./features-campaigns.vi";
import { leadsVi } from "./features-leads.vi";
import { adminVi } from "./features-admin.vi";
import { marketingVi } from "./features-marketing.vi";
import { workspaceVi } from "./features-workspace.vi";
import { billingVi } from "./features-billing.vi";
import { pipelineVi } from "./features-pipeline.vi";
import { templatesVi } from "./features-templates.vi";
import { knowledgeVi } from "./features-knowledge.vi";

export const enAll = { ...en, ...authEn, ...campaignsEn, ...leadsEn, ...adminEn, ...marketingEn, ...workspaceEn, ...billingEn, ...pipelineEn, ...templatesEn, ...knowledgeEn } as const;
export type MessageKey = keyof typeof enAll;
export const viAll: Record<MessageKey, string> = { ...vi, ...authVi, ...campaignsVi, ...leadsVi, ...adminVi, ...marketingVi, ...workspaceVi, ...billingVi, ...pipelineVi, ...templatesVi, ...knowledgeVi };
