# Build stage: compile and package the Spring Boot jar
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /build
COPY pom.xml .
RUN mvn -B -q dependency:go-offline
COPY src ./src
# Tests use Testcontainers (need Docker), so they run locally via `mvn verify`, not in the image build
RUN mvn -B -q package -DskipTests

# Runtime stage: JRE only
FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /build/target/staffsync-backend-*.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
