@echo off
rem Starts the backend locally against the docker-compose Postgres (docker compose up -d db).
rem Uses JDK 21 if JAVA_HOME is not already set.
if not defined JAVA_HOME (
  for /d %%d in ("C:\Program Files\Eclipse Adoptium\jdk-21*") do set "JAVA_HOME=%%d"
)
rem The dev profile provides the local JWT secret and the seeded dev accounts.
if not defined SPRING_PROFILES_ACTIVE set "SPRING_PROFILES_ACTIVE=dev"
set "BACKEND_DIR=%~dp0"
cd /d "%BACKEND_DIR%"
call "%BACKEND_DIR%mvnw.cmd" spring-boot:run %*
