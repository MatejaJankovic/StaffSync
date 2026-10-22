package com.staffsync.department;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Optional;

import com.staffsync.common.BusinessException;
import com.staffsync.common.NotFoundException;
import com.staffsync.department.dto.DepartmentDto;
import com.staffsync.department.dto.DepartmentRequest;
import com.staffsync.user.UserRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;

@ExtendWith(MockitoExtension.class)
class DepartmentServiceTests {

	@Mock
	DepartmentRepository departmentRepository;

	@Mock
	UserRepository userRepository;

	@InjectMocks
	DepartmentService departmentService;

	@Test
	void listKeepsTheRepositoryOrder() {
		when(departmentRepository.findAllByOrderByNameAsc())
			.thenReturn(List.of(new Department("Design"), new Department("Engineering")));

		assertThat(departmentService.list()).extracting(DepartmentDto::name).containsExactly("Design", "Engineering");
	}

	@Test
	void createTrimsTheName() {
		when(departmentRepository.existsByNameIgnoreCase("Sales")).thenReturn(false);
		when(departmentRepository.saveAndFlush(any(Department.class))).thenAnswer(call -> call.getArgument(0));

		DepartmentDto created = departmentService.create(new DepartmentRequest("  Sales  "));

		assertThat(created.name()).isEqualTo("Sales");
	}

	@Test
	void createRejectsADuplicateNameWithoutSaving() {
		when(departmentRepository.existsByNameIgnoreCase("Engineering")).thenReturn(true);

		assertThatThrownBy(() -> departmentService.create(new DepartmentRequest("Engineering")))
			.isInstanceOfSatisfying(BusinessException.class, ex -> {
				assertThat(ex.getStatus()).isEqualTo(HttpStatus.CONFLICT);
				assertThat(ex.getCode()).isEqualTo(DepartmentService.NAME_TAKEN);
			});
		verify(departmentRepository, never()).saveAndFlush(any());
	}

	@Test
	void createMapsAUniqueConstraintViolationFromARaceTo409() {
		when(departmentRepository.existsByNameIgnoreCase("Sales")).thenReturn(false);
		when(departmentRepository.saveAndFlush(any(Department.class)))
			.thenThrow(new DataIntegrityViolationException("unique"));

		assertThatThrownBy(() -> departmentService.create(new DepartmentRequest("Sales")))
			.isInstanceOfSatisfying(BusinessException.class,
					ex -> assertThat(ex.getCode()).isEqualTo(DepartmentService.NAME_TAKEN));
	}

	@Test
	void updateRenamesAndAllowsKeepingTheOwnName() {
		Department department = new Department("Sales");
		when(departmentRepository.findById(1L)).thenReturn(Optional.of(department));
		when(departmentRepository.existsByNameIgnoreCaseAndIdNot("SALES", 1L)).thenReturn(false);
		when(departmentRepository.saveAndFlush(department)).thenReturn(department);

		DepartmentDto updated = departmentService.update(1L, new DepartmentRequest(" SALES "));

		assertThat(updated.name()).isEqualTo("SALES");
	}

	@Test
	void updateRejectsAnotherDepartmentsName() {
		Department department = new Department("Sales");
		when(departmentRepository.findById(1L)).thenReturn(Optional.of(department));
		when(departmentRepository.existsByNameIgnoreCaseAndIdNot("Engineering", 1L)).thenReturn(true);

		assertThatThrownBy(() -> departmentService.update(1L, new DepartmentRequest("Engineering")))
			.isInstanceOfSatisfying(BusinessException.class,
					ex -> assertThat(ex.getCode()).isEqualTo(DepartmentService.NAME_TAKEN));
		assertThat(department.getName()).isEqualTo("Sales");
	}

	@Test
	void updateOfAMissingDepartmentIsNotFound() {
		when(departmentRepository.findById(7L)).thenReturn(Optional.empty());

		assertThatThrownBy(() -> departmentService.update(7L, new DepartmentRequest("Sales")))
			.isInstanceOf(NotFoundException.class)
			.hasMessage("Department 7 not found");
	}

	@Test
	void deleteRemovesADepartmentWithoutUsers() {
		Department department = new Department("Sales");
		when(departmentRepository.findById(1L)).thenReturn(Optional.of(department));
		when(userRepository.existsByDepartmentId(1L)).thenReturn(false);

		departmentService.delete(1L);

		verify(departmentRepository).delete(department);
		verify(departmentRepository).flush();
	}

	@Test
	void deleteOfADepartmentWithUsersIsInUse() {
		Department department = new Department("Engineering");
		when(departmentRepository.findById(1L)).thenReturn(Optional.of(department));
		when(userRepository.existsByDepartmentId(1L)).thenReturn(true);

		assertThatThrownBy(() -> departmentService.delete(1L))
			.isInstanceOfSatisfying(BusinessException.class, ex -> {
				assertThat(ex.getStatus()).isEqualTo(HttpStatus.CONFLICT);
				assertThat(ex.getCode()).isEqualTo(DepartmentService.IN_USE);
			})
			.hasMessage("Department 'Engineering' still has users and cannot be deleted");
		verify(departmentRepository, never()).delete(any());
	}

	@Test
	void deleteMapsAForeignKeyViolationFromARaceToInUse() {
		Department department = new Department("Sales");
		when(departmentRepository.findById(1L)).thenReturn(Optional.of(department));
		when(userRepository.existsByDepartmentId(1L)).thenReturn(false);
		doThrow(new DataIntegrityViolationException("fk")).when(departmentRepository).flush();

		assertThatThrownBy(() -> departmentService.delete(1L))
			.isInstanceOfSatisfying(BusinessException.class,
					ex -> assertThat(ex.getCode()).isEqualTo(DepartmentService.IN_USE));
	}

	@Test
	void deleteOfAMissingDepartmentIsNotFound() {
		when(departmentRepository.findById(7L)).thenReturn(Optional.empty());

		assertThatThrownBy(() -> departmentService.delete(7L)).isInstanceOf(NotFoundException.class);
	}

}
