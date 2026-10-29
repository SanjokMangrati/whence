import Image from 'next/image'
import Link from 'next/link'

export function Wordmark() {
  return (
    <Link href="/" className="shrink-0 justify-self-start">
      <Image src="/whence-lockup.svg" alt="Whence" width={124} height={18} priority />
    </Link>
  )
}
