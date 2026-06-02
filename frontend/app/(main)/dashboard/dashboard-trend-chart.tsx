"use client"

import * as React from "react"
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from "recharts"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { gqlFetch } from "@/lib/graphql"
import { SemesterComparisonQuery, type SemesterTrend } from "@/lib/graphql/operations"
import { formatSemesterShort } from "@/lib/format"

const chartConfig = {
  averageGpa: { label: "Avg GPA", color: "var(--chart-1)" },
  passRate: { label: "Pass Rate", color: "var(--chart-2)" },
} satisfies ChartConfig

export function DashboardTrendChart() {
  const [trends, setTrends] = React.useState<SemesterTrend[] | null>(null)

  React.useEffect(() => {
    gqlFetch<{ semesterComparison: SemesterTrend[] }>(SemesterComparisonQuery)
      .then((d) => setTrends(d.semesterComparison))
      .catch(console.error)
  }, [])

  const chartData = trends?.map((t) => ({
    label: `${t.schoolYear} ${formatSemesterShort(t.semester)}`,
    averageGpa: t.averageGpa,
    passRate: +(t.passRate * 100).toFixed(1),
  }))

  return (
    <Card>
      <CardHeader>
        <CardTitle>Performance Over Time</CardTitle>
        <CardDescription>
          Average GPA and pass rate across all semesters
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!chartData ? (
          <div className="h-64 flex items-center justify-center text-sm text-muted-foreground">
            Loading…
          </div>
        ) : (
          <ChartContainer config={chartConfig} className="h-64 w-full">
            <LineChart
              data={chartData}
              margin={{ top: 4, right: 8, bottom: 16, left: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 10 }}
              />
              <YAxis yAxisId="gpa" domain={[0, 100]} hide />
              <YAxis yAxisId="pct" domain={[0, 100]} hide />
              <ChartTooltip content={<ChartTooltipContent className="min-w-48" />} />
              <ChartLegend content={<ChartLegendContent />} />
              <Line
                yAxisId="gpa"
                type="monotone"
                dataKey="averageGpa"
                stroke="var(--color-averageGpa)"
                strokeWidth={2}
                dot={{ r: 3, fill: "var(--color-averageGpa)", stroke: "var(--color-averageGpa)", strokeWidth: 1 }}
                activeDot={{ r: 5, fill: "var(--color-averageGpa)", stroke: "var(--color-averageGpa)", strokeWidth: 1 }}
              />
              <Line
                yAxisId="pct"
                type="monotone"
                dataKey="passRate"
                stroke="var(--color-passRate)"
                strokeWidth={2}
                strokeDasharray="4 2"
                dot={{ r: 3, fill: "var(--color-passRate)", stroke: "var(--color-passRate)", strokeWidth: 1 }}
                activeDot={{ r: 5, fill: "var(--color-passRate)", stroke: "var(--color-passRate)", strokeWidth: 1 }}
              />
            </LineChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}
