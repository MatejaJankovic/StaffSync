package com.staffsync.request;

import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;

import com.staffsync.project.Project;
import com.staffsync.skill.Skill;
import com.staffsync.user.Seniority;
import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;
import org.hibernate.annotations.BatchSize;

@Entity
@Table(name = "staffing_request")
public class StaffingRequest {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "project_id", nullable = false)
	private Project project;

	@Column(nullable = false, length = 200)
	private String title;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false, length = 20)
	private Seniority seniority;

	@Column(name = "allocation_percent", nullable = false)
	private int allocationPercent;

	@Column(name = "start_date", nullable = false)
	private LocalDate startDate;

	@Column(name = "end_date", nullable = false)
	private LocalDate endDate;

	@Column(nullable = false)
	private int headcount;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false, length = 20)
	private RequestStatus status = RequestStatus.OPEN;

	@Column(name = "created_at", nullable = false, updatable = false)
	private Instant createdAt = Instant.now();

	// A page of requests loads the skills of up to 50 of them per query, not one query per request
	@BatchSize(size = 50)
	@OneToMany(mappedBy = "request", cascade = CascadeType.ALL, orphanRemoval = true)
	@OrderBy("id")
	private List<RequestSkill> skills = new ArrayList<>();

	protected StaffingRequest() {
	}

	public StaffingRequest(Project project, String title, Seniority seniority, int allocationPercent,
			LocalDate startDate, LocalDate endDate, int headcount) {
		this.project = project;
		this.title = title;
		this.seniority = seniority;
		this.allocationPercent = allocationPercent;
		this.startDate = startDate;
		this.endDate = endDate;
		this.headcount = headcount;
	}

	public Long getId() {
		return id;
	}

	public Project getProject() {
		return project;
	}

	public String getTitle() {
		return title;
	}

	public void setTitle(String title) {
		this.title = title;
	}

	public Seniority getSeniority() {
		return seniority;
	}

	public void setSeniority(Seniority seniority) {
		this.seniority = seniority;
	}

	public int getAllocationPercent() {
		return allocationPercent;
	}

	public void setAllocationPercent(int allocationPercent) {
		this.allocationPercent = allocationPercent;
	}

	public LocalDate getStartDate() {
		return startDate;
	}

	public void setStartDate(LocalDate startDate) {
		this.startDate = startDate;
	}

	public LocalDate getEndDate() {
		return endDate;
	}

	public void setEndDate(LocalDate endDate) {
		this.endDate = endDate;
	}

	public int getHeadcount() {
		return headcount;
	}

	public void setHeadcount(int headcount) {
		this.headcount = headcount;
	}

	public RequestStatus getStatus() {
		return status;
	}

	public void setStatus(RequestStatus status) {
		this.status = status;
	}

	public Instant getCreatedAt() {
		return createdAt;
	}

	public List<RequestSkill> getSkills() {
		return skills;
	}

	/** Adds the skill, or changes its level and flag when the request already asks for it. */
	void putSkill(Skill skill, int minLevel, boolean mandatory) {
		for (RequestSkill existing : skills) {
			if (existing.getSkill().getId().equals(skill.getId())) {
				existing.change(minLevel, mandatory);
				return;
			}
		}
		skills.add(new RequestSkill(this, skill, minLevel, mandatory));
	}

	/** Removes every skill that is not in {@code keep}. */
	void retainSkills(Set<Long> keep) {
		skills.removeIf(skill -> !keep.contains(skill.getSkill().getId()));
	}

}
