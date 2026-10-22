package com.staffsync.matching.dto;

import java.util.List;

import com.staffsync.user.Seniority;
import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "A candidate for a staffing request, with a 0–100 score and why it is what it is",
		example = """
				{
				  "employeeId": 17,
				  "fullName": "Jelena Petrović",
				  "seniority": "MEDIOR",
				  "department": "Engineering",
				  "score": 67,
				  "breakdown": { "skills": 23, "availability": 34, "seniority": 10 },
				  "reasons": ["Java 4/5 (required ≥ 4)", "Spring 3/5 (required ≥ 3)"],
				  "warnings": ["Insufficient capacity 2026-11-02 – 2026-11-13 (40% free, 60% required)", "Missing PostgreSQL (nice to have)"]
				}""")
public record CandidateDto(@Schema(example = "17") Long employeeId,
		@Schema(example = "Jelena Petrović") String fullName,
		@Schema(example = "MEDIOR", nullable = true) Seniority seniority,
		@Schema(example = "Engineering", nullable = true) String department,
		@Schema(example = "67",
				description = "0 to 100. The sum of the three rounded breakdown values, so it always adds up") int score,
		Breakdown breakdown,
		@Schema(description = "The requested skills the candidate has, with their level",
				example = "[\"Java 4/5 (required ≥ 4)\", \"Spring 3/5 (required ≥ 3)\"]") List<String> reasons,
		@Schema(description = "Days without enough free capacity, requested skills the candidate lacks, and a "
				+ "different seniority",
				example = "[\"Insufficient capacity 2026-11-02 – 2026-11-13 (40% free, 60% required)\", "
						+ "\"Missing PostgreSQL (nice to have)\"]") List<String> warnings) {

	@Schema(description = "The score by component, each rounded to a whole number")
	public record Breakdown(@Schema(example = "23", minimum = "0", maximum = "50",
			description = "Skills, 50% of the score") int skills,
			@Schema(example = "34", minimum = "0", maximum = "40",
					description = "Availability, 40% of the score") int availability,
			@Schema(example = "10", minimum = "0", maximum = "10",
					description = "Seniority, 10% of the score") int seniority) {

	}

}
