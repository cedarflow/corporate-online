// Agreement and form templates for the Documents section (the equivalent of Ownr's "Create a New Document").
// They are drafting starting points for staff and must be reviewed before use. They are not legal advice.
import { human } from './dates.ts';
import type { Jurisdiction } from './jurisdictions.ts';

export interface AgreementContext { legalName: string; j: Jurisdiction; date: string; params: Record<string, string>; officer: string }
export interface AgreementParam { name: string; label: string; type?: 'text' | 'date' | 'number' | 'textarea'; default?: string }
export interface AgreementDef {
  kind: string;
  label: string;
  group: string;
  category: string;
  description: string;
  params: AgreementParam[];
  build: (c: AgreementContext) => { title: string; body: string };
}

const law = (c: AgreementContext) => c.params.governing_law || (c.j.code === 'CA' ? 'Ontario' : c.j.longName);
const sigBlock = (c: AgreementContext, other: string) =>
  `\n\n${c.legalName.toUpperCase()}\n\nPer: ______________________________\n     ${c.officer || 'Authorized Signatory'}\n\n\n${other.toUpperCase()}\n\n______________________________`;
const p = (c: AgreementContext, k: string, fallback: string) => c.params[k] || fallback;
const money = (v: string | undefined) => (v ? `$${Number(v).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '$[amount]');
const numbered = (items: string[]) => items.map((s, i) => `${i + 1}. ${s}`).join('\n\n');

const GOVERNING: AgreementParam = { name: 'governing_law', label: 'Governing law (province)' };

export const AGREEMENTS: AgreementDef[] = [
  {
    kind: 'founder_ip', label: 'Founder IP Assignment Agreement', group: 'Intellectual Property', category: 'ip',
    description: 'A founder assigns IP they created for the business to the company.',
    params: [{ name: 'founder', label: 'Founder name' }, { name: 'description', label: 'Description of the IP', type: 'textarea' }, GOVERNING],
    build: (c) => ({
      title: `Founder IP Assignment: ${p(c, 'founder', '[Founder]')}`,
      body: `FOUNDER INTELLECTUAL PROPERTY ASSIGNMENT AGREEMENT\n\nThis Agreement is made as of ${human(c.date)} between ${p(c, 'founder', '[Founder]')} (the "Founder") and ${c.legalName} (the "Company").\n\n` + numbered([
        `Assignment. The Founder irrevocably assigns to the Company all right, title and interest in and to all intellectual property conceived, developed or reduced to practice by the Founder, alone or with others, relating to the business of the Company, whether before or after the date of this Agreement, including: ${p(c, 'description', '[describe the technology, brand, content, code and other work product]')} (the "Assigned IP").`,
        'Future IP. All intellectual property the Founder creates in the course of the Founder\'s work for the Company after the date of this Agreement is owned by the Company on creation.',
        'Moral rights. The Founder waives, in favour of the Company and its successors, assigns and licensees, all moral rights the Founder has or may have in the Assigned IP.',
        'Further assurances. The Founder will sign all documents and do all things reasonably required to register, perfect or enforce the Company\'s rights in the Assigned IP.',
        'Consideration. The Founder acknowledges receipt of good and valuable consideration, including the issuance of shares of the Company, for this assignment.',
        'Representations. The Founder has not granted any rights in the Assigned IP to any other person and is not aware of any claim that it infringes the rights of others.',
        `Governing law. This Agreement is governed by the laws of ${law(c)} and the federal laws of Canada applicable there.`,
      ]) + sigBlock(c, p(c, 'founder', 'Founder')),
    }),
  },
  {
    kind: 'general_ip', label: 'General IP Assignment Agreement', group: 'Intellectual Property', category: 'ip',
    description: 'Anyone who created IP for the business (e.g. a freelancer) transfers it to the company.',
    params: [{ name: 'assignor', label: 'Assignor name' }, { name: 'description', label: 'Description of the IP', type: 'textarea' }, { name: 'consideration', label: 'Consideration ($)', type: 'number' }, GOVERNING],
    build: (c) => ({
      title: `IP Assignment: ${p(c, 'assignor', '[Assignor]')}`,
      body: `INTELLECTUAL PROPERTY ASSIGNMENT AGREEMENT\n\nThis Agreement is made as of ${human(c.date)} between ${p(c, 'assignor', '[Assignor]')} (the "Assignor") and ${c.legalName} (the "Company").\n\n` + numbered([
        `Assignment. For ${c.params.consideration ? money(c.params.consideration) : 'good and valuable consideration'}, the receipt and sufficiency of which are acknowledged, the Assignor irrevocably assigns to the Company all right, title and interest, including all copyright, trademarks, patents, designs and trade secrets, in and to: ${p(c, 'description', '[describe the work, e.g. logo, website, training manual]')} (the "Work").`,
        'Moral rights. The Assignor waives all moral rights in the Work in favour of the Company and its successors and licensees.',
        'Originality. The Assignor represents that the Work is original, was created by the Assignor and does not infringe the rights of any third party.',
        'Further assurances. The Assignor will sign any further documents reasonably required to give effect to this assignment.',
        `Governing law. This Agreement is governed by the laws of ${law(c)}.`,
      ]) + sigBlock(c, p(c, 'assignor', 'Assignor')),
    }),
  },
  {
    kind: 'nda', label: 'Mutual Non-Disclosure Agreement', group: 'Contracts & Agreements', category: 'contracts',
    description: 'Both parties keep each other\'s confidential information confidential.',
    params: [{ name: 'counterparty', label: 'Other party' }, { name: 'purpose', label: 'Purpose of disclosure' }, { name: 'term_years', label: 'Confidentiality period (years)', type: 'number', default: '3' }, GOVERNING],
    build: (c) => ({
      title: `Mutual NDA: ${p(c, 'counterparty', '[Counterparty]')}`,
      body: `MUTUAL NON-DISCLOSURE AGREEMENT\n\nThis Agreement is made as of ${human(c.date)} between ${c.legalName} and ${p(c, 'counterparty', '[Counterparty]')} (each a "Party").\n\n` + numbered([
        `Purpose. The Parties wish to share information for the purpose of ${p(c, 'purpose', 'evaluating a potential business relationship')} (the "Purpose").`,
        'Confidential Information means all non-public information disclosed by a Party, in any form, that is marked confidential or would reasonably be understood to be confidential. It excludes information that is or becomes public through no fault of the recipient, was already lawfully known to the recipient, is independently developed, or is lawfully received from a third party without restriction.',
        'Obligations. The recipient will use Confidential Information only for the Purpose, protect it with at least reasonable care, and disclose it only to its employees and advisers who need to know it and are bound by similar obligations.',
        'Required disclosure. A recipient may disclose Confidential Information if required by law, after giving prompt notice to the discloser where legally permitted.',
        'Return. On request, the recipient will return or destroy the discloser\'s Confidential Information.',
        `Term. These obligations continue for ${p(c, 'term_years', '3')} years after the last disclosure, and indefinitely for trade secrets.`,
        'No licence. No rights are granted other than as set out in this Agreement. Equitable relief is available for any breach.',
        `Governing law. This Agreement is governed by the laws of ${law(c)}.`,
      ]) + sigBlock(c, p(c, 'counterparty', 'Counterparty')),
    }),
  },
  {
    kind: 'employment', label: 'Employment Agreement', group: 'Employees & Contractors', category: 'employment',
    description: 'Hire an employee: duties, pay, hours, confidentiality and IP.',
    params: [
      { name: 'employee', label: 'Employee name' }, { name: 'title', label: 'Job title' }, { name: 'start', label: 'Start date', type: 'date' },
      { name: 'salary', label: 'Annual salary ($)', type: 'number' }, { name: 'hours', label: 'Hours per week', type: 'number', default: '40' },
      { name: 'vacation', label: 'Vacation (weeks per year)', type: 'number', default: '2' }, { name: 'probation', label: 'Probation (months)', type: 'number', default: '3' }, GOVERNING,
    ],
    build: (c) => ({
      title: `Employment Agreement: ${p(c, 'employee', '[Employee]')}`,
      body: `EMPLOYMENT AGREEMENT\n\nThis Agreement is made as of ${human(c.date)} between ${c.legalName} (the "Employer") and ${p(c, 'employee', '[Employee]')} (the "Employee").\n\n` + numbered([
        `Position. The Employee will be employed as ${p(c, 'title', '[Job title]')} starting ${c.params.start ? human(c.params.start) : '[start date]'}, and will perform the duties reasonably assigned by the Employer.`,
        `Compensation. The Employer will pay an annual salary of ${money(c.params.salary)}, less required deductions, in accordance with its regular payroll schedule.`,
        `Hours. Regular hours are ${p(c, 'hours', '40')} per week. Overtime, if any, is paid in accordance with applicable employment standards legislation.`,
        `Vacation. The Employee is entitled to ${p(c, 'vacation', '2')} weeks of paid vacation per year, and in any event no less than the minimum required by law.`,
        `Probation. The first ${p(c, 'probation', '3')} months are a probationary period, subject to applicable employment standards legislation.`,
        'Confidentiality. The Employee will keep the Employer\'s confidential information confidential during and after employment.',
        'Intellectual property. All work product created by the Employee in the course of employment is owned by the Employer, and the Employee waives moral rights in it.',
        'Termination. Either party may end this Agreement in accordance with applicable employment standards legislation. The Employer will provide at least the notice, pay in lieu and severance required by that legislation.',
        `Governing law. This Agreement is governed by the laws of ${law(c)}.`,
      ]) + sigBlock(c, p(c, 'employee', 'Employee')),
    }),
  },
  {
    kind: 'contractor', label: 'Independent Contractor Agreement', group: 'Employees & Contractors', category: 'employment',
    description: 'Engage a contractor: services, fees, independence, confidentiality and IP.',
    params: [
      { name: 'contractor', label: 'Contractor name' }, { name: 'services', label: 'Services', type: 'textarea' }, { name: 'rate', label: 'Fee / rate' },
      { name: 'start', label: 'Start date', type: 'date' }, { name: 'notice_days', label: 'Termination notice (days)', type: 'number', default: '14' }, GOVERNING,
    ],
    build: (c) => ({
      title: `Contractor Agreement: ${p(c, 'contractor', '[Contractor]')}`,
      body: `INDEPENDENT CONTRACTOR AGREEMENT\n\nThis Agreement is made as of ${human(c.date)} between ${c.legalName} (the "Company") and ${p(c, 'contractor', '[Contractor]')} (the "Contractor").\n\n` + numbered([
        `Services. Beginning ${c.params.start ? human(c.params.start) : '[start date]'}, the Contractor will provide: ${p(c, 'services', '[describe the services and deliverables]')}.`,
        `Fees. The Company will pay ${p(c, 'rate', '[rate]')} plus applicable taxes, within 30 days of receiving a proper invoice.`,
        'Independent contractor. The Contractor is an independent contractor, not an employee. The Contractor controls how the Services are performed, supplies their own tools, and is responsible for their own taxes, remittances and insurance.',
        'Confidentiality. The Contractor will keep the Company\'s confidential information confidential during and after the engagement.',
        'Intellectual property. All deliverables and work product are owned by the Company on creation. The Contractor assigns all rights in them to the Company and waives moral rights.',
        `Termination. Either party may terminate this Agreement on ${p(c, 'notice_days', '14')} days' written notice. The Company will pay for Services properly performed up to the termination date.`,
        `Governing law. This Agreement is governed by the laws of ${law(c)}.`,
      ]) + sigBlock(c, p(c, 'contractor', 'Contractor')),
    }),
  },
  {
    kind: 'shareholder_loan', label: 'Shareholder Loan Agreement', group: 'Shareholder Payments', category: 'financing',
    description: 'Documents money a shareholder lends to the company, so it can be repaid rather than taxed as income.',
    params: [
      { name: 'lender', label: 'Shareholder (lender)' }, { name: 'amount', label: 'Principal ($)', type: 'number' }, { name: 'rate', label: 'Interest rate (% per year)', type: 'number', default: '0' },
      { name: 'repayment', label: 'Repayment terms', default: 'repayable on demand' }, GOVERNING,
    ],
    build: (c) => ({
      title: `Shareholder Loan: ${p(c, 'lender', '[Shareholder]')} (${money(c.params.amount)})`,
      body: `SHAREHOLDER LOAN AGREEMENT\n\nThis Agreement is made as of ${human(c.date)} between ${p(c, 'lender', '[Shareholder]')} (the "Lender") and ${c.legalName} (the "Borrower").\n\n` + numbered([
        `Loan. The Lender has advanced, or will advance, to the Borrower the principal sum of ${money(c.params.amount)} (the "Loan").`,
        `Interest. The Loan bears interest at ${p(c, 'rate', '0')}% per year${Number(c.params.rate || 0) === 0 ? ' (interest-free)' : ', calculated and payable annually'}.`,
        `Repayment. The Loan is ${p(c, 'repayment', 'repayable on demand')}. The Borrower may prepay all or part of the Loan at any time without penalty.`,
        'Nature of advance. The parties confirm that the Loan is a debt of the Borrower and not a contribution of capital or a payment for shares.',
        'Records. The Borrower will record the Loan as a shareholder loan payable in its accounting records.',
        `Governing law. This Agreement is governed by the laws of ${law(c)}.`,
      ]) + sigBlock(c, p(c, 'lender', 'Lender')),
    }),
  },
  {
    kind: 'director_consent', label: 'Consent to Act as Director', group: 'Corporate Forms', category: 'minute_book',
    description: 'A director consents to act and confirms they are qualified (required before acting).',
    params: [{ name: 'director', label: 'Director name' }],
    build: (c) => ({
      title: `Director's Consent: ${p(c, 'director', '[Director]')}`,
      body: `DIRECTOR'S CONSENT AND ACKNOWLEDGMENT\n\nTO: ${c.legalName.toUpperCase()} (the "Corporation")\n\nI, the undersigned, in accordance with the ${c.j.statute.replace(/\s*\([A-Z]+\)$/, '')}:\n\n` + numbered([
        'Consent to act as a director of the Corporation. This consent continues in effect unless I revoke it by written notice to the Corporation.',
        'Confirm that I am not disqualified from acting as a director: I am at least 18 years of age, I have not been found by a court to be incapable of managing my own affairs, I am not an undischarged bankrupt, and I have not been convicted of an offence that disqualifies me under the governing statute.',
        'Consent to directors participating in meetings by telephone, video or other means that allow all participants to communicate with each other.',
        'Acknowledge that the Corporation will rely on this consent to comply with the governing statute.',
      ]) + `\n\nDATED ${human(c.date).toUpperCase()}.\n\n\n______________________________\n${p(c, 'director', '[Director]').toUpperCase()}`,
    }),
  },
  {
    kind: 'subscription', label: 'Subscription for Shares', group: 'Corporate Forms', category: 'shares',
    description: 'A subscriber applies for shares and agrees to pay the subscription price.',
    params: [{ name: 'subscriber', label: 'Subscriber' }, { name: 'class', label: 'Share class', default: 'Class A Common' }, { name: 'quantity', label: 'Number of shares', type: 'number' }, { name: 'price', label: 'Aggregate subscription price ($)', type: 'number' }],
    build: (c) => ({
      title: `Subscription for Shares: ${p(c, 'subscriber', '[Subscriber]')}`,
      body: `SUBSCRIPTION FOR SHARES\n\nTO: ${c.legalName.toUpperCase()} (the "Corporation")\nAND TO: THE DIRECTORS THEREOF\n\nThe undersigned subscribes for the following shares of the Corporation and agrees to pay the full aggregate subscription price:\n\nSubscriber: ${p(c, 'subscriber', '[Subscriber]')}\nClass or series: ${p(c, 'class', 'Class A Common')}\nNumber: ${Number(c.params.quantity || 0).toLocaleString()}\nAggregate subscription price: ${money(c.params.price)}\n\nThe undersigned asks that the shares be issued in their name and that their name be entered in the securities register of the Corporation.\n\nDATED ${human(c.date).toUpperCase()}.\n\n\n______________________________\n${p(c, 'subscriber', '[Subscriber]').toUpperCase()}`,
    }),
  },
];

export function getAgreement(kind: string): AgreementDef | undefined {
  return AGREEMENTS.find((a) => a.kind === kind);
}

export const DOC_CATEGORIES: [string, string][] = [
  ['incorporation', 'Incorporation & constating'],
  ['minute_book', 'Minute book'],
  ['shares', 'Shares'],
  ['shareholder_agreement', 'Shareholder agreement'],
  ['financing', 'Financing'],
  ['ip', 'Intellectual property'],
  ['employment', 'Employment'],
  ['contracts', 'Contracts'],
  ['tax', 'Tax & filings'],
  ['other', 'Other'],
];
export const categoryLabel = (k: string) => DOC_CATEGORIES.find(([c]) => c === k)?.[1] ?? k;
