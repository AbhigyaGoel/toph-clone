import type { ReactNode } from 'react';

import { Icon, type IconName } from '@/components/ui/Icon';

interface EmptyStateProps {
  readonly icon: IconName;
  readonly title: string;
  readonly body: string;
  /** Optional way out: a button, a link to the screen that would fill this. */
  readonly action?: ReactNode;
}

/**
 * What a panel says when it has nothing to show.
 *
 * Always two lines: what is missing, and why it might be — an empty table with
 * no explanation reads as a failure, and on this product most emptiness is good
 * news ("nothing is under a re-entry restriction") rather than an error.
 */
export function EmptyState({ icon, title, body, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-[10px] px-[30px] py-[56px] text-center">
      <span className="flex h-[40px] w-[40px] items-center justify-center rounded-full bg-black/[0.04] text-[#4D4D4D]">
        <Icon name={icon} size={18} />
      </span>
      <p className="text-[14px] font-medium leading-[1.3] text-black">{title}</p>
      <p className="max-w-[420px] text-[13px] font-normal leading-[1.5] text-[#4D4D4D]">{body}</p>
      {action ? <div className="pt-[6px]">{action}</div> : null}
    </div>
  );
}
