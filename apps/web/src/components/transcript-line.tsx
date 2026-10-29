export type LineKind = 'text' | 'heading' | 'code' | 'row'

const TEXT_CLASS: Record<LineKind, string> = {
  text: 'reading-m',
  row: 'reading-m',
  heading: 'display-s',
  code: 'mono block scrollbar-hidden overflow-x-auto rounded-md bg-paper-2 px-3.5 py-3 whitespace-pre',
}

export function TranscriptLine({
  id,
  time,
  kind = 'text',
  text,
  lit,
  onPlay,
}: {
  id: string
  time: string
  kind?: LineKind
  text: string
  lit: boolean
  onPlay?: () => void
}) {
  const lineClass = `grid w-full grid-cols-[52px_minmax(0,1fr)] gap-3 text-left ${
    kind === 'heading' ? 'pt-6 pb-2.5' : 'py-2.5'
  }`
  const content = (
    <>
      <span
        className={`mono text-xs ${kind === 'code' ? 'pt-3' : 'pt-[3px]'} transition-colors duration-200 ${lit ? 'text-source' : 'text-ink-3'}`}
      >
        {time}
      </span>
      <span
        className={`${TEXT_CLASS[kind]} transition-colors duration-200 ${lit || kind === 'heading' ? 'text-ink' : 'text-ink-2'}`}
      >
        <span className="highlight" data-lit={lit || undefined}>
          {text}
        </span>
      </span>
    </>
  )
  return (
    <li id={id}>
      {onPlay !== undefined ? (
        <button
          type="button"
          className={`${lineClass} cursor-pointer`}
          aria-current={lit || undefined}
          onClick={onPlay}
        >
          {content}
        </button>
      ) : (
        <div className={lineClass}>{content}</div>
      )}
    </li>
  )
}
