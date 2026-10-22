package com.staffsync.common;

import static java.lang.annotation.ElementType.FIELD;
import static java.lang.annotation.ElementType.METHOD;
import static java.lang.annotation.ElementType.PARAMETER;
import static java.lang.annotation.RetentionPolicy.RUNTIME;

import java.lang.annotation.Documented;
import java.lang.annotation.Retention;
import java.lang.annotation.Target;
import java.nio.charset.StandardCharsets;

import jakarta.validation.Constraint;
import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;
import jakarta.validation.Payload;

/**
 * The string is at most {@link #value()} bytes in UTF-8. {@code @Size} counts characters, but
 * BCrypt's limit is 72 <em>bytes</em>, and {@code BCryptPasswordEncoder.encode} throws above it, so
 * a password with letters such as č or ž could pass {@code @Size(max = 72)} and end in a 500.
 * {@code null} is valid; combine with {@code @NotBlank} where the value is required.
 */
@Documented
@Constraint(validatedBy = MaxBytes.Validator.class)
@Target({ FIELD, METHOD, PARAMETER })
@Retention(RUNTIME)
public @interface MaxBytes {

	int value();

	String message() default "must be at most {value} bytes";

	Class<?>[] groups() default {};

	Class<? extends Payload>[] payload() default {};

	class Validator implements ConstraintValidator<MaxBytes, CharSequence> {

		private int max;

		@Override
		public void initialize(MaxBytes annotation) {
			this.max = annotation.value();
		}

		@Override
		public boolean isValid(CharSequence value, ConstraintValidatorContext context) {
			return value == null || value.toString().getBytes(StandardCharsets.UTF_8).length <= max;
		}

	}

}
