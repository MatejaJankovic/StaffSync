// The seeded personas (dev profile, V2 and V8 in backend/src/main/resources/db/dev-seed).
// Every seeded account has the same password.
export const PASSWORD = 'Password123!';

export const users = {
  ana: { email: 'ana_pm@staffsync.local', firstName: 'Ana', lastName: 'Jovanovic', role: 'PM' },
  mateja: { email: 'mateja_pm@staffsync.local', firstName: 'Mateja', lastName: 'Jankovic', role: 'PM' },
  igor: { email: 'igor_rm@staffsync.local', firstName: 'Igor', lastName: 'Stankovic', role: 'RM' },
  lazar: { email: 'lazar_rm@staffsync.local', firstName: 'Lazar', lastName: 'Dunjic', role: 'RM' },
  maja: { email: 'maja_rm@staffsync.local', firstName: 'Maja', lastName: 'Kovacevic', role: 'RM' },
  marko: { email: 'marko_employee@staffsync.local', firstName: 'Marko', lastName: 'Nikolic', role: 'EMPLOYEE' },
  jelena: { email: 'jelena_employee@staffsync.local', firstName: 'Jelena', lastName: 'Petrovic', role: 'EMPLOYEE' },
  stefan: { email: 'stefan_employee@staffsync.local', firstName: 'Stefan', lastName: 'Milosevic', role: 'EMPLOYEE' },
  milica: { email: 'milica_employee@staffsync.local', firstName: 'Milica', lastName: 'Lazic', role: 'EMPLOYEE' },
  vukasin: { email: 'vukasin_admin@staffsync.local', firstName: 'Vukasin', lastName: 'Patkovic', role: 'ADMIN' },
} as const;

export type Persona = (typeof users)[keyof typeof users];

export function fullName(persona: Persona): string {
  return `${persona.firstName} ${persona.lastName}`;
}
