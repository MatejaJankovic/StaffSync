package com.staffsync.auth;

import com.staffsync.auth.dto.ChangePasswordRequest;
import com.staffsync.auth.dto.LoginRequest;
import com.staffsync.auth.dto.LoginResponse;
import com.staffsync.user.User;
import com.staffsync.user.UserRepository;
import com.staffsync.user.dto.ProfileDto;
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

	/**
	 * The user behind a valid token. The JWT filter already rejects deleted and deactivated
	 * users, so this only fails if that happens while the request is running.
	 */
	@Transactional(readOnly = true)
	public ProfileDto me(AuthUser authUser) {
		return userRepository.findById(authUser.id())
			.filter(User::isActive)
			.map(ProfileDto::from)
			.orElseThrow(SessionExpiredException::new);
	}

	/** Only ever changes the caller's own password: the id comes from the token. */
	@Transactional
	public void changePassword(AuthUser authUser, ChangePasswordRequest request) {
		User user = userRepository.findById(authUser.id())
			.filter(User::isActive)
			.orElseThrow(SessionExpiredException::new);
		if (!passwordEncoder.matches(request.oldPassword(), user.getPasswordHash())) {
			throw new WrongPasswordException();
		}
		user.setPasswordHash(passwordEncoder.encode(request.newPassword()));
	}

}
