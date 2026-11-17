import type { ReactNode } from 'react'
import type { SharkSettings } from '../lib/types'

type Props = {
  settings: SharkSettings
  onChange: (next: SharkSettings) => void
}

function Field({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  )
}

export function SettingsPanel({ settings, onChange }: Props) {
  const set = <K extends keyof SharkSettings>(key: K, value: SharkSettings[K]) => {
    onChange({ ...settings, [key]: value })
  }

  return (
    <section className="panel settings-panel">
      <header>
        <h2>Indicator params</h2>
        <p>Mirrors the public Shark SPY Day Trader knobs from his charts.</p>
      </header>

      <div className="field-grid">
        <Field label="EMA">
          <input
            type="number"
            value={settings.emaLength}
            onChange={(e) => set('emaLength', Number(e.target.value))}
          />
        </Field>
        <Field label="ATR">
          <input
            type="number"
            value={settings.atrLength}
            onChange={(e) => set('atrLength', Number(e.target.value))}
          />
        </Field>
        <Field label="ORB minutes">
          <input
            type="number"
            value={settings.orbMinutes}
            onChange={(e) => set('orbMinutes', Number(e.target.value))}
          />
        </Field>
        <Field label="Gamma regime">
          <select
            value={settings.gammaRegime}
            onChange={(e) => set('gammaRegime', e.target.value as SharkSettings['gammaRegime'])}
          >
            <option>Negative Gamma</option>
            <option>Positive Gamma</option>
            <option>Neutral</option>
          </select>
        </Field>
        <Field label="Call wall">
          <input
            type="number"
            step="0.5"
            value={settings.callWall}
            onChange={(e) => set('callWall', Number(e.target.value))}
          />
        </Field>
        <Field label="Put wall">
          <input
            type="number"
            step="0.5"
            value={settings.putWall}
            onChange={(e) => set('putWall', Number(e.target.value))}
          />
        </Field>
        <Field label="Confirm">
          <input
            type="number"
            value={settings.confirmBars}
            onChange={(e) => set('confirmBars', Number(e.target.value))}
          />
        </Field>
        <Field label="Shark mult">
          <input
            type="number"
            step="0.1"
            value={settings.sharkMult}
            onChange={(e) => set('sharkMult', Number(e.target.value))}
          />
        </Field>
        <Field label="Whale mult">
          <input
            type="number"
            step="0.1"
            value={settings.whaleMult}
            onChange={(e) => set('whaleMult', Number(e.target.value))}
          />
        </Field>
        <Field label="OR mult">
          <input
            type="number"
            step="0.1"
            value={settings.orMult}
            onChange={(e) => set('orMult', Number(e.target.value))}
          />
        </Field>
        <Field label="Band period">
          <input
            type="number"
            value={settings.bandPeriod}
            onChange={(e) => set('bandPeriod', Number(e.target.value))}
          />
        </Field>
        <Field label="Band width">
          <input
            type="number"
            step="0.1"
            value={settings.bandWidth}
            onChange={(e) => set('bandWidth', Number(e.target.value))}
          />
        </Field>
        <Field label="VIX normal ≥">
          <input
            type="number"
            value={settings.vixNormal}
            onChange={(e) => set('vixNormal', Number(e.target.value))}
          />
        </Field>
        <Field label="VIX elevated ≥">
          <input
            type="number"
            value={settings.vixElevated}
            onChange={(e) => set('vixElevated', Number(e.target.value))}
          />
        </Field>
      </div>
    </section>
  )
}
