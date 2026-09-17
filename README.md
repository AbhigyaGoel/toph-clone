# Toph

A pixel-accurate recreation of the two **Dashboard** frames in the
*F26 Dev Challenge* Figma file (`esbeYsNJToOEjjWYaBjUg2`) — and the rest of the
product those frames imply, built out from the navigation rail they draw.
Next.js 14 (App Router), Tailwind CSS, Supabase Postgres.

```bash
npm install
cp .env.example .env.local   # Supabase URL + publishable key; secret key for writes
npm run dev                  # http://localhost:3000
```

Open `/`, pick an account, and everything on the rail works. Sign in as **Dana
Reyes** for the full picture, **Marco Silva** to watch a manager lose the delete
controls, or **Priya Nair** to see the app go read-only — the roles are enforced
on the server, not in the UI.

Without `SUPABASE_SECRET_KEY` the whole read-only app still works and every
control that writes disables itself and says why.

| Route                    | What it is                                                     |
| ------------------------ | -------------------------------------------------------------- |
| `/`                      | `Dashboard` — DEFAULT VIEW: the review queue                    |
| `/?open=<log id>`        | `Dashboard` — EXPANDED ENTRY                                    |
| `/activity-logs`         | The archive: faceted search over every log                      |
| `/map`                   | The farm, with live re-entry restrictions                       |
| `/audit-manager`         | The compliance register, and the gaps in it                     |
| `/reports`               | Where labour and inputs went                                    |
| `/schedule`              | The month as it was worked                                      |
| `/employees`             | The crew                                                        |
| `/performance`           | Output and transcription quality, ranked                        |
| `/messages`              | Alerts derived live from the farm's own rows                    |
| `/settings`              | Product register, accounts, deployment                          |
| `/support`               | What each screen does, and what this build does not             |
| `/sign-in`               | Pick an account                                                 |
| `/logs/<log id>`         | redirect, so older links still resolve                          |

The Figma contains only the two Dashboard frames. Everything else is designed
from the same system — the panel, the 20px corners, the chip row, the divider
shadow, the motion vocabulary — but laid out for its own job rather than poured
into one template. The reasoning for each is in **The screens**, below.

Both design frames are the same route. Which rows are open is `?open=`, a list,
so more than one can be open at once and View is a button rather than a
navigation. It used to be its own route: opening a row swapped one page
component for another, which remounted the whole client tree — the tick boxes
cleared, any open menu shut, and the round trip read as the page reloading under
the click. The old URL still works and forwards here, so links already shared
land in the right place.

Search, sort, date range, filters and open rows all live in the URL, so a
refresh or a shared link reproduces the exact view. Every one of them is applied
optimistically: the chip moves, or the row opens, on the press, and the server's
answer arrives behind it.

## The product

Toph is a work-logging platform for farms. Field workers dictate a voice log
from a mobile app — most often "what chemical went on which field" — and Toph
transcribes it and extracts the structured fields. Farm admins review the result
on this dashboard: a table of recent logs that expands in place to reveal the
recording waveform, playback and tagging controls, the raw transcription, and a
satellite map of where the work happened.

## Data model

Every table backs something visible on the page. The trace from UI element to
column:

| UI element                         | Source                                                            |
| ---------------------------------- | ----------------------------------------------------------------- |
| Avatar, "Bays Ranch"               | `organizations.name`, `avatar_url`                                |
| "Admin"                            | `members.role` of the viewing member                              |
| Nav badge on Dashboard, "1 New"    | count of `activity_logs.status = 'new'`                           |
| "Todays Recordings"                | count of `recordings.recorded_at` on the current date             |
| "Active Workers"                   | count of `employees.is_active`                                    |
| "Response Accuracy"                | mean `recordings.transcription_confidence`                        |
| EMPLOYEE / ACTIVITY / FIELD        | `employees.full_name`, `activity_types.name`, `fields.name`       |
| DATE / TIME                        | `activity_logs.started_at`, `ended_at` (timestamptz)              |
| Waveform, Summary, Play Recording  | `recordings.waveform`, `transcript`, `audio_url`                  |
| Map plot / pin                     | `fields.map_plot`, `recordings.map_pin`                           |
| Add Tag, tag chips, TAG filter     | `tags`, `log_tags`                                                |
| Row checkbox → Mark as reviewed    | `activity_logs.status`                                            |
| Audit register, "Applied" on a log | `products`, `applications`                                        |
| Re-entry and pre-harvest windows   | `products.rei_hours`, `phi_days`, derived in `application_records` |
| Switch User, the role beside a farm| `members.role`                                                    |

