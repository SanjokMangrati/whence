import type { GenerationRequest } from '../domain/ports'
import type { ConceptRole, SourceType, SpanKind } from '../domain/types'

export const PROMPT_VERSION = 'v22'

const SOURCE_TOKENS_PER_CONCEPT = 50
const MIN_CONCEPTS = 40
const MAX_CONCEPTS = 400

const MIN_QA_ITEMS = 20
const MAX_QA_ITEMS = 60
const QA_OUTPUT_TOKENS_PER_ITEM = 200

export const MAX_VERIFIER_CALLS = 8500

const CONCEPT_OUTPUT_TOKENS_PER_CONCEPT = 150
const MIN_CONCEPT_OUTPUT_TOKENS = 8000
const ARTIFACT_OUTPUT_TOKENS_PER_SOURCE_TOKEN = { notes: 2, cheat_sheet: 1 }
const MIN_ARTIFACT_OUTPUT_TOKENS = { notes: 16_000, cheat_sheet: 8_000 }
const MODEL_OUTPUT_TOKEN_LIMIT = 64_000
const CHARACTERS_PER_TOKEN = 4
const REWRITE_OUTPUT_TOKENS = 4000
const REWRITE_OUTPUT_TOKENS_PER_ITEM = 150
export const MAX_CLAIM_REWRITES = 400
const SENTENCE_OUTPUT_TOKENS_PER_INPUT_TOKEN = 1.5

const SOURCE_SYSTEM =
  'You work with a source that a student studies. You answer with JSON and nothing else.'

const CITATION_RULE =
  'Cite the span numbers each entry comes from. Use only numbers listed above. Never invent a number. Put span numbers only in "spans", never in the text.'

const HEADING_CASE_RULE =
  'Write each heading in sentence case: capitalize only the first word and proper names.'

const CODE_RULE =
  'Write code from the source between backticks, exactly as the source writes it: a name, a keyword, a type, an expression, or a line, such as `typeof`, `Array<string>`, or `const user: User = new UserAccount("Murphy", 1)`. When a step or a point is about a code example, quote the code it is about instead of describing the code in words. Never use backticks in a heading.'

const SKIP_RULE =
  "Leave out greetings, the source's agenda or list of what it will cover, remarks about the source itself, promotion of the publisher's or a sponsor's product, and calls to action."

const TABLE_RULE =
  'When the source compares 2 or more things on the same 2 or more attributes, write one "table" entry for that comparison. Each row is one thing, named in "label". "columns" lists only the attributes. It has no column for the row labels. Each row has one cell per attribute. A cell is a fragment of 6 words or fewer. Give null for a cell the source does not state.'

