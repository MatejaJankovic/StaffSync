CREATE TABLE allocation (
    id                 BIGSERIAL PRIMARY KEY,
    request_id         BIGINT        NOT NULL REFERENCES staffing_request (id),
    employee_id        BIGINT        NOT NULL REFERENCES users (id),
    percent            INTEGER       NOT NULL,
    start_date         DATE          NOT NULL,
    end_date           DATE          NOT NULL,
    status             VARCHAR(20)   NOT NULL DEFAULT 'PROPOSED',
    proposed_by_id     BIGINT        NOT NULL REFERENCES users (id),
    decided_by_id      BIGINT        REFERENCES users (id),
    decision_comment   VARCHAR(1000),
    created_at         TIMESTAMPTZ   NOT NULL DEFAULT now(),
    decided_at         TIMESTAMPTZ,
    pending_percent    INTEGER,
    pending_start_date DATE,
    pending_end_date   DATE,
    change_reason      VARCHAR(1000),
    CONSTRAINT chk_allocation_percent CHECK (percent BETWEEN 10 AND 100 AND percent % 10 = 0),
    CONSTRAINT chk_allocation_dates CHECK (start_date <= end_date),
    CONSTRAINT chk_allocation_status CHECK (status IN ('PROPOSED', 'APPROVED', 'CHANGE_PENDING', 'REJECTED', 'CANCELLED')),
    CONSTRAINT chk_allocation_pending_percent CHECK (pending_percent IS NULL OR (pending_percent BETWEEN 10 AND 100 AND pending_percent % 10 = 0)),
    CONSTRAINT chk_allocation_pending_dates CHECK (pending_start_date IS NULL OR pending_end_date IS NULL OR pending_start_date <= pending_end_date)
);

-- The capacity query (§7) filters by employee and period
CREATE INDEX idx_allocation_employee_period ON allocation (employee_id, start_date, end_date);
CREATE INDEX idx_allocation_request ON allocation (request_id);
CREATE INDEX idx_allocation_status ON allocation (status);
