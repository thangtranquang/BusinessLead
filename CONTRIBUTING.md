# Contributing to Prospex

Thank you for your interest in contributing to Prospex — the open-source AI GTM automation platform!

## Getting Started

### Prerequisites

- Node.js 22 LTS
- pnpm 9+ — `npm install -g pnpm`
- Docker Desktop (for PostgreSQL + Redis)

### Local Setup

```bash
git clone https://github.com/asiifdev/business-leads-ai-automation.git
cd business-leads-ai-automation

pnpm install

# Copy and configure env
cp .env.example apps/api/.env
cp .env.example packages/database/.env
# Edit apps/api/.env with DATABASE_URL, JWT_SECRET, OPENAI_API_KEY

# Start infrastructure
docker compose up -d

# Push database schema
pnpm --filter @prospex/database db:push

# Start dev servers
pnpm --filter @prospex/api dev      # API on :3001
pnpm --filter @prospex/web dev      # Dashboard on :3000
```

Swagger docs: `http://localhost:3001/api/docs`

## Project Structure

```
apps/
├── api/         # NestJS 10 REST API
├── web/         # Next.js 16 dashboard
└── marketing/   # Landing page
packages/
├── database/    # Prisma schema
└── types/       # Shared TypeScript types
```

## What We Welcome

- Bug fixes
- New integrations (WhatsApp, Gmail, Telegram, webhook)
- UI improvements
- Performance optimizations
- Documentation improvements
- Tests

## What We Don't Accept

- Features designed for spam or bulk unsolicited messaging, or that remove the human approval step before a message is sent
- Bypassing rate limits or ToS of scraped services
- Privacy-violating data collection

## Development Guidelines

### Code Style

- TypeScript everywhere — no `any` unless absolutely unavoidable
- NestJS conventions for backend (services, controllers, DTOs)
- React Server Components where possible in Next.js
- Tailwind CSS + shadcn/ui for UI components

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(leads): add bulk CRM status update
fix(auth): handle expired JWT gracefully
docs: update quickstart in README
```

### Before Opening a PR

1. Run `pnpm --filter @prospex/api exec tsc --noEmit` — zero TS errors
2. Run `pnpm --filter @prospex/web exec tsc --noEmit` — zero TS errors
3. Run `pnpm --filter @prospex/api test`, all tests must pass
4. Test the happy path manually in the browser. If you touched sending or inbound handling, also run `apps/api/scripts/pipeline-check.ts` (see `docs/architecture.md`)
5. Add new UI text to the English dictionary and to the Vietnamese one (see [Translations and languages](#translations-and-languages))
6. Update `docs/USER_GUIDE.md` (written in Vietnamese; quote the on-screen labels exactly as they appear in `vi.ts`) (and `docs/whatsapp-outbox.md` for sending changes) if you changed user-facing behavior

## Translations and languages

The interface has two languages, English and Vietnamese. The AI output has the same two (`vietnamese`, `english`), chosen per campaign.

- **English is the source of truth.** Add every new string to `apps/web/src/lib/i18n/en.ts` (or the matching `features-<area>.en.ts`) first. The Vietnamese dictionaries (`vi.ts`, `features-<area>.vi.ts`) are typed `Record<keyof typeof <english>, string>`, so a missing key fails `tsc`. Vietnamese must define every key; do not leave English text in it (product names such as Prospex, WhatsApp, Outbox, Pipeline and CRM stay).
- **Placeholders** such as `{n}` and `{name}` must be the same set in both languages; their position may change. Vietnamese has no plural form, so a `_plural` key carries the same wording as the singular one.
- **Use the glossary.** [docs/i18n-vi-glossary.md](docs/i18n-vi-glossary.md) fixes one Vietnamese term per product concept (khách hàng tiềm năng, chiến dịch, bản nháp, duyệt, ...), the register (`bạn` in the interface, `anh/chị` for the customer in AI text), sentence case, and the words that must never stay in Indonesian. Follow it, and add new terms to it.
- **Run the parity spec** after touching a dictionary: `npx playwright test tests/e2e/i18n-dictionaries.spec.ts`. It checks the key sets, the placeholders, empty values and leftover Indonesian words.
- **Dates, numbers and relative times** go through `useFormat()` (`apps/web/src/lib/i18n/use-format.ts`), never a bare `toLocaleString()` or a hard-coded locale.
- **Machine translation is not enough.** Vietnamese text that has not been read by a native speaker is listed as pending in the glossary; say so in your PR.
- **Adding a language** (for example a third output language): add the value in `apps/api/src/common/language.ts`, then add a key to every `Record<OutputLanguage, ...>` table (the compiler lists them; see "Output language" in [docs/architecture.md](docs/architecture.md)), a prompt block in `OUTPUT_RULES`, opt-out phrases and reply-intent patterns (keep them linear and unit-tested with hostile input), a web dictionary pair and a `Lang` value. English prompts must stay byte-identical: `ai/prompt-snapshots.test.ts` fails if you change one without naming the reason.
- **AI text in a new language must be checked in code**, not only prompted: add the language's checks next to the existing ones (`outreach-check.ts`, `ai/orthography.ts`, `messaging/reply-plan.ts`) and mark anything tested only with canned outputs as **Simulated** in [docs/features.md](docs/features.md).

## Pull Request Template

```markdown
## What does this PR do?

Brief description.

## Type
- [ ] Bug fix
- [ ] New feature
- [ ] Refactor
- [ ] Documentation

## Testing
- [ ] Tested locally end-to-end
- [ ] TypeScript check passes
- [ ] No breaking changes to existing API

## Screenshots (if UI change)
```

## Reporting Issues

Include:
- Steps to reproduce
- Expected vs actual behavior
- Node.js version, OS
- Relevant logs or screenshots

For security vulnerabilities, email directly rather than opening a public issue.

## Code of Conduct

Be respectful, constructive, and inclusive. We follow the [Contributor Covenant](https://www.contributor-covenant.org/).

---

**Every contribution, big or small, makes Prospex better for business owners worldwide. Thank you!**


## License of contributions

Prospex is licensed under AGPL-3.0-or-later and also offered under a [commercial license](COMMERCIAL-LICENSE.md). By opening a pull request you confirm that you wrote the change (or may submit it) and that you license it under the AGPL-3.0 and allow the project owner to also distribute it under the commercial license.
