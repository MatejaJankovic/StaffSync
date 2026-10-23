package com.staffsync.user;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.tuple;
import static org.mockito.Mockito.when;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import com.staffsync.allocation.AllocationRepository;
import com.staffsync.allocation.CapacityService;
import com.staffsync.auth.AuthUser;
import com.staffsync.department.Department;
import com.staffsync.department.DepartmentRepository;
import com.staffsync.department.dto.DepartmentDto;
import com.staffsync.user.dto.TeamMemberDto;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.util.ReflectionTestUtils;

/** Unit tests for {@link UserService#myTeam} (US-21). "Today" is Wednesday 4 Nov 2026. */
@ExtendWith(MockitoExtension.class)
class UserServiceTests {

	static final Long ME = 1L;

	static final LocalDate TODAY = LocalDate.of(2026, 11, 4);

	@Mock
	UserRepository userRepository;

	@Mock
	DepartmentRepository departmentRepository;

	@Mock
	AllocationRepository allocationRepository;

	@Mock
	CapacityService capacityService;

	@Mock
	PasswordEncoder passwordEncoder;

	@InjectMocks
	UserService userService;

	@Test
	void eachMemberHasTodaysLoadAndFreeCapacitySortedByName() {
		Department engineering = department(3L, "Engineering");
		User full = member(10L, "Ana", "Zoric", 100, engineering);
		User partTime = member(11L, "Marko", "Babic", 80, engineering);
		User half = member(12L, "Ena", "Babic", 50, null);
		when(userRepository.findByManagerIdAndActiveTrue(ME)).thenReturn(List.of(full, partTime, half));
		givenLoad(full, TODAY, 60);
		givenLoad(partTime, TODAY, 0);
		// Overbooked data shows as negative free capacity, as in CapacityService.getFreeCapacity
		givenLoad(half, TODAY, 70);

		assertThat(userService.myTeam(rm(), TODAY)).containsExactly(
				new TeamMemberDto(12L, "Ena", "Babic", Seniority.MEDIOR, null, 50, 70, -20),
				new TeamMemberDto(11L, "Marko", "Babic", Seniority.MEDIOR, new DepartmentDto(3L, "Engineering"), 80,
						0, 80),
				new TeamMemberDto(10L, "Ana", "Zoric", Seniority.MEDIOR, new DepartmentDto(3L, "Engineering"), 100,
						60, 40));
	}

	@Test
	void onAWeekendTheLoadIsTheNextMondays() {
		LocalDate saturday = LocalDate.of(2026, 11, 7);
		LocalDate monday = LocalDate.of(2026, 11, 9);
		User member = member(10L, "Ana", "Zoric", 100, null);
		when(userRepository.findByManagerIdAndActiveTrue(ME)).thenReturn(List.of(member));
		givenLoad(member, monday, 40);

		assertThat(userService.myTeam(rm(), saturday)).extracting(TeamMemberDto::load, TeamMemberDto::free)
			.containsExactly(tuple(40, 60));
	}

	@Test
	void anRmWithoutATeamGetsAnEmptyList() {
		when(userRepository.findByManagerIdAndActiveTrue(ME)).thenReturn(List.of());

		assertThat(userService.myTeam(rm(), TODAY)).isEmpty();
	}

	// ---- helpers

	private void givenLoad(User member, LocalDate day, int load) {
		when(capacityService.getDailyLoad(member.getId(), day, day, null)).thenReturn(Map.of(day, load));
	}

	private static AuthUser rm() {
		return new AuthUser(ME, "rm@staffsync.local", Role.RM);
	}

	private static User member(Long id, String firstName, String lastName, int capacityPercent,
			Department department) {
		User user = new User("member" + id + "@staffsync.local", "hash", firstName, lastName, Role.EMPLOYEE);
		ReflectionTestUtils.setField(user, "id", id);
		user.setSeniority(Seniority.MEDIOR);
		user.setCapacityPercent(capacityPercent);
		user.setDepartment(department);
		return user;
	}

	private static Department department(Long id, String name) {
		Department department = new Department(name);
		ReflectionTestUtils.setField(department, "id", id);
		return department;
	}

}
