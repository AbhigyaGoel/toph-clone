# Toph

Farm work-logging dashboard. Workers dictate a voice log from the field; Toph
transcribes it and pulls out the structured detail; a manager reviews it here.

USC LavaLab F26 dev challenge. Next.js 14, Tailwind, Supabase.

**Live:** https://toph-clone.vercel.app

## Run it

```bash
npm install
cp .env.example .env.local   # Supabase URL + keys
npm run dev
```

Sign in as **Sonya Alexis** (admin), **Mannat Bawa** (manager, no deletes) or
**Arin Jain** (read only). Roles are enforced server-side.

## Beyond the Figma

- Extracted fields with per-field confidence, correctable in place
- `/inbox` — one triage list: restrictions, compliance gaps, odd rates, unread
- `/replay` — a day scrubbed across the farm map, catching anyone who entered a
  block during its re-entry interval
- Rate anomalies against each applicator's own history
- CA DPR pesticide export, with a count of what it excluded
- `/api/ingest` — audio in, log out

Filters, sort and open rows live in the URL, so any view is linkable.

Tested with ten Puppeteer harnesses driving the real app (255 checks).
