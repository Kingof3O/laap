import { FileText } from 'lucide-react'

export function InspectorNotesSection({ notes }: { notes?: string }) {
  if (notes === undefined) return null

  return (
    <section className="inspector-section inspector-notes" aria-label="Notes">
      <div className="inspector-section-heading">
        <h3>
          <FileText size={14} aria-hidden="true" /> Notes
        </h3>
      </div>
      <p className="inspector-notes-body">{notes || 'No notes added.'}</p>
    </section>
  )
}
