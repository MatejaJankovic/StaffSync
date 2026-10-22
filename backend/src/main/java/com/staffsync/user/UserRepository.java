package com.staffsync.user;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

public interface UserRepository extends JpaRepository<User, Long> {

	Optional<User> findByEmailIgnoreCase(String email);

	/** Active or not: a deactivated user still belongs to their department. */
	boolean existsByDepartmentId(Long departmentId);

}
