// Phase 8 §9. Every check script registers what it creates as it creates it, and the registry is
// drained in a `finally` - so a run that fails at check 12 of 60 still leaves the seeded data as
// it found it. Undo steps run newest-first, never assert, and never stop each other: a failure
// here is reported at the end, not thrown, because the script's own result is what matters.
export function createCleanup() {
  const undos = []
  const failures = []

  return {
    // Register an undo step. `label` appears in the report if it fails.
    add(label, undo) {
      undos.push({ label, undo })
    },

    // Run every registered step, newest first. Safe to call twice.
    async run() {
      while (undos.length > 0) {
        const { label, undo } = undos.pop()
        try {
          await undo()
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
