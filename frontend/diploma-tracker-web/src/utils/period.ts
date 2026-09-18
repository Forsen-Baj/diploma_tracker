export function formatPeriod(startDate: string | null, deadline: string, formatter: Intl.DateTimeFormat): string {
  const deadlineText = formatter.format(new Date(deadline))
  return startDate ? `${formatter.format(new Date(startDate))} – ${deadlineText}` : deadlineText
}
