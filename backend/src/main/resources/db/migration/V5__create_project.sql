CREATE TABLE project (
    id          BIGSERIAL PRIMARY KEY,
    name        VARCHAR(200) NOT NULL,
    client      VARCHAR(200) NOT NULL,
    description TEXT,
    start_date  DATE         NOT NULL,
    end_date    DATE         NOT NULL,
    status      VARCHAR(20)  NOT NULL DEFAULT 'PLANNED',
    pm_id       BIGINT       NOT NULL REFERENCES users (id),
    CONSTRAINT chk_project_status CHECK (status IN ('PLANNED', 'ACTIVE', 'COMPLETED', 'CANCELLED')),
    CONSTRAINT chk_project_dates CHECK (start_date <= end_date)
);

CREATE INDEX idx_project_pm ON project (pm_id);
CREATE INDEX idx_project_status ON project (status);
