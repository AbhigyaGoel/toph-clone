/**
 * Domain types for the Toph dashboard.
 *
 * Toph is a farm work-logging platform: field workers dictate a voice log from a
 * mobile app, Toph transcribes it, and the farm admin reviews the structured
 * result here. These are the shapes the UI renders; the repositories in
 * `lib/repositories/` map Supabase rows onto them.
 */

export type LogStatus = 'new' | 'reviewed';

/** A single row in the "New Employee Logs" table. */
export interface ActivityLog {
  readonly id: string;
  /** Worker who dictated the log — table column EMPLOYEE. */
  readonly employee: string;
  /** Work category Toph extracted from the recording — column ACTIVITY. */
  readonly activity: string;
  /** Field / block identifier, e.g. "FIELD A". */
  readonly field: string;
  /** Shift window as ISO timestamps; formatted by `lib/format.ts`. */
  readonly startedAt: string;
  readonly endedAt: string;
  /** "new" logs feed the "1 New" qualifier and the nav badge. */
  readonly status: LogStatus;
}

/**
 * The expanded panel's payload for one log.
 *
 * `recording` is nullable because a log can exist before its audio does — a log
 * created by hand on this dashboard has no recording at all, and those are
 * precisely the logs most likely to need editing. The panel therefore opens for
 * any log and shows the recording section's empty state, rather than the row
 * refusing to expand and stranding its Edit and Delete controls.
 */
export interface LogDetail {
  readonly logId: string;
  readonly recording: RecordingDetail | null;
  /** Where the work happened, in the map frame's design pixels. */
  readonly location: MapLocation;
  /** Tags attached to this log, newest last. */
  readonly tags: readonly Tag[];
  /**
   * What was applied during this log, and whether anything had to be.
   *
   * Carried on the detail so the compliance record can be read and filed from
   * the panel the reviewer already has open. Sending them to the Audit Manager
   * to fix a gap they are currently looking at is three navigations to do one
   * thing.
   */
  readonly applications: readonly ApplicationRecord[];
  readonly requiresProduct: boolean;
  /**
   * The re-entry restriction running on this log's field, if any.
   *
   * On the detail rather than fetched per panel because it is one more thing
   * the server already knows, and because a manager reading a spray log is
   * exactly the person who needs to be told the block is still closed.
   */
  readonly restriction: RestrictedField | null;
  /**
   * Everything that has been done to this log, newest first.
   *
   * On the detail rather than fetched by the panel itself, because the panel is
   * a client component and this is one more row set the server already has the
   * organisation and the ids for. Fetching it client-side would add a round
   * trip to every row that opens.
   */
  readonly history: readonly AuditEvent[];
}

/** The recording half of the expanded panel, when the log has one. */
/**
 * One field the extractor pulled out, with how sure it was.
 *
 * `value` is null when the recording simply did not contain it — a harvest log
 * has no application rate — and `confidence` is null with it. A field the
 * machine guessed at badly is a different thing from a field that was never
 * said, and the panel has to be able to tell them apart.
 */
export interface ExtractedValue {
  readonly value: string | null;
  readonly confidence: number | null;
  /**
   * True once a person has typed this field.
   *
   * Kept distinct from a high confidence score because they mean different
   * things to a reviewer coming back to the log: one says the machine was sure,
   * the other says a human checked. Only the second is worth anything to an
   * inspector.
   */
  readonly corrected?: boolean;
  /**
   * What the extractor heard, before a person replaced it.
   *
   * Null when the field was simply blank. Present only on corrected fields,
   * and never overwritten by a second correction — see `correctExtractedField`.
   * It is what the farm's vocabulary is built from.
   */
  readonly original?: string | null;
}

/** The five fields a compliance record is assembled from. */
export interface ExtractedFields {
  readonly activityType?: ExtractedValue;
  readonly product?: ExtractedValue;
  readonly rate?: ExtractedValue;
  readonly field?: ExtractedValue;
  readonly weather?: ExtractedValue;
}

export interface RecordingDetail {
  /**
   * What the worker said, in the language they said it.
   *
   * This is the record. A translation is an aid for whoever is reading the
   * dashboard; an inspector asking what the applicator reported is entitled to
   * the words, not to a machine's paraphrase of them.
   */
  readonly summary: string;
  /** BCP-47-ish tag from the transcriber: 'en', 'es'. */
  readonly language: string;
  /** English rendering, when the original was not English. Never the record. */
  readonly translation: string | null;
  readonly durationSeconds: number;
  /**
   * Where the recording is served from, or null while no file is attached.
   * The player renders either way — with no file it reports the recording as
   * unavailable rather than pretending to play.
   */
  readonly audioUrl: string | null;
  readonly waveform: readonly WaveformBar[];
  /** What the AI read out of the words, or null on a hand-entered log. */
  readonly extracted: ExtractedFields | null;
}

