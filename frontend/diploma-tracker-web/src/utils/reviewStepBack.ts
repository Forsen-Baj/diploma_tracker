import type { Location, NavigateOptions } from 'react-router-dom'

// O2: a step page (/review/steps/:id) is opened from several places - the review queue, a
// group's own progress view, or a group progress card on a dashboard - and must return to
// whichever one the viewer came from, not always to /review. The opener passes this as
// react-router location state; ReviewStepPage reads it back and falls back to /review when
// it is absent (a pasted URL or a reload drops state).
export type StepBackKind = 'group' | 'dashboard'

export type StepBackState = {
  backTo: string
  backKind: StepBackKind
}

/** Built from the opener's own location: `${pathname}${search}`, so any query string / selected tab travels with it. */
export function stepBackNavigation(location: Pick<Location, 'pathname' | 'search'>, backKind: StepBackKind): NavigateOptions {
  return { state: { backTo: `${location.pathname}${location.search}`, backKind } satisfies StepBackState }
}
