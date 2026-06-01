import { gqlFetch } from "@/lib/graphql"
import { StudentsQuery, type StudentSummary } from "@/lib/graphql/operations"
import { StudentsTable } from "./students-table"

interface PageProps {
  searchParams: Promise<{ at_risk?: string }>
}

export default async function StudentsPage({ searchParams }: PageProps) {
  const params = await searchParams
  const atRisk = params.at_risk === "true" ? true : undefined

  const data = await gqlFetch<{ students: StudentSummary[] }>(StudentsQuery, {
    atRisk,
  })

  return (
    <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
      <StudentsTable initialData={data.students} atRisk={atRisk} />
    </div>
  )
}