```
organizations 1─N members, employees, fields, tags, products, activity_logs
employees     1─N activity_logs
fields        1─N activity_logs
activity_logs 1─1 recordings
activity_logs N─M tags      (log_tags)
activity_logs N─M products  (applications)   -- a tank mix is several rows
```

**The brief's own sentence drove the biggest schema decision.** It describes
Toph's most common use case as logging "what fertilizer/chemical is used on what
fields", and the platform's own material is about turning field activity into
audit-ready evidence. Neither was representable: a log knew who, where, when and
what *kind* of work, but not the substance. `products` and `applications` close
that, and they are what the Audit Manager, the Map's re-entry colouring, the
Reports' product totals and the Messages feed all read.

REI and PHI live on the **product**, not the application, because they come off
the registered label — the same for every use of that product. Storing them
per-application would let two records of the same chemical disagree about the
law.

Five read models sit on top, all `security_invoker` views so the tables' RLS
applies through them:

| View                  | What it answers                                              |
| --------------------- | ------------------------------------------------------------ |
| `activity_log_rows`   | the table's three joined names, so the list is one select    |
| `dashboard_stats`     | the three cards and the rail badge                           |
| `application_records` | the compliance register, with REI and PHI dates derived once |
| `field_activity`      | per-field log count, unreviewed count and last worked        |
| `employee_activity`   | per-worker hours, fields, recordings and mean confidence     |

The last three exist because the alternative was shipping a season of logs to
the server process to count them. The cut is drawn at what Postgres is genuinely
better at: rollups are views, and the *rules* — what makes a record complete,
when a field is safe — are TypeScript (`lib/compliance.ts`), because those are
the parts a farm would argue with and they need to be readable and testable.

The schema is in `supabase/migrations/`; the seed in `supabase/seed.sql`.

### Decisions worth defending

**Timestamps, not display strings.** The design shows "April 19, 2026" and
"6:00 AM - 10:40 AM"; the database stores `started_at` / `ended_at`. Formatting
happens in `lib/format.ts`. That is what lets "Date" be a real sort and "This
Month" a real range instead of string comparisons.

**Activity is a lookup table.** The guided voice log literally asks the worker
to pick from "spraying, fertilizing, planting, irrigating, harvesting, scouting,
pruning, soil work, or equipment maintenance" — a closed set. A table gives the
Filter menu its options and stops "Irrigating" and "Irrigation" becoming two
categories.

**Stats are derived, not stored.** A `dashboard_stats` snapshot table would be a
legitimate pattern for a heavy dashboard, but here it would duplicate facts the
rows already hold. The view means adding a log changes the cards with no second
write to keep in sync. The consequence is that "Todays Recordings" really is
today's: the seed stamps five recordings with the date it runs, so the card
reads 5 that day and 0 the next.

**Dates are seeded relative to the run.** Four logs land in the current month
and seven in the previous one, so the default "This Month (4)" view and the
11-row all-time view both derive from the data rather than being hardcoded.

**The waveform is stored as amplitudes.** One number per tick (0–1) plus how
many leading ticks carry signal. Tick x-positions and the midline are layout,
so `lib/waveform.ts` derives them; Isaac Wang's design waveform round-trips
through this exactly.

**Row Level Security is read-only.** Every table gets a `select` policy for the
anonymous role and no write policies at all. The publishable key in `.env.local`
is therefore safe to ship to the browser: it can only do what those policies
allow, which is read. Writes never go that route — see **Writes, and why they do
not go through the browser**.

**Query state lives in the URL.** Search, sort, range, filters and the open rows
all serialise to search params (`lib/logQuery.ts`) and the page is rendered per
request. That is what makes a refresh persist everything, and it makes an
expanded row a deep link that carries the current filters along.

What is *not* in the URL is as deliberate: which rows are ticked, what the
pointer is over, and which dialog is up are scratch gestures that should not
survive a refresh, and putting them in the address bar would make every tick a
navigation.

## The screens

The Figma draws one screen. The rail draws eleven, and building the other ten
raised a question worth answering explicitly: what stops them being ten copies of
the same page with different rows in it?

