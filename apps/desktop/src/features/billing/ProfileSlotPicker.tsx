import { useState } from 'react'
import { invokeTauri } from '../../lib/api'
import type { ProfileSlots } from './useBilling'

export function ProfileSlotPicker({ slots, onChange }: { slots: ProfileSlots; onChange: () => Promise<void> }) {
  const [selection, setSelection] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const selected = selection.filter((id) => slots.choices.some((profile) => profile.id === id))

  async function save() {
    setBusy(true)
    setError('')
    try {
      await invokeTauri('select_basic_profiles', { ids: selected })
      setSelection([])
      await onChange()
    } catch (cause) { setError(String(cause)) }
    finally { setBusy(false) }
  }

  return (
    <section className="billing-profile-slots" aria-label="Choose active profiles">
      <h2>Choose {slots.chooseCount === 1 ? 'one active profile' : 'two active profiles'}</h2>
      <p>Your other profiles stay saved in the vault.</p>
      <fieldset className="billing-slot-choices" aria-label="Saved profiles" disabled={busy}>
        {slots.choices.map((profile) => (
          <label key={profile.id}>
            <input type="checkbox" checked={selected.includes(profile.id)}
              disabled={selected.length >= slots.chooseCount && !selected.includes(profile.id)}
              onChange={(event) => setSelection(event.target.checked ? [...selected, profile.id] : selected.filter((id) => id !== profile.id))} />
            {profile.name} · {profile.region}
          </label>
        ))}
      </fieldset>
      <button type="button" className="btn-primary" onClick={() => void save()} disabled={busy || selected.length !== slots.chooseCount}>Use selected profiles</button>
      {error && <p role="alert">{error}</p>}
    </section>
  )
}
