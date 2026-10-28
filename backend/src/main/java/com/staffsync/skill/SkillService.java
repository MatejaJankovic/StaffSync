package com.staffsync.skill;

import java.util.List;

import com.staffsync.skill.dto.SkillDto;
import com.staffsync.skill.dto.SkillRequest;
import org.hibernate.exception.ConstraintViolationException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class SkillService {

	/** The unique index on {@code lower(name)}, see V3. */
	private static final String NAME_INDEX = "uq_skill_name_lower";

	private final SkillRepository skillRepository;

	public SkillService(SkillRepository skillRepository) {
		this.skillRepository = skillRepository;
	}

	@Transactional(readOnly = true)
	public List<SkillDto> list(SkillCategory category) {
		List<Skill> skills = category == null ? skillRepository.findAllByOrderByCategoryAscNameAsc()
				: skillRepository.findByCategoryOrderByNameAsc(category);
		return skills.stream().map(SkillDto::from).toList();
	}

	@Transactional(readOnly = true)
	public SkillDto get(Long id) {
		return SkillDto.from(find(id));
	}

	@Transactional
	public SkillDto create(SkillRequest request) {
		String name = request.name().trim();
		if (skillRepository.existsByNameIgnoreCase(name)) {
			throw new DuplicateSkillException(name);
		}
		return SkillDto.from(saveAndFlush(new Skill(name, request.category()), name));
	}

	@Transactional
	public SkillDto update(Long id, SkillRequest request) {
		Skill skill = find(id);
		String name = request.name().trim();
		if (skillRepository.existsByNameIgnoreCaseAndIdNot(name, id)) {
			throw new DuplicateSkillException(name);
		}
		skill.setName(name);
		skill.setCategory(request.category());
		return SkillDto.from(saveAndFlush(skill, name));
	}

	/**
	 * Deletes a skill. A skill that other tables still reference (employee skills, request
	 * skills) is protected by their foreign keys and answers 409.
	 */
	@Transactional
	public void delete(Long id) {
		Skill skill = find(id);
		try {
			skillRepository.delete(skill);
			skillRepository.flush();
		}
		catch (DataIntegrityViolationException ex) {
			// Deleting a row can only break a foreign key: employee_skill or request_skill still uses it
			throw new SkillInUseException(skill.getName());
		}
	}

	private Skill find(Long id) {
		return skillRepository.findById(id).orElseThrow(() -> new SkillNotFoundException(id));
	}

	// The unique index also guards against two concurrent requests with the same name. Only that index is
	// reported as a duplicate name; any other violation, such as the category CHECK, stays a 500
	private Skill saveAndFlush(Skill skill, String name) {
		try {
			return skillRepository.saveAndFlush(skill);
		}
		catch (DataIntegrityViolationException ex) {
			if (ex.getCause() instanceof ConstraintViolationException violation
					&& NAME_INDEX.equals(violation.getConstraintName())) {
				throw new DuplicateSkillException(name);
			}
			throw ex;
		}
	}

}
