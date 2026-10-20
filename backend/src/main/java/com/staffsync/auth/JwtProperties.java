package com.staffsync.auth;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * JWT settings ({@code staffsync.jwt.*}). The secret comes from the {@code JWT_SECRET}
 * environment variable and must be at least 32 characters (256 bits) for HS256.
 */
@ConfigurationProperties("staffsync.jwt")
public record JwtProperties(String secret, Duration expiration) {

}