The shell is deliberately shared — `AppShell` owns the rail, the header band, the
column gap and the entrance stagger, so every screen is unmistakably the same
product. What is *not* shared is the layout inside it. A screen's shape should
come from its job, and these jobs are genuinely different: one is a queue you
work through, one is a search, one is a document you assemble, one is a map, one
is a ranking, one is a list of people. Reaching for a summary strip and a table
each time would have made all six look like the same answer to six different
questions.

| Screen | Its job | The shape that follows |
| ------ | ------- | ---------------------- |
| **Dashboard** | Work through this month's logs | The design's own frame: three cards, then a wide table whose rows open in place |
| **Activity Logs** | *Find* one log among a season | Two columns — a persistent facet rail beside a dense day-grouped list. No cards: the summary is one sentence |
| **Map** | Judge the state of the ground | The tile is the screen; a rail beside it carries the selected block. The legend carries the counts, so there is no card strip |
| **Audit Manager** | Assemble evidence, and find the gaps | A readiness ring and a sentence, then the exceptions, then the register. Three parts of one whole is a ring, not four cards |
| **Reports** | Compare | One headline figure with the trend it came from, then a single breakdown panel that swaps dimension in place |
| **Schedule** | See the month's shape | A calendar grid. Bar length is hours relative to the busiest day |
| **Employees** | Know the crew | A card grid. Eleven names in a grid read as a team; the same eleven in a striped table read as inventory |
| **Performance** | Spot the outlier | A ranked scoreboard with one dominant bar per person, and the outlier stated in a banner above it |
| **Messages** | Triage | Three severity bands. The grouping *is* the summary, and each band says what silence there means |
| **Settings / Support** | Read | A narrower measure (`AppShell measure="prose"`), because body copy 1300px wide is harder to read than at 900 |

### Fewest clicks between noticing and fixing

The screens are wired to each other by the work, not by the sitemap. The rule
applied throughout: **whatever tells you about a problem should also be where you
fix it.**

- A spray log with no compliance record reports that *inside the expanded log* on
  the dashboard, with the button that files it. Before that, noticing it meant
  leaving the panel, finding the same log again in the Audit Manager, and filing
  it there — three navigations to do one thing.
- Every Messages alert links to the exact place its fix lives: a missing record
  opens that log with its panel expanded, not the Audit Manager's list.
- The Audit Manager's exceptions carry their own fix button; the register's
  incomplete rows are the button.
- A worker's card, a map block and a performance row all link to that subject's
  filtered archive rather than to an unfiltered one.
- Filters on the archive are one click each and always visible; on the dashboard
  they stay behind a chip menu, because there the table's width is the design's
  and filtering is occasional.

## Interaction

Every control on the dashboard does something. The ones that were decorative in
the first pass are listed here with what they became and why.

**The row wash follows the pointer.** The design puts a `#F8F8F8` wash on the
first row. It is now a single element over the whole table, positioned from the
hovered row's measured `offsetTop` and `offsetHeight` and moved on a spring. One
element travelling, not eleven cross-fading — which is the difference between a
highlight that slides down the column and rows that blink.

Measured geometry rather than a shared `layoutId`, because `layoutId` diffs
bounding rects and the table nearly always has an ancestor mid-animation: a row
opening animates a panel's height, which moves every row below it while the wash
is still working out where it is going. `offsetTop` is a laid-out value and
transforms do not enter into it.

Three details, each of which was a reported bug:

- It is released by the **table**, not by the row being left, and only after a
  short grace period. A row's own `mouseleave` fires *before* the next row's
  `mouseenter`, so releasing there sent the wash home between every pair of
  neighbours — visible as a flicker when moving quickly down the column.
- Arriving and leaving **fade**; only row-to-row **travels**. The position is set
  without animating on the frame the wash becomes visible, so a quick pass over a
  name does not start a long journey the pointer has already abandoned.
- An open panel counts as part of **its own row**, so dragging from the row above
  a panel, through it, to the row below is one continuous move rather than a gap
  that claims nothing.

**The checkboxes select.** Per-row, select-all from the header with an
indeterminate state, and shift-click for a range. Selection is client state and
deliberately not in the URL: it is a scratch gesture that should not survive a
refresh, and putting it in the address bar would make every tick a navigation.
Ticking rows raises a bulk bar offering **Mark as reviewed** and its inverse.

**Marking reviewed is a real write.** It sets `activity_logs.status`, which the
derived `dashboard_stats` view already feeds to the "N New" qualifier and the
green rail badge — so the numbers count down in front of you with nothing else
to keep in sync. The row's EMPLOYEE cell carries a small green dot while a log
is unreviewed; without it the table gave no feedback for the row you acted on,
because `status` was never displayed.

