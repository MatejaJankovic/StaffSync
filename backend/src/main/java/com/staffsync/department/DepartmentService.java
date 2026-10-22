package com.staffsync.department;

import java.util.List;

import com.staffsync.common.BusinessException;
import com.staffsync.common.NotFoundException;
import com.staffsync.department.dto.DepartmentDto;
import com.staffsync.department.dto.DepartmentRequest;
import com.staffsync.user.UserRepository;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class DepartmentService {

	public static final String NAME_TAKEN = "DEPARTMENT_NAME_TAKEN";

	public static final String IN_USE = "DEPARTMENT_IN_USE";

	private final DepartmentRepository departmentRepository;

	private final UserRepository userRepository;

	public DepartmentService(DepartmentRepository departmentRepository, UserRepository userRepository) {
		this.departmentRepository = departmentRepository;
		this.userRepository = userRepository;
	}

	@Transactional(readOnly = true)
	public List<DepartmentDto> list() {
		return departmentRepository.findAllByOrderByNameAsc().stream().map(DepartmentDto::from).toList();
	}

	@Transactional(readOnly = true)
	public DepartmentDto get(Long id) {
		return DepartmentDto.from(find(id));
	}

	/** Names are unique regardless of case. */
	@Transactional
	public DepartmentDto create(DepartmentRequest request) {
		String name = request.name().trim();
		if (departmentRepository.existsByNameIgnoreCase(name)) {
			throw nameTaken(name);
		}
		return DepartmentDto.from(saveAndFlush(new Department(name), name));
	}

	@Transactional
	public DepartmentDto update(Long id, DepartmentRequest request) {
		Department department = find(id);
		String name = request.name().trim();
		if (departmentRepository.existsByNameIgnoreCaseAndIdNot(name, id)) {
			throw nameTaken(name);
		}
		department.setName(name);
		return DepartmentDto.from(saveAndFlush(department, name));
	}

	/** A department that still has users, active or not, can't be deleted (409). */
	@Transactional
	public void delete(Long id) {
		Department department = find(id);
		if (userRepository.existsByDepartmentId(id)) {
			throw inUse(department.getName());
		}
		try {
			departmentRepository.delete(department);
			departmentRepository.flush();
		}
		catch (DataIntegrityViolationException ex) {
			// A user was moved into the department after the check above
			throw inUse(department.getName());
		}
	}

	private Department find(Long id) {
		return departmentRepository.findById(id).orElseThrow(() -> new NotFoundException("Department", id));
	}

	// The unique constraint on name is the only one on the table, so a violation here is a
	// concurrent request that saved the same name first
	private Department saveAndFlush(Department department, String name) {
		try {
			return departmentRepository.saveAndFlush(department);
		}
		catch (DataIntegrityViolationException ex) {
			throw nameTaken(name);
		}
	}

	private static BusinessException nameTaken(String name) {
		return new BusinessException(HttpStatus.CONFLICT, NAME_TAKEN,
				"A department named '" + name + "' already exists");
	}

	private static BusinessException inUse(String name) {
		return new BusinessException(HttpStatus.CONFLICT, IN_USE,
				"Department '" + name + "' still has users and cannot be deleted");
	}

}
