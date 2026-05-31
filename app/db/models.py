from sqlalchemy import BigInteger, Boolean, Float, ForeignKey, Integer, String
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class Student(Base):
    __tablename__ = "students"

    student_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String)
    course: Mapped[str] = mapped_column(String)
    is_at_risk: Mapped[bool] = mapped_column(Boolean, default=False)
    at_risk_score: Mapped[float] = mapped_column(Float, default=0.0)


class Subject(Base):
    __tablename__ = "subjects"

    subject_code: Mapped[str] = mapped_column(String, primary_key=True)
    description: Mapped[str] = mapped_column(String)
    units: Mapped[int] = mapped_column(Integer)


class Semester(Base):
    __tablename__ = "semesters"

    semester_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    semester: Mapped[str] = mapped_column(String)
    school_year: Mapped[int] = mapped_column(Integer)


class Grade(Base):
    __tablename__ = "grades"

    # No PK on partitioned parent; grade_id is a sequence-backed column
    grade_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    student_id: Mapped[int] = mapped_column(Integer, ForeignKey("students.student_id"))
    subject_code: Mapped[str] = mapped_column(String, ForeignKey("subjects.subject_code"))
    semester_id: Mapped[int] = mapped_column(Integer, ForeignKey("semesters.semester_id"))
    grade: Mapped[float] = mapped_column(Float)
