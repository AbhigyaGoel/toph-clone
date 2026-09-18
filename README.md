# Toph

Farm work-logging dashboard. Workers dictate a voice log from the field, Toph
transcribes it and pulls out the structured detail, and a manager reviews it
here and turns it into a compliance record.

Built for the USC LavaLab F26 dev challenge from the two Dashboard frames in the
Figma file `nvpGmK1je0QsesXtZcBdjg`.

**Live:** https://toph-dashboard.vercel.app

## Running it

```bash
npm install
cp .env.example .env.local   # Supabase URL + publishable key; secret key for writes
npm run dev                  # http://localhost:3000
```

Pick an account on the sign-in screen. Roles are enforced on the server, not
hidden in the UI:

| Account | Role | Can |
| --- | --- | --- |
| Sonya Alexis | admin | everything, including deletes |
| Mannat Bawa | manager | review, correct, add — not delete |
| Arin Jain | worker | read only |

Without `SUPABASE_SECRET_KEY` the app still runs read-only, and every control
that writes disables itself and says why.

## Stack

Next.js 14 (App Router), Tailwind, Supabase Postgres, Framer Motion. No other
runtime dependencies.

Server Components read the database directly, so a screen is one round trip.
Mutations are Server Actions. Filters, sort, date range and which rows are open
all live in the URL, so a refresh or a shared link reproduces the same view.

## Routes

| Route | What it is |
| --- | --- |
| `/` | Dashboard — the Figma's two frames, one page (`?open=` expands a row) |
| `/inbox` | Everything waiting: safety, compliance gaps, unusual rates, unread |
| `/activity-logs` | The archive, with faceted search |
| `/replay` | A day scrubbed across the farm map |
| `/map` | The farm now — who is out, and which blocks are closed |
| `/audit-manager` | The application register and the gaps in it |
| `/reports` | Where labour and inputs went |
| `/employees` | The crew |
| `/performance` | Output and transcription quality |
| `/settings` | Product register, accounts, farm vocabulary |
| `/api/ingest` | Audio in, transcribed and extracted log out |
| `/api/exports/pur` | CA DPR Pesticide Use Report |

## Data model

```
organizations ─┬─ members          (who can sign in, and their role)
               ├─ employees        (who does the work)
               ├─ fields           (blocks, with map coordinates)
               ├─ products         (with EPA number, REI hours, PHI days)
               └─ activity_logs ─┬─ recordings   (audio, transcript, extracted fields)
                                 ├─ applications (what was applied, at what rate)
                                 └─ log_tags
```

Three things in here matter more than they look:

`applications` is its own table because a spray is often a tank mix, each
product with its own re-entry interval. Flattening it onto the log would cap the
farm at one product per pass.

`activity_types.requires_product` is a column, not a hardcoded list. It decides
whether a log with no product is a gap or simply not applicable.

`recordings.extracted_fields` is JSONB holding `{value, confidence, corrected,
original}` per field. Confidence tells the reviewer what to check, `corrected`
distinguishes a human decision from a machine guess, and `original` keeps what
the machine heard — which is what the farm vocabulary learns from.

## What I added beyond the Figma

- **Extracted fields with per-field confidence**, correctable in place against
  the farm's own product and field lists. Correcting one re-derives the
  compliance checks immediately.
- **One triage surface** (`/inbox`) ranking re-entry restrictions, compliance
  gaps, unusual rates and unread logs. The dashboard shows a count of it rather
  than a second copy.
- **REI/PHI safety** on the map and inside each log.
- **CA DPR export** with a footer counting the records it had to exclude.
- **Farm Day Replay** — a day on the map with a timeline. Catches somebody
  entering a block during its re-entry interval, which no single row shows.
- **Rate anomalies** — a filed rate compared against that applicator's own
  history with that product.
- **Farm vocabulary** — corrections accumulate and feed back into extraction.
- **Ingest endpoint** — Whisper or Deepgram when a key is present, a
  deterministic parser when not.

## Structure

```
app/(shell)/     one directory per screen; the nav rail lives in the layout
app/api/         ingest, exports, search
app/actions/     Server Actions
lib/             domain logic — extraction, compliance, inbox, replay, anomaly
lib/repositories/ every database read, one module per aggregate
components/      one directory per screen, plus shell/ nav/ ui/ charts/
supabase/        migrations and seed
scripts/         attach audio, decode waveforms, reset the demo
```

## Notes

- Timezones are UTC throughout. A real deployment needs the farm's local zone.
- `supabase/seed.sql` has drifted from the hosted demo data; reseeding from it
  reproduces an earlier version of the farm.
- No unit tests. Ten Puppeteer harnesses drive the real app in a browser and
  assert on behaviour a user would notice — 255 checks.
- `scripts/reset-demo.mjs` puts the demo back to its opening state.
