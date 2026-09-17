import type { Config } from 'tailwindcss';

/**
 * Tailwind is intentionally kept close to stock. Every value taken from Figma is
 * expressed with arbitrary-value syntax at the call site (`gap-[14px]`,
 * `text-[#4D4D4D]`) so a reader can diff the markup against the design file
 * without first resolving a token indirection.
 *
 * Two things cannot be written that way, so they live here:
 *
 * 1. The font stack wired up by `next/font`.
 * 2. Strokes. Figma strokes are INSIDE-aligned — they paint within the frame and
 *    change neither its size nor its content box. A CSS `border` does both,
 *    which would make every table row 1px taller and every chip 2px taller, and
 *    that error compounds down a long table. Reproducing strokes as inset
 *    shadows keeps the geometry exact. Where an element carries a stroke *and* a
 *    drop shadow, both have to share one `box-shadow`, hence the combined
 *    tokens below.
 */
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-geist-sans)', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        // --- strokes ---------------------------------------------------------
        /** stroke_X91X87 — stat card outline. */
        card: 'inset 0 0 0 0.88px #F2F2F2',
        /** stroke_A43S7Z — log panel outline. */
        panel: 'inset 0 0 0 1px #F2F2F2',
        /** stroke_RI0C1O — rule under the toolbar and under each row. */
        divider: 'inset 0 -1px 0 0 #F2F2F2',
        /** stroke_EIMG1N — heavier rule under the column headings. */
        'divider-strong': 'inset 0 -1px 0 0 #E6E6E6',
        /** stroke_MCK9TB — the green count pill on the active nav item. */
        badge: 'inset 0 0 0 0.5px rgba(0, 105, 57, 0.26)',
        /** stroke_7AAP6X — buttons in the expanded detail panel. */
        'detail-button': 'inset 0 0 0 1px rgba(0, 0, 0, 0.1)',
        /** stroke_ESYO5W — the green "Add Tag" variant of the same button. */
        'detail-button-accent': 'inset 0 0 0 1px rgba(20, 108, 68, 0.1)',
        /** stroke_7EAA3J — frame around the satellite map. */
        'map-frame': 'inset 0 0 0 0.88px #E9E9E9',
        /** stroke_LJAUC2 — highlighted plot boundary on the map. */
        'map-plot': 'inset 0 0 0 1px #0065F0',

        // --- strokes combined with a drop shadow -----------------------------
        /** stroke_A78G36 + effect_QGPZY9 — search field and toolbar chips. */
        chip: '0px 0px 4px 0px rgba(0, 0, 0, 0.05), inset 0 0 0 1px #E6E6E6',
        /** stroke_A43S7Z + effect_QGPZY9 — the View / Close button on a row. */
        'chip-soft': '0px 0px 4px 0px rgba(0, 0, 0, 0.05), inset 0 0 0 1px #F2F2F2',
        /** stroke_PCBDM2 + effect_OL8R4J — the glowing, white-ringed map pin. */
        marker: '0px 0px 39.5px 0px rgba(0, 101, 240, 1), inset 0 0 0 2px #FFFFFF',

        // --- plain effects ---------------------------------------------------
        /** effect_63WVIF — inner shade over the org avatar. */
        'avatar-inset': 'inset 0px 3px 4.5px 0px rgba(0, 0, 0, 0.1)',
      },
    },
  },
  plugins: [],
};

export default config;
