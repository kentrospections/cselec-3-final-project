"use client"

import * as React from "react"
import {
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  RadialBar,
  RadialBarChart,
  XAxis,
  YAxis,
} from "recharts"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
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
import { SubjectAnalyticsQuery, type Subject, type SubjectAnalytics } from "@/lib/graphql/operations"
import { formatSemesterShort } from "@/lib/format"

const PIE_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
]

const trendChartConfig = {
  averageGrade: { label: "Avg Grade", color: "var(--chart-1)" },
  rollingAvg: { label: "3-sem avg", color: "var(--chart-2)" },
} satisfies ChartConfig

const passRateConfig = {
  pass: { label: "Pass Rate", color: "var(--chart-1)" },
} satisfies ChartConfig

function modeBadge(dist: Record<string, number>) {
  const entries = Object.entries(dist)
  if (entries.length === 0) return null
  const [range] = entries.reduce((best, cur) => (cur[1] > best[1] ? cur : best))
  return <Badge variant="secondary">{range} most common</Badge>
}

interface Props {
  subject: Subject
}

export function SubjectAnalyticsDrawer({ subject }: Props) {
  const [analytics, setAnalytics] = React.useState<SubjectAnalytics | null>(null)

  React.useEffect(() => {
    gqlFetch<{ subjectAnalytics: SubjectAnalytics }>(SubjectAnalyticsQuery, {
      subjectCode: subject.subjectCode,
    })
      .then((d) => setAnalytics(d.subjectAnalytics))
      .catch(console.error)
  }, [subject.subjectCode])

  const distChartData = analytics
    ? Object.entries(analytics.gradeDistribution).map(([range, count]) => ({
        range,
        count,
      }))
    : []

  const distChartConfig = React.useMemo(
    () =>
      Object.fromEntries(
        distChartData.map((d, i) => [
          d.range,
          { label: d.range, color: PIE_COLORS[i % PIE_COLORS.length] },
        ])
      ) as ChartConfig,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [analytics]
  )

  const trendChartData = analytics?.semesterTrends.map((t) => ({
    label: `${t.schoolYear} ${formatSemesterShort(t.semester)}`,
    averageGrade: t.averageGrade,
    rollingAvg: t.rollingAvg,
  }))

  return (
    <>
      <DrawerHeader>
        <DrawerTitle>{subject.subjectCode}</DrawerTitle>
        <DrawerDescription>
          {subject.description} · {subject.units} units
        </DrawerDescription>
      </DrawerHeader>
      <div className="px-4 pb-6">
        {!analytics ? (
          <div className="grid grid-cols-2 gap-3">
            <Skeleton className="h-24" />
            <Skeleton className="h-32" />
            <Skeleton className="col-span-2 h-48" />
            <Skeleton className="col-span-2 h-56" />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Card>
              <CardContent>
                <CardDescription>Average Grade</CardDescription>
                <CardTitle className="text-2xl tabular-nums">
                  {analytics.averageGrade.toFixed(2)}
                </CardTitle>
              </CardContent>
            </Card>

            {/* Pass Rate — half-circle radial gauge */}
            <Card>
              <CardContent className="flex flex-col items-center gap-1">
                <CardDescription className="self-start">Pass Rate</CardDescription>
                <ChartContainer
                  config={passRateConfig}
                  className="h-16 w-full max-w-[90px]"
                >
                  <RadialBarChart
                    data={[{ name: "pass", value: analytics.passRate * 100 }]}
                    cx="50%"
                    cy="100%"
                    innerRadius="60%"
                    outerRadius="90%"
                    startAngle={180}
                    endAngle={0}
                  >
                    <RadialBar
                      dataKey="value"
                      fill="var(--color-pass)"
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      background={{ fill: "var(--muted)" } as any}
                      cornerRadius={4}
                    />
                  </RadialBarChart>
                </ChartContainer>
                <CardTitle className="text-xl tabular-nums">
                  {(analytics.passRate * 100).toFixed(1)}%
                </CardTitle>
              </CardContent>
            </Card>

            {/* Grade Distribution — donut pie chart */}
            <Card className="col-span-2">
              <CardContent className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <CardDescription>Grade Distribution</CardDescription>
                  {modeBadge(analytics.gradeDistribution)}
                </div>
                <ChartContainer config={distChartConfig} className="h-48 w-full">
                  <PieChart>
                    <ChartTooltip
                      content={<ChartTooltipContent hideLabel className="min-w-40" />}
                    />
                    <Pie
                      data={distChartData}
                      dataKey="count"
                      nameKey="range"
                      innerRadius="30%"
                      outerRadius="75%"
                    >
                      {distChartData.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <ChartLegend content={<ChartLegendContent />} />
                  </PieChart>
                </ChartContainer>
              </CardContent>
            </Card>

            {trendChartData && trendChartData.length > 0 && (
              <Card className="col-span-2">
                <CardContent className="flex flex-col gap-2">
                  <CardDescription>Grade Trend by Semester</CardDescription>
                  <ChartContainer config={trendChartConfig} className="h-52 w-full">
                    <LineChart
                      data={trendChartData}
                      margin={{ top: 4, right: 8, bottom: 16, left: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis
                        dataKey="label"
                        tickLine={false}
                        axisLine={false}
                        tick={{ fontSize: 10 }}
                      />
                      <YAxis domain={["auto", "auto"]} hide />
                      <ChartTooltip content={<ChartTooltipContent className="min-w-40" />} />
                      <ChartLegend content={<ChartLegendContent />} />
                      <Line
                        type="monotone"
                        dataKey="averageGrade"
                        stroke="var(--color-averageGrade)"
                        strokeWidth={2}
                        dot={{ r: 3, fill: "var(--color-averageGrade)" }}
                        activeDot={{ r: 5, fill: "var(--color-averageGrade)" }}
                      />
                      <Line
                        type="monotone"
                        dataKey="rollingAvg"
                        stroke="var(--color-rollingAvg)"
                        strokeWidth={2}
                        strokeDasharray="4 2"
                        dot={false}
                      />
                    </LineChart>
                  </ChartContainer>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </>
  )
}
