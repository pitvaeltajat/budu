import { redirect } from 'next/navigation';

/**
 * Importing is one of the things an admin does to the shared talousarvio, so it
 * lives on the admin page next to editing and replacing it rather than on a
 * page of its own. The old path is kept as a redirect: it was linked from the
 * dashboard, and a bookmark should not 404.
 */
export default function ImportPage() {
  redirect('/admin');
}
