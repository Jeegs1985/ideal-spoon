import type {
  Bar,
  Bias,
  Level,
  Marker,
  SessionAnalysis,
  SharkSettings,
} from './types'
import { nyMinutesSinceMidnight } from './yahoo'

function emaSeries(bars: Bar[], length: number): { time: number; value: number }[] {
  if (!bars.length) return []
  const k = 2 / (length + 1)
  const out: { time: number; value: number }[] = []
  let prev = bars[0].close
  for (let i = 0; i < bars.length; i++) {
    const value = i === 0 ? bars[i].close : bars[i].close * k + prev * (1 - k)
    prev = value
    out.push({ time: bars[i].time, value })
  }
  return out
}

function atrSeries(bars: Bar[], length: number): number[] {
  const atr: number[] = new Array(bars.length).fill(0)
  if (!bars.length) return atr
  let prevClose = bars[0].close
  const trs: number[] = []
  for (let i = 0; i < bars.length; i++) {
    const high = bars[i].high
    const low = bars[i].low
    const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose))
    trs.push(tr)
    if (i === 0) {
      atr[i] = tr
    } else if (i < length) {
      atr[i] = trs.slice(0, i + 1).reduce((a, b) => a + b, 0) / (i + 1)
    } else if (i === length) {
      atr[i] = trs.slice(0, length).reduce((a, b) => a + b, 0) / length
    } else {
      atr[i] = (atr[i - 1] * (length - 1) + tr) / length
    }
    prevClose = bars[i].close
  }
  return atr
}

function vixLabel(vix: number | null, settings: SharkSettings): string {
  if (vix == null) return '—'
  if (vix >= settings.vixElevated) return 'Elevated'
  if (vix >= settings.vixNormal) return 'Normal'
  return 'Low'
}

/**
 * Educational recreation of the publicly described Shark SPY day-trader:
 * build the first N-minute opening range, hint bias from candle color, then
 * fire CALL/PUT on a confirmed break of the range (failed ORB can flip).
 * Targets: Shark (first TP), OR projection, Whale (stretch / gamma wall).
 */
