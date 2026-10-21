package com.staffsync.common;

import org.springframework.http.HttpStatus;

/** 404 {@code NOT_FOUND}, e.g. {@code new NotFoundException("Project", id)} → "Project 42 not found". */
public class NotFoundException extends BusinessException {

	public static final String CODE = "NOT_FOUND";

	public NotFoundException(String entity, Object id) {
		this(entity + " " + id + " not found");
	}

	public NotFoundException(String message) {
		super(HttpStatus.NOT_FOUND, CODE, message);
	}

}
