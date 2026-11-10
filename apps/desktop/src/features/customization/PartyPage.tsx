import { useState } from 'react'
import { useParty } from './useParty'

export function PartyPage({ selection }: { selection: { id: number; name: string } | null }) {
  const party = useParty()
  const [consent, setConsent] = useState(false)
  const [invite, setInvite] = useState('')
  const [message, setMessage] = useState('')
  const working = party.state === 'connecting' || party.state === 'reconnecting'

  return (
    <>
      <h2>Party rooms</h2>
      <p>Share cosmetic references with invited members. Rooms use temporary member IDs and expire after one hour.</p>
      {!party.configured && <p role="status">This build has no configured community relay.</p>}
      {party.configured && <label className="customization-check">
        <input type="checkbox" checked={consent} onChange={(event) => {
          setConsent(event.target.checked)
          if (!event.target.checked) party.leave()
        }} /> Connect to the community relay and share my room activity with members.
      </label>}
      {party.error && <p role="alert">{party.error}</p>}
      {working && <p role="status">{party.state === 'connecting' ? 'Connecting…' : 'Reconnecting…'}</p>}
      {party.configured && consent && !party.snapshot && (
        <form className="customization-editor" onSubmit={(event) => { event.preventDefault(); party.join(invite.trim().toLowerCase()) }}>
          <label>Invite code <input autoComplete="off" maxLength={12} value={invite} onChange={(event) => setInvite(event.target.value)} /></label>
          <div className="customization-actions">
            <button type="submit" className="btn-primary" disabled={working || !/^[a-f0-9]{12}$/i.test(invite.trim())}>Join room</button>
            <button type="button" className="btn-secondary" disabled={working} onClick={party.create}>Create room</button>
            {working && <button type="button" className="btn-secondary" onClick={party.leave}>Cancel</button>}
          </div>
        </form>
      )}
      {party.snapshot && <section>
        <h3>Invite code <code>{party.snapshot.invite}</code></h3>
        <p>{party.snapshot.members.length} member(s) · Expires at {new Date(party.snapshot.expiresAt).toLocaleTimeString()}</p>
        <ul className="customization-list">
          {party.snapshot.members.map((member) => <li key={member.id}>
            <strong>{member.id === party.snapshot?.self ? 'You' : 'Member ' + member.id.slice(0, 6)}{member.id === party.snapshot?.owner ? ' · Host' : ''}</strong>
            <span>{member.connected ? 'Connected' : 'Disconnected'}{member.selection !== null ? ' · Cosmetic #' + member.selection : ''}</span>
            {party.snapshot?.self === party.snapshot?.owner && member.id !== party.snapshot?.self &&
              <button className="btn-secondary" disabled={party.state !== 'online'} onClick={() => party.kick(member.id)}>Remove member</button>}
          </li>)}
        </ul>
        <label className="customization-check">
          <input type="checkbox" checked={party.chatEnabled} onChange={(event) => party.setChatConsent(event.target.checked)} />
          Enable temporary chat with consenting room members.
        </label>
        {party.chatEnabled && <>
          <p>Chat is kept in memory for this room. Avoid sharing account credentials or personal information.</p>
          <ol className="customization-list" aria-label="Party messages">{party.messages.map((item) =>
            <li key={item.id}><strong>{item.memberId === party.snapshot?.self ? 'You' : 'Member ' + item.memberId.slice(0, 6)}</strong><span>{item.text}</span></li>)}</ol>
          <form className="customization-editor" onSubmit={(event) => {
            event.preventDefault()
            if (message.trim()) { party.chat(message.trim()); setMessage('') }
          }}>
            <label>Message <input maxLength={240} value={message} onChange={(event) => setMessage(event.target.value)} /></label>
            <button className="btn-secondary" disabled={party.state !== 'online' || !message.trim()}>Send message</button>
          </form>
        </>}
        <div className="customization-actions">
          {selection && <button className="btn-primary" disabled={party.state !== 'online'} onClick={() => party.select(selection.id)}>Share {selection.name}</button>}
          <button className="btn-secondary" disabled={party.state !== 'online'} onClick={() => party.select(null)}>Clear my selection</button>
          {party.snapshot.self === party.snapshot.owner && <button className="btn-secondary" disabled={party.state !== 'online'} onClick={party.rotate}>Rotate invite</button>}
          {party.state === 'offline' && <button className="btn-secondary" onClick={party.retry}>Reconnect</button>}
          <button className="btn-secondary" onClick={party.leave}>Leave room</button>
        </div>
      </section>}
    </>
  )
}
