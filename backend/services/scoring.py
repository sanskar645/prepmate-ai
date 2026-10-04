"""
PrepMate AI — Scoring algorithms (Section 5 of spec).
"""


def calc_composite(tech: int, comm: int, rel: int) -> float:
    """5.1 Composite Score: weighted sum of 3 dimensions."""
    return round(0.5 * tech + 0.3 * comm + 0.2 * rel, 2)


def calc_session_score(answers: list[dict]) -> float:
    """5.2 Session Score with recency weighting."""
    scored = [a for a in answers if a.get("composite_score") is not None]
    n = len(scored)
    if n == 0:
        return 0.0
    total = 0.0
    weight_sum = 0.0
    for i, ans in enumerate(scored, 1):
        w = 1 + (i / n)
        total += w * ans["composite_score"]
        weight_sum += w
    return round((total / weight_sum) * 10, 2)


def calc_prs(user_id: str, session_scores: list[float]) -> float:
    """5.3 Placement Readiness Score (PRS)."""
    if not session_scores:
        return 0.0
    recent = session_scores[-3:]
    s_bar = sum(recent) / len(recent)
    first = session_scores[0] if len(session_scores) > 1 else s_bar
    latest = session_scores[-1]
    improvement = max(0, min(100, 50 + (latest - first) * 5))
    mean_s = sum(session_scores) / len(session_scores)
    variance = sum((s - mean_s) ** 2 for s in session_scores) / len(session_scores)
    std_dev = variance ** 0.5
    consistency = max(0, 100 - std_dev * 10)
    prs = 0.6 * s_bar + 0.25 * improvement + 0.15 * consistency
    return round(min(100, max(0, prs)), 2)


def next_difficulty(prev_score: float, current_diff: str) -> str:
    """5.4 Adaptive difficulty selection.

    Monotonic by design: easy never escalates on a *low* score and hard never
    de-escalates on a *high* one (the naive helper used to push a struggling
    student from easy up to medium, and let a strong student drop from hard
    down to medium).
    """
    escalate = {"easy": "medium", "medium": "hard", "hard": "hard"}
    de_escalate = {"easy": "easy", "medium": "easy", "hard": "medium"}

    if prev_score >= 7:
        return escalate.get(current_diff, current_diff)
    elif prev_score <= 4:
        return de_escalate.get(current_diff, current_diff)
    return current_diff


def get_skill_gap(domain_scores: dict[str, list[float]]) -> dict[str, float | None]:
    """5.5 Skill gap vector: mean score per domain. Returns None for unassessed domains."""
    gap: dict[str, float | None] = {}
    for domain, scores in domain_scores.items():
        gap[domain] = round(sum(scores) / len(scores), 2) if scores else None
    return gap
