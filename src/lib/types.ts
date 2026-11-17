export type Bar = {
  time: number // unix seconds
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export type Bias = 'CALL' | 'PUT' | 'FLAT'

export type SharkSettings = {
  emaLength: number
  atrLength: number
  orbMinutes: number
  gammaRegime: 'Negative Gamma' | 'Positive Gamma' | 'Neutral'
  callWall: number
  putWall: number
  confirmBars: number
  sharkMult: number
  whaleMult: number
  orMult: number
  bandPeriod: number
  bandOffset: number
  bandWidth: number
  vixNormal: number
  vixElevated: number
  trailAtr: number
}

export const DEFAULT_SETTINGS: SharkSettings = {
  emaLength: 9,
  atrLength: 30,
  orbMinutes: 30,
  gammaRegime: 'Negative Gamma',
  callWall: 742,
  putWall: 735,
  confirmBars: 5,
  // From his chart tuple (... 5, 1, 0.5, 0.9 ...): stretch / first-TP / OR
  sharkMult: 0.5,
  whaleMult: 1,
  orMult: 0.9,
  bandPeriod: 16,
  bandOffset: 0,
  bandWidth: 1.5,
  vixNormal: 17,
  vixElevated: 25,
  trailAtr: 0.02,
}

export type MarkerKind =
  | 'call'
  | 'put'
  | 'shark'
  | 'whale'
  | 'or'
  | 'exit'
  | 'confirm_up'
  | 'confirm_down'
  | 'reversal'

export type Marker = {
  time: number
  price: number
  kind: MarkerKind
  label?: string
}

export type Level = {
  price: number
  label: string
  style: 'callWall' | 'putWall' | 'orbHigh' | 'orbLow' | 'weeklyOpen' | 'prevWeekLow' | 'trail'
}

export type SessionAnalysis = {
  dateKey: string
  bars: Bar[]
  orbHigh: number | null
  orbLow: number | null
  orbOpen: number | null
  orbClose: number | null
  bias: Bias
  entry: Marker | null
  markers: Marker[]
  levels: Level[]
  sharkTarget: number | null
  whaleTarget: number | null
  orTarget: number | null
  ema: { time: number; value: number }[]
  upperBand: { time: number; value: number }[]
  lowerBand: { time: number; value: number }[]
  trail: { time: number; value: number }[]
  vix: number | null
  vixLabel: string
  hitShark: boolean
  hitWhale: boolean
  hitOr: boolean
  hitGamma: boolean
  status: string
}

export type SessionPreset = {
  id: string
  label: string
  dateKey: string
  callWall: number
  putWall: number
  gammaRegime: SharkSettings['gammaRegime']
  note: string
}
