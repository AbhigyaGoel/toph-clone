'use client';

import { AnimatePresence, motion } from 'framer-motion';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

import { Icon } from '@/components/ui/Icon';
import { SPRING_SOFT } from '@/lib/motion';

export type ToastTone = 'info' | 'error';

export interface ToastAction {
  readonly label: string;
  readonly onSelect: () => void;
}

export interface Toast {
  readonly id: string;
  readonly tone: ToastTone;
  readonly message: string;
  readonly action?: ToastAction;
  readonly durationMs: number;
  /** Draws the countdown bar. Only meaningful alongside an action. */
  readonly showProgress: boolean;
}

interface ToastInput {
  readonly tone?: ToastTone;
  readonly message: string;
  readonly action?: ToastAction;
  readonly durationMs?: number;
  readonly showProgress?: boolean;
}

interface ToastApi {
  readonly show: (toast: ToastInput) => string;
  readonly dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

/** Errors linger; an offer with a deadline says how long it has. */
const DEFAULT_MS: Record<ToastTone, number> = { info: 8_000, error: 7_000 };

/**
 * One place notices come out of.
 *
 * Before this, a failed write surfaced in whichever component happened to own
 * the call: an inline paragraph in the bulk bar, a red line inside a dialog, a
 * sentence above a table. Three treatments for one kind of event, none of them
 * visible if you had scrolled away from the thing that failed.
 *
 * A toast is not decoration here — it is the only surface that can report a
 * failure whose origin is off screen, which is most of them once a write
 * revalidates the whole route.
 */
export function ToastProvider({ children }: { readonly children: ReactNode }) {
  const [toasts, setToasts] = useState<readonly Toast[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback(
    (input: ToastInput): string => {
      const tone = input.tone ?? 'info';
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const durationMs = input.durationMs ?? DEFAULT_MS[tone];

      const toast: Toast = {
        id,
        tone,
        message: input.message,
        action: input.action,
        durationMs,
        showProgress: input.showProgress ?? Boolean(input.action),
      };

      // Newest at the bottom, nearest the eye; three at a time is plenty.
      setToasts((current) => [...current, toast].slice(-3));
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), durationMs)
      );

      return id;
    },
    [dismiss]
  );

  const api = useMemo<ToastApi>(() => ({ show, dismiss }), [show, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside a ToastProvider.');
  return context;
}

interface ToastViewportProps {
  readonly toasts: readonly Toast[];
  readonly onDismiss: (id: string) => void;
}

function ToastViewport({ toasts, onDismiss }: ToastViewportProps) {
  const [mounted, setMounted] = useState(false);

  // Deliberately an effect and not a render-time `typeof document` check. The
  // check is true on the client's very first render and false on the server, so
  // the portal exists in one tree and not the other and React reports a
  // hydration mismatch. An effect runs only after hydration has agreed.
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return createPortal(
    <div
      // Not aria-live: each toast announces itself with its own role, so the
      // container announcing as well would double every message.
      className="pointer-events-none fixed bottom-[24px] left-1/2 z-[140] flex -translate-x-1/2 flex-col items-center gap-[8px]"
    >
      <AnimatePresence initial={false}>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            layout
            role={toast.tone === 'error' ? 'alert' : 'status'}
            aria-live={toast.tone === 'error' ? 'assertive' : 'polite'}
            initial={{ y: 24, opacity: 0, scale: 0.97 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 12, opacity: 0, scale: 0.97 }}
            transition={SPRING_SOFT}
            className={`pointer-events-auto flex flex-col overflow-hidden rounded-[14px] shadow-chip ${
              toast.tone === 'error' ? 'bg-[#8A0018]' : 'bg-[#1A1A1A]'
            }`}
          >
            <div className="flex items-center gap-[16px] px-[18px] py-[12px]">
              {toast.tone === 'error' ? (
                <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-white/15 text-white">
                  <Icon name="x" size={10} />
                </span>
              ) : null}

              <span className="max-w-[460px] text-[14px] font-normal leading-[1.4] text-white">
                {toast.message}
              </span>

              {toast.action ? (
                <button
                  type="button"
                  onClick={() => {
                    onDismiss(toast.id);
                    toast.action?.onSelect();
                  }}
                  className="shrink-0 rounded-[80px] bg-white/10 px-[12px] py-[4px] text-[14px] font-normal leading-[1.3] text-white outline-none transition-colors hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-white/50"
                >
                  {toast.action.label}
                </button>
              ) : null}

              <button
                type="button"
                onClick={() => onDismiss(toast.id)}
                aria-label="Dismiss"
                className="shrink-0 text-[14px] font-normal leading-[1.3] text-white/50 outline-none transition-colors hover:text-white focus-visible:text-white"
              >
                ✕
              </button>
            </div>

            {toast.showProgress ? (
              <motion.span
                initial={{ scaleX: 1 }}
                animate={{ scaleX: 0 }}
                transition={{ duration: toast.durationMs / 1000, ease: 'linear' }}
                className="h-[2px] w-full origin-left bg-white/30"
              />
            ) : null}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>,
    document.body
  );
}
