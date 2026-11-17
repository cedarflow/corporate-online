-- Sections modelled on Ownr: extra company identifiers, documents (R2), ISC register,
-- employees & contractors, convertibles (notes/SAFEs), and employee stock options.

ALTER TABLE companies ADD COLUMN gst_number TEXT;
ALTER TABLE companies ADD COLUMN payroll_number TEXT;
ALTER TABLE companies ADD COLUMN import_export_number TEXT;
ALTER TABLE companies ADD COLUMN records_office TEXT;
ALTER TABLE companies ADD COLUMN registry_password TEXT;      -- e.g. BC company password; shown masked
ALTER TABLE companies ADD COLUMN name_request_expires TEXT;
ALTER TABLE companies ADD COLUMN extra_info TEXT;
ALTER TABLE companies ADD COLUMN uncertificated INTEGER NOT NULL DEFAULT 0; -- shares evidenced by notice instead of certificate

-- Backdated history imported from other systems keeps its original timestamp.
-- (activity.created_at already accepts any value.)

CREATE TABLE documents (
  id TEXT PRIMARY KEY,
  company_id TEXT REFERENCES companies(id) ON DELETE CASCADE,
  client_id TEXT REFERENCES clients(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'other',
  file_key TEXT,            -- R2 object key for uploaded files
  file_name TEXT,
  content_type TEXT,
  size INTEGER,
  body TEXT,                -- generated documents (text) instead of a file
  template TEXT,
  doc_date TEXT,
  in_minute_book INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX ix_documents_company ON documents(company_id);

CREATE TABLE isc_individuals (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT,
  birth_date TEXT,
  tax_residence TEXT,
  control_description TEXT,
  became_on TEXT,
  ceased_on TEXT
);
CREATE INDEX ix_isc_company ON isc_individuals(company_id);

CREATE TABLE workers (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('employee','contractor')),
  name TEXT NOT NULL,
  email TEXT,
  title TEXT,
  start_date TEXT,
  end_date TEXT,
  compensation TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX ix_workers_company ON workers(company_id);

CREATE TABLE convertibles (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('note','safe')),
  certificate_number TEXT,
  investor TEXT NOT NULL,
  issue_date TEXT NOT NULL,
  amount REAL NOT NULL,
  interest_rate REAL,
  valuation_cap REAL,
  discount_rate REAL,
  maturity_date TEXT,
  status TEXT NOT NULL DEFAULT 'outstanding' CHECK (status IN ('outstanding','converted','repaid','cancelled')),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX ix_convertibles_company ON convertibles(company_id);

CREATE TABLE option_plans (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  share_class_id TEXT REFERENCES share_classes(id) ON DELETE SET NULL,
  pool_size INTEGER NOT NULL CHECK (pool_size > 0),
  approved_on TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE option_grants (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL REFERENCES option_plans(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  holder TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  exercise_price REAL NOT NULL DEFAULT 0,
  grant_date TEXT NOT NULL,
  vesting_start TEXT,
  vesting_months INTEGER NOT NULL DEFAULT 48,
  cliff_months INTEGER NOT NULL DEFAULT 12,
  expiry_date TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','exercised','cancelled','expired')),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX ix_grants_company ON option_grants(company_id);
