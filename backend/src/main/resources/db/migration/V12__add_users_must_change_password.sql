-- A temporary password set by an Admin (a new account or a reset) must be replaced by the user's own at the
-- next login. Existing accounts keep the password they have.
ALTER TABLE users ADD COLUMN must_change_password BOOLEAN NOT NULL DEFAULT FALSE;
