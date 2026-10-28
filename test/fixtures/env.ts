// The full stack (docker compose up --build). Override with API_URL=... or APP_URL=... if needed.
export const API_URL = process.env.API_URL ?? 'http://localhost:8080';
export const APP_URL = process.env.APP_URL ?? 'http://localhost:4200';
