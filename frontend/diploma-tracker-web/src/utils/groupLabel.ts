export function groupLabel(group: { code: string; name: string | null }): string {
  return group.name ? `${group.code} · ${group.name}` : group.code
}
