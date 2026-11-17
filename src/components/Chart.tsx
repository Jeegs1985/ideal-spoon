import { useEffect, useRef } from 'react'
import {
  CandlestickSeries,
  ColorType,
  createChart,
  createSeriesMarkers,
  LineSeries,
  LineStyle,
  type IChartApi,
  type SeriesMarker,
  type Time,
} from 'lightweight-charts'
import type { SessionAnalysis } from '../lib/types'

type Props = {
  analysis: SessionAnalysis | null
}

function markerShape(kind: string): SeriesMarker<Time>['shape'] {
  if (kind === 'call') return 'arrowUp'
  if (kind === 'put') return 'arrowDown'
  if (kind === 'exit') return 'square'
  return 'circle'
}

function markerColor(kind: string): string {
  switch (kind) {
    case 'call':
      return '#3dcf8e'
    case 'put':
      return '#ff5c6a'
    case 'exit':
      return '#c4b5a0'
    default:
      return '#9aa4b2'
  }
}

export function Chart({ analysis }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)

  useEffect(() => {
    const host = wrapRef.current
    if (!host || !analysis) return

    host.innerHTML = ''
    const chart = createChart(host, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#9aa8b8',
        fontFamily: '"IBM Plex Sans", sans-serif',
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: 'rgba(148, 175, 190, 0.08)' },
        horzLines: { color: 'rgba(148, 175, 190, 0.08)' },
      },
      rightPriceScale: {
        borderColor: 'rgba(148, 175, 190, 0.15)',
        scaleMargins: { top: 0.1, bottom: 0.08 },
      },
      timeScale: {
        borderColor: 'rgba(148, 175, 190, 0.15)',
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: {
        vertLine: { color: 'rgba(94, 200, 255, 0.35)', width: 1, style: LineStyle.Dashed },
        horzLine: { color: 'rgba(94, 200, 255, 0.35)', width: 1, style: LineStyle.Dashed },
      },
    })
    chartRef.current = chart

    const candle = chart.addSeries(CandlestickSeries, {
      upColor: '#1f9d6a',
      downColor: '#d64550',
      borderUpColor: '#3dcf8e',
      borderDownColor: '#ff5c6a',
      wickUpColor: '#3dcf8e',
      wickDownColor: '#ff5c6a',
    })

    candle.setData(
      analysis.bars.map((b) => ({
        time: b.time as Time,
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
      })),
    )

    const ema = chart.addSeries(LineSeries, {
      color: 'rgba(110, 168, 255, 0.9)',
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    })
    ema.setData(analysis.ema.map((p) => ({ time: p.time as Time, value: p.value })))

    const upper = chart.addSeries(LineSeries, {
      color: 'rgba(255, 92, 106, 0.35)',
      lineWidth: 1,
      lineStyle: LineStyle.Dotted,
      priceLineVisible: false,
      lastValueVisible: false,
    })
    upper.setData(analysis.upperBand.map((p) => ({ time: p.time as Time, value: p.value })))

    const lower = chart.addSeries(LineSeries, {
      color: 'rgba(61, 207, 142, 0.35)',
      lineWidth: 1,
      lineStyle: LineStyle.Dotted,
      priceLineVisible: false,
      lastValueVisible: false,
    })
    lower.setData(analysis.lowerBand.map((p) => ({ time: p.time as Time, value: p.value })))

    if (analysis.trail.length) {
      const trail = chart.addSeries(LineSeries, {
        color: 'rgba(180, 210, 255, 0.75)',
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
      })
      trail.setData(analysis.trail.map((p) => ({ time: p.time as Time, value: p.value })))
    }

    const levelColors: Record<string, string> = {
      callWall: '#e8a05c',
      putWall: '#4ecdc4',
      orbHigh: 'rgba(120, 170, 255, 0.85)',
      orbLow: 'rgba(120, 170, 255, 0.85)',
      weeklyOpen: '#6fdf8b',
      prevWeekLow: '#d4c56a',
      trail: '#9aa8b8',
    }

    for (const level of analysis.levels) {
      candle.createPriceLine({
        price: level.price,
        color: levelColors[level.style] ?? '#9aa8b8',
        lineWidth: 1,
        lineStyle: level.style.includes('Wall') ? LineStyle.Dashed : LineStyle.Solid,
        axisLabelVisible: true,
        title: level.label,
      })
    }

    if (analysis.sharkTarget != null) {
      candle.createPriceLine({
        price: analysis.sharkTarget,
        color: '#5ec8ff',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: 'Shark',
      })
    }
    if (analysis.orTarget != null) {
      candle.createPriceLine({
        price: analysis.orTarget,
        color: '#f0c75e',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: 'OR',
      })
    }
    if (analysis.whaleTarget != null) {
      candle.createPriceLine({
        price: analysis.whaleTarget,
        color: '#3b82f6',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: 'Whale',
      })
    }

    const signalMarkers: SeriesMarker<Time>[] = analysis.markers
      .filter((m) => m.kind === 'call' || m.kind === 'put' || m.kind === 'exit')
      .map((m) => ({
        time: m.time as Time,
        position: m.kind === 'call' ? 'belowBar' : 'aboveBar',
        color: markerColor(m.kind),
        shape: markerShape(m.kind),
        text: m.label ?? '',
      }))

    createSeriesMarkers(candle, signalMarkers)
    chart.timeScale().fitContent()

    return () => {
      chart.remove()
      if (chartRef.current === chart) chartRef.current = null
    }
  }, [analysis])

  return <div className="chart-surface" ref={wrapRef} />
}
