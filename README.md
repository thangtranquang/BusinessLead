<div align="center">
  <h1>Prospex</h1>
  <p><strong>Open-source AI sales and marketing automation for local businesses.</strong></p>
<p>Discover business leads, enrich business information, draft personalized outreach with AI, review every message before sending, and manage follow-ups in one workflow.</p>
  <p><a href="https://alatpintar.id">🚀 Try Prospex</a> · <a href="#quickstart">⚙️ Self-host</a> · <a href="docs/whatsapp-outbox.md">📨 How sending works</a> · <a href="#roadmap">🗺️ Roadmap</a> · <a href="COMMERCIAL-LICENSE.md">📄 Commercial license</a></p>

  [![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](LICENSE)
  [![GitHub stars](https://img.shields.io/github/stars/asiifdev/business-leads-ai-automation?style=social)](https://github.com/asiifdev/business-leads-ai-automation/stargazers)
  [![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
  [![Next.js](https://img.shields.io/badge/Next.js-16-black.svg)](https://nextjs.org/)
  [![NestJS](https://img.shields.io/badge/NestJS-10-red.svg)](https://nestjs.com/)
  [![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-blue.svg)](https://www.postgresql.org/)
</div>

<p align="center">
  <img src="docs/screenshots/outbox.png" alt="Prospex Outbox: AI drafts waiting for review, each with Approve, Edit and Reject" width="860">
</p>

## Why Prospex exists

Selling to local businesses means hundreds of first messages and just as many follow-ups. Most tools either hide the work behind a bulk sender that gets numbers banned, or leave you to write everything yourself.

Prospex splits the job in two. The AI does the typing: it finds the leads, writes each draft, and drafts the replies and follow-ups. You do the deciding: every message waits in your Outbox until you approve it, and approved messages leave at a pace you set, one at a time.

> **Prefer not to run servers?** The hosted version at **[alatpintar.id](https://alatpintar.id)** runs Prospex for you. Self-hosting is free under the AGPL.

If Prospex is useful to you, a star helps other people find it.

## What you can do with it

| Step | What happens |
|------|--------------|
| **Understand your offer** | Give Prospex a website, a document (PDF, DOCX, Markdown, text) or pasted text. It reads the whole site (sitemap, `llms.txt`, linked pages), writes a Marketing Brief from what it finds, and fills in your campaign form for you to correct. What the sources do not say is listed as missing, not invented. |
| **Find** | Scrape Google Maps by business type and city with a headless browser, up to 2,000 leads per campaign. A typed city is searched where you asked (anchored on its coordinates, results outside about 50 km are dropped); "Seluruh Indonesia" becomes one search per city, biggest markets first, 40 or more results per search. Each lead carries the real Maps category, rating, review count, phone, website and coordinates. If scraping fails the campaign fails honestly: Prospex never makes up businesses. Each campaign has a market, Indonesia or Vietnam, see [Markets](#markets). |
| **Score** | A 0 to 100 ranking from signals in the listing (reachable by phone, rating weighted by review count, review volume) plus an AI judgement of how well the business fits your offer, with the reason shown. No hard-coded industry or city weights. |
| **Draft** | The AI writes the first message from the lead's real data, your own style, the matching angle from your brief and your knowledge base. WhatsApp messages say who you are and what you offer in the first sentence, in plain words, then one relevant point and one easy question. Emails open with a greeting, end with a closing line ("Trân trọng," in Vietnamese, "Best regards," in English) and can carry one link you set yourself. Each campaign writes in one output language, Vietnamese (the default) or English, see [Language](#language). Three openings rotate across a campaign so you can compare reply rates. |
| **One message for many leads** | Prefer to write it once? In the Outbox, pick a kind of business (for example every kebaya rental), choose the leads, write the message or let the AI write one for that kind of business, and Prospex makes one draft per lead in the review list. `{nama}` and `{kategori}` fill in each lead's own name and category. No AI call per lead, so hundreds of drafts take a second. |
| **Approve** | Read, edit, approve or reject each draft in the Outbox, shown as the WhatsApp bubble it will be (bold, italics, lists, the link card, the attached file). Attach a file or a link preview if you want one. Nothing is sent before this step. |
| **Organise** | Every lead is reachable: paged lists, search by name, address, phone, website, email, category or area, province, city and district worked out from the coordinates, and a map that shows all leads. |
| **Send** | Approved messages go out through WhatsApp one at a time: hourly and daily caps, quiet hours, random gaps, and a typing indicator before each one. Email works the same way through your own SMTP account, with an unsubscribe link in every message, and refuses to send at all while that link would point to your own computer ([docs/email-channel.md](docs/email-channel.md)). |
| **Track to closing** | The Pipeline page shows every stage with deal value, replies waiting for you, leads that went quiet, follow-ups due, results per campaign and why deals were lost. A deal is never closed automatically; you mark it won or lost. |
| **Reply and follow up** | A reply is read against the whole conversation, including what you typed on your own phone. It is classified (interested, wants a meeting, asked the price, question, pointed to another contact, not now, not interested), moves the lead forward in the pipeline, cancels pending follow-ups, flags it as waiting for you, and creates a polite reply draft written as a seller approaching a business, not as a boss. A shop's automatic greeting is recognised and ignored. An approved reply goes out right away, ahead of the cold messages. Leads that stay silent get up to two follow-up drafts, after 3 and 5 days. A recipient who writes STOP is never contacted again and the lead is closed as lost. |

Every feature, its purpose, its limits and how far it has been verified: [docs/features.md](docs/features.md), [editions](docs/editions.md).

### Screenshots

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/leads.png" alt="Leads table sorted by AI score, with priority and CRM status badges"><br><sub><b>Leads.</b> Scored, filterable by priority, status, province, city and district. List and map views.</sub></td>
    <td width="50%"><img src="docs/screenshots/lead-detail.png" alt="Lead detail: contact info, AI score breakdown with fit badge and factors, CRM notes"><br><sub><b>Lead detail.</b> Contact info, AI score breakdown (fit badge, reason and factors), email and call notes, and CRM notes — all in one page.</sub></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/screenshots/outbox.png" alt="Outbox with drafts waiting for review, Write drafts and Check follow-ups controls"><br><sub><b>Outbox.</b> Every message waits for your approval. WhatsApp and Email tabs, Review / Queue / Sent / Needs attention.</sub></td>
    <td width="50%"><img src="docs/screenshots/knowledge.png" alt="Knowledge base page with indexed sources and a test search panel"><br><sub><b>Knowledge base.</b> Facts, pricing and case studies the AI may draw on when writing drafts. Add any text; the AI only mentions what is here.</sub></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/screenshots/campaign-form.png" alt="Campaigns page with New campaign dialog"><br><sub><b>Campaigns.</b> Give it a website or documents; the AI fills the brief and says what it could not find.</sub></td>
    <td width="50%"><img src="docs/screenshots/marketing-brief.png" alt="Marketing Brief page"><br><sub><b>Marketing brief.</b> What you sell, to whom, what is proven, and what is still missing. Every section is editable.</sub></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/screenshots/ai-style.png" alt="AI Style page showing a learned writing profile"><br><sub><b>AI Style.</b> Voice learned from your own WhatsApp exports: reply length, emoji, punctuation, openers.</sub></td>
    <td width="50%"><img src="docs/screenshots/dashboard.png" alt="Dashboard with lead and campaign totals, conversion rate and recent campaigns"><br><sub><b>Dashboard.</b> Leads, campaigns, conversion rate and deals won at a glance.</sub></td>
  </tr>
</table>

<sub>The data in these screenshots is fictional demo data (a made-up studio, made-up clients).</sub>

## Understanding your offer

Most outreach tools ask you to type a one-line description and hope. Prospex asks for the real material instead, then shows its work:

- **Sources**: a website (the main address is enough), pasted text, or files (`.pdf`, `.docx`, `.md`, `.txt`).
- **Whole-site reading**: besides the page you give, it follows `llms.txt`, the sitemap and the home page's links, up to 40 pages, and opens JavaScript-only pages in a real browser.
- **A brief with evidence rules**: numbers, customer names, testimonials and prices must appear in your sources or they are dropped and listed as missing.
- **You stay in charge**: the brief and the campaign form are editable, fields filled by the AI are marked, and anything you typed yourself is never overwritten.
- **Write once, reuse**: the analysis runs in the background (a small local model needs minutes; the page shows the step and you may leave it). A new campaign can then be filled instantly from the saved brief, with no new AI run. Analyse again only when your sources change.

[How it works, limits, and tips for local models](docs/marketing-brief.md).

## Writing in your own voice

AI Style is optional. If you use it, you export a few of your own WhatsApp chats (WhatsApp's official **Export chat** feature, `.txt` or `.zip`) and pick which participant is you. Prospex then:

- measures how you write: reply length, emoji, punctuation, how you open and close;
- stores anonymized pairs of *what the customer wrote* and *how you answered*, so it can show the model your real replies to similar questions;
- never stores the raw chats. Phone numbers, emails and links are replaced before anything is saved.

It is retrieval, not model training, so you can delete the profile at any time and nothing remains in a model. Everything can run on your machine with Ollama. [How it works, what it costs and how well it did in testing](docs/ai-style.md).

## Sending that protects your number

WhatsApp bans numbers that behave like bulk senders. Prospex is built around not behaving like one:

| Safeguard | Default |
|-----------|---------|
| Human approval before every message | Always on |
| Messages per hour | 10 (configurable 1 to 30) |
| Messages per day | 80 (configurable 1 to 200) |
| Quiet hours | 21:00 to 07:00 in your timezone |
| Gap between messages | Random, 0.6x to 1.4x of the hourly average |
| Typing indicator | Shown before each message, scaled to its length |
| Number check | Skips numbers that are not on WhatsApp, without counting them as failures |
| STOP handling | Cancels pending messages and blocks the number permanently |
| Opt-out line | Added to every first message and follow-up |
| Messages you type on your own phone | Recorded only for numbers that belong to a lead: the lead stops waiting for an answer and outdated drafts are withdrawn. They do not count toward the limits. |
| Replies to people who wrote to you | Not paced: an approved reply is sent on the next tick, ahead of the cold queue, and does not count toward the limits |
| Automatic greetings from shops | Recognised and ignored: no stage change, no reply draft |
| Circuit breaker | Pauses sending after 3 failures in a row |
| Crash safety | A message interrupted mid-send is marked failed, never resent automatically |

Pace decides the calendar. At the defaults (10 per hour, 80 per day) a list of 1,500 leads takes about 19 days. Raising the daily cap to 140, the most that 10 per hour allows between 07:00 and 21:00, shortens it to about 11 days. Start with a batch of 30 to 50 leads, watch the reply rate and the account, then scale up. Details and the reasoning are in [docs/whatsapp-outbox.md](docs/whatsapp-outbox.md).

**Two ways to connect WhatsApp.** Today Prospex connects as a linked device (Baileys), which works with any number but is unofficial, so use a dedicated business number. The official WhatsApp Business Cloud API is planned as a hosted-only feature (alatpintar.id subscribers), delivered as a separate private connector that is not built yet. The sender already talks to WhatsApp through one provider interface, and the Outbox settings show the option locked outside the hosted edition. See [docs/editions.md](docs/editions.md).

<a id="language"></a>
## Language

Two separate things, both English or Vietnamese:

- **The interface.** The `EN | VI` switch in the header and on the login page. The choice is kept in the `prospex_lang` cookie; a visitor with no cookie sees English.
- **The language the AI writes in.** Chosen per campaign (*New campaign, Language*: Tiếng Việt or Tiếng Anh in the Vietnamese interface, Vietnamese or English in the English one). Vietnamese is the default. It covers first messages, follow-ups, replies, email subjects and footers, the Marketing Brief, lead fit reasons, templates and the AI Style preview. Customers can answer in any language: opt-out words and reply intent are understood in Vietnamese, English and Indonesian.

Vietnamese text is checked in code (full diacritics, polite "anh/chị", no slang, question words, numbers such as "2.000.000đ" and "4,5 sao"), but it has only been tested with stand-in AI answers, not with a real model, and the Vietnamese wording has **not yet been reviewed by a native speaker**. Read every draft before you approve it, as always. Status per feature: [docs/features.md](docs/features.md). Glossary of terms: [docs/i18n-vi-glossary.md](docs/i18n-vi-glossary.md).

### Upgrade notes (Indonesian to Vietnamese)

Indonesian is no longer an interface or output language. If you upgrade an existing install:

1. **API `language` values are now `vietnamese` or `english`.** `POST /api/campaigns`, `PATCH /api/campaigns/:id`, `POST /api/marketing/brief/generate`, `POST /api/messaging/templates/generate`, `POST /api/messaging/templates/apply` and `POST /api/style/draft` answer `400` to `"indonesian"`, to `null` and to anything else; leaving the field out is fine (default `vietnamese`). Clients that sent `"indonesian"` must change it.
2. **Stored rows are not rewritten.** A campaign, brief or queued email that still says `indonesian` is read as English from now on (drafts, footers and the interface show English). Create a new campaign, or `PATCH` the language, to switch it. Old messages, replies and "lost reason" texts stay as they were written.
3. **Run the migration.** `20261023000000_language_default_vietnamese` only changes the column default of `campaigns.language` and `marketing_briefs.language` to `vietnamese`; no data changes. Apply it with `pnpm --filter @prospex/database db:deploy` (production and CI), or `pnpm --filter @prospex/database db:push` in a development database. The reverse SQL is in the migration file.
4. **Cookies.** An old `prospex_lang=id` cookie reads as English; the visitor picks VI once.
5. Existing WhatsApp opt-out lines in already-sent messages (Indonesian "Kalau tidak berkenan, balas STOP.") are still recognised and stripped when conversations are read.

### Known limitations of Vietnamese support

- Native-speaker review is pending for the interface text, the opt-out line, the email footer, the unsubscribe pages, the canned replies and the AI prompt wording (the list is in [docs/i18n-vi-glossary.md](docs/i18n-vi-glossary.md)).
- Vietnamese AI output and Vietnamese WhatsApp export parsing were tested with invented fixtures and fake AI clients only ("Simulated" in [docs/features.md](docs/features.md)).
- Lead discovery for Vietnam is covered by the per-campaign market, see [Markets](#markets) and its own known limitations. Two defaults still follow the Indonesian market: the default phone country code of a WhatsApp account is `62` (leads of a Vietnam campaign use `84` regardless; the code applies to numbers you type yourself), and billing amounts are shown with "Rp".
- `message_opt_outs.reason` stores the first 200 characters of the customer's own opt-out message, as before.
- WhatsApp attachments received from customers are stored with Indonesian-looking markers such as `[Gambar]` or `[Kontak: ...]` and shown as stored, also in the Vietnamese interface.
- The screenshots in `docs/screenshots` still show the English interface.

<a id="markets"></a>
## Markets

A campaign sells in one market: **Indonesia (`ID`)** or **Vietnam (`VN`)**. The market is chosen in *New campaign, Market* (the interface language only suggests a starting value: Vietnamese interface starts on Vietnam, English on Indonesia; you can change it). Over the API the field is `market`, `"ID"` or `"VN"`; leaving it out gives `ID`.

What the market changes:

| Part | Indonesia (`ID`) | Vietnam (`VN`) |
|------|------------------|----------------|
| Google Maps search | `hl=id`, browser locale `id-ID`, time zone `Asia/Jakarta`, areas suffixed ", Indonesia" | `hl=vi`, `vi-VN`, `Asia/Ho_Chi_Minh`, areas suffixed ", Việt Nam" |
| Whole-country search | "Seluruh Indonesia" and similar words: one search per city, 70 cities | "toàn quốc", "cả nước", "Việt Nam" and similar: one search per city, 30 cities |
| Place names | The existing Indonesian city and alias lists | Vietnamese aliases ("TP.HCM", "Sài Gòn" and similar resolve to one place), prefixes such as "thành phố", "tỉnh" |
| Phone numbers | Unchanged (`62`) | Country code `84`: `090…`, `+84 90…`, `84 90…` and a bare nine-digit mobile all become `849…` |
| WhatsApp reachability | No rule | Landline (`02x…`) and service (`1800`/`1900`) numbers are recognised and cannot be messaged |
| Regions of a lead | As before | Province from the geocoder, matched against the 34 provincial units |
| Leads map | Opens on Jakarta | Opens on Ho Chi Minh City when no lead has coordinates and the latest campaign is Vietnam |
| Outbox time zone | `Asia/Jakarta` | A new, untouched account starts on `Asia/Ho_Chi_Minh` when the latest campaign is Vietnam |

Lead scoring gives no phone points to a landline or service number (text "Landline: cannot be reached on WhatsApp"). The market belongs to the campaign; a lead's market is its campaign's market, so every lead, referral and backfill uses the right rules.

**Rules to know**

- `market` other than `"ID"` or `"VN"`, and `null` or `""`, answer `400` ("market must be one of: ID, VN").
- `PATCH /api/campaigns/:id` may change `market` only while the campaign is a draft, otherwise `409`. A campaign outside your workspace is `404`.
- `POST /api/scraper/campaigns/:id/start` answers `409` unless the campaign is a draft or has failed. **A completed campaign can no longer be re-run: create a new one.**
- Approving a WhatsApp draft for a landline or service number answers `400` "Not a mobile number" and the whole approval is refused (the batch stays as drafts). The sender checks again just before sending and marks the message failed with the same text; the provider is never called.
- **Compliance is risk information, not a claim.** For Vietnam the campaign form shows: "Vietnamese rules on unsolicited commercial messages (Decree 91/2020/ND-CP) and on personal data (Decree 13/2023/ND-CP) may apply to this outreach. This is risk information to review with a legal adviser, not legal advice." (Vietnamese: the same text under `camp.market.compliance`.) Prospex does not decide whether your outreach is lawful. The wording needs sign-off from the owner or a legal adviser.

### Upgrade notes (adding the market)

1. **Run the migration.** `20261024000000_campaign_market` adds `campaigns.market` as `TEXT NOT NULL DEFAULT 'ID'`; it is additive, every existing campaign reads `ID` and nothing is rewritten. Apply it with `pnpm --filter @prospex/database db:deploy` (production and CI), or `pnpm --filter @prospex/database db:push` in a development database. The reverse SQL is a comment in the migration file (`ALTER TABLE "campaigns" DROP COLUMN "market";`).
2. **Existing Indonesian behaviour is pinned** by regression tests written before the change (phone, WhatsApp text, area planning, Maps parsing, geocoder regions, scoring); the Indonesian outputs are expected to be unchanged.
3. **Re-running completed campaigns is no longer possible** (see above); scripts that restarted a `completed` campaign now get `409`.
4. API clients that send `market` must send exactly `"ID"` or `"VN"`.

### Known limitations of the market support

- **Vietnamese Google Maps wording is Simulated.** The labels, selectors and card formats used for Vietnamese pages came from documentation and invented fixtures; the scraper has never been run against real Vietnamese Maps. A real run is needed to confirm that cards are found, and that ratings, review counts, phone and address are read correctly. Check the first results by hand.
- The province list (Simulated; 34 units from Nghị quyết 202/2025/QH15) was read from two summaries because the Gazette could not be fetched; re-check it against the Gazette. How OpenStreetMap names old and new provinces is not verified.
- The 30 Vietnamese cities used for "toàn quốc" need owner review.
- The compliance wording needs owner or legal sign-off.
- Indonesian Maps card parsing moved from the browser page into Node (`parseCard`). It is unit-tested (including an Indonesian card), but it was not re-verified against a real Indonesian run.
- `normalizePhone(raw, '84')` stays generic; only `normalizePhoneFor(raw, market)` applies the Vietnamese rules. `regionFromNominatim` is unchanged; the new `regionFromAddress` dispatches by country.
- The WhatsApp panel suggests the time zone only for an untouched account (no paired phone, time zone still `Asia/Jakarta`).
- Bulk approval fails as a whole when one draft in it is a landline or service number.
- Vietnamese contact-page keywords for website enrichment were not added. There is no Zalo channel.
- The same phone number in two markets is not separated: a referral for a number that already belongs to a lead in the workspace is not added again, and the first lead with that number wins.
- The Outbox template panel lists only leads that come from Google Maps.

## Tech stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js 16 (App Router), shadcn/ui, Tailwind CSS, Recharts, English and Vietnamese interface |
| **Backend** | NestJS 10, Prisma ORM, REST API with Swagger |
| **Database** | PostgreSQL 16 with pgvector |
| **Queue** | BullMQ and Redis 7 for scraping jobs |
| **AI** | Any OpenAI-compatible provider: OpenAI, OpenRouter, Ollama |
| **Scraping and site reading** | Playwright with headless Chromium, behind a proxy that refuses private addresses |
| **Documents** | `unpdf` for PDF (in a worker thread), `fflate` for DOCX |
| **WhatsApp** | Baileys (linked device) |
| **Area lookup** | OpenStreetMap Nominatim (optional, point it at your own instance or turn it off) |
| **Monorepo** | Turborepo and pnpm workspaces |

<a id="quickstart"></a>
## Quickstart

You need [Node.js 20+](https://nodejs.org/), [pnpm 9+](https://pnpm.io/) and [Docker](https://www.docker.com/).

```bash
git clone https://github.com/asiifdev/business-leads-ai-automation.git
cd business-leads-ai-automation
pnpm install

cp .env.example apps/api/.env
cp .env.example packages/database/.env
# edit apps/api/.env: DATABASE_URL, JWT_SECRET, ENCRYPTION_KEY, OPENAI_*

docker compose up -d                       # PostgreSQL 16 with pgvector, and Redis
pnpm --filter @prospex/database db:deploy  # apply migrations
pnpm --filter @prospex/database exec prisma generate
pnpm --filter @prospex/api exec playwright install chromium   # the browser that scrapes Google Maps and reads websites

pnpm --filter @prospex/api dev             # API on :3001
pnpm --filter @prospex/web dev             # dashboard on :3000
```

Open [http://localhost:3000](http://localhost:3000), register, and create your first campaign. Swagger lives at [http://localhost:3001/api/docs](http://localhost:3001/api/docs).

Your first outreach, step by step:

1. **Campaigns, New campaign**: add your website or documents under *Source material* and press **Analyze with AI**. Check the filled form, then start the campaign. (You can also fill the form by hand.)
2. **AI Style** (optional): import a few of your WhatsApp chat exports.
3. **Outbox**: click **Connect WhatsApp** and scan the code with the phone (WhatsApp, Linked devices). Use a dedicated number.
4. **Outbox, Review**: choose the campaign, click **Write drafts**, then approve what you like.

The full walkthrough is in [docs/USER_GUIDE.md](docs/USER_GUIDE.md) (Vietnamese).

### Choosing an AI provider

Any OpenAI-compatible endpoint works. Drafts need a chat model, and the style and knowledge features need an embedding model (`EMBEDDING_MODEL`). Switching the embedding model later means re-importing your chats and re-indexing your sources, because vectors from different models cannot be compared.

```env
# OpenAI
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
EMBEDDING_MODEL=text-embedding-3-small

# OpenRouter
OPENAI_API_KEY=sk-or-...
OPENAI_BASE_URL=https://openrouter.ai/api/v1
OPENAI_MODEL=anthropic/claude-haiku-4-5

# Ollama, fully local
OPENAI_API_KEY=ollama
OPENAI_BASE_URL=http://localhost:11434/v1
OPENAI_MODEL=gemma4
EMBEDDING_MODEL=qwen3-embedding
```

With `OPENAI_API_KEY` empty, scraping and rule-based scoring still work, and the AI features (drafts, AI Style, knowledge base) are off. Prospex does not fill the gap with canned text. A local model can take around 40 seconds per draft, so drafting runs in the background and the Outbox shows progress. Writing the Marketing Brief with a local model takes several minutes. For Ollama, a context length of 16,384 is enough (our biggest prompt is about 7,000 tokens) and uses far less memory than the 131,072 some installs default to; if it is sometimes slow or answers with a 500 error, check that nothing else is using the model at the same time, because Ollama serves one request at a time by default.

### Other settings

| Variable | Default | Purpose |
|----------|---------|---------|
| `OPENAI_REASONING_EFFORT` | empty | Set to `none` for reasoning models such as Ollama `gemma4` or `qwen3`: it switches off the thinking phase and is about ten times faster for these tasks. Leave empty for models that do not support it (for example `gpt-4o-mini`). |
| `BRIEF_SOURCE_CHARS` | `30000` | How much source text each pass of the Marketing Brief reads. Lower it if your model has a small context window. |
| `SCRAPER_MODE` | `live` | `fixture` returns clearly labelled test leads without phone numbers. For tests and demos only. |
| `PLAYWRIGHT_NO_SANDBOX` | unset | Set to `true` only where Chromium cannot create its sandbox (most containers; the Docker image sets it). Outside containers keep the sandbox on: the browser opens pages chosen by users. |
| `WA_AUTH_DIR` | `./.wa-auth` | Where linked-device sessions are stored. Mount it as a volume in production and treat it like a password. |
| `ATTACHMENTS_DIR` | `./.attachments` | Where files uploaded to send on WhatsApp are kept (one folder per workspace). Mount it as a volume in production. |
| `GEOCODER_URL` | `https://nominatim.openstreetmap.org` | Reverse-geocoding service used to work out each lead's province, city and district from its coordinates. The public one allows one request a second; point this at your own Nominatim to go faster. |
| `GEOCODER_USER_AGENT` | `Prospex/1.0 (self-hosted lead tool)` | Identifies you to that service; put a way to reach you if you use the public one. |
| `GEOCODER_DISABLED` | `false` | Set to `true` to turn the area lookup off (used in CI). |
| `REPLY_DRAFT_DELAY_MS` | `20000` | How long to wait after a prospect's last message before drafting an answer, so a burst of short messages gets one draft. |
| `PUBLIC_API_URL` | (localhost) | Public https base URL of the API (for example `https://api.example.com/api`). Unsubscribe links in emails point here. **Email sending is blocked, and approving email drafts is refused, while this is not a public https address**, because recipients could not use the link. |
| `ALLOW_LOCAL_UNSUBSCRIBE` | unset | Set to `true` only for local tests with your own mailbox, never to message real people. |
| `CORS_ORIGINS` | (app URL) | Comma-separated origins allowed to call the API, when the dashboard runs on another host. |
| `EMAIL_DISABLED` | `false` | Set to `true` to turn off the email sender (used in CI). |
| `EDITION` | `community` | `community` or `hosted`. See [docs/editions.md](docs/editions.md). |
| `WHATSAPP_DISABLED` | `false` | Set to `true` to turn off the sender, WhatsApp connections and follow-up scheduling (used in CI). |

## Production

```bash
cp .env.example .env     # strong passwords, real API keys
docker compose -f docker-compose.prod.yml up -d
```

This starts PostgreSQL with pgvector, Redis, the API, the dashboard and Nginx. Keep `WA_AUTH_DIR` on a persistent volume, otherwise every redeploy asks you to scan the code again. The compose file also mounts a volume for `ATTACHMENTS_DIR`, so uploaded files survive a redeploy.

## Project structure

```
prospex/
├── apps/
│   ├── api/              # NestJS API: scraper, leads, ai, messaging, auth
│   ├── web/              # Next.js dashboard (EN/VI)
│   └── marketing/        # Landing page
├── packages/
│   ├── database/         # Prisma schema and migrations
│   ├── types/            # Shared TypeScript types
│   └── config/           # Shared eslint and tsconfig
├── docs/                 # Guides, architecture, screenshots
└── docker-compose*.yml   # Local and production stacks
```

How the modules fit together: [docs/architecture.md](docs/architecture.md).

## API

Interactive docs at `/api/docs`. The main routes:

| Area | Endpoints |
|------|-----------|
| **Campaigns and scraping** | `GET/POST /api/campaigns`, `POST /api/scraper/campaigns/:id/start` |
| **Leads and CRM** | `GET /api/leads` (`q`, `priority`, `status`, `province`, `regency`, `district`, `campaignId`, `page`, `limit` up to 200), `GET /api/leads/map` (every lead with coordinates, same filters, up to 5,000), `GET /api/leads/regions` (province, city and district counts), `POST /api/leads/geo/backfill` (work out areas in the background), `POST /api/leads/:id/referral` (add a contact a lead passed you as a lead), `PATCH /api/leads/:id/crm`, `GET /api/analytics`, `GET /api/analytics/pipeline` |
| **Export** | `GET /api/export/leads/{csv,json,vcard}` |
| **AI Style** | `POST /api/style/inspect`, `POST /api/style/train`, `GET/DELETE /api/style/profile`, `POST /api/style/draft` |
| **Knowledge base** | `GET/POST /api/knowledge/sources`, `DELETE /api/knowledge/sources/:id`, `POST /api/knowledge/search` |
| **Marketing brief** | `GET /api/marketing/sources`, `POST .../sources/url`, `.../sources/text`, `.../sources/file`, `DELETE .../sources/:id`, `GET/PUT /api/marketing/brief`, `POST /api/marketing/brief/generate` (starts a background job), `GET /api/marketing/brief/generate/status` (progress, and the brief when done) |
| **Outbox** | `GET /api/messaging/outbox`, `POST /api/messaging/outbox/generate`, `POST .../approve`, `.../reject`, `.../cancel`, `PATCH .../:id` (text, attachment, link preview), `POST .../:id/retry` |
| **Files and link previews** | `POST/GET /api/messaging/attachments`, `DELETE /api/messaging/attachments/:id`, `POST /api/messaging/link-preview` |
| **Re-read conversations** | `POST /api/messaging/reclassify` (a preview by default; `{"apply": true}` applies it) |
| **One message for many leads** | `GET /api/messaging/templates/categories`, `GET .../templates/leads`, `POST .../templates/generate` (AI writes one message for a kind of business), `POST .../templates/apply` (one draft per selected lead) |
| **WhatsApp** | `GET /api/messaging/whatsapp`, `POST .../connect`, `POST .../disconnect`, `PATCH .../settings` |
| **Email** | `GET /api/email`, `PUT/DELETE /api/email/account`, `POST /api/email/account/test`, `POST /api/email/outbox/generate` |
| **Settings** | `GET/POST/DELETE /api/settings/api-keys`, `GET/POST /api/settings/integrations` |

## Development

```bash
pnpm install
pnpm --filter @prospex/api exec tsc --noEmit    # typecheck API
pnpm --filter @prospex/web exec tsc --noEmit    # typecheck web
pnpm --filter @prospex/api test                 # unit tests: chat parser, style stats, scoring, send policy, opt-out, spelling, brief, site reading, documents, reply understanding, conversation reading, WhatsApp formatting, attachments, link previews, areas
pnpm --filter @prospex/database db:studio       # Prisma Studio
```

`apps/api/scripts/pipeline-check.ts` exercises the sender, inbound handling, your own phone messages, outdated drafts, re-reading the pipeline and contacts you are pointed to, against a real database with a fake WhatsApp provider; `apps/api/scripts/attachment-check.ts` does the same for attachments and link previews. Both run in a throwaway workspace and limit the sender to it (`sender.tick(workspaceId)`), so they never touch another workspace's queue. `apps/api/scripts/reclassify-replies.ts` (dry run by default) corrects replies labelled wrongly by an older reading. `apps/api/scripts/eval-style.ts` compares generic drafts with drafts in your style on your own exports. See [CONTRIBUTING.md](CONTRIBUTING.md).

<a id="roadmap"></a>
## Roadmap

Done:

- [x] Google Maps discovery with real categories, honest scoring, CRM pipeline, analytics, export
- [x] Reply understanding and a pipeline view to follow leads until closing
- [x] One message for many leads: a template per kind of business, drafts for every selected lead
- [x] Email channel through your own SMTP account (sending only; replies are not read yet)
- [x] Marketing Brief from websites, PDF, DOCX, Markdown and text, with campaign autofill
- [x] Knowledge base with retrieval (pgvector)
- [x] AI Style: learn your voice from WhatsApp exports
- [x] Outbox: approve, edit, reject, then send one at a time with limits
- [x] WhatsApp through Baileys: pairing, replies as drafts, STOP handling, follow-up drafts
- [x] English and Vietnamese interface on every screen, and Vietnamese or English drafts per campaign
- [x] Several businesses per login: separate brief, AI Style, knowledge, WhatsApp number and AI key for each workspace
- [x] Leads you can always find again: paged lists, search by address, phone and area, province/city/district filters, a map with every lead
- [x] WhatsApp messages with formatting, files and link previews
- [x] Your own phone messages recorded for known leads, replies that read the whole conversation, one fresh draft that replaces an outdated one, contacts you are pointed to, and a way to re-read the pipeline

Next:

- [ ] Test sending at volume on a dedicated number (one real message and one real reply are verified; the pacing logic is tested with a stand-in WhatsApp)
- [ ] Official WhatsApp Business Cloud API provider
- [ ] Knowledge base screen (sources are managed from the Marketing brief page today)
- [ ] Edit-rate and reply-rate dashboard, to see whether drafts are improving (the opening used is already stored with every draft)
- [ ] Read email replies
- [ ] Quoted ("reply to this message") and edited WhatsApp messages: today a short answer is read without the message it quotes
- [ ] Hand a thread to a person when the prospect's need is outside your offer, instead of drafting
- [ ] Cover image and page count for PDFs sent as attachments
- [ ] Add your own answers to the knowledge base, so the next draft knows the price and terms you quoted by hand
- [ ] Senders whose number WhatsApp hides (LID): today their messages are listed on the Pipeline page but cannot be matched to a lead, so a STOP from one must be handled by hand. Baileys 7 would fix this
- [ ] More of marketing than outreach: email and other channels, content, social, ads
- [ ] Function-calling agent and MCP server, so AI agents can work your pipeline
- [ ] Proposals and invoices

Open an issue to vote on what comes next.

## License

Prospex is licensed under the **GNU AGPL-3.0-or-later**, see [LICENSE](LICENSE). Self-hosting and modifying are free. If you offer a modified version as a network service, you must publish your changes. A [commercial license](COMMERCIAL-LICENSE.md) is available if the AGPL does not fit your use.

Scraping websites and messaging people are regulated by the terms of those services and by privacy and anti-spam laws (GDPR, Indonesia's UU PDP and others). You are responsible for how you use this software. Read [DISCLAIMER.md](DISCLAIMER.md) before you contact anyone.

---

<div align="center">
  <sub>Built by <a href="https://github.com/asiifdev">asiifdev</a></sub>
</div>
