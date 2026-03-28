# Ticket

## Request

Implement a root-level CLI tool that an LLM caller can use to take a screenshot showing how a selected Excalidraw target currently looks.

The requested capability set includes:

- taking a screenshot of an actual Excalidraw element or target such as a frame, grouping, or similar selected scope
- making that screenshot capability available as a CLI tool usable by the LLM workflow
- mentioning the screenshot workflow in the LLM skill/instructions

Notes captured with the request:

- this feature was split out from the animation CLI work item as a separate feature
- Playwright was mentioned as a possible implementation direction, without making it a fixed requirement in the ticket

## Workflow Notes

This workflow directory was created by splitting the screenshot-related request from `.opencode/thoughts/rpi/adhoc-excalidraw-animation-cli` into its own feature folder.
