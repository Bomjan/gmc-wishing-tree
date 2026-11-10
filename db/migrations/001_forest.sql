CREATE TABLE IF NOT EXISTS trees (
 id uuid PRIMARY KEY, ordinal bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
 seed integer NOT NULL, x double precision NOT NULL, z double precision NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS submissions (
 id uuid PRIMARY KEY, username text NOT NULL, username_normalized text NOT NULL,
 wish_ciphertext text, state text NOT NULL CHECK(state IN ('pending','finalised','cancelled')),
 moderation_status text NOT NULL CHECK(moderation_status IN ('accepted')),
 undo_deadline timestamptz NOT NULL, token_hash text NOT NULL,
 idempotency_key uuid NOT NULL UNIQUE, request_hash text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(username_normalized=lower(username)), CHECK(username ~ '^[A-Za-z0-9_]{3,24}$')
);
CREATE UNIQUE INDEX IF NOT EXISTS active_username ON submissions(username_normalized) WHERE state <> 'cancelled';
CREATE TABLE IF NOT EXISTS leaf_slots (
 submission_id uuid PRIMARY KEY REFERENCES submissions(id),
 tree_id uuid NOT NULL REFERENCES trees(id), slot integer NOT NULL CHECK(slot BETWEEN 0 AND 107),
 UNIQUE(tree_id,slot)
);
CREATE INDEX IF NOT EXISTS pending_deadlines ON submissions(undo_deadline) WHERE state='pending';
-- Public clients use the API, never Supabase's direct table API.
ALTER TABLE trees ENABLE ROW LEVEL SECURITY;
ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE leaf_slots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON trees, submissions, leaf_slots FROM PUBLIC;
