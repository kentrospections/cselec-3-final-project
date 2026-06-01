"use client"

import { useRouter } from "next/navigation"
import type { ColumnDef } from "@tanstack/react-table"
import { DataTable } from "@/components/custom/data-table"
import type { Semester } from "@/lib/graphql/operations"
import { formatSemester } from "@/lib/format"
import { SemesterComparisonDrawer } from "./semester-drawer"

const columns: ColumnDef<Semester>[] = [
  {
    accessorKey: "semesterId",
    header: "ID",
    meta: { compact: true },
  },
  {
    accessorKey: "schoolYear",
    header: "School Year",
  },
  {
    accessorKey: "semester",
    header: "Semester",
    cell: ({ row }) => formatSemester(row.original.semester),
  },
]

export function SemestersTable({ initialData }: { initialData: Semester[] }) {
  const router = useRouter()
  return (
    <DataTable
      columns={columns}
      data={initialData}
      onReload={() => router.refresh()}
      renderDrawer={(row) => <SemesterComparisonDrawer semester={row} />}
    />
  )
}
