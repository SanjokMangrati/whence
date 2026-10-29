import { inlineCode, type TextSegment } from 'notes-format'
import { Fragment, type ReactNode } from 'react'

function Segments({ segments }: { segments: TextSegment[] }) {
  return segments.map((segment, index) => (
    <Fragment key={index}>
      {segment.code ? <code className="code-inline">{segment.text}</code> : segment.text}
    </Fragment>
  ))
}

export function InlineText({ text }: { text: string }) {
  return <Segments segments={inlineCode(text)} />
}

export function MarkedText({ text, children }: { text: string; children: ReactNode }) {
  const segments = inlineCode(text)
  let at = segments.length - 1
  let space = -1
  while (at >= 0 && space === -1) {
    if (!segments[at]!.code) space = segments[at]!.text.lastIndexOf(' ')
    if (space === -1) at -= 1
  }
  const head =
    at < 0
      ? []
      : [
          ...segments.slice(0, at),
          { ...segments[at]!, text: segments[at]!.text.slice(0, space + 1) },
        ]
  const tail =
    at < 0
      ? segments
      : [{ ...segments[at]!, text: segments[at]!.text.slice(space + 1) }, ...segments.slice(at + 1)]
  return (
    <>
      <Segments segments={head.filter((segment) => segment.text !== '')} />
      <span className="whitespace-nowrap">
        <Segments segments={tail.filter((segment) => segment.text !== '')} />
        {children}
      </span>
    </>
  )
}

export function NoteDetails({ details }: { details: ReactNode[] }) {
  if (details.length === 0) return null
  return (
    <ul className="grid gap-2.5">
      {details.map((detail, index) => (
        <li key={index} className="grid grid-cols-[20px_minmax(0,1fr)] items-start">
          <span aria-hidden="true" className="reading-m text-base text-ink-4">
            –
          </span>
          <span className="reading-m max-w-measure text-base leading-[1.55] text-ink-2">
            {detail}
          </span>
        </li>
      ))}
    </ul>
  )
}

export function FactEntry({
  term,
  fact,
  details,
  index,
}: {
  term: string | null
  fact: ReactNode
  details: ReactNode[]
  index: number
}) {
  return (
    <li
      className="grid animate-rise items-baseline gap-x-6 gap-y-1.5 border-t border-line py-[18px] sm:grid-cols-[176px_minmax(0,1fr)]"
      style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
    >
      {term !== null && (
        <span className="ui-m font-medium">
          <InlineText text={term} />
        </span>
      )}
      <div className={`ui-m grid gap-2 text-ink-2 ${term === null ? 'sm:col-span-2' : ''}`}>
        <span>{fact}</span>
        <NoteDetails details={details} />
      </div>
    </li>
  )
}

export function ShowFact({ term, onShow }: { term: string | null; onShow: () => void }) {
  return (
    <button
      type="button"
      className="ui-m cursor-pointer rounded-sm border border-dashed border-line-strong bg-paper-2 px-2.5 font-medium text-ink-3 transition-colors duration-120 hover:text-ink"
      aria-label={term === null ? 'Show this fact' : `Show the fact for ${term}`}
      onClick={onShow}
    >
      Show
    </button>
  )
}

function stepNumber(index: number) {
  return String(index + 1).padStart(2, '0')
}

export function NoteSteps({ steps }: { steps: ReactNode[] }) {
  return (
    <ol className="grid gap-2 rounded-sm bg-paper-2 px-3.5 py-3">
      {steps.map((step, index) => (
        <li key={index} className="grid grid-cols-[28px_minmax(0,1fr)] items-baseline">
          <span className="mono text-ink-3">{stepNumber(index)}</span>
          <span className="reading-m max-w-measure text-base leading-[1.55] text-ink-2">
            {step}
          </span>
        </li>
      ))}
    </ol>
  )
}

export function SheetSteps({ steps, apart }: { steps: ReactNode[]; apart: boolean }) {
  return (
    <ol className={apart ? 'mt-8' : undefined}>
      {steps.map((step, index) => (
        <li
          key={index}
          className="grid grid-cols-[32px_minmax(0,1fr)] items-baseline gap-x-6 border-t border-line py-[18px] sm:grid-cols-[176px_minmax(0,1fr)]"
        >
          <span className="mono text-ink-3">{stepNumber(index)}</span>
          <span className="ui-m text-ink-2">{step}</span>
        </li>
      ))}
    </ol>
  )
}

export function NoteEntry({
  point,
  details,
  steps,
  index,
}: {
  point: ReactNode
  details: ReactNode[]
  steps: ReactNode[]
  index: number
}) {
  return (
    <li
      className="grid animate-rise gap-3.5 border-t border-line py-5"
      style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
    >
      <p className="reading-m max-w-measure">{point}</p>
      <NoteDetails details={details} />
      {steps.length > 0 && (
        <div className="ml-5">
          <NoteSteps steps={steps} />
        </div>
      )}
    </li>
  )
}
