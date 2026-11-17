#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'public', 'data')

async function pull(symbol, file, { interval = '5m', range = '60d' } = {}) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
  if (!res.ok) throw new Error(`${symbol} ${res.status}`)
  const json = await res.json()
  await writeFile(join(outDir, file), JSON.stringify(json))
  const meta = json.chart?.result?.[0]?.meta
  const bars = json.chart?.result?.[0]?.timestamp?.length ?? 0
  console.log(`wrote ${file} · last ${meta?.regularMarketPrice} · bars ${bars}`)
}

await mkdir(outDir, { recursive: true })
await pull('SPY', 'spy.json', { interval: '5m', range: '60d' })
await pull('^VIX', 'vix.json', { interval: '5m', range: '60d' })
await pull('^VIX', 'vix_daily.json', { interval: '1d', range: '3mo' })
