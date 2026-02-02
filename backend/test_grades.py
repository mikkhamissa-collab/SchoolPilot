# test_grades.py — Unit tests for the GradeCalculator.
import pytest
from grades import GradeCalculator


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_calc(categories, grades, policies=None):
    return GradeCalculator(categories=categories, grades=grades, policies=policies)


SIMPLE_CATS = [
    {'name': 'Tests', 'weight': 0.60},
    {'name': 'Homework', 'weight': 0.40},
]


# ---------------------------------------------------------------------------
# calculate() tests
# ---------------------------------------------------------------------------

class TestCalculate:
    def test_single_category(self):
        calc = make_calc(
            [{'name': 'Tests', 'weight': 1.0}],
            [{'category': 'Tests', 'name': 'T1', 'score': 90, 'max': 100}],
        )
        result = calc.calculate()
        assert result['overall'] == 90.0
        assert result['letter'] == 'A-'

    def test_multi_category_weighted(self):
        calc = make_calc(
            SIMPLE_CATS,
            [
                {'category': 'Tests', 'name': 'T1', 'score': 80, 'max': 100},
                {'category': 'Homework', 'name': 'HW1', 'score': 100, 'max': 100},
            ],
        )
        result = calc.calculate()
        # 80 * 0.6 + 100 * 0.4 = 48 + 40 = 88
        assert result['overall'] == 88.0
        assert result['letter'] == 'B+'

    def test_no_grades(self):
        calc = make_calc(SIMPLE_CATS, [])
        result = calc.calculate()
        assert result['overall'] is None
        assert result['letter'] is None

    def test_partial_categories(self):
        """Only one category has grades — weight_coverage reflects this."""
        calc = make_calc(
            SIMPLE_CATS,
            [{'category': 'Tests', 'name': 'T1', 'score': 85, 'max': 100}],
        )
        result = calc.calculate()
        assert result['overall'] == 85.0
        assert result['weight_coverage'] == 60.0

    def test_multiple_grades_same_category(self):
        calc = make_calc(
            [{'name': 'Quizzes', 'weight': 1.0}],
            [
                {'category': 'Quizzes', 'name': 'Q1', 'score': 8, 'max': 10},
                {'category': 'Quizzes', 'name': 'Q2', 'score': 6, 'max': 10},
            ],
        )
        result = calc.calculate()
        # (8 + 6) / (10 + 10) * 100 = 70
        assert result['overall'] == 70.0
        assert result['letter'] == 'C-'

    def test_zero_max_score(self):
        """A grade with max=0 should not crash."""
        calc = make_calc(
            [{'name': 'Tests', 'weight': 1.0}],
            [{'category': 'Tests', 'name': 'T1', 'score': 0, 'max': 0}],
        )
        result = calc.calculate()
        assert result['overall'] is None


# ---------------------------------------------------------------------------
# Drop-lowest tests
# ---------------------------------------------------------------------------

class TestDropLowest:
    def test_drop_lowest_one(self):
        calc = make_calc(
            [{'name': 'Quizzes', 'weight': 1.0}],
            [
                {'category': 'Quizzes', 'name': 'Q1', 'score': 50, 'max': 100},
                {'category': 'Quizzes', 'name': 'Q2', 'score': 90, 'max': 100},
                {'category': 'Quizzes', 'name': 'Q3', 'score': 80, 'max': 100},
            ],
            policies={'drop_lowest': {'Quizzes': 1}},
        )
        result = calc.calculate()
        # Drop 50, keep 90+80 = 170/200 = 85
        assert result['overall'] == 85.0

    def test_drop_lowest_not_enough_grades(self):
        """If drop_n >= num grades, no grades are dropped (safety check)."""
        calc = make_calc(
            [{'name': 'Quizzes', 'weight': 1.0}],
            [{'category': 'Quizzes', 'name': 'Q1', 'score': 70, 'max': 100}],
            policies={'drop_lowest': {'Quizzes': 1}},
        )
        result = calc.calculate()
        # Only 1 grade, can't drop it — kept as-is
        assert result['overall'] == 70.0


