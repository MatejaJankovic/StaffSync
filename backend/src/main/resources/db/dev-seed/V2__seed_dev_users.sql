-- One account per role so everyone can log in from day 1.
-- Dev password for all of them: Password123! (see README)
INSERT INTO department (name) VALUES ('Engineering');

INSERT INTO users (email, password_hash, first_name, last_name, role, department_id, capacity_percent, active)
VALUES ('vukasin_admin@staffsync.local', '$2a$10$ybr6.XaoRFkt4eo1JfT3l.Fcx4L/86juqsVrnasX9XUCyDuvZVpAK',
        'Vukasin', 'Patkovic', 'ADMIN', NULL, 100, TRUE);

INSERT INTO users (email, password_hash, first_name, last_name, role, department_id, capacity_percent, active)
VALUES ('mateja_pm@staffsync.local', '$2a$10$ybr6.XaoRFkt4eo1JfT3l.Fcx4L/86juqsVrnasX9XUCyDuvZVpAK',
        'Mateja', 'Jankovic', 'PM', (SELECT id FROM department WHERE name = 'Engineering'), 100, TRUE);

INSERT INTO users (email, password_hash, first_name, last_name, role, department_id, capacity_percent, active)
VALUES ('lazar_rm@staffsync.local', '$2a$10$ybr6.XaoRFkt4eo1JfT3l.Fcx4L/86juqsVrnasX9XUCyDuvZVpAK',
        'Lazar', 'Dunjic', 'RM', (SELECT id FROM department WHERE name = 'Engineering'), 100, TRUE);

INSERT INTO users (email, password_hash, first_name, last_name, role, department_id, manager_id,
                   capacity_percent, seniority, active)
VALUES ('bogdan_employee@staffsync.local', '$2a$10$ybr6.XaoRFkt4eo1JfT3l.Fcx4L/86juqsVrnasX9XUCyDuvZVpAK',
        'Bogdan', 'Vujic', 'EMPLOYEE', (SELECT id FROM department WHERE name = 'Engineering'),
        (SELECT id FROM users WHERE email = 'lazar_rm@staffsync.local'), 100, 'MEDIOR', TRUE);
