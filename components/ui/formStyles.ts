/**
 * Field styling for the CRUD forms.
 *
 * The Figma file draws no inputs — it has a search pill, chips and buttons and
 * nothing else — so these are built from the vocabulary that is there: the
 * chip's 14px #4D4D4D text, the panel's rounded corners, and black as the
 * "applied / primary" colour the selected chips already use. Kept in one file
 * so the three forms cannot drift into three different-looking dialogs.
 */

export const LABEL =
  'text-[10px] font-medium leading-[1.3] text-[#B3B3B3]';

export const INPUT =
  'w-full rounded-[8px] bg-black/[0.04] px-[12px] py-[10px] text-[14px] font-normal leading-[1.3] text-black outline-none transition-shadow placeholder:text-[#B3B3B3] focus:shadow-[inset_0_0_0_1.5px_rgba(0,0,0,0.25)] disabled:opacity-50';

export const SELECT = `${INPUT} appearance-none bg-[length:14px] bg-[right_12px_center] bg-no-repeat pr-[34px]`;

/** A chevron as a data URI — the CDN-free way to avoid a native select arrow. */
export const SELECT_CHEVRON =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%234D4D4D' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>\")";

export const PRIMARY_BUTTON =
  'flex shrink-0 items-center justify-center gap-[8px] whitespace-nowrap rounded-[80px] bg-black px-[16px] py-[8px] text-[14px] font-normal leading-[1.3] text-white shadow-chip disabled:cursor-not-allowed disabled:opacity-40';

export const SECONDARY_BUTTON =
  'flex shrink-0 items-center justify-center gap-[8px] whitespace-nowrap rounded-[80px] bg-white px-[16px] py-[8px] text-[14px] font-normal leading-[1.3] text-[#4D4D4D] shadow-chip disabled:cursor-not-allowed disabled:opacity-40';

export const DANGER_BUTTON =
  'flex shrink-0 items-center justify-center gap-[8px] whitespace-nowrap rounded-[80px] bg-[rgba(176,0,32,0.08)] px-[16px] py-[8px] text-[14px] font-normal leading-[1.3] text-[#B00020] disabled:cursor-not-allowed disabled:opacity-40';

export const ERROR_TEXT = 'text-[12px] font-normal leading-[1.4] text-[#B00020]';
