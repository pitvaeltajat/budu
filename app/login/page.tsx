import { auth, signIn } from '@/lib/auth';
import { redirect } from 'next/navigation';

export default async function LoginPage() {
  if (await auth()) redirect('/');
  return <main className="signin"><section className="card"><h1>Pidä talous näkyvissä.</h1><p>Kirjaudu sisään yhdistyksen Google-tilillä, niin näet talousarvion ja toteutuneet kulut.</p><form action={async () => { 'use server'; await signIn('google', { redirectTo: '/' }); }}><button className="button" type="submit">Kirjaudu Google-tilillä</button></form></section></main>;
}
