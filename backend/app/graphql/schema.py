from typing import AsyncGenerator, Optional

import strawberry
from strawberry.fastapi import GraphQLRouter
from strawberry.types import Info

from app.graphql.resolvers import grades, semesters, students, subjects, subscriptions
from app.graphql.types import (
    GradeEvent,
    GradeInput,
    Semester,
    SemesterTrend,
    StudentDetail,
    StudentSummary,
    Subject,
    SubjectAnalytics,
)


@strawberry.type
class Query:
    @strawberry.field
    async def students(
        self,
        info: Info,
        at_risk: Optional[bool] = None,
        course: Optional[str] = None,
        semester_id: Optional[int] = None,
        subject_code: Optional[str] = None,
    ) -> list[StudentSummary]:
        return await students.resolve_students(at_risk, course, semester_id, subject_code)

    @strawberry.field
    async def student(self, info: Info, id: int) -> Optional[StudentDetail]:
        return await students.resolve_student(id)

    @strawberry.field
    async def subjects(self, info: Info) -> list[Subject]:
        return await subjects.resolve_subjects()

    @strawberry.field
    async def subject_analytics(
        self, info: Info, subject_code: str
    ) -> Optional[SubjectAnalytics]:
        return await subjects.resolve_subject_analytics(subject_code)

    @strawberry.field
    async def semesters(self, info: Info) -> list[Semester]:
        return await semesters.resolve_semesters()

    @strawberry.field
    async def semester_comparison(
        self, info: Info, school_year: Optional[int] = None
    ) -> list[SemesterTrend]:
        return await semesters.resolve_semester_comparison(school_year)

    @strawberry.field
    async def recent_grades(self, info: Info, limit: int = 100) -> list[GradeEvent]:
        return await grades.resolve_recent_grades(limit)

    @strawberry.field
    async def grades_before(self, info: Info, before_id: int, limit: int = 50) -> list[GradeEvent]:
        return await grades.resolve_grades_before(before_id, limit)

    @strawberry.field
    async def grade_count(self, info: Info) -> int:
        return await grades.resolve_grade_count()

    @strawberry.field
    async def overall_average_gpa(self, info: Info) -> float:
        return await grades.resolve_overall_average_gpa()


@strawberry.type
class Mutation:
    @strawberry.mutation
    async def submit_grade(self, info: Info, input: GradeInput) -> GradeEvent:
        return await grades.resolve_submit_grade(input)


@strawberry.type
class Subscription:
    @strawberry.subscription
    async def grade_updates(self, info: Info) -> AsyncGenerator[GradeEvent, None]:
        async for event in subscriptions.grade_updates_resolver():
            yield event


schema = strawberry.Schema(query=Query, mutation=Mutation, subscription=Subscription)
graphql_app = GraphQLRouter(schema, subscription_protocols=["graphql-transport-ws"])
