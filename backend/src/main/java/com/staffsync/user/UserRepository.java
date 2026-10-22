package com.staffsync.user;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserRepository extends JpaRepository<User, Long> {

	Optional<User> findByEmailIgnoreCase(String email);

	/** The users of a role who can still log in and be staffed, with their department for the matching list. */
	@EntityGraph(attributePaths = "department")
	List<User> findByRoleAndActiveTrue(Role role);

}
