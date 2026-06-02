"use client"

import * as React from "react"
import { Area, AreaChart } from "recharts"
import { IconRefresh } from "@tabler/icons-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { ChartContainer, type ChartConfig } from "@/components/ui/chart"
import { Skeleton } from "@/components/ui/skeleton"
import { gqlFetch } from "@/lib/graphql"
import { SemesterComparisonQuery, type SemesterTrend } from "@/lib/graphql/operations"
import { formatSemesterShort } from "@/lib/format"

const sparkConfig: ChartConfig = {
  averageGpa: { color: "var(--chart-1)" },
}

interface YearGroup {
  year: number
  sems: SemesterTrend[]
  avgGpa: number
  avgPassRate: number
  atRiskCount: number
  trend: "up" | "down" | "flat"
}

function groupByYear(trends: SemesterTrend[]): YearGroup[] {
  const map: Record<number, SemesterTrend[]> = {}
  for (const t of trends) {
    ;(map[t.schoolYear] ??= []).push(t)
  }
  return Object.entries(map)
    .sort(([a], [b]) => Number(b) - Number(a))
    .map(([yearStr, sems]) => {
      const year = Number(yearStr)
      const avgGpa = sems.reduce((a, s) => a + s.averageGpa, 0) / sems.length
      const avgPassRate = sems.reduce((a, s) => a + s.passRate, 0) / sems.length
      const atRiskCount = sems[sems.length - 1].atRiskCount
      const delta = sems[sems.length - 1].averageGpa - sems[0].averageGpa
      const trend: YearGroup["trend"] =
        delta > 0.1 ? "up" : delta < -0.1 ? "down" : "flat"
      return { year, sems, avgGpa, avgPassRate, atRiskCount, trend }
    })
}

function TrendBadge({ trend }: { trend: YearGroup["trend"] }) {
  if (trend === "up") return <Badge variant="default">↑ Improving</Badge>
  if (trend === "down") return <Badge variant="destructive">↓ Declining</Badge>
  return <Badge variant="secondary">→ Stable</Badge>
}

function YearCard({ group }: { group: YearGroup }) {
  const sparkData = group.sems.map((s) => ({
    label: formatSemesterShort(s.semester),
    averageGpa: s.averageGpa,
  }))
  const gradientId = `gpaGrad-${group.year}`

  return (
    <Card className="@container/card overflow-hidden">
      <CardHeader>
        <CardDescription>Academic Year</CardDescription>
        <CardTitle className="text-2xl tabular-nums @[250px]/card:text-3xl">
          AY {group.year}–{group.year + 1}
        </CardTitle>
        <CardAction>
          <TrendBadge trend={group.trend} />
        </CardAction>
      </CardHeader>

      <div className="flex items-end justify-between px-6 pb-4 text-sm">
        <div className="flex flex-col gap-0.5">
          <span className="text-2xl font-semibold tabular-nums">
            {group.avgGpa.toFixed(2)}
          </span>
          <span className="text-xs text-muted-foreground">Avg GPA</span>
        </div>
        <div className="flex flex-col items-end gap-0.5">
          <span className="font-medium tabular-nums">
            {(group.avgPassRate * 100).toFixed(1)}%
          </span>
          <span className="text-xs text-muted-foreground">Pass rate</span>
        </div>
        <div className="flex flex-col items-end gap-0.5">
          <span className="font-medium tabular-nums">
            {group.atRiskCount.toLocaleString()}
          </span>
          <span className="text-xs text-muted-foreground">At-risk</span>
        </div>
      </div>

      <ChartContainer config={sparkConfig} className="h-20 w-full">
        <AreaChart data={sparkData} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--color-averageGpa)" stopOpacity={0.3} />
              <stop offset="95%" stopColor="var(--color-averageGpa)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="averageGpa"
            stroke="var(--color-averageGpa)"
            fill={`url(#${gradientId})`}
            strokeWidth={2}
            dot={{
              r: 3,
              fill: "var(--color-averageGpa)",
              stroke: "var(--color-averageGpa)",
              strokeWidth: 1,
            }}
          />
        </AreaChart>
      </ChartContainer>
    </Card>
  )
}

export function YearCards() {
  const [trends, setTrends] = React.useState<SemesterTrend[] | null>(null)
  const [loading, setLoading] = React.useState(true)

  const load = React.useCallback(() => {
    setLoading(true)
    gqlFetch<{ semesterComparison: SemesterTrend[] }>(SemesterComparisonQuery)
      .then((d) => setTrends(d.semesterComparison))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  React.useEffect(() => {
    load()
  }, [load])

  const groups = trends ? groupByYear(trends) : []

  return (
    <div className="flex flex-col gap-4">
      <div
        className="
          grid grid-cols-1 gap-4 px-4 lg:px-6
          *:data-[slot=card]:bg-linear-to-t
          *:data-[slot=card]:from-primary/5
          *:data-[slot=card]:to-card
          *:data-[slot=card]:shadow-xs
          @xl/main:grid-cols-2
          @5xl/main:grid-cols-3
          dark:*:data-[slot=card]:bg-card
        "
      >
        {loading && !trends
          ? Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-56 rounded-xl" />
            ))
          : groups.map((g) => <YearCard key={g.year} group={g} />)}
      </div>
    </div>
  )
}
