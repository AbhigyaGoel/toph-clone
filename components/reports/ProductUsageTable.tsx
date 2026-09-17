import { EmptyState } from '@/components/shell/EmptyState';
import { KIND_LABELS } from '@/lib/compliance';
import type { ProductUsage } from '@/lib/reports';

interface ProductUsageTableProps {
  readonly usage: readonly ProductUsage[];
}

const ROW = 'grid min-w-[720px] grid-cols-[1fr_120px_120px_140px_120px] items-center gap-[10px] px-[30px]';

/**
 * How much of each product went out, and over how much ground.
 *
 * The total column is null rather than approximate when any one application of
 * that product is missing its treated area — an undercount presented as a total
 * is the kind of number that ends up in a nutrient management plan. Saying "not
 * computable" and pointing at the reason is more useful than a figure nobody
 * should trust.
 */
export function ProductUsageTable({ usage }: ProductUsageTableProps) {
  if (usage.length === 0) {
    return (
      <EmptyState
        icon="files"
        title="Nothing applied in this period"
        body="Products appear here once a spray, fertilizer or amendment application has been recorded against a log."
      />
    );
  }

  return (
    <div className="flex w-full flex-col overflow-x-auto">
      <div className={`${ROW} py-[12px] shadow-divider`}>
        {['PRODUCT', 'APPLICATIONS', 'FIELDS', 'TOTAL APPLIED', 'AREA'].map((heading) => (
          <span
            key={heading}
            className="text-[10px] font-medium uppercase leading-[1.3] tracking-[0.04em] text-[#B3B3B3]"
          >
            {heading}
          </span>
        ))}
      </div>

      {usage.map((product) => (
        <div key={product.productId} className={`${ROW} py-[14px] shadow-divider`}>
          <span className="flex flex-col">
            <span className="text-[14px] font-normal leading-[1.3] text-black">{product.name}</span>
            <span className="text-[12px] font-normal leading-[1.3] text-[#B3B3B3]">
              {KIND_LABELS[product.kind]}
            </span>
          </span>

          <span className="text-[14px] font-normal leading-[1.3] tabular-nums text-[#4D4D4D]">
            {product.applications}
          </span>

          <span className="text-[14px] font-normal leading-[1.3] tabular-nums text-[#4D4D4D]">
            {product.fields}
          </span>

          <span className="text-[14px] font-normal leading-[1.3] tabular-nums text-[#4D4D4D]">
            {product.totalApplied === null ? (
              <span
                title="At least one application of this product has no treated area recorded, so a total would understate it."
                className="text-[13px] text-[#B00020]"
              >
                incomplete data
              </span>
            ) : (
              `${product.totalApplied} ${product.unit.split('/')[0]}`
            )}
          </span>

          <span className="text-[14px] font-normal leading-[1.3] tabular-nums text-[#4D4D4D]">
            {product.acresTreated === null ? '—' : `${product.acresTreated} ac`}
          </span>
        </div>
      ))}
    </div>
  );
}
