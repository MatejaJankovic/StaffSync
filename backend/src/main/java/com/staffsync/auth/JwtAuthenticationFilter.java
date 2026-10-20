package com.staffsync.auth;

import java.io.IOException;
import java.util.List;

import com.staffsync.user.User;
import com.staffsync.user.UserRepository;
import io.jsonwebtoken.JwtException;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpHeaders;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Turns {@code Authorization: Bearer <token>} into an authenticated {@link AuthUser} with
 * the authority {@code ROLE_<ROLE>}. A missing or invalid token leaves the request
 * unauthenticated, so protected endpoints answer 401. So does a valid token whose user was
 * deleted or deactivated, or whose role changed, after the token was issued.
 */
public class JwtAuthenticationFilter extends OncePerRequestFilter {

	private static final String BEARER_PREFIX = "Bearer ";

	private final JwtService jwtService;

	private final UserRepository userRepository;

	public JwtAuthenticationFilter(JwtService jwtService, UserRepository userRepository) {
		this.jwtService = jwtService;
		this.userRepository = userRepository;
	}

	@Override
	protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
			throws ServletException, IOException {
		String header = request.getHeader(HttpHeaders.AUTHORIZATION);
		if (header != null && header.startsWith(BEARER_PREFIX)) {
			try {
				AuthUser user = jwtService.parse(header.substring(BEARER_PREFIX.length()).trim());
				if (isStillValid(user)) {
					var authentication = new UsernamePasswordAuthenticationToken(user, null,
							List.of(new SimpleGrantedAuthority("ROLE_" + user.role().name())));
					SecurityContextHolder.getContext().setAuthentication(authentication);
				}
				else {
					SecurityContextHolder.clearContext();
				}
			}
			catch (JwtException | IllegalArgumentException ex) {
				SecurityContextHolder.clearContext();
			}
		}
		chain.doFilter(request, response);
	}

	/** The token's user must still exist, be active and have the role the token claims. */
	private boolean isStillValid(AuthUser tokenUser) {
		return userRepository.findById(tokenUser.id())
			.filter(User::isActive)
			.map(user -> user.getRole() == tokenUser.role())
			.orElse(false);
	}

}
