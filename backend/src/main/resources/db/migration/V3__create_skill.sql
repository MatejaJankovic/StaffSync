CREATE TABLE skill (
    id       BIGSERIAL PRIMARY KEY,
    name     VARCHAR(100) NOT NULL,
    category VARCHAR(20)  NOT NULL,
    CONSTRAINT chk_skill_category CHECK (category IN ('BACKEND', 'FRONTEND', 'DATABASE', 'DEVOPS', 'QA', 'OTHER'))
);

-- Names are unique regardless of case, so "java" can't sit next to "Java"
CREATE UNIQUE INDEX uq_skill_name_lower ON skill (LOWER(name));

-- Seed catalog. Java, Spring and PostgreSQL are needed for the demo scenario (§4).
INSERT INTO skill (name, category) VALUES
    ('Java', 'BACKEND'),
    ('Spring', 'BACKEND'),
    ('Python', 'BACKEND'),
    ('Node.js', 'BACKEND'),
    ('C#', 'BACKEND'),
    ('Microservices', 'BACKEND'),
    ('Angular', 'FRONTEND'),
    ('TypeScript', 'FRONTEND'),
    ('JavaScript', 'FRONTEND'),
    ('React', 'FRONTEND'),
    ('HTML/CSS', 'FRONTEND'),
    ('PostgreSQL', 'DATABASE'),
    ('MySQL', 'DATABASE'),
    ('MongoDB', 'DATABASE'),
    ('SQL', 'DATABASE'),
    ('Docker', 'DEVOPS'),
    ('Kubernetes', 'DEVOPS'),
    ('Git', 'DEVOPS'),
    ('CI/CD', 'DEVOPS'),
    ('Test automation', 'QA'),
    ('Selenium', 'QA'),
    ('Playwright', 'QA'),
    ('REST Assured', 'QA'),
    ('Scrum', 'OTHER'),
    ('Technical writing', 'OTHER');
