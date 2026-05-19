CREATE TABLE IF NOT EXISTS customers (
  id BIGSERIAL PRIMARY KEY,
  calendar_id BIGINT NOT NULL REFERENCES calendars(id),
  name VARCHAR(100) NOT NULL,
  phone VARCHAR(30),
  remark TEXT,
  wechat VARCHAR(100),
  gender VARCHAR(20),
  address VARCHAR(255),
  last_appointment_at TIMESTAMP,
  appointment_count INT DEFAULT 0,
  created_by BIGINT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS uk_customers_calendar_phone
ON customers(calendar_id, phone)
WHERE deleted_at IS NULL AND phone IS NOT NULL AND phone <> '';

CREATE TABLE IF NOT EXISTS appointment_projects (
  id BIGSERIAL PRIMARY KEY,
  calendar_id BIGINT NOT NULL REFERENCES calendars(id),
  name VARCHAR(100) NOT NULL,
  usage_count INT DEFAULT 0,
  last_used_at TIMESTAMP,
  created_by BIGINT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS uk_appointment_projects_calendar_name
ON appointment_projects(calendar_id, name)
WHERE deleted_at IS NULL;

ALTER TABLE records ADD COLUMN IF NOT EXISTS customer_id BIGINT;
ALTER TABLE records ADD COLUMN IF NOT EXISTS customer_remark TEXT;
ALTER TABLE records ADD COLUMN IF NOT EXISTS project_id BIGINT;
