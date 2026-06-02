"use client"

import * as React from "react"
import { createClient } from "graphql-ws"
import type { ColumnDef } from "@tanstack/react-table"
import { DataTable } from "@/components/custom/data-table"
import { gqlFetch } from "@/lib/graphql"
import {
  GradeCountQuery,
  GradeUpdatesSubscription,
  RecentGradesQuery,
  SemestersQuery,
  type GradeEvent,
  type Semester,
} from "@/lib/graphql/operations"
import { formatSemester } from "@/lib/format"
import { cn } from "@/lib/utils"

const MAX_ROWS = 20

function buildColumns(semesterMap: Map<number, string>): ColumnDef<GradeEvent>[] {
  return [
    {
      accessorKey: "studentId",
      header: "Student ID",
      meta: { compact: true },
      enableSorting: false,
    },
    {
      accessorKey: "subjectCode",
      header: "Subject Code",
      meta: { compact: true },
      enableSorting: false,
    },
    {
      accessorKey: "semesterId",
      header: "Semester",
      enableSorting: false,
      cell: ({ row }) => {
        const label = semesterMap.get(row.original.semesterId)
        return label ?? `Semester ${row.original.semesterId}`
      },
    },
    {
      accessorKey: "grade",
      header: "Grade",
      meta: { compact: true },
      enableSorting: false,
      cell: ({ row }) => (
        <span className={cn("tabular-nums", row.original.grade < 75 && "text-destructive")}>
          {row.original.grade.toFixed(2)}
        </span>
      ),
    },
  ]
}

export function DashboardGradesFeed() {
  const [events, setEvents] = React.useState<GradeEvent[]>([])
  const [semesterMap, setSemesterMap] = React.useState<Map<number, string>>(new Map())
  const [gradeCount, setGradeCount] = React.useState<number | null>(null)
  const [loadKey, setLoadKey] = React.useState(0)
  const [newEvent, setNewEvent] = React.useState<GradeEvent | null>(null)

  const columns = React.useMemo(() => buildColumns(semesterMap), [semesterMap])

  React.useEffect(() => {
    gqlFetch<{ semesters: Semester[] }>(SemestersQuery)
      .then((d) =>
        setSemesterMap(
          new Map(d.semesters.map((s) => [s.semesterId, `${s.schoolYear} ${formatSemester(s.semester)}`]))
        )
      )
      .catch(console.error)
    gqlFetch<{ gradeCount: number }>(GradeCountQuery)
      .then((d) => setGradeCount(d.gradeCount))
      .catch(console.error)
  }, [])

  React.useEffect(() => {
    gqlFetch<{ recentGrades: GradeEvent[] }>(RecentGradesQuery, { limit: MAX_ROWS })
      .then((d) => setEvents(d.recentGrades))
      .catch(console.error)
  }, [loadKey])

  React.useEffect(() => {
    const wsUrl =
      (window.location.protocol === "https:" ? "wss:" : "ws:") +
      "//" +
      window.location.host +
      "/graphql"
    const client = createClient({ url: wsUrl })
    const unsub = client.subscribe<{ gradeUpdates: GradeEvent }>(
      { query: GradeUpdatesSubscription },
      {
        next: ({ data }) => {
          if (data?.gradeUpdates) {
            const event = data.gradeUpdates
            setEvents((prev) => [event, ...prev].slice(0, MAX_ROWS))
            setGradeCount((n) => (n !== null ? n + 1 : null))
            setNewEvent(event)
            setTimeout(() => setNewEvent(null), 1500)
          }
        },
        error: console.error,
        complete: () => {},
      }
    )
    return () => {
      unsub()
      client.dispose()
    }
  }, [])

  return (
    <DataTable
      columns={columns}
      data={events}
      onReload={() => setLoadKey((k) => k + 1)}
      disablePagination={true}
      footerContent={
        gradeCount !== null ? (
          <>
            {gradeCount.toLocaleString()} total grades recorded
          </>
        ) : null
      }
      isNewRow={(row) => row === newEvent}
      newRowClass={(row) => row.grade >= 75 ? "animate-new-row-enter" : "animate-new-row-enter-fail"}
    />
  )
}
