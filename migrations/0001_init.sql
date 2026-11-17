-- Corporate Online: initial schema (Cloudflare D1 / SQLite)
-- IDs are app-generated text ids so related rows can be written in one atomic batch.

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('admin','staff')),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE clients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  address TEXT,
  notes TEXT,
  owner_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE companies (
  id TEXT PRIMARY KEY,
  client_id TEXT REFERENCES clients(id) ON DELETE SET NULL,
  name_type TEXT NOT NULL DEFAULT 'named' CHECK (name_type IN ('named','numbered')),
  distinctive TEXT,
  descriptive TEXT,
  legal_ending TEXT,
  legal_name TEXT,
  jurisdiction TEXT NOT NULL,
  corp_number TEXT,
  business_number TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  incorporation_date TEXT,
  fiscal_year_end TEXT,              -- "MM-DD"
  registered_office TEXT,
  mailing_address TEXT,
  nuans_number TEXT,
  nuans_date TEXT,
  business_activity TEXT,
  restrictions TEXT,
  min_directors INTEGER NOT NULL DEFAULT 1,
  max_directors INTEGER NOT NULL DEFAULT 10,
  notes TEXT,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX ix_companies_client ON companies(client_id);
CREATE INDEX ix_companies_status ON companies(status);

CREATE TABLE directors (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT,
  email TEXT,
  resident_canadian INTEGER NOT NULL DEFAULT 1,
  appointed_on TEXT,
  ceased_on TEXT
);
CREATE INDEX ix_directors_company ON directors(company_id);

CREATE TABLE officers (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  title TEXT NOT NULL,
  appointed_on TEXT,
  ceased_on TEXT
);
CREATE INDEX ix_officers_company ON officers(company_id);

CREATE TABLE share_classes (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  voting INTEGER NOT NULL DEFAULT 1,
  participating INTEGER NOT NULL DEFAULT 1,
  max_shares INTEGER,
  rights TEXT,
  sort INTEGER NOT NULL DEFAULT 0,
  UNIQUE (company_id, name)
);

CREATE TABLE shareholders (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'individual' CHECK (kind IN ('individual','corporation','trust')),
  address TEXT,
  email TEXT
);
CREATE INDEX ix_shareholders_company ON shareholders(company_id);

CREATE TABLE share_transactions (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  share_class_id TEXT NOT NULL REFERENCES share_classes(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('issuance','transfer','redemption')),
  from_shareholder_id TEXT REFERENCES shareholders(id) ON DELETE CASCADE,
  to_shareholder_id TEXT REFERENCES shareholders(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  price_per_share REAL NOT NULL DEFAULT 0,
  tx_date TEXT NOT NULL,
  certificate_number TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX ix_tx_company ON share_transactions(company_id);

CREATE TABLE resolutions (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  body_type TEXT NOT NULL CHECK (body_type IN ('directors','shareholders')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  resolution_date TEXT NOT NULL,
  signed_on TEXT,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX ix_resolutions_company ON resolutions(company_id);

CREATE TABLE business_names (
  id TEXT PRIMARY KEY,
  client_id TEXT REFERENCES clients(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  jurisdiction TEXT NOT NULL,
  registration_number TEXT,
  registered_on TEXT,
  expires_on TEXT,
  activity TEXT,
  address TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','expired','cancelled')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE compliance_items (
  id TEXT PRIMARY KEY,
  company_id TEXT REFERENCES companies(id) ON DELETE CASCADE,
  business_name_id TEXT REFERENCES business_names(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  due_date TEXT NOT NULL,
  completed_on TEXT,
  notes TEXT,
  auto INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX ux_compliance_company ON compliance_items(company_id, kind, due_date) WHERE company_id IS NOT NULL;
CREATE UNIQUE INDEX ux_compliance_bn ON compliance_items(business_name_id, kind, due_date) WHERE business_name_id IS NOT NULL;
CREATE INDEX ix_compliance_due ON compliance_items(due_date);

CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  company_id TEXT REFERENCES companies(id) ON DELETE CASCADE,
  client_id TEXT REFERENCES clients(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  due_date TEXT,
  assignee_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  done_at TEXT,
  sort INTEGER NOT NULL DEFAULT 0,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX ix_tasks_company ON tasks(company_id);

CREATE TABLE activity (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  company_id TEXT REFERENCES companies(id) ON DELETE CASCADE,
  client_id TEXT REFERENCES clients(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX ix_activity_created ON activity(created_at);
