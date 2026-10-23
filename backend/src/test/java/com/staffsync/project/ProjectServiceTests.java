package com.staffsync.project;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import com.staffsync.allocation.AllocationService;
import com.staffsync.auth.AuthUser;
import com.staffsync.common.BusinessException;
import com.staffsync.common.NotFoundException;
import com.staffsync.project.dto.ProjectDto;
import com.staffsync.request.RequestStatus;
import com.staffsync.request.StaffingRequest;
import com.staffsync.request.StaffingRequestRepository;
import com.staffsync.user.Role;
import com.staffsync.user.Seniority;
import com.staffsync.user.User;
import com.staffsync.user.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.mockito.InOrder;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.test.util.ReflectionTestUtils;

/** Unit tests for the status change of {@link ProjectService} (US-24, §9, BR-11). */
@ExtendWith(MockitoExtension.class)
class ProjectServiceTests {

	static final Long PROJECT_ID = 1L;

	static final Long PM_ID = 2L;

	static final AuthUser PM = new AuthUser(PM_ID, "pm@staffsync.local", Role.PM);

	static final List<RequestStatus> OPEN_STATUSES = List.of(RequestStatus.OPEN, RequestStatus.PARTIALLY_FILLED);

	@Mock
	ProjectRepository projectRepository;

	@Mock
	UserRepository userRepository;

	@Mock
	StaffingRequestRepository requestRepository;

	@Mock
	AllocationService allocationService;

	@InjectMocks
	ProjectService projectService;

	Project project;

	@BeforeEach
	void setUp() {
		User pm = new User("pm@staffsync.local", "hash", "Mateja", "Jankovic", Role.PM);
		ReflectionTestUtils.setField(pm, "id", PM_ID);
		project = new Project("Project Alpha", "Acme", null, LocalDate.of(2026, 11, 1), LocalDate.of(2027, 3, 31),
				pm);
		ReflectionTestUtils.setField(project, "id", PROJECT_ID);
	}

	// ---- §9: the allowed moves

	@Test
	void aPlannedProjectBecomesActiveWithoutAnyCleanUp() {
		givenProject(ProjectStatus.PLANNED);

		ProjectDto result = projectService.changeStatus(PROJECT_ID, ProjectStatus.ACTIVE, PM);

		assertThat(result.status()).isEqualTo(ProjectStatus.ACTIVE);
		assertThat(project.getStatus()).isEqualTo(ProjectStatus.ACTIVE);
		verify(allocationService, never()).closeForProject(anyLong(), any());
		verify(requestRepository, never()).findByProjectIdAndStatusIn(anyLong(), any());
	}

	@ParameterizedTest
	@CsvSource({ "ACTIVE, COMPLETED", "PLANNED, CANCELLED", "ACTIVE, CANCELLED" })
	void closingAProjectCleansUpItsAllocationsAndThenItsOpenRequests(ProjectStatus from, ProjectStatus to) {
		givenProject(from);
		StaffingRequest open = request(RequestStatus.OPEN);
		StaffingRequest partiallyFilled = request(RequestStatus.PARTIALLY_FILLED);
		when(requestRepository.findByProjectIdAndStatusIn(PROJECT_ID, OPEN_STATUSES))
			.thenReturn(List.of(open, partiallyFilled));

		ProjectDto result = projectService.changeStatus(PROJECT_ID, to, PM);

		assertThat(result.status()).isEqualTo(to);
		assertThat(open.getStatus()).isEqualTo(RequestStatus.CANCELLED);
		assertThat(partiallyFilled.getStatus()).isEqualTo(RequestStatus.CANCELLED);
		// The allocations first, so the requests they leave open are cancelled too
		InOrder order = inOrder(allocationService, requestRepository);
		order.verify(allocationService).closeForProject(PROJECT_ID, LocalDate.now());
		order.verify(requestRepository).findByProjectIdAndStatusIn(PROJECT_ID, OPEN_STATUSES);
	}

	// ---- §9: everything else is a 409

	@ParameterizedTest
	@CsvSource({ "PLANNED, PLANNED", "PLANNED, COMPLETED", "ACTIVE, ACTIVE", "ACTIVE, PLANNED",
			"COMPLETED, PLANNED", "COMPLETED, ACTIVE", "COMPLETED, COMPLETED", "COMPLETED, CANCELLED",
			"CANCELLED, PLANNED", "CANCELLED, ACTIVE", "CANCELLED, COMPLETED", "CANCELLED, CANCELLED" })
	void aMoveThatIsNotAllowedIsAConflictAndChangesNothing(ProjectStatus from, ProjectStatus to) {
		givenProject(from);

		assertThatThrownBy(() -> projectService.changeStatus(PROJECT_ID, to, PM))
			.isInstanceOfSatisfying(BusinessException.class, ex -> {
				assertThat(ex.getStatus()).isEqualTo(HttpStatus.CONFLICT);
				assertThat(ex.getCode()).isEqualTo("INVALID_STATUS_TRANSITION");
			});
		assertThat(project.getStatus()).isEqualTo(from);
		verify(allocationService, never()).closeForProject(anyLong(), any());
	}

	@Test
	void theConflictMessageNamesBothStatuses() {
		givenProject(ProjectStatus.COMPLETED);

		assertThatThrownBy(() -> projectService.changeStatus(PROJECT_ID, ProjectStatus.ACTIVE, PM))
			.hasMessage("A completed project can't become active");
	}

	// ---- BR-4

	@Test
	void anotherPmCannotChangeTheStatus() {
		givenProject(ProjectStatus.ACTIVE);
		AuthUser other = new AuthUser(99L, "other@staffsync.local", Role.PM);

		assertThatThrownBy(() -> projectService.changeStatus(PROJECT_ID, ProjectStatus.CANCELLED, other))
			.isInstanceOfSatisfying(BusinessException.class, ex -> {
				assertThat(ex.getStatus()).isEqualTo(HttpStatus.FORBIDDEN);
				assertThat(ex.getCode()).isEqualTo("NOT_PROJECT_OWNER");
			});
		assertThat(project.getStatus()).isEqualTo(ProjectStatus.ACTIVE);
		verify(allocationService, never()).closeForProject(anyLong(), any());
	}

	@Test
	void anUnknownProjectIsNotFound() {
		when(projectRepository.findById(PROJECT_ID)).thenReturn(Optional.empty());

		assertThatThrownBy(() -> projectService.changeStatus(PROJECT_ID, ProjectStatus.ACTIVE, PM))
			.isInstanceOf(NotFoundException.class);
	}

	// ---- helpers

	private void givenProject(ProjectStatus status) {
		project.setStatus(status);
		when(projectRepository.findById(PROJECT_ID)).thenReturn(Optional.of(project));
	}

	private StaffingRequest request(RequestStatus status) {
		StaffingRequest request = new StaffingRequest(project, "Java Developer", Seniority.MEDIOR, 60,
				LocalDate.of(2026, 11, 1), LocalDate.of(2027, 1, 31), 2);
		request.setStatus(status);
		return request;
	}

}
