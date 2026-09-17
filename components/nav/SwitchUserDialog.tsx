'use client';

import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { signInAs } from '@/app/actions/session';
import { Icon } from '@/components/ui/Icon';
import { Modal } from '@/components/ui/Modal';
import { attempt } from '@/lib/attempt';
import { ROLE_LABELS, ROLE_SUMMARIES } from '@/lib/permissions';
import { SPRING_SOFT } from '@/lib/motion';
import type { Member } from '@/lib/types';

interface SwitchUserDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly members: readonly Member[];
  readonly currentMemberId: string | null;
}

/**
 * The rail's "Switch User", doing what it says.
 *
 * Picking a member re-issues the session cookie and revalidates the layout, so
 * the role chip in the rail, the write controls on every screen and what the
 * Server Actions will actually allow all change together on the next render.
 * The list says what each role can do, because the interesting part of
 * switching is watching the page lose and regain capabilities — a picker that
 * only showed names would hide the whole point.
 */
export function SwitchUserDialog({
  open,
  onClose,
  members,
  currentMemberId,
}: SwitchUserDialogProps) {
  const router = useRouter();
  const [pending, startSwitch] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const choose = (memberId: string) => {
    if (memberId === currentMemberId) {
      onClose();
      return;
    }

    setError(null);
    startSwitch(async () => {
      const result = await attempt(() => signInAs(memberId));
      if (!result.success) {
        setError(result.error);
        return;
      }
      onClose();
      router.refresh();
    });
  };

  return (
    <Modal open={open} onClose={onClose} title="Switch user">
      <div className="flex flex-col gap-[8px]">
        {members.map((member) => {
          const current = member.id === currentMemberId;

          return (
            <motion.button
              key={member.id}
              type="button"
              onClick={() => choose(member.id)}
              disabled={pending}
              whileHover={pending ? undefined : { x: 2 }}
              whileTap={pending ? undefined : { scale: 0.99 }}
              transition={SPRING_SOFT}
              aria-current={current ? 'true' : undefined}
              className={`flex items-center justify-between gap-[14px] rounded-[10px] px-[14px] py-[12px] text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-black/30 disabled:opacity-50 ${
                current ? 'bg-black/[0.06]' : 'hover:bg-black/[0.03]'
              }`}
            >
              <span className="flex flex-col">
                <span className="text-[14px] font-medium leading-[1.3] text-black">
                  {member.displayName}
                </span>
                <span className="text-[12px] font-normal leading-[1.4] text-[#4D4D4D]">
                  {ROLE_SUMMARIES[member.role]}
                </span>
              </span>

              <span className="flex shrink-0 items-center gap-[8px]">
                <span className="rounded-[80px] bg-black/[0.06] px-[10px] py-[3px] text-[12px] font-normal leading-[1.3] text-[#4D4D4D]">
                  {ROLE_LABELS[member.role]}
                </span>
                {current ? (
                  <span className="flex items-center text-[#146C44]">
                    <Icon name="check" />
                  </span>
                ) : null}
              </span>
            </motion.button>
          );
        })}
      </div>

      {error ? (
        <p role="alert" className="text-[12px] font-normal leading-[1.4] text-[#B00020]">
          {error}
        </p>
      ) : null}

      <p className="text-[12px] font-normal leading-[1.4] text-black opacity-40">
        No password is asked for — this build authenticates by picking a member and
        signing the choice into an httpOnly cookie. What the role permits is
        re-checked on the server for every write.
      </p>
    </Modal>
  );
}
