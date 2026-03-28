---
date: "2026-03-28T02:10:00Z"
author: opencode
type: research-questions
topic: "Implement a root-level Excalidraw target screenshot CLI for LLM callers"
status: complete
git_commit: "f78743d3a561481ef355a731fa2cd53282ef7fe3"
git_branch: "master"
last_updated: "2026-03-28T04:16:00Z"
last_updated_by: opencode
---

# Research Questions: Implement a root-level Excalidraw target screenshot CLI for LLM callers

## Objective

We need to understand how the current codebase identifies renderable Excalidraw targets, what existing rendering or browser-automation seams already exist, and where agent-facing workflow guidance is currently defined. This will clarify the current-state constraints and reusable patterns before design or implementation work continues.

## Questions

1. How are Excalidraw targets such as frames, grouped elements, and other selectable scopes identified and described today in the existing root workflow artifacts and reference code?
2. What current code paths already render Excalidraw content to SVG, DOM, or browser-visible output, and which of those paths are reusable for producing a screenshot of a selected target?
3. What Playwright usage, browser automation setup, or screenshot-related test patterns already exist in this repository, and where are they located?
4. What current inspection or manifest data is available to let an LLM reliably refer to a specific frame, group, or element subset when requesting a screenshot?
5. Where is the current LLM skill or agent workflow guidance for this CLI stored, and what existing instruction patterns govern how new CLI capabilities are documented for agent callers?

## Notes For Research Agent

- Answer the questions using the current codebase and relevant existing artifacts
- Stay descriptive and objective
- Do not propose implementation changes
