package com.staffsync.auth;

import com.staffsync.auth.dto.LoginRequest;
import com.staffsync.auth.dto.LoginResponse;
import com.staffsync.user.User;
import com.staffsync.user.UserRepository;
import com.staffsync.user.dto.UserDto;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuthService {

	private final UserRepository userRepository;

	private final PasswordEncoder passwordEncoder;

	private final JwtService jwtService;

	/** Compared against when the email is unknown, so both paths take the same time. */
	private final String dummyHash;

	public AuthService(UserRepository userRepository, PasswordEncoder passwordEncoder, JwtService jwtService) {
		this.userRepository = userRepository;
		this.passwordEncoder = passwordEncoder;
		this.jwtService = jwtService;
		this.dummyHash = passwordEncoder.encode("dummy-password-for-timing");
	}

	/**
	 * Unknown email, wrong password and inactive user all fail the same way (T-27,
	 * T-37).
	 */
	@Transactional(readOnly = true)
	public LoginResponse login(LoginRequest request) {
		User user = userRepository.findByEmailIgnoreCase(request.email().trim()).orElse(null);
		String hash = (user != null) ? user.getPasswordHash() : dummyHash;
		boolean passwordMatches = passwordEncoder.matches(request.password(), hash);
		if (user == null || !passwordMatches || !user.isActive()) {
			throw new InvalidCredentialsException();
		}
		return new LoginResponse(jwtService.generateToken(user), UserDto.from(user));
	}

	/** The user behind a valid token; 401 if it was deleted or deactivated since. */
	@Transactional(readOnly = true)
	public UserDto me(AuthUser authUser) {
		return userRepository.findById(authUser.id())
			.filter(User::isActive)
			.map(UserDto::from)
			.orElseThrow(InvalidCredentialsException::new);
	}

}
