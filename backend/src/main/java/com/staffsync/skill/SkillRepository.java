package com.staffsync.skill;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

public interface SkillRepository extends JpaRepository<Skill, Long> {

	boolean existsByNameIgnoreCase(String name);

	boolean existsByNameIgnoreCaseAndIdNot(String name, Long id);

	List<Skill> findAllByOrderByCategoryAscNameAsc();

	List<Skill> findByCategoryOrderByNameAsc(SkillCategory category);

}
