import { notFound } from 'next/navigation'
import { Processing } from '@/components/processing'
import { Reader } from '@/components/reader'
import { currentUser, serverApi } from '@/lib/api-server'

const TAB_ORDER = ['notes', 'cheat_sheet']

export default async function GenerationPage({ params }: PageProps<'/generations/[id]'>) {
  const { id } = await params
  const api = await serverApi()

  const response = await api.generations[':id'].$get({ param: { id } })
  if (response.status === 404) notFound()
  const status = await response.json()

  if (status.status !== 'completed') {
    return <Processing initial={status} plan={(await currentUser()).plan} />
  }

  const [artifacts, sourceResponse, questionsResponse, me, { items: collections }] =
    await Promise.all([
      Promise.all(
        status.artifacts.map(async ({ id: artifactId }) => {
          const artifact = await api.artifacts[':id'].$get({ param: { id: artifactId } })
          if (artifact.status === 404) notFound()
          return artifact.json()
        }),
      ),
      api.generations[':id'].source.$get({ param: { id } }),
      api.study.jobs[':jobId'].questions.$get({ param: { jobId: id } }),
      currentUser(),
      api.collections.$get().then((collectionsResponse) => collectionsResponse.json()),
    ])
  if (sourceResponse.status === 404 || questionsResponse.status === 404) notFound()
  const { items: questions } = await questionsResponse.json()

  const ordered = artifacts.toSorted(
    (left, right) => TAB_ORDER.indexOf(left.artifactType) - TAB_ORDER.indexOf(right.artifactType),
  )
  return (
    <Reader
      jobId={id}
      artifacts={ordered}
      source={await sourceResponse.json()}
      questions={questions}
      plan={me.plan}
      collections={collections}
    />
  )
}