/**
 * One field as the Map screen needs it: where it is, and what has happened on
 * it. `lastWorkedAt` is null for a block nobody has logged against — which is
 * information, not an absence to hide.
 */
export interface FieldOverview {
  readonly id: string;
  readonly name: string;
  readonly plot: MapPlot;
  readonly logCount: number;
  readonly unreviewedCount: number;
  readonly lastWorkedAt: string | null;
}

/**
 * One worker's record: the roster row and the Performance screen's unit.
 *
 * `hours` is rounded once in the repository rather than at each call site, so
 * the roster, the reports and the leaderboard cannot show three different
 * totals for the same person.
 */
export interface EmployeeOverview {
  readonly id: string;
  readonly name: string;
  readonly isActive: boolean;
  readonly logCount: number;
  readonly unreviewedCount: number;
  readonly hours: number;
  readonly lastLoggedAt: string | null;
  readonly fieldCount: number;
  readonly recordingCount: number;
  /**
   * Mean transcription confidence across this worker's recordings, 0-1.
   * Null when they have none — which is not the same as transcribing badly.
   */
  readonly meanConfidence: number | null;
}

export type ProductKind = 'chemical' | 'fertilizer' | 'amendment';

/**
 * Something the farm applies to a field.
 *
 * REI and PHI live on the product because they come off the registered label:
 * they are the same for every application of that product, and storing them per
 * application would let two records disagree about the law.
 */
export interface Product {
  readonly id: string;
  readonly name: string;
  readonly kind: ProductKind;
  /** EPA registration number. Required on a pesticide, absent on a fertilizer. */
  readonly epaRegistration: string | null;
  readonly activeIngredient: string | null;
  readonly rateUnit: string;
  /** Restricted-entry interval in hours: how long before anyone may go back in. */
  readonly reiHours: number | null;
  /** Pre-harvest interval in days. */
  readonly phiDays: number | null;
  /** How many applications reference it; drives whether it can be removed. */
  readonly applicationCount: number;
}

/**
 * One product applied during one log — the compliance record itself.
 *
 * This is the row an inspector asks to see, so it carries everything that
 * answers "what went on, where, by whom, at what rate, in what conditions", plus
 * the two derived dates that say when the field became safe again.
 */
export interface ApplicationRecord {
  readonly id: string;
  readonly logId: string;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly status: LogStatus;
  readonly applicator: string;
  readonly fieldId: string;
  readonly fieldName: string;
  readonly activityName: string;
  readonly productId: string;
  readonly productName: string;
  readonly kind: ProductKind;
  readonly epaRegistration: string | null;
  readonly activeIngredient: string | null;
  readonly rateUnit: string;
  readonly reiHours: number | null;
  readonly phiDays: number | null;
  readonly rate: number;
  readonly areaAcres: number | null;
  readonly windSpeedMph: number | null;
  readonly airTempF: number | null;
  /** When the restricted-entry interval ends. */
  readonly reiExpiresAt: string;
  /** The first day the field may be harvested, `YYYY-MM-DD`. */
  readonly phiClearsOn: string;
}

/**
 * A log that should have produced a compliance record and did not.
 *
 * The other half of an audit: the register can only show what was written down,
 * and the gaps are the part that fails an inspection.
 */
export interface MissingRecord {
  readonly logId: string;
  readonly startedAt: string;
  readonly employee: string;
  readonly fieldName: string;
  readonly activityName: string;
}

/** A label an admin attached to a log. Unique by name within an organisation. */
export interface Tag {
  readonly id: string;
  readonly name: string;
}

/**
 * A reference row as the management screen needs it: identity, label, and how
 * many logs depend on it.
 *
 * The count is what lets the UI answer "can this be deleted?" before the user
 * finds out from a foreign-key error. Employees, fields, activities and tags
 * differ only in their extra fields, so they share this shape.
 */
export interface ReferenceItem {
  readonly id: string;
  readonly name: string;
  /** Logs referencing this row; deleting is refused while it is above zero. */
  readonly logCount: number;
  /** Employees only — drives the Active Workers count. */
  readonly isActive?: boolean;
  /**
   * Activity types only — whether this kind of work owes a product record.
   *
   * Carried here so a row that has not loaded its detail yet can still tell
   * whether the panel will contain an "Applied" block, which is what lets the
   * loading skeleton reserve the right height instead of an average one.
   */
  readonly requiresProduct?: boolean;
}

