package com.staffsync.allocation;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;

import com.staffsync.common.BusinessException;
import com.staffsync.common.NotFoundException;
import com.staffsync.user.User;
import com.staffsync.user.UserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * §7: an employee's load per working day (Mon–Fri) as the sum of their allocations' percents.
 * Used by approve and change (BR-1), propose (BR-2 warning), matching and employee search.
 */
@Service
@Transactional(readOnly = true)
public class CapacityService {

	public static final String CAPACITY_EXCEEDED = "CAPACITY_EXCEEDED";

	private final AllocationRepository allocationRepository;

	private final UserRepository userRepository;

	public CapacityService(AllocationRepository allocationRepository, UserRepository userRepository) {
		this.allocationRepository = allocationRepository;
		this.userRepository = userRepository;
	}

	/** date → load % from active allocations (APPROVED, CHANGE_PENDING), working days only. */
	public Map<LocalDate, Integer> getDailyLoad(Long employeeId, LocalDate from, LocalDate to,
			Long excludeAllocationId) {
		return computeLoad(employeeId, from, to, excludeAllocationId, AllocationStatus.ACTIVE);
	}

	/** Same as {@link #getDailyLoad}, but PROPOSED allocations count too (soft booking, BR-2). */
	public Map<LocalDate, Integer> getDailyLoadIncludingProposed(Long employeeId, LocalDate from, LocalDate to,
			Long excludeAllocationId) {
		return computeLoad(employeeId, from, to, excludeAllocationId, AllocationStatus.ACTIVE_OR_PROPOSED);
	}

	/** date → capacityPercent − load. Can be negative only if the data is already overbooked. */
	public Map<LocalDate, Integer> getFreeCapacity(Long employeeId, LocalDate from, LocalDate to) {
		int capacity = findEmployee(employeeId).getCapacityPercent();
		Map<LocalDate, Integer> free = new LinkedHashMap<>();
		getDailyLoad(employeeId, from, to, null).forEach((day, load) -> free.put(day, capacity - load));
		return free;
	}

	/**
	 * The working days on which a hypothetical allocation of {@code percent} over {@code [from, to]}
	 * would push the employee over capacity, as {@code {"date": ..., "load": ...}} where load is the total
	 * with the new allocation. An empty list means it fits. Exactly 100% is allowed (T-01).
	 */
	public List<Map<String, Object>> findOverloadedDays(Long employeeId, LocalDate from, LocalDate to, int percent,
			Long excludeAllocationId, boolean includeProposed) {
		int capacity = findEmployee(employeeId).getCapacityPercent();
		Map<LocalDate, Integer> load = includeProposed
				? getDailyLoadIncludingProposed(employeeId, from, to, excludeAllocationId)
				: getDailyLoad(employeeId, from, to, excludeAllocationId);

		List<Map<String, Object>> overloaded = new ArrayList<>();
		load.forEach((day, current) -> {
			int total = current + percent;
			if (total > capacity) {
				overloaded.add(Map.of("date", day, "load", total));
			}
		});
		return overloaded;
	}

	/** BR-1: throws 409 CAPACITY_EXCEEDED with the overloaded days. Approve and change approval call this. */
	public void checkCapacity(Long employeeId, LocalDate from, LocalDate to, int percent, Long excludeAllocationId) {
		List<Map<String, Object>> overloaded = findOverloadedDays(employeeId, from, to, percent, excludeAllocationId,
				false);
		if (!overloaded.isEmpty()) {
			String days = overloaded.size() == 1 ? "1 day" : overloaded.size() + " days";
			throw new BusinessException(HttpStatus.CONFLICT, CAPACITY_EXCEEDED, "Capacity exceeded on " + days,
					overloaded);
		}
	}

	/**
	 * BR-13: the working days from {@code from} on where the employee's active allocations would go over
	 * {@code capacityPercent}, as {@code {"date": ..., "load": ...}}. An empty list means the new capacity fits.
	 */
	public List<Map<String, Object>> findDaysOverCapacity(Long employeeId, int capacityPercent, LocalDate from) {
		LocalDate lastDay = allocationRepository.findLatestEndDate(employeeId, AllocationStatus.ACTIVE);
		List<Map<String, Object>> overloaded = new ArrayList<>();
		if (lastDay == null || lastDay.isBefore(from)) {
			return overloaded;
		}
		getDailyLoad(employeeId, from, lastDay, null).forEach((day, load) -> {
			if (load > capacityPercent) {
				overloaded.add(Map.of("date", day, "load", load));
			}
		});
		return overloaded;
	}

	private Map<LocalDate, Integer> computeLoad(Long employeeId, LocalDate from, LocalDate to, Long excludeId,
			Set<AllocationStatus> statuses) {
		if (from.isAfter(to)) {
			throw new IllegalArgumentException("from must not be after to");
		}

		// Every working day starts at 0, so a free day is in the map and a weekend never is
		Map<LocalDate, Integer> load = new TreeMap<>();
		for (LocalDate day = from; !day.isAfter(to); day = day.plusDays(1)) {
			if (isWorkingDay(day)) {
				load.put(day, 0);
			}
		}

		for (Allocation allocation : allocationRepository.findOverlapping(employeeId, from, to, statuses, excludeId)) {
			// Current values, never pending* (BR-16). Clip the allocation to [from, to]
			LocalDate start = allocation.getStartDate().isAfter(from) ? allocation.getStartDate() : from;
			LocalDate end = allocation.getEndDate().isBefore(to) ? allocation.getEndDate() : to;
			for (LocalDate day = start; !day.isAfter(end); day = day.plusDays(1)) {
				load.computeIfPresent(day, (d, sum) -> sum + allocation.getPercent());
			}
		}
		return load;
	}

	/** Mon–Fri. Absence days (BR-14, stretch) will be skipped here later. */
	private static boolean isWorkingDay(LocalDate day) {
		DayOfWeek dow = day.getDayOfWeek();
		return dow != DayOfWeek.SATURDAY && dow != DayOfWeek.SUNDAY;
	}

	private User findEmployee(Long employeeId) {
		return userRepository.findById(employeeId).orElseThrow(() -> new NotFoundException("Employee", employeeId));
	}

}