export function analyzeSession(
  dateKey: string,
  bars: Bar[],
  settings: SharkSettings,
  vix: number | null,
  extras?: { weeklyOpen?: number; prevWeekLow?: number },
): SessionAnalysis {
  const markers: Marker[] = []
  const levels: Level[] = []
  const openMin = 9 * 60 + 30
  const orbEnd = openMin + settings.orbMinutes

  const orbBars = bars.filter((b) => {
    const m = nyMinutesSinceMidnight(b.time)
    return m >= openMin && m < orbEnd
  })
  const postOrb = bars.filter((b) => nyMinutesSinceMidnight(b.time) >= orbEnd)

  let orbHigh: number | null = null
  let orbLow: number | null = null
  let orbOpen: number | null = null
  let orbClose: number | null = null
  let orbBias: Bias = 'FLAT'
  let bias: Bias = 'FLAT'

  if (orbBars.length) {
    orbOpen = orbBars[0].open
    orbClose = orbBars[orbBars.length - 1].close
    orbHigh = Math.max(...orbBars.map((b) => b.high))
    orbLow = Math.min(...orbBars.map((b) => b.low))
    orbBias = orbClose >= orbOpen ? 'CALL' : 'PUT'
    bias = orbBias
    levels.push(
      { price: orbHigh, label: 'ORB High', style: 'orbHigh' },
      { price: orbLow, label: 'ORB Low', style: 'orbLow' },
    )
  }

  levels.push(
    { price: settings.callWall, label: 'Call Wall', style: 'callWall' },
    { price: settings.putWall, label: 'Put Wall', style: 'putWall' },
  )
  if (extras?.weeklyOpen != null) {
    levels.push({ price: extras.weeklyOpen, label: 'Weekly Open', style: 'weeklyOpen' })
  }
  if (extras?.prevWeekLow != null) {
    levels.push({ price: extras.prevWeekLow, label: 'Prev Week Low', style: 'prevWeekLow' })
  }

  const range = orbHigh != null && orbLow != null ? orbHigh - orbLow : 0

  let sharkTarget: number | null = null
  let whaleTarget: number | null = null
  let orTarget: number | null = null

  const setTargets = (signal: Bias, entryPrice: number) => {
    if (range <= 0 || signal === 'FLAT') return
    const dir = signal === 'CALL' ? 1 : -1
    const entryRef = signal === 'CALL' ? (orbHigh as number) : (orbLow as number)
    sharkTarget = entryRef + dir * range * settings.sharkMult
    orTarget = entryRef + dir * range * settings.orMult
    whaleTarget = entryRef + dir * range * settings.whaleMult

    const wall = signal === 'CALL' ? settings.callWall : settings.putWall
    if (signal === 'PUT' && wall < entryPrice) {
      whaleTarget = Math.min(whaleTarget, wall)
    }
    if (signal === 'CALL' && wall > entryPrice) {
      whaleTarget = Math.max(whaleTarget, wall)
    }
  }

  const ema = emaSeries(bars, settings.emaLength)
  const atr = atrSeries(bars, settings.atrLength)
  const bandAtr = atrSeries(bars, settings.bandPeriod)
  const upperBand: { time: number; value: number }[] = []
  const lowerBand: { time: number; value: number }[] = []
  const trail: { time: number; value: number }[] = []

  for (let i = 0; i < bars.length; i++) {
    upperBand.push({
      time: bars[i].time,
      value: ema[i].value + bandAtr[i] * settings.bandWidth,
    })
    lowerBand.push({
      time: bars[i].time,
      value: ema[i].value - bandAtr[i] * settings.bandWidth,
    })
  }

  let entry: Marker | null = null
  let putBreaks = 0
  let callBreaks = 0
  let hitShark = false
  let hitWhale = false
  let hitOr = false
  let hitGamma = false
  let exited = false
  let extreme: number | null = null

  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i]
    const mins = nyMinutesSinceMidnight(bar.time)
    const inPost = mins >= orbEnd

    if (inPost && ema[i]) {
      if (bar.close > ema[i].value && bar.close > bar.open) {
        markers.push({ time: bar.time, price: bar.low, kind: 'confirm_up' })
      } else if (bar.close < ema[i].value && bar.close < bar.open) {
        markers.push({ time: bar.time, price: bar.high, kind: 'confirm_down' })
      }
    }

    if (!inPost || orbHigh == null || orbLow == null) {
      trail.push({ time: bar.time, value: ema[i]?.value ?? bar.close })
      continue
    }

    if (!entry && !exited) {
      // Confirmed range breaks — trade the break, not only ORB candle color.
      // A weak green ORB that fails and breaks lower can still print PUT (as on Nov 17).
      if (bar.close < orbLow || (bar.low < orbLow && bar.close < ema[i].value)) {
        putBreaks += 1
        callBreaks = Math.max(0, callBreaks - 1)
      } else if (bar.close > orbHigh || (bar.high > orbHigh && bar.close > ema[i].value)) {
        callBreaks += 1
        putBreaks = Math.max(0, putBreaks - 1)
      }

      const need = Math.max(1, Math.min(2, Math.round(settings.confirmBars / 5)))
      let signal: Bias = 'FLAT'
      if (putBreaks >= need) signal = 'PUT'
      else if (callBreaks >= need) signal = 'CALL'

      // Prefer ORB-aligned break when both are flirting; otherwise take the break.
      if (signal === 'FLAT' && orbBias !== 'FLAT') {
        const alignedBreak =
          orbBias === 'PUT'
            ? bar.close < orbLow
            : bar.close > orbHigh
        if (alignedBreak && (orbBias === 'PUT' ? putBreaks : callBreaks) >= 1) {
          signal = orbBias
        }
      }

      if (signal !== 'FLAT') {
        bias = signal
        entry = {
          time: bar.time,
          price: bar.close,
          kind: signal === 'PUT' ? 'put' : 'call',
          label: signal,
        }
        markers.push(entry)
        extreme = bar.close
        setTargets(signal, bar.close)

        if (sharkTarget != null) {
          markers.push({ time: bar.time, price: sharkTarget, kind: 'shark', label: 'Shark TP' })
        }
        if (orTarget != null) {
          markers.push({ time: bar.time, price: orTarget, kind: 'or', label: 'OR Target' })
        }
        if (whaleTarget != null) {
          markers.push({ time: bar.time, price: whaleTarget, kind: 'whale', label: 'Whale TP' })
        }
      }
    } else if (entry && !exited) {
      extreme =
        bias === 'PUT'
          ? Math.min(extreme ?? bar.low, bar.low)
          : Math.max(extreme ?? bar.high, bar.high)

      if (!hitShark && sharkTarget != null) {
        hitShark = bias === 'PUT' ? bar.low <= sharkTarget : bar.high >= sharkTarget
      }
      if (!hitOr && orTarget != null) {
        hitOr = bias === 'PUT' ? bar.low <= orTarget : bar.high >= orTarget
      }
      if (!hitWhale && whaleTarget != null) {
        hitWhale = bias === 'PUT' ? bar.low <= whaleTarget : bar.high >= whaleTarget
      }
      const wall = bias === 'PUT' ? settings.putWall : settings.callWall
      if (!hitGamma) {
        hitGamma = bias === 'PUT' ? bar.low <= wall : bar.high >= wall
      }

      const mid = (orbHigh + orbLow) / 2
      const reverse =
        bias === 'PUT'
          ? bar.close > mid && bar.close > ema[i].value && bar.close > orbHigh
          : bar.close < mid && bar.close < ema[i].value && bar.close < orbLow

      if (reverse) {
        markers.push({ time: bar.time, price: bar.close, kind: 'exit', label: 'Exit' })
        exited = true
      } else if (hitWhale || hitGamma) {
        markers.push({
          time: bar.time,
          price: bar.close,
          kind: 'exit',
          label: hitWhale ? 'Whale hit' : 'Gamma hit',
        })
        exited = true
      }
    }

    const trailVal =
      !entry || bias === 'FLAT'
        ? ema[i].value
        : bias === 'PUT'
          ? Math.max(ema[i].value, (extreme ?? bar.high) + atr[i] * 0.25)
          : Math.min(ema[i].value, (extreme ?? bar.low) - atr[i] * 0.25)
    trail.push({ time: bar.time, value: trailVal })
  }

  let status = 'Waiting on open range'
  if (orbBars.length && postOrb.length === 0) {
    status = `ORB set · candle bias ${orbBias} · waiting for break`
  } else if (entry && !exited) {
    status = `${bias} active · ride toward ${bias === 'PUT' ? 'put' : 'call'} wall`
  } else if (entry && exited) {
    const hits = [
      hitShark && 'Shark',
      hitOr && 'OR',
      hitWhale && 'Whale',
      hitGamma && 'Gamma',
    ].filter(Boolean)
    status = `${bias} closed · hit ${hits.join(' / ') || 'exit'}`
  } else if (orbBias !== 'FLAT') {
    status = `ORB candle ${orbBias} · no confirmed break yet`
  }

  return {
    dateKey,
    bars,
    orbHigh,
    orbLow,
    orbOpen,
    orbClose,
    bias,
    entry,
    markers,
    levels,
    sharkTarget,
    whaleTarget,
    orTarget,
    ema,
    upperBand,
    lowerBand,
    trail,
    vix,
    vixLabel: vixLabel(vix, settings),
    hitShark,
    hitWhale,
    hitOr,
    hitGamma,
    status,
  }
}

