# Contributing

Bug reports and pull requests are welcome.

## Reporting a bug

Open an [issue](https://github.com/TheLordDuck/endstep-arena/issues/new/choose) with the
*Bug report* form, or use **Report an Arena UI bug** in the board's table menu (right-click the
table), which fills in your version. The most useful things to include:

* the cards involved and the moment in the game;
* a screenshot;
* if a prompt stepped aside to Endstep's UI, what the debug panel's *Unsupported* tab shows
  (**Alt+Shift+D**).

First check whether it also happens in Endstep's own UI (**Alt+Shift+A**): if it does, it's
Endstep's, not the extension's.

## Setting up

```sh
pnpm install
pnpm build:dev       # or: pnpm watch
```

Load `dist/` unpacked in `chrome://extensions` (Developer mode), then reload the extension and
the endstep.cc tab after each rebuild. See the README's *Development* section for the dev server
and [docs/testing.md](docs/testing.md) for the harness, which renders the board from saved
states without a live match: `node build.mjs --harness`, then open
`dist-harness/harness.html#<scenario>`.

## Pull requests

* One change per pull request; open an issue first for anything big, so we can agree on it.
* `pnpm typecheck` and `pnpm test` must pass (CI runs them on every pull request).
* Add or update a test when you fix something in `src/game/`.
* For anything you can see, add screenshots, and a harness scenario if one doesn't cover it.
* Endstep-specific code stays in `src/game/endstep/`; the board works from `GameState`.
* Nothing may be sent to Endstep that its own UI wouldn't send.

By contributing, you agree that your contribution is licensed under the [MIT License](LICENSE).
