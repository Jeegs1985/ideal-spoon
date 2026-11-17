import type { BacktestSummary } from '../lib/backtest'

type Props = {
  summary: BacktestSummary | null
  loading?: boolean
}

function pct(n: number) {
  return `${(n * 100).toFixed(1)}%`
}

function money(n: number) {
  const sign = n >= 0 ? '+' : ''
  return `${sign}$${n.toFixed(0)}`
}

export function BacktestPanel({ summary, loading }: Props) {
  if (loading && !summary) {
    return (
      <section className="panel backtest-panel">
        <header>
          <h2>Backtest PnL</h2>
          <p>Running 60-session ORB break study…</p>
        </header>
      </section>
    )
  }
  if (!summary) return null

  return (
    <section className="panel backtest-panel">
      <header>
        <h2>Backtest PnL</h2>
        <p>
          {summary.trades} trades across {summary.sessions} sessions · ${summary.riskPerTrade} risk
          / trade (toy 0DTE)
        </p>
      </header>

      <div className="bt-hero">
        <div>
          <span>All signals · est. PnL</span>
          <strong className={summary.totalOptionPnlUsd >= 0 ? 'up' : 'down'}>
            {money(summary.totalOptionPnlUsd)}
          </strong>
        </div>
        <div>
          <span>All signals · win rate</span>
          <strong>{pct(summary.winRate)}</strong>
        </div>
        <div>
          <span>{summary.filtered.label} · PnL</span>
          <strong className={summary.filtered.totalOptionPnlUsd >= 0 ? 'up' : 'down'}>
            {money(summary.filtered.totalOptionPnlUsd)}
          </strong>
        </div>
        <div>
          <span>{summary.filtered.label} · win rate</span>
          <strong>
            {pct(summary.filtered.winRate)}{' '}
            <em>({summary.filtered.trades} trades)</em>
          </strong>
        </div>
      </div>

      <dl className="bt-stats">
        <div>
          <dt>Wins / losses</dt>
          <dd>
            {summary.wins} / {summary.losses}
          </dd>
        </div>
        <div>
          <dt>Avg win (SPY pts)</dt>
          <dd>+{summary.avgWinPts.toFixed(2)}</dd>
        </div>
        <div>
          <dt>Avg loss (SPY pts)</dt>
          <dd>{summary.avgLossPts.toFixed(2)}</dd>
        </div>
        <div>
          <dt>Expectancy (pts)</dt>
          <dd>{summary.expectancyPts.toFixed(2)}</dd>
        </div>
        <div>
          <dt>Best trade</dt>
          <dd className="up">{pct(summary.maxWinPct)}</dd>
        </div>
        <div>
          <dt>Worst trade</dt>
          <dd className="down">{pct(summary.maxLossPct)}</dd>
        </div>
      </dl>

      <div className="bt-table-wrap">
        <table className="bt-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Side</th>
              <th>SPY pts</th>
              <th>0DTE est.</th>
              <th>Exit</th>
            </tr>
          </thead>
          <tbody>
            {summary.tradesList.slice(0, 14).map((t) => (
              <tr key={t.dateKey}>
                <td>{t.dateKey.slice(5)}</td>
                <td className={t.bias === 'PUT' ? 'down' : 'up'}>{t.bias}</td>
                <td className={t.spyPoints >= 0 ? 'up' : 'down'}>
                  {t.spyPoints >= 0 ? '+' : ''}
                  {t.spyPoints.toFixed(2)}
                </td>
                <td className={t.optionPnlUsd >= 0 ? 'up' : 'down'}>
                  {money(t.optionPnlUsd)}
                </td>
                <td>{t.exitReason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="bt-note">{summary.note}</p>
    </section>
  )
}
