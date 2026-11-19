import { useState } from 'react'
import { ArrowRightLeft, Lock, ShieldCheck } from 'lucide-react'
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
    <section className="billing-profile-slots billing-profile-slots-card" aria-label="Choose active profiles">
      <div className="billing-slot-badge-head">
        <Lock size={14} />
        <span>Basic Edition Profile Limit</span>
      </div>
      <h2>Choose {slots.chooseCount === 1 ? 'one active profile' : 'two active profiles'}</h2>
      <p>Your other profiles stay saved in the vault.</p>
      <fieldset className="billing-slot-choices billing-slot-grid" aria-label="Saved profiles" disabled={busy}>
        {slots.choices.map((profile) => {
          const isChecked = selected.includes(profile.id)
          return (
            <label key={profile.id} className={`billing-slot-choice-label ${isChecked ? 'selected' : ''}`}>
              <input
                type="checkbox"
                checked={isChecked}
                disabled={selected.length >= slots.chooseCount && !isChecked}
                onChange={(event) => setSelection(event.target.checked ? [...selected, profile.id] : selected.filter((id) => id !== profile.id))}
              />
              <span>{profile.name} · {profile.region}</span>
            </label>
          )
        })}
      </fieldset>
      <div>
        <button type="button" className="btn-primary" onClick={() => void save()} disabled={busy || selected.length !== slots.chooseCount}>
          <ShieldCheck size={14} /> Use selected profiles
        </button>
      </div>
      {error && <p role="alert" className="billing-alert error">{error}</p>}
    </section>
  )
}

export function ReplaceActiveProfile({ slots, active, blocked, onChange }: {
  slots: ProfileSlots
  active: { id: string; name: string; region: string }[]
  blocked: boolean
  onChange: () => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [activeId, setActiveId] = useState('')
  const [lockedId, setLockedId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function replace() {
    setBusy(true)
    setError('')
    try {
      await invokeTauri('replace_basic_profile', { activeId, lockedId })
      setOpen(false)
      setActiveId('')
      setLockedId('')
      await onChange()
    } catch (cause) { setError(String(cause)) }
    finally { setBusy(false) }
  }

  return (
    <section className="billing-profile-slots billing-profile-slots-card" aria-label="Basic profile slots">
      <div className="billing-slot-badge-head">
        <Lock size={14} />
        <span>Vault Status</span>
      </div>
      <p>{slots.lockedCount} saved {slots.lockedCount === 1 ? 'profile is' : 'profiles are'} locked on Basic.</p>
      {open ? (
        <form className="billing-fields" onSubmit={(event) => { event.preventDefault(); void replace() }}>
          <label>Active profile to replace
            <select value={activeId} onChange={(event) => setActiveId(event.target.value)} required disabled={busy || blocked}>
              <option value="">Choose an active profile</option>
              {active.map((profile) => <option key={profile.id} value={profile.id}>{profile.name} · {profile.region}</option>)}
            </select>
          </label>
          <label>Saved profile to activate
            <select value={lockedId} onChange={(event) => setLockedId(event.target.value)} required disabled={busy || blocked}>
              <option value="">Choose a saved profile</option>
              {slots.choices.map((profile) => <option key={profile.id} value={profile.id}>{profile.name} · {profile.region}</option>)}
            </select>
          </label>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Both profiles stay saved. Any running Riot session continues.</p>
          <div className="billing-actions">
            <button type="submit" className="btn-primary" disabled={busy || blocked || !activeId || !lockedId}>
              <ArrowRightLeft size={14} /> Replace active profile
            </button>
            <button type="button" className="btn-secondary" disabled={busy} onClick={() => { setOpen(false); setError('') }}>
              Cancel
            </button>
          </div>
          {error && <p role="alert" className="billing-alert error">{error}</p>}
        </form>
      ) : (
        <div>
          <button type="button" className="btn-secondary" disabled={blocked} onClick={() => setOpen(true)}>
            <ArrowRightLeft size={14} /> Change active profiles
          </button>
        </div>
      )}
    </section>
  )
}
