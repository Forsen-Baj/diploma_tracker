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
  decision: 'Approved' | 'Returned' | null
  reviewerName: string | null
  reviewerComment: string | null
  mark: number | null
  decidedAt: string | null
  files: SubmissionFileInfo[]
}

export type StepDetails = StudentStep & {
  studentProfileId: string
  studentName: string
  groupCode: string
  canReview: boolean
  pendingSubmissionId: string | null
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
}

export type GroupProgress = {
  groupId: string
  groupCode: string
  steps: { groupTaskId: string; title: string; order: number; deadline: string; approvedCount: number }[]
  students: {
    studentProfileId: string
    name: string
    cells: { groupTaskId: string; studentTaskId: string; status: StudentTaskStatus; mark: number | null; isLate: boolean }[]
  }[]
}

export type StudentProgress = {
  studentProfileId: string
  approved: number
  total: number
  lateSubmissions: number
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
