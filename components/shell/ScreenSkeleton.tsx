'use client';

import { motion } from 'framer-motion';
import { usePathname } from 'next/navigation';

import { activeNavItemId, NAV_SECTIONS, OTHER_SECTION } from '@/lib/data/navigation';

/**
 * The shape of a screen, before the screen.
 *
 * The title is real, not a grey block. By the time this renders the URL has
 * already changed, and the rail knows what every URL is called — so the one
 * piece of the next screen that is knowable without asking the server is shown
 * immediately. Without it the heading flashes from "Dashboard" to a placeholder
 * to "Reports", which reads as two navigations rather than one.
 *
 * Everything below the title is genuinely unknown, and deliberately generic:
 * this stands in for eleven different layouts, and a skeleton that mimicked one
 * of them would be wrong on the other ten — a table outline resolving into a
 * map reads as the page having changed its mind.
 *
 * The blocks do not animate in. An entrance on a placeholder delays the only
 * thing a placeholder is for, which is being on screen within a frame.
 */
export function ScreenSkeleton() {
  const pathname = usePathname();
  const title = titleFor(pathname);

  return (
    <div className="flex w-full min-w-0 flex-1 flex-col items-center gap-[10px] self-stretch">
      <div className="flex flex-col items-stretch gap-[10px] self-stretch py-[20px] md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-[14px]">
          <div className="flex flex-col">
            {title ? (
              <h1 className="text-[20px] font-semibold leading-[1.3] text-black">{title}</h1>
            ) : (
              <Block className="my-[3px] h-[20px] w-[190px]" />
            )}
            <Block className="my-[3px] h-[15px] w-[300px]" delay={0.05} />
          </div>
        </div>
        <Block className="h-[38px] w-[220px]" delay={0.1} />
      </div>

      <div
        aria-hidden
        className="flex w-full flex-1 flex-col items-center self-stretch overflow-hidden rounded-[20px] bg-white shadow-panel"
      >
        <div className="flex items-center justify-between gap-[10px] self-stretch px-[16px] py-[20px] shadow-divider sm:px-[30px]">
          <Block className="h-[21px] w-[210px]" />
          <Block className="h-[32px] w-[120px]" delay={0.05} />
        </div>

        <div className="flex w-full flex-col gap-[2px] p-[16px] sm:p-[30px]">
          {Array.from({ length: 7 }, (_, index) => (
            <Block key={index} className="h-[46px] w-full" delay={0.04 * index} />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * What the screen at this path is called.
 *
 * Read from the navigation model rather than a second list, so a renamed screen
 * cannot end up with one name in the rail and another in its own loading state.
 */
function titleFor(pathname: string): string | null {
  const id = activeNavItemId(pathname);
  if (!id) return null;

  const items = [...NAV_SECTIONS, OTHER_SECTION].flatMap((section) => section.items);
  return items.find((item) => item.id === id)?.label ?? null;
}

interface BlockProps {
  readonly className: string;
  readonly delay?: number;
}

function Block({ className, delay = 0 }: BlockProps) {
  return (
    <motion.div
      aria-hidden
      initial={{ opacity: 0.35 }}
      animate={{ opacity: [0.35, 0.6, 0.35] }}
      transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut', delay }}
      className={`shrink-0 rounded-[7.04px] bg-black/[0.05] ${className}`}
    />
  );
}
