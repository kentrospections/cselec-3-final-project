"use client"

import { useRouter } from "next/navigation"
import type { ColumnDef } from "@tanstack/react-table"
import { DataTable } from "@/components/custom/data-table"
import type { Subject } from "@/lib/graphql/operations"
import { SubjectAnalyticsDrawer } from "./subject-drawer"

const columns: ColumnDef<Subject>[] = [
  {
    accessorKey: "subjectCode",
    header: "Code",
    meta: { compact: true },
  },
  {
    accessorKey: "description",
    header: "Description",
  },
  {
    accessorKey: "units",
    header: "Units",
    meta: { compact: true },
  },
]

export function SubjectsTable({ initialData }: { initialData: Subject[] }) {
  const router = useRouter()
  return (
    <DataTable
      columns={columns}
      data={initialData}
      onReload={() => router.refresh()}
      renderDrawer={(row) => <SubjectAnalyticsDrawer subject={row} />}
    />
  )
}
