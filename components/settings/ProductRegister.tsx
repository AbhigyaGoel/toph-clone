'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useState, useTransition } from 'react';

import { createProduct, deleteProduct, updateProduct, type ProductInput } from '@/app/actions/products';
import { EmptyState } from '@/components/shell/EmptyState';
import { ERROR_TEXT, INPUT, LABEL, PRIMARY_BUTTON, SELECT, SELECT_CHEVRON } from '@/components/ui/formStyles';
import { Icon } from '@/components/ui/Icon';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/ToastProvider';
import { attempt } from '@/lib/attempt';
import { KIND_LABELS } from '@/lib/compliance';
import { EASE_QUICK, SPRING_SOFT } from '@/lib/motion';
import type { Product } from '@/lib/types';

interface ProductRegisterProps {
  readonly products: readonly Product[];
  readonly canWrite: boolean;
  readonly canDelete: boolean;
  readonly writeBlockedReason: string | null;
}

const ROW =
  'grid min-w-[920px] grid-cols-[1fr_110px_120px_96px_150px_176px] items-center gap-[10px] px-[30px]';

interface FormState {
  readonly name: string;
  readonly kind: Product['kind'];
  readonly epaRegistration: string;
  readonly activeIngredient: string;
  readonly rateUnit: string;
  readonly reiHours: string;
  readonly phiDays: string;
}

const EMPTY: FormState = {
  name: '',
  kind: 'chemical',
  epaRegistration: '',
  activeIngredient: '',
  rateUnit: 'gal/acre',
  reiHours: '',
  phiDays: '',
};

const toInput = (form: FormState): ProductInput => ({
  name: form.name,
  kind: form.kind,
  epaRegistration: form.epaRegistration.trim() === '' ? null : form.epaRegistration.trim(),
  activeIngredient: form.activeIngredient.trim() === '' ? null : form.activeIngredient.trim(),
  rateUnit: form.rateUnit,
  reiHours: form.reiHours.trim() === '' ? null : Number(form.reiHours),
  phiDays: form.phiDays.trim() === '' ? null : Number(form.phiDays),
});

/**
 * Everything the farm applies, and the label facts that follow it.
 *
 * This is upstream of the whole compliance story: the Audit Manager can only
 * grade a record against the intervals recorded here, and an application cannot
 * be filed for a product that does not exist. It lives in Settings rather than
 * in the Audit Manager because it is a list you curate once a season, not
 * something you touch while assembling an audit.
 *
 * REI and PHI are optional and mean "this product has none" when blank —
 * fertilizers genuinely do not have them, and forcing a zero would make "no
 * restriction" indistinguishable from "we did not look it up".
 */
