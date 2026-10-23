package com.staffsync.request;

import java.util.Collection;
import java.util.Optional;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

public interface StaffingRequestRepository extends JpaRepository<StaffingRequest, Long> {

	Page<StaffingRequest> findByProjectId(Long projectId, Pageable pageable);

	// The owner check needs the project and its PM
	@Override
	@EntityGraph(attributePaths = { "project", "project.pm" })
	Optional<StaffingRequest> findById(Long id);

	/** The requests in the given statuses on all of a PM's projects (PM's Home card). */
	long countByProjectPmIdAndStatusIn(Long pmId, Collection<RequestStatus> statuses);

}
