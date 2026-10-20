-- One account per role so everyone can log in from day 1.
-- Dev password for all of them: Password123! (see README)
INSERT INTO department (name) VALUES ('Engineering');

INSERT INTO users (email, password_hash, first_name, last_name, role, department_id, capacity_percent, active)
VALUES ('admin@staffsync.local', '$2a$10$ybr6.XaoRFkt4eo1JfT3l.Fcx4L/86juqsVrnasX9XUCyDuvZVpAK',
        'Admin', 'User', 'ADMIN', NULL, 100, TRUE);

INSERT INTO users (email, password_hash, first_name, last_name, role, department_id, capacity_percent, active)
VALUES ('pm@staffsync.local', '$2a$10$ybr6.XaoRFkt4eo1JfT3l.Fcx4L/86juqsVrnasX9XUCyDuvZVpAK',
        'Ana', 'Project', 'PM', (SELECT id FROM department WHERE name = 'Engineering'), 100, TRUE);

INSERT INTO users (email, password_hash, first_name, last_name, role, department_id, capacity_percent, active)
VALUES ('rm@staffsync.local', '$2a$10$ybr6.XaoRFkt4eo1JfT3l.Fcx4L/86juqsVrnasX9XUCyDuvZVpAK',
        'Igor', 'Resource', 'RM', (SELECT id FROM department WHERE name = 'Engineering'), 100, TRUE);

INSERT INTO users (email, password_hash, first_name, last_name, role, department_id, manager_id,
                   capacity_percent, seniority, active)
VALUES ('employee@staffsync.local', '$2a$10$ybr6.XaoRFkt4eo1JfT3l.Fcx4L/86juqsVrnasX9XUCyDuvZVpAK',
        'Marko', 'Employee', 'EMPLOYEE', (SELECT id FROM department WHERE name = 'Engineering'),
        (SELECT id FROM users WHERE email = 'rm@staffsync.local'), 100, 'MEDIOR', TRUE);
