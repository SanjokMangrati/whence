'use client'

import { useEffect } from 'react'
import { StatePanel } from '@/components/state-panel'
import { reportError } from '@/lib/analytics'
import { PAGE_FAILED } from '@/lib/error-copy'

export default function PageError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => reportError(error), [error])

  return (
    <StatePanel heading={PAGE_FAILED.heading} action={{ href: '/', label: 'Go to Home' }}>
      {PAGE_FAILED.body}
    </StatePanel>
  )
}
