import { getSessionCookie } from 'better-auth/cookies'
import { NextResponse, type NextRequest } from 'next/server'

export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname === '/home') {
    return NextResponse.redirect(new URL('/', request.url), 308)
  }
  if (getSessionCookie(request) !== null) return NextResponse.next()
  return NextResponse.rewrite(new URL('/home', request.url))
}

export const config = {
  matcher: ['/', '/home'],
}
