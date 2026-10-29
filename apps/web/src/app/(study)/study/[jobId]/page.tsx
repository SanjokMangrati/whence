import { notFound } from 'next/navigation'
import { StatePanel } from '@/components/state-panel'
import { StudySession } from '@/components/study-session'
import { serverApi } from '@/lib/api-server'

export default async function StudyPage({ params, searchParams }: PageProps<'/study/[jobId]'>) {
  const [{ jobId }, { questions: only }] = await Promise.all([params, searchParams])
  const api = await serverApi()

  const [response, statusResponse, reminders] = await Promise.all([
    api.study.jobs[':jobId'].questions.$get({ param: { jobId } }),
    api.generations[':id'].$get({ param: { id: jobId } }),
    api.study.reminders.$get().then((reminders) => reminders.json()),
  ])
  if (response.status === 404 || statusResponse.status === 404) notFound()
  const { items } = await response.json()
  const status = await statusResponse.json()

  if (items.length === 0) {
    return (
      <StatePanel
        heading="This source has no questions."
        action={{ href: `/generations/${jobId}`, label: 'Go to your notes' }}
      >
        Your notes for this source are ready to read.
      </StatePanel>
    )
  }

  const picked = typeof only === 'string' ? new Set(only.split(',')) : null
  const chosen = picked === null ? items : items.filter((item) => picked.has(item.id))

  return (
    <StudySession
      questions={chosen.length > 0 ? chosen : items}
      source={status.title ?? status.requestedUrl}
      exitHref={`/generations/${jobId}`}
      exitLabel="Go to your notes"
      remindersEnabled={reminders.enabled}
    />
  )
}
