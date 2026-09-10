CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  username VARCHAR(80) NOT NULL UNIQUE,
  email VARCHAR(180) UNIQUE,
  password_hash TEXT NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('admin','manager','implementer','viewer')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS responsaveis (
  id UUID PRIMARY KEY,
  name VARCHAR(120) NOT NULL UNIQUE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY,
  code VARCHAR(80) NOT NULL UNIQUE,
  name VARCHAR(180),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS implementations (
  id UUID PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES clients(id),
  responsible_id UUID REFERENCES responsaveis(id),
  system_name VARCHAR(160) NOT NULL DEFAULT '',
  function_name VARCHAR(160) NOT NULL DEFAULT '',
  status VARCHAR(30) NOT NULL DEFAULT 'Em andamento',
  pause_reason VARCHAR(120) NOT NULL DEFAULT '',
  start_date DATE NOT NULL,
  deadline DATE NOT NULL,
  completion_date DATE,
  details TEXT NOT NULL DEFAULT '',
  created_by UUID NOT NULL REFERENCES users(id),
  updated_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT valid_dates CHECK (deadline >= start_date),
  CONSTRAINT completion_date_valid CHECK (completion_date IS NULL OR completion_date >= start_date)
);

CREATE TABLE IF NOT EXISTS checklist_items (
  id UUID PRIMARY KEY,
  implementation_id UUID NOT NULL REFERENCES implementations(id) ON DELETE CASCADE,
  item VARCHAR(180) NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  completed_by UUID REFERENCES users(id),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS comments (
  id UUID PRIMARY KEY,
  implementation_id UUID NOT NULL REFERENCES implementations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  action VARCHAR(40) NOT NULL,
  entity VARCHAR(60) NOT NULL,
  entity_id UUID,
  field VARCHAR(80),
  old_value TEXT,
  new_value TEXT,
  ip_address INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_impl_status ON implementations(status);
CREATE INDEX IF NOT EXISTS idx_impl_responsible ON implementations(responsible_id);
CREATE INDEX IF NOT EXISTS idx_impl_client ON implementations(client_id);
CREATE INDEX IF NOT EXISTS idx_impl_deadline ON implementations(deadline);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity, entity_id);
