// Resolution templates. Output is plain text; staff can edit before saving.
// Templates are starting points prepared for review, not legal advice.
import { human, fyeLabel } from './dates.ts';
import type { Jurisdiction } from './jurisdictions.ts';
import type { Company, Director, Officer, ShareClass, Shareholder, ShareTx } from './types.ts';
import { capTable } from './captable.ts';

export interface ResolutionContext {
  company: Company;
  j: Jurisdiction;
  legalName: string;
  directors: Director[]; // current
  officers: Officer[]; // current
  shareholders: Shareholder[];
  classes: ShareClass[];
  txs: ShareTx[];
  date: string;
  params: Record<string, string>;
}

export interface TemplateDef {
  kind: string;
  label: string;
  body_type: 'directors' | 'shareholders';
  description: string;
  params?: { name: string; label: string; type?: 'text' | 'date' | 'number' | 'textarea' }[];
  build: (c: ResolutionContext) => { title: string; body: string };
}

const list = (items: string[]) => items.map((s, i) => `${i + 1}. ${s}`).join('\n\n');
const names = (xs: { name: string }[]) => xs.map((x) => x.name).join(', ');
// "Business Corporations Act (Ontario) (OBCA)" -> "Business Corporations Act (Ontario)"
const actName = (j: Jurisdiction) => j.statute.replace(/\s*\([A-Z]+\)$/, '');
const oneLine = (addr: string) => addr.split(/\s*\r?\n\s*/).filter(Boolean).join(', ');
function officerList(officers: { name: string; title: string }[]): string {
  const byName = new Map<string, string[]>();
  for (const o of officers) byName.set(o.name, [...(byName.get(o.name) ?? []), o.title]);
  return [...byName].map(([n, t]) => `${n} (${t.join(' and ')})`).join('; ');
}

const unanimousIntro = (c: ResolutionContext, who: 'directors' | 'shareholders') =>
  `RESOLUTIONS OF THE ${who.toUpperCase()} OF ${c.legalName.toUpperCase()} (the "Corporation")\n\n` +
  `The following resolutions, signed by all of the ${who === 'directors' ? 'directors' : 'shareholders entitled to vote'} of the Corporation, ` +
  `are passed as if passed at a meeting of the ${who}, pursuant to the ${actName(c.j)}.\n\nBE IT RESOLVED THAT:`;

const counterparts = '\n\nThese resolutions may be signed in counterparts and delivered electronically, each of which is deemed an original.';

function issuanceLines(c: ResolutionContext): string[] {
  const byId = new Map(c.shareholders.map((s) => [s.id, s]));
  const cls = new Map(c.classes.map((s) => [s.id, s]));
  return c.txs
    .filter((t) => t.kind === 'issuance')
    .map((t) => {
      const total = t.quantity * t.price_per_share;
      return `${t.quantity.toLocaleString()} ${cls.get(t.share_class_id)?.name ?? ''} shares to ${byId.get(t.to_shareholder_id ?? '')?.name ?? 'the subscriber'} for an aggregate subscription price of $${total.toFixed(2)}`;
    });
}

