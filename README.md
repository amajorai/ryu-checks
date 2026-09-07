<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./icon-dark.png" />
    <img src="./icon-light.png" alt="Tests" width="144" />
  </picture>
</p>

<div align="center">

# Tests

</div>

A local-first verification workspace: configure projects, explore features, generate UI/API check plans, review evidence, group suites, and schedule regression checks inside Ryu.

> **The public home of `ryu-checks`.** Source, builds, and releases live here —
> binaries for every platform are attached to each release.
>
> This tree is generated from the Ryu monorepo, so commits pushed here
> directly are replaced on the next sync. **Pull requests are welcome** —
> open them here and they are ported into the monorepo, then flow back out.
> Ryu as a whole: https://github.com/amajorai/ryu

## Install

**App:** [Install](ryu://apps/@ryu/checks) (opens the Ryu desktop app and asks you to confirm)

**CLI:**

```bash
ryu apps add @ryu/checks
```

## Source & build

This is the **source of record** for the app UI. It imports Ryu's private
`@ryu/ui` design system, so it does **not** build standalone outside the
monorepo — it **builds inside the amajorai/ryu monorepo workspace**.
The shipped bundle is the built artifact, produced by the monorepo build.

## License

Apache-2.0 — see [LICENSE](./LICENSE).

## Surface

- **Home** — empty planning workspace and runner status.
- **All Tests** — project plans with UI/API type and coverage once a plan exists.
- **Create Tests** — a four-step planning wizard; exploration and generation are
  not executed.
- **Project detail** — planned flows and explicit no-evidence states.
- **Test Lists / Monitoring** — reserved planning surfaces; execution and schedules
  are unavailable.
- **Settings** — explicit placeholders for the future API-key and GitHub bridges.

## Build

```sh
bun run --cwd apps-store/checks/ui build
bun run --cwd apps-store/checks/ui check-types
bun test --cwd apps-store/checks/ui
```

The UI builds to one self-contained `dist/index.html`. It does not make network
requests or claim to have run a test.