const ARTIFACT_INSTRUCTION: Record<'notes' | 'cheat_sheet', string[]> = {
  notes: [
    'Write study notes that let a student learn this source without reading or watching it.',
    "Cover every concept in the list. For each, also keep what the source says about it: the reason or mechanism, numbers, names, conditions, contrasts, and the source's own examples.",
    'State what the source says, not only that it discusses a topic. Write "Each retry waits twice as long as the one before", not "The source explains retry timing".',
    'These are notes, not a transcript. Write each fact once, in fewer words than the source. Leave out repetition, filler, asides, and sentences that only restate an earlier fact or lead into the next topic.',
    'The concepts are listed by topic, and each case follows the principle it shows. Write one section per topic, in the order listed. Its heading names the topic in 2 to 6 words. A topic with several names, such as "Call stack / Task queue", is one section, and its heading names what they share. Do not use a heading such as "Overview", "Introduction", "Key points", or "Part 2".',
    HEADING_CASE_RULE,
    "Write each idea once. Before you add a point, read the points already in its section. When one of them states the idea or implies it, put the new specific in that point's details, or leave it out.",
    'A point states one fact in one or two full sentences. When the point states a rule and the source gives the reason or mechanism for it, the point or one of its details states that reason. When the source gives no reason, do not add one.',
    'State each claim at the scope the source states it. A rule the source gives for one case is not a rule for a wider group of cases. A rule the source gives for a group is not a property of the one member it uses to show the rule. State the rule for the group, and put the member in a detail.',
    'Name things exactly. When the source refers to a thing in vague words, such as "another kind of index" or "this", name it with the words the source gives for it, such as "hash index" for "another kind of index" that hash tables introduce.',
    'When the source states a rule and later refines, qualifies, or corrects it, the point states the final rule. A detail states the earlier, simpler version and says that the source gives it first as an approximation. Never state the earlier version as fact.',
    'Put the specifics that teach a point in "details": values, examples, conditions, named cases, and the items of a list. Keep every such specific, however many the source gives. A detail that only says the point again in other words is not a specific.',
    'Never list 3 or more items in one point. Write the point as a short claim and put each item in its own detail. For example, write the point "A client retries a failed request with backoff." with the details "Each retry waits twice as long as the one before." and "The client stops after 5 retries.", not one point that states all three.',
    'A detail is one full sentence that is clear when read alone. It names its subject and the case it belongs to. A detail does not repeat its point.',
    'A concept with the role "example" is a detail of the point that states its principle. The detail starts with "For example," and says what happens in the case. Write each example of a principle in its own detail.',
    'A concept with the role "analogy" is a detail of the point that states its principle. Write it as a comparison: "X is like Y: A corresponds to B." Name what corresponds to what. Never state a property of Y as a property of X.',
    'The source can set up one scenario and return to it in several places. State that scenario, with its concrete parts, in a detail where it first appears. When a later detail uses the same scenario, name it the way the source does, and cite the spans that set it up as well as its own spans. Name only a scenario that this source sets up. Never refer to a thing the notes have not introduced.',
    'Each concept with the role "worked_example" becomes one "steps" entry. When it shows a principle, put it right after the point that states that principle. When no principle is listed above it, write a point right before the steps: the point states what the source concludes from the walkthrough, or names the scenario the steps trace when the source concludes nothing. The first step states the scenario with its concrete values. When the scenario builds on an earlier one, the first step names the earlier one and says what changes. Each next step states what happens, in source order, with its values. The last step states the outcome.',
    'A step never states the principle, because the point before the steps states it. When a walkthrough has more than 8 steps, join the steps of one phase into one step and keep their values.',
    'When the source gives stages or steps in order, write one "steps" entry with every step, in source order. Use it only for 2 or more steps.',
    TABLE_RULE,
    'When the things differ on only 1 attribute, write one entry per thing instead of a table. Do not use a table for anything else.',
    'Answer with this JSON shape. Leave out "details" when a point has none:',
    '{"sections":[{"heading":"...","entries":[{"text":"...","spans":[0],"details":[{"text":"...","spans":[4]}]},{"steps":[{"text":"...","spans":[1]},{"text":"...","spans":[2]}]},{"table":{"columns":["attribute 1","attribute 2"],"rows":[{"label":"thing 1","cells":[{"text":"...","spans":[3]},null]}]}}]}]}',
  ],
  cheat_sheet: [
    'Write a cheat sheet that a student keeps open while working, to look up a fact fast. It is a reference, not a summary of the notes.',
    'The concepts are listed by topic. Group the entries by those topics, in the order listed. A topic with several names, such as "Call stack / Task queue", is one group. Use 2 to 6 words per heading.',
    HEADING_CASE_RULE,
    'Each entry answers a question a student looks up while working: which thing to use in a case, what a value is, what happens in what order, or what a term maps to. Leave out an entry that only restates a definition or says that a topic exists or matters.',
    'A plain entry has the form "Term: fact". The fact is a fragment of 12 words or fewer. It starts with a capital letter, unless it starts with code.',
    'Every fact states a specific the source gives: a number, a range, a name, a rule, a condition, a command, or a mapping.',
    'Cover every concept in the list that has such a specific.',
    'Write an entry for an example, a worked example, or an analogy only when it gives a value or a result that a student looks up. Never state an analogy as a fact.',
    'One fact per entry. Two entries never state the same fact.',
    'When the source gives a procedure or an order of events, write one "steps" entry with every step, in order. Use it only for 2 or more steps.',
    'An entry can state a contrast or a common mistake only when the source itself states it. Do not invent one.',
    TABLE_RULE,
    'When the source gives 3 or more things that each have a value for the same 1 attribute, such as a case and its result, write one "table" entry with that attribute as its only column.',
    'Do not use a table for anything else.',
    'Answer with this JSON shape:',
    '{"sections":[{"heading":"...","entries":[{"text":"Term: fact","spans":[0,1]},{"steps":[{"text":"...","spans":[1]},{"text":"...","spans":[2]}]},{"table":{"columns":["attribute 1","attribute 2"],"rows":[{"label":"thing 1","cells":[{"text":"...","spans":[2]},null]}]}}]}]}',
  ],
}

