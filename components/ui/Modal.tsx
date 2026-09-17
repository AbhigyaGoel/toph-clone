'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { Icon } from '@/components/ui/Icon';
import { useScrollLock } from '@/components/ui/useScrollLock';
import { EASE_QUICK, SPRING_SOFT } from '@/lib/motion';

interface ModalProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly title: string;
  readonly children: ReactNode;
  /** Widens the panel for the management screen's lists. */
  readonly size?: 'form' | 'wide';
}

const WIDTH = { form: 'max-w-[520px]', wide: 'max-w-[760px]' } as const;

/**
 * A dialog rendered at the document root.
 *
 * The portal is load-bearing, not tidiness. These dialogs open from inside the
 * log panel, whose scroll container sets `container-type: inline-size` — which
 * makes it the containing block for `position: fixed` descendants, so a "full
 * screen" overlay declared in place would be clipped to the panel. The expanded
 * detail is additionally `position: sticky`, which always establishes a
 * stacking context and would trap the dialog's `z-index` beneath the table's
 * sticky heading. Rendering at `document.body` escapes both.
 *
 * Focus moves into the panel on open and returns to whatever opened it on
 * close, because these are opened from toolbar buttons the user will usually
 * want to press again.
 */
export function Modal({ open, onClose, title, children, size = 'form' }: ModalProps) {
  const [mounted, setMounted] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const restoreTo = useRef<HTMLElement | null>(null);

  useEffect(() => setMounted(true), []);

  const close = useCallback(() => {
    onClose();
    restoreTo.current?.focus();
  }, [onClose]);

  /** Everything inside the panel that can hold focus, in document order. */
  const focusableInPanel = useCallback(
    () =>
      panel.current
        ? [
            ...panel.current.querySelectorAll<HTMLElement>(
              'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
            ),
          ]
        : [],
    []
  );

  useEffect(() => {
    if (!open) return undefined;

    restoreTo.current = document.activeElement as HTMLElement | null;

    /*
      Focus has to be *moved* into the panel, not merely trapped once it happens
      to be there. The Tab handler below only acts when the active element is
      the first or last control inside; with focus still on the button that
      opened the dialog — outside the portal entirely — the first Tab went to
      the page behind it, so the trap never engaged and the dialog was modal in
      appearance only.

      Deferred a frame because the panel is portalled and animating in, so its
      children do not exist on the render that sets `open`. Fields carrying
      their own autofocus are left alone: a form that has already put the cursor
      where the user should type knows better than this does.
    */
    const frame = requestAnimationFrame(() => {
      if (!panel.current || panel.current.contains(document.activeElement)) return;
      const [first] = focusableInPanel();
      (first ?? panel.current).focus({ preventScroll: true });
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        close();
        return;
      }

      // A dialog that lets Tab wander back to the page behind it is a dialog in
      // name only, so focus cycles within the panel while it is open.
      if (event.key !== 'Tab' || !panel.current) return;

      const focusable = focusableInPanel();
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const inside = panel.current.contains(document.activeElement);

      // Focus that has escaped the panel — by a click on the page behind, or by
      // a control unmounting — is pulled back rather than left outside.
      if (!inside) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
        return;
      }

      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, close, focusableInPanel]);

  // Shared, reference-counted: two overlays each saving and restoring
  // `body.overflow` independently can leave it locked forever.
  useScrollLock(open);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={EASE_QUICK}
          onClick={close}
          className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/40 p-[16px] backdrop-blur-sm sm:items-center sm:p-[40px]"
        >
          <motion.div
            ref={panel}
            role="dialog"
            aria-modal
            aria-label={title}
            // Focusable as a last resort, never in the Tab order itself.
            tabIndex={-1}
            /*
              Translate and fade only, no scale. A scaling ancestor corrupts the
              bounding-rect measurements that any layout animation inside the
              panel depends on, which is how the tab indicator ended up in the
              wrong place. Keeping the panel unscaled makes the inside safe.
            */
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={SPRING_SOFT}
            onClick={(event) => event.stopPropagation()}
            className={`flex w-full ${WIDTH[size]} flex-col gap-[20px] rounded-[20px] bg-white p-[24px] shadow-panel`}
          >
            <div className="flex items-center justify-between gap-[10px]">
              <h2 className="text-[16px] font-normal leading-[1.3] text-black">{title}</h2>
              <motion.button
                type="button"
                onClick={close}
                aria-label="Close"
                whileHover={{ scale: 1.1, rotate: 90 }}
                whileTap={{ scale: 0.9 }}
                transition={SPRING_SOFT}
                className="flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-full text-[#4D4D4D] hover:bg-black/5"
              >
                <Icon name="x" />
              </motion.button>
            </div>

            {children}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body
  );
}
