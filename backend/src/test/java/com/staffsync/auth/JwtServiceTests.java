package com.staffsync.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.lang.reflect.Field;
import java.time.Duration;

import com.staffsync.user.Role;
import com.staffsync.user.User;
import io.jsonwebtoken.ExpiredJwtException;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.security.WeakKeyException;
import org.junit.jupiter.api.Test;

class JwtServiceTests {

	private static final String SECRET = "test-secret-that-is-long-enough-for-hs256-0123";

	private final JwtService jwtService = new JwtService(new JwtProperties(SECRET, Duration.ofHours(8)));

	@Test
	void tokenRoundTripsUserIdEmailAndRole() {
		String token = jwtService.generateToken(user(7L, "pm@staffsync.local", Role.PM));

		assertThat(jwtService.parse(token)).isEqualTo(new AuthUser(7L, "pm@staffsync.local", Role.PM));
	}

	@Test
	void expiredTokenIsRejected() {
		var expiring = new JwtService(new JwtProperties(SECRET, Duration.ofSeconds(-1)));
		String token = expiring.generateToken(user(1L, "admin@staffsync.local", Role.ADMIN));

		assertThatThrownBy(() -> jwtService.parse(token)).isInstanceOf(ExpiredJwtException.class);
	}

	@Test
	void tokenSignedWithAnotherKeyIsRejected() {
		var other = new JwtService(new JwtProperties("another-secret-that-is-long-enough-for-hs256", Duration.ofHours(8)));
		String token = other.generateToken(user(1L, "admin@staffsync.local", Role.ADMIN));

		assertThatThrownBy(() -> jwtService.parse(token)).isInstanceOf(JwtException.class);
	}

	@Test
	void garbageIsRejected() {
		assertThatThrownBy(() -> jwtService.parse("not-a-jwt")).isInstanceOf(JwtException.class);
	}

	@Test
	void shortSecretFailsFast() {
		assertThatThrownBy(() -> new JwtService(new JwtProperties("change-me", Duration.ofHours(8))))
			.isInstanceOf(WeakKeyException.class);
	}

	static User user(Long id, String email, Role role) {
		User user = new User(email, "hash", "First", "Last", role);
		try {
			Field idField = User.class.getDeclaredField("id");
			idField.setAccessible(true);
			idField.set(user, id);
		}
		catch (ReflectiveOperationException ex) {
			throw new IllegalStateException(ex);
		}
		return user;
	}

}
