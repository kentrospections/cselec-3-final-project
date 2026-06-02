"use client"

import * as React from "react"
import { IconPlus } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { gqlFetch } from "@/lib/graphql"
import {
  SemestersQuery,
  SubjectsQuery,
  SubmitGradeMutation,
  type GradeEvent,
  type Semester,
  type Subject,
} from "@/lib/graphql/operations"
import { formatSemester } from "@/lib/format"

interface Props {
  onSubmitted?: (event: GradeEvent) => void
}

export function SubmitGradeSheet({ onSubmitted }: Props) {
  const [open, setOpen] = React.useState(false)
  const [subjects, setSubjects] = React.useState<Subject[]>([])
  const [semesters, setSemesters] = React.useState<Semester[]>([])
  const [studentId, setStudentId] = React.useState("")
  const [subjectCode, setSubjectCode] = React.useState("")
  const [semesterId, setSemesterId] = React.useState("")
  const [grade, setGrade] = React.useState("")
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) return
    gqlFetch<{ subjects: Subject[] }>(SubjectsQuery)
      .then((d) => setSubjects(d.subjects))
      .catch(console.error)
    gqlFetch<{ semesters: Semester[] }>(SemestersQuery)
      .then((d) => setSemesters(d.semesters))
      .catch(console.error)
  }, [open])

  const reset = () => {
    setStudentId("")
    setSubjectCode("")
    setSemesterId("")
    setGrade("")
    setError(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const sid = parseInt(studentId, 10)
    const sem = parseInt(semesterId, 10)
    const g = parseFloat(grade)

    if (!sid || sid < 1) { setError("Student ID must be a positive integer."); return }
    if (!subjectCode) { setError("Select a subject."); return }
    if (!sem) { setError("Select a semester."); return }
    if (isNaN(g) || g < 50 || g > 100) { setError("Grade must be between 50 and 100."); return }

    setSubmitting(true)
    try {
      const data = await gqlFetch<{ submitGrade: GradeEvent }>(SubmitGradeMutation, {
        input: { studentId: sid, subjectCode, semesterId: sem, grade: g },
      })
      onSubmitted?.(data.submitGrade)
      reset()
      setOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submission failed.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset() }}>
      <SheetTrigger render={<Button size="sm" />}>
        <IconPlus />
        Submit Grade
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Submit Grade</SheetTitle>
          <SheetDescription>
            Manually record a grade. The entry will appear in the live feed and
            trigger analytics updates automatically.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-4 pb-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sg-student">Student ID</Label>
            <Input
              id="sg-student"
              type="number"
              min={1}
              placeholder="e.g. 42"
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sg-subject">Subject</Label>
            <Select value={subjectCode} onValueChange={(v) => setSubjectCode(v ?? "")}>
              <SelectTrigger id="sg-subject">
                <SelectValue placeholder="Select subject" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {subjects.map((s) => (
                    <SelectItem key={s.subjectCode} value={s.subjectCode}>
                      {s.subjectCode} — {s.description}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sg-semester">Semester</Label>
            <Select value={semesterId} onValueChange={(v) => setSemesterId(v ?? "")}>
              <SelectTrigger id="sg-semester">
                <SelectValue placeholder="Select semester" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {semesters.map((s) => (
                    <SelectItem key={s.semesterId} value={String(s.semesterId)}>
                      {s.schoolYear} {formatSemester(s.semester)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sg-grade">Grade (50 – 100)</Label>
            <Input
              id="sg-grade"
              type="number"
              min={50}
              max={100}
              step={0.01}
              placeholder="e.g. 87.5"
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
            />
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <Button type="submit" disabled={submitting}>
            {submitting ? "Submitting…" : "Submit"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  )
}