export const TEMPLATES: TemplateDef[] = [
  {
    kind: 'org_directors',
    label: 'Organizational resolutions: directors',
    body_type: 'directors',
    description: 'By-law No. 1, share issuances, officers, fiscal year end, registered office, banking.',
    build: (c) => {
      const items = [
        'By-law No. 1, being a by-law relating generally to the transaction of the business and affairs of the Corporation, in the form presented to the directors, is made as a by-law of the Corporation, and is submitted to the shareholders for confirmation.',
        'The form of share certificate presented to the directors is approved and adopted as the form of share certificate for each class of shares of the Corporation.',
        ...issuanceLines(c).map((l) => `The Corporation accept the subscription for and issue ${l}, the directors having determined that such consideration is fair value; such shares are issued as fully paid and non-assessable upon receipt of payment.`),
        ...(c.officers.length
          ? [`The following persons are appointed officers of the Corporation to hold office at the pleasure of the board: ${officerList(c.officers)}.`]
          : []),
        c.company.fiscal_year_end ? `The financial year of the Corporation shall end on ${fyeLabel(c.company.fiscal_year_end)} in each year until changed by resolution of the board.` : 'The financial year end of the Corporation shall be determined by resolution of the board.',
        c.company.registered_office ? `The registered office of the Corporation is confirmed as ${oneLine(c.company.registered_office)}.` : 'The registered office of the Corporation is confirmed as set out in its articles.',
        'The Corporation open such accounts with a Canadian chartered bank or credit union as any officer or director may determine, and any one director or officer is authorized to sign banking documents on behalf of the Corporation.',
        'Any director or officer is authorized to do all things and execute all documents necessary to give effect to these resolutions.',
      ];
      return { title: 'Organizational resolutions of the directors', body: `${unanimousIntro(c, 'directors')}\n\n${list(items)}${counterparts}` };
    },
  },
  {
    kind: 'org_shareholders',
    label: 'Organizational resolutions: shareholders',
    body_type: 'shareholders',
    description: 'Confirm By-law No. 1, confirm directors, consent to dispense with an auditor.',
    build: (c) => {
      const items = [
        'By-law No. 1 of the Corporation, as made by the directors, is confirmed without amendment.',
        c.directors.length ? `The number of directors is fixed at ${c.directors.length} and the following persons are confirmed as directors of the Corporation to hold office until the next annual meeting or until their successors are elected or appointed: ${names(c.directors)}.` : 'The directors named in the articles are confirmed as directors of the Corporation.',
        'All of the shareholders, including shareholders not otherwise entitled to vote, consent to the Corporation not appointing an auditor for the current financial year, to the extent permitted by the governing statute.',
      ];
      return { title: 'Organizational resolutions of the shareholders', body: `${unanimousIntro(c, 'shareholders')}\n\n${list(items)}${counterparts}` };
    },
  },
  {
    kind: 'annual_directors',
    label: 'Annual resolutions: directors',
    body_type: 'directors',
    description: 'Approve the annual financial statements.',
    params: [{ name: 'fy_end', label: 'Financial year ended', type: 'date' }],
    build: (c) => {
      const fy = c.params.fy_end ? human(c.params.fy_end) : '[year end]';
      const items = [
        `The financial statements of the Corporation for the financial year ended ${fy} are approved, and any director is authorized to sign them on behalf of the board.`,
        'The financial statements be submitted to the shareholders.',
      ];
      return { title: `Annual resolutions of the directors: year ended ${fy}`, body: `${unanimousIntro(c, 'directors')}\n\n${list(items)}${counterparts}` };
    },
  },
  {
    kind: 'annual_shareholders',
    label: 'Annual resolutions: shareholders',
    body_type: 'shareholders',
    description: 'Receive financial statements, elect directors, waive the auditor.',
    params: [{ name: 'fy_end', label: 'Financial year ended', type: 'date' }],
    build: (c) => {
      const fy = c.params.fy_end ? human(c.params.fy_end) : '[year end]';
      const items = [
        `The financial statements of the Corporation for the financial year ended ${fy}, as approved by the directors, are received.`,
        `The following persons are elected directors of the Corporation to hold office until the next annual meeting or until their successors are elected or appointed: ${names(c.directors) || '[directors]'}.`,
        'All of the shareholders, including shareholders not otherwise entitled to vote, consent to the Corporation not appointing an auditor for the current financial year.',
        'All business required to be transacted at an annual meeting of shareholders is dealt with by these resolutions in lieu of a meeting.',
      ];
      return { title: `Annual resolutions of the shareholders: year ended ${fy}`, body: `${unanimousIntro(c, 'shareholders')}\n\n${list(items)}${counterparts}` };
    },
  },
  {
    kind: 'share_issuance',
    label: 'Share issuance',
    body_type: 'directors',
    description: 'Issue additional shares to a subscriber.',
    params: [
      { name: 'subscriber', label: 'Subscriber' },
      { name: 'quantity', label: 'Number of shares', type: 'number' },
      { name: 'class', label: 'Share class' },
      { name: 'price', label: 'Price per share ($)', type: 'number' },
    ],
    build: (c) => {
      const q = Number(c.params.quantity || 0);
      const p = Number(c.params.price || 0);
      const items = [
        `The Corporation accept the subscription of ${c.params.subscriber || '[subscriber]'} for ${q.toLocaleString()} ${c.params.class || '[class]'} shares at $${p.toFixed(2)} per share (aggregate $${(q * p).toFixed(2)}), the directors having determined that this is fair value.`,
        'Upon receipt of payment in full, such shares are issued as fully paid and non-assessable and a share certificate be issued to the subscriber.',
        'Any director or officer is authorized to update the securities register of the Corporation accordingly.',
      ];
      return { title: `Issuance of ${c.params.class || ''} shares to ${c.params.subscriber || 'subscriber'}`.replace(/\s+/g, ' '), body: `${unanimousIntro(c, 'directors')}\n\n${list(items)}${counterparts}` };
    },
  },
  {
    kind: 'share_transfer',
    label: 'Approve share transfer',
    body_type: 'directors',
    description: 'Consent to a transfer of shares between shareholders.',
    params: [
      { name: 'from', label: 'Transferor' },
      { name: 'to', label: 'Transferee' },
      { name: 'quantity', label: 'Number of shares', type: 'number' },
      { name: 'class', label: 'Share class' },
    ],
    build: (c) => {
      const items = [
        `The transfer of ${Number(c.params.quantity || 0).toLocaleString()} ${c.params.class || '[class]'} shares of the Corporation from ${c.params.from || '[transferor]'} to ${c.params.to || '[transferee]'} is approved, as required by the restrictions on share transfers in the articles of the Corporation.`,
        'The certificate representing the transferred shares be cancelled and a new certificate be issued to the transferee (and, if applicable, a balance certificate to the transferor).',
        'The securities register of the Corporation be updated accordingly.',
      ];
      return { title: `Approval of share transfer: ${c.params.from || ''} to ${c.params.to || ''}`, body: `${unanimousIntro(c, 'directors')}\n\n${list(items)}${counterparts}` };
    },
  },
  {
    kind: 'director_change',
    label: 'Director change',
    body_type: 'shareholders',
    description: 'Accept a resignation and/or elect a new director.',
    params: [
      { name: 'resigning', label: 'Resigning director (optional)' },
      { name: 'new_director', label: 'New director (optional)' },
      { name: 'effective', label: 'Effective date', type: 'date' },
    ],
    build: (c) => {
      const eff = c.params.effective ? human(c.params.effective) : human(c.date);
      const items: string[] = [];
      if (c.params.resigning) items.push(`The resignation of ${c.params.resigning} as a director of the Corporation, effective ${eff}, is accepted.`);
      if (c.params.new_director) items.push(`${c.params.new_director} is elected a director of the Corporation effective ${eff}, to hold office until the next annual meeting or until a successor is elected or appointed.`);
      items.push(`Any director or officer is authorized to file a notice of change of directors with ${c.j.registry} within the time required.`);
      return { title: 'Change of directors', body: `${unanimousIntro(c, 'shareholders')}\n\n${list(items)}${counterparts}` };
    },
  },
  {
    kind: 'dividend',
    label: 'Dividend resolution',
    body_type: 'directors',
    description: 'Declare a dividend on a class of shares, split pro rata between the holders.',
    params: [
      { name: 'class', label: 'Share class (exact name)' },
      { name: 'amount', label: 'Total dividend ($)', type: 'number' },
      { name: 'record_date', label: 'Record date', type: 'date' },
      { name: 'payment_date', label: 'Payment date', type: 'date' },
    ],
    build: (c) => {
      const cls = c.classes.find((x) => x.name === c.params.class) ?? c.classes[0];
      const total = Number(c.params.amount || 0);
      const rows = cls ? capTable(c.shareholders, c.classes, c.txs).rows.filter((r) => (r.byClass[cls.id] ?? 0) > 0) : [];
      const outstanding = rows.reduce((n, r) => n + r.byClass[cls!.id], 0);
      const perShare = outstanding ? total / outstanding : 0;
      const split = rows.map((r) => `   - ${r.shareholder.name}: ${r.byClass[cls!.id].toLocaleString()} shares, $${(r.byClass[cls!.id] * perShare).toFixed(2)}`).join('\n');
      const items = [
        `A dividend in the aggregate amount of $${total.toFixed(2)} (approximately $${perShare.toFixed(6)} per share) is declared on the ${cls?.name ?? '[class]'} shares of the Corporation, payable on ${c.params.payment_date ? human(c.params.payment_date) : '[payment date]'} to holders of record at the close of business on ${c.params.record_date ? human(c.params.record_date) : '[record date]'}, as follows:\n${split || '   - [holders]'}`,
        'The directors have determined that there are no reasonable grounds for believing that the Corporation is insolvent or that payment of the dividend would render it insolvent.',
        'Any director or officer is authorized to pay the dividend and to prepare and file any required information returns (including T5 slips).',
      ];
      return { title: `Dividend on ${cls?.name ?? ''} shares: $${total.toFixed(2)}`, body: `${unanimousIntro(c, 'directors')}\n\n${list(items)}${counterparts}` };
    },
  },
  {
    kind: 'custom',
    label: 'Custom resolution',
    body_type: 'directors',
    description: 'Start from a blank resolution.',
    build: (c) => ({ title: 'Resolution', body: `${unanimousIntro(c, 'directors')}\n\n1. ` }),
  },
];

export function getTemplate(kind: string): TemplateDef | undefined {
  return TEMPLATES.find((t) => t.kind === kind);
}
