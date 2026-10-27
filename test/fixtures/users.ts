// The seeded personas (dev profile, V2 and V8 in backend/src/main/resources/db/dev-seed).
// Every seeded account has the same password.
export const PASSWORD = 'Password123!';

export const users = {
  ana: { email: 'ana_pm@staffsync.local', firstName: 'Ana', role: 'PM' },
  mateja: { email: 'mateja_pm@staffsync.local', firstName: 'Mateja', role: 'PM' },
  igor: { email: 'igor_rm@staffsync.local', firstName: 'Igor', role: 'RM' },
  lazar: { email: 'lazar_rm@staffsync.local', firstName: 'Lazar', role: 'RM' },
  marko: { email: 'marko_employee@staffsync.local', firstName: 'Marko', role: 'EMPLOYEE' },
  jelena: { email: 'jelena_employee@staffsync.local', firstName: 'Jelena', role: 'EMPLOYEE' },
  stefan: { email: 'stefan_employee@staffsync.local', firstName: 'Stefan', role: 'EMPLOYEE' },
  milica: { email: 'milica_employee@staffsync.local', firstName: 'Milica', role: 'EMPLOYEE' },
  vukasin: { email: 'vukasin_admin@staffsync.local', firstName: 'Vukasin', role: 'ADMIN' },
} as const;
