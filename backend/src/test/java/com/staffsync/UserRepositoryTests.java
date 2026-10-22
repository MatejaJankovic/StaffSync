package com.staffsync;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.staffsync.user.Role;
import com.staffsync.user.Seniority;
import com.staffsync.user.User;
import com.staffsync.user.UserRepository;
import org.hibernate.exception.ConstraintViolationException;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

@Import(TestcontainersConfiguration.class)
@ActiveProfiles("dev")
@SpringBootTest
@Transactional
class UserRepositoryTests {

	private static final String DEV_PASSWORD = "Password123!";

	@Autowired
	UserRepository userRepository;

	@Test
	void seedsOneActiveUserPerRole() {
		assertThat(userRepository.findAll())
			.filteredOn(User::isActive)
			.extracting(User::getRole)
			.contains(Role.ADMIN, Role.PM, Role.RM, Role.EMPLOYEE);
	}

	@Test
	void seededEmployeeIsManagedByTheSeededRm() {
		User employee = userRepository.findByEmailIgnoreCase("bogdan_employee@staffsync.local").orElseThrow();

		assertThat(employee.getManager().getEmail()).isEqualTo("lazar_rm@staffsync.local");
		assertThat(employee.getManager().getRole()).isEqualTo(Role.RM);
		assertThat(employee.getSeniority()).isEqualTo(Seniority.MEDIOR);
		assertThat(employee.getCapacityPercent()).isEqualTo(100);
		assertThat(employee.getDepartment().getName()).isEqualTo("Engineering");
	}

	@Test
	void seededPasswordsAreBcryptHashesOfTheDevPassword() {
		var encoder = new BCryptPasswordEncoder();
		for (String email : new String[] { "vukasin_admin@staffsync.local", "mateja_pm@staffsync.local", "lazar_rm@staffsync.local",
				"bogdan_employee@staffsync.local" }) {
			User user = userRepository.findByEmailIgnoreCase(email).orElseThrow();
			assertThat(user.getPasswordHash()).startsWith("$2a$");
			assertThat(encoder.matches(DEV_PASSWORD, user.getPasswordHash())).isTrue();
		}
	}

	@Test
	void findsUserByEmailIgnoringCase() {
		assertThat(userRepository.findByEmailIgnoreCase("Vukasin_ADMIN@StaffSync.local")).isPresent();
	}

	@Test
	void emailIsUniqueIgnoringCase() {
		User duplicate = new User("BOGDAN_EMPLOYEE@staffsync.local", "hash", "Other", "Person", Role.EMPLOYEE);

		// UserService tells a concurrent duplicate email from other violations by this name
		assertThatThrownBy(() -> userRepository.saveAndFlush(duplicate))
			.isInstanceOf(DataIntegrityViolationException.class)
			.cause()
			.isInstanceOfSatisfying(ConstraintViolationException.class,
					ex -> assertThat(ex.getConstraintName()).isEqualTo("uq_users_email_lower"));
	}

}
