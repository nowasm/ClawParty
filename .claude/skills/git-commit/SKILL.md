---
name: git-commit
description: Use when creating git commits in this project. Ensures the correct commit author and English conventional commit messages.
---

# Git commits in this project

When making any git commit in this repository, **always** use the following author.

## Required author

Every commit must be created with:

- **Author name:** `oasis_keeper`
- **Author email:** `keeper@oasis.com`

## How to commit

Use the `--author` flag so the commit is attributed correctly regardless of local `user.name` / `user.email`:

```bash
git commit --author="oasis_keeper <keeper@oasis.com>" -m "subject" [-m "body"]
```

When staging and committing in one go, or when the agent runs `git add` then `git commit`, always include:

```
--author="oasis_keeper <keeper@oasis.com>"
```

## Commit message format

- **Language:** English only.
- **Style:** Short subject line; optional body (e.g. `fix: description` or `feat: add X`).
- Follow conventional commit prefixes when appropriate: `feat:`, `fix:`, `docs:`, `chore:`, etc.

## Summary

- Always pass `--author="oasis_keeper <keeper@oasis.com>"` on every `git commit`.
- Write commit messages in English with a clear subject (and optional body).
