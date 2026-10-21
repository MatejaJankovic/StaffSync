-- No ON DELETE CASCADE: a rated skill can't be deleted from the catalog (409 SKILL_IN_USE),
-- and users are deactivated, never deleted
CREATE TABLE employee_skill (
    id                  BIGSERIAL PRIMARY KEY,
    user_id             BIGINT  NOT NULL REFERENCES users (id),
    skill_id            BIGINT  NOT NULL REFERENCES skill (id),
    level               INTEGER NOT NULL,
    years_of_experience INTEGER NOT NULL,
    CONSTRAINT chk_employee_skill_level CHECK (level BETWEEN 1 AND 5),
    CONSTRAINT chk_employee_skill_years CHECK (years_of_experience >= 0),
    -- An employee rates each skill once. The index behind it also serves lookups by user_id
    CONSTRAINT uq_employee_skill_user_skill UNIQUE (user_id, skill_id)
);

-- Matching and employee search look employees up by skill
CREATE INDEX idx_employee_skill_skill ON employee_skill (skill_id);
