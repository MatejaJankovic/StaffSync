package com.staffsync.employeeskill;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import com.staffsync.allocation.Allocation;
import com.staffsync.allocation.AllocationRepository;
import com.staffsync.allocation.AllocationStatus;
import com.staffsync.common.BusinessException;
import com.staffsync.common.NotFoundException;
import com.staffsync.employeeskill.dto.EmployeeSkillRequest;
import com.staffsync.project.Project;
import com.staffsync.request.RequestSkill;
import com.staffsync.request.StaffingRequest;
import com.staffsync.skill.Skill;
import com.staffsync.skill.SkillRepository;
import com.staffsync.user.User;
import com.staffsync.user.UserRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;

@ExtendWith(MockitoExtension.class)
class EmployeeSkillServiceTests {

	private static final Long USER_ID = 4L;

	@Mock
	EmployeeSkillRepository employeeSkillRepository;

	@Mock
	UserRepository userRepository;

	@Mock
	SkillRepository skillRepository;

	@Mock
	AllocationRepository allocationRepository;

	@InjectMocks
	EmployeeSkillService employeeSkillService;

	@Test
	void replaceUpdatesKeptSkillsDeletesDroppedOnesAndInsertsNewOnes() {
		User user = mock(User.class);
		Skill java = skill(1L);
		Skill spring = skill(2L);
		Skill sql = skill(3L);
		EmployeeSkill keptJava = new EmployeeSkill(user, java, 2, 1);
		EmployeeSkill droppedSpring = new EmployeeSkill(user, spring, 3, 2);
		when(userRepository.findById(USER_ID)).thenReturn(Optional.of(user));
		when(skillRepository.findAllById(Set.of(1L, 3L))).thenReturn(List.of(java, sql));
		when(employeeSkillRepository.findByUserIdOrderBySkillCategoryAscSkillNameAsc(USER_ID))
			.thenReturn(List.of(keptJava, droppedSpring));

		employeeSkillService.replace(USER_ID,
				List.of(new EmployeeSkillRequest(1L, 5, 4), new EmployeeSkillRequest(3L, 2, 0)));

		assertThat(keptJava.getLevel()).isEqualTo(5);
		assertThat(keptJava.getYearsOfExperience()).isEqualTo(4);
		verify(employeeSkillRepository).delete(droppedSpring);
		ArgumentCaptor<EmployeeSkill> inserted = ArgumentCaptor.forClass(EmployeeSkill.class);
		verify(employeeSkillRepository).save(inserted.capture());
		assertThat(inserted.getValue().getSkill()).isSameAs(sql);
		assertThat(inserted.getValue().getLevel()).isEqualTo(2);
	}

	@Test
	void replaceRejectsTheSameSkillTwiceWithoutChangingAnything() {
		when(userRepository.findById(USER_ID)).thenReturn(Optional.of(mock(User.class)));

		assertThatThrownBy(() -> employeeSkillService.replace(USER_ID,
				List.of(new EmployeeSkillRequest(1L, 3, 1), new EmployeeSkillRequest(1L, 4, 2))))
			.isInstanceOfSatisfying(BusinessException.class, ex -> {
				assertThat(ex.getStatus()).isEqualTo(HttpStatus.BAD_REQUEST);
				assertThat(ex.getCode()).isEqualTo("DUPLICATE_SKILL");
				assertThat(ex.getDetails()).isEqualTo(List.of(1L));
			});
		verify(employeeSkillRepository, never()).save(any());
		verify(employeeSkillRepository, never()).delete(any());
	}

	@Test
	void replaceRejectsSkillsThatAreNotInTheCatalog() {
		Skill java = skill(1L);
		when(userRepository.findById(USER_ID)).thenReturn(Optional.of(mock(User.class)));
		when(skillRepository.findAllById(Set.of(1L, 99L))).thenReturn(List.of(java));

		assertThatThrownBy(() -> employeeSkillService.replace(USER_ID,
				List.of(new EmployeeSkillRequest(1L, 3, 1), new EmployeeSkillRequest(99L, 4, 2))))
			.isInstanceOfSatisfying(BusinessException.class, ex -> {
				assertThat(ex.getCode()).isEqualTo("UNKNOWN_SKILL");
				assertThat(ex.getDetails()).isEqualTo(List.of(99L));
			});
		verify(employeeSkillRepository, never()).save(any());
	}

	@Test
	void aSkillThatACurrentAllocationRequiresCannotBeLoweredBelowItsMinimum() {
		User user = mock(User.class);
		Skill java = skill(1L);
		when(java.getName()).thenReturn("Java");
		when(userRepository.findById(USER_ID)).thenReturn(Optional.of(user));
		when(skillRepository.findAllById(Set.of(1L))).thenReturn(List.of(java));
		// Java 4 meets the request's Java ≥ 4; the edit lowers it to 3
		when(employeeSkillRepository.findByUserIdOrderBySkillCategoryAscSkillNameAsc(USER_ID))
			.thenReturn(List.of(new EmployeeSkill(user, java, 4, 2)));
		Allocation allocation = allocationRequiring(java, 4, true);
		when(allocation.getRequest().getTitle()).thenReturn("Java Developer");
		when(allocation.getRequest().getProject()).thenReturn(mock(Project.class));

		assertThatThrownBy(() -> employeeSkillService.replace(USER_ID, List.of(new EmployeeSkillRequest(1L, 3, 1))))
			.isInstanceOfSatisfying(BusinessException.class, ex -> {
				assertThat(ex.getStatus()).isEqualTo(HttpStatus.CONFLICT);
				assertThat(ex.getCode()).isEqualTo("SKILL_REQUIRED_BY_ALLOCATION");
			});
		verify(employeeSkillRepository, never()).save(any());
		// BR-18 covers the active allocations (BR-16: CHANGE_PENDING too) and the proposals that haven't ended
		verify(allocationRepository).findByEmployeeIdAndStatusInAndEndDateGreaterThanEqual(USER_ID,
				AllocationStatus.ACTIVE_OR_PROPOSED, LocalDate.now());
	}

