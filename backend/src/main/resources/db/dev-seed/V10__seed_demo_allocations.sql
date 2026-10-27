-- Demo dataset (US-15), part 3: existing allocations, then the request statuses that follow from them.
-- Each allocation is proposed by its project's PM, and the decided ones by the employee's RM (BR-4, BR-5).
-- Nobody goes over capacity on any day (BR-1), and every period lies inside its request (BR-3).
--
-- What the §4 demo relies on:
--   Jelena: APPROVED 60% on Helios CRM until Nov 14, so on Nov 2-13 only 40% is free. The demo request
--           ranks her at 67 (availability 34), and approving her for the whole period fails (step 6).
--   Marko:  no allocation at all, so he is free Nov 1 - Jan 31 (availability 40, score 85) and the
--           change to 80% in step 8 fits.
--   Nikola, Luka and Milica are busy enough on the demo period to stay below Jelena (V8).
--   PROPOSED and CHANGE_PENDING rows belong to Lazar's and Maja's teams only, so Igor's Pending approvals
--   shows nothing but the live steps.
INSERT INTO allocation (request_id, employee_id, percent, start_date, end_date, status, proposed_by_id,
                        decided_by_id, created_at, decided_at, pending_percent, pending_start_date,
                        pending_end_date, change_reason)
SELECT r.id, e.id, v.percent, v.start_date::date, v.end_date::date, v.status, p.pm_id,
       CASE WHEN v.status <> 'PROPOSED' THEN e.manager_id END, v.created_at::timestamptz,
       v.decided_at::timestamptz, v.pending_percent, v.pending_start_date::date, v.pending_end_date::date,
       v.change_reason
FROM (VALUES
    ('Helios CRM', 'Backend Developer', 'jelena', 60, '2026-10-01', '2026-11-14', 'APPROVED',
     '2026-09-15 10:00+02', '2026-09-16 09:30+02', NULL::integer, NULL, NULL, NULL),
    ('Helios CRM', 'Senior Java Developer', 'nikola', 50, '2026-09-14', '2026-12-31', 'APPROVED',
     '2026-08-27 11:00+02', '2026-08-28 10:15+02', NULL, NULL, NULL, NULL),
    ('Helios CRM', 'Frontend Developer', 'filip', 100, '2026-10-01', '2027-02-26', 'APPROVED',
     '2026-09-10 15:00+02', '2026-09-11 09:00+02', NULL, NULL, NULL, NULL),
    ('Helios CRM', 'DevOps Engineer', 'milan', 30, '2026-09-01', '2027-02-26', 'APPROVED',
     '2026-08-21 09:30+02', '2026-08-21 16:45+02', NULL, NULL, NULL, NULL),
    ('Danube Payments Gateway', 'Java Backend Developer', 'luka', 50, '2026-10-05', '2026-12-18', 'APPROVED',
     '2026-09-17 10:20+02', '2026-09-18 08:50+02', NULL, NULL, NULL, NULL),
    ('Danube Payments Gateway', 'QA Automation Engineer', 'jovana', 50, '2026-10-12', '2027-03-31', 'APPROVED',
     '2026-09-24 13:10+02', '2026-09-25 11:00+02', NULL, NULL, NULL, NULL),
    ('Danube Payments Gateway', 'DevOps Engineer', 'tamara', 40, '2026-11-02', '2027-03-31', 'PROPOSED',
     '2026-10-22 11:00+02', NULL, NULL, NULL, NULL, NULL),
    ('Atlas Analytics Platform', 'Data Engineer', 'lena', 80, '2026-09-15', '2027-01-29', 'APPROVED',
     '2026-09-02 10:00+02', '2026-09-03 09:20+02', NULL, NULL, NULL, NULL),
    ('Atlas Analytics Platform', 'Junior Java Developer', 'milica', 50, '2026-12-01', '2027-01-29', 'APPROVED',
     '2026-10-13 09:45+02', '2026-10-14 10:30+02', NULL, NULL, NULL, NULL),
    ('Atlas Analytics Platform', 'Junior Java Developer', 'stefan', 50, '2026-11-02', '2027-01-29', 'PROPOSED',
     '2026-10-23 14:20+02', NULL, NULL, NULL, NULL, NULL),
    -- Started on Oct 1, so the pending change may move the end date but not the start (BR-15)
    ('Atlas Analytics Platform', 'Frontend Developer (React)', 'uros', 80, '2026-10-01', '2026-12-31',
     'CHANGE_PENDING', '2026-09-15 10:00+02', '2026-09-16 14:30+02', 80, '2026-10-01', '2027-01-29',
     'Vega Retail extended the reporting phase until the end of January'),
    ('Atlas Analytics Platform', 'QA Engineer', 'marija', 50, '2026-09-15', '2027-01-29', 'APPROVED',
     '2026-09-02 10:30+02', '2026-09-03 09:40+02', NULL, NULL, NULL, NULL),
    ('Nova HR Self-service', 'Angular Developer', 'teodora', 100, '2026-12-01', '2027-03-31', 'PROPOSED',
     '2026-10-26 09:40+02', NULL, NULL, NULL, NULL, NULL)
) AS v (project, title, employee, percent, start_date, end_date, status, created_at, decided_at,
        pending_percent, pending_start_date, pending_end_date, change_reason)
LEFT JOIN project p ON p.name = v.project
LEFT JOIN staffing_request r ON r.project_id = p.id AND r.title = v.title
LEFT JOIN users e ON e.email = v.employee || '_employee@staffsync.local';

-- BR-10 and BR-16: a request's status follows its number of active (APPROVED or CHANGE_PENDING) allocations
UPDATE staffing_request r
SET status = CASE
                 WHEN active.count = 0 THEN 'OPEN'
                 WHEN active.count < r.headcount THEN 'PARTIALLY_FILLED'
                 ELSE 'FILLED'
             END
FROM (SELECT sr.id, count(a.id) FILTER (WHERE a.status IN ('APPROVED', 'CHANGE_PENDING')) AS count
      FROM staffing_request sr
      LEFT JOIN allocation a ON a.request_id = sr.id
      GROUP BY sr.id) AS active
WHERE active.id = r.id
  AND r.status <> 'CANCELLED';
