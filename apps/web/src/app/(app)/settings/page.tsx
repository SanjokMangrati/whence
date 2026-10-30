import { LogOutButton } from '@/components/log-out-button'
import { PreferenceSwitch } from '@/components/preference-switch'
import { ProviderKeyPanel } from '@/components/provider-key-panel'
import { ReminderSwitch } from '@/components/reminder-switch'
import { currentUser, serverApi } from '@/lib/api-server'

export default async function SettingsPage() {
  const api = await serverApi()
  const [me, reminders, providerKey] = await Promise.all([
    currentUser(),
    api.study.reminders.$get().then((response) => response.json()),
    api.me['provider-key'].$get().then((response) => response.json()),
  ])

  return (
    <main className="mx-auto grid w-full max-w-[640px] content-start gap-10 px-4 pt-14 pb-24 sm:px-6">
      <h1 className="display-l">Settings</h1>
      <section aria-labelledby="account" className="grid gap-4 border-t border-line pt-5">
        <h2 id="account" className="mono-label text-ink-3">
          Account
        </h2>
        <p className="ui-l break-words">{me.email}</p>
        <div>
          <LogOutButton />
        </div>
      </section>
      {providerKey.required && (
        <section aria-labelledby="provider-key" className="grid gap-4 border-t border-line pt-5">
          <h2 id="provider-key" className="mono-label text-ink-3">
            Anthropic key
          </h2>
          <ProviderKeyPanel initial={{ set: providerKey.set, last4: providerKey.last4 }} />
        </section>
      )}
      <section aria-labelledby="notes" className="grid gap-3 border-t border-line pt-5">
        <h2 id="notes" className="mono-label text-ink-3">
          Notes
        </h2>
        <PreferenceSwitch name="play-on-click">Play the video from a timestamp</PreferenceSwitch>
      </section>
      <section aria-labelledby="quiz" className="grid gap-3 border-t border-line pt-5">
        <h2 id="quiz" className="mono-label text-ink-3">
          Quiz
        </h2>
        {reminders.available && <ReminderSwitch enabled={reminders.enabled} />}
        <PreferenceSwitch name="show-shortcuts">Show keyboard shortcuts</PreferenceSwitch>
      </section>
    </main>
  )
}
