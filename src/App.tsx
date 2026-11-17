import { useCallback, useEffect, useMemo, useState } from 'react'
import { BacktestPanel } from './components/BacktestPanel'
import { Chart } from './components/Chart'
import { SettingsPanel } from './components/SettingsPanel'
import { runBacktest, type BacktestSummary } from './lib/backtest'
import { analyzeSession, sessionExtras } from './lib/sharkEngine'
import { SESSION_PRESETS } from './lib/presets'
import {
  DEFAULT_SETTINGS,
  type Bar,
  type SessionAnalysis,
  type SharkSettings,
} from './lib/types'
import {
  groupBySession,
  loadSpyBars,
  loadVixDailyMap,
  loadVixLast,
  nyDateKey,
} from './lib/yahoo'

function fmt(n: number | null | undefined, digits = 2) {
  if (n == null || Number.isNaN(n)) return '—'
  return n.toFixed(digits)
}

export default function App() {
  const [bars, setBars] = useState<Bar[]>([])
  const [last, setLast] = useState(0)
  const [vix, setVix] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [settings, setSettings] = useState<SharkSettings>(DEFAULT_SETTINGS)
  const [sessionKey, setSessionKey] = useState(SESSION_PRESETS[0].dateKey)
  const [now, setNow] = useState(() => Date.now())
  const [backtest, setBacktest] = useState<BacktestSummary | null>(null)

  const sessions = useMemo(() => groupBySession(bars), [bars])
  const sessionKeys = useMemo(() => Object.keys(sessions).sort().reverse(), [sessions])
  const tabKeys = useMemo(() => {
    const pinned = SESSION_PRESETS.map((p) => p.dateKey)
    const rest = sessionKeys.filter((k) => !pinned.includes(k)).slice(0, 6)
    return [...pinned.filter((k) => sessionKeys.includes(k)), ...rest]
  }, [sessionKeys])

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [spy, vixLast, vixMap] = await Promise.all([
        loadSpyBars(),
        loadVixLast(),
        loadVixDailyMap(),
      ])
      setBars(spy.bars)
      setLast(spy.last)
      setVix(vixLast)
      setNow(Date.now())
      const grouped = groupBySession(spy.bars)
      const keys = Object.keys(grouped).sort().reverse()
      setSessionKey((prev) => (keys.includes(prev) ? prev : keys[0] ?? prev))
      setBacktest(runBacktest(spy.bars, vixMap, { riskPerTrade: 500 }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load SPY')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    const preset = SESSION_PRESETS.find((p) => p.dateKey === sessionKey)
    if (!preset) return
    setSettings((s) => ({
      ...s,
      callWall: preset.callWall,
      putWall: preset.putWall,
      gammaRegime: preset.gammaRegime,
    }))
  }, [sessionKey])

  const analysis: SessionAnalysis | null = useMemo(() => {
    const dayBars = sessions[sessionKey]
    if (!dayBars?.length) return null
    const extras = sessionExtras(sessionKey, bars)
    return analyzeSession(sessionKey, dayBars, settings, vix, extras)
  }, [sessions, sessionKey, bars, settings, vix])

  const activePreset = SESSION_PRESETS.find((p) => p.dateKey === sessionKey)
  const biasClass =
    analysis?.bias === 'PUT' ? 'bias-put' : analysis?.bias === 'CALL' ? 'bias-call' : 'bias-flat'

  return (
    <div className="app-shell">
      <div className="aurora" aria-hidden />
      <div className="grain" aria-hidden />

      <header className="topbar">
        <div className="brand-block">
          <div className="brand-mark" aria-hidden>
            <svg viewBox="0 0 64 64" width="36" height="36">
              <path
                d="M6 34c14-3 22-14 30-14 6 0 10 3 14 8 4 2 8 3 12 2-6 6-14 10-24 11-8 1-16-1-22-4 2 5 7 9 14 11-12 1-20-5-24-14z"
                fill="currentColor"
              />
              <circle cx="44" cy="28" r="2.2" fill="#061018" />
            </svg>
          </div>
          <div>
            <p className="eyebrow">SPY 0DTE · 30 ORB</p>
            <h1>Shark Desk</h1>
          </div>
        </div>

        <div className="top-stats">
          <div>
            <span>SPY</span>
            <strong>{fmt(last)}</strong>
          </div>
          <div>
            <span>VIX</span>
            <strong>
              {fmt(vix)} <em>{analysis?.vixLabel ?? '—'}</em>
            </strong>
          </div>
          <div>
            <span>Session</span>
            <strong>{sessionKey || '—'}</strong>
          </div>
          <button type="button" className="ghost-btn" onClick={() => void refresh()} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </header>

      <main className="layout">
        <section className="hero-panel">
          <div className="hero-copy">
            <p className="kicker">What he’s doing</p>
            <h2>
              Wait the first <em>30 minutes</em>, read the candle, trade the break into gamma.
            </h2>
            <p className="lede">
              IncomeSharks’ public Shark SPY day-trader: opening-range bias (green → calls, red →
              puts), confirmation after the range breaks, then Shark / OR / Whale targets paired
              with call & put walls. Best when VIX sits above ~17.
            </p>
            {activePreset && <p className="preset-note">{activePreset.note}</p>}
          </div>

          <div className={`signal-card ${biasClass}`}>
            <div className="signal-head">
              <span>Active bias</span>
              <strong>{analysis?.bias ?? '—'}</strong>
            </div>
            <p className="signal-status">{analysis?.status ?? 'Load a session to begin'}</p>
            <dl className="signal-grid">
              <div>
                <dt>Entry</dt>
                <dd>{fmt(analysis?.entry?.price)}</dd>
              </div>
              <div>
                <dt>Shark TP</dt>
                <dd className={analysis?.hitShark ? 'hit' : ''}>{fmt(analysis?.sharkTarget)}</dd>
              </div>
              <div>
                <dt>OR target</dt>
                <dd className={analysis?.hitOr ? 'hit' : ''}>{fmt(analysis?.orTarget)}</dd>
              </div>
              <div>
                <dt>Whale TP</dt>
                <dd className={analysis?.hitWhale ? 'hit' : ''}>{fmt(analysis?.whaleTarget)}</dd>
              </div>
              <div>
                <dt>ORB high</dt>
                <dd>{fmt(analysis?.orbHigh)}</dd>
              </div>
              <div>
                <dt>ORB low</dt>
                <dd>{fmt(analysis?.orbLow)}</dd>
              </div>
              <div>
                <dt>Call wall</dt>
                <dd>{fmt(settings.callWall)}</dd>
              </div>
              <div>
                <dt>Put wall</dt>
                <dd className={analysis?.hitGamma && analysis.bias === 'PUT' ? 'hit' : ''}>
                  {fmt(settings.putWall)}
                </dd>
              </div>
            </dl>
          </div>
        </section>

        <section className="chart-panel">
          <div className="chart-toolbar">
            <div className="session-tabs" role="tablist">
              {(tabKeys.length ? tabKeys : SESSION_PRESETS.map((p) => p.dateKey)).map((key) => {
                const preset = SESSION_PRESETS.find((p) => p.dateKey === key)
                return (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={sessionKey === key}
                    className={sessionKey === key ? 'active' : ''}
                    onClick={() => setSessionKey(key)}
                  >
                    {preset?.label ?? key}
                  </button>
                )
              })}
            </div>
            <div className="legend-inline">
              <span className="lg call">CALL</span>
              <span className="lg put">PUT</span>
              <span className="lg shark">Shark</span>
              <span className="lg or">OR</span>
              <span className="lg whale">Whale</span>
              <span className="lg wall">Gamma walls</span>
            </div>
          </div>

          {error && <p className="error-banner">{error}</p>}
          {!analysis && !loading && (
            <p className="empty">No RTH bars for {sessionKey}. Try Refresh or another day.</p>
          )}
          <Chart analysis={analysis} />
        </section>

        <aside className="side-column">
          <BacktestPanel summary={backtest} loading={loading} />

          <section className="panel playbook">
            <header>
              <h2>Playbook</h2>
              <p>The sequence from his X posts & public 30-min walkthrough.</p>
            </header>
            <ol>
              <li>
                <strong>09:30–10:00 ET</strong> — do nothing. Mark the 30-minute high / low.
              </li>
              <li>
                <strong>ORB hint</strong> — green close leans CALL, red leans PUT. Size small first.
              </li>
              <li>
                <strong>Signal</strong> — fire on a confirmed break of the range (failed ORB can flip).
              </li>
              <li>
                <strong>Targets</strong> — Shark (first TP), OR projection, Whale / gamma wall.
              </li>
              <li>
                <strong>Filters</strong> — favor VIX ≥ 17, trade high-volume hours, usually one
                clean entry / exit.
              </li>
            </ol>
          </section>

          <SettingsPanel settings={settings} onChange={setSettings} />

          <section className="panel disclaimer">
            <p>
              Educational recreation of the publicly described 30 ORB + gamma workflow — not the
              proprietary Slice indicator, and not financial advice. Last refresh{' '}
              {new Date(now).toLocaleTimeString('en-US', { timeZone: 'America/Chicago' })} CT ·
              session {nyDateKey(Math.floor(now / 1000))}.
            </p>
          </section>
        </aside>
      </main>
    </div>
  )
}
