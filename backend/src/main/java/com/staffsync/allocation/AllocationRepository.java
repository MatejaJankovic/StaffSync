package com.staffsync.allocation;

import java.time.LocalDate;
import java.util.Collection;
import java.util.List;

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
	@EntityGraph(attributePaths = { "employee", "request", "request.project" })
	Page<Allocation> findAll(Specification<Allocation> spec, Pageable pageable);

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
	 * period overlaps {@code [from, to]} (both ends inclusive).
	 */
	@Query("""
			select count(a) > 0 from Allocation a
			where a.request.id = :requestId
			  and a.employee.id = :employeeId
			  and a.status in :statuses
			  and a.startDate <= :to
			  and a.endDate >= :from
			""")
	boolean existsOverlappingOnRequest(@Param("requestId") Long requestId, @Param("employeeId") Long employeeId,
			@Param("from") LocalDate from, @Param("to") LocalDate to,
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