export interface ConceptView {
  statement: string
  role: ConceptRole
  topic: string
  followsPrinciple: boolean
  ordinals: number[]
}

export interface SourceDocument {
  title: string | null
  sourceType: SourceType
  spanLines: string
}

export function renderSpanLines(
  spans: { ordinal: number; kind: SpanKind; text: string }[],
): string {
  return spans
    .map((span) => {
      switch (span.kind) {
        case 'text':
        case 'row':
          return `[${span.ordinal}] ${span.text}`
        case 'heading':
          return `[${span.ordinal}] (heading) ${span.text}`
        case 'code':
          return `[${span.ordinal}] (code)\n\`\`\`\n${span.text}\n\`\`\``
      }
    })
    .join('\n')
}

export function sentenceRequest(title: string | null, transcript: string): GenerationRequest {
  return {
    system:
      'You add punctuation to speech transcripts. You answer with the transcript text and nothing else.',
    prompt: [
      `The text below is part of an automatic caption transcript of a spoken video${title === null ? '' : ` titled "${title}"`}. It has no punctuation.`,
      '',
      '<transcript>',
      transcript,
      '</transcript>',
      '',
      'Add punctuation and capital letters. End every sentence with a full stop, a question mark, or an exclamation mark.',
      'Break a sentence of more than 40 words into shorter sentences.',
      'Keep every word exactly as it is and in the same order. This includes words that look wrong, repeated words, and filler words such as "um". Do not add, remove, or correct a word. Do not write a number as digits or digits as a word.',
      'Answer with the punctuated text only, with no tags.',
    ].join('\n'),
    maxOutputTokens: Math.ceil(
      (transcript.length / CHARACTERS_PER_TOKEN) * SENTENCE_OUTPUT_TOKENS_PER_INPUT_TOKEN,
    ),
  }
}

export function conceptLimit(document: SourceDocument): number {
  return Math.min(
    MAX_CONCEPTS,
    Math.max(
      MIN_CONCEPTS,
      Math.ceil(document.spanLines.length / CHARACTERS_PER_TOKEN / SOURCE_TOKENS_PER_CONCEPT),
    ),
  )
}

