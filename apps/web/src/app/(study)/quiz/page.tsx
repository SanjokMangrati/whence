import { StatePanel } from '@/components/state-panel'
import { StudySession } from '@/components/study-session'
import { serverApi } from '@/lib/api-server'

export default async function QuizPage() {
  const api = await serverApi()
  const [{ items }, reminders] = await Promise.all([
    api.study.due.$get().then((response) => response.json()),
    api.study.reminders.$get().then((response) => response.json()),
  ])

  if (items.length === 0) {
    return (
      <StatePanel heading="No questions due today." action={{ href: '/', label: 'Go to Home' }}>
        Questions come back here before you forget them. Try the questions on a source to start.
      </StatePanel>
    )
  }

  return (
    <StudySession
      questions={items}
      source={null}
      exitHref="/"
      exitLabel="Go to Home"
      remindersEnabled={reminders.enabled}
    />
  )
}
