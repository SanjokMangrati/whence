import { getSessionCookie } from 'better-auth/cookies'
import { NextResponse, type NextRequest } from 'next/server'
import { EMAIL_ACCOUNTS, EMAIL_ONLY_PATHS } from '@/lib/accounts'

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  if (EMAIL_ONLY_PATHS.includes(pathname)) {
    if (EMAIL_ACCOUNTS) return NextResponse.next()
    const login = new URL('/login', request.url)
    const link = request.nextUrl.searchParams.get('link')
    if (link !== null) login.searchParams.set('link', link)
    return NextResponse.redirect(login, 307)
  }
  if (pathname === '/home') {
    return NextResponse.redirect(new URL('/', request.url), 308)
  }
  if (getSessionCookie(request) !== null) return NextResponse.next()
  return NextResponse.rewrite(new URL('/home', request.url))
}

export const config = {
  matcher: ['/', '/home', '/signup', '/forgot-password', '/reset-password', '/verify-email'],
}
