package com.staffsync.skill;

public class SkillNotFoundException extends RuntimeException {

	public SkillNotFoundException(Long id) {
		super("Skill " + id + " not found");
	}

}