**Add Tag writes too.** It offers the organisation's existing tags first and
free text second, which is what stops "Re-spray" and "respray" becoming two
categories — the same argument as the `activity_types` lookup table. A new name
creates the tag and attaches it in one action, attached tags render as chips on
the panel, and every tag becomes a filter in the Filter menu's TAG section.

**Play Recording is a real transport.** A genuine `<audio>` element bound to
`recordings.audio_url`: position comes from `timeupdate`, length from the
decoded file, clicking or arrow-keying the waveform seeks, and played ticks turn
the panel's accent green behind a playhead. `duration_seconds` from the database
scales the waveform on the first frame so it does not jump when metadata lands.
No audio file is attached yet — see `public/audio/README.md` for the drop-in
convention and `npm run attach-audio`. Until then the button reads "Recording
unavailable" and disables itself rather than pretending.

**Expand Map grows** from wherever the inline tile is sitting: its viewport rect
is measured on open and the dialog animates from that box to the expanded one.
The dialog renders through a portal to `document.body`, and that is load-bearing
rather than tidiness — see the layout note below.

**The filters are fluid.** Chips carry `layout` inside a `popLayout`
`AnimatePresence`, so applying one pushes the row aside and clearing one closes
the gap, rather than the row re-drawing. The range chip's count rolls to its new
value. Every change is optimistic: the chip flips immediately, the navigation
runs in a transition, and the table dims to 45% while the server re-queries
instead of freezing or blanking.

Nothing that does nothing animates on hover: the stat cards sit still, because a
card that lifts under the pointer is promising a click it does not honour. Their
numbers still move, since those changes are real.

Timing lives in one file (`lib/motion.ts`) so the page moves as one system, and
`MotionConfig reducedMotion="user"` at the root honours the OS setting
everywhere at once — a new animated component cannot forget to.

### Writes, and why they do not go through the browser

The read path uses the publishable key and is safe in the browser precisely
because RLS grants `select` and nothing else. Adding write policies for `anon`
would have kept the architecture simple and handed the internet write access to
the project, since there is no sign-in.

So writes go through Server Actions instead. They run on the server under
`SUPABASE_SECRET_KEY`, which is read only by `lib/supabase/admin.ts` — a module
marked `server-only`, so an accidental client import is a build error rather
than a leak. Each action validates its input with Zod at the boundary, caps the
batch size, and returns a discriminated result rather than throwing, so the
message the user sees is one we wrote and the Postgres detail stays in the
server log.

Two consequences of that key are worth spelling out, because both are things
RLS was doing for free until now.

**The secret key bypasses RLS, so the tenant boundary is re-established by
hand.** The read path is scoped with `.eq('org_id', …)`; the writes must be too,
and nothing below `getSupabaseAdmin()` enforces it on their behalf. Log ids are
printed into the page's URLs and a Server Action is an ordinary endpoint, so
"the UI would never send that id" is not a control. Every write either filters
on `org_id` or checks ownership first, and answers "that log could not be found"
either way, so a caller cannot probe which ids are real.

**A Server Action with no sign-in is an open endpoint, so the rate limit is the
only ceiling — and it does not trust the caller.** `x-forwarded-for` is
attacker-controlled unless a proxy overwrites it, so varying it per request
would otherwise mint a fresh bucket each time and grow the bucket map without
bound. The limiter therefore always enforces a deployment-wide window, which
nothing the caller sends can evade, and only adds a per-client window when
`TRUST_PROXY_HEADERS=true` says the address can be believed.

### Who can do what

The rail has always drawn "Switch User" and "Log Out", so the product assumes
more than one person uses this screen. Making that real meant choosing which
half of auth to build first, and the order matters:

**Authorisation is real. Authentication is a picker.** `/sign-in` lists the
farm's members and signs the choice into a cookie that is httpOnly (script
cannot read it), sameSite=lax (it does not ride along on cross-site requests)
and HMAC-signed, so a browser can hold it but cannot mint one naming a different
member. There is no password to check. What happens *after* that is the part
worth defending: every one of the twenty writing Server Actions opens with

```ts
const { viewer, denial } = await requirePermission('logs:delete');
if (denial) return denial;
```

which re-derives the member from the cookie, looks the role up in the database
(not in the cookie — a demotion takes effect on the next request, not whenever
the cookie expires) and consults one table in `lib/permissions.ts`:

