export const StudentsQuery = /* GraphQL */ `
  query Students($atRisk: Boolean, $course: String) {
    students(atRisk: $atRisk, course: $course) {
      studentId
      name
      course
      gpa
      isAtRisk
      atRiskScore
    }
  }
`

export const SubjectsQuery = /* GraphQL */ `
  query Subjects {
    subjects {
      subjectCode
      description
      units
    }
  }
`

export const SemestersQuery = /* GraphQL */ `
  query Semesters {
    semesters {
      semesterId
      semester
      schoolYear
    }
  }
`

export const GradeUpdatesSubscription = /* GraphQL */ `
  subscription GradeUpdates {
    gradeUpdates {
      studentId
      subjectCode
      semesterId
      grade
      timestamp
    }
  }
`

export const RecentGradesQuery = /* GraphQL */ `
  query RecentGrades($limit: Int) {
    recentGrades(limit: $limit) {
      gradeId
      studentId
      subjectCode
      semesterId
      grade
      timestamp
    }
  }
`

export const GradesBeforeQuery = /* GraphQL */ `
  query GradesBefore($beforeId: Int!, $limit: Int) {
    gradesBefore(beforeId: $beforeId, limit: $limit) {
      gradeId
      studentId
      subjectCode
      semesterId
      grade
      timestamp
    }
  }
`

export const StudentDetailQuery = /* GraphQL */ `
  query StudentDetail($id: Int!) {
    student(id: $id) {
      studentId
      name
      course
      gpa
      isAtRisk
      atRiskScore
      semesters {
        semesterId
        semester
        schoolYear
        gpa
        grades {
          subjectCode
          description
          grade
        }
      }
    }
  }
`

export const SubjectAnalyticsQuery = /* GraphQL */ `
  query SubjectAnalytics($subjectCode: String!) {
    subjectAnalytics(subjectCode: $subjectCode) {
      subjectCode
      description
      averageGrade
      passRate
      gradeDistribution
      semesterTrends {
        semester
        schoolYear
        averageGrade
        passRate
        rollingAvg
      }
    }
  }
`

export const StudentsForSubjectQuery = /* GraphQL */ `
  query StudentsForSubject($subjectCode: String!) {
    students(subjectCode: $subjectCode) {
      studentId
      name
      course
      gpa
      isAtRisk
      atRiskScore
    }
  }
`

export const GradeCountQuery = /* GraphQL */ `
  query GradeCount {
    gradeCount
  }
`

export const OverallAverageGpaQuery = /* GraphQL */ `
  query OverallAverageGpa {
    overallAverageGpa
  }
`

export const SubmitGradeMutation = /* GraphQL */ `
  mutation SubmitGrade($input: GradeInput!) {
    submitGrade(input: $input) {
      gradeId
      studentId
      subjectCode
      semesterId
      grade
      timestamp
    }
  }
`

export const SemesterComparisonQuery = /* GraphQL */ `
  query SemesterComparison($schoolYear: Int) {
    semesterComparison(schoolYear: $schoolYear) {
      semester
      schoolYear
      averageGpa
      passRate
      atRiskCount
      trendSlope
      trendIntercept
    }
  }
`

export interface StudentSummary {
  studentId: number
  name: string
  course: string
  gpa: number
  isAtRisk: boolean
  atRiskScore: number
}

export interface GradeRecord {
  subjectCode: string
  description: string
  grade: number
}

export interface SemesterGrades {
  semesterId: number
  semester: string
  schoolYear: number
  gpa: number
  grades: GradeRecord[]
}

export interface StudentDetail extends StudentSummary {
  semesters: SemesterGrades[]
}

export interface Subject {
  subjectCode: string
  description: string
  units: number
}

export interface SubjectSemesterTrend {
  semester: string
  schoolYear: number
  averageGrade: number
  passRate: number
  rollingAvg: number | null
}

export interface SubjectAnalytics {
  subjectCode: string
  description: string
  averageGrade: number
  passRate: number
  gradeDistribution: Record<string, number>
  semesterTrends: SubjectSemesterTrend[]
}

export interface Semester {
  semesterId: number
  semester: string
  schoolYear: number
}

export interface SemesterTrend {
  semester: string
  schoolYear: number
  averageGpa: number
  passRate: number
  atRiskCount: number
  trendSlope: number
  trendIntercept: number
}

export interface GradeEvent {
  gradeId?: number
  studentId: number
  subjectCode: string
  semesterId: number
  grade: number
  timestamp: string | null
}
