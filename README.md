# PostWeavers

**AI-drafted X replies in your own voice. You read, edit, and press Post yourself. Never automated.**

[Install from the Chrome Web Store](https://chromewebstore.google.com/detail/postweavers-ai-replies-in/ackmlmajnidhppghbbcbnkfbkibfbbhd) · [Website](https://postweavers.com) · [Why not automation?](https://postweavers.com/why-not-automation)

## Why this repo is public

PostWeavers makes strong privacy claims: it never posts for you, your feed never leaves your browser, your API key stays on your device, and nothing you write is used for training. Claims like that shouldn't require trust. This is the complete source of the extension you install from the store, so you can verify every one of them yourself.

## What it does

- **Reply drafting in a side panel** that reads the post, thread, and author context on X
- **Voice profile**: one click analyzes your recent posts into an editable style guide; every draft matches it
- **Strategies**: agree & add, contrarian, insight, humor, bait question, or write your own
- **Three takes** per post, side by side; pick the best
- **One-tap refinements**: shorter, punchier, more specific, softer
- **Context basket**: gather related posts anywhere on X and weave them into your next draft
- **Reply timing nudge**: know when a post is fresh enough to be worth answering

## What it never does

- Never posts, replies, DMs, likes, or follows on your behalf. You press X's own buttons, every time.
- Never sees your password or holds your X session.
- Never ships your browsing to a server. Posts you scroll past are parsed into local browser storage for voice learning and context, and go nowhere else.
- Never trains on your words.

Automated engagement is against X's rules and gets accounts suspended. PostWeavers is deliberately human-in-the-loop: it's a pen, not a machine.

## How drafting works

Two modes:

- **Bring your own key** (free): drafting calls go directly from your browser to Anthropic or OpenAI with your key. The key is stored in extension storage on your device and is sent nowhere else. See `src/lib/ai-drafter/llm-client.ts`.
- **PostWeaver Cloud** ($12/mo): drafting runs through a managed backend so no key is needed. The backend is not part of this repo.

Prompt construction, including the voice profile system, is in `src/lib/ai-drafter/prompt-builder.ts`.

## Development

Built with [WXT](https://wxt.dev), React, TypeScript, and Tailwind.

```bash
npm install
npm run dev      # launches Chrome with the extension in dev mode
npm test         # vitest
npm run build    # production build
npm run zip      # store-ready zip in .output/
```

Load the dev build against x.com, open the side panel (Cmd+Shift+S), and click into any reply box.

## Repo layout

```
entrypoints/   background worker, content script, X network interceptor, side panel
src/
  components/  side panel UI (composer, settings)
  lib/         drafting, prompt building, LLM clients, voice learning,
               AI-slop detection heuristics, storage
  types/       shared types
public/        icons
```

## Contributing

Issues and PRs are welcome, with one expectation set upfront: this is a solo-maintained product with a closed roadmap, so features may be declined even when well built. Bug reports with reproduction steps are always valued.

## License

[AGPL-3.0](LICENSE). You can read, run, and fork this code freely. If you distribute a modified version, or offer it as a service, your version must be open source under the same license. The PostWeavers name, logo, and the PostWeaver Cloud backend are not covered by this license.
