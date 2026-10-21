package com.staffsync.request;

import com.staffsync.skill.Skill;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

/** A skill a request asks for, at a minimum level, either required or nice to have. */
@Entity
@Table(name = "request_skill")
public class RequestSkill {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "request_id", nullable = false)
	private StaffingRequest request;

	// Eager, so loading a request's skills brings the skill names in the same query
	@ManyToOne(fetch = FetchType.EAGER, optional = false)
	@JoinColumn(name = "skill_id", nullable = false)
	private Skill skill;

	@Column(name = "min_level", nullable = false)
	private int minLevel;

	@Column(nullable = false)
	private boolean mandatory;

	protected RequestSkill() {
	}

	RequestSkill(StaffingRequest request, Skill skill, int minLevel, boolean mandatory) {
		this.request = request;
		this.skill = skill;
		this.minLevel = minLevel;
		this.mandatory = mandatory;
	}

	public Long getId() {
		return id;
	}

	public StaffingRequest getRequest() {
		return request;
	}

	public Skill getSkill() {
		return skill;
	}

	public int getMinLevel() {
		return minLevel;
	}

	public boolean isMandatory() {
		return mandatory;
	}

	void change(int minLevel, boolean mandatory) {
		this.minLevel = minLevel;
		this.mandatory = mandatory;
	}

}
