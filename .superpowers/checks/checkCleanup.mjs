// Phase 8 §9. Every check script registers what it creates as it creates it, and the registry is
// drained in a `finally` - so a run that fails at check 12 of 60 still leaves the seeded data as
// it found it. Undo steps run newest-first, never assert, and never stop each other: a failure
// here is reported at the end, not thrown, because the script's own result is what matters.
export function createCleanup() {
  const undos = []
  const structure = []
  const failures = []

  return {
    // Register an undo step. `label` appears in the report if it fails.
    add(label, undo) {
      undos.push({ label, undo })
    },

    // Register an undo for structure - a faculty, a department, a step template. These run after
    // every other undo (newest first among themselves), because a step cannot be deleted while a
    // group still has it and a faculty or department cannot be deleted while anything hangs off it.
    addLast(label, undo) {
      structure.push({ label, undo })
    },

    // Run every registered step, newest first. Safe to call twice.
    async run() {
      while (undos.length > 0 || structure.length > 0) {
        const { label, undo } = undos.length > 0 ? undos.pop() : structure.pop()
        try {
          // An undo that returns the API's response is judged by it: an error status means the
          // thing is still there, which must be reported rather than counted as cleaned up. A 404
          // means a check already removed it, which is what the undo wanted.
          const response = await undo()
          if (typeof response?.status === 'number' && response.status >= 400 && response.status !== 404) {
            const code = response.body?.code ?? response.data?.code ?? ''
            failures.push(`${label}: ${response.status} ${code}`.trim())
          }
        } catch (error) {
          failures.push(`${label}: ${error?.message ?? error}`)
        }
      }

      if (failures.length > 0) {
        console.log(`\nCleanup could not finish ${failures.length} step(s):`)
        for (const failure of failures) {
          console.log(`  - ${failure}`)
        }
        console.log('Remove these by hand before the next run.')
      } else {
        console.log('\nCleanup: nothing left behind.')
      }

      return failures.length === 0
    }
  }
}

// Removes a group a script created, the way the product allows (Phase 8 §4.7): archive its active
// students in place, delete the group - which deletes those students' accounts with it - and then
// purge the archive entry the deletion wrote, so neither rows nor stored files stay behind. `call`
// is the script's own request helper; either response shape (`body` or `data`) is accepted.
// Returns the first failing response, for the registry to report.
export async function removeGroup(call, token, group) {
  const payload = (response) => response.body ?? response.data
  const listed = await call('GET', `/api/groups/${group.id}/students`, { token })
  if (listed.status !== 404) {
    if (listed.status >= 400) return listed
    const studentIds = payload(listed).map((s) => s.studentProfileId)
    if (studentIds.length > 0) {
      const archived = await call('POST', '/api/students/archive', { token, json: { studentIds } })
      if (archived.status >= 400) return archived
    }
    const deleted = await call('DELETE', `/api/groups/${group.id}`, { token })
    if (deleted.status >= 400) return deleted
  }

  const archives = await call('GET', `/api/archive/groups?search=${encodeURIComponent(group.code)}`, { token })
  if (archives.status >= 400) return archives
  for (const entry of payload(archives).filter((a) => a.groupCode === group.code)) {
    const purged = await call('DELETE', `/api/archive/groups/${entry.id}`, { token })
    if (purged.status >= 400) return purged
  }
  return listed
}

// Work on the steps starts only once a student holds a topic. This gives one: a teacher creates a
// catalogue topic in the student's department and an administrator assigns it. The topic is
// deleted in the late phase, after the student's group - and with it the student's hold on the
// topic - is gone. Returns the assignment's response.
export async function giveTopic(call, cleanup, { admin, teacher, departmentId, studentId, title }) {
  const created = await call('POST', '/api/topics', { token: teacher, json: { title, departmentId } })
  const topic = created.body ?? created.data
  cleanup.addLast(`topic ${title}`, () => call('DELETE', `/api/topics/${topic.id}`, { token: admin }))
  return call('PUT', `/api/students/${studentId}/topic`, { token: admin, json: { topicId: topic.id } })
}
