'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState, useTransition } from 'react';

import { updateTranscript } from '@/app/actions/recordings';
import {
  ERROR_TEXT,
  INPUT,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
} from '@/components/ui/formStyles';
import { attempt } from '@/lib/attempt';
import { EASE_QUICK, SPRING_SOFT } from '@/lib/motion';

interface TranscriptEditorProps {
  readonly logId: string;
  readonly transcript: string;
  readonly canWrite: boolean;
}

/**
 * Figma's "Summary" block, made correctable.
 *
 * This is the one field on the screen a machine wrote, so it is the one most
 * likely to be wrong — a transcriber that mishears "spinosad" leaves a log that
 * reads as nonsense and no way to say so. Editing is opt-in rather than a
 * permanently-open textarea, because the resting state of this panel is
 * reading, and the design's 30%-opacity paragraph is what reading looks like.
 */
export function TranscriptEditor({ logId, transcript, canWrite }: TranscriptEditorProps) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(transcript);
  const [error, setError] = useState<string | null>(null);
  const [busy, startWrite] = useTransition();

  // Opening a different row reuses this component; adopt the new transcript
  // unless the user is part-way through editing one.
  useEffect(() => {
    if (!editing) setValue(transcript);
  }, [transcript, editing]);

  const save = () => {
    setError(null);
    startWrite(async () => {
      const result = await attempt(() => updateTranscript(logId, value));
      if (!result.success) {
        setError(result.error);
        return;
      }
      setEditing(false);
    });
  };

  const cancel = () => {
    setValue(transcript);
    setError(null);
    setEditing(false);
  };

  return (
    <div className="flex flex-col justify-center gap-[17.6px] self-stretch">
      <div className="flex flex-col gap-[8px] self-stretch">
        <div className="flex items-center justify-between gap-[10px]">
          <h3 className="text-[16px] font-normal leading-[1.3] text-black">Summary</h3>

          {canWrite && !editing ? (
            <motion.button
              type="button"
              onClick={() => setEditing(true)}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              transition={SPRING_SOFT}
              className="text-[12px] font-normal leading-[1.3] text-[#4D4D4D] opacity-50 hover:opacity-100"
            >
              Correct transcript
            </motion.button>
          ) : null}
        </div>

        <AnimatePresence mode="wait" initial={false}>
          {editing ? (
            <motion.div
              key="editing"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={EASE_QUICK}
              className="flex flex-col gap-[10px]"
            >
              <textarea
                autoFocus
                rows={6}
                value={value}
                onChange={(event) => setValue(event.target.value)}
                aria-label="Recording transcript"
                className={`${INPUT} resize-y leading-[1.5]`}
              />

              {error ? (
                <p role="alert" className={ERROR_TEXT}>
                  {error}
                </p>
              ) : null}

              <div className="flex items-center justify-end gap-[8px]">
                <button type="button" onClick={cancel} className={SECONDARY_BUTTON}>
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={save}
                  disabled={busy || !value.trim()}
                  className={PRIMARY_BUTTON}
                >
                  {busy ? 'Saving…' : 'Save transcript'}
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.p
              key="reading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.3 }}
              exit={{ opacity: 0 }}
              transition={EASE_QUICK}
              className="whitespace-pre-wrap text-[16px] font-normal leading-[1.3] text-black"
            >
              {transcript}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
