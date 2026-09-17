'use client';

import { NavButton } from '@/components/nav/NavButton';
import type { NavSection } from '@/lib/types';

interface NavSectionGroupProps {
  readonly section: NavSection;
  /**
   * The design's "OTHER" group is the one set to fill the rail's leftover
   * height, which is what anchors Switch User / Log Out to the bottom.
   */
  readonly fillRemainingHeight?: boolean;
  /** The rail's single highlighted item, which may be in another section. */
  readonly highlightedId: string | null;
  /** The item whose route is open, which may also be in another section. */
  readonly activeId: string | null;
  readonly onHover: (id: string) => void;
  /** Reports the click so the rail can mark the destination before it loads. */
  readonly onNavigate?: (id: string) => void;
}

/** Figma `Frame 154` / `155` / `156` / `157` — a captioned group of nav buttons. */
export function NavSectionGroup({
  section,
  fillRemainingHeight = false,
  highlightedId,
  activeId,
  onHover,
  onNavigate,
}: NavSectionGroupProps) {
  return (
    <div
      className={`flex flex-col gap-[4px] self-stretch ${fillRemainingHeight ? 'flex-1' : ''}`}
    >
      <div className="flex items-center gap-[10px] self-stretch px-[10px] py-[4px]">
        <span className="text-[10px] font-medium leading-[1.3] text-[#B3B3B3]">
          {section.label}
        </span>
      </div>
      {section.items.map((item) => (
        <NavButton
          key={item.id}
          item={item}
          highlighted={item.id === highlightedId}
          active={item.id === activeId}
          onHover={onHover}
          onNavigate={onNavigate}
        />
      ))}
    </div>
  );
}