# ---------------------------------------------------------------------------
# Letter grade boundaries
# ---------------------------------------------------------------------------

class TestLetterGrades:
    @pytest.mark.parametrize('pct,letter', [
        (100, 'A'), (93, 'A'), (92.9, 'A-'), (90, 'A-'),
        (89.9, 'B+'), (87, 'B+'), (86.9, 'B'), (83, 'B'),
        (82.9, 'B-'), (80, 'B-'), (79.9, 'C+'), (77, 'C+'),
        (76.9, 'C'), (73, 'C'), (72.9, 'C-'), (70, 'C-'),
        (69.9, 'D+'), (67, 'D+'), (66.9, 'D'), (63, 'D'),
        (62.9, 'D-'), (60, 'D-'), (59.9, 'F'), (0, 'F'),
    ])
    def test_letter_boundary(self, pct, letter):
        assert GradeCalculator._to_letter(pct) == letter


# ---------------------------------------------------------------------------
# required_score() tests
# ---------------------------------------------------------------------------

class TestRequiredScore:
    def test_achievable_target(self):
        calc = make_calc(
            SIMPLE_CATS,
            [
                {'category': 'Tests', 'name': 'T1', 'score': 80, 'max': 100},
                {'category': 'Homework', 'name': 'HW1', 'score': 95, 'max': 100},
            ],
        )
        result = calc.required_score(target=90, category='Tests', max_score=100)
        assert result['achievable'] is True
        assert result['required'] is not None
        assert 0 <= result['required'] <= 100

    def test_already_exceeding(self):
        """When current grade already exceeds target, required score should be low/achievable."""
        calc = make_calc(
            [{'name': 'Tests', 'weight': 1.0}],
            [{'category': 'Tests', 'name': 'T1', 'score': 98, 'max': 100}],
        )
        result = calc.required_score(target=80, category='Tests', max_score=100)
        # 98% already exceeds 80% — even a low score keeps us above target
        assert result['required'] < 100
        assert result['achievable'] is True

    def test_unachievable_target(self):
        calc = make_calc(
            SIMPLE_CATS,
            [
                {'category': 'Tests', 'name': 'T1', 'score': 20, 'max': 100},
                {'category': 'Homework', 'name': 'HW1', 'score': 50, 'max': 100},
            ],
        )
        result = calc.required_score(target=95, category='Tests', max_score=100)
        assert result['achievable'] is False
        assert result['required'] > 100


# ---------------------------------------------------------------------------
# what_if() tests
# ---------------------------------------------------------------------------

class TestWhatIf:
    def test_projection_improves_grade(self):
        calc = make_calc(
            SIMPLE_CATS,
            [
                {'category': 'Tests', 'name': 'T1', 'score': 80, 'max': 100},
                {'category': 'Homework', 'name': 'HW1', 'score': 80, 'max': 100},
            ],
        )
        result = calc.what_if([
            {'category': 'Tests', 'name': 'T2', 'score': 100, 'max': 100},
        ])
        assert result['projected'] > result['current']
        assert result['change'] > 0

    def test_projection_lowers_grade(self):
        calc = make_calc(
            SIMPLE_CATS,
            [
                {'category': 'Tests', 'name': 'T1', 'score': 90, 'max': 100},
                {'category': 'Homework', 'name': 'HW1', 'score': 90, 'max': 100},
            ],
        )
        result = calc.what_if([
            {'category': 'Tests', 'name': 'T2', 'score': 50, 'max': 100},
        ])
        assert result['projected'] < result['current']
        assert result['change'] < 0

    def test_projection_has_letter(self):
        calc = make_calc(
            [{'name': 'Tests', 'weight': 1.0}],
            [{'category': 'Tests', 'name': 'T1', 'score': 90, 'max': 100}],
        )
        result = calc.what_if([
            {'category': 'Tests', 'name': 'T2', 'score': 95, 'max': 100},
        ])
        assert result['projected_letter'] is not None
        assert isinstance(result['projected_letter'], str)
