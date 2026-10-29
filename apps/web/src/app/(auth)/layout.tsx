import { Wordmark } from '@/components/wordmark'

export default function AuthLayout({ children }: LayoutProps<'/'>) {
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-12">
      <div className="grid w-full max-w-[400px] animate-rise gap-8">
        <div className="justify-self-center">
          <Wordmark />
        </div>
        <section className="grid gap-6 rounded-md border border-line bg-card p-6 sm:p-8">
          {children}
        </section>
      </div>
    </main>
  )
}
