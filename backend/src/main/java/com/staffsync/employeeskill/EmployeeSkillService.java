package com.staffsync.employeeskill;

import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

import com.staffsync.common.BusinessException;
import com.staffsync.common.NotFoundException;
import com.staffsync.employeeskill.dto.EmployeeSkillDto;
import com.staffsync.employeeskill.dto.EmployeeSkillRequest;
import com.staffsync.skill.Skill;
import com.staffsync.skill.SkillRepository;
import com.staffsync.user.User;
import com.staffsync.user.UserRepository;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class EmployeeSkillService {

	private final EmployeeSkillRepository employeeSkillRepository;

	private final UserRepository userRepository;

	private final SkillRepository skillRepository;

	public EmployeeSkillService(EmployeeSkillRepository employeeSkillRepository, UserRepository userRepository,
			SkillRepository skillRepository) {
		this.employeeSkillRepository = employeeSkillRepository;
		this.userRepository = userRepository;
		this.skillRepository = skillRepository;
	}

	@Transactional(readOnly = true)
	public List<EmployeeSkillDto> list(Long userId) {
		findUser(userId);
		return employeeSkillRepository.findByUserIdOrderBySkillCategoryAscSkillNameAsc(userId)
			.stream()
			.map(EmployeeSkillDto::from)
			.toList();
	}

	/**
	 * Replaces the user's whole skill list. Rows for skills that stay are updated in place
	 * rather than deleted and inserted again: Hibernate flushes inserts before deletes, so
	 * re-inserting the same (user, skill) pair would break the unique constraint.
	 */
	@Transactional
	public List<EmployeeSkillDto> replace(Long userId, List<EmployeeSkillRequest> requests) {
		User user = findUser(userId);
		Map<Long, EmployeeSkillRequest> wanted = bySkillId(requests);
		Map<Long, Skill> skills = findSkills(wanted.keySet());

		for (EmployeeSkill current : employeeSkillRepository.findByUserIdOrderBySkillCategoryAscSkillNameAsc(userId)) {
			EmployeeSkillRequest request = wanted.remove(current.getSkill().getId());
			if (request == null) {
				employeeSkillRepository.delete(current);
			}
			else {
				current.setLevel(request.level());
				current.setYearsOfExperience(request.yearsOfExperience());
			}
		}
		wanted.forEach((skillId, request) -> employeeSkillRepository
			.save(new EmployeeSkill(user, skills.get(skillId), request.level(), request.yearsOfExperience())));

		try {
			employeeSkillRepository.flush();
		}
		catch (DataIntegrityViolationException ex) {
			// Only a concurrent save of the same list can get past the checks above
			throw new BusinessException(HttpStatus.CONFLICT, "SKILLS_CHANGED",
					"The skills were changed at the same time. Reload and try again");
		}
		return list(userId);
	}

	private User findUser(Long id) {
		return userRepository.findById(id).orElseThrow(() -> new NotFoundException("User", id));
	}

	private static Map<Long, EmployeeSkillRequest> bySkillId(List<EmployeeSkillRequest> requests) {
		Map<Long, EmployeeSkillRequest> bySkillId = new LinkedHashMap<>();
		Set<Long> duplicates = new HashSet<>();
		for (EmployeeSkillRequest request : requests) {
			if (bySkillId.putIfAbsent(request.skillId(), request) != null) {
				duplicates.add(request.skillId());
			}
		}
		if (!duplicates.isEmpty()) {
			throw new BusinessException(HttpStatus.BAD_REQUEST, "DUPLICATE_SKILL",
					"Each skill can appear only once", duplicates.stream().sorted().toList());
		}
		return bySkillId;
	}

	private Map<Long, Skill> findSkills(Set<Long> ids) {
		Map<Long, Skill> skills = skillRepository.findAllById(ids)
			.stream()
			.collect(Collectors.toMap(Skill::getId, Function.identity()));
		List<Long> unknown = ids.stream().filter(id -> !skills.containsKey(id)).sorted().toList();
		if (!unknown.isEmpty()) {
			throw new BusinessException(HttpStatus.BAD_REQUEST, "UNKNOWN_SKILL", "Some skills are not in the catalog",
					unknown);
		}
		return skills;
	}

}
