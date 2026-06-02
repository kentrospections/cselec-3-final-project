"use client"

import * as React from "react"
import NumberFlow from "@number-flow/react"
import { createClient } from "graphql-ws"
import { TrendingUpIcon, TrendingDownIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { gqlFetch } from "@/lib/graphql"
import {
  GradeCountQuery,
  GradeUpdatesSubscription,
  OverallAverageGpaQuery,
  StudentsQuery,
  type GradeEvent,
  type StudentSummary,
} from "@/lib/graphql/operations"

const greenBadge = "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"

export function DashboardCards() {
  const [students, setStudents] = React.useState<StudentSummary[] | null>(null)
  const [gradeCount, setGradeCount] = React.useState<number | null>(null)
  const [overallAvgGpa, setOverallAvgGpa] = React.useState<number | null>(null)

  React.useEffect(() => {
    gqlFetch<{ students: StudentSummary[] }>(StudentsQuery)
      .then((d) => setStudents(d.students))
      .catch(console.error)
    gqlFetch<{ gradeCount: number }>(GradeCountQuery)
      .then((d) => setGradeCount(d.gradeCount))
      .catch(console.error)
    gqlFetch<{ overallAverageGpa: number }>(OverallAverageGpaQuery)
      .then((d) => setOverallAvgGpa(d.overallAverageGpa))
      .catch(console.error)
  }, [])

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
          if (data?.gradeUpdates) setGradeCount((n) => (n !== null ? n + 1 : null))
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

  const total = students?.length ?? null
  const atRisk = students?.filter((s) => s.isAtRisk).length ?? null
  const avgGpa = overallAvgGpa
  const atRiskPct = total && atRisk !== null ? ((atRisk / total) * 100).toFixed(1) : null
  const atRiskGood = atRiskPct !== null && parseFloat(atRiskPct) <= 20

  return (
    <div className="grid grid-cols-1 gap-4 px-4 *:data-[slot=card]:bg-linear-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs lg:px-6 @xl/main:grid-cols-2 @5xl/main:grid-cols-4 dark:*:data-[slot=card]:bg-card">
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Total Students</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {total !== null ? <NumberFlow value={total} /> : "—"}
          </CardTitle>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            Enrolled students
          </div>
          <div className="text-muted-foreground">Across all courses and semesters</div>
        </CardFooter>
      </Card>

      <Card className="@container/card">
        <CardHeader>
          <CardDescription>At-Risk Students</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {atRisk !== null ? <NumberFlow value={atRisk} /> : "—"}
          </CardTitle>
          {atRiskPct !== null && (
            <CardAction>
              <Badge
                variant={atRiskGood ? "outline" : "destructive"}
                className={atRiskGood ? greenBadge : undefined}
              >
                {atRiskGood ? <TrendingDownIcon /> : <TrendingUpIcon />}
                {atRiskPct}%
              </Badge>
            </CardAction>
          )}
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            Risk score ≥ 50%
          </div>
          <div className="text-muted-foreground">Flagged for academic support</div>
        </CardFooter>
      </Card>

      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Grades Recorded</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {gradeCount !== null ? <NumberFlow value={gradeCount} /> : "—"}
          </CardTitle>
          <CardAction>
            <Badge variant="outline" className="border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400">
              <span className="mr-1 inline-block size-1.5 rounded-full bg-red-500 animate-pulse" />
              Live
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            Updates in real-time
          </div>
          <div className="text-muted-foreground">Total grade events processed</div>
        </CardFooter>
      </Card>

      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Average GPA</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {avgGpa !== null ? (
              <NumberFlow value={avgGpa} format={{ minimumFractionDigits: 2, maximumFractionDigits: 2 }} />
            ) : "—"}
          </CardTitle>
          {avgGpa !== null && (
            <CardAction>
              {avgGpa >= 75 ? (
                <Badge variant="outline" className={greenBadge}>
                  <TrendingUpIcon />
                  Passing
                </Badge>
              ) : (
                <Badge variant="destructive">
                  <TrendingDownIcon />
                  Below avg
                </Badge>
              )}
            </CardAction>
          )}
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            Across all grade records
          </div>
          <div className="text-muted-foreground">Population weighted average (by credit units)</div>
        </CardFooter>
      </Card>
    </div>
  )
}
