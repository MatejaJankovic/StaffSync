package com.staffsync.user.dto;

import com.staffsync.user.Role;
import com.staffsync.user.Seniority;

/** What {@link CreateUserRequest} and {@link UpdateUserRequest} share, so both are checked the same way. */
public interface UserFields {

	String email();

	String firstName();

	String lastName();

	Role role();

	Long departmentId();

	Long managerId();

	Seniority seniority();

	Integer capacityPercent();

}
