package com.staffsync.request;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface StaffingRequestRepository extends JpaRepository<StaffingRequest, Long> {

	Page<StaffingRequest> findByProjectId(Long projectId, Pageable pageable);

	// The owner check needs the project and its PM
	@Override
	@EntityGraph(attributePaths = { "project", "project.pm" })
	Optional<StaffingRequest> findById(Long id);

	/** BR-11: the project's requests in the given statuses, the open ones cancelled when it closes. */
	List<StaffingRequest> findByProjectIdAndStatusIn(Long projectId, Collection<RequestStatus> statuses);

	/** Titles are unique within a project among the requests that aren't cancelled, regardless of case. */
	@Query("""
			select count(r) > 0 from StaffingRequest r
			where r.project.id = :projectId
			  and lower(r.title) = lower(:title)
			  and r.status <> com.staffsync.request.RequestStatus.CANCELLED
			  and (:excludeId is null or r.id <> :excludeId)
			""")
	boolean existsOpenTitle(@Param("projectId") Long projectId, @Param("title") String title,
			@Param("excludeId") Long excludeId);

	/** The requests in the given statuses on all of a PM's projects (PM's Home card). */
	long countByProjectPmIdAndStatusIn(Long pmId, Collection<RequestStatus> statuses);

}
