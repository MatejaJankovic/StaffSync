package com.staffsync.employeeskill;

import com.staffsync.skill.Skill;
import com.staffsync.user.User;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

/** How well an employee knows one skill. Each (user, skill) pair appears once. */
@Entity
@Table(name = "employee_skill")
public class EmployeeSkill {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "user_id", nullable = false)
	private User user;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "skill_id", nullable = false)
	private Skill skill;

	/** 1 to 5. */
	@Column(nullable = false)
	private int level;

	@Column(name = "years_of_experience", nullable = false)
	private int yearsOfExperience;

	protected EmployeeSkill() {
	}

	public EmployeeSkill(User user, Skill skill, int level, int yearsOfExperience) {
		this.user = user;
		this.skill = skill;
		this.level = level;
		this.yearsOfExperience = yearsOfExperience;
	}

	public Long getId() {
		return id;
	}

	public User getUser() {
		return user;
	}

	public Skill getSkill() {
		return skill;
	}

	public int getLevel() {
		return level;
	}

	public void setLevel(int level) {
		this.level = level;
	}

	public int getYearsOfExperience() {
		return yearsOfExperience;
	}

	public void setYearsOfExperience(int yearsOfExperience) {
		this.yearsOfExperience = yearsOfExperience;
	}

}
