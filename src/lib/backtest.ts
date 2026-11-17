import { analyzeSession, sessionExtras } from './sharkEngine'
import { DEFAULT_SETTINGS, type Bar, type Bias, type SharkSettings } from './types'
import { groupBySession, nyDateKey } from './yahoo'

export type TradeResult = {
  dateKey: string
  bias: Exclude<Bias, 'FLAT'>
  entry: number
  exit: number
  exitReason: string
  /** SPY points in the trade direction (positive = correct side) */
  spyPoints: number
  /** Approx ATM 0DTE premium at entry ($) */
  premiumEst: number
  /** Estimated long-option return on premium, capped [-100%, +400%] */
  optionPnlPct: number
  /** Dollar PnL if risking `riskPerTrade` on premium */
  optionPnlUsd: number
  vix: number | null
  hitShark: boolean
  hitOr: boolean
  hitWhale: boolean
  hitGamma: boolean
  orbRange: number
}

export type BacktestBucket = {
  label: string
  trades: number
  wins: number
  losses: number
  winRate: number
  avgSpyPoints: number
  avgWinPts: number
  avgLossPts: number
  totalOptionPnlUsd: number
  avgOptionPnlPct: number
}

export type BacktestSummary = {
  sessions: number
  trades: number
  wins: number
  losses: number
  flats: number
  winRate: number
  avgSpyPoints: number
  avgWinPts: number
  avgLossPts: number
  expectancyPts: number
  totalSpyPoints: number
  avgOptionPnlPct: number
  totalOptionPnlUsd: number
  winRateVixGe17: number
  tradesVixGe17: number
  maxWinPct: number
  maxLossPct: number
  riskPerTrade: number
  filtered: BacktestBucket
  tradesList: TradeResult[]
  note: string
}

function bucketFrom(trades: TradeResult[], label: string): BacktestBucket {
  const wins = trades.filter((t) => t.spyPoints > 0.05)
  const losses = trades.filter((t) => t.spyPoints < -0.05)
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
  return {
    label,
    trades: trades.length,
    wins: wins.length,
    losses: losses.length,
    winRate: trades.length ? wins.length / trades.length : 0,
    avgSpyPoints: avg(trades.map((t) => t.spyPoints)),
    avgWinPts: avg(wins.map((t) => t.spyPoints)),
    avgLossPts: avg(losses.map((t) => t.spyPoints)),
    totalOptionPnlUsd: trades.reduce((a, t) => a + t.optionPnlUsd, 0),
    avgOptionPnlPct: avg(trades.map((t) => t.optionPnlPct)),
  }
}

/** Rough ATM 0DTE premium from SPY price + VIX (Black-Scholes-ish toy). */
export function estimateAtmPremium(spy: number, vix: number | null): number {
  const iv = (vix ?? 18) / 100
  // ~half-day to expiration for morning entry; 0.6 scales toward typical retail debit
  const t = 0.5 / 365
  const approx = spy * iv * Math.sqrt(t) * 0.8
  return Math.max(0.35, Math.min(4.5, approx))
}

function optionReturnPct(spyPointsFavorable: number, premium: number): number {
  // ATM delta ~0.5 with a little gamma kick on larger moves
  const delta = 0.5 + Math.min(0.35, Math.abs(spyPointsFavorable) / 8)
  const raw = (spyPointsFavorable * delta) / premium
  return Math.max(-1, Math.min(4, raw))
}

function wallsFromPrior(prior: Bar[] | undefined, today: Bar[]): { callWall: number; putWall: number } {
  const open = today[0]?.open ?? 0
  // Keep walls far enough to matter (~0.55% / ~$4 on SPY); prior-day H/L alone is often too tight.
  const minGap = Math.max(4, open * 0.0055)
  let callWall = open + minGap
  let putWall = open - minGap
  if (prior?.length) {
    const priorHigh = Math.max(...prior.map((b) => b.high))
    const priorLow = Math.min(...prior.map((b) => b.low))
    callWall = Math.max(callWall, priorHigh)
    putWall = Math.min(putWall, priorLow)
    // If prior extremes collapsed on top of open, fall back to gap walls
    if (callWall - open < minGap * 0.6) callWall = open + minGap
    if (open - putWall < minGap * 0.6) putWall = open - minGap
  }
  return { callWall, putWall }
}

function vixForDay(
  dateKey: string,
  vixByDay: Record<string, number>,
): number | null {
  if (vixByDay[dateKey] != null) return vixByDay[dateKey]
  // nearest prior day
  const keys = Object.keys(vixByDay).sort()
  let prev: number | null = null
  for (const k of keys) {
    if (k > dateKey) break
    prev = vixByDay[k]
  }
  return prev
}

export function parseVixDaily(payload: {
  chart: {
    result: Array<{
      timestamp: number[]
      indicators: { quote: Array<{ close: (number | null)[] }> }
    }> | null
  }
}): Record<string, number> {
  const result = payload.chart.result?.[0]
  const out: Record<string, number> = {}
  if (!result) return out
  const closes = result.indicators.quote[0].close
  for (let i = 0; i < result.timestamp.length; i++) {
    const c = closes[i]
    if (c == null || Number.isNaN(c)) continue
    out[nyDateKey(result.timestamp[i])] = c
  }
  return out
}

/**
 * Backtest one trade per RTH session when a confirmed ORB break fires.
 * Gamma walls approximated from prior-day high/low (no SpotGamma feed).
 */
