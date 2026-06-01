from typing import Optional

import strawberry
from strawberry.scalars import JSON


@strawberry.type
class StudentSummary:
    student_id: int
    name: str
    course: str
    gpa: float
    is_at_risk: bool
    at_risk_score: float


@strawberry.type
class GradeRecord:
    subject_code: str
    description: str
    grade: float


@strawberry.type
class SemesterGrades:
    semester_id: int
    semester: str
    school_year: int
    gpa: float
    grades: list[GradeRecord]


@strawberry.type
class StudentDetail:
    student_id: int
    name: str
    course: str
    gpa: float
    is_at_risk: bool
    at_risk_score: float
    semesters: list[SemesterGrades]


@strawberry.type
class Subject:
    subject_code: str
    description: str
    units: int


@strawberry.type
class SubjectSemesterTrend:
    semester: str
    school_year: int
    average_grade: float
    pass_rate: float
    rolling_avg: Optional[float]


@strawberry.type
class SubjectAnalytics:
    subject_code: str
    description: str
    average_grade: float
    pass_rate: float
    grade_distribution: JSON
    semester_trends: list[SubjectSemesterTrend]


@strawberry.type
class Semester:
    semester_id: int
    semester: str
    school_year: int


@strawberry.type
class SemesterTrend:
    semester: str
    school_year: int
    average_gpa: float
    pass_rate: float
    at_risk_count: int
    trend_slope: float
    trend_intercept: float


@strawberry.type
class GradeEvent:
    grade_id: Optional[int] = None
    student_id: int
    subject_code: str
    semester_id: int
    grade: float
    timestamp: Optional[str] = None
