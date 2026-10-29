import type { FormEvent } from 'react'

export function withLink(path: string, link: string | string[] | undefined): string {
  return typeof link === 'string' ? `${path}?link=${encodeURIComponent(link)}` : path
}

export function submitWith(handler: (form: FormData) => Promise<void>) {
  return (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void handler(new FormData(event.currentTarget))
  }
}
