import { gqlFetch } from "@/lib/graphql"
import { SemestersQuery, type Semester } from "@/lib/graphql/operations"
import { SemestersTable } from "./semesters-table"

export default async function SemestersPage() {
  const data = await gqlFetch<{ semesters: Semester[] }>(SemestersQuery)

  return (
    <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
      <SemestersTable initialData={data.semesters} />
    </div>
  )
}
