'use client';

import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { signInAs } from '@/app/actions/session';
import { Icon } from '@/components/ui/Icon';
import { attempt } from '@/lib/attempt';
import { ROLE_LABELS, ROLE_SUMMARIES } from '@/lib/permissions';
import { SPRING_SOFT } from '@/lib/motion';
import type { Member } from '@/lib/types';

interface SignInListProps {
  readonly members: readonly Member[];
}

/**
 * The account picker on the sign-in screen.
 *
 * Each row says what the role can do, so the choice is informative rather than
 * a list of strangers' names — and so that a reviewer can see the permission
 * model before they have clicked anything.
 */
export function SignInList({ members }: SignInListProps) {
  const router = useRouter();
  const [pending, startSignIn] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);

  const choose = (memberId: string) => {
    setError(null);
    setChosen(memberId);

    startSignIn(async () => {
      const result = await attempt(() => signInAs(memberId));
      if (!result.success) {
        setError(result.error);
        setChosen(null);
        return;
      }
      router.replace('/');
    });
  };

  return (
    <div className="flex flex-col gap-[10px]">
      {members.map((member) => (
        <motion.button
          key={member.id}
          type="button"
          onClick={() => choose(member.id)}
          disabled={pending}
          whileHover={pending ? undefined : { y: -1, scale: 1.01 }}
          whileTap={pending ? undefined : { scale: 0.99 }}
          transition={SPRING_SOFT}
          className="flex items-center justify-between gap-[14px] rounded-[14px] bg-white px-[18px] py-[14px] text-left shadow-chip outline-none focus-visible:ring-2 focus-visible:ring-black/30 disabled:cursor-not-allowed disabled:opacity-60"
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
            <span className="flex items-center text-[#4D4D4D]">
              <Icon name={chosen === member.id ? 'check' : 'arrow-right-left'} size={14} />
            </span>
          </span>
        </motion.button>
      ))}

      {error ? (
        <p role="alert" className="text-[12px] font-normal leading-[1.4] text-[#B00020]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
