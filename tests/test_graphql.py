"""
GraphQL endpoint tests — all queries and the subscription generator.

Uses an httpx.AsyncClient wired to the FastAPI ASGI app (no real HTTP server).
The seeded_db fixture provides two students (Alice and Bob), 2 subjects,
2 semesters, and 8 grade rows total.
"""

import pytest


GQL = "/graphql"


async def gql(client, query: str, variables: dict | None = None) -> dict:
    resp = await client.post(GQL, json={"query": query, "variables": variables or {}})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "errors" not in body, body.get("errors")
    return body["data"]


# ─── students query ───────────────────────────────────────────────────────────

async def test_students_returns_list(client, seeded_db):
    data = await gql(client, "{ students { studentId name course gpa isAtRisk } }")
    assert len(data["students"]) == 2


async def test_students_filter_by_course(client, seeded_db):
    data = await gql(
        client,
        "query($c: String) { students(course: $c) { name } }",
        {"c": "BSCS"},
    )
    assert len(data["students"]) == 2


async def test_students_filter_unknown_course(client, seeded_db):
    data = await gql(
        client,
        'query($c: String) { students(course: $c) { name } }',
        {"c": "NONEXISTENT"},
    )
    assert data["students"] == []


async def test_students_gpa_values(client, seeded_db):
    data = await gql(client, "{ students { name gpa } }")
    gpas = {s["name"]: s["gpa"] for s in data["students"]}
    # Alice: (90+88+90+88)/4 = 89.0
    assert abs(gpas["Alice"] - 89.0) < 0.01
    # Bob: (62+65+62+65)/4 = 63.5
    assert abs(gpas["Bob"] - 63.5) < 0.01


async def test_students_at_risk_filter_requires_model(client, seeded_db, mock_model):
    data = await gql(client, "{ students(atRisk: true) { name isAtRisk } }")
    # Mock model is trained to classify Bob (gpa~63.5, negative slope) as at-risk
    names = [s["name"] for s in data["students"]]
    assert "Bob" in names
    assert "Alice" not in names


async def test_students_at_risk_no_model_returns_empty(client, seeded_db, monkeypatch):
    from app.ml import classifier
    monkeypatch.setattr(classifier, "_model", None)
    data = await gql(client, "{ students(atRisk: true) { name } }")
    assert data["students"] == []


# ─── student (single) query ───────────────────────────────────────────────────

async def test_student_returns_detail(client, seeded_db):
    alice_id = seeded_db["Alice"]
    data = await gql(
        client,
        "query($id: Int!) { student(id: $id) { studentId name gpa semesters { semester gpa grades { subjectCode grade } } } }",
        {"id": alice_id},
    )
    s = data["student"]
    assert s["name"] == "Alice"
    assert len(s["semesters"]) == 2
    # Each semester has 2 subjects
    assert len(s["semesters"][0]["grades"]) == 2


async def test_student_not_found_returns_null(client, seeded_db):
    data = await gql(
        client,
        "query($id: Int!) { student(id: $id) { name } }",
        {"id": 99999},
    )
    assert data["student"] is None


async def test_student_per_semester_gpa(client, seeded_db):
    alice_id = seeded_db["Alice"]
    data = await gql(
        client,
        "query($id: Int!) { student(id: $id) { semesters { gpa } } }",
        {"id": alice_id},
    )
    for sem in data["student"]["semesters"]:
        # Alice's grades are 90 and 88 per semester → GPA = 89.0
        assert abs(sem["gpa"] - 89.0) < 0.01


# ─── subjects query ───────────────────────────────────────────────────────────

async def test_subjects_returns_all(client, seeded_db):
    data = await gql(client, "{ subjects { subjectCode description units } }")
    assert len(data["subjects"]) == 2
    codes = {s["subjectCode"] for s in data["subjects"]}
    assert codes == {"CS101", "CS102"}


# ─── subjectAnalytics query ───────────────────────────────────────────────────

async def test_subject_analytics_average(client, seeded_db):
    data = await gql(
        client,
        'query { subjectAnalytics(subjectCode: "CS101") { averageGrade passRate gradeDistribution } }',
    )
    a = data["subjectAnalytics"]
    # CS101: Alice gets 90 twice, Bob gets 62 twice → avg = (90+90+62+62)/4 = 76.0
    assert abs(a["averageGrade"] - 76.0) < 0.01


async def test_subject_analytics_pass_rate(client, seeded_db):
    data = await gql(
        client,
        'query { subjectAnalytics(subjectCode: "CS101") { passRate } }',
    )
    # 2 out of 4 grades are ≥ 75 (Alice's two 90s), so pass rate = 0.5
    assert abs(data["subjectAnalytics"]["passRate"] - 0.5) < 0.01


async def test_subject_analytics_not_found(client, seeded_db):
    data = await gql(
        client,
        'query { subjectAnalytics(subjectCode: "NONE999") { averageGrade } }',
    )
    assert data["subjectAnalytics"] is None


async def test_subject_analytics_grade_distribution_keys(client, seeded_db):
    data = await gql(
        client,
        'query { subjectAnalytics(subjectCode: "CS101") { gradeDistribution } }',
    )
    dist = data["subjectAnalytics"]["gradeDistribution"]
    assert set(dist.keys()) == {"60-69", "70-74", "75-79", "80-89", "90-100"}


# ─── semesters query ──────────────────────────────────────────────────────────

async def test_semesters_returns_all(client, seeded_db):
    data = await gql(client, "{ semesters { semesterId semester schoolYear } }")
    assert len(data["semesters"]) == 2
    assert data["semesters"][0]["semester"] == "FirstSem"


# ─── semesterComparison query ─────────────────────────────────────────────────

async def test_semester_comparison_returns_trends(client, seeded_db):
    data = await gql(
        client,
        "query($y: Int) { semesterComparison(schoolYear: $y) { semester averageGpa passRate atRiskCount trendSlope trendIntercept } }",
        {"y": 2023},
    )
    trends = data["semesterComparison"]
    assert len(trends) == 2
    # All trends share the same slope and intercept (global linear fit)
    slopes = {t["trendSlope"] for t in trends}
    assert len(slopes) == 1


async def test_semester_comparison_no_filter(client, seeded_db):
    data = await gql(
        client,
        "{ semesterComparison { semester schoolYear averageGpa } }",
    )
    assert len(data["semesterComparison"]) == 2
