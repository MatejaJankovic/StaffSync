package com.staffsync.auth;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;

import javax.crypto.SecretKey;

import com.staffsync.user.Role;
import com.staffsync.user.User;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.stereotype.Service;

/**
 * Issues and verifies HS256 access tokens. There is no refresh token: a token is valid
 * for {@code staffsync.jwt.expiration} (8 h).
 */
@Service
public class JwtService {

	private static final String CLAIM_EMAIL = "email";

	private static final String CLAIM_ROLE = "role";

	private final JwtProperties properties;

	private final SecretKey key;

	public JwtService(JwtProperties properties) {
		this.properties = properties;
		// Throws WeakKeyException at startup if the secret is shorter than 256 bits
		this.key = Keys.hmacShaKeyFor(properties.secret().getBytes(StandardCharsets.UTF_8));
	}

	public String generateToken(User user) {
		Instant now = Instant.now();
		return Jwts.builder()
			.subject(String.valueOf(user.getId()))
			.claim(CLAIM_EMAIL, user.getEmail())
			.claim(CLAIM_ROLE, user.getRole().name())
			.issuedAt(Date.from(now))
			.expiration(Date.from(now.plus(properties.expiration())))
			.signWith(key, Jwts.SIG.HS256)
			.compact();
	}

	/**
	 * Verifies the signature and expiry of a token.
	 * @throws JwtException if the token is invalid, tampered with or expired
	 */
	public AuthUser parse(String token) {
		Claims claims = Jwts.parser().verifyWith(key).build().parseSignedClaims(token).getPayload();
		try {
			return new AuthUser(Long.valueOf(claims.getSubject()), claims.get(CLAIM_EMAIL, String.class),
					Role.valueOf(claims.get(CLAIM_ROLE, String.class)));
		}
		catch (RuntimeException ex) {
			throw new JwtException("Invalid token claims", ex);
		}
	}

}
