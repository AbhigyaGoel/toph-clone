import Link from 'next/link';

import { ProductRegister } from '@/components/settings/ProductRegister';
import { VocabularyPanel } from '@/components/settings/VocabularyPanel';
import { Screen } from '@/components/shell/Screen';
import { Panel } from '@/components/shell/Panel';
import { Icon } from '@/components/ui/Icon';
import { PageEntrance } from '@/components/ui/PageEntrance';
import { can, ROLE_LABELS, ROLE_SUMMARIES } from '@/lib/permissions';
import { findProducts } from '@/lib/repositories/applications';
import { findMembers } from '@/lib/repositories/members';
import { findVocabularySources } from '@/lib/repositories/logs';
import { buildVocabulary } from '@/lib/vocabulary';
import { hasWriteCredentials } from '@/lib/supabase/admin';
import { currentViewer, signInAvailable } from '@/lib/viewer';

export const dynamic = 'force-dynamic';

/**
 * The register, the roster of accounts, and what this deployment can do.
 *
 * The product register is here rather than in the Audit Manager because it is
 * curated once a season, while an audit is assembled in an afternoon — and
 * because it is upstream of everything compliance: no application can be filed
 * for a product that does not exist, and the intervals entered here are what
 * every record is graded against.
 *
 * The deployment panel is deliberately blunt about what is and is not real.
 * Somebody reviewing this should not have to read the source to find out that
 * there are no passwords.
 */
export default async function SettingsPage() {
  const viewer = await currentViewer();
  const [products, members, vocabularySources] = await Promise.all([
    findProducts(viewer.organization.id),
    findMembers(viewer.organization.id),
    findVocabularySources(viewer.organization.id),
  ]);

  const vocabulary = buildVocabulary(vocabularySources);

  const role = viewer.member?.role ?? 'worker';

  return (
    <Screen
      title="Settings"
      subtitle="Your farm's reference data and this deployment"
    >
      <PageEntrance index={1}>
        <Panel title="Product register" icon="files">
          <ProductRegister
            products={products}
            canWrite={viewer.canWrite}
            canDelete={viewer.canWrite && can(role, 'reference:delete')}
            writeBlockedReason={viewer.writeBlockedReason}
          />
        </Panel>
      </PageEntrance>

      {/*
        Under the register, because it is the same subject seen from the other
        end: the register is what this farm calls things, and this is what the
        machine calls them before somebody corrects it.
      */}
      <PageEntrance index={2}>
        <Panel title={`Farm vocabulary (${vocabulary.filter((t) => t.corrections > 0).length} learned)`} icon="book-check">
          <VocabularyPanel terms={vocabulary} />
        </Panel>
      </PageEntrance>

      <PageEntrance index={3}>
        <div className="flex w-full flex-col gap-[10px] self-stretch lg:flex-row">
          <div className="flex min-w-0 flex-1 flex-col">
            <Panel title="Accounts" icon="users">
              <div className="flex flex-col">
                {members.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center justify-between gap-[10px] px-[30px] py-[14px] shadow-divider"
                  >
                    <span className="flex flex-col">
                      <span className="flex items-center gap-[8px] text-[14px] font-normal leading-[1.3] text-black">
                        {member.displayName}
                        {member.id === viewer.member?.id ? (
                          <span className="rounded-[80px] bg-[rgba(20,108,68,0.1)] px-[8px] py-[2px] text-[11px] font-normal leading-[1.3] text-[#146C44]">
                            You
                          </span>
                        ) : null}
                      </span>
                      <span className="text-[12px] font-normal leading-[1.4] text-[#4D4D4D]">
                        {ROLE_SUMMARIES[member.role]}
                      </span>
                    </span>
                    <span className="shrink-0 rounded-[80px] bg-black/[0.05] px-[10px] py-[3px] text-[12px] font-normal leading-[1.3] text-[#4D4D4D]">
                      {ROLE_LABELS[member.role]}
                    </span>
                  </div>
                ))}
                <p className="px-[30px] py-[14px] text-[12px] font-normal leading-[1.5] text-black opacity-40">
                  Switch between accounts from the bottom of the navigation rail. Every
                  write is authorised against the role on the server, so changing account
                  genuinely changes what the app will accept — not just what it draws.
                </p>
              </div>
            </Panel>
          </div>

          <div className="flex min-w-0 flex-1 flex-col">
            <Panel title="This deployment" icon="cog">
              <dl className="flex flex-col">
                <Row
                  label="Database"
                  value="Supabase Postgres"
                  note="Row Level Security grants select to the anonymous role and no writes at all."
                />
                <Row
                  label="Writes"
                  value={hasWriteCredentials() ? 'Enabled' : 'Read-only'}
                  note={
                    hasWriteCredentials()
                      ? 'Server Actions hold the secret key; the browser never sees it.'
                      : 'SUPABASE_SECRET_KEY is not set, so every write control explains itself and disables.'
                  }
                  tone={hasWriteCredentials() ? 'good' : 'warn'}
                />
                <Row
                  label="Sessions"
                  value={signInAvailable() ? 'Signed cookie' : 'Unavailable'}
                  note="httpOnly, sameSite=lax, HMAC-signed. No passwords — the sign-in screen picks a member, and the server re-derives the role from the cookie on every request."
                />
                <Row
                  label="Your access"
                  value={ROLE_LABELS[role]}
                  note={ROLE_SUMMARIES[role]}
                />
              </dl>
            </Panel>
          </div>
        </div>
      </PageEntrance>

      <PageEntrance index={4}>
        <Panel title="Farm data" icon="cog">
          <div className="flex flex-col gap-[10px] px-[30px] py-[20px]">
            <p className="text-[13px] font-normal leading-[1.5] text-[#4D4D4D]">
              Workers, fields, activity types and tags are edited where they are used: the
              crew from the Employees screen, and the rest from the Manage dialog in the
              dashboard&rsquo;s log panel. Both write through the same Server Actions as
              everything here.
            </p>
            <div className="flex flex-wrap gap-[10px] pt-[4px]">
              <Shortcut href="/employees" icon="users" label="Employees" />
              <Shortcut href="/" icon="cog" label="Manage farm data" />
              <Shortcut href="/audit-manager" icon="book-check" label="Audit Manager" />
            </div>
          </div>
        </Panel>
      </PageEntrance>
    </Screen>
  );
}