export function ProductRegister({
  products,
  canWrite,
  canDelete,
  writeBlockedReason,
}: ProductRegisterProps) {
  const [editing, setEditing] = useState<Product | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, startWrite] = useTransition();
  const toast = useToast();

  const remove = (product: Product) => {
    startWrite(async () => {
      const result = await attempt(() => deleteProduct(product.id));
      if (!result.success) toast.show({ tone: 'error', message: result.error });
    });
  };

  return (
    <>
      <div className="flex items-center justify-between gap-[10px] px-[30px] py-[14px] shadow-divider">
        <span className="text-[13px] font-normal leading-[1.4] text-[#4D4D4D]">
          {products.length} {products.length === 1 ? 'product' : 'products'} on the register
        </span>
        {canWrite ? (
          <motion.button
            type="button"
            onClick={() => setAdding(true)}
            whileHover={{ y: -1, scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            transition={SPRING_SOFT}
            className="flex shrink-0 items-center gap-[6px] whitespace-nowrap rounded-[80px] bg-black px-[14px] py-[6px] text-[14px] font-normal leading-[1.3] text-white shadow-chip"
          >
            <Icon name="plus" />
            Add product
          </motion.button>
        ) : (
          <span className="text-[13px] font-normal leading-[1.3] text-[#4D4D4D]">
            {writeBlockedReason}
          </span>
        )}
      </div>


      {products.length === 0 ? (
        <EmptyState
          icon="files"
          title="No products on the register"
          body="Add the chemicals, fertilizers and amendments this farm applies. Their restricted-entry and pre-harvest intervals are what the Audit Manager grades records against."
        />
      ) : (
        <div className="flex w-full flex-col overflow-x-auto">
          <div className={`${ROW} py-[12px] shadow-divider`}>
            {['PRODUCT', 'KIND', 'EPA REG.', 'RATE UNIT', 'INTERVALS', ''].map((heading, index) => (
              <span
                key={index}
                className="text-[10px] font-medium uppercase leading-[1.3] tracking-[0.04em] text-[#B3B3B3]"
              >
                {heading}
              </span>
            ))}
          </div>

          {products.map((product) => (
            <div
              key={product.id}
              // The command palette links straight to a product's row. Without
              // the id the link lands at the top of Settings and leaves you to
              // find it yourself, which is the work the palette was avoiding.
              // `scroll-mt` keeps the row clear of the sticky page header.
              id={`product-${product.id}`}
              className={`${ROW} scroll-mt-[120px] py-[14px] shadow-divider`}
            >
              <span className="flex flex-col">
                <span className="text-[14px] font-normal leading-[1.3] text-black">
                  {product.name}
                </span>
                {product.activeIngredient ? (
                  <span className="text-[12px] font-normal leading-[1.3] text-[#B3B3B3]">
                    {product.activeIngredient}
                  </span>
                ) : null}
              </span>

              <span className="text-[13px] font-normal leading-[1.3] text-[#4D4D4D]">
                {KIND_LABELS[product.kind]}
              </span>

              <span className="text-[13px] font-normal leading-[1.3] tabular-nums text-[#4D4D4D]">
                {product.epaRegistration ?? (
                  <span className="text-[#B3B3B3]">{product.kind === 'chemical' ? 'missing' : '—'}</span>
                )}
              </span>

              <span className="text-[13px] font-normal leading-[1.3] text-[#4D4D4D]">
                {product.rateUnit}
              </span>

              <span className="text-[12px] font-normal leading-[1.4] text-[#4D4D4D]">
                {product.reiHours ? `REI ${product.reiHours}h` : 'No REI'}
                {' · '}
                {product.phiDays ? `PHI ${product.phiDays}d` : 'No PHI'}
              </span>

              <span className="flex items-center justify-end gap-[6px]">
                <span className="whitespace-nowrap text-[12px] font-normal leading-[1.3] text-[#B3B3B3]">
                  {product.applicationCount} used
                </span>
                {canWrite ? (
                  <button
                    type="button"
                    aria-label={`Edit ${product.name}`}
                    onClick={() => setEditing(product)}
                    disabled={busy}
                    className="rounded-[80px] px-[10px] py-[4px] text-[13px] font-normal leading-[1.3] text-[#4D4D4D] outline-none transition-colors hover:bg-black/[0.05] focus-visible:ring-2 focus-visible:ring-black/30 disabled:opacity-50"
                  >
                    Edit
                  </button>
                ) : null}
                {canDelete && product.applicationCount === 0 ? (
                  <button
                    type="button"
                    aria-label={`Remove ${product.name}`}
                    onClick={() => remove(product)}
                    disabled={busy}
                    className="rounded-[80px] px-[10px] py-[4px] text-[13px] font-normal leading-[1.3] text-[#B00020] outline-none transition-colors hover:bg-[rgba(176,0,32,0.08)] focus-visible:ring-2 focus-visible:ring-[#B00020]/40 disabled:opacity-50"
                  >
                    Remove
                  </button>
                ) : null}
              </span>
            </div>
          ))}
        </div>
      )}

      <ProductDialog
        open={adding || editing !== null}
        product={editing}
        onClose={() => {
          setAdding(false);
          setEditing(null);
        }}
      />
    </>
  );
}

interface ProductDialogProps {
  readonly open: boolean;
  readonly product: Product | null;
  readonly onClose: () => void;
}

function ProductDialog({ open, product, onClose }: ProductDialogProps) {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSave] = useTransition();
  const [seed, setSeed] = useState<string | null>(null);

  // Re-seeds when the dialog is opened for a different product, without an
  // effect: this is derived state, and deriving it during render is both
  // simpler and one frame earlier than an effect would be.
  const key = product?.id ?? (open ? 'new' : null);
  if (seed !== key) {
    setSeed(key);
    setError(null);
    setForm(
      product
        ? {
            name: product.name,
            kind: product.kind,
            epaRegistration: product.epaRegistration ?? '',
            activeIngredient: product.activeIngredient ?? '',
            rateUnit: product.rateUnit,
            reiHours: product.reiHours === null ? '' : String(product.reiHours),
            phiDays: product.phiDays === null ? '' : String(product.phiDays),
          }
        : EMPTY
    );
  }

  const set = (field: keyof FormState) => (value: string) =>
    setForm((current) => ({ ...current, [field]: value }));

  return (
    <Modal open={open} onClose={onClose} title={product ? 'Edit product' : 'Add product'}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          startSave(async () => {
            const result = await attempt(() =>
              product ? updateProduct(product.id, toInput(form)) : createProduct(toInput(form))
            );
            if (!result.success) {
              setError(result.error);
              return;
            }
            onClose();
          });
        }}
        className="flex flex-col gap-[16px]"
      >
        <label className="flex flex-col gap-[6px]">
          <span className={LABEL}>Product name</span>
          <input
            value={form.name}
            onChange={(event) => set('name')(event.target.value)}
            maxLength={80}
            placeholder="Spinosad 480SC"
            className={INPUT}
            required
          />
        </label>

        <div className="flex flex-col gap-[16px] sm:flex-row">
          <label className="flex flex-1 flex-col gap-[6px]">
            <span className={LABEL}>Kind</span>
            <span className="relative flex">
              <select
                value={form.kind}
                onChange={(event) => set('kind')(event.target.value)}
                className={SELECT}
              >
                <option value="chemical">Chemical</option>
                <option value="fertilizer">Fertilizer</option>
                <option value="amendment">Amendment</option>
              </select>
              <span className={SELECT_CHEVRON} />
            </span>
          </label>

          <label className="flex flex-1 flex-col gap-[6px]">
            <span className={LABEL}>Rate unit</span>
            <input
              value={form.rateUnit}
              onChange={(event) => set('rateUnit')(event.target.value)}
              maxLength={24}
              placeholder="gal/acre"
              className={INPUT}
              required
            />
          </label>
        </div>

        <div className="flex flex-col gap-[16px] sm:flex-row">
          <label className="flex flex-1 flex-col gap-[6px]">
            <span className={LABEL}>EPA registration</span>
            <input
              value={form.epaRegistration}
              onChange={(event) => set('epaRegistration')(event.target.value)}
              maxLength={40}
              placeholder={form.kind === 'chemical' ? '62719-291' : 'not applicable'}
              className={INPUT}
            />
          </label>

          <label className="flex flex-1 flex-col gap-[6px]">
            <span className={LABEL}>Active ingredient</span>
            <input
              value={form.activeIngredient}
              onChange={(event) => set('activeIngredient')(event.target.value)}
              maxLength={120}
              placeholder="Spinosad"
              className={INPUT}
            />
          </label>
        </div>

        <div className="flex flex-col gap-[16px] sm:flex-row">
          <label className="flex flex-1 flex-col gap-[6px]">
            <span className={LABEL}>Re-entry interval (hours)</span>
            <input
              value={form.reiHours}
              onChange={(event) => set('reiHours')(event.target.value)}
              inputMode="numeric"
              placeholder="blank if none"
              className={INPUT}
            />
          </label>

          <label className="flex flex-1 flex-col gap-[6px]">
            <span className={LABEL}>Pre-harvest interval (days)</span>
            <input
              value={form.phiDays}
              onChange={(event) => set('phiDays')(event.target.value)}
              inputMode="numeric"
              placeholder="blank if none"
              className={INPUT}
            />
          </label>
        </div>

        <p className="text-[12px] font-normal leading-[1.5] text-black opacity-40">
          Both intervals come off the registered label. Changing them re-grades every
          record already filed against this product — which is the point: if the
          interval was wrong, every field it was applied to was calculated wrong too.
        </p>

        {error ? (
          <p role="alert" className={ERROR_TEXT}>
            {error}
          </p>
        ) : null}

        <div className="flex justify-end">
          <button type="submit" disabled={saving} className={PRIMARY_BUTTON}>
            {saving ? 'Saving…' : product ? 'Save product' : 'Add product'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