export function conceptRequest(document: SourceDocument): GenerationRequest {
  const limit = conceptLimit(document)
  return {
    system: SOURCE_SYSTEM,
    sharedPrefix: renderDocument(document),
    prompt: [
      'Extract the concepts a student must learn from the source.',
      'List the concepts in the order they appear. The first concept is number 0, the next is number 1, and so on.',
      'A concept is one idea, stated in one sentence. The sentence names its subject. Write "A retry waits twice as long as the one before", not "It waits longer each time".',
      'Name things exactly. When the source refers to a thing in vague words, such as "another kind of index" or "this", name it with the words the source gives for it, such as "hash index" for "another kind of index" that hash tables introduce.',
      'Each concept is a different idea. The source can state an idea more than once, for example in an introduction and again in a summary. List that idea once, and cite the spans where the source explains it.',
      'Do not list a concept that only states part of another concept or follows from it. For example, do not list "Caches store data" next to "A cache stores copies of data close to where they are used".',
      "Skip greetings, channel promotion, the source's agenda or list of what it will cover, and remarks about the source itself or how easy the topic is.",
      "Skip promotion of the publisher's or a sponsor's product or service, customer stories told to sell it, and calls to action such as sign up, try it, or contact us.",
      'When the source gives the stages or steps of a process in order, also list one concept that names every stage in that order, and cite the spans that name each stage.',
      'When the source states a rule and later refines, qualifies, or corrects it, list one concept that states the final version. Cite the spans of the first statement and of the refinement.',
      'Give each concept one role:',
      '- "principle": a rule, mechanism, cause, contrast, or definition that the source teaches as generally true. When the source states the rule for a group and shows it with one member, the principle names the group and the member is an example. When the source states the rule only for one member, the principle names that member.',
      '- "worked_example": a scenario the source traces step by step, such as a demo, a walkthrough, a code example that the source runs, or a quiz that the source answers. The statement names the scenario and its outcome. Cite the spans from its setup to its outcome, including the code or values it uses.',
      '- "example": a case the source uses only to show a principle. The statement says what happens in the case.',
      '- "analogy": a comparison of the subject to a familiar thing, used to explain a principle. The statement names both things and says what corresponds to what, for example "The source compares a cache to a desk drawer: the drawer holds the few things in use." Never state a property of the familiar thing as a property of the subject.',
      '- "aside": a remark the source does not teach, such as a joke, a story about the speaker, or a detail the source says is arbitrary.',
      'A worked_example, an example, or an analogy has "shows": the numbers of the principles it shows. A principle can come before or after its case, so a number in "shows" can be larger than the number of the case. Leave "shows" empty only when the source states no rule that the case shows.',
      'When the source draws a rule from a case, such as "so every retry must be safe to repeat", list that rule as a principle, also when the source states it only after the case.',
      'When the source builds one example in stages, or returns to an example to extend it, list one worked_example that cites every stage. When a later example changes an earlier one, its statement names the earlier example and what changes.',
      'Give each concept a "topic" of 2 to 6 words that names the part of the source it belongs to. All concepts of one topic use the exact same topic text, also when the source returns to the topic later or recaps it. A case has the topic of the principle it shows.',
      'A topic has 2 or more concepts. Join a topic of 1 concept to the closest related topic. Do not use a topic such as "Overview", "Introduction", "Key points", or "Summary".',
      'Cite the spans that state the idea. Do not cite spans that only name the topic.',
      'A statement says only what its cited spans say. Do not add the topic of the source as the subject when the cited spans do not name it.',
      CITATION_RULE,
      'Answer with this JSON shape:',
      '{"concepts":[{"statement":"...","role":"principle","topic":"...","spans":[0,1]},{"statement":"...","role":"example","topic":"...","shows":[0],"spans":[2]},{"statement":"...","role":"worked_example","topic":"...","shows":[3],"spans":[3,4,5]},{"statement":"...","role":"principle","topic":"...","spans":[6]}]}',
    ].join('\n'),
    maxOutputTokens: Math.max(MIN_CONCEPT_OUTPUT_TOKENS, limit * CONCEPT_OUTPUT_TOKENS_PER_CONCEPT),
  }
}

export interface ConceptToRewrite {
  statement: string
  evidence: string[]
}

export function conceptRewriteRequest(concepts: ConceptToRewrite[]): GenerationRequest {
  const entries = concepts.map(
    (concept, id) =>
      `[${id}] Statement: ${concept.statement}\nText: ${concept.evidence.join(' ... ')}`,
  )
  return {
    system:
      'You correct concept statements so that they say only what the source text says. You answer with JSON and nothing else.',
    prompt: [
      'Each entry below is a concept statement and the source text it cites.',
      '',
      '<concepts>',
      entries.join('\n\n'),
      '</concepts>',
      '',
      'Part of each statement does not follow from its text.',
      'Rewrite each statement so that every part follows from its text. Keep the same idea.',
      'Remove a detail the text does not give. Keep a condition the text gives, such as a version or a time.',
      'Remove a subject or topic the text does not name. For example, "X reduces model size in open source LLMs" becomes "X reduces model size" when the text does not name open source LLMs.',
      'If the text does not state the idea, give null as the statement.',
      'Answer with this JSON shape:',
      '{"concepts":[{"id":0,"statement":"..."}]}',
    ].join('\n'),
    maxOutputTokens: Math.max(
      REWRITE_OUTPUT_TOKENS,
      concepts.length * REWRITE_OUTPUT_TOKENS_PER_ITEM,
    ),
  }
}

export interface StepToRewrite {
  statement: string
  context: string | undefined
  evidence: string[]
}

