import { applyDecorators } from "@nestjs/common";
import { ApiProperty } from "@nestjs/swagger";
import { IsIn, ValidateIf } from "class-validator";

/**
 * The one definition of "the language a draft, brief or email is written in" (FR-16). Every module that branches on
 * language imports this, never a string comparison of its own.
 */
export const OUTPUT_LANGUAGES = Object.freeze(["vietnamese", "english"] as const);
export type OutputLanguage = (typeof OUTPUT_LANGUAGES)[number];

export const DEFAULT_OUTPUT_LANGUAGE: OutputLanguage = "vietnamese";

/**
 * Turns whatever is stored or received into a supported value. Strict: only the exact string "vietnamese" gives
 * Vietnamese; everything else (the legacy "indonesian", null, padded or upper-case text, objects, prompt-injection
 * text) gives English. No trim, no lower-casing, no String(): a stored value must never be coerced into a match.
 */
export function toOutputLanguage(value: unknown): OutputLanguage {
  return value === "vietnamese" ? "vietnamese" : "english";
}

/**
 * For a value that came in with a request: omitted means the default (Vietnamese, FR-18); anything that was supplied is
 * normalised, so a null, a legacy "indonesian" or hostile text reads as English and is never written or prompted raw.
 */
export function outputLanguageOrDefault(value: unknown): OutputLanguage {
  return value === undefined ? DEFAULT_OUTPUT_LANGUAGE : toOutputLanguage(value);
}

/**
 * The only way a language name enters a prompt. Always index it with a value that went through `toOutputLanguage`,
 * never with raw input: the table is frozen and has exactly two own keys, so the lookup cannot reach a prototype member.
 */
export const LANGUAGE_LABEL: Readonly<Record<OutputLanguage, string>> = Object.freeze({
  vietnamese: "Vietnamese (tiếng Việt)",
  english: "English",
});

/**
 * DTO decorator for every request field named `language` (FR-17): optional, but an explicit null, "", wrong case or
 * legacy value is a 400 (a plain @IsOptional() would skip the check for null). The validator message names the
 * allowed values and never echoes the rejected one.
 */
export function IsOutputLanguage(): PropertyDecorator {
  return applyDecorators(
    ValidateIf((_object: unknown, value: unknown) => value !== undefined),
    IsIn(OUTPUT_LANGUAGES, { message: ({ property }) => `${property} must be one of: ${OUTPUT_LANGUAGES.join(", ")}` }),
    ApiProperty({ enum: [...OUTPUT_LANGUAGES], required: false, default: DEFAULT_OUTPUT_LANGUAGE }),
  );
}
