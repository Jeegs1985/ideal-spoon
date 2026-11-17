# Shark Desk

Educational recreation of [@IncomeSharks](https://x.com/IncomeSharks)’ public **SPY 30-minute opening-range** day-trader workflow — the same style of desk he posts winning 0DTE trades from on X.

## What it models

1. Build the first **30-minute** RTH range (09:30–10:00 ET)
2. ORB candle color is a **hint** (green → call lean, red → put lean)
3. Fire **CALL / PUT** on a **confirmed break** of that range (a failed ORB can flip — e.g. Nov 17 green ORB → PUT breakdown into the $735 put wall)
4. Project **Shark** (first TP), **OR**, and **Whale** targets; snap Whale toward the gamma wall
5. Overlay call/put walls, weekly open / prev-week low, EMA + outer bands, VIX regime

Not the proprietary Slice indicator. Not financial advice.

## Run

```bash
npm install
npm run refresh-data   # pulls SPY + VIX 5m from Yahoo into public/data
npm run dev
```

Open `http://127.0.0.1:5173`.

## Stack

Vite + React + TradingView Lightweight Charts. Session presets for the Nov 16 whale / Nov 17 $735 gamma posts.
