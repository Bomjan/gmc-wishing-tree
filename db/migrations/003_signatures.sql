CREATE TABLE IF NOT EXISTS signatures (
  id uuid PRIMARY KEY,
  idempotency_key uuid UNIQUE NOT NULL,
  request_hash text NOT NULL,
  token_hash text NOT NULL,
  username_hash text NOT NULL,
  data jsonb NOT NULL,
  section integer NOT NULL CHECK (section >= 0),
  state text NOT NULL CHECK (state IN ('pending', 'finalised', 'cancelled', 'removed')),
  undo_deadline timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS signatures_section ON signatures(section) WHERE state IN ('pending', 'finalised');
CREATE INDEX IF NOT EXISTS signatures_search ON signatures(username_hash, created_at DESC) WHERE state = 'finalised';
CREATE INDEX IF NOT EXISTS signatures_deadlines ON signatures(undo_deadline) WHERE state = 'pending';
CREATE TABLE IF NOT EXISTS signature_operator_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  signature_id uuid NOT NULL,
  removed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE signatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE signature_operator_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON signatures, signature_operator_audit FROM PUBLIC;
