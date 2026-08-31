import { allowedDomains, auth, devLoginEnabled, signIn } from '@/lib/auth';
import { PitvaLogo } from '../pitva-logo';
import { redirect } from 'next/navigation';

/** Falls back to the association's own domain when no allowlist is configured, so the advice is never blank. */
const domain = allowedDomains[0] ?? 'pitkajarvenvaeltajat.fi';

/**
 * NextAuth sends every failed sign-in here rather than to its own English
 * "Access Denied" page. `AccessDenied` is the one a member can act on: the
 * account was fine, it simply was not a PitVa account.
 */
function noticeFor(error: string | undefined) {
  if (!error) return null;
  if (error === 'AccessDenied')
    return `Tuo tili ei ole PitVan tili. Budu päästää sisään vain @${domain}-osoitteella — henkilökohtainen Gmail ei kelpaa. Vaihda tiliä ja yritä uudelleen, tai pyydä lippukunnan osoitetta pestijohtajalta.`;
  return 'Kirjautuminen ei onnistunut. Yritä hetken kuluttua uudelleen.';
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string | string[] }> }) {
  if (await auth()) redirect('/');
  const { error } = await searchParams;
  const notice = noticeFor(Array.isArray(error) ? error[0] : error);
  return (
    <main className="signin">
      <section className="card">
        <PitvaLogo title="Pitkäjärven Vaeltajat ry" />
        <h1>Mihin PitVan rahat menevät?</h1>
        <p>
          Kirjaudu lippukunnan {domain}-tilillä, niin näet talousarvion rinnalla sen, mitä kolo, kammi ja retket ovat
          tänä vuonna todella maksaneet.
        </p>
        {notice ? <p className="notice">{notice}</p> : null}
        <form
          action={async () => {
            'use server';
            await signIn('google', { redirectTo: '/' });
          }}
        >
          <button className="button" type="submit">
            Kirjaudu Google-tilillä
          </button>
        </form>
        {devLoginEnabled && (
          // Local only; see devLoginEnabled in lib/auth.ts for the two gates.
          <form
            className="form-row"
            action={async (data: FormData) => {
              'use server';
              await signIn('dev', { email: data.get('email'), redirectTo: '/' });
            }}
          >
            <input name="email" type="email" required placeholder="kehitys@esimerkki.fi" aria-label="Sähköposti" />
            <button className="button secondary" type="submit">
              Kehityskirjautuminen
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
