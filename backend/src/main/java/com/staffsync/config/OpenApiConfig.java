package com.staffsync.config;

import io.swagger.v3.oas.annotations.OpenAPIDefinition;
import io.swagger.v3.oas.annotations.enums.SecuritySchemeType;
import io.swagger.v3.oas.annotations.info.Info;
import io.swagger.v3.oas.annotations.security.SecurityScheme;
import org.springframework.context.annotation.Configuration;

/**
 * API title and version, and the JWT scheme behind Swagger UI's <em>Authorize</em> button.
 * Protected controllers reference it with {@code @SecurityRequirement(name = "bearerAuth")}.
 * The conventions every controller follows are in the README (API conventions).
 */
@Configuration
@OpenAPIDefinition(info = @Info(title = "StaffSync API", version = "v1"))
@SecurityScheme(name = OpenApiConfig.BEARER_AUTH, type = SecuritySchemeType.HTTP, scheme = "bearer",
		bearerFormat = "JWT")
public class OpenApiConfig {

	public static final String BEARER_AUTH = "bearerAuth";

}
