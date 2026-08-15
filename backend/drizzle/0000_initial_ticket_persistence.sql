CREATE TYPE ticket_priority AS ENUM ('critical', 'high', 'medium', 'low');
CREATE TYPE ticket_status AS ENUM ('open', 'in_progress', 'resolved', 'closed');
CREATE TYPE ticket_processing_status AS ENUM ('pending', 'processing', 'processed', 'failed');
CREATE TYPE ticket_history_type AS ENUM ('created', 'status_changed', 'priority_changed');
CREATE TYPE ticket_history_source AS ENUM ('operator', 'system');
CREATE TYPE outbox_status AS ENUM ('pending', 'processing', 'published');

CREATE TABLE tickets (
  id uuid PRIMARY KEY,
  title varchar(120) NOT NULL,
  description varchar(2000) NOT NULL,
  requester_email varchar(320) NOT NULL,
  priority ticket_priority NOT NULL,
  status ticket_status NOT NULL DEFAULT 'open',
  processing_status ticket_processing_status NOT NULL DEFAULT 'pending',
  sla_due_at timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE ticket_history (
  id uuid PRIMARY KEY,
  ticket_id uuid NOT NULL REFERENCES tickets(id),
  type ticket_history_type NOT NULL,
  previous_value text,
  next_value text,
  source ticket_history_source NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE TABLE idempotency_keys (
  key text PRIMARY KEY,
  request_hash char(64) NOT NULL,
  ticket_id uuid NOT NULL UNIQUE REFERENCES tickets(id),
  created_at timestamptz NOT NULL
);

CREATE TABLE outbox_messages (
  id uuid PRIMARY KEY,
  ticket_id uuid NOT NULL REFERENCES tickets(id),
  processing_version integer NOT NULL CHECK (processing_version > 0),
  type text NOT NULL CHECK (type = 'ticket_sla'),
  payload jsonb NOT NULL,
  status outbox_status NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  locked_until timestamptz,
  published_at timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  UNIQUE (ticket_id, processing_version)
);

CREATE INDEX tickets_status_priority_idx ON tickets (status, priority);
CREATE INDEX tickets_created_at_id_idx ON tickets (created_at DESC, id DESC);
CREATE INDEX ticket_history_ticket_created_at_idx ON ticket_history (ticket_id, created_at ASC);
CREATE INDEX outbox_messages_pending_idx ON outbox_messages (status, created_at ASC) WHERE status = 'pending';

CREATE FUNCTION prevent_ticket_history_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'ticket_history is immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ticket_history_is_immutable
BEFORE UPDATE OR DELETE ON ticket_history
FOR EACH ROW EXECUTE FUNCTION prevent_ticket_history_mutation();
