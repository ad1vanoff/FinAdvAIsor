import { ASSET_CLASS_SOURCES, BUCKET_LABELS, BUCKET_ORDER, money, pct } from '../engine';
import type { AllocationPlan } from '../engine';
import { sliceId } from './AllocationPie';
import { SourceLinks } from './controls';
import { BUCKET_COLORS, usePrefersDark } from './palette';

export function PlanTable({ plan, selected, onSelect }: { plan: AllocationPlan; selected: string | null; onSelect: (id: string | null) => void }) {
  const dark = usePrefersDark();
  const colors = BUCKET_COLORS[dark ? 'dark' : 'light'];
  const toggle = (id: string) => onSelect(selected === id ? null : id);

  return (
    <div className="table-wrap">
      <table className="plan">
        <thead>
          <tr>
            <th>Asset class</th>
            <th className="r">% of total</th>
            <th className="r">% of invested</th>
            <th className="r">Amount</th>
            <th>Example funds</th>
          </tr>
        </thead>
        <tbody>
          {BUCKET_ORDER.map((bucket) => {
            const lines = plan.lines.filter((l) => l.bucket === bucket);
            if (lines.length === 0) return null;
            const b = plan.buckets.find((x) => x.bucket === bucket)!;
            const bucketSelected = selected === bucket;
            return [
              <tr className={`bucket${bucketSelected ? ' selected' : ''}`} key={`b-${bucket}`} onClick={() => toggle(bucket)}>
                <td>
                  <span className="swatch" style={{ background: colors[bucket] }} />
                  {BUCKET_LABELS[bucket]}
                </td>
                <td className="r num">{pct(b.weightOfTotal, 1)}</td>
                <td className="r num"></td>
                <td className="r num">{money(b.dollars)}</td>
                <td></td>
              </tr>,
              ...lines.map((l) => {
                const id = sliceId(l);
                const isSelected = selected === id || bucketSelected;
                return (
                  <tr key={id} className={isSelected ? 'selected' : undefined} onClick={() => toggle(id)}>
                    <td>
                      <div className="name">{l.name}</div>
                      <div className="rationale">{l.rationale}</div>
                      <SourceLinks ids={ASSET_CLASS_SOURCES[l.assetClass]} />
                    </td>
                    <td className="r num">{pct(l.weightOfTotal, 1)}</td>
                    <td className="r num">{l.weightOfInvested === null ? <span className="muted">—</span> : pct(l.weightOfInvested)}</td>
                    <td className="r num">{money(l.dollars, true)}</td>
                    <td className="examples">
                      {l.examples.map((e, i) => (
                        <span key={e.ticker}>
                          {i > 0 && ', '}
                          <abbr title={e.name}>{e.ticker}</abbr>
                        </span>
                      ))}
                    </td>
                  </tr>
                );
              }),
            ];
          })}
        </tbody>
      </table>
    </div>
  );
}
