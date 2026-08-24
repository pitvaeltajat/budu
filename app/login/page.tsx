import { auth, signIn } from '@/lib/auth';
import { redirect } from 'next/navigation';

export default async function LoginPage() {
  if (await auth()) redirect('/');
  return <main className="signin"><section className="card"><div className="brand">bu<span>du</span></div><h1>Keep spending in view.</h1><p>Sign in with your Google account to see your budget and its realized expenses.</p><form action={async () => { 'use server'; await signIn('google', { redirectTo: '/' }); }}><button className="button" type="submit">Continue with Google</button></form></section></main>;
}
