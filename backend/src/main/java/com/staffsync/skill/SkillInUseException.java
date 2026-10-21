package com.staffsync.skill;

public class SkillInUseException extends RuntimeException {

	public SkillInUseException(String name) {
		super("Skill '" + name + "' is in use and cannot be deleted");
	}

}