| | logs:write | logs:review | logs:delete | reference:write | reference:delete |
| --------- | :-: | :-: | :-: | :-: | :-: |
| **Admin** | ● | ● | ● | ● | ● |
| **Manager** | ● | ● | | ● | |
| **Worker** | | | | | |

One matrix you can read in a screen is one you can audit. The same condition
repeated at the top of twenty actions is how the seventeenth ends up disagreeing
with the other nineteen.

The check runs *before* the action looks anything up, so a refusal reveals
nothing about whether the record exists. And it is the server that refuses, not
the UI: hiding a button is a courtesy, and `verify-screens.js` asserts both — that
a Worker sees no write controls, and that a Manager is refused the delete the
matrix denies them.

Building it this way round was deliberate. A login form on top of actions that
never check a role is security theatre; the actions are what decide whether a
worker can delete a season of compliance records. Swapping the picker for
Supabase Auth changes where `memberId` comes from in `lib/session.ts` and
nothing else — every call site and the whole matrix stay as they are.

### CRUD

Every entity the main page reads is also writable. The table's five columns are
four foreign keys and a pair of timestamps, so "create a log" is only meaningful
if the collections behind those keys are editable too — otherwise the dashboard
can rearrange the seed but never exceed it.

| Entity | Create | Read | Update | Delete | Where |
| --- | --- | --- | --- | --- | --- |
| `activity_logs` | New Log | table | Edit log, Mark reviewed / new | Delete log, bulk Delete | toolbar, expanded panel, bulk bar |
| `employees` | ✓ | Active Workers, EMPLOYEE, filters | rename, activate / deactivate | ✓ when unused | Manage → Workers |
| `fields` | ✓ | FIELD, filters, map plot | rename | ✓ when unused | Manage → Fields |
| `activity_types` | ✓ | ACTIVITY, filters | rename | ✓ when unused | Manage → Activities |
| `tags` | ✓ | chips, TAG filter | rename | ✓ (detaches) | Manage → Tags, Add Tag |
| `recordings` | with the log | waveform, Summary | Correct transcript | with the log | expanded panel |

**Deletes are refused while something depends on them, except tags.** The
foreign keys from `activity_logs` are `restrict`, not `cascade`: losing eleven
logs because someone tidied a field name would be far worse than being told to
reassign them first, so the management screen shows each row's usage count and
disables its delete. Tags are the exception — `log_tags` cascades, because a tag
is an annotation and deleting one costs a label rather than the meaning of the
log. Deleting a log does cascade, to its recording and its tag links, since
neither exists independently.

**Every log expands, including one with no recording.** The panel is where a log
is edited and deleted as well as where its recording is played, so gating it on
`has_recording` would leave a hand-entered log — exactly the kind most likely to
need correcting — with no way to change it. `LogDetail.recording` is nullable
and the panel adapts: the transport becomes "no recording on this log", the
transcript editor is absent, and the map draws the field's plot but no pin,
because the plot belongs to the field while the pin is where the worker
actually stood.

**Deleting is one click, and undoable.** It used to arm on the first press and
commit on the second. That is the wrong trade: a confirm step taxes every
deliberate delete in order to guard against the occasional accident, and the
nine deletes out of ten that were meant pay for the one that was not. So the row
goes on the press, and an undo stands for eight seconds.

The undo is real, not a delayed delete. `deleteLogs` reads the rows out of all
three tables the log occupies — the log, its recording, its tag links — deletes
them, and holds the snapshot in `lib/undoBuffer.ts` under a random token, which
is the only thing the browser receives. `restoreLogs` reclaims that token exactly
once and puts the rows back under their original ids, so an undone delete leaves
the log identical rather than leaving a copy.

Keeping the snapshot on the server is the load-bearing part. Round-tripping it
through the page would make it client-controlled input on the way back, and
restoring it would become a way to write arbitrary transcripts and audio URLs
into the database. A token cannot be forged into anything: it either names rows
this server deleted, or it names nothing. The buffer is process memory with a
60-second TTL and a hard entry cap — undo is a few seconds of grace, not durable
state, and an expired or lost entry simply reports that the delete can no longer
be undone.

The single-row Delete in the expanded panel routes through the same path, so
there is one implementation and one behaviour.

**`transcription_confidence` is never touched by an edit.** It records how sure
the transcriber was, which a human correction does not change — and it is the
input to the Response Accuracy card, which would stop meaning anything if
fixing a typo quietly set it to 100%.

