'use client';

import { motion } from 'framer-motion';
import { useEffect, useId, useRef, useState } from 'react';

import { FilterChipButton } from '@/components/dashboard/FilterChipButton';
import { Icon } from '@/components/ui/Icon';
import { Popover } from '@/components/ui/Popover';
import { EASE_QUICK, menuItemVariants, SPRING_SOFT } from '@/lib/motion';
import type { FilterChip } from '@/lib/types';

export interface ChipMenuOption {
  readonly id: string;
  readonly label: string;
  readonly selected: boolean;
  readonly onSelect: () => void;
}

export interface ChipMenuSection {
  readonly id: string;
  readonly label: string;
  readonly options: readonly ChipMenuOption[];
}

interface ChipMenuProps {
  readonly chip: FilterChip;
  readonly sections: readonly ChipMenuSection[];
  /** Menus for single-choice settings close on pick; multi-select ones stay open. */
  readonly closeOnSelect?: boolean;
}

/**
 * A toolbar chip that opens a menu beneath itself.
 *
 * The design draws the Sort and Filter chips but not what they open, so the
 * panel borrows the rest of the page's vocabulary: the chip surface and shadow,
 * the rail's 10px grey section captions, and 14px #4D4D4D rows.
 *
 * The panel is a `Popover`, so it renders at the document root rather than
 * inside the log panel — which is `overflow-hidden` and would otherwise cut the
 * menu off at its edge. A multi-select menu stays open while you tick values,
 * and each tick animates in place; the whole point of leaving it open is
 * watching the set build up.
 */
export function ChipMenu({ chip, sections, closeOnSelect = false }: ChipMenuProps) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return undefined;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      // The panel lives in a portal, so "inside the menu" is not "inside the
      // chip's DOM subtree" — ask the panel itself.
      const insideAnchor = anchor.current?.contains(target);
      const insidePanel = document.getElementById(panelId)?.contains(target);
      if (!insideAnchor && !insidePanel) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, panelId]);

  const pick = (option: ChipMenuOption) => {
    option.onSelect();
    if (closeOnSelect) setOpen(false);
  };

  return (
    <div ref={anchor} className="relative">
      <FilterChipButton
        chip={chip}
        expanded={open}
        controls={panelId}
        onClick={() => setOpen((current) => !current)}
      />

      <Popover
        open={open}
        anchor={anchor}
        align="end"
        id={panelId}
        role="menu"
        className="flex min-w-[220px] flex-col gap-[4px]"
      >
        {sections.map((section) => (
          <div key={section.id} className="flex flex-col gap-[2px]">
            <motion.span
              variants={menuItemVariants}
              className="px-[10px] py-[4px] text-[10px] font-medium leading-[1.3] text-[#B3B3B3]"
            >
              {section.label}
            </motion.span>

            {section.options.map((option) => (
              <motion.button
                key={option.id}
                type="button"
                role="menuitemcheckbox"
                aria-checked={option.selected}
                variants={menuItemVariants}
                onClick={() => pick(option)}
                whileHover={{ x: 2 }}
                whileTap={{ scale: 0.98 }}
                transition={SPRING_SOFT}
                className="flex w-full items-center justify-between gap-[10px] whitespace-nowrap rounded-[4px] px-[10px] py-[8px] text-left text-[14px] font-normal leading-[1.3] text-[#4D4D4D] hover:bg-black/5"
              >
                {option.label}

                <motion.span
                  initial={false}
                  animate={{ opacity: option.selected ? 1 : 0, scale: option.selected ? 1 : 0.6 }}
                  transition={EASE_QUICK}
                  className="flex items-center text-black"
                >
                  <Icon name="check" />
                </motion.span>
              </motion.button>
            ))}
          </div>
        ))}
      </Popover>
    </div>
  );
}