export function stepRewriteRequest(steps: StepToRewrite[]): GenerationRequest {
  const entries = steps.map((step, id) =>
    [
      `[${id}]`,
      ...(step.context === undefined ? [] : [`Walkthrough: ${step.context}`]),
      `Step: ${step.statement}`,
      `Text: ${step.evidence.join(' ... ')}`,
    ].join('\n'),
  )
  return {
    system:
      'You correct the steps of worked examples so that they say only what the source text says. You answer with JSON and nothing else.',
    prompt: [
      'Each entry below is one step of a worked example, the walkthrough it belongs to, and the source text the step cites.',
      '',
      '<steps>',
      entries.join('\n\n'),
      '</steps>',
      '',
      'Part of each step does not follow from its text.',
      'Rewrite each step so that every part follows from its text. The step still states what happens at its place in the walkthrough.',
      'Remove a value, a name, or a detail the text does not give. Keep each value the text gives.',
      'Do not state the principle that the walkthrough shows. Do not add a step.',
      'Never repeat what the first step or the previous step says. Name each thing once: when the text names one thing twice, it is one thing.',
      'If the text does not state what happens at this step, give null as the statement.',
      'Answer with this JSON shape:',
      '{"steps":[{"id":0,"statement":"..."}]}',
    ].join('\n'),
    maxOutputTokens: REWRITE_OUTPUT_TOKENS,
  }
}

export type ClaimForm = 'point' | 'detail' | 'entry' | 'answer'

export interface ClaimToRewrite {
  form: ClaimForm
  statement: string
  context: string | undefined
  evidence: string[]
}

const CLAIM_FORM_NAME: Record<ClaimForm, string> = {
  point: 'notes point, one or two full sentences that name their subject',
  detail: 'notes detail, one full sentence that is clear when read alone',
  entry: 'cheat sheet entry, "Term: fact" with a fact of 12 words or fewer',
  answer: 'answer to the question, one or two sentences of at most 25 words',
}

export function claimRewriteRequest(claims: ClaimToRewrite[]): GenerationRequest {
  const entries = claims.map((claim, id) =>
    [
      `[${id}] Kind: ${CLAIM_FORM_NAME[claim.form]}`,
      ...(claim.context === undefined ? [] : [`Context: ${claim.context}`]),
      `Statement: ${claim.statement}`,
      `Text: ${claim.evidence.join(' ... ')}`,
    ].join('\n'),
  )
  return {
    system:
      'You correct statements in study material so that they say only what the source text says. You answer with JSON and nothing else.',
    prompt: [
      'Each entry below is one statement from study material, its kind, its context, and the source text it cites.',
      '',
      '<statements>',
      entries.join('\n\n'),
      '</statements>',
      '',
      'Part of each statement does not follow from its text.',
      'Rewrite each statement so that every part follows from its text. Keep the same idea, its subject, and the form of its kind.',
      'Remove a value, a name, a reason, or a detail the text does not give. When the text gives a different value, use the value the text gives.',
      'An answer still answers its question. It never contains a reason the text does not give.',
      'If the text does not state the idea, give null as the statement.',
      'Answer with this JSON shape:',
      '{"statements":[{"id":0,"statement":"..."}]}',
    ].join('\n'),
    maxOutputTokens: Math.max(
      REWRITE_OUTPUT_TOKENS,
      claims.length * REWRITE_OUTPUT_TOKENS_PER_ITEM,
    ),
  }
}

export function artifactRequest(
  artifactType: 'notes' | 'cheat_sheet',
  document: SourceDocument,
  concepts: ConceptView[],
): GenerationRequest {
  return {
    system: SOURCE_SYSTEM,
    sharedPrefix: renderDocument(document),
    prompt: [
      'Write study material from the source.',
      'The source teaches these concepts. Each has a role and the spans that support it. A case that shows a principle is indented under that principle:',
      '',
      ...renderConcepts(concepts),
      '',
      'Use only what the source states. Add nothing it does not state.',
      SKIP_RULE,
      CITATION_RULE,
      ...(document.sourceType === 'article' ? [CODE_RULE] : []),
      ...ARTIFACT_INSTRUCTION[artifactType],
    ].join('\n'),
    maxOutputTokens: Math.min(
      MODEL_OUTPUT_TOKEN_LIMIT,
      Math.max(
        MIN_ARTIFACT_OUTPUT_TOKENS[artifactType],
        Math.ceil(
          (document.spanLines.length / CHARACTERS_PER_TOKEN) *
            ARTIFACT_OUTPUT_TOKENS_PER_SOURCE_TOKEN[artifactType],
        ),
      ),
    ),
  }
}

