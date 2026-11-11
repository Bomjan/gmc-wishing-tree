CREATE TABLE IF NOT EXISTS handprints (
 id uuid PRIMARY KEY, idempotency_key uuid UNIQUE NOT NULL, request_hash text NOT NULL,
 token_hash text NOT NULL, data jsonb NOT NULL,
 state text NOT NULL CHECK(state IN ('pending','finalised','cancelled','removed')),
 moderation_status text NOT NULL CHECK(moderation_status='accepted'),
 undo_deadline timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS handprint_deadlines ON handprints(undo_deadline) WHERE state='pending';
CREATE TABLE IF NOT EXISTS handprint_operator_audit(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, handprint_id uuid NOT NULL, removed_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE handprints ENABLE ROW LEVEL SECURITY;
ALTER TABLE handprint_operator_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON handprints,handprint_operator_audit FROM PUBLIC;
