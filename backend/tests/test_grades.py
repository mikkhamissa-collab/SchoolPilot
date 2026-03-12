"""Tests for the grade calculation logic (pure math, no DB/API needed)."""

import pytest
from app.routes.grades_routes import _calculate, _category_average


class TestCategoryAverage:
    def test_basic_average(self):
        grades = [
            {"category": "Tests", "score": 80, "max": 100},
            {"category": "Tests", "score": 90, "max": 100},
        ]
        assert _category_average(grades, "Tests") == 85.0

    def test_empty_category(self):
        assert _category_average([], "Tests") is None

    def test_nonexistent_category(self):
        grades = [{"category": "Homework", "score": 80, "max": 100}]
        assert _category_average(grades, "Tests") is None

    def test_drop_lowest(self):
        grades = [
            {"category": "Tests", "score": 50, "max": 100},  # dropped
            {"category": "Tests", "score": 80, "max": 100},
            {"category": "Tests", "score": 90, "max": 100},
        ]
        avg = _category_average(grades, "Tests", drop_n=1)
        assert avg == 85.0

    def test_drop_more_than_available(self):
        grades = [{"category": "Tests", "score": 80, "max": 100}]
        assert _category_average(grades, "Tests", drop_n=5) == 80.0

    def test_different_max_scores(self):
        grades = [
            {"category": "Tests", "score": 15, "max": 20},  # 75%
            {"category": "Tests", "score": 90, "max": 100},  # 90%
        ]
        # Total: 105/120 = 87.5%
        avg = _category_average(grades, "Tests")
        assert avg == pytest.approx(87.5)

    def test_zero_max_score(self):
        grades = [{"category": "Tests", "score": 0, "max": 0}]
        assert _category_average(grades, "Tests") is None


class TestCalculate:
    def test_single_category(self):
        categories = [{"name": "Tests", "weight": 1.0}]
        grades = [
            {"category": "Tests", "score": 90, "max": 100},
            {"category": "Tests", "score": 80, "max": 100},
        ]
        result = _calculate(categories, grades)
        assert result["overall"] == 85.0
        assert result["letter"] == "B"

    def test_weighted_categories(self):
        categories = [
            {"name": "Tests", "weight": 0.6},
            {"name": "Homework", "weight": 0.4},
        ]
        grades = [
            {"category": "Tests", "score": 80, "max": 100},
            {"category": "Homework", "score": 100, "max": 100},
        ]
        result = _calculate(categories, grades)
        # 80*0.6 + 100*0.4 = 48 + 40 = 88
        assert result["overall"] == 88.0
        assert result["letter"] == "B+"

    def test_missing_category_excluded(self):
        categories = [
            {"name": "Tests", "weight": 0.6},
            {"name": "Homework", "weight": 0.4},
        ]
        grades = [
            {"category": "Tests", "score": 90, "max": 100},
        ]
        result = _calculate(categories, grades)
        # Only Tests has data, so overall = 90
        assert result["overall"] == 90.0
        assert result["letter"] == "A-"

    def test_empty_grades(self):
        categories = [{"name": "Tests", "weight": 1.0}]
        result = _calculate(categories, [])
        assert result["overall"] is None
        assert result["letter"] is None

    def test_letter_grade_boundaries(self):
        categories = [{"name": "Tests", "weight": 1.0}]
        test_cases = [
            (97, "A+"), (93, "A"), (90, "A-"),
            (87, "B+"), (83, "B"), (80, "B-"),
            (77, "C+"), (73, "C"), (70, "C-"),
            (67, "D+"), (63, "D"), (60, "D-"),
            (59, "F"),
        ]
        for score, expected_letter in test_cases:
            grades = [{"category": "Tests", "score": score, "max": 100}]
            result = _calculate(categories, grades)
            assert result["letter"] == expected_letter, f"Score {score} should be {expected_letter}"

    def test_with_drop_lowest_policy(self):
        categories = [{"name": "Tests", "weight": 1.0}]
        grades = [
            {"category": "Tests", "score": 10, "max": 100},
            {"category": "Tests", "score": 90, "max": 100},
            {"category": "Tests", "score": 95, "max": 100},
        ]
        result = _calculate(categories, grades, {"drop_lowest": {"Tests": 1}})
        # Drop the 10, average of 90 and 95 = 92.5
        assert result["overall"] == 92.5
        assert result["letter"] == "A"
