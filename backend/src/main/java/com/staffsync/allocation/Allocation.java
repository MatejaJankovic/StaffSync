package com.staffsync.allocation;

import java.time.Instant;
import java.time.LocalDate;

import com.staffsync.request.StaffingRequest;
import com.staffsync.user.User;
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
import jakarta.persistence.Table;

@Entity
@Table(name = "allocation")
public class Allocation {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "request_id", nullable = false)
	private StaffingRequest request;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "employee_id", nullable = false)
	private User employee;

	/** Taken from the request by default. In [10, 100], in steps of 10. */
	@Column(nullable = false)
	private int percent;

	@Column(name = "start_date", nullable = false)
	private LocalDate startDate;

	@Column(name = "end_date", nullable = false)
	private LocalDate endDate;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false, length = 20)
	private AllocationStatus status = AllocationStatus.PROPOSED;

	/** The PM who proposed the employee. */
	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "proposed_by_id", nullable = false)
	private User proposedBy;

	/** The RM who made the last decision, on the allocation or on a change. */
	@ManyToOne(fetch = FetchType.LAZY)
	@JoinColumn(name = "decided_by_id")
	private User decidedBy;

	@Column(name = "decision_comment", length = 1000)
	private String decisionComment;

	@Column(name = "created_at", nullable = false, updatable = false)
	private Instant createdAt = Instant.now();

	@Column(name = "decided_at")
	private Instant decidedAt;

	// The pending* fields and changeReason are set only while the status is CHANGE_PENDING (BR-15).
	// Until the RM approves the change, capacity uses the current values above (BR-16).
	@Column(name = "pending_percent")
	private Integer pendingPercent;

	@Column(name = "pending_start_date")
	private LocalDate pendingStartDate;

	@Column(name = "pending_end_date")
	private LocalDate pendingEndDate;

	@Column(name = "change_reason", length = 1000)
	private String changeReason;

	protected Allocation() {
	}

	public Allocation(StaffingRequest request, User employee, int percent, LocalDate startDate, LocalDate endDate,
			User proposedBy) {
		this.request = request;
		this.employee = employee;
		this.percent = percent;
		this.startDate = startDate;
		this.endDate = endDate;
		this.proposedBy = proposedBy;
	}

	/** APPROVED or CHANGE_PENDING (BR-16). */
	public boolean isActive() {
		return status.isActive();
	}

	public boolean hasPendingChange() {
		return status == AllocationStatus.CHANGE_PENDING;
	}

	/** Records a change request and moves the allocation to CHANGE_PENDING (BR-15). */
	public void requestChange(int newPercent, LocalDate newStartDate, LocalDate newEndDate, String reason) {
		this.pendingPercent = newPercent;
		this.pendingStartDate = newStartDate;
		this.pendingEndDate = newEndDate;
		this.changeReason = reason;
		this.status = AllocationStatus.CHANGE_PENDING;
	}

	/** Applies the pending values and goes back to APPROVED (RM approved the change). */
	public void applyPendingChange() {
		this.percent = pendingPercent;
		this.startDate = pendingStartDate;
		this.endDate = pendingEndDate;
		clearPendingChange();
	}

	/** Drops the pending values and goes back to APPROVED with the old ones (RM rejected or PM withdrew). */
	public void clearPendingChange() {
		this.pendingPercent = null;
		this.pendingStartDate = null;
		this.pendingEndDate = null;
		this.changeReason = null;
		this.status = AllocationStatus.APPROVED;
	}

	/** Stores who decided, when, and why (the comment is required for rejections, BR-6). */
	public void recordDecision(User rm, String comment) {
		this.decidedBy = rm;
		this.decisionComment = comment;
		this.decidedAt = Instant.now();
	}

	public Long getId() {
		return id;
	}

	public StaffingRequest getRequest() {
		return request;
	}

	public User getEmployee() {
		return employee;
	}

	public int getPercent() {
		return percent;
	}

	public void setPercent(int percent) {
		this.percent = percent;
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

	public AllocationStatus getStatus() {
		return status;
	}

	public void setStatus(AllocationStatus status) {
		this.status = status;
	}

	public User getProposedBy() {
		return proposedBy;
	}

	public User getDecidedBy() {
		return decidedBy;
	}

	public String getDecisionComment() {
		return decisionComment;
	}

	public Instant getCreatedAt() {
		return createdAt;
	}

	public Instant getDecidedAt() {
		return decidedAt;
	}

	public Integer getPendingPercent() {
		return pendingPercent;
	}

	public LocalDate getPendingStartDate() {
		return pendingStartDate;
	}

	public LocalDate getPendingEndDate() {
		return pendingEndDate;
	}

	public String getChangeReason() {
		return changeReason;
	}

}
