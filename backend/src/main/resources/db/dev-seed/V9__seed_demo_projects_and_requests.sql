-- Demo dataset (US-15), part 2: 5 projects of the 3 PMs and their staffing requests.
-- Project Alpha is not seeded: Ana creates it live in the demo (§4 step 1). Orion Customer Portal is the
-- fallback: it already holds the exact §4 request, so the demo can jump to step 3 if creating it live fails.
-- Every request starts OPEN. V10 adds the allocations and then sets each status from them (BR-10).
-- As in V8, the lookups are LEFT JOINs, so a typo fails on a NOT NULL column.

INSERT INTO project (name, client, description, start_date, end_date, status, pm_id)
SELECT v.name, v.client, v.description, v.start_date::date, v.end_date::date, v.status, u.id
FROM (VALUES
    ('Helios CRM', 'Nordwind Logistics',
     'Customer relationship management for a logistics group: accounts, contracts and shipment tracking.',
     '2026-09-01', '2027-02-26', 'ACTIVE', 'mateja_pm'),
    ('Nova HR Self-service', 'Nova Insurance',
     'Employee portal for leave requests, payslips and personal data changes.',
     '2026-12-01', '2027-03-31', 'PLANNED', 'mateja_pm'),
    ('Danube Payments Gateway', 'Danube Bank',
     'Card and instant payment gateway with a merchant dashboard.',
     '2026-10-01', '2027-03-31', 'ACTIVE', 'ana_pm'),
    ('Orion Customer Portal', 'Orion Telecom',
     'Self-care portal for telecom subscribers: plans, invoices and support tickets.',
     '2026-11-01', '2027-03-31', 'PLANNED', 'ana_pm'),
    ('Atlas Analytics Platform', 'Vega Retail',
     'Sales and stock analytics for a retail chain, with a reporting web app.',
     '2026-09-15', '2027-01-29', 'ACTIVE', 'dragan_pm')
) AS v (name, client, description, start_date, end_date, status, pm)
LEFT JOIN users u ON u.email = v.pm || '@staffsync.local';

-- Titles are unique within a project, so V10 finds a request by project name and title
INSERT INTO staffing_request (project_id, title, seniority, allocation_percent, start_date, end_date, headcount,
                              created_at)
SELECT p.id, v.title, v.seniority, v.percent, v.start_date::date, v.end_date::date, v.headcount,
       v.created_at::timestamptz
FROM (VALUES
    ('Helios CRM',               'Backend Developer',          'MEDIOR', 60,  '2026-10-01', '2026-11-14', 1, '2026-09-10 09:00+02'),
    ('Helios CRM',               'Senior Java Developer',      'SENIOR', 50,  '2026-09-14', '2026-12-31', 2, '2026-08-25 10:30+02'),
    ('Helios CRM',               'Frontend Developer',         'MEDIOR', 100, '2026-10-01', '2027-02-26', 1, '2026-09-08 14:00+02'),
    ('Helios CRM',               'DevOps Engineer',            'SENIOR', 30,  '2026-09-01', '2027-02-26', 1, '2026-08-20 11:00+02'),
    ('Nova HR Self-service',     'Angular Developer',          'SENIOR', 100, '2026-12-01', '2027-03-31', 1, '2026-10-19 09:15+02'),
    ('Nova HR Self-service',     'Test Engineer',              'JUNIOR', 50,  '2026-12-01', '2027-03-31', 1, '2026-10-19 09:30+02'),
    ('Danube Payments Gateway',  'Java Backend Developer',     'SENIOR', 50,  '2026-10-05', '2026-12-18', 1, '2026-09-15 10:00+02'),
    ('Danube Payments Gateway',  'QA Automation Engineer',     'MEDIOR', 50,  '2026-10-12', '2027-03-31', 1, '2026-09-22 13:00+02'),
    ('Danube Payments Gateway',  'DevOps Engineer',            'MEDIOR', 40,  '2026-11-02', '2027-03-31', 1, '2026-10-20 15:45+02'),
    ('Orion Customer Portal',    'Java Developer',             'MEDIOR', 60,  '2026-11-01', '2027-01-31', 2, '2026-10-23 10:00+02'),
    ('Atlas Analytics Platform', 'Data Engineer',              'MEDIOR', 80,  '2026-09-15', '2027-01-29', 1, '2026-09-01 09:00+02'),
    ('Atlas Analytics Platform', 'Junior Java Developer',      'JUNIOR', 50,  '2026-11-02', '2027-01-29', 2, '2026-10-12 11:20+02'),
    ('Atlas Analytics Platform', 'Frontend Developer (React)', 'MEDIOR', 80,  '2026-10-01', '2027-01-29', 1, '2026-09-14 16:00+02'),
    ('Atlas Analytics Platform', 'QA Engineer',                'MEDIOR', 50,  '2026-09-15', '2027-01-29', 1, '2026-09-01 09:30+02')
) AS v (project, title, seniority, percent, start_date, end_date, headcount, created_at)
LEFT JOIN project p ON p.name = v.project;

