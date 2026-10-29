import { StatePanel } from '@/components/state-panel'

export default function NotFound() {
  return (
    <StatePanel heading="This page does not exist." action={{ href: '/', label: 'Go to Home' }}>
      The link may be old, or the source was deleted.
    </StatePanel>
  )
}
