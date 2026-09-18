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
  diplomaTopic: string | null
  groupId: string | null
  groupCode: string | null
  groupName: string | null
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
  diplomaTopic?: string
  groupId: string
  supervisorId?: string
}

export type UpdateStudentRequest = {
  firstName: string
  lastName: string
  patronymic?: string
  email: string
  studentNumber: string
  diplomaTopic?: string
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
  name: string | null
  description: string | null
  academicYear: string
  createdAt: string
  updatedAt: string
}

export type CreateGroupRequest = {
  departmentId: string
  code: string
  name?: string
  description?: string
  academicYear: string
}

export type UpdateGroupRequest = {
  departmentId: string
  code: string
  name?: string
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
  diplomaTopic: string | null
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
  groupName: string | null
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

export type MyStudentTask = {
  id: string
  groupTaskId: string
  taskTemplateId: string
  title: string
  description: string | null
  order: number
  startDate: string | null
  deadline: string
  status: string
  displayStatus: string
  currentMark: number | null
  completedAt: string | null
  latestSubmissionAt: string | null
  latestReviewerComment: string | null
  createdAt: string
  updatedAt: string | null
}

export type StudentTaskSubmissionHistoryItem = {
  id: string
  originalFileName: string
  submittedAt: string
  isLate: boolean
  comment: string | null
}

export type StudentTaskReviewHistoryItem = {
  id: string
  reviewerFirstName: string
  reviewerLastName: string
  mark: number | null
  comment: string | null
  decision: string | null
  createdAt: string
}

export type MyStudentTaskDetails = {
  id: string
  groupTaskId: string
  taskTemplateId: string
  title: string
  description: string | null
  order: number
  startDate: string | null
  deadline: string
  status: string
  displayStatus: string
  currentMark: number | null
  completedAt: string | null
  createdAt: string
  updatedAt: string | null
  submissions: StudentTaskSubmissionHistoryItem[]
  reviews: StudentTaskReviewHistoryItem[]
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
