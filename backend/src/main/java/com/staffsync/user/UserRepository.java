package com.staffsync.user;

import java.util.List;
import java.util.Optional;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

public interface UserRepository extends JpaRepository<User, Long>, JpaSpecificationExecutor<User> {

	Optional<User> findByEmailIgnoreCase(String email);

	boolean existsByEmailIgnoreCase(String email);

	boolean existsByEmailIgnoreCaseAndIdNot(String email, Long id);

	// The Users page shows the department and the manager, so they are loaded with the user
	@Override
	@EntityGraph(attributePaths = { "department", "manager" })
	Page<User> findAll(Specification<User> spec, Pageable pageable);

	/** The users of a role who can still log in and be staffed, with their department for the matching list. */
	@EntityGraph(attributePaths = "department")
	List<User> findByRoleAndActiveTrue(Role role);

	/** Whether an RM still has employees who can log in, so their team would be left without an RM. */
	boolean existsByManagerIdAndActiveTrue(Long managerId);

	/** An RM's team: the users who report to them and can still be staffed (Home cards). */
	List<User> findByManagerIdAndActiveTrue(Long managerId);

	/** The users who can log in (Admin's Home card). */
	long countByActiveTrue();

	/** Active or not: a deactivated user still belongs to their department. */
	boolean existsByDepartmentId(Long departmentId);

}