### What the interface implies but this build still does not do

**Passwords.** Sign-in picks a member and signs that choice into an httpOnly,
HMAC-signed cookie; there is no credential to check. The *authorisation* is real
— see **Who can do what** — and swapping the picker for Supabase Auth changes
where `memberId` comes from and nothing else. Doing it the other way round, a
login form over actions that never check a role, would have been the wrong half.

**A real map tile.** The satellite image is a static asset and the plots are
stored in its pixel space rather than in lat/long. Real geometry is the right
model and a tile server is the right source; both are a day's work and neither
would have changed a decision worth defending.

**Audio.** Waveforms, durations, transcripts, confidences and pins are all real
data; the audio files are not in the repository, so the player says the
recording is unavailable rather than pretending. `npm run attach-audio` wires
files in once they exist.

**Planned work.** The Schedule is a history, not a roster of assignments. Toph
captures logs after the fact, so a calendar of future tasks would be inventing a
feature the data cannot support.

## The backend the product implies

The dashboard is the second half of Toph. The first half is a worker holding a
phone, and the brief says so: workers "record audio recordings hands-free, and
Toph will transcribe and record the important information from their log into
the platform." That pipeline is built.

### `POST /api/ingest`

`multipart/form-data` — an `audio` file plus a `metadata` JSON part. Bearer
token (`INGEST_API_KEY`), rate-limited, 50MB cap, audio type allow-list.

```bash
curl -X POST http://localhost:3000/api/ingest   -H "Authorization: Bearer $INGEST_API_KEY"   -F "audio=@log.webm;type=audio/webm"   -F 'metadata={"employeeId":"<uuid>","language":"es","deviceLabel":"Pixel 7a"}'
```

`GET /api/ingest` returns what the device needs before it starts recording:
readiness, accepted MIME types, size cap and which providers are live.

### What happens to it

| Step | |
| ---- | --- |
| 1 | Audio → private Supabase Storage bucket, **before** anything is attempted on it |
| 2 | Transcribe → OpenAI Whisper, or Deepgram, or the device's own transcript |
| 3 | Extract → an LLM with a strict JSON schema, or a deterministic parser |
| 4 | Resolve the extracted names against this farm's activities, fields and products |
| 5 | Create the log, attach the recording, derive the waveform from the audio's bytes |
| 6 | File the compliance record if the worker said enough to build one |

Every step writes to `ingest_jobs`, so a failure is a row you can look at rather
than a request that vanished. The Settings screen shows the last twelve.

### Two decisions worth defending

**Nothing is ever dropped.** Unresolved fields become *warnings*, not errors: a
log with a transcript and no product is a gap the Audit Manager already surfaces
and a human fixes in ten seconds, while a rejected upload is a gap nobody knows
about. The only failure that discards a recording is a failed upload, which
returns 5xx so the device retries. The verification suite asserts this — an
unrecognised product still files a log, and that log shows up as an audit gap.

**It runs with no API keys at all.** With none configured, a device posts a
transcript it produced itself and extraction falls back to a parser that reads
the guided log's fixed shape ("what activity / where / anything else"), pulling
activity, field, product, rate, area, wind and temperature out of the answers.
That is not a mock — it is what a keyless deployment actually runs, and it is how
the whole pipeline is exercised in CI. Adding `OPENAI_API_KEY` swaps both
providers in without touching a call site.

### Storage and retention

Audio sits in a private bucket and reaches the browser only as a signed URL,
minted per request for a viewer who has already been authorised. Deleting a log
does not delete its audio immediately — the undo window needs it — so the
undo buffer takes a disposer that removes the objects once the window closes
without an undo. That is the first moment the recording is genuinely
unreachable rather than merely deleted.

### If you have keys to add

Drop any of these into `.env.local` and restart; nothing else changes.

| Key | Buys |
| --- | ---- |
| `INGEST_API_KEY` | opens the endpoint (it returns 503 without one) |
| `OPENAI_API_KEY` | Whisper transcription **and** schema-constrained extraction |
| `DEEPGRAM_API_KEY` | transcription only, if you prefer it to Whisper |
| `SESSION_SECRET` | signs session cookies independently of the Supabase key |

## Responsive behaviour

From the `xl` breakpoint (1280px) up, the page is the design: a 280px rail, a
main column taking the rest, the frame pinned to the viewport height so an
expanded panel scrolls inside itself. At exactly 1676px the geometry is
unchanged — rail 280px at x=10, main column 1366px at x=300.

