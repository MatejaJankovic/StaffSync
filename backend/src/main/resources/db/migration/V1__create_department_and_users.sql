CREATE TABLE department (
    id   BIGSERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE
);

-- "user" is a reserved word in PostgreSQL, hence "users"
CREATE TABLE users (
    id               BIGSERIAL PRIMARY KEY,
    email            VARCHAR(255) NOT NULL,
    password_hash    VARCHAR(100) NOT NULL,
    first_name       VARCHAR(100) NOT NULL,
    last_name        VARCHAR(100) NOT NULL,
    role             VARCHAR(20)  NOT NULL,
    department_id    BIGINT REFERENCES department (id),
    manager_id       BIGINT REFERENCES users (id),
    capacity_percent INTEGER      NOT NULL DEFAULT 100,
    seniority        VARCHAR(20),
    active           BOOLEAN      NOT NULL DEFAULT TRUE,
    CONSTRAINT chk_users_role CHECK (role IN ('EMPLOYEE', 'PM', 'RM', 'ADMIN')),
    CONSTRAINT chk_users_capacity CHECK (capacity_percent IN (100, 80, 50)),
    CONSTRAINT chk_users_seniority CHECK (seniority IN ('JUNIOR', 'MEDIOR', 'SENIOR'))
);

-- Login looks emails up case-insensitively, so Bob@x.com and bob@x.com must not both exist
CREATE UNIQUE INDEX uq_users_email_lower ON users (lower(email));
CREATE INDEX idx_users_department ON users (department_id);
CREATE INDEX idx_users_manager ON users (manager_id);
