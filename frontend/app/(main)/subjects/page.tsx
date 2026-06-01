import { gqlFetch } from "@/lib/graphql"
import { SubjectsQuery, type Subject } from "@/lib/graphql/operations"
import { SubjectsTable } from "./subjects-table"

export default async function SubjectsPage() {
  const data = await gqlFetch<{ subjects: Subject[] }>(SubjectsQuery)

  return (
    <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
      <SubjectsTable initialData={data.subjects} />
    </div>
  )
}