INSERT INTO request_skill (request_id, skill_id, min_level, mandatory)
SELECT r.id, s.id, v.min_level, v.mandatory
FROM (VALUES
    ('Helios CRM',               'Backend Developer',          'Java',            3, TRUE),
    ('Helios CRM',               'Backend Developer',          'Spring',          3, TRUE),
    ('Helios CRM',               'Backend Developer',          'PostgreSQL',      2, FALSE),
    ('Helios CRM',               'Senior Java Developer',      'Java',            4, TRUE),
    ('Helios CRM',               'Senior Java Developer',      'Spring',          4, TRUE),
    ('Helios CRM',               'Senior Java Developer',      'Microservices',   3, FALSE),
    ('Helios CRM',               'Frontend Developer',         'Angular',         3, TRUE),
    ('Helios CRM',               'Frontend Developer',         'TypeScript',      3, TRUE),
    ('Helios CRM',               'Frontend Developer',         'HTML/CSS',        3, FALSE),
    ('Helios CRM',               'DevOps Engineer',            'Docker',          4, TRUE),
    ('Helios CRM',               'DevOps Engineer',            'Kubernetes',      3, TRUE),
    ('Helios CRM',               'DevOps Engineer',            'CI/CD',           3, FALSE),
    ('Nova HR Self-service',     'Angular Developer',          'Angular',         4, TRUE),
    ('Nova HR Self-service',     'Angular Developer',          'TypeScript',      4, TRUE),
    ('Nova HR Self-service',     'Angular Developer',          'HTML/CSS',        3, FALSE),
    ('Nova HR Self-service',     'Test Engineer',              'Test automation', 2, TRUE),
    ('Nova HR Self-service',     'Test Engineer',              'Playwright',      2, FALSE),
    ('Danube Payments Gateway',  'Java Backend Developer',     'Java',            4, TRUE),
    ('Danube Payments Gateway',  'Java Backend Developer',     'Spring',          3, TRUE),
    ('Danube Payments Gateway',  'Java Backend Developer',     'PostgreSQL',      3, FALSE),
    ('Danube Payments Gateway',  'QA Automation Engineer',     'Test automation', 3, TRUE),
    ('Danube Payments Gateway',  'QA Automation Engineer',     'REST Assured',    3, FALSE),
    ('Danube Payments Gateway',  'DevOps Engineer',            'Docker',          3, TRUE),
    ('Danube Payments Gateway',  'DevOps Engineer',            'Kubernetes',      3, TRUE),
    ('Danube Payments Gateway',  'DevOps Engineer',            'CI/CD',           3, FALSE),
    -- The §4 request, as in step 2
    ('Orion Customer Portal',    'Java Developer',             'Java',            4, TRUE),
    ('Orion Customer Portal',    'Java Developer',             'Spring',          3, TRUE),
    ('Orion Customer Portal',    'Java Developer',             'PostgreSQL',      2, FALSE),
    ('Atlas Analytics Platform', 'Data Engineer',              'Python',          3, TRUE),
    ('Atlas Analytics Platform', 'Data Engineer',              'SQL',             3, TRUE),
    ('Atlas Analytics Platform', 'Data Engineer',              'PostgreSQL',      2, FALSE),
    ('Atlas Analytics Platform', 'Junior Java Developer',      'Java',            3, TRUE),
    ('Atlas Analytics Platform', 'Junior Java Developer',      'Spring',          2, TRUE),
    ('Atlas Analytics Platform', 'Frontend Developer (React)', 'React',           3, TRUE),
    ('Atlas Analytics Platform', 'Frontend Developer (React)', 'JavaScript',      3, TRUE),
    ('Atlas Analytics Platform', 'Frontend Developer (React)', 'TypeScript',      2, FALSE),
    ('Atlas Analytics Platform', 'QA Engineer',                'Playwright',      3, TRUE),
    ('Atlas Analytics Platform', 'QA Engineer',                'Test automation', 3, FALSE)
) AS v (project, title, skill, min_level, mandatory)
LEFT JOIN project p ON p.name = v.project
LEFT JOIN staffing_request r ON r.project_id = p.id AND r.title = v.title
LEFT JOIN skill s ON s.name = v.skill;
