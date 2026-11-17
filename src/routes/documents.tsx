// Print-ready minute book documents: registers, certificates, full minute book.
import { Hono } from 'hono';
import type { AppEnv } from '../env.ts';
import { human, fyeLabel, today } from '../lib/dates.ts';
import { capTable } from '../lib/captable.ts';
import { loadCompany, type CompanyBundle } from '../lib/company.ts';
import { DocPage } from '../views/doc.tsx';
import { ResolutionDoc } from './resolutions.tsx';

const app = new Hono<AppEnv>();

const money = (n: number) => `$${n.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const Dt = ({ d }: { d: string | null }) => <>{d ? human(d) : '—'}</>;

const Header = ({ b, title }: { b: CompanyBundle; title: string }) => (
  <>
    <h1>{b.name}</h1>
    <h2>{title}</h2>
  </>
);

const DirectorsRegister = ({ b }: { b: CompanyBundle }) => (
  <>
    <Header b={b} title="Register of Directors" />
    <table>
      <thead><tr><th>Name</th><th>Residential address</th><th>Resident Canadian</th><th>Date elected / appointed</th><th>Date ceased</th></tr></thead>
      <tbody>{b.directors.map((d) => <tr><td>{d.name}</td><td>{d.address ?? ''}</td><td>{d.resident_canadian ? 'Yes' : 'No'}</td><td><Dt d={d.appointed_on} /></td><td><Dt d={d.ceased_on} /></td></tr>)}</tbody>
    </table>
  </>
);
const OfficersRegister = ({ b }: { b: CompanyBundle }) => (
  <>
    <Header b={b} title="Register of Officers" />
    <table>
      <thead><tr><th>Name</th><th>Office</th><th>Date appointed</th><th>Date ceased</th></tr></thead>
      <tbody>{b.officers.map((o) => <tr><td>{o.name}</td><td>{o.title}</td><td><Dt d={o.appointed_on} /></td><td><Dt d={o.ceased_on} /></td></tr>)}</tbody>
    </table>
  </>
);
const SecuritiesRegister = ({ b }: { b: CompanyBundle }) => {
  const sh = new Map(b.shareholders.map((x) => [x.id, x.name]));
  return (
    <>
      <Header b={b} title="Securities Register" />
      {b.classes.map((cl) => {
        const txs = b.txs.filter((t) => t.share_class_id === cl.id);
        let running = 0;
        return (
          <section style="margin-bottom:24px">
            <h3>{cl.name} shares <span style="font-weight:normal">({cl.voting ? 'voting' : 'non-voting'}; authorized: {cl.max_shares ? cl.max_shares.toLocaleString() : 'unlimited'})</span></h3>
            {txs.length ? (
              <table>
                <thead><tr><th>Date</th><th>Transaction</th><th>From</th><th>To</th><th>Cert.</th><th>Shares</th><th>Consideration</th><th>Outstanding</th></tr></thead>
                <tbody>
                  {txs.map((t) => {
                    running += t.kind === 'issuance' ? t.quantity : t.kind === 'redemption' ? -t.quantity : 0;
                    return <tr><td><Dt d={t.tx_date} /></td><td>{t.kind[0].toUpperCase() + t.kind.slice(1)}</td><td>{t.from_shareholder_id ? sh.get(t.from_shareholder_id) : 'Treasury'}</td><td>{t.to_shareholder_id ? sh.get(t.to_shareholder_id) : 'Cancelled'}</td><td>{t.certificate_number ?? ''}</td><td>{t.quantity.toLocaleString()}</td><td>{money(t.quantity * t.price_per_share)}</td><td>{running.toLocaleString()}</td></tr>;
                  })}
                </tbody>
              </table>
            ) : <p><em>No shares of this class issued.</em></p>}
          </section>
        );
      })}
    </>
  );
};
const ShareholdersRegister = ({ b }: { b: CompanyBundle }) => {
  const cap = capTable(b.shareholders, b.classes, b.txs);
  return (
    <>
      <Header b={b} title="Register of Shareholders" />
      <p style="text-align:center">As at {human(today())}</p>
      <table>
        <thead><tr><th>Shareholder</th><th>Address</th>{b.classes.map((cl) => <th>{cl.name}</th>)}<th>% equity</th><th>% votes</th></tr></thead>
        <tbody>{cap.rows.filter((r) => r.total).map((r) => <tr><td>{r.shareholder.name}</td><td>{r.shareholder.address ?? ''}</td>{b.classes.map((cl) => <td>{(r.byClass[cl.id] || 0).toLocaleString()}</td>)}<td>{r.pctEquity.toFixed(2)}%</td><td>{r.pctVoting.toFixed(2)}%</td></tr>)}</tbody>
      </table>
    </>
  );
};
const IscRegister = ({ b }: { b: CompanyBundle }) => {
  const cap = capTable(b.shareholders, b.classes, b.txs);
  const sig = cap.rows.filter((r) => r.pctVoting >= 25 || r.pctEquity >= 25);
  return (
    <>
      <Header b={b} title="Register of Individuals with Significant Control" />
      <p>Prepared from the securities register as at {human(today())}. Registered holdings of 25% or more of votes or fair market value (approximated here by share count) are listed. Indirect holdings, control through agreements and corporate shareholders' beneficial owners must be reviewed and added manually.</p>
      <table>
        <thead><tr><th>Name</th><th>Type</th><th>Address</th><th>% votes</th><th>% shares</th><th>Nature of control</th></tr></thead>
        <tbody>
          {sig.map((r) => <tr><td>{r.shareholder.name}</td><td>{r.shareholder.kind}</td><td>{r.shareholder.address ?? ''}</td><td>{r.pctVoting.toFixed(2)}%</td><td>{r.pctEquity.toFixed(2)}%</td><td>Registered holder{r.shareholder.kind !== 'individual' ? ' (identify individuals behind this holder)' : ''}</td></tr>)}
          {b.isc.map((x) => <tr><td>{x.name}{x.ceased_on ? ` (ceased ${human(x.ceased_on)})` : ''}</td><td>individual</td><td>{x.address ?? ''}</td><td>—</td><td>—</td><td>{x.control_description ?? ''}{x.became_on ? ` Since ${human(x.became_on)}.` : ''}{x.tax_residence ? ` Tax residence: ${x.tax_residence}.` : ''}</td></tr>)}
        </tbody>
      </table>
      {!sig.length && !b.isc.length ? <p><em>No individual meets the 25% threshold or has been recorded as having significant control.</em></p> : null}
    </>
  );
};

const DOCS: Record<string, { title: string; render: (b: CompanyBundle) => any }> = {
  'directors-register': { title: 'Register of Directors', render: (b) => <DirectorsRegister b={b} /> },
  'officers-register': { title: 'Register of Officers', render: (b) => <OfficersRegister b={b} /> },
  'securities-register': { title: 'Securities Register', render: (b) => <SecuritiesRegister b={b} /> },
  'shareholders-register': { title: 'Register of Shareholders', render: (b) => <ShareholdersRegister b={b} /> },
  'isc-register': { title: 'ISC Register', render: (b) => <IscRegister b={b} /> },
  'minute-book': {
    title: 'Minute Book',
    render: (b) => {
      const signed = [...b.resolutions].filter((r) => r.signed_on).sort((x, y) => x.resolution_date.localeCompare(y.resolution_date));
      return (
        <>
          <div class="page-break" style="text-align:center;padding-top:160px">
            <h1 style="font-size:24pt">{b.name}</h1>
            <h2>Minute Book</h2>
            <p>{b.j.statute}</p>
            {b.company.corp_number ? <p>Corporation No. {b.company.corp_number}</p> : null}
            {b.company.incorporation_date ? <p>Incorporated {human(b.company.incorporation_date)}</p> : null}
            <p style="margin-top:80px;font-size:10pt">Compiled {human(today())}</p>
          </div>
          <div class="page-break">
            <h1>Corporate Summary</h1>
            <table>
              <tbody>
                <tr><th>Registered office</th><td style="white-space:pre-line">{b.company.registered_office ?? ''}</td></tr>
                <tr><th>Fiscal year end</th><td>{fyeLabel(b.company.fiscal_year_end)}</td></tr>
                <tr><th>Business number</th><td>{b.company.business_number ?? ''}</td></tr>
                <tr><th>Directors (min–max)</th><td>{b.company.min_directors}–{b.company.max_directors}</td></tr>
                <tr><th>Restrictions</th><td>{b.company.restrictions ?? ''}</td></tr>
              </tbody>
            </table>
            <h3 style="margin-top:24px">Authorized capital</h3>
            <table><tbody>{b.classes.map((cl) => <tr><th>{cl.name}</th><td>{cl.max_shares ? cl.max_shares.toLocaleString() : 'Unlimited'}; {cl.rights}</td></tr>)}</tbody></table>
            <h3 style="margin-top:24px">Index</h3>
            <ol>
              <li>Register of Directors</li><li>Register of Officers</li><li>Securities Register</li><li>Register of Shareholders</li><li>Register of Individuals with Significant Control</li>
              <li>Resolutions ({signed.length})<ol>{signed.map((r) => <li>{human(r.resolution_date)}: {r.title}</li>)}</ol></li>
              {b.docs.some((d) => d.in_minute_book) ? <li>Other minute book documents ({b.docs.filter((d) => d.in_minute_book).length})<ol>{b.docs.filter((d) => d.in_minute_book).map((d) => <li>{d.doc_date ? `${human(d.doc_date)}: ` : ''}{d.title}{d.file_key ? ' (filed separately)' : ''}</li>)}</ol></li> : null}
            </ol>
          </div>
          <div class="page-break"><DirectorsRegister b={b} /></div>
          <div class="page-break"><OfficersRegister b={b} /></div>
          <div class="page-break"><SecuritiesRegister b={b} /></div>
          <div class="page-break"><ShareholdersRegister b={b} /></div>
          <div class="page-break"><IscRegister b={b} /></div>
          {signed.map((r) => <div class="page-break"><h1>{r.title}</h1><ResolutionDoc b={b} r={r} /></div>)}
          {b.docs.filter((d) => d.in_minute_book && d.body).map((d) => <div class="page-break"><div class="body">{d.body}</div></div>)}
        </>
      );
    },
  },
};

const spell = (n: number): string => {
  const ones = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  if (n < 20) return ones[n];
  if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? `-${ones[n % 10]}` : '');
  if (n < 1000) return `${ones[Math.floor(n / 100)]} Hundred${n % 100 ? ` ${spell(n % 100)}` : ''}`;
  for (const [v, w] of [[1e9, 'Billion'], [1e6, 'Million'], [1e3, 'Thousand']] as [number, string][]) {
    if (n >= v) return `${spell(Math.floor(n / v))} ${w}${n % v ? ` ${spell(n % v)}` : ''}`;
  }
  return String(n);
};

// Written notice for uncertificated shares (e.g. BC Business Corporations Act s. 107(6)).
app.get('/:id/documents/notice/:tid', async (c) => {
  const b = await loadCompany(c.env.DB, c.req.param('id'));
  const t = b?.txs.find((x) => x.id === c.req.param('tid'));
  if (!b || !t || !t.to_shareholder_id) return c.notFound();
  const holder = b.shareholders.find((x) => x.id === t.to_shareholder_id);
  const cls = b.classes.find((x) => x.id === t.share_class_id);
  const pres = b.currentOfficers.find((o) => o.title === 'President');
  const act = b.j.code === 'BC' ? 'Business Corporations Act, SBC 2002, c 57' : b.j.statute.replace(/\s*\([A-Z]+\)$/, '');
  const heading = b.j.code === 'BC' ? `NOTICE UNDER SECTION 107(6) OF THE ${act.toUpperCase()} (the "Act")` : 'NOTICE OF ISSUANCE OF UNCERTIFICATED SHARES';
  return DocPage(c, {
    title: `Notice ${t.certificate_number ?? ''}`,
    back: `/companies/${b.company.id}?tab=documents`,
    children: (
      <>
        <h1 style="font-size:13pt">{heading}</h1>
        <p style="text-align:center"><strong>Number {t.certificate_number ?? '—'}</strong><br />{t.quantity.toLocaleString()} {cls?.name} Shares<br />{b.name.toUpperCase()}</p>
        <p>Incorporated under the {act}.</p>
        <p>This notice is sent in compliance with the Act. It confirms that <strong>{holder?.name.toUpperCase()}</strong> is the registered holder of {spell(t.quantity)} ({t.quantity.toLocaleString()}) {cls?.name} shares without par value of {b.name.toUpperCase()} (the "Corporation"), issued as fully paid and non-assessable on {human(t.tx_date)}, transferable only on the books of the Corporation by the holder in person, or as otherwise prescribed by the Act. No certificate was issued to evidence these shares.</p>
        <p>There are restrictions on the right to transfer the shares described in this notice.</p>
        <p style="margin-top:24px">DATED {human(t.tx_date).toUpperCase()}.</p>
        <p style="margin-top:28px">{b.name.toUpperCase()}</p>
        <div class="sigs"><div class="sig">PER: {pres ? `${pres.name.toUpperCase()}, PRESIDENT` : 'AUTHORIZED SIGNATORY'}</div></div>
      </>
    ),
  });
});

app.get('/:id/documents/certificate/:tid', async (c) => {
  const b = await loadCompany(c.env.DB, c.req.param('id'));
  const t = b?.txs.find((x) => x.id === c.req.param('tid'));
  if (!b || !t || !t.to_shareholder_id) return c.notFound();
  const holder = b.shareholders.find((x) => x.id === t.to_shareholder_id);
  const cls = b.classes.find((x) => x.id === t.share_class_id);
  const pres = b.currentOfficers.find((o) => o.title === 'President')?.name ?? b.currentDirectors[0]?.name ?? '';
  const sec = b.currentOfficers.find((o) => o.title === 'Secretary')?.name ?? '';
  return DocPage(c, {
    title: `Certificate ${t.certificate_number ?? ''}`,
    back: `/companies/${b.company.id}?tab=documents`,
    children: (
      <div class="cert">
        <div>Certificate No. <strong>{t.certificate_number ?? '—'}</strong> · {t.quantity.toLocaleString()} {cls?.name} shares</div>
        <div class="big">{b.name}</div>
        <div>Incorporated under the {b.j.statute}</div>
        <p style="margin-top:28px;font-size:13pt">THIS CERTIFIES THAT <strong>{holder?.name}</strong> is the registered holder of <strong>{t.quantity.toLocaleString()}</strong> fully paid and non-assessable <strong>{cls?.name}</strong> shares in the capital of the Corporation.</p>
        <p style="font-size:9.5pt;text-align:left;margin-top:20px">The Corporation will furnish to the shareholder, on demand and without charge, a full copy of the text of the rights, privileges, restrictions and conditions attached to each class authorized to be issued. The right to transfer these shares is restricted by the articles of the Corporation.</p>
        <p>Dated {human(t.tx_date)}.</p>
        <div class="sigs" style="text-align:left"><div class="sig">{pres}<br />Authorized signatory</div><div class="sig">{sec}<br />Authorized signatory</div></div>
      </div>
    ),
  });
});

app.get('/:id/documents/:doc', async (c) => {
  const def = DOCS[c.req.param('doc')];
  const b = def ? await loadCompany(c.env.DB, c.req.param('id')) : null;
  if (!def || !b) return c.notFound();
  return DocPage(c, { title: `${def.title}: ${b.name}`, back: `/companies/${b.company.id}?tab=documents`, children: def.render(b) });
});

export default app;