export function sessionExtras(
  dateKey: string,
  allBars: Bar[],
): { weeklyOpen?: number; prevWeekLow?: number } {
  const byDay: Record<string, Bar[]> = {}
  for (const bar of allBars) {
    const key = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(bar.time * 1000))
    ;(byDay[key] ??= []).push(bar)
  }
  const days = Object.keys(byDay).sort()
  if (!days.includes(dateKey)) return {}

  const date = new Date(`${dateKey}T12:00:00-05:00`)
  const day = date.getDay()
  const mondayOffset = (day + 6) % 7
  const monday = new Date(date)
  monday.setDate(date.getDate() - mondayOffset)
  const mondayKey = monday.toISOString().slice(0, 10)

  let weeklyOpen: number | undefined
  if (byDay[mondayKey]?.length) {
    weeklyOpen = byDay[mondayKey][0].open
  } else {
    for (const d of days) {
      if (d >= mondayKey && d <= dateKey && byDay[d]?.length) {
        weeklyOpen = byDay[d][0].open
        break
      }
    }
  }

  let prevWeekLow: number | undefined
  const prevDays = days.filter((d) => d < mondayKey)
  if (prevDays.length) {
    prevWeekLow = Math.min(...prevDays.flatMap((d) => byDay[d].map((b) => b.low)))
  }

  return { weeklyOpen, prevWeekLow }
}
