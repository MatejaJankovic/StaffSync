CREATE TABLE staffing_request (
    id                 BIGSERIAL PRIMARY KEY,
    project_id         BIGINT       NOT NULL REFERENCES project (id),
    title              VARCHAR(200) NOT NULL,
    seniority          VARCHAR(20)  NOT NULL,
    allocation_percent INTEGER      NOT NULL,
    start_date         DATE         NOT NULL,
    end_date           DATE         NOT NULL,
    headcount          INTEGER      NOT NULL,
    status             VARCHAR(20)  NOT NULL DEFAULT 'OPEN',
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT chk_staffing_request_seniority CHECK (seniority IN ('JUNIOR', 'MEDIOR', 'SENIOR')),
    CONSTRAINT chk_staffing_request_percent CHECK (allocation_percent BETWEEN 10 AND 100 AND allocation_percent % 10 = 0),
    CONSTRAINT chk_staffing_request_headcount CHECK (headcount >= 1),
    CONSTRAINT chk_staffing_request_dates CHECK (start_date <= end_date),
    CONSTRAINT chk_staffing_request_status CHECK (status IN ('OPEN', 'PARTIALLY_FILLED', 'FILLED', 'CANCELLED'))
);

CREATE INDEX idx_staffing_request_project ON staffing_request (project_id);
CREATE INDEX idx_staffing_request_status ON staffing_request (status);

CREATE TABLE request_skill (
    id         BIGSERIAL PRIMARY KEY,
    request_id BIGINT   NOT NULL REFERENCES staffing_request (id),
    skill_id   BIGINT   NOT NULL REFERENCES skill (id),
    min_level  INTEGER  NOT NULL,
    mandatory  BOOLEAN  NOT NULL,
    CONSTRAINT chk_request_skill_level CHECK (min_level BETWEEN 1 AND 5),
    CONSTRAINT uq_request_skill UNIQUE (request_id, skill_id)
);

CREATE INDEX idx_request_skill_skill ON request_skill (skill_id);
