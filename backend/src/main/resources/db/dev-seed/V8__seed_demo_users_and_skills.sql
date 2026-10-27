-- Demo dataset (US-15), part 1: departments, managers, employees and their skills.
-- Adds to the accounts from V2. Same dev password for everyone: Password123! (see README)
-- The §4 personas: Ana (PM), Igor (RM of Marko and Jelena), Marko and Jelena.
-- Lookups go through LEFT JOINs, so a typo in an email or a skill name hits a NOT NULL column and
-- the migration fails instead of silently dropping the row. department_id and manager_id are nullable,
-- so a typo there would leave them empty without an error: the check after the employees catches that.

INSERT INTO department (name) VALUES
    ('Backend'),
    ('Frontend'),
    ('QA & DevOps');

-- Project and resource managers first, because employees reference the RMs
INSERT INTO users (email, password_hash, first_name, last_name, role, department_id, capacity_percent, active)
SELECT v.email, '$2a$10$ybr6.XaoRFkt4eo1JfT3l.Fcx4L/86juqsVrnasX9XUCyDuvZVpAK', v.first_name, v.last_name, v.role,
       d.id, 100, TRUE
FROM (VALUES
    ('ana_pm@staffsync.local',    'Ana',    'Jovanovic',  'PM', 'Engineering'),
    ('dragan_pm@staffsync.local', 'Dragan', 'Simic',      'PM', 'Engineering'),
    ('igor_rm@staffsync.local',   'Igor',   'Stankovic',  'RM', 'Backend'),
    ('maja_rm@staffsync.local',   'Maja',   'Kovacevic',  'RM', 'Frontend')
) AS v (email, first_name, last_name, role, department)
LEFT JOIN department d ON d.name = v.department;

-- Igor manages the backend people, Maja frontend and QA, Lazar (V2) the rest.
-- Mostly full time; 80% and 50% are part-time contracts.
INSERT INTO users (email, password_hash, first_name, last_name, role, department_id, manager_id,
                   capacity_percent, seniority, active)
SELECT v.email, '$2a$10$ybr6.XaoRFkt4eo1JfT3l.Fcx4L/86juqsVrnasX9XUCyDuvZVpAK', v.first_name, v.last_name,
       'EMPLOYEE', d.id, m.id, v.capacity, v.seniority, TRUE
FROM (VALUES
    -- Backend
    ('marko_employee@staffsync.local',      'Marko',      'Nikolic',     'Backend',     'igor_rm',  100, 'SENIOR'),
    ('jelena_employee@staffsync.local',     'Jelena',     'Petrovic',    'Backend',     'igor_rm',  100, 'MEDIOR'),
    ('nikola_employee@staffsync.local',     'Nikola',     'Djordjevic',  'Backend',     'igor_rm',  100, 'SENIOR'),
    ('luka_employee@staffsync.local',       'Luka',       'Popovic',     'Backend',     'igor_rm',  100, 'SENIOR'),
    ('aleksandar_employee@staffsync.local', 'Aleksandar', 'Ristic',      'Backend',     'igor_rm',  100, 'MEDIOR'),
    ('nemanja_employee@staffsync.local',    'Nemanja',    'Pavlovic',    'Backend',     'igor_rm',  100, 'JUNIOR'),
    ('vladimir_employee@staffsync.local',   'Vladimir',   'Tomic',       'Backend',     'igor_rm',  100, 'SENIOR'),
    ('stefan_employee@staffsync.local',     'Stefan',     'Milosevic',   'Backend',     'lazar_rm',  50, 'MEDIOR'),
    ('milica_employee@staffsync.local',     'Milica',     'Lazic',       'Backend',     'lazar_rm',  80, 'JUNIOR'),
    ('ivana_employee@staffsync.local',      'Ivana',      'Markovic',    'Backend',     'lazar_rm', 100, 'MEDIOR'),
    -- Frontend
    ('teodora_employee@staffsync.local',    'Teodora',    'Ilic',        'Frontend',    'maja_rm',  100, 'SENIOR'),
    ('filip_employee@staffsync.local',      'Filip',      'Kostic',      'Frontend',    'maja_rm',  100, 'MEDIOR'),
    ('sara_employee@staffsync.local',       'Sara',       'Mitrovic',    'Frontend',    'maja_rm',  100, 'JUNIOR'),
    ('uros_employee@staffsync.local',       'Uros',       'Zivkovic',    'Frontend',    'maja_rm',   80, 'MEDIOR'),
    ('katarina_employee@staffsync.local',   'Katarina',   'Stojanovic',  'Frontend',    'maja_rm',   50, 'SENIOR'),
    ('mina_employee@staffsync.local',       'Mina',       'Todorovic',   'Frontend',    'maja_rm',  100, 'JUNIOR'),
    ('dusan_employee@staffsync.local',      'Dusan',      'Obradovic',   'Frontend',    'lazar_rm', 100, 'MEDIOR'),
    -- QA & DevOps
    ('jovana_employee@staffsync.local',     'Jovana',     'Savic',       'QA & DevOps', 'maja_rm',  100, 'SENIOR'),
    ('marija_employee@staffsync.local',     'Marija',     'Bogdanovic',  'QA & DevOps', 'maja_rm',  100, 'MEDIOR'),
    ('ognjen_employee@staffsync.local',     'Ognjen',     'Vasic',       'QA & DevOps', 'maja_rm',   50, 'JUNIOR'),
    ('milan_employee@staffsync.local',      'Milan',      'Cvetkovic',   'QA & DevOps', 'lazar_rm', 100, 'SENIOR'),
    ('tamara_employee@staffsync.local',     'Tamara',     'Antic',       'QA & DevOps', 'lazar_rm',  80, 'MEDIOR'),
    ('djordje_employee@staffsync.local',    'Djordje',    'Radovanovic', 'QA & DevOps', 'lazar_rm', 100, 'JUNIOR'),
    -- Engineering (alongside bogdan_employee from V2)
    ('lena_employee@staffsync.local',       'Lena',       'Grujic',      'Engineering', 'igor_rm',  100, 'MEDIOR'),
    ('vuk_employee@staffsync.local',        'Vuk',        'Krstic',      'Engineering', 'igor_rm',   80, 'SENIOR'),
    ('nina_employee@staffsync.local',       'Nina',       'Arsic',       'Engineering', 'igor_rm',  100, 'MEDIOR'),
    ('petar_employee@staffsync.local',      'Petar',      'Jovic',       'Engineering', 'lazar_rm',  80, 'SENIOR'),
    ('andjela_employee@staffsync.local',    'Andjela',    'Pesic',       'Engineering', 'lazar_rm', 100, 'JUNIOR'),
    ('bojan_employee@staffsync.local',      'Bojan',      'Lukic',       'Engineering', 'maja_rm',   50, 'MEDIOR')
) AS v (email, first_name, last_name, department, manager, capacity, seniority)
LEFT JOIN department d ON d.name = v.department
LEFT JOIN users m ON m.email = v.manager || '@staffsync.local';