interface RowProps {
  readonly label: string;
  readonly value: string;
  readonly note: string;
  readonly tone?: 'good' | 'warn' | 'neutral';
}

function Row({ label, value, note, tone = 'neutral' }: RowProps) {
  const ink =
    tone === 'good' ? 'text-[#146C44]' : tone === 'warn' ? 'text-[#B00020]' : 'text-black';

  return (
    <div className="flex flex-col gap-[3px] px-[30px] py-[14px] shadow-divider">
      <div className="flex items-baseline justify-between gap-[10px]">
        <dt className="text-[10px] font-medium uppercase tracking-[0.04em] text-[#B3B3B3]">
          {label}
        </dt>
        <dd className={`text-[14px] font-normal leading-[1.3] ${ink}`}>{value}</dd>
      </div>
      <p className="text-[12px] font-normal leading-[1.5] text-[#4D4D4D]">{note}</p>
    </div>
  );
}

interface ShortcutProps {
  readonly href: string;
  readonly icon: 'users' | 'cog' | 'book-check';
  readonly label: string;
}

function Shortcut({ href, icon, label }: ShortcutProps) {
  return (
    <Link
      href={href}
      className="flex items-center gap-[6px] rounded-[80px] bg-white px-[14px] py-[6px] text-[14px] font-normal leading-[1.3] text-[#4D4D4D] shadow-chip outline-none focus-visible:ring-2 focus-visible:ring-black/30"
    >
      <Icon name={icon} />
      {label}
    </Link>
  );
}
