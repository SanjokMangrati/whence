'use client'

import { useRouter } from 'next/navigation'
import type { ReactNode } from 'react'
import { forgetUser } from '@/lib/analytics'
import { authClient } from '@/lib/auth-client'

export function LogOutButton({
  className = 'btn btn-secondary btn-sm text-missed hover:bg-missed-wash',
  children = 'Log out',
}: {
  className?: string
  children?: ReactNode
}) {
  const router = useRouter()

  async function logOut() {
    await authClient.signOut()
    forgetUser()
    router.push('/login')
    router.refresh()
  }

  return (
    <button type="button" onClick={logOut} className={className}>
      {children}
    </button>
  )
}
