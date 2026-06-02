"use client"

import * as React from "react"
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import {
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer"
import { Skeleton } from "@/components/ui/skeleton"
import { gqlFetch } from "@/lib/graphql"
import { SemesterComparisonQuery, type Semester, type SemesterTrend } from "@/lib/graphql/operations"
import { formatSemesterShort } from "@/lib/format"

const chartConfig = {
  averageGpa: { label: "Avg GPA", color: "var(--chart-1)" },
} satisfies ChartConfig

function trendBadge(slope: number) {
  if (slope > 0.01)
    return <Badge variant="default">↑ Improving</Badge>
  if (slope < -0.01)
    return <Badge variant="destructive">↓ Declining</Badge>
  return <Badge variant="secondary">→ Stable</Badge>
}

interface Props {
  semester: Semester
}

export function SemesterComparisonDrawer({ semester }: Props) {
  const [trends, setTrends] = React.useState<SemesterTrend[] | null>(null)

  React.useEffect(() => {
    gqlFetch<{ semesterComparison: SemesterTrend[] }>(SemesterComparisonQuery, {
      schoolYear: semester.schoolYear,
    })
      .then((d) => setTrends(d.semesterComparison))
      .catch(console.error)
  }, [semester.schoolYear])

  const yearAvgGpa = trends
    ? trends.reduce((a, t) => a + t.averageGpa, 0) / trends.length
    : 0
  const totalAtRisk = trends ? trends.reduce((a, t) => a + t.atRiskCount, 0) : 0
  const trendSlope = trends?.[0]?.trendSlope ?? 0

  const chartData = trends?.map((t) => ({
    label: formatSemesterShort(t.semester),
    averageGpa: t.averageGpa,
  }))

  return (
    <>
      <DrawerHeader>
        <DrawerTitle>AY {semester.schoolYear}</DrawerTitle>
        <DrawerDescription>School year comparison report</DrawerDescription>
      </DrawerHeader>
      <div className="px-4 pb-6">
        {!trends ? (
          <div className="grid grid-cols-2 gap-3">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="col-span-2 h-56" />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Card>
              <CardContent>
                <CardDescription>Year Avg GPA</CardDescription>
                <CardTitle className="text-2xl tabular-nums">
                  {yearAvgGpa.toFixed(2)}
                </CardTitle>
              </CardContent>
            </Card>

            <Card>
              <CardContent>
                <CardDescription>At-Risk Total</CardDescription>
                <CardTitle className="text-2xl tabular-nums">
                  {totalAtRisk.toLocaleString()}
                </CardTitle>
              </CardContent>
            </Card>

            <Card className="col-span-2 pb-0">
              <CardContent className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <CardDescription>AY {semester.schoolYear} Semesters</CardDescription>
                  {trendBadge(trendSlope)}
                </div>
                <ChartContainer config={chartConfig} className="h-52 w-full">
                  <AreaChart
                    data={chartData}
                    margin={{ top: 4, right: 8, bottom: 16, left: 0 }}
                  >
                    <defs>
                      <linearGradient id="gpaGradientSem" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--color-averageGpa)" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="var(--color-averageGpa)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 10 }}
                    />
                    <YAxis domain={["auto", "auto"]} hide />
                    <ChartTooltip content={<ChartTooltipContent className="min-w-40" />} />
                    <Area
                      type="monotone"
                      dataKey="averageGpa"
                      stroke="var(--color-averageGpa)"
                      fill="url(#gpaGradientSem)"
                      strokeWidth={2}
                      dot={{ r: 3, fill: "var(--color-averageGpa)", stroke: "var(--color-averageGpa)", strokeWidth: 1 }}
                      activeDot={{ r: 5, fill: "var(--color-averageGpa)", stroke: "var(--color-averageGpa)", strokeWidth: 1 }}
                    />
                  </AreaChart>
                </ChartContainer>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </>
  )
}
