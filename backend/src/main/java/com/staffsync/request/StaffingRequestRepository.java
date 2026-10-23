package com.staffsync.request;

import java.util.Collection;
import java.util.List;
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

	/** BR-11: the project's requests in the given statuses, the open ones cancelled when it closes. */
	List<StaffingRequest> findByProjectIdAndStatusIn(Long projectId, Collection<RequestStatus> statuses);

	/** The requests in the given statuses on all of a PM's projects (PM's Home card). */
	long countByProjectPmIdAndStatusIn(Long pmId, Collection<RequestStatus> statuses);

}
