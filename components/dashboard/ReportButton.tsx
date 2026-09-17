'use client';

import { motion } from 'framer-motion';

import { Icon } from '@/components/ui/Icon';
import { SPRING_SOFT } from '@/lib/motion';

/**
 * The season's voice logs as the form a regulator asks for.
 *
 * California wants every agricultural pesticide application reported to the
 * county commissioner monthly, by the 10th; FSMA wants records producible
 * within 24 hours of an inspector asking. This is the other end of the product
 * from the worker talking into a phone — one click in the office, and the
 * recordings become the document.
 *
 * An anchor rather than a button with a handler: the browser's own download
 * machinery handles the file, and the URL is visible and copyable.
 */
export function ReportButton() {
  return (
    <motion.a
      href="/api/exports/pur"
      whileHover={{ y: -1, scale: 1.03 }}
      whileTap={{ scale: 0.98 }}
      transition={SPRING_SOFT}
      title="Pesticide Use Report — the columns a county agricultural commissioner asks for"
      className="flex shrink-0 items-center gap-[7px] whitespace-nowrap rounded-[80px] bg-black px-[14px] py-[7px] text-[14px] font-normal leading-[1.3] text-white shadow-chip outline-none focus-visible:ring-2 focus-visible:ring-black/40 focus-visible:ring-offset-2"
    >
      <Icon name="files" size={13} />
      Generate report
    </motion.a>
  );
}
