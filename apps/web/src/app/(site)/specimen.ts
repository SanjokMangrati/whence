import { parseNotes, timestamp } from 'notes-format'
import data from './specimen.json'

type Specimen = typeof data
type Citation = Specimen['notes']['citations'][number]

function onlySection(artifact: { markdown: string; citations: Citation[] }) {
  const byOrdinal = new Map(artifact.citations.map((citation) => [citation.ordinal, citation]))
  const [section] = parseNotes(artifact.markdown, (ordinal) => {
    const citation = byOrdinal.get(ordinal)
    if (citation === undefined) {
      throw new Error(`The specimen has marker ${ordinal + 1} with no citation.`)
    }
    return citation
  })
  return section!
}

export function readSpecimen(specimen: Specimen) {
  return {
    specimen,
    notes: onlySection(specimen.notes),
    sheet: onlySection(specimen.cheatSheet),
    title: specimen.source.title.split(' | ')[0]!,
    length: timestamp(specimen.source.lengthMs),
    reviewDates(today: number): Date[] {
      return specimen.reviewOffsetsDays.map((days) => {
        const date = new Date(today)
        date.setDate(date.getDate() + days)
        return date
      })
    },
  }
}

const landing = readSpecimen(data)
export const specimen = landing.specimen
export const specimenNotes = landing.notes
export const specimenSheet = landing.sheet
export const specimenTitle = landing.title
export const specimenLength = landing.length
export const reviewDates = landing.reviewDates
export const specimenCredit = 'Martin Kleppmann'
export const specimenLicense = {
  name: 'CC BY',
  url: 'https://creativecommons.org/licenses/by/4.0/',
}

const entries = specimenNotes.blocks.flatMap((block) => (block.kind === 'entry' ? [block] : []))
export const stripNotes = [entries[1]!, entries[4]!]
export const readerNotes = [entries[0]!, entries[2]!, entries[5]!]
