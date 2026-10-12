import { getTaxBase } from '@/lib/data';
import { formatCurrency, formatPercentPlain } from '@/lib/format';
import TaxBaseHistoryChart from '@/components/TaxBaseHistoryChart';

const taxBase = getTaxBase();

const GROUP_COLORS: Record<string, string> = {
  Residential: '#1b4d7a',
  Commercial: '#347bb0',
  Industrial: '#73a9cf',
  'Exempt / Partial Exempt': '#c9a227',
  Other: '#9e9e9e',
};

function formatLargeCurrency(value: number): string {
  if (value >= 1_000_000_000) {
    return `$${(value / 1_000_000_000).toFixed(1)}B`;
  }
  return formatCurrency(value, true);
}

export default function TaxBasePage() {
  const {
    groups,
    total,
    countyRate,
    fiscalYear,
    source,
    generated,
    history,
    historySource,
  } = taxBase;

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">
          Parcel Property Tax Base Mix
        </h1>
        <p className="text-lg text-gray-600 mt-1">
          Chatham County &middot; {fiscalYear} &middot; 2027 assessment roll
        </p>
      </div>

      <section className="bg-white rounded-xl border p-5 mb-8">
        <div className="mb-3">
          <h2 className="text-xl font-semibold text-gray-900">
            Tax Base and Value of One Penny
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Five-year history. Gold bars mark Chatham County revaluation years.
          </p>
        </div>
        <TaxBaseHistoryChart data={history} />
        <p className="text-xs text-gray-500 mt-2">
          <strong>History source:</strong> {historySource}
        </p>
      </section>

      <div className="grid sm:grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-xl border p-5">
          <p className="text-sm text-gray-500">Parcel Assessed Value</p>
          <p className="text-2xl font-bold mt-1">
            {formatLargeCurrency(total.assessedValue)}
          </p>
        </div>
        <div className="bg-white rounded-xl border p-5">
          <p className="text-sm text-gray-500">Parcels</p>
          <p className="text-2xl font-bold mt-1">
            {total.parcels.toLocaleString()}
          </p>
        </div>
        <div className="bg-white rounded-xl border p-5">
          <p className="text-sm text-gray-500">
            Gross Amount at ${countyRate.toFixed(2)}
          </p>
          <p className="text-2xl font-bold mt-1">
            {formatCurrency(total.countyTax, true)}
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl border p-5 mb-8">
        <p className="text-sm font-medium text-gray-700 mb-3">
          Share of parcel assessed value by property type
        </p>
        <div className="flex w-full h-6 rounded-lg overflow-hidden">
          {groups
            .filter((group) => group.assessedValue > 0)
            .map((group) => (
              <div
                key={group.group}
                style={{
                  width: `${group.pctOfBase}%`,
                  backgroundColor: GROUP_COLORS[group.group] ?? '#9e9e9e',
                }}
                title={`${group.group}: ${formatPercentPlain(group.pctOfBase)}`}
              />
            ))}
        </div>
        <div className="flex flex-wrap gap-4 mt-3 text-sm text-gray-600">
          {groups
            .filter((group) => group.assessedValue > 0)
            .map((group) => (
              <span key={group.group} className="flex items-center gap-1.5">
                <span
                  className="inline-block w-3 h-3 rounded-sm"
                  style={{
                    backgroundColor: GROUP_COLORS[group.group] ?? '#9e9e9e',
                  }}
                />
                {group.group} ({formatPercentPlain(group.pctOfBase)})
              </span>
            ))}
        </div>
      </div>

      <h2 className="text-xl font-semibold text-gray-900 mb-1">
        Assessed Value by Property Type
      </h2>
      <p className="text-sm text-gray-500 mb-3">
        Gross rate-equivalent amounts apply the adopted ${countyRate.toFixed(2)} per
        $100 County rate before exemptions or collection adjustments.
      </p>
      <div className="bg-white rounded-xl border overflow-x-auto mb-6">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-left text-gray-500">
              <th className="py-3 px-4">Property Type</th>
              <th className="py-3 px-4 text-right">Parcels</th>
              <th className="py-3 px-4 text-right">Assessed Value</th>
              <th className="py-3 px-4 text-right">% of Parcel Base</th>
              <th className="py-3 px-4 text-right">
                Gross County Amount
              </th>
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => (
              <tr key={group.group} className="border-b last:border-0">
                <td className="py-3 px-4 font-medium text-gray-800">
                  <span className="flex items-center gap-2">
                    <span
                      className="inline-block w-3 h-3 rounded-sm"
                      style={{
                        backgroundColor: GROUP_COLORS[group.group] ?? '#9e9e9e',
                      }}
                    />
                    {group.group}
                  </span>
                </td>
                <td className="py-3 px-4 text-right tabular-nums">
                  {group.parcels.toLocaleString()}
                </td>
                <td className="py-3 px-4 text-right tabular-nums">
                  {formatCurrency(group.assessedValue)}
                </td>
                <td className="py-3 px-4 text-right tabular-nums">
                  {formatPercentPlain(group.pctOfBase)}
                </td>
                <td className="py-3 px-4 text-right tabular-nums">
                  {formatCurrency(group.countyTax)}
                </td>
              </tr>
            ))}
            <tr className="border-t-2 bg-gray-50 font-semibold">
              <td className="py-3 px-4">Total</td>
              <td className="py-3 px-4 text-right tabular-nums">
                {total.parcels.toLocaleString()}
              </td>
              <td className="py-3 px-4 text-right tabular-nums">
                {formatCurrency(total.assessedValue)}
              </td>
              <td className="py-3 px-4 text-right tabular-nums">100.0%</td>
              <td className="py-3 px-4 text-right tabular-nums">
                {formatCurrency(total.countyTax)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="text-sm text-gray-500 space-y-2">
        <p>
          <strong>Source:</strong> {source}. Generated {generated}.
        </p>
        <p>
          This parcel-only view does not include registered motor vehicles,
          business personal property, or public-service company property and
          therefore does not equal the County&apos;s full levy base or budgeted value
          of one cent.
        </p>
        <p>
          Property type is based on the County&apos;s use code. Exempt and
          partial-exempt values are shown separately; applying the County rate to
          those values is illustrative. Figures are gross, do not apply the
          collection rate, and are not official tax levies.
        </p>
      </div>
    </div>
  );
}
