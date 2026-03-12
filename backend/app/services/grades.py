"""Pure-math grade calculator — no AI, no database."""
from typing import Optional


class GradeCalculator:
    LETTER_GRADES = [
        (97, "A+"), (93, "A"), (90, "A-"),
        (87, "B+"), (83, "B"), (80, "B-"),
        (77, "C+"), (73, "C"), (70, "C-"),
        (67, "D+"), (63, "D"), (60, "D-"),
        (0, "F"),
    ]

    def __init__(self, categories: list, grades: list, policies: Optional[dict] = None):
        self.categories = categories
        self.grades = grades
        self.policies = policies or {}

    def calculate(self) -> dict:
        drop_lowest = self.policies.get("drop_lowest", {})
        cat_weights = {c["name"]: c["weight"] for c in self.categories}
        category_results = {}
        weighted_sum = 0.0
        weight_used = 0.0

        for cat_name, weight in cat_weights.items():
            avg = self._category_average(cat_name, drop_lowest.get(cat_name, 0))
            category_results[cat_name] = {"weight": weight, "average": avg}
            if avg is not None:
                weighted_sum += avg * weight
                weight_used += weight

        overall = round(weighted_sum / weight_used, 2) if weight_used > 0 else None
        letter = self._to_letter(overall) if overall is not None else None

        return {
            "overall": overall,
            "letter": letter,
            "categories": category_results,
            "weight_coverage": round(weight_used * 100 / sum(cat_weights.values()), 1) if cat_weights else 0,
        }

    def required_score(self, target: float, category: str, max_score: float = 100) -> dict:
        drop_lowest = self.policies.get("drop_lowest", {})
        cat_weights = {c["name"]: c["weight"] for c in self.categories}
        target_weight = cat_weights.get(category)
        if target_weight is None:
            return {"error": f"Unknown category: {category}"}

        other_contribution = 0.0
        other_weight = 0.0
        for cat_name, weight in cat_weights.items():
            if cat_name == category:
                continue
            avg = self._category_average(cat_name, drop_lowest.get(cat_name, 0))
            if avg is not None:
                other_contribution += avg * weight
                other_weight += weight

        total_weight = other_weight + target_weight
        needed_weighted = target * total_weight - other_contribution
        needed_average = needed_weighted / target_weight if target_weight > 0 else None

        if needed_average is None:
            return {"error": "Cannot calculate"}

        cat_grades = [g for g in self.grades if g["category"] == category]
        current_total_score = sum(g["score"] for g in cat_grades)
        current_total_max = sum(g["max"] for g in cat_grades)

        required = (needed_average / 100) * (current_total_max + max_score) - current_total_score

        return {
            "target": target,
            "category": category,
            "required": round(required, 2),
            "max_score": max_score,
            "achievable": 0 <= required <= max_score,
        }

    def what_if(self, hypothetical_grades: list) -> dict:
        current = self.calculate()
        all_grades = self.grades + hypothetical_grades
        projected_calc = GradeCalculator(self.categories, all_grades, self.policies)
        projected = projected_calc.calculate()

        return {
            "current": current["overall"],
            "current_letter": current["letter"],
            "projected": projected["overall"],
            "projected_letter": projected["letter"],
            "change": round((projected["overall"] or 0) - (current["overall"] or 0), 2) if projected["overall"] and current["overall"] else None,
        }

    def _category_average(self, category: str, drop_n: int = 0) -> Optional[float]:
        cat_grades = sorted(
            [g for g in self.grades if g["category"] == category],
            key=lambda g: g["score"] / g["max"] if g["max"] > 0 else 0,
        )
        if not cat_grades:
            return None
        if drop_n > 0 and len(cat_grades) > drop_n:
            cat_grades = cat_grades[drop_n:]
        total_score = sum(g["score"] for g in cat_grades)
        total_max = sum(g["max"] for g in cat_grades)
        if total_max == 0:
            return None
        return (total_score / total_max) * 100

    @staticmethod
    def _to_letter(percentage: float) -> str:
        for threshold, letter in GradeCalculator.LETTER_GRADES:
            if percentage >= threshold:
                return letter
        return "F"
