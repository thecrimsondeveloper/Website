# RUN

Use this file as the workflow router.

```text
START
 |
 +-- Need repository? -------- workflows/ACQUIRE-REPOSITORY.md
 |
 +-- Environment ready? ------ workflows/PREPARE-ENVIRONMENT.md
 |
 +-- Needs build? ------------ workflows/BUILD-WEBSITE.md
 |
 +-- Needs localhost? -------- workflows/SERVE-LOCALHOST.md
 |
 +-- Normal website? --------- workflows/RENDER-WEBSITE.md
 |
 +-- Three.js/WebGL/game? ---- workflows/RENDER-WEBGL.md
 |
 +-- Need interaction? ------- workflows/OPERATE-WEBSITE.md
 |
 +-- Need responsive proof? -- workflows/CAPTURE-VIEWS.md
 |
 +-- Validate? --------------- workflows/VALIDATE-RESULT.md
 |
 +-- Return proof ------------ workflows/REPORT-EVIDENCE.md
```

## Environment routing
- ChatGPT online/sandbox: `environments/CHATGPT-ONLINE.md`
- Local workstation: `environments/LOCAL.md`
- CI runner: `environments/CI.md`

## Required behavior
Use the real repository, real build, real localhost application, and real browser whenever browser validation is requested. Use the implementation in `.agent/plugins/headless-run-kit` rather than inventing an alternate renderer.
