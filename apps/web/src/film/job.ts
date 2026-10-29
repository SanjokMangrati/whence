import { toPassages } from '@/lib/passages'
import data from './specimen.json'
import { readSpecimen } from '@/app/(site)/specimen'

export const job = readSpecimen(data)

export const LINK = job.specimen.source.url.replace(/^https:\/\/www\./, '')

export const noteEntries = job.notes.blocks.flatMap((block) =>
  block.kind === 'entry' ? [block] : [],
)
export const sheetEntries = job.sheet.blocks.flatMap((block) =>
  block.kind === 'entry' ? [block] : [],
)

export const openedPassage = toPassages(noteEntries[0]!.line.citations).at(-1)!

export const QUESTION_COUNT = 1 + data.moreQuestions.length
