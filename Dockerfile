FROM eclipse-temurin:25-jdk-jammy AS build
WORKDIR /workspace
COPY .mvn .mvn
COPY mvnw pom.xml ./
COPY apps/catalog-api/pom.xml apps/catalog-api/pom.xml
COPY apps/catalog-api/src apps/catalog-api/src
RUN --mount=type=cache,target=/root/.m2 ./mvnw -B -ntp package -DskipTests

FROM eclipse-temurin:25-jre-jammy
RUN groupadd --gid 10001 catalog && useradd --uid 10001 --gid catalog --no-create-home catalog
WORKDIR /app
COPY --from=build --chown=10001:10001 /workspace/apps/catalog-api/target/catalog-api.jar app.jar
USER 10001:10001
EXPOSE 8080
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75", "-jar", "app.jar"]
