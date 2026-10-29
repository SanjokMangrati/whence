export interface LegalSection {
  heading: string
  paragraphs?: string[]
  list?: string[]
}

export function LegalPage({
  title,
  lede,
  updated,
  sections,
}: {
  title: string
  lede: string
  updated: string
  sections: LegalSection[]
}) {
  const number = (index: number) => String(index + 1).padStart(2, '0')
  return (
    <main className="mx-auto w-full max-w-page px-4 pt-16 pb-36 sm:px-8 sm:pt-24">
      <article className="mx-auto grid max-w-[720px] gap-10">
        <div className="grid gap-4">
          <p className="mono-label text-ink-3">Last updated {updated}</p>
          <h1 className="display-l sm:display-xl">{title}</h1>
          <p className="reading-l text-ink-2">{lede}</p>
        </div>
        <p className="ui-m rounded-md bg-paper-2 px-[18px] py-4 text-ink-2">
          Placeholder text. It is not reviewed legal text. Replace it before launch. Lines in
          brackets need a decision.
        </p>
        <nav aria-labelledby="on-this-page" className="grid gap-3">
          <p id="on-this-page" className="mono-label text-ink-3">
            On this page
          </p>
          <ol className="grid gap-x-8 gap-y-2 sm:grid-flow-col sm:grid-rows-3">
            {sections.map((section, index) => (
              <li key={section.heading} className="ui-m grid grid-cols-[28px_minmax(0,1fr)]">
                <span className="mono text-ink-4">{number(index)}</span>
                <a
                  href={`#part-${index + 1}`}
                  className="justify-self-start decoration-1 underline-offset-4 hover:underline"
                >
                  {section.heading}
                </a>
              </li>
            ))}
          </ol>
        </nav>
        {sections.map((section, index) => (
          <section
            key={section.heading}
            id={`part-${index + 1}`}
            className="grid scroll-mt-20 gap-3.5 border-t border-line pt-8"
          >
            <h2 className="display-s grid grid-cols-[40px_minmax(0,1fr)] items-baseline">
              <span className="mono text-ink-3">{number(index)}</span>
              <span>{section.heading}</span>
            </h2>
            <div className="grid gap-2.5 pl-10">
              {section.paragraphs?.map((paragraph) => (
                <p key={paragraph} className="reading-m">
                  {paragraph}
                </p>
              ))}
              {section.list !== undefined && (
                <ul className="grid gap-2.5">
                  {section.list.map((item) => (
                    <li
                      key={item}
                      className="reading-m grid grid-cols-[20px_minmax(0,1fr)] text-ink-2"
                    >
                      <span aria-hidden="true" className="text-ink-4">
                        –
                      </span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        ))}
      </article>
    </main>
  )
}
