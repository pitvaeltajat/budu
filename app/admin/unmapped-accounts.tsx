export type UnmappedAccount = {
  account: number;
  name: string;
  entries: number;
  debetCents: number;
  kreditCents: number;
};

/**
 * Accounts Kitsas booked money to that this talousarvio maps nothing to.
 *
 * The sync stores only the accounts a budget line names and silently drops the
 * rest, which makes a talousarvio written against a different chart of accounts
 * fail in the worst possible way: no error, every sync green, and a dashboard
 * missing most of the year. This panel is the counter-evidence. It is the only
 * place in Budu where money Kitsas holds but Budu does not show is visible at
 * all, so it leads with the totals rather than the list.
 */
export function UnmappedAccounts({ accounts, currency }: { accounts: UnmappedAccount[]; currency: string }) {
  const money = (cents: number) => new Intl.NumberFormat('fi-FI', { style: 'currency', currency }).format(cents / 100);
  if (!accounts.length)
    return (
      <section className="card admin-block">
        <div className="section-head">
          <h2>Tilit talousarvion ulkopuolella</h2>
          <span className="label">ei mitään</span>
        </div>
        <p className="label">
          Jokainen tili, jolle Kitsaassa on kirjattu rahaa tällä kaudella, kuuluu johonkin talousarvion riviin.
        </p>
      </section>
    );

  const debet = accounts.reduce((total, row) => total + row.debetCents, 0);
  const kredit = accounts.reduce((total, row) => total + row.kreditCents, 0);
  return (
    <section className="card admin-block">
      <div className="section-head">
        <h2>Tilit talousarvion ulkopuolella</h2>
        <span className="label">{accounts.length} tiliä</span>
      </div>
      <p className="notice">
        Kitsaassa on kirjauksia {accounts.length} tilillä, joita yksikään talousarvion rivi ei käytä: yhteensä{' '}
        <strong>{money(debet)}</strong> menoja ja <strong>{money(kredit)}</strong> tuloja. Nämä rahat eivät näy
        etusivulla lainkaan. Korjaa rivin Kitsas-tili yllä olevasta taulukosta, niin ne tulevat mukaan.
      </p>
      <table>
        <thead>
          <tr>
            <th>Tili</th>
            <th className="right">Menoa</th>
            <th className="right">Tuloa</th>
            <th className="right">Vientejä</th>
          </tr>
        </thead>
        <tbody>
          {accounts.map((row) => (
            <tr key={row.account}>
              <td>
                <strong>{row.account}</strong> {row.name || <span className="label">nimi tuntematon</span>}
              </td>
              <td className="right">{row.debetCents ? money(row.debetCents) : '—'}</td>
              <td className="right">{row.kreditCents ? money(row.kreditCents) : '—'}</td>
              <td className="right">{row.entries}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="label">
        Lista päivittyy täydessä synkronoinnissa, joka ajetaan sunnuntaisin. Taseen tilit (alle 3000) jätetään pois:
        pankkitili ja velat eivät kuulu talousarvioon.
      </p>
    </section>
  );
}
