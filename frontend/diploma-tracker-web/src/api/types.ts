export type CurrentUser = {
  id: string
  firstName: string
  lastName: string
  email: string
  role: 'Admin' | 'Teacher' | 'Student'
}

export type LoginRequest = {
  email: string
  password: string
}

export type LoginResponse = {
  token: string
  user: CurrentUser
}

export type HealthResponse = {
  status: string
  application: string
}

export type Teacher = {
  id: string
  firstName: string
  lastName: string
  patronymic: string | null
  email: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export type CreateTeacherRequest = {
  firstName: string
  lastName: string
  patronymic?: string
  email: string
  password: string
}

export type UpdateTeacherRequest = {
  firstName: string
  lastName: string
  patronymic?: string
  email: string
}

export type Student = {
  id: string
  userId: string
  firstName: string
  lastName: string
  patronymic: string | null
  email: string
  studentNumber: string
  role: 'Student'
  isActive: boolean
  isClaimed: boolean
  claimReopened: boolean
  topicId: string | null
  topicTitle: string | null
  groupId: string | null
  groupCode: string | null
  supervisorId: string | null
  supervisorFirstName: string | null
  supervisorLastName: string | null
  supervisorEmail: string | null
  archivedAt: string | null
  createdAt: string
  updatedAt: string
}

export type CreateStudentRequest = {
  firstName: string
  lastName: string
  patronymic?: string
  email: string
  studentNumber: string
  password?: string
  groupId: string
  supervisorId?: string
}

export type UpdateStudentRequest = {
  firstName: string
  lastName: string
  patronymic?: string
  email: string
  studentNumber: string
  groupId: string
  supervisorId?: string
}

export type Group = {
  id: string
  departmentId: string
  departmentName: string
  facultyId: string
  facultyName: string
  code: string
  description: string | null
  academicYear: string
  createdAt: string
  updatedAt: string
}

export type CreateGroupRequest = {
  departmentId: string
  code: string
  description?: string
  academicYear: string
}

export type UpdateGroupRequest = {
  departmentId: string
  code: string
  description?: string
  academicYear: string
}

export type GroupDeletionPreview = {
  activeStudentCount: number
  archivedStudentCount: number
  fileCount: number
  documentCount: number
}

export type GroupReviewer = {
  id: string
  groupId: string
  reviewerId: string
  firstName: string
  lastName: string
  email: string
  createdAt: string
}

export type AddGroupReviewerRequest = {
  reviewerId: string
}

export type GroupStudent = {
  studentProfileId: string
  userId: string
  groupCode: string
  firstName: string
  lastName: string
  email: string
  studentNumber: string
  isActive: boolean
  isClaimed: boolean
  topicTitle: string | null
  supervisorId: string | null
  supervisorFirstName: string | null
  supervisorLastName: string | null
  supervisorEmail: string | null
  createdAt: string
  updatedAt: string
}

export type TaskTemplate = {
  id: string
  facultyId: string
  facultyName: string
  title: string
  description: string | null
  order: number
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export type CreateTaskTemplateRequest = {
  facultyId: string
  title: string
  description: string
  order: number
}

export type UpdateTaskTemplateRequest = {
  facultyId: string
  title: string
  description: string
  order: number
  isActive: boolean
}

export type GroupTask = {
  id: string
  groupId: string
  groupCode: string
  taskTemplateId: string
  taskTitle: string
  taskDescription: string | null
  taskOrder: number
  startDate: string | null
  deadline: string
  createdAt: string
  updatedAt: string | null
  studentTaskCount: number
}

export type CreateGroupTaskRequest = {
  groupId: string
  taskTemplateId: string
  startDate?: string
  deadline: string
}

export type UpdateGroupTaskRequest = {
  startDate?: string
  deadline: string
}

export type AssignTaskTemplateDeadlineRequest = {
  taskTemplateId: string
  startDate?: string
  deadline: string
}

export type AssignAllTaskTemplatesRequest = {
  items: AssignTaskTemplateDeadlineRequest[]
}

export type AssignAllTaskTemplatesResponse = {
  groupId: string
  createdGroupTaskCount: number
  skippedExistingGroupTaskCount: number
  createdStudentTaskCount: number
  groupTasks: GroupTask[]
}

export type Faculty = {
  id: string
  name: string
  shortName: string
  createdAt: string
  updatedAt: string
}

export type FacultyRequest = {
  name: string
  shortName: string
}

export type Department = {
  id: string
  facultyId: string
  facultyName: string
  name: string
  shortName: string
  createdAt: string
  updatedAt: string
}

export type DepartmentRequest = {
  facultyId: string
  name: string
  shortName: string
}

export type RegistrationStatus = {
  open: boolean
}

export type ClaimAccountRequest = {
  email: string
  studentNumber: string
  password: string
}

export type ChangePasswordRequest = {
  currentPassword: string
  newPassword: string
}

export type SkippedImportRow = {
  line: number
  email: string
}

export type ImportRowError = {
  line: number
  code: string
  message: string
  params: Record<string, string> | null
}

export type StudentImportResult = {
  created: number
  skipped: SkippedImportRow[]
}

export type Admin = {
  id: string
  firstName: string
  lastName: string
  patronymic: string | null
  email: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export type CreateAdminRequest = {
  firstName: string
  lastName: string
  patronymic?: string
  email: string
  password: string
}

export type UpdateAdminRequest = {
  firstName: string
  lastName: string
  patronymic?: string
  email: string
}

export type SetAdminPasswordRequest = {
  password: string
}

export type ArchiveStudentsRequest = {
  studentIds: string[]
}

export type ArchiveStudentsResponse = {
  archived: number
}

export type RestoreStudentsRequest = {
  studentIds: string[]
}

export type RestoreStudentsResponse = {
  restored: number
}

export type ArchiveGroupStudentsResponse = {
  archived: number
}

export type TopicStatus = 'Available' | 'Reserved' | 'Approved'
export type TopicOrigin = 'Catalogue' | 'StudentProposal'
export type ReservationStatus = 'Pending' | 'Approved' | 'Rejected' | 'Cancelled' | 'Released'

export type Topic = {
  id: string
  title: string
  description: string | null
  supervisorId: string
  supervisorName: string
  departmentId: string
  departmentName: string
  facultyName: string
  origin: TopicOrigin
  status: TopicStatus
  activeReservationId: string | null
  activeReservationStatus: ReservationStatus | null
  studentProfileId: string | null
  studentName: string | null
  groupCode: string | null
  createdAt: string
  updatedAt: string
}

export type TopicRequest = {
  title: string
  description?: string
  departmentId: string
  supervisorId?: string
}

export type TopicQuery = {
  search?: string
  supervisorId?: string
  departmentId?: string
  status?: TopicStatus
}

export type Reservation = {
  id: string
  topicId: string | null
  topicTitle: string
  topicDescription: string | null
  origin: TopicOrigin | null
  supervisorId: string | null
  supervisorName: string | null
  studentProfileId: string
  studentName: string
  studentEmail: string
  groupCode: string
  status: ReservationStatus
  decisionComment: string | null
  createdAt: string
  decidedAt: string | null
  canCancel: boolean
  /** Set only on a pending change request: the topic the student holds today. */
  currentTopicId: string | null
  currentTopicTitle: string | null
}

export type ProposeTopicRequest = {
  title: string
  description?: string
  supervisorId: string
}

export type TopicSelectionSettings = {
  deadline: string | null
}

export type SupervisorOption = {
  id: string
  name: string
}

export type StudentTaskStatus = 'Pending' | 'Submitted' | 'Approved' | 'Returned'

export type ReviewSeat = 'Supervisor' | 'Extra'

export type PanelSeat = {
  seat: ReviewSeat
  /** Null only for a supervisor seat whose student has no supervisor. */
  reviewerId: string | null
  reviewerName: string | null
  isActive: boolean
  state: 'Approved' | 'Returned' | 'Waiting'
  mark: number | null
  canRemove: boolean
}

export type SubmissionReview = {
  id: string
  reviewerName: string
  seat: ReviewSeat
  decision: 'Approved' | 'Returned'
  mark: number | null
  comment: string | null
  decidedAt: string
}

export type StaffOption = {
  id: string
  name: string
  role: 'Admin' | 'Teacher'
  email: string
}

export type StudentStep = {
  id: string
  groupTaskId: string
  title: string
  description: string | null
  order: number
  deadline: string
  status: StudentTaskStatus
  mark: number | null
  completedAt: string | null
  isLate: boolean
  latestSubmittedAt: string | null
  canSubmit: boolean
  blockReason: string | null
  panelSize: number
  panelApproved: number
}

export type SubmissionFileInfo = {
  id: string
  kind: 'Main' | 'Supporting'
  originalName: string
  sizeBytes: number
}

export type Submission = {
  id: string
  version: number
  message: string | null
  submittedAt: string
  isLate: boolean
  /** The version's outcome: null while the panel decides. */
  decision: 'Approved' | 'Returned' | null
  decidedAt: string | null
  reviews: SubmissionReview[]
  files: SubmissionFileInfo[]
}

export type StepDetails = StudentStep & {
  studentProfileId: string
  studentName: string
  groupCode: string
  canDecide: boolean
  pendingSubmissionId: string | null
  canManagePanel: boolean
  panel: PanelSeat[]
  timeline: Submission[]
}

export type ReviewQueueItem = {
  submissionId: string
  studentTaskId: string
  studentProfileId: string
  studentName: string
  groupId: string
  groupCode: string
  stepTitle: string
  stepOrder: number
  version: number
  submittedAt: string
  isLate: boolean
  panelSize: number
  panelApproved: number
}

export type GroupProgress = {
  groupId: string
  groupCode: string
  steps: { groupTaskId: string; title: string; order: number; deadline: string; approvedCount: number }[]
  students: {
    studentProfileId: string
    name: string
    canOpen: boolean
    cells: {
      groupTaskId: string
      studentTaskId: string
      status: StudentTaskStatus
      mark: number | null
      isLate: boolean
      isOverdue: boolean
      panelApproved: number | null
      panelSize: number | null
    }[]
  }[]
}

export type StudentProgress = {
  studentProfileId: string
  approved: number
  total: number
  lateSteps: number
  averageMark: number | null
  nextDeadline: string | null
}

export type NamedOption = {
  id: string
  name: string
}

export type TemplateAudience = {
  visibleToAllStudents: boolean
  visibleToAllTeachers: boolean
  groups: NamedOption[]
  teachers: NamedOption[]
}

export type DocumentTemplate = {
  id: string
  name: string
  description: string | null
  ownerId: string
  ownerName: string
  originalFileName: string
  sizeBytes: number
  createdAt: string
  updatedAt: string
  canManage: boolean
  audience: TemplateAudience | null
}

export type TemplateInput = {
  name: string
  description?: string
  visibleToAllStudents: boolean
  visibleToAllTeachers: boolean
  groupIds: string[]
  teacherIds: string[]
}

export type MarkerInfo = {
  key: string
  marker: string
}

// Pre-flight A1: the group is identified only by its code, so the selector label (and the value
// this field carries) is the group code, not a name.
export type EligibleStudent = {
  id: string
  name: string
  groupCode: string
  groupAcademicYear: string
}

export type Paged<T> = {
  items: T[]
  page: number
  pageSize: number
  total: number
}

export type LatestDecision = {
  studentTaskId: string
  submissionId: string
  stepTitle: string
  stepOrder: number
  version: number
  decision: 'Approved' | 'Returned'
  mark: number | null
  reviewerName: string | null
  reviewerComment: string | null
  decidedAt: string
}

export type StudentDashboard = {
  progress: StudentProgress
  latestDecision: LatestDecision | null
}

export type DashboardGroupRow = {
  groupId: string
  groupCode: string
  academicYear: string
  departmentName: string
  studentCount: number
  approvedTopicCount: number
  stepsApproved: number
  stepsTotal: number
  waitingReviews: number
  lateSteps: number
  overdueSteps: number
}

export type OverdueStepRow = {
  studentTaskId: string
  studentProfileId: string
  studentName: string
  groupId: string
  groupCode: string
  stepTitle: string
  stepOrder: number
  deadline: string
  daysOverdue: number
}

export type SupervisedStudentRow = {
  studentProfileId: string
  studentName: string
  groupId: string
  groupCode: string
  topicTitle: string | null
  currentStepTitle: string | null
  currentStepStatus: StudentTaskStatus | null
  nextDeadline: string | null
}

export type TeacherDashboard = {
  waitingReviews: number
  latestForReview: ReviewQueueItem[]
  overdueSteps: OverdueStepRow[]
  supervisedStudents: SupervisedStudentRow[]
  groups: DashboardGroupRow[]
}

export type AdminDashboard = {
  topicSelection: {
    totalStudents: number
    withApprovedTopic: number
    withPendingRequest: number
    withoutTopic: number
    deadline: string | null
    isOpen: boolean
  }
  reviewBacklog: {
    waitingReviews: number
    waitingLate: number
    overdueSteps: number
  }
  structure: {
    faculties: number
    departments: number
    groups: number
    activeStudents: number
    unclaimedAccounts: number
    teachers: number
    topicsAvailable: number
    topicsReserved: number
    topicsApproved: number
  }
  groups: DashboardGroupRow[]
}

export type ArchivedGroupSummary = {
  id: string
  groupCode: string
  academicYear: string
  departmentName: string
  facultyName: string
  groupDeletedAt: string | null
  studentCount: number
  fileCount: number
  totalSizeBytes: number
  createdAt: string
  updatedAt: string
}

export type ArchivedFile = {
  id: string
  studentName: string
  studentNumber: string
  stepTitle: string
  stepOrder: number
  deadline: string
  version: number
  submittedAt: string
  isLate: boolean
  decision: 'Approved' | 'Returned' | null
  mark: number | null
  decidedAt: string | null
  kind: 'Main' | 'Supporting'
  originalName: string
  sizeBytes: number
}

export type ArchivedReview = {
  id: string
  studentName: string
  studentNumber: string
  stepTitle: string
  stepOrder: number
  version: number
  reviewerName: string
  seat: ReviewSeat
  decision: 'Approved' | 'Returned'
  mark: number | null
  comment: string | null
  decidedAt: string
}

export type ArchivedGroupDetails = ArchivedGroupSummary & {
  reviewerNames: string[]
  files: ArchivedFile[]
  reviews: ArchivedReview[]
}

export type ArchiveUsage = {
  groupCount: number
  fileCount: number
  totalSizeBytes: number
}

export type DocumentState = 'WithOwner' | 'InCirculation' | 'Completed'
export type DocumentPurpose = 'Review' | 'Signing'
export type DocumentBoxName = 'review' | 'signing' | 'mine' | 'handled'
export type DocumentEventKind = 'Created' | 'VersionAdded' | 'Sent' | 'Forwarded' | 'Done' | 'Rejected' | 'Recalled'

export type DocumentListItem = {
  id: string
  title: string
  ownerName: string
  state: DocumentState
  purpose: DocumentPurpose | null
  holderName: string | null
  fromName: string | null
  comment: string | null
  since: string | null
  updatedAt: string
  isRejected: boolean
}

export type DocumentCounts = {
  review: number
  signing: number
}

export type DocumentVersion = {
  id: string
  number: number
  uploadedByName: string
  originalName: string
  sizeBytes: number
  uploadedAt: string
}

export type DocumentEvent = {
  sequence: number
  kind: DocumentEventKind
  actorName: string
  actorRemoved: boolean
  recipientName: string | null
  purpose: DocumentPurpose | null
  comment: string | null
  versionNumber: number | null
  at: string
}

export type DocumentPerson = {
  id: string
  name: string
  isDefault: boolean
}

export type DocumentDetails = {
  id: string
  title: string
  description: string | null
  ownerName: string
  isOwner: boolean
  state: DocumentState
  purpose: DocumentPurpose | null
  holderName: string | null
  isHolder: boolean
  sequence: number
  completedByName: string | null
  rejection: { fromName: string; comment: string | null; at: string } | null
  versions: DocumentVersion[]
  events: DocumentEvent[]
  canEdit: boolean
  canDelete: boolean
  canSend: boolean
  canAddVersion: boolean
  canForward: boolean
  canReject: boolean
  canDone: boolean
  canRecall: boolean
  signedCopyRequired: boolean
  rejectTargets: DocumentPerson[]
}

export type DocumentRecipient = {
  id: string
  name: string
  role: 'Admin' | 'Teacher' | 'Student'
  groupCode: string | null
}