/** The four editable reference collections behind the table's columns. */
export interface ReferenceData {
  readonly employees: readonly ReferenceItem[];
  readonly fields: readonly ReferenceItem[];
  readonly activityTypes: readonly ReferenceItem[];
  readonly tags: readonly ReferenceItem[];
}

/** What the log form submits, for both create and update. */
export interface LogInput {
  readonly employeeId: string;
  readonly activityTypeId: string;
  readonly fieldId: string;
  /** Calendar day, `YYYY-MM-DD`, read as UTC to match how times are displayed. */
  readonly date: string;
  /** `HH:MM`, 24-hour. */
  readonly startTime: string;
  readonly endTime: string;
  readonly status: LogStatus;
}

/** How a recording's waveform is stored: one amplitude (0-1) per tick. */
export interface WaveformData {
  readonly amplitudes: readonly number[];
  /** Leading ticks that carry signal; the rest is trailing silence. */
  readonly voicedBars: number;
}

/**
 * One vertical tick of the recording waveform.
 * Coordinates are in the design's 592 x 80.96 space.
 */
export interface WaveformBar {
  readonly x: number;
  readonly y: number;
  readonly height: number;
  /** Figma draws voiced ticks in #003930 and the rest at 25% opacity. */
  readonly emphasis: 'strong' | 'muted';
}

