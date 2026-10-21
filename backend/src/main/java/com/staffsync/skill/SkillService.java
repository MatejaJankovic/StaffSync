package com.staffsync.skill;

import java.util.List;

import com.staffsync.skill.dto.SkillDto;
import com.staffsync.skill.dto.SkillRequest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class SkillService {

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
			// TODO when the GlobalExceptionHandler (#9) lands: any integrity violation is read as
			// "in use", which is only right while the foreign keys are the only constraint that can fail
			throw new SkillInUseException(skill.getName());
		}
	}

	private Skill find(Long id) {
		return skillRepository.findById(id).orElseThrow(() -> new SkillNotFoundException(id));
	}

	// The unique index also guards against two concurrent requests with the same name.
	// TODO check the constraint name (uq_skill_name_lower) once the GlobalExceptionHandler (#9) lands:
	// a violation of another constraint, such as the category CHECK, would be reported as a duplicate name
	private Skill saveAndFlush(Skill skill, String name) {
		try {
			return skillRepository.saveAndFlush(skill);
		}
		catch (DataIntegrityViolationException ex) {
			throw new DuplicateSkillException(name);
		}
	}

}
