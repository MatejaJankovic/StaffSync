package com.staffsync.employeeskill;

import java.util.Collection;
import java.util.List;

import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

public interface EmployeeSkillRepository extends JpaRepository<EmployeeSkill, Long> {

	@EntityGraph(attributePaths = "skill")
	List<EmployeeSkill> findByUserIdOrderBySkillCategoryAscSkillNameAsc(Long userId);

	/** The ratings of many employees in one query, for matching. */
	@EntityGraph(attributePaths = "skill")
	List<EmployeeSkill> findByUserIdIn(Collection<Long> userIds);

}