Below `xl` the rail moves into a drawer behind a menu button, the page takes its
natural height, stat cards stack under `md`, the header stacks under `md`, and
the toolbar's chips wrap. The table keeps all five columns and scrolls sideways
inside the panel below 900px of track. The expanded detail is sized to the
panel's *visible* width (`100cqw` on an inline-size container) and pinned with
`sticky left-0`, so the rows slide under it while it stays put; its two columns
stack below `xl`. Nothing was restyled — only breakpoints were added to the
existing classes.

## Layout notes

Four things in the Figma data do not translate literally into CSS. Each is
commented at the point of use; they are collected here because they account for
every non-obvious value in the codebase.

**Figma strokes do not affect layout.** Frame strokes are inside-aligned: they
paint within the frame and change neither its size nor its content box. A CSS
`border` does both. Left as borders, every table row grew 1px and every chip 2px,
and the error compounded down the table. All strokes are therefore reproduced as
inset `box-shadow`s, declared in `tailwind.config.ts`.

**`justify-content: space-between` voids `gap` in Figma.** The log table's row
frame records both `space-between` and `gap: 30px`. Figma ignores item spacing in
space-between mode, and because the five data columns are set to fill, there is
no free space to distribute either — so the columns sit flush. Honouring the
recorded 30px pushed every column 30px right of the design.

**Some text nodes are trimmed to their cap height.** Most text sits in the 1.3
line box its type style declares, and matches CSS exactly. Three nodes do not —
the org name and role in the navigation rail, and the large metric on each stat
card — because they were resized by hand in Figma. These carry an explicit
`leading-[…]` measured from the design; without it the stat cards render 30px too
tall and the whole rail drifts.

**Two Tailwind utilities for the same property do not resolve in the order you
wrote them.** The row's action button composed a shared class string containing
`bg-white` with a state string adding `bg-black text-white`. Equal specificity,
so the winner is whichever Tailwind emits last in the stylesheet — and that is
`bg-white`. An open row's button was white text on a white pill: the reported
"the View text disappears". Each state now names its own background, and neither
can quietly outrank the other. The general rule: never let a conditional class
fight a base class for the same property; make the base class conditional too.

**The waveform's ticks are snapped to the device pixel grid.** Amplitude is
height, and every tick is the same weight — a thicker line would mean something
and there is nothing for it to mean. But laid out the obvious way, a 0.88px tick
at a percentage offset lands on fractional device pixels, and the browser spreads
it across two columns at whatever alpha the coverage works out to. Identical
ticks then render at visibly different weights, which is worse on the fractional
display scalings Windows defaults to. `RecordingWaveform` measures its container,
converts each tick to device pixels, rounds, and converts back; the nudge is at
most half a device pixel against a ~6px gap, so it is the same drawing, aligned.

**Reset clears to no filtering, not to the defaults.** The design's resting
view is itself two applied filters — sorted by date, scoped to this month — so
resetting *to* it would leave two chips standing and keep hiding every log
outside the current month, which reads as the button not working. Reset writes
`sort=none&range=all` rather than an empty URL, because the cleared state has to
survive a refresh; an empty URL means "the defaults".

**Hover only ever claims the travelling highlight; the container releases it.**
An item's `mouseleave` fires before the next item's `mouseenter`, so releasing
per item sent the wash back to its resting row between every pair of
neighbours — visible as a flicker down the table and a lurch across the rail's
section boundaries. Rows and nav items claim on enter; the table body and the
rail each clear once, on their own leave.

**A popover tracks its anchor on an animation frame, not on scroll events.** The
Filter menu hangs off a chip in a wrapping, right-aligned row, so picking a value
from the menu *moves the chip the menu is attached to* — applying one filter
shifted it 137px left while the menu stayed where it was, and from there the next
click was as likely to land outside the menu as inside it, which is why picking
two filters in a row so often shut it. Nothing fires an event when a sibling's
layout animation pushes your element sideways, so `Popover` re-measures its
anchor each frame while open and follows on a spring.

**Nothing carrying `layout` also animates `scale`.** Framer measures layout from
bounding rects, so an element doing both is animating towards a box its own
transform is still changing. Every toolbar chip is therefore two elements: the
outer one carries `layout` and fades, the inner one does the scale pop. Same rule
produced the row wash's rewrite, above.

