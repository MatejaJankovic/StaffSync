package com.staffsync.user;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.tuple;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.TreeMap;

import com.staffsync.allocation.AllocationRepository;
import com.staffsync.allocation.CapacityService;
import com.staffsync.auth.AuthUser;
import com.staffsync.common.BusinessException;
import com.staffsync.common.NotFoundException;
import com.staffsync.department.Department;
import com.staffsync.department.DepartmentRepository;
import com.staffsync.department.dto.DepartmentDto;
import com.staffsync.user.dto.AvailabilityDto;
import com.staffsync.user.dto.DayAvailabilityDto;
import com.staffsync.user.dto.TeamMemberDto;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * Unit tests for {@link UserService#myTeam} (US-21) and {@link UserService#availability} (US-16). "Today" is
 * Wednesday 4 Nov 2026.
 */
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

	// ---- US-16: availability

	@Test
	void availabilityHasTheLoadAndFreeCapacityOfEachWorkingDay() {
		LocalDate friday = LocalDate.of(2026, 11, 6);
		LocalDate monday = LocalDate.of(2026, 11, 9);
		User member = member(10L, "Ana", "Zoric", 80, null);
		when(userRepository.findById(10L)).thenReturn(Optional.of(member));
		Map<LocalDate, Integer> load = new TreeMap<>(Map.of(friday, 30, monday, 90));
		when(capacityService.getDailyLoad(10L, friday, monday, null)).thenReturn(load);
		// Free comes from CapacityService, not from its own capacity − load (§7). Strict stubs fail if it isn't asked
		Map<LocalDate, Integer> free = new TreeMap<>(Map.of(friday, 50, monday, -10));
		when(capacityService.getFreeCapacity(10L, friday, monday)).thenReturn(free);

		// Overbooked data shows as negative free capacity, as on My team
		assertThat(userService.availability(10L, friday, monday)).isEqualTo(new AvailabilityDto(10L, 80, friday,
				monday, List.of(new DayAvailabilityDto(friday, 30, 50), new DayAvailabilityDto(monday, 90, -10))));
	}

	@Test
	void availabilityChecksThePeriodBeforeLookingAnythingUp() {
		LocalDate from = LocalDate.of(2026, 11, 6);

		assertThatThrownBy(() -> userService.availability(10L, from, from.minusDays(1)))
			.isInstanceOf(BusinessException.class)
			.hasFieldOrPropertyWithValue("code", UserService.INVALID_PERIOD);
		assertThatThrownBy(() -> userService.availability(10L, from, from.plusYears(1).plusDays(1)))
			.isInstanceOf(BusinessException.class)
			.hasFieldOrPropertyWithValue("code", UserService.INVALID_PERIOD);
		verifyNoInteractions(userRepository, capacityService);
	}

	@Test
	void availabilityOfAnUnknownUserIsNotFound() {
		LocalDate from = LocalDate.of(2026, 11, 6);
		when(userRepository.findById(10L)).thenReturn(Optional.empty());

		assertThatThrownBy(() -> userService.availability(10L, from, from)).isInstanceOf(NotFoundException.class);
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
