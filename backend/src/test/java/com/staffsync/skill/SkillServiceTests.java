package com.staffsync.skill;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Optional;

import com.staffsync.skill.dto.SkillDto;
import com.staffsync.skill.dto.SkillRequest;
import org.hibernate.exception.ConstraintViolationException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataIntegrityViolationException;

@ExtendWith(MockitoExtension.class)
class SkillServiceTests {

	@Mock
	SkillRepository skillRepository;

	@InjectMocks
	SkillService skillService;

	@Test
	void createTrimsTheName() {
		when(skillRepository.existsByNameIgnoreCase("Go")).thenReturn(false);
		when(skillRepository.saveAndFlush(any(Skill.class))).thenAnswer(call -> call.getArgument(0));

		SkillDto created = skillService.create(new SkillRequest("  Go  ", SkillCategory.BACKEND));

		assertThat(created.name()).isEqualTo("Go");
		assertThat(created.category()).isEqualTo(SkillCategory.BACKEND);
	}

	@Test
	void createRejectsADuplicateNameWithoutSaving() {
		when(skillRepository.existsByNameIgnoreCase("Java")).thenReturn(true);

		assertThatThrownBy(() -> skillService.create(new SkillRequest("Java", SkillCategory.BACKEND)))
			.isInstanceOf(DuplicateSkillException.class);
		verify(skillRepository, never()).saveAndFlush(any());
	}

	@Test
	void createMapsAUniqueIndexViolationFromARaceTo409() {
		when(skillRepository.existsByNameIgnoreCase("Go")).thenReturn(false);
		when(skillRepository.saveAndFlush(any(Skill.class))).thenThrow(new DataIntegrityViolationException("uq",
				new ConstraintViolationException("duplicate", null, "uq_skill_name_lower")));

		assertThatThrownBy(() -> skillService.create(new SkillRequest("Go", SkillCategory.BACKEND)))
			.isInstanceOf(DuplicateSkillException.class);
	}

	@Test
	void anotherConstraintViolationIsNotReportedAsADuplicateName() {
		when(skillRepository.existsByNameIgnoreCase("Go")).thenReturn(false);
		when(skillRepository.saveAndFlush(any(Skill.class))).thenThrow(new DataIntegrityViolationException("check",
				new ConstraintViolationException("check", null, "chk_skill_category")));

		assertThatThrownBy(() -> skillService.create(new SkillRequest("Go", SkillCategory.BACKEND)))
			.isInstanceOf(DataIntegrityViolationException.class);
	}

	@Test
	void updateAllowsKeepingTheOwnName() {
		Skill skill = new Skill("Java", SkillCategory.BACKEND);
		when(skillRepository.findById(1L)).thenReturn(Optional.of(skill));
		when(skillRepository.existsByNameIgnoreCaseAndIdNot("Java", 1L)).thenReturn(false);
		when(skillRepository.saveAndFlush(skill)).thenReturn(skill);

		SkillDto updated = skillService.update(1L, new SkillRequest("Java", SkillCategory.OTHER));

		assertThat(updated.category()).isEqualTo(SkillCategory.OTHER);
	}

	@Test
	void updateOfAMissingSkillIsNotFound() {
		when(skillRepository.findById(7L)).thenReturn(Optional.empty());

		assertThatThrownBy(() -> skillService.update(7L, new SkillRequest("Go", SkillCategory.BACKEND)))
			.isInstanceOf(SkillNotFoundException.class);
	}

	@Test
	void deleteOfASkillThatIsStillReferencedIsInUse() {
		Skill skill = new Skill("Java", SkillCategory.BACKEND);
		when(skillRepository.findById(1L)).thenReturn(Optional.of(skill));
		doThrow(new DataIntegrityViolationException("fk")).when(skillRepository).flush();

		assertThatThrownBy(() -> skillService.delete(1L)).isInstanceOf(SkillInUseException.class)
			.hasMessage("Skill 'Java' is in use and cannot be deleted");
	}

}