export interface MapPlot {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface MapPoint {
  readonly x: number;
  readonly y: number;
}

/**
 * Highlighted field boundary plus the worker's pin, in design pixels.
 *
 * The plot belongs to the field and is always known; the pin comes from the
 * recording, so a log without one shows where the work was meant to happen but
 * not where the worker stood.
 */
export interface MapLocation {
  readonly plot: MapPlot;
  readonly pin: MapPoint | null;
}

/** The numbers behind the three summary cards and the nav badge. */
export interface DashboardStats {
  readonly todaysRecordings: number;
  readonly newLogs: number;
  readonly activeWorkers: number;
  readonly responseAccuracy: number;
}

/** One "Todays Recordings" / "Active Workers" style summary card. */
export interface StatCard {
  readonly id: string;
  readonly label: string;
  /** Kept numeric so the card can animate between values rather than swap text. */
  readonly value: number;
  /** Optional muted qualifier rendered beside the number, e.g. "1 New". */
  readonly note?: string;
  readonly icon: StatIcon;
}

export type StatIcon = 'calendar' | 'clipboard-pen' | 'percent';

/** A chip in the log panel toolbar. Selected chips invert to a black fill. */
export interface FilterChip {
  readonly id: string;
  readonly label: string;
  readonly icon: 'x' | 'list-filter' | 'funnel';
  readonly selected: boolean;
}

/** Values the Filter menu can offer, straight from the reference tables. */
export interface FilterOptions {
  readonly activities: readonly string[];
  readonly fields: readonly string[];
  readonly employees: readonly string[];
  /** Tag names the organisation has created; a tag becomes filterable on use. */
  readonly tags: readonly string[];
}

/** One link in the left navigation rail. */
export interface NavItem {
  readonly id: string;
  readonly label: string;
  readonly icon: NavIcon;
  /**
   * Where the item goes. Absent on the two footer items, which are actions
   * rather than destinations — that absence is what makes them render as
   * buttons instead of links.
   */
  readonly href?: string;
  /** Count pill rendered on the right of the button, e.g. Dashboard's "1". */
  readonly badge?: string;
}

export type NavIcon =
  | 'chart-line'
  | 'audio-lines'
  // The Day Replay's rail icon. Not in the Figma, which draws no such screen.
  | 'play'
  | 'map'
  | 'book-check'
  | 'files'
  | 'calendar'
  | 'users'
  | 'chart-pie'
  | 'mail'
  | 'cog'
  | 'handshake'
  | 'arrow-right-left'
  | 'log-out';

/** A labelled group of navigation items ("OVERVIEW", "COMPLIANCE", ...). */
export interface NavSection {
  readonly id: string;
  readonly label: string;
  readonly items: readonly NavItem[];
}

/** The signed-in organisation shown at the top of the rail. */
export interface Organization {
  readonly id: string;
  readonly name: string;
  readonly role: string;
  readonly avatarSrc: string;
}

export type MemberRole = 'admin' | 'manager' | 'worker';

/** A person with access to this organisation's dashboard. */
export interface Member {
  readonly id: string;
  readonly displayName: string;
  readonly role: MemberRole;
}

/**
 * Who is using the screen, resolved once per request.
 *
 * `member` is null when nothing is signed in. `canWrite` folds in whether the
 * deployment has write credentials at all, because a read-only build and a
 * read-only role produce the same answer for the UI and only differ in the
 * reason — which is what `writeBlockedReason` carries.
 */
export interface Viewer {
  readonly member: Member | null;
  readonly organization: Organization;
  readonly canWrite: boolean;
  readonly writeBlockedReason: string | null;
}

/** What a trail event says happened. */
export type AuditAction = 'create' | 'update' | 'delete' | 'restore';

export type AuditEntityType =
  | 'log'
  | 'application'
  | 'product'
  | 'employee'
  | 'field'
  | 'activity_type'
  | 'tag'
  | 'recording'
  | 'member';

/**
 * What a changed field can hold in the trail.
 *
 * Scalars only, and that is a constraint on what may be audited rather than a
 * simplification: a change the trail cannot render as one readable line is a
 * change nobody will read. Composite edits are recorded field by field.
 */
export type ChangeValue = string | number | boolean | null;

/**
 * One entry in the farm's tamper-evident history.
 *
 * `actorLabel` rather than a join to `members`: the name is captured at the
 * time of the event and must survive that member being removed, which a join
 * would not.
 */
export interface AuditEvent {
  readonly id: string;
  readonly actorId: string | null;
  readonly actorLabel: string;
  readonly action: AuditAction;
  readonly entityType: AuditEntityType;
  readonly entityId: string;
  readonly summary: string;
  readonly changes: Readonly<Record<string, { readonly from: ChangeValue; readonly to: ChangeValue }>>;
  readonly createdAt: string;
}


/** The things a search can land on. */
export type SearchKind = 'log' | 'worker' | 'field' | 'product' | 'tag' | 'activity';

/**
 * One result in the command palette.
 *
 * Carries no href. Where a hit goes is a client concern — a worker becomes a
 * filter on the logs screen, a product becomes a row on the register — and
 * baking the URL into the row would make the database responsible for routing.
 */
export interface SearchHit {
  readonly kind: SearchKind;
  readonly id: string;
  readonly label: string;
  readonly sublabel: string;
}

/**
 * One thing waiting on the manager.
 *
 * There used to be a second, near-identical `LogException` for the dashboard's
 * own triage queue — the same four fields with one fewer severity. Two types
 * meant two rankings that could drift apart, and two screens that could disagree
 * about whether a log was compliant. There is one list now, and the dashboard
 * shows a count of it rather than a copy.
 *
 * Ordered by consequence, not volume: a field somebody could walk into outranks
 * a record an inspector would fault, which outranks a transcript that merely
 * reads badly, which outranks one nobody has read yet.
 */
export interface InboxItem {
  readonly kind: 'log' | 'field';
  readonly id: string;
  readonly title: string;
  readonly reason: string;
  readonly severity: 'safety' | 'compliance' | 'anomaly' | 'quality' | 'review';
  /** When it happened, ISO — the log's start, or when a restriction clears. */
  readonly at: string;
  /** Who or what it came from, shown where an email client shows the sender. */
  readonly from: string;
  /** Whether it can be cleared from here, rather than by the world changing. */
  readonly actionable: boolean;
  /**
   * A restriction's particulars, so the row can explain itself without a fetch.
   *
   * Present only on `kind: 'field'` items. A log item's detail is the log, which
   * is loaded on demand when the row opens.
   */
  readonly restriction?: {
    readonly productName: string;
    readonly clearsAt: string;
  };
  /**
   * A rate anomaly's particulars, so the row explains itself without a fetch.
   *
   * Present only on `severity: 'anomaly'`. Carries both numbers because the
   * claim is a comparison — "2 gal/acre" means nothing without "they normally
   * apply 0.5".
   */
  readonly anomaly?: {
    readonly rate: number;
    readonly average: number;
    readonly multiple: number;
    readonly rateUnit: string | null;
    readonly sampleSize: number;
    readonly direction: 'high' | 'low';
  };
}

/** A field still inside a restricted-entry interval. */
export interface RestrictedField {
  readonly fieldId: string;
  readonly fieldName: string;
  /** The product whose interval runs longest — the one that governs. */
  readonly productName: string;
  readonly clearsAt: string;
}
