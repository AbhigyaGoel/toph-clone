'use client';

import { motion } from 'framer-motion';

import { ApplicationPanel } from '@/components/dashboard/ApplicationPanel';
import { ExtractedFields } from '@/components/dashboard/ExtractedFields';
import { LogHistory } from '@/components/dashboard/LogHistory';
import { FieldMap } from '@/components/dashboard/FieldMap';
import { FieldSafety } from '@/components/dashboard/FieldSafety';
import { RecordingPlayer } from '@/components/dashboard/RecordingPlayer';
import { TagPicker } from '@/components/dashboard/TagPicker';
import { TranscriptEditor } from '@/components/dashboard/TranscriptEditor';
import { DANGER_BUTTON, SECONDARY_BUTTON } from '@/components/ui/formStyles';
import { Icon } from '@/components/ui/Icon';
import { SPRING_SOFT } from '@/lib/motion';
import type { LogDetail, Product, ReferenceData } from '@/lib/types';

interface ExpandedLogDetailProps {
  readonly detail: LogDetail;
  /** The row's employee and field, for the controls' labels and the dialog. */
  readonly employeeLabel: string;
  readonly fieldLabel: string;
  /** Every tag the organisation has, offered before free text. */
  readonly availableTags: readonly string[];
  readonly canWrite: boolean;
  /** Retracting a filed compliance record is admin-only. */
  readonly canRetract: boolean;
  /** The product register, for filing a record without leaving this panel. */
  readonly products: readonly Product[];
  /** The farm's own lists, for the correction suggestions. */
  readonly reference: ReferenceData;
  /** "Spraying on FIELD A, September 1" — context for the record dialog. */
  readonly recordContext: string;
  /** Opens the edit form for this log, pre-filled. */
  readonly onEdit: () => void;
  readonly onDelete: () => void;
}

/**
 * Figma `Frame 148` — the panel revealed beneath an expanded row.
 *
 * Left column (fixed 592px): the recording itself — waveform, playback and
 * tagging controls, the raw transcription, and the log's own edit and delete.
 * Right column (fills): where the work happened. Below the design's breakpoint
 * the two columns stack, and the panel is sized to the table's visible width so
 * it does not scroll sideways with the rows (see `LogsPanel`).
 *
 * The recording half is conditional. A log created on this dashboard has no
 * recording, and it is still a log — so the panel opens for it, says so, and
 * keeps the controls that operate on the log rather than on its audio.
 */
export function ExpandedLogDetail({
  detail,
  employeeLabel,
  fieldLabel,
  availableTags,
  canWrite,
  canRetract,
  products,
  reference,
  recordContext,
  onEdit,
  onDelete,
}: ExpandedLogDetailProps) {
  return (
    <div className="sticky left-0 flex w-[100cqw] flex-col items-stretch gap-[20px] bg-white p-[20px] sm:p-[40px] xl:flex-row xl:items-center xl:justify-center xl:gap-[40px]">
      <div className="flex w-full flex-col items-center gap-[20px] xl:w-[592px] xl:shrink-0">
        {detail.recording ? (
          <RecordingPlayer
            audioUrl={detail.recording.audioUrl}
            durationSeconds={detail.recording.durationSeconds}
            bars={detail.recording.waveform}
            label={`${employeeLabel}'s recording`}
          />
        ) : (
          // A log entered by hand has no voice log behind it. Saying so is more
          // use than an empty waveform, which would read as silence rather than
          // absence.
          <div className="flex w-full flex-col items-center justify-center gap-[6px] rounded-[7.04px] bg-black/[0.03] px-[20px] py-[28px] text-center">
            <span className="text-[14px] font-normal leading-[1.3] text-[#4D4D4D]">
              No recording on this log
            </span>
            <span className="text-[12px] font-normal leading-[1.3] text-black opacity-40">
              It was entered by hand rather than dictated.
            </span>
          </div>
        )}

        {detail.recording ? (
          <TranscriptEditor
            logId={detail.logId}
            transcript={detail.recording.summary}
            canWrite={canWrite}
          />
        ) : null}

        {/*
          Directly under the transcript, because the two are one thought: here
          is what was said, and here is the record we made of it.
        */}
        {detail.recording ? (
          <ExtractedFields
            logId={detail.logId}
            extracted={detail.recording.extracted}
            records={detail.applications}
            requiresProduct={detail.requiresProduct}
            products={products}
            reference={reference}
            canWrite={canWrite}
          />
        ) : null}

        {/*
          The fix comes after the verdict that motivates it. It used to sit
          above the transcript, which meant a reviewer met "record a product"
          before they had heard why one was missing — an instruction ahead of
          its reason. The panel now reads the way the job is done: what was
          said, what we made of it, whether that passes, and then what to do.
        */}
        <ApplicationPanel
          logId={detail.logId}
          records={detail.applications}
          requiresProduct={detail.requiresProduct}
          products={products}
          canWrite={canWrite}
          canRetract={canRetract}
          context={recordContext}
        />

        {/* Labelling is filing, not reviewing — it belongs after the verdict. */}
        <TagPicker
          logId={detail.logId}
          tags={detail.tags}
          available={availableTags}
          canWrite={canWrite}
        />

        {/*
          Edit and delete live here rather than in the table row. The design's
          action cell holds exactly one button and is 92px wide; adding a menu
          to every row would change the table's shape for something you can only
          want once a row is already open in front of you.
        */}
        {canWrite ? (
          <div className="flex items-center justify-end gap-[10px] self-stretch">
            <motion.button
              type="button"
              onClick={onEdit}
              whileHover={{ y: -1, scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              transition={SPRING_SOFT}
              className={SECONDARY_BUTTON}
            >
              <Icon name="clipboard-pen" />
              Edit log
            </motion.button>

            <motion.button
              type="button"
              onClick={onDelete}
              whileHover={{ y: -1, scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              transition={SPRING_SOFT}
              className={DANGER_BUTTON}
            >
              <Icon name="trash" />
              Delete log
            </motion.button>
          </div>
        ) : null}
      </div>

      {/*
        The history sits in the right column under the map rather than in the
        left one. The left column is the log as it stands — listen, check the
        product, fix the transcript — and the right is context about it: where
        it happened, and what has been done to it since.
      */}
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-[20px] self-stretch">
        <FieldMap location={detail.location} fieldLabel={fieldLabel} />

        {/*
          Directly under the block it is about. Someone reading a spray log is
          exactly the person who needs to know the field is still closed, and
          the map is where they are already looking.
        */}
        <FieldSafety fieldName={fieldLabel} restriction={detail.restriction} />

        <LogHistory events={detail.history} />
      </div>
    </div>
  );
}
