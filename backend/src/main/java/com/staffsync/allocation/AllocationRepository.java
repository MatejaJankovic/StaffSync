package com.staffsync.allocation;

import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface AllocationRepository extends JpaRepository<Allocation, Long>, JpaSpecificationExecutor<Allocation> {

	// The DTO shows the employee, the request and the project, so they are loaded with the allocation
	@Override
	@EntityGraph(attributePaths = { "employee", "request", "request.project", "decidedBy" })
	Page<Allocation> findAll(Specification<Allocation> spec, Pageable pageable);

	// Approve and reject check the employee's RM (BR-5) and the project (BR-9), and return the DTO
	@Override
	@EntityGraph(attributePaths = { "employee", "employee.manager", "request", "request.project" })
	Optional<Allocation> findById(Long id);

	/**
	 * The allocations in the given statuses of the employees who report to this RM ({@code manager_id}, BR-5).
	 * One query for the page: the pending approvals show the employee, the request, the project, the proposer
	 * and the last decider, so they are loaded with it.
	 */
	@EntityGraph(attributePaths = { "employee", "request", "request.project", "proposedBy", "decidedBy" })
	Page<Allocation> findByEmployeeManagerIdAndStatusIn(Long managerId, Collection<AllocationStatus> statuses,
			Pageable pageable);

	/**
	 * The employee's allocations in the given statuses whose period overlaps {@code [from, to]}
	 * (both ends inclusive, so an allocation ending on {@code from} counts). The allocation with
	 * {@code excludeId} is left out, which changes need (BR-15); pass {@code null} to keep all.
	 */
	@Query("""
			select a from Allocation a
			where a.employee.id = :employeeId
			  and a.status in :statuses
			  and a.startDate <= :to
			  and a.endDate >= :from
			  and (:excludeId is null or a.id <> :excludeId)
			""")
	List<Allocation> findOverlapping(@Param("employeeId") Long employeeId, @Param("from") LocalDate from,
			@Param("to") LocalDate to, @Param("statuses") Collection<AllocationStatus> statuses,
			@Param("excludeId") Long excludeId);

	/**
	 * BR-8: whether the employee already has an allocation in the given statuses on this request whose
	 * period overlaps {@code [from, to]} (both ends inclusive). The allocation with {@code excludeId} is left
	 * out, so a change (BR-15) doesn't overlap itself; pass {@code null} to keep all.
	 */
	@Query("""
			select count(a) > 0 from Allocation a
			where a.request.id = :requestId
			  and a.employee.id = :employeeId
			  and a.status in :statuses
			  and a.startDate <= :to
			  and a.endDate >= :from
			  and (:excludeId is null or a.id <> :excludeId)
			""")
	boolean existsOverlappingOnRequest(@Param("requestId") Long requestId, @Param("employeeId") Long employeeId,
			@Param("from") LocalDate from, @Param("to") LocalDate to,
			@Param("statuses") Collection<AllocationStatus> statuses, @Param("excludeId") Long excludeId);

	/**
	 * BR-10: how many different employees have an allocation in the given statuses (the active ones, BR-16) on
	 * the request. Headcount is about people, so one employee with two allocations in a row counts once.
	 */
	@Query("""
			select count(distinct a.employee.id) from Allocation a
			where a.request.id = :requestId
			  and a.status in :statuses
			""")
	long countEmployeesByRequest(@Param("requestId") Long requestId,
			@Param("statuses") Collection<AllocationStatus> statuses);

	/**
	 * {@link #countEmployeesByRequest} for several requests at once, as {@code [requestId, count]} rows. A request
	 * without such an allocation has no row.
	 */
	@Query("""
			select a.request.id, count(distinct a.employee.id) from Allocation a
			where a.request.id in :requestIds
			  and a.status in :statuses
			group by a.request.id
			""")
	List<Object[]> countEmployeesByRequests(@Param("requestIds") Collection<Long> requestIds,
			@Param("statuses") Collection<AllocationStatus> statuses);

	/** The request's allocations in the given statuses, with their employees (BR-3 when the request is edited). */
	@EntityGraph(attributePaths = "employee")
	List<Allocation> findByRequestIdAndStatusIn(Long requestId, Collection<AllocationStatus> statuses);

	/** BR-11: the allocations in the given statuses on all of the project's requests, cleaned up when it closes. */
	List<Allocation> findByRequestProjectIdAndStatusIn(Long projectId, Collection<AllocationStatus> statuses);

	/** T-19: the proposals that are cancelled once the request is filled. */
	List<Allocation> findByRequestIdAndStatus(Long requestId, AllocationStatus status);

	/** The last day of the employee's allocations in the given statuses, or {@code null} if there are none. */
	@Query("""
			select max(a.endDate) from Allocation a
			where a.employee.id = :employeeId
			  and a.status in :statuses
			""")
	LocalDate findLatestEndDate(@Param("employeeId") Long employeeId,
			@Param("statuses") Collection<AllocationStatus> statuses);

	/** The employees who have an allocation in one of the given statuses on the request, whatever its period. */
	@Query("""
			select distinct a.employee.id from Allocation a
			where a.request.id = :requestId
			  and a.status in :statuses
			""")
	List<Long> findEmployeeIdsByRequestAndStatuses(@Param("requestId") Long requestId,
			@Param("statuses") Collection<AllocationStatus> statuses);

}
