"""Goal validation + planning outside the chat graph (used by the 'Create goal' wizard).

Reuses the same prompts/schemas as the chat graph nodes so both entry points behave identically.
"""
from __future__ import annotations

import time
from datetime import date

from langchain_core.messages import HumanMessage, SystemMessage

from app.agents import llm, prompts
from app.agents.graph import HARMFUL_PATTERNS
from app.agents.schemas import GoalPlan, GoalValidation
from app.agents.tools import web_search


def preview_goal(request: str, today: date, existing_titles: list[str], usage: llm.Usage) -> dict:
    steps: list[dict] = []

    def step(name: str, label: str, fn):
        start = time.perf_counter()
        first = len(usage)
        result = fn()
        calls = usage.since(first)
        steps.append({"node": name, "label": label, "ms": round((time.perf_counter() - start) * 1000, 1),
                      "input_tokens": sum(c.input_tokens for c in calls),
                      "output_tokens": sum(c.output_tokens for c in calls),
                      "providers": sorted({f"{c.provider}:{c.model}" for c in calls})})
        return result

    keyword_block = bool(HARMFUL_PATTERNS.search(request))
    validation = step("goal_validator", "Validating goal", lambda: llm.structured("validate", GoalValidation, [
        SystemMessage(prompts.VALIDATOR_SYSTEM.format(today=today.isoformat())),
        HumanMessage(f"Requested goal: {request}\nExisting goals: {', '.join(existing_titles) or 'none'}"),
    ], usage).model_dump())
    if keyword_block:
        validation["tier"] = "refuse"
        validation["reason"] = validation.get("reason") or "This request involves something dangerous or illegal."

    result = {"validation": validation, "plan": None, "sources": [], "steps": steps}
    if validation["tier"] == "refuse":
        return result

    if validation["needs_web_search"] and validation["search_query"]:
        result["sources"] = step("web_search", "Searching the web", lambda: web_search(validation["search_query"]))

    web = "\n".join(f"- {r['title']}: {r['snippet']}" for r in result["sources"][:5]) or "none"
    plan = step("goal_planner", "Planning goal", lambda: llm.structured("plan", GoalPlan, [
        SystemMessage(prompts.PLANNER_SYSTEM.format(today=today.isoformat())),
        HumanMessage(f"Goal: {validation['title']}\nCategory: {validation['category']}\n"
                     f"Timeframe: {validation['suggested_deadline_days']} days\nWhy/notes: {validation['reason']}\n"
                     f"User said: {request}\nWeb results:\n{web}"),
    ], usage))
    result["plan"] = plan.model_dump()
    return result
