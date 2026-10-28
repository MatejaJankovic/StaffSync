-- When the PM asked for the pending change (BR-15), so Pending approvals can list a change by how long it has
-- been waiting rather than by when the allocation was first proposed. NULL while no change is pending.
ALTER TABLE allocation ADD COLUMN change_requested_at TIMESTAMPTZ;
