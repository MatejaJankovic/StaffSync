package com.staffsync.allocation;

import java.time.LocalDate;
import java.util.Collection;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface AllocationRepository extends JpaRepository<Allocation, Long> {

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

}