export function qaLimit(concepts: ConceptView[]): number {
  const taught = concepts.filter(
    (concept) => concept.role === 'principle' || concept.role === 'worked_example',
  ).length
  return Math.min(MAX_QA_ITEMS, Math.max(MIN_QA_ITEMS, taught))
}

export function qaRequest(document: SourceDocument, concepts: ConceptView[]): GenerationRequest {
  const limit = qaLimit(concepts)
  return {
    system: SOURCE_SYSTEM,
    sharedPrefix: renderDocument(document),
    prompt: [
      'Write active-recall questions that help a student remember what the source teaches.',
      'The source teaches these concepts, principles first. Each has a role and the spans that support it:',
      '',
      ...renderConcepts(concepts),
      '',
      `Write at most ${limit} question and answer pairs.`,
      'Each question has one correct answer that a student who learned the source would give. The question names its subject, the case, and the form of the answer, such as which, in what order, or why. Do not ask a question that many different answers fit.',
      'Give every principle a question when the limit allows. Give the principles the source spends most time on 2 or 3 questions, each from a different angle. When the limit is too small, cover those principles first.',
      'Prefer questions that ask why, what happens next, in what order, or how two things differ. Ask a definition question only for a term that other questions depend on.',
      'Each worked example gets at least one question that states its scenario with its values and asks what happens and why. The answer states the outcome and the rule that causes it.',
      'Ask about the principle, not the example or the analogy. When a property holds for a whole group, the question names the group, not the one member the source used to show it. Do not ask about a detail of an example that the source says any other choice would also fit.',
      'When the source states a rule and later refines, qualifies, or corrects it, the question and answer use the final version. Cite the spans of both statements.',
      'Do not ask for a list of 3 or more items. For a list the source treats as important, ask about one member or one contrast in each question.',
      'No two questions ask for the same answer.',
      'A question never contains its own answer. Do not ask a yes or no question.',
      'An answer is one or two sentences of at most 25 words. Do not repeat a concept statement word for word.',
      'Use only what the source states. Add nothing it does not state.',
      CITATION_RULE,
      ...(document.sourceType === 'article' ? [CODE_RULE] : []),
      'The example below comes from a different source. It shows the form only. Never use its words or its topic.',
      '<example>',
      'Source: "Any cache works here; I will use Redis. When an entry\'s time to live passes, the cache deletes it."',
      'Bad: "Which cache does the source use?" The source says any cache works, so the answer is an arbitrary detail.',
      'Bad: "What happens to a Redis entry when its time to live passes?" The rule holds for every cache, not only Redis.',
      'Bad: "What should you know about cache expiry?" Many answers fit.',
      'Good: "What happens to a cache entry when its time to live passes?" Answer: "The cache deletes the entry."',
      '</example>',
      'Answer with this JSON shape:',
      '{"items":[{"question":"...","answer":"...","spans":[0]}]}',
    ].join('\n'),
    maxOutputTokens: limit * QA_OUTPUT_TOKENS_PER_ITEM,
  }
}

const SOURCE_TYPE_NAME: Record<SourceType, string> = {
  video: 'video transcript',
  article: 'article',
}

const DOCUMENT_INTRO: Record<SourceType, string> = {
  video: 'The document below is the source. Each line of its content is one numbered span.',
  article:
    'The document below is the source. Each numbered span is a paragraph, a list item, a table row, a heading, or a code block. A heading span is marked "(heading)". It only names a part of the source, so never cite it. A code block span is marked "(code)" and holds the lines between its ``` fences.',
}

function renderDocument(document: SourceDocument): string {
  return [
    DOCUMENT_INTRO[document.sourceType],
    '',
    '<document>',
    ...(document.title === null ? [] : [`<title>${document.title}</title>`]),
    `<source_type>${SOURCE_TYPE_NAME[document.sourceType]}</source_type>`,
    '<document_content>',
    document.spanLines,
    '</document_content>',
    '</document>',
  ].join('\n')
}

function renderConcepts(concepts: ConceptView[]): string[] {
  return [
    '<concepts>',
    ...concepts.map((concept) =>
      concept.followsPrinciple
        ? `  [${concept.role} of the principle above; spans ${concept.ordinals.join(',')}] ${concept.statement}`
        : `[${concept.role}; topic: ${concept.topic}; spans ${concept.ordinals.join(',')}] ${concept.statement}`,
    ),
    '</concepts>',
  ]
}
