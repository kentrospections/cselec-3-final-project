"use client"

import * as React from "react"
import { createClient } from "graphql-ws"
import {
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts"
import type { ColumnDef } from "@tanstack/react-table"
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
import { DataTable } from "@/components/custom/data-table"
import { cn } from "@/lib/utils"
import { gqlFetch } from "@/lib/graphql"
import {
  GradeUpdatesSubscription,
  StudentsForSubjectQuery,
  SubjectAnalyticsQuery,
  type GradeEvent,
  type Subject,
  type SubjectAnalytics,
  type StudentSummary,
} from "@/lib/graphql/operations"
import { formatSemesterShort } from "@/lib/format"

const PIE_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
]

const DIST_LABELS: Record<string, string> = { "below_60": "< 60" }
const fmtDist = (key: string) => DIST_LABELS[key] ?? key

const trendChartConfig = {
  averageGrade: { label: "Avg Grade", color: "var(--chart-1)" },
  rollingAvg: { label: "3-sem avg", color: "var(--chart-2)" },
} satisfies ChartConfig

const studentColumns: ColumnDef<StudentSummary>[] = [
  { accessorKey: "studentId", header: "Student ID", meta: { compact: true } },
  { accessorKey: "name", header: "Name" },
  { accessorKey: "course", header: "Course", meta: { compact: true } },
  {
    accessorKey: "gpa",
    header: "GPA",
    meta: { compact: true },
    cell: ({ row }) => (
      <span className={cn("tabular-nums", row.original.gpa < 75 && "text-destructive")}>
        {row.original.gpa.toFixed(2)}
      </span>
    ),
  },
  {
    accessorKey: "isAtRisk",
    header: "Status",
    cell: ({ row }) =>
      row.original.isAtRisk ? (
        <Badge variant="destructive">At risk</Badge>
      ) : (
        <Badge variant="secondary">Normal</Badge>
      ),
  },
]

function modeBadge(dist: Record<string, number>) {
  const entries = Object.entries(dist)
  if (entries.length === 0) return null
  const [range] = entries.reduce((best, cur) => (cur[1] > best[1] ? cur : best))
  return <Badge variant="secondary">{fmtDist(range)} most common</Badge>
}

interface Props {
  subject: Subject
}

export function SubjectAnalyticsDrawer({ subject }: Props) {
  const [analytics, setAnalytics] = React.useState<SubjectAnalytics | null>(null)
  const [subjectStudents, setSubjectStudents] = React.useState<StudentSummary[] | null>(null)

  const loadAnalytics = React.useCallback(() => {
    gqlFetch<{ subjectAnalytics: SubjectAnalytics }>(SubjectAnalyticsQuery, {
      subjectCode: subject.subjectCode,
    })
      .then((d) => setAnalytics(d.subjectAnalytics))
      .catch(console.error)
  }, [subject.subjectCode])

  const loadStudents = React.useCallback(() => {
    gqlFetch<{ students: StudentSummary[] }>(StudentsForSubjectQuery, {
      subjectCode: subject.subjectCode,
    })
      .then((d) => setSubjectStudents(d.students))
      .catch(console.error)
  }, [subject.subjectCode])

  React.useEffect(() => {
    loadAnalytics()
    loadStudents()
  }, [loadAnalytics, loadStudents])

  // Re-fetch when a new grade arrives for this subject
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
          if (data?.gradeUpdates?.subjectCode === subject.subjectCode) {
            loadAnalytics()
            loadStudents()
          }
        },
        error: console.error,
        complete: () => {},
      }
    )
    return () => {
      unsub()
      client.dispose()
    }
  }, [subject.subjectCode, loadAnalytics, loadStudents])

  const distChartData = analytics
    ? Object.entries(analytics.gradeDistribution).map(([range, count]) => ({
        range,
        label: fmtDist(range),
        count,
      }))
    : []

  const distChartConfig = React.useMemo(
    () =>
      Object.fromEntries(
        distChartData.map((d, i) => [
          d.label,
          { label: d.label, color: PIE_COLORS[i % PIE_COLORS.length] },
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

      {!analytics ? (
        <div className="px-4 pb-6 grid grid-cols-2 gap-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="col-span-2 h-48" />
          <Skeleton className="col-span-2 h-56" />
        </div>
      ) : (
        <>
          <div className="px-4 pb-4">
            <div className="grid grid-cols-2 gap-3">
              <Card>
                <CardContent>
                  <CardDescription>Average Grade</CardDescription>
                  <CardTitle className="text-2xl tabular-nums">
                    {analytics.averageGrade.toFixed(2)}
                  </CardTitle>
                </CardContent>
              </Card>

              <Card>
                <CardContent>
                  <CardDescription>Pass Rate</CardDescription>
                  <CardTitle className="text-2xl tabular-nums">
                    {(analytics.passRate * 100).toFixed(1)}%
                  </CardTitle>
                </CardContent>
              </Card>

              <Card className="col-span-2">
                <CardContent className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <CardDescription>Grade Distribution</CardDescription>
                    {modeBadge(analytics.gradeDistribution)}
                  </div>
                  <ChartContainer
                    config={distChartConfig}
                    className="h-48 w-full [&_.recharts-pie-label-text]:fill-foreground"
                  >
                    <PieChart>
                      <ChartTooltip
                        content={<ChartTooltipContent hideLabel className="min-w-40" />}
                      />
                      <Pie
                        data={distChartData}
                        dataKey="count"
                        nameKey="label"
                        innerRadius="30%"
                        outerRadius="65%"
                        label={({ name }) => name ?? ""}
                        labelLine
                      >
                        {distChartData.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ChartContainer>
                </CardContent>
              </Card>

              {trendChartData && trendChartData.length > 0 && (
                <Card className="col-span-2 pb-0">
                  <CardContent className="flex flex-col gap-2">
                    <div>
                      <CardDescription>Grade Trend by Semester</CardDescription>
                      <p className="text-xs text-muted-foreground/70">
                        The dashed line averages the current semester with the two before it,
                        smoothing out one-semester spikes to show the underlying direction.
                      </p>
                    </div>
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
                        <Line
                          type="monotone"
                          dataKey="averageGrade"
                          stroke="var(--color-averageGrade)"
                          strokeWidth={2}
                          dot={{ r: 3, fill: "var(--color-averageGrade)", stroke: "var(--color-averageGrade)", strokeWidth: 1 }}
                          activeDot={{ r: 5, fill: "var(--color-averageGrade)", stroke: "var(--color-averageGrade)", strokeWidth: 1 }}
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
          </div>

          <DataTable
            columns={studentColumns}
            data={subjectStudents ?? []}
            onReload={loadStudents}
            isLoading={subjectStudents === null}
            isCompact={true}
          />
          <div className="pb-6" />
        </>
      )}
    </>
  )
}
