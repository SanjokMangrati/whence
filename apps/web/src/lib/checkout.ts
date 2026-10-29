import { useState } from 'react'
import { track } from '@/lib/analytics'
import { api, readErrorCode } from '@/lib/api-client'
import { actionErrorCopy } from '@/lib/error-copy'

const LABEL = {
  idle: 'Upgrade to Pro',
  opening: 'Opening checkout',
}

export function useCheckout() {
  const [state, setState] = useState<keyof typeof LABEL | { failure: string }>('idle')

  async function checkout() {
    setState('opening')
    const response = await api.billing.checkout.$post().catch(() => null)
    if (response?.ok) {
      track('checkout_opened', {})
      window.location.assign((await response.json()).url)
    } else {
      setState({ failure: actionErrorCopy('checkout', await readErrorCode(response)) })
    }
  }

  return {
    checkout,
    opening: state === 'opening',
    failed: typeof state === 'object',
    label: typeof state === 'object' ? state.failure : LABEL[state],
  }
}