**Indicators inside dialogs are positioned from measured layout, not
`layoutId`.** Framer's layout animations diff bounding rects, so an animating or
scaled ancestor feeds them wrong numbers — the manage dialog's tab pill was
being measured against a panel mid-transform. The panel now translates and fades
without scaling, and the pill animates `offsetLeft` / `offsetWidth`, which
transforms do not touch. The reference lists are a fixed height for the same
family of reason: sizing to content made the centred dialog resize from both
edges as you changed tabs.

**Body scroll locking is reference counted** (`useScrollLock`). Two overlays
each saving and restoring `body.style.overflow` will restore `hidden` when their
lifetimes overlap, leaving a page that looks normal and accepts no input.

**Every dialog and popover opened from the log panel renders through a portal.** Two
properties on its ancestors make an in-place overlay impossible. The scroll
container sets `container-type: inline-size` — needed so the expanded detail can
be `100cqw` — and size containment makes that element the containing block for
`position: fixed` descendants, so a "full screen" overlay would be clipped to the
panel. The expanded detail is additionally `position: sticky`, which *always*
establishes a stacking context, so a dialog declared inside it has its `z-index`
resolved within that context: the table's `sticky top-0 z-10` heading painted
straight through the expanded map at `z-50`. Rendering at `document.body`
escapes both, which is also why the map animates explicit geometry rather than a
shared `layoutId` — projection between a size-contained sticky subtree and the
document root is exactly the case layout animations get wrong.

**The navigation rail's stroke is translucent.** The MCP export reports both
stops of its gradient at full opacity, but the rendered frame disagrees:
sampling down the rail's right edge gives 242 at the top and 231 at the bottom
over white, which solves against the `#A6A6A6 → #595959` ramp to alpha 0.146 and
0.145 — consistent at every sample. At full strength the rail reads as a hard
outlined card rather than the hairline the design shows, so the stroke is drawn
at 0.15.

## Structure

```
app/
  page.tsx                      both design frames; ?open= decides which
  activity-logs/  map/  audit-manager/  reports/  schedule/
  employees/  performance/  messages/  settings/  support/
  sign-in/page.tsx              the account picker
  logs/[logId]/page.tsx         redirect, so old links still resolve
  api/exports/logs, /records    CSV, built from the same repositories
  api/ingest/route.ts           the field app posts recordings here
  icon.svg                      favicon
  error.tsx                     shown if the database cannot be reached
components/
  shell/                        AppShell, PageHeader, Panel, MetricCard, EmptyState
  nav/                          navigation rail, drawer, switch-user and sign-in
  dashboard/                    stat cards, log panel, toolbar menus, expanded detail
  logs/  map/  audit/  reports/  schedule/  employees/  performance/  settings/
  charts/                       BarList and WeeklyColumns — no charting dependency
  ui/Icon.tsx                   Lucide registry
  actions/                      Server Actions — the only things that write
    logs.ts                     create, update, delete + undo, set status
    applications.ts             file, complete and retract a compliance record
    products.ts                 the product register
    reference.ts                employees, fields, activity types
    tags.ts                     tags, and attaching them to logs
    recordings.ts               transcript corrections
    session.ts                  sign in as a member, sign out
lib/
  types.ts                      domain model
  logQuery.ts                   URL <-> query state
  logInput.ts, referenceInput.ts  form validation shared by the actions
  motion.ts                     springs, variants and shared layoutIds
  compliance.ts                 what makes a record complete; when a field is safe
  reports.ts                    the arithmetic behind Reports, as pure functions
  alerts.ts                     the Messages feed, derived from rows
  calendar.ts                   month-grid arithmetic, in UTC
  permissions.ts                the role matrix
  session.ts, viewer.ts         signed cookie, and who is asking
  csv.ts                        CSV with the spreadsheet-formula guard
  ingest/                       transcribe, extract, store, run the pipeline
  undoBuffer.ts                 server-side hold for an undoable delete
  loadDashboard.ts              one call that fetches a page's data
  repositories/                 Supabase queries, validated with zod
  supabase/server.ts            read client (publishable key)
  supabase/admin.ts             write client (secret key, server-only)
  rateLimit.ts, actionResult.ts, logger.ts
  format.ts, waveform.ts        presentation helpers
scripts/
  attach-audio.mjs              points recordings.audio_url at public/audio/
supabase/
  migrations/                   schema, applied through the Supabase MCP
  seed.sql                      the design's content plus ten synthesised recordings
```
