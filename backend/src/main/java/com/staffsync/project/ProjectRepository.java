package com.staffsync.project;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.domain.Specification;

public interface ProjectRepository extends JpaRepository<Project, Long>, JpaSpecificationExecutor<Project> {

	// The DTO shows the PM's name, so the PM is loaded together with the project
	@Override
	@EntityGraph(attributePaths = "pm")
	Page<Project> findAll(Specification<Project> spec, Pageable pageable);

	@Override
	@EntityGraph(attributePaths = "pm")
	Optional<Project> findById(Long id);

	/** A PM's projects in the given statuses: the open ones, which need a PM, are PLANNED and ACTIVE. */
	List<Project> findByPmIdAndStatusIn(Long pmId, Collection<ProjectStatus> statuses);

	/** Project names are unique regardless of case, like skills and departments. */
	boolean existsByNameIgnoreCase(String name);

	boolean existsByNameIgnoreCaseAndIdNot(String name, Long id);

}
