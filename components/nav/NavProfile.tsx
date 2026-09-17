'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { Icon } from '@/components/ui/Icon';
import type { Organization } from '@/lib/types';

interface NavProfileProps {
  readonly organization: Organization;
  /** How many things are waiting in the inbox; 0 hides the dot. */
  readonly inboxCount: number;
}

/**
 * Figma `Frame 152` — the org avatar, name and role, with the inbox affordance
 * pushed to the far edge of the rail.
 *
 * The inbox is a link rather than the decorative glyph the design shows. An icon
 * that looks like a button and does nothing is worse than no icon: it is the one
 * control on this screen that teaches people the chrome is fake. The count sits
 * on it for the same reason mail clients put it there — the number is the reason
 * you look at the rail at all.
 */
export function NavProfile({ organization, inboxCount }: NavProfileProps) {
  const pathname = usePathname();
  const active = pathname.startsWith('/inbox');

  return (
    <div className="flex items-center justify-between gap-[10px] self-stretch rounded-[4px] py-[4px] pl-[4px] pr-[10px]">
      <div className="flex items-center justify-center gap-[10px]">
        <div className="relative h-[42px] w-[42px] shrink-0 overflow-hidden rounded-full">
          <Image
            src={organization.avatarSrc}
            alt=""
            fill
            sizes="42px"
            className="object-cover"
            priority
          />
          {/* effect_63WVIF sits above the photo, so it needs its own layer. */}
          <span aria-hidden className="absolute inset-0 rounded-full shadow-avatar-inset" />
        </div>

        {/*
          The two text nodes in this block were trimmed to their cap height in
          Figma rather than left at the 1.3 line box the type style declares, so
          the 8px gap reads as ~8px of visible space. Matching that needs an
          explicit 10.2px leading (14px Geist cap height); leaving it at 1.3
          pushes the role 6px down and drags the whole rail with it.
        */}
        <div className="flex flex-col gap-[8px]">
          <span className="text-[14px] font-medium leading-[10.2px] text-black">
            {organization.name}
          </span>
          <div className="flex items-center gap-[5px] self-stretch">
            {/* 10x10 at a 1px stroke: 1 * 24 / 10 = 2.4 viewBox units. */}
            <Icon name="user-star" size={10} strokeWidth={2.4} className="text-[#808080]" />
            <span className="text-[14px] font-medium leading-[10.2px] text-[#808080]">
              {organization.role}
            </span>
          </div>
        </div>
      </div>

      <Link
        href="/inbox"
        aria-label={
          inboxCount > 0 ? `Inbox, ${inboxCount} unread` : 'Inbox, nothing unread'
        }
        aria-current={active ? 'page' : undefined}
        className={`relative flex h-[32px] w-[32px] shrink-0 items-center justify-center rounded-[8px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-black/30 ${
          active ? 'bg-black/[0.06] text-black' : 'text-[#4D4D4D] hover:bg-black/[0.04]'
        }`}
      >
        <Icon name="inbox" />
        {inboxCount > 0 ? (
          <span className="absolute right-[3px] top-[3px] flex h-[15px] min-w-[15px] items-center justify-center rounded-full bg-[#B00020] px-[4px] text-[9px] font-medium leading-none text-white">
            {inboxCount > 9 ? '9+' : inboxCount}
          </span>
        ) : null}
      </Link>
    </div>
  );
}
