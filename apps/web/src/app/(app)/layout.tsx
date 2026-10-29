import { AccountMenu } from '@/components/account-menu'
import { AppNav } from '@/components/app-nav'
import { Wordmark } from '@/components/wordmark'
import { currentUser, dueQuestions } from '@/lib/api-server'

export default async function AppLayout({ children }: LayoutProps<'/'>) {
  const [me, due] = await Promise.all([currentUser(), dueQuestions()])

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 border-b border-line bg-paper-grain">
        <div className="mx-auto flex h-[60px] w-full max-w-page items-center gap-4 px-4 sm:gap-7 sm:px-8">
          <Wordmark />
          <AppNav due={due.items.length} />
          <div className="ml-auto">
            <AccountMenu
              email={me.email}
              plan={me.plan}
              used={me.sourcesUsed}
              limit={me.sourcesPerPeriod}
            />
          </div>
        </div>
      </header>
      <div className="flex flex-1 animate-rise flex-col">{children}</div>
    </div>
  )
}
