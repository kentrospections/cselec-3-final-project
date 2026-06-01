const SEMESTER_LABELS: Record<string, string> = {
  FirstSem: "First Semester",
  SecondSem: "Second Semester",
  Summer: "Summer",
}

const SEMESTER_SHORT: Record<string, string> = {
  FirstSem: "S1",
  SecondSem: "S2",
  Summer: "Sum",
}

export function formatSemester(s: string): string {
  return SEMESTER_LABELS[s] ?? s
}

export function formatSemesterShort(s: string): string {
  return SEMESTER_SHORT[s] ?? s
}