	@Test
	void aRequirementTheEmployeeAlreadyFallsShortOfDoesNotBlockTheirOtherChanges() {
		User user = mock(User.class);
		Skill java = skill(1L);
		Skill csharp = skill(2L);
		when(userRepository.findById(USER_ID)).thenReturn(Optional.of(user));
		when(skillRepository.findAllById(Set.of(1L))).thenReturn(List.of(java));
		when(employeeSkillRepository.findByUserIdOrderBySkillCategoryAscSkillNameAsc(USER_ID))
			.thenReturn(List.of(new EmployeeSkill(user, java, 4, 2)));
		// The PM added C# ≥ 3 to the request after the employee, who has no C#, was allocated
		allocationRequiring(csharp, 3, true);

		employeeSkillService.replace(USER_ID, List.of(new EmployeeSkillRequest(1L, 5, 3)));

		verify(employeeSkillRepository).flush();
	}

	@Test
	void aNiceToHaveSkillCanBeRemoved() {
		User user = mock(User.class);
		Skill postgres = skill(3L);
		when(userRepository.findById(USER_ID)).thenReturn(Optional.of(user));
		EmployeeSkill current = new EmployeeSkill(user, postgres, 3, 2);
		when(employeeSkillRepository.findByUserIdOrderBySkillCategoryAscSkillNameAsc(USER_ID))
			.thenReturn(List.of(current));
		allocationRequiring(postgres, 2, false);

		employeeSkillService.replace(USER_ID, List.of());

		verify(employeeSkillRepository).delete(current);
	}

	@Test
	void replaceForAnUnknownUserIs404() {
		when(userRepository.findById(USER_ID)).thenReturn(Optional.empty());

		assertThatThrownBy(() -> employeeSkillService.replace(USER_ID, List.of()))
			.isInstanceOf(NotFoundException.class);
	}

	@Test
	void aConcurrentInsertIs409() {
		Skill java = skill(1L);
		when(userRepository.findById(USER_ID)).thenReturn(Optional.of(mock(User.class)));
		when(skillRepository.findAllById(Set.of(1L))).thenReturn(List.of(java));
		// The id is generated by the database, so save() inserts right away and is where the unique index fails
		when(employeeSkillRepository.save(any()))
			.thenThrow(new DataIntegrityViolationException("uq_employee_skill_user_skill"));

		assertThatThrownBy(() -> employeeSkillService.replace(USER_ID, List.of(new EmployeeSkillRequest(1L, 3, 1))))
			.isInstanceOfSatisfying(BusinessException.class, ex -> {
				assertThat(ex.getStatus()).isEqualTo(HttpStatus.CONFLICT);
				assertThat(ex.getCode()).isEqualTo("SKILLS_CHANGED");
			});
	}

	@Test
	void aConcurrentSaveIs409() {
		Skill java = skill(1L);
		when(userRepository.findById(USER_ID)).thenReturn(Optional.of(mock(User.class)));
		when(skillRepository.findAllById(Set.of(1L))).thenReturn(List.of(java));
		doThrow(new DataIntegrityViolationException("uq_employee_skill_user_skill")).when(employeeSkillRepository)
			.flush();

		assertThatThrownBy(() -> employeeSkillService.replace(USER_ID, List.of(new EmployeeSkillRequest(1L, 3, 1))))
			.isInstanceOfSatisfying(BusinessException.class,
					ex -> assertThat(ex.getStatus()).isEqualTo(HttpStatus.CONFLICT));
	}

	/** An allocation of the employee, returned for BR-18, on a request that asks for this skill at this level. */
	private Allocation allocationRequiring(Skill skill, int minLevel, boolean mandatory) {
		RequestSkill required = mock(RequestSkill.class);
		lenient().when(required.getSkill()).thenReturn(skill);
		lenient().when(required.isMandatory()).thenReturn(mandatory);
		lenient().when(required.getMinLevel()).thenReturn(minLevel);
		StaffingRequest request = mock(StaffingRequest.class);
		when(request.getSkills()).thenReturn(List.of(required));
		Allocation allocation = mock(Allocation.class);
		when(allocation.getRequest()).thenReturn(request);
		when(allocationRepository.findByEmployeeIdAndStatusInAndEndDateGreaterThanEqual(eq(USER_ID), any(), any()))
			.thenReturn(List.of(allocation));
		return allocation;
	}

	private static Skill skill(Long id) {
		Skill skill = mock(Skill.class);
		when(skill.getId()).thenReturn(id);
		return skill;
	}

}
