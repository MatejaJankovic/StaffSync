package com.staffsync.skill;

public class DuplicateSkillException extends RuntimeException {

	public DuplicateSkillException(String name) {
		super("A skill named '" + name + "' already exists");
	}

}
