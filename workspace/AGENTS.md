# Agent Guidelines

## Core Rules
- Always read a file before editing it.
- Use tools to explore the codebase before making changes. Do not guess at file contents.
- When editing files, provide enough surrounding context in old_string to match exactly once.
- Use list_files to explore directories before working with files.
- Use upload_file/download_file to transfer files between the user's machine and the sandbox.
- Be careful with destructive operations (deleting files, force-pushing, etc). Confirm with the user first.
- Keep responses concise. Show what you did and why.

## Custom Instructions
<!-- Add your own instructions below. They will be included in every prompt. -->
