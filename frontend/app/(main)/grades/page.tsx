"use client"

import * as React from "react"
import { createClient } from "graphql-ws"
import type { ColumnDef } from "@tanstack/react-table"
import { DataTable } from "@/components/custom/data-table"
import { Spinner } from "@/components/ui/spinner"
import { gqlFetch } from "@/lib/graphql"
import {
  GradeCountQuery,
  GradesBeforeQuery,
  GradeUpdatesSubscription,
  RecentGradesQuery,
  SemestersQuery,
  type GradeEvent,
  type Semester,
} from "@/lib/graphql/operations"
import { formatSemester } from "@/lib/format"
import { cn } from "@/lib/utils"

const MAX_ROWS = 50

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
      cell: ({ row }) => {
        const grade = row.original.grade
        const passing = grade >= 75
        return (
          <span className={cn("tabular-nums", !passing && "text-destructive")}>
            {grade.toFixed(2)}
          </span>
        )
      },
    },
  ]
}

export default function GradesPage() {
  const [events, setEvents] = React.useState<GradeEvent[]>([])
  const [semesterMap, setSemesterMap] = React.useState<Map<number, string>>(new Map())
  const [gradeCount, setGradeCount] = React.useState<number | null>(null)
  const [loadKey, setLoadKey] = React.useState(0)
  const [oldestGradeId, setOldestGradeId] = React.useState<number | null>(null)
  const [hasMore, setHasMore] = React.useState(true)
  const [loadingMore, setLoadingMore] = React.useState(false)
  const sentinelRef = React.useRef<HTMLDivElement>(null)

  const columns = React.useMemo(() => buildColumns(semesterMap), [semesterMap])

  // Semester lookup — once
  React.useEffect(() => {
    gqlFetch<{ semesters: Semester[] }>(SemestersQuery)
      .then((d) => {
        setSemesterMap(
          new Map(
            d.semesters.map((s) => [
              s.semesterId,
              `${s.schoolYear} ${formatSemester(s.semester)}`,
            ])
          )
        )
      })
      .catch(console.error)
  }, [])

  // Grade count — once
  React.useEffect(() => {
    gqlFetch<{ gradeCount: number }>(GradeCountQuery)
      .then((d) => setGradeCount(d.gradeCount))
      .catch(console.error)
  }, [])

  // Historical seed — re-runs on reload
  React.useEffect(() => {
    gqlFetch<{ recentGrades: GradeEvent[] }>(RecentGradesQuery, { limit: MAX_ROWS })
      .then((d) => {
        setEvents(d.recentGrades)
        const ids = d.recentGrades.map((e) => e.gradeId).filter((id): id is number => id != null)
        setOldestGradeId(ids.length > 0 ? Math.min(...ids) : null)
        setHasMore(d.recentGrades.length >= MAX_ROWS)
      })
      .catch(console.error)
  }, [loadKey])

  // Live subscription — persistent, never restarted on reload
  React.useEffect(() => {
    const wsUrl =
      (window.location.protocol === "https:" ? "wss:" : "ws:") +
      "//" +
      window.location.host +
      "/graphql"

    const client = createClient({ url: wsUrl })

    const unsubscribe = client.subscribe<{ gradeUpdates: GradeEvent }>(
      { query: GradeUpdatesSubscription },
      {
        next: ({ data }) => {
          if (data?.gradeUpdates) {
            setEvents((prev) => [data.gradeUpdates, ...prev].slice(0, MAX_ROWS))
            setGradeCount((prev) => (prev !== null ? prev + 1 : null))
          }
        },
        error: (err) => console.error("Grade subscription error:", err),
        complete: () => {},
      }
    )

    return () => {
      unsubscribe()
      client.dispose()
    }
  }, [])

  // Infinite scroll — load older grades when sentinel is visible
  React.useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && oldestGradeId != null && !loadingMore) {
          setLoadingMore(true)
          gqlFetch<{ gradesBefore: GradeEvent[] }>(GradesBeforeQuery, {
            beforeId: oldestGradeId,
            limit: MAX_ROWS,
          })
            .then((d) => {
              if (d.gradesBefore.length === 0) {
                setHasMore(false)
                return
              }
              setEvents((prev) => [...prev, ...d.gradesBefore])
              const ids = d.gradesBefore
                .map((e) => e.gradeId)
                .filter((id): id is number => id != null)
              if (ids.length > 0) setOldestGradeId(Math.min(...ids))
              if (d.gradesBefore.length < MAX_ROWS) setHasMore(false)
            })
            .catch(console.error)
            .finally(() => setLoadingMore(false))
        }
      },
      { threshold: 0.1 }
    )

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasMore, oldestGradeId, loadingMore])

  const handleReload = React.useCallback(() => {
    setEvents([])
    setOldestGradeId(null)
    setHasMore(true)
    setLoadKey((k) => k + 1)
  }, [])

  const footerContent =
    gradeCount !== null ? `${gradeCount.toLocaleString()} grades in database` : undefined

  return (
    <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
      <DataTable
        columns={columns}
        data={events}
        onReload={handleReload}
        disablePagination
        footerContent={footerContent}
      />
      <div ref={sentinelRef} className="flex justify-center py-2 text-sm text-muted-foreground">
        {loadingMore && <Spinner className="size-5" />}
        {!hasMore && events.length > 0 && "All grades loaded"}
      </div>
    </div>
  )
}
