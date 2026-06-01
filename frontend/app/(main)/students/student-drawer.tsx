"use client"

import * as React from "react"
import {
  Area,
  AreaChart,
  CartesianGrid,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  XAxis,
  YAxis,
} from "recharts"
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
import { StudentDetailQuery, type StudentDetail, type StudentSummary } from "@/lib/graphql/operations"
import { formatSemesterShort } from "@/lib/format"

const gpaChartConfig = {
  gpa: { label: "GPA", color: "var(--chart-1)" },
} satisfies ChartConfig

const radarChartConfig = {
  grade: { label: "Avg Grade", color: "var(--chart-1)" },
} satisfies ChartConfig

function zScoreBadge(semesters: StudentDetail["semesters"]) {
  if (semesters.length < 2) return null
  const gpas = semesters.map((s) => s.gpa)
  const mean = gpas.reduce((a, b) => a + b, 0) / gpas.length
  const variance = gpas.reduce((a, b) => a + (b - mean) ** 2, 0) / gpas.length
  const std = Math.sqrt(variance)
  if (std === 0) return null
  const latest = gpas[gpas.length - 1]
  const z = (latest - mean) / std
  const label = `${z >= 0 ? "+" : ""}${z.toFixed(2)} σ`
  const variant: "default" | "secondary" | "destructive" =
    z > 1.5 ? "default" : z < -1.5 ? "destructive" : "secondary"
  return <Badge variant={variant}>{label}</Badge>
}

interface Props {
  student: StudentSummary
}

export function StudentDetailDrawer({ student }: Props) {
  const [detail, setDetail] = React.useState<StudentDetail | null>(null)

  React.useEffect(() => {
    gqlFetch<{ student: StudentDetail }>(StudentDetailQuery, { id: student.studentId })
      .then((d) => setDetail(d.student))
      .catch(console.error)
  }, [student.studentId])

  const chartData = detail?.semesters.map((s) => ({
    label: `${s.schoolYear} ${formatSemesterShort(s.semester)}`,
    gpa: s.gpa,
  }))

  const radarData = React.useMemo(() => {
    if (!detail) return []
    const agg: Record<string, { total: number; count: number }> = {}
    for (const sem of detail.semesters) {
      for (const g of sem.grades) {
        if (!agg[g.subjectCode]) agg[g.subjectCode] = { total: 0, count: 0 }
        agg[g.subjectCode].total += g.grade
        agg[g.subjectCode].count += 1
      }
    }
    return Object.entries(agg).map(([code, d]) => ({
      subject: code,
      grade: +(d.total / d.count).toFixed(2),
    }))
  }, [detail])

  return (
    <>
      <DrawerHeader>
        <DrawerTitle>{student.name}</DrawerTitle>
        <DrawerDescription>
          {student.course} · ID: {student.studentId}
        </DrawerDescription>
      </DrawerHeader>
      <div className="px-4 pb-6">
        {!detail ? (
          <div className="grid grid-cols-2 gap-3">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="col-span-2 h-56" />
            <Skeleton className="col-span-2 h-56" />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Card>
              <CardContent>
                <CardDescription>GPA</CardDescription>
                <CardTitle className="text-2xl tabular-nums">
                  {detail.gpa.toFixed(2)}
                </CardTitle>
              </CardContent>
            </Card>

            <Card>
              <CardContent>
                <CardDescription>Status</CardDescription>
                <CardTitle className="text-2xl">
                  {detail.isAtRisk ? "At risk" : "Normal"}
                </CardTitle>
              </CardContent>
            </Card>

            {radarData.length > 0 && (
              <Card className="col-span-2">
                <CardContent className="flex flex-col gap-2">
                  <CardDescription>Grades by Subject</CardDescription>
                  <ChartContainer config={radarChartConfig} className="h-52 w-full">
                    <RadarChart data={radarData}>
                      <PolarGrid />
                      <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10 }} />
                      <Radar
                        dataKey="grade"
                        stroke="var(--color-grade)"
                        fill="var(--color-grade)"
                        fillOpacity={0.2}
                        strokeWidth={2}
                        dot={{ r: 3, fill: "var(--color-grade)" }}
                      />
                      <ChartTooltip content={<ChartTooltipContent className="min-w-40" />} />
                    </RadarChart>
                  </ChartContainer>
                </CardContent>
              </Card>
            )}

            <Card className="col-span-2">
              <CardContent className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <CardDescription>GPA by Semester</CardDescription>
                  {zScoreBadge(detail.semesters)}
                </div>
                <ChartContainer config={gpaChartConfig} className="h-52 w-full">
                  <AreaChart
                    data={chartData}
                    margin={{ top: 4, right: 8, bottom: 16, left: 0 }}
                  >
                    <defs>
                      <linearGradient id="gpaGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--color-gpa)" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="var(--color-gpa)" stopOpacity={0} />
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
                      dataKey="gpa"
                      stroke="var(--color-gpa)"
                      fill="url(#gpaGradient)"
                      strokeWidth={2}
                      dot={{ r: 3, fill: "var(--color-gpa)" }}
                      activeDot={{ r: 5, fill: "var(--color-gpa)" }}
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
