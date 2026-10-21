package com.staffsync.employeeskill;

import java.util.List;

import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

public interface EmployeeSkillRepository extends JpaRepository<EmployeeSkill, Long> {

	@EntityGraph(attributePaths = "skill")
	List<EmployeeSkill> findByUserIdOrderBySkillCategoryAscSkillNameAsc(Long userId);

}
