#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'public', 'data')

async function pull(symbol, file) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=5m&range=5d`
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
  if (!res.ok) throw new Error(`${symbol} ${res.status}`)
  const json = await res.json()
  await writeFile(join(outDir, file), JSON.stringify(json))
  const meta = json.chart?.result?.[0]?.meta
  console.log(`wrote ${file} · last ${meta?.regularMarketPrice}`)
}

await mkdir(outDir, { recursive: true })
await pull('SPY', 'spy.json')
await pull('^VIX', 'vix.json')