export function runBacktest(
  bars: Bar[],
  vixByDay: Record<string, number>,
  opts?: {
    settings?: SharkSettings
    riskPerTrade?: number
  },
): BacktestSummary {
  const base = opts?.settings ?? DEFAULT_SETTINGS
  const riskPerTrade = opts?.riskPerTrade ?? 500
  const sessions = groupBySession(bars)
  const keys = Object.keys(sessions).sort()
  const tradesList: TradeResult[] = []
  let flats = 0

  for (let i = 0; i < keys.length; i++) {
    const dateKey = keys[i]
    const dayBars = sessions[dateKey]
    if (!dayBars || dayBars.length < 8) {
      flats += 1
      continue
    }
    const prior = i > 0 ? sessions[keys[i - 1]] : undefined
    const walls = wallsFromPrior(prior, dayBars)
    const settings: SharkSettings = {
      ...base,
      callWall: walls.callWall,
      putWall: walls.putWall,
    }
    const vix = vixForDay(dateKey, vixByDay)
    const analysis = analyzeSession(
      dateKey,
      dayBars,
      settings,
      vix,
      sessionExtras(dateKey, bars),
    )

    if (!analysis.entry || analysis.bias === 'FLAT') {
      flats += 1
      continue
    }

    const exitMarker = [...analysis.markers].reverse().find((m) => m.kind === 'exit')
    // Prefer target prices when a TP level was tagged (bar close overstates noise)
    let exit = exitMarker?.price ?? dayBars[dayBars.length - 1].close
    let exitReason =
      exitMarker?.label ??
      (analysis.hitWhale
        ? 'Whale'
        : analysis.hitGamma
          ? 'Gamma'
          : analysis.hitOr
            ? 'OR'
            : analysis.hitShark
              ? 'Shark'
              : 'EOD')

    if (analysis.bias === 'PUT') {
      if (analysis.hitWhale && analysis.whaleTarget != null) {
        exit = analysis.whaleTarget
        exitReason = 'Whale'
      } else if (analysis.hitGamma) {
        exit = settings.putWall
        exitReason = 'Gamma'
      } else if (analysis.hitOr && analysis.orTarget != null) {
        exit = analysis.orTarget
        exitReason = 'OR'
      } else if (analysis.hitShark && analysis.sharkTarget != null) {
        exit = analysis.sharkTarget
        exitReason = 'Shark'
      }
    } else {
      if (analysis.hitWhale && analysis.whaleTarget != null) {
        exit = analysis.whaleTarget
        exitReason = 'Whale'
      } else if (analysis.hitGamma) {
        exit = settings.callWall
        exitReason = 'Gamma'
      } else if (analysis.hitOr && analysis.orTarget != null) {
        exit = analysis.orTarget
        exitReason = 'OR'
      } else if (analysis.hitShark && analysis.sharkTarget != null) {
        exit = analysis.sharkTarget
        exitReason = 'Shark'
      }
    }

    const dir = analysis.bias === 'CALL' ? 1 : -1
    const spyPoints = dir * (exit - analysis.entry.price)
    const premiumEst = estimateAtmPremium(analysis.entry.price, vix)
    const optionPnlPct = optionReturnPct(spyPoints, premiumEst)
    const optionPnlUsd = riskPerTrade * optionPnlPct

    tradesList.push({
      dateKey,
      bias: analysis.bias,
      entry: analysis.entry.price,
      exit,
      exitReason,
      spyPoints,
      premiumEst,
      optionPnlPct,
      optionPnlUsd,
      vix,
      hitShark: analysis.hitShark,
      hitOr: analysis.hitOr,
      hitWhale: analysis.hitWhale,
      hitGamma: analysis.hitGamma,
      orbRange:
        analysis.orbHigh != null && analysis.orbLow != null
          ? analysis.orbHigh - analysis.orbLow
          : 0,
    })
  }

  const wins = tradesList.filter((t) => t.spyPoints > 0.05)
  const losses = tradesList.filter((t) => t.spyPoints < -0.05)
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)

  // Quality filter closer to his public commentary: VIX ≥ 17 and a meaningful ORB
  const filteredTrades = tradesList.filter(
    (t) => (t.vix ?? 0) >= 17 && t.orbRange >= 1.0,
  )
  const filtered = bucketFrom(filteredTrades, 'VIX ≥ 17 & ORB ≥ $1')

  const optionPcts = tradesList.map((t) => t.optionPnlPct)

  return {
    sessions: keys.length,
    trades: tradesList.length,
    wins: wins.length,
    losses: losses.length,
    flats,
    winRate: tradesList.length ? wins.length / tradesList.length : 0,
    avgSpyPoints: avg(tradesList.map((t) => t.spyPoints)),
    avgWinPts: avg(wins.map((t) => t.spyPoints)),
    avgLossPts: avg(losses.map((t) => t.spyPoints)),
    expectancyPts: avg(tradesList.map((t) => t.spyPoints)),
    totalSpyPoints: tradesList.reduce((a, t) => a + t.spyPoints, 0),
    avgOptionPnlPct: avg(optionPcts),
    totalOptionPnlUsd: tradesList.reduce((a, t) => a + t.optionPnlUsd, 0),
    winRateVixGe17: filtered.winRate,
    tradesVixGe17: filtered.trades,
    maxWinPct: optionPcts.length ? Math.max(...optionPcts) : 0,
    maxLossPct: optionPcts.length ? Math.min(...optionPcts) : 0,
    riskPerTrade,
    filtered,
    tradesList: [...tradesList].reverse(),
    note:
      'Educational backtest of this recreation — not IncomeSharks’ live Slice indicator. Gamma walls are proxied (not SpotGamma). 0DTE $ assumes risking a fixed debit per signal; no slippage, spreads, or partial fills.',
  }
}