-- A typo in a department or a manager would otherwise only show up as a person without a team in the demo
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM users WHERE role IN ('PM', 'RM', 'EMPLOYEE') AND department_id IS NULL)
       OR EXISTS (SELECT 1 FROM users WHERE role = 'EMPLOYEE' AND manager_id IS NULL) THEN
        RAISE EXCEPTION 'Demo seed: a PM, RM or employee has no department, or an employee has no manager';
    END IF;
END $$;

-- The §4 request asks for Java >= 4 and Spring >= 3 (required) and PostgreSQL >= 2 (nice to have).
-- Marko scores 85 and Jelena 67. Everyone else who passes the filter (Nikola, Luka, Stefan, Milica) stays
-- below 67 because of their load or capacity (V10). Aleksandar, Nemanja, Vuk, Petar, Dusan, Bogdan and Jovana
-- know some Java or Spring, but not enough, so the filter removes them.
INSERT INTO employee_skill (user_id, skill_id, level, years_of_experience)
SELECT u.id, s.id, v.level, v.years
FROM (VALUES
    ('marko',      'Java', 5, 9), ('marko', 'Spring', 4, 7), ('marko', 'PostgreSQL', 3, 5),
    ('marko',      'Microservices', 3, 3), ('marko', 'Docker', 3, 3), ('marko', 'Git', 4, 9),
    ('jelena',     'Java', 4, 4), ('jelena', 'Spring', 3, 3), ('jelena', 'MongoDB', 3, 2),
    ('jelena',     'Git', 3, 4), ('jelena', 'Angular', 2, 1),
    ('nikola',     'Java', 5, 10), ('nikola', 'Spring', 5, 8), ('nikola', 'PostgreSQL', 4, 7),
    ('nikola',     'Microservices', 4, 5), ('nikola', 'Kubernetes', 2, 2),
    ('luka',       'Java', 4, 7), ('luka', 'Spring', 3, 5), ('luka', 'PostgreSQL', 3, 6),
    ('luka',       'SQL', 4, 8), ('luka', 'C#', 3, 3),
    ('aleksandar', 'Java', 3, 3), ('aleksandar', 'Spring', 3, 2), ('aleksandar', 'PostgreSQL', 4, 4),
    ('aleksandar', 'Docker', 2, 1),
    ('nemanja',    'Java', 2, 1), ('nemanja', 'Spring', 2, 1), ('nemanja', 'SQL', 2, 1), ('nemanja', 'Git', 2, 1),
    ('vladimir',   'Python', 5, 9), ('vladimir', 'PostgreSQL', 4, 8), ('vladimir', 'Docker', 3, 4),
    ('vladimir',   'Microservices', 3, 3),
    ('stefan',     'Java', 4, 5), ('stefan', 'Spring', 4, 4), ('stefan', 'PostgreSQL', 2, 2),
    ('stefan',     'Git', 3, 5),
    ('milica',     'Java', 4, 2), ('milica', 'Spring', 3, 2), ('milica', 'PostgreSQL', 1, 1),
    ('milica',     'Git', 3, 2),
    ('ivana',      'C#', 4, 5), ('ivana', 'SQL', 4, 5), ('ivana', 'MySQL', 3, 4), ('ivana', 'Microservices', 2, 1),
    ('teodora',    'Angular', 5, 7), ('teodora', 'TypeScript', 5, 7), ('teodora', 'HTML/CSS', 5, 9),
    ('teodora',    'JavaScript', 5, 9), ('teodora', 'React', 3, 2),
    ('filip',      'Angular', 4, 4), ('filip', 'TypeScript', 4, 4), ('filip', 'HTML/CSS', 4, 5),
    ('filip',      'JavaScript', 4, 5),
    ('sara',       'Angular', 2, 1), ('sara', 'TypeScript', 2, 1), ('sara', 'HTML/CSS', 3, 2),
    ('sara',       'JavaScript', 3, 2),
    ('uros',       'React', 4, 4), ('uros', 'JavaScript', 4, 5), ('uros', 'TypeScript', 3, 3),
    ('uros',       'HTML/CSS', 4, 5), ('uros', 'Node.js', 2, 1),
    ('katarina',   'React', 5, 6), ('katarina', 'Angular', 4, 5), ('katarina', 'TypeScript', 5, 6),
    ('katarina',   'JavaScript', 5, 8), ('katarina', 'HTML/CSS', 4, 8),
    ('mina',       'HTML/CSS', 3, 1), ('mina', 'JavaScript', 2, 1), ('mina', 'React', 2, 1),
    ('dusan',      'Angular', 3, 3), ('dusan', 'TypeScript', 3, 3), ('dusan', 'Java', 2, 2), ('dusan', 'Spring', 2, 1),
    ('jovana',     'Test automation', 5, 8), ('jovana', 'Selenium', 4, 6), ('jovana', 'Playwright', 4, 3),
    ('jovana',     'REST Assured', 4, 5), ('jovana', 'Java', 3, 5),
    ('marija',     'Playwright', 4, 3), ('marija', 'Test automation', 4, 4), ('marija', 'TypeScript', 3, 3),
    ('marija',     'Scrum', 3, 3),
    ('ognjen',     'Selenium', 2, 1), ('ognjen', 'Test automation', 2, 1), ('ognjen', 'Technical writing', 3, 2),
    ('milan',      'Docker', 5, 7), ('milan', 'Kubernetes', 4, 5), ('milan', 'CI/CD', 5, 8), ('milan', 'Git', 5, 10),
    ('milan',      'PostgreSQL', 3, 5),
    ('tamara',     'Docker', 4, 4), ('tamara', 'CI/CD', 4, 4), ('tamara', 'Kubernetes', 3, 2), ('tamara', 'Python', 3, 3),
    ('djordje',    'Docker', 2, 1), ('djordje', 'Git', 3, 2), ('djordje', 'CI/CD', 2, 1),
    ('lena',       'Python', 4, 5), ('lena', 'PostgreSQL', 3, 4), ('lena', 'SQL', 4, 5), ('lena', 'MongoDB', 2, 2),
    ('vuk',        'Java', 4, 8), ('vuk', 'Spring', 2, 2), ('vuk', 'Microservices', 4, 5), ('vuk', 'Kubernetes', 3, 3),
    ('nina',       'Node.js', 4, 4), ('nina', 'TypeScript', 4, 4), ('nina', 'Angular', 3, 3), ('nina', 'PostgreSQL', 3, 3),
    ('petar',      'Node.js', 5, 8), ('petar', 'TypeScript', 5, 7), ('petar', 'MongoDB', 4, 6), ('petar', 'Docker', 3, 4),
    ('petar',      'Java', 3, 4),
    ('andjela',    'JavaScript', 3, 2), ('andjela', 'Node.js', 3, 1), ('andjela', 'MongoDB', 2, 1), ('andjela', 'Git', 2, 1),
    ('bojan',      'Scrum', 4, 6), ('bojan', 'Technical writing', 4, 5), ('bojan', 'SQL', 3, 4),
    ('bogdan',     'Java', 3, 3), ('bogdan', 'Spring', 3, 3), ('bogdan', 'Angular', 4, 3),
    ('bogdan',     'TypeScript', 4, 3), ('bogdan', 'Docker', 3, 2)
) AS v (first_name, skill, level, years)
LEFT JOIN users u ON u.email = v.first_name || '_employee@staffsync.local'
LEFT JOIN skill s ON s.name = v.skill;
