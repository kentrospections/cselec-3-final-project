"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import type { ColumnDef } from "@tanstack/react-table"
import { Badge } from "@/components/ui/badge"
import { DataTable } from "@/components/custom/data-table"
import { cn } from "@/lib/utils"
import type { StudentSummary } from "@/lib/graphql/operations"
import { StudentDetailDrawer } from "./student-drawer"

const columns: ColumnDef<StudentSummary>[] = [
  {
    accessorKey: "studentId",
    header: "ID",
    meta: { compact: true },
  },
  {
    accessorKey: "name",
    header: "Name",
  },
  {
    accessorKey: "course",
    header: "Course",
  },
  {
    accessorKey: "gpa",
    header: "GPA",
    cell: ({ row }) => (
      <span className={cn("tabular-nums", row.original.gpa < 75 && "text-destructive")}>
        {row.original.gpa.toFixed(2)}
      </span>
    ),
  },
  {
    accessorKey: "isAtRisk",
    header: "Status",
    cell: ({ row }) =>
      row.original.isAtRisk ? (
        <Badge variant="destructive">At risk</Badge>
      ) : (
        <Badge variant="secondary">Normal</Badge>
      ),
  },
  {
    accessorKey: "atRiskScore",
    header: "Risk Score",
    cell: ({ row }) => `${(row.original.atRiskScore * 100).toFixed(0)}%`,
  },
]

const primaryFilterOptions = [
  { label: "All", value: undefined },
  { label: "At risk", value: "true" },
  { label: "Not at risk", value: "false" },
]

interface StudentsTableProps {
  initialData: StudentSummary[]
  atRisk: boolean | undefined
}

export function StudentsTable({ initialData, atRisk }: StudentsTableProps) {
  const router = useRouter()
  const [selectedCourses, setSelectedCourses] = React.useState<Set<string>>(
    new Set()
  )

  const uniqueCourses = React.useMemo(
    () => Array.from(new Set(initialData.map((s) => s.course))).sort(),
    [initialData]
  )

  const filteredData = React.useMemo(() => {
    if (selectedCourses.size === 0) return initialData
    return initialData.filter((s) => selectedCourses.has(s.course))
  }, [initialData, selectedCourses])

  const handlePrimaryFilter = (value: string | undefined) => {
    if (value === "true") {
      router.replace("?at_risk=true")
    } else if (value === "false") {
      router.replace("?at_risk=false")
    } else {
      router.replace("?")
    }
  }

  const toggleCourse = (course: string) => {
    setSelectedCourses((prev) => {
      const next = new Set(prev)
      if (next.has(course)) {
        next.delete(course)
      } else {
        next.add(course)
      }
      return next
    })
  }

  return (
    <DataTable
      columns={columns}
      data={filteredData}
      onReload={() => router.refresh()}
      primaryFilter={{
        placeholder: "Filter students",
        options: primaryFilterOptions,
        value: atRisk === true ? "true" : atRisk === false ? "false" : undefined,
        onChange: handlePrimaryFilter,
      }}
      secondaryFilter={{
        label: "Courses",
        options: uniqueCourses,
        selected: selectedCourses,
        onToggle: toggleCourse,
      }}
      renderDrawer={(row) => <StudentDetailDrawer student={row} />}
    />
  )
}
