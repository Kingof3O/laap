import { useState, useEffect, useRef } from 'react'
import { Check, FileText, Loader2, Tag } from 'lucide-react'
import { playHextechSelect } from '../../../lib/soundEffects.ts'

const QUICK_TAGS = ['[Main]', '[Smurf]', '[Duo]', '[Practice]', '[Decay Watch]', '[Dodge Timer]']

export function InspectorNotesSection({
  notes = '',
  onSaveNotes,
  disabled = false,
}: {
  notes?: string
  onSaveNotes?: (notes: string) => Promise<void>
  disabled?: boolean
}) {
  const [content, setContent] = useState(notes)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const timer = useRef<number | null>(null)

  useEffect(() => {
    setContent(notes || '')
  }, [notes])

  const save = async (nextValue: string) => {
    if (nextValue === notes || !onSaveNotes) return
    setSaving(true)
    setSaved(false)
    try {
      await onSaveNotes(nextValue)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const next = e.target.value
    setContent(next)
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      void save(next)
    }, 800)
  }

  const handleBlur = () => {
    if (timer.current) window.clearTimeout(timer.current)
    void save(content)
  }

  const handleAddTag = (tag: string) => {
    playHextechSelect()
    if (content.includes(tag)) return
    const next = content ? `${content.trim()} ${tag}` : tag
    setContent(next)
    void save(next)
  }

  return (
    <section className="inspector-section inspector-notes" aria-label="Account Notes &amp; Tags">
      <div className="inspector-section-heading">
        <h3>
          <FileText size={14} aria-hidden="true" /> Notes &amp; Tags
        </h3>
        <div className="inspector-notes-status">
          {saving ? (
            <span className="inspector-notes-saving">
              <Loader2 size={11} className="animate-spin" /> Saving...
            </span>
          ) : saved ? (
            <span className="inspector-notes-saved">
              <Check size={11} /> Saved
            </span>
          ) : (
            <span className="inspector-notes-count">{content.length}/500</span>
          )}
        </div>
      </div>

      <div className="inspector-notes-container">
        {!content.trim() ? (
          <p className="inspector-notes-body" style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '0 0 6px 0' }}>
            No notes added.
          </p>
        ) : null}
        <textarea
          className="inspector-notes-textarea"
          value={content}
          onChange={handleChange}
          onBlur={handleBlur}
          placeholder="Add account notes, dodge cooldowns, duo partners, or [Tags]..."
          maxLength={500}
          rows={3}
          disabled={disabled}
          aria-label="Account notes"
        />

        <div className="inspector-quick-tags" aria-label="Quick tag chips">
          <span className="inspector-quick-tags-label">
            <Tag size={10} aria-hidden="true" /> Quick tags:
          </span>
          <div className="inspector-tag-chips">
            {QUICK_TAGS.map((tag) => (
              <button
                key={tag}
                type="button"
                className={`inspector-tag-chip ${content.includes(tag) ? 'active' : ''}`}
                onClick={() => handleAddTag(tag)}
                disabled={disabled || content.includes(tag)}
                title={`Add ${tag} to notes`}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
