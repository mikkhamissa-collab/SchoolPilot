# grades.py — Pure math grade calculator. No AI, no database.
from typing import Optional


class GradeCalculator:
    """Calculates current grades, required scores, and what-if projections."""

    def __init__(self, categories: list[dict], grades: list[dict], policies: Optional[dict] = None):
        """
        categories: [{"name": "Tests", "weight": 0.40}, ...]
        grades: [{"category": "Tests", "name": "Unit 1 Test", "score": 87, "max": 100}, ...]
        policies: {"drop_lowest": {"Quizzes": 1}, "missing_penalty": 0}
        """
        self.categories = {c['name']: c['weight'] for c in categories}
        self.grades = grades
        self.policies = policies or {}
        self.drop_lowest = self.policies.get('drop_lowest', {})
        self.missing_penalty = self.policies.get('missing_penalty', 0)

    def _category_grades(self, category: str) -> list[dict]:
        """Get all grades for a category, sorted by percentage (ascending for drop-lowest)."""
        cat_grades = [g for g in self.grades if g['category'] == category]
        cat_grades.sort(key=lambda g: g['score'] / g['max'] if g['max'] > 0 else 0)
        return cat_grades

    def _category_average(self, category: str, extra_grades: Optional[list[dict]] = None) -> Optional[float]:
        """Calculate average for a category, applying drop-lowest if configured."""
        cat_grades = self._category_grades(category)
        if extra_grades:
            cat_grades = cat_grades + extra_grades
            cat_grades.sort(key=lambda g: g['score'] / g['max'] if g['max'] > 0 else 0)

        if not cat_grades:
            return None

        # Drop lowest N
        drop_n = self.drop_lowest.get(category, 0)
        if drop_n > 0 and len(cat_grades) > drop_n:
            cat_grades = cat_grades[drop_n:]

        total_score = sum(g['score'] for g in cat_grades)
        total_max = sum(g['max'] for g in cat_grades)
        if total_max == 0:
            return None
        return (total_score / total_max) * 100

    def calculate(self) -> dict:
        """Calculate current grade per category and overall weighted grade."""
        category_results = {}
        weighted_sum = 0.0
        weight_used = 0.0

        for cat_name, weight in self.categories.items():
            avg = self._category_average(cat_name)
            count = len(self._category_grades(cat_name))
            category_results[cat_name] = {
                'average': round(avg, 2) if avg is not None else None,
                'weight': weight,
                'assignments': count
            }
            if avg is not None:
                weighted_sum += avg * weight
                weight_used += weight

        overall = round(weighted_sum / weight_used, 2) if weight_used > 0 else None

        return {
            'overall': overall,
            'letter': self._to_letter(overall) if overall is not None else None,
            'categories': category_results,
            'weight_coverage': round(weight_used * 100, 1)
        }

    def required_score(self, target: float, category: str, max_score: float = 100) -> dict:
        """
        Calculate the minimum score needed on the next assessment in a category
        to achieve a target overall grade.
        """
        # Current state for all OTHER categories
        other_weighted = 0.0
        other_weight_used = 0.0
        target_cat_weight = self.categories.get(category, 0)

        for cat_name, weight in self.categories.items():
            if cat_name == category:
                continue
            avg = self._category_average(cat_name)
            if avg is not None:
                other_weighted += avg * weight
                other_weight_used += weight

        # Current grades in the target category
        cat_grades = self._category_grades(category)
        drop_n = self.drop_lowest.get(category, 0)

        # We need: (other_weighted + target_cat_avg * target_cat_weight) / total_weight = target
        # Solve for target_cat_avg
        total_weight = other_weight_used + target_cat_weight
        if total_weight == 0 or target_cat_weight == 0:
            return {'required': None, 'achievable': False, 'explanation': 'Missing category weight data.'}

        needed_cat_avg = (target * total_weight - other_weighted) / target_cat_weight

        # Now figure out what score on the next assessment gives that category average
        # With drop-lowest, add the new grade and recalculate
        current_scores = [g['score'] for g in cat_grades]
        current_maxes = [g['max'] for g in cat_grades]

        # total_score + X, total_max + max_score, after dropping lowest
        # We need to solve for X such that category average = needed_cat_avg
        # Simpler: binary search or direct solve

        total_score = sum(current_scores)
        total_max = sum(current_maxes)

        if drop_n > 0 and len(cat_grades) + 1 > drop_n:
            # With drop lowest, we need to consider that the new grade or an old grade gets dropped
            # Use brute approach: try the needed score and verify
            required = self._solve_required_with_drop(
                cat_grades, needed_cat_avg, max_score, drop_n
            )
        else:
            # Simple case: (total_score + X) / (total_max + max_score) = needed_cat_avg / 100
            # X = (needed_cat_avg / 100) * (total_max + max_score) - total_score
            required = (needed_cat_avg / 100) * (total_max + max_score) - total_score

        achievable = 0 <= required <= max_score
        required_pct = round((required / max_score) * 100, 1) if max_score > 0 else None

        if required < 0:
            explanation = f"You already exceed the target! Even a 0 keeps you above {target}%."
        elif required > max_score:
            explanation = f"You'd need {required_pct}%, which exceeds the max. Target may not be reachable with one assessment."
        else:
            explanation = f"Score at least {round(required, 1)}/{max_score} ({required_pct}%) on your next {category.lower()} assessment."

        return {
            'required': round(required, 1),
            'required_pct': required_pct,
            'achievable': achievable,
            'explanation': explanation
        }

    def _solve_required_with_drop(self, cat_grades: list[dict], needed_avg: float,
                                   max_score: float, drop_n: int) -> float:
        """Solve for required score when drop-lowest is active using binary search."""
        lo, hi = 0.0, max_score
        for _ in range(100):
            mid = (lo + hi) / 2
            test_grade = {'score': mid, 'max': max_score, 'category': cat_grades[0]['category'] if cat_grades else ''}
            all_grades = cat_grades + [test_grade]
            all_grades.sort(key=lambda g: g['score'] / g['max'] if g['max'] > 0 else 0)
            after_drop = all_grades[drop_n:]
            total_s = sum(g['score'] for g in after_drop)
            total_m = sum(g['max'] for g in after_drop)
            avg = (total_s / total_m * 100) if total_m > 0 else 0
            if avg < needed_avg:
                lo = mid
            else:
                hi = mid
        return (lo + hi) / 2

    def what_if(self, hypotheticals: list[dict]) -> dict:
        """
        Project final grade with hypothetical scores.
        hypotheticals: [{"category": "Tests", "name": "Unit 3 Test", "score": 85, "max": 100}, ...]
        """
        # Combine real grades with hypotheticals
        combined = self.grades + hypotheticals
        projected = GradeCalculator(
            categories=[{'name': k, 'weight': v} for k, v in self.categories.items()],
            grades=combined,
            policies=self.policies
        )
        result = projected.calculate()
        current = self.calculate()

        change = None
        if result['overall'] is not None and current['overall'] is not None:
            change = round(result['overall'] - current['overall'], 2)

        return {
            'current': current['overall'],
            'projected': result['overall'],
            'projected_letter': result['letter'],
            'change': change,
            'categories': result['categories']
        }

    @staticmethod
    def _to_letter(pct: float) -> str:
        """Convert percentage to letter grade."""
        if pct >= 93: return 'A'
        if pct >= 90: return 'A-'
        if pct >= 87: return 'B+'
        if pct >= 83: return 'B'
        if pct >= 80: return 'B-'
        if pct >= 77: return 'C+'
        if pct >= 73: return 'C'
        if pct >= 70: return 'C-'
        if pct >= 67: return 'D+'
        if pct >= 63: return 'D'
        if pct >= 60: return 'D-'
        return 'F'
