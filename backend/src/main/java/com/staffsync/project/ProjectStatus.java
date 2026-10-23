package com.staffsync.project;

/** §9: {@code PLANNED → ACTIVE → COMPLETED}, and {@code CANCELLED} from PLANNED or ACTIVE. */
public enum ProjectStatus {

	PLANNED, ACTIVE, COMPLETED, CANCELLED;

	/** Whether §9 allows moving from this status to {@code next}. Staying in the same status is not a move. */
	public boolean canMoveTo(ProjectStatus next) {
		return switch (this) {
			case PLANNED -> next == ACTIVE || next == CANCELLED;
			case ACTIVE -> next == COMPLETED || next == CANCELLED;
			case COMPLETED, CANCELLED -> false;
		};
	}

	/** COMPLETED or CANCELLED: the project takes no more changes, and closing it runs BR-11. */
	public boolean isClosed() {
		return this == COMPLETED || this == CANCELLED;
	}

}
