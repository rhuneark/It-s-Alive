# It's Alive!

A RUN.world game. Every night the whole community votes on one body part for a shared
gothic monster; at midnight US Central time the winning part is stitched on. On Halloween it wakes.

See [CLAUDE.md](CLAUDE.md) for the project layout, conventions, art pipeline, checks and deployment.

## Work on it from your computer

The game is already created on RUN and GitHub already deploys it, so this only sets up a copy
on your computer that you can change and push.

### 1. Install the tools (one time)

You need Node.js 20 or newer (the deploy uses 22) and Git. Check what you have:

```bash
node --version
git --version
```

If either is missing, install Node.js (LTS) from nodejs.org and Git from git-scm.com.

Install the RUN CLI.

Mac or Linux:

```bash
curl -fsSL https://github.com/series-ai/rundot-cli-releases/releases/latest/download/install.sh | bash
```

Windows (PowerShell):

```powershell
irm https://github.com/series-ai/rundot-cli-releases/releases/latest/download/install.ps1 | iex
```

Then close and reopen the terminal and check that it works: `rundot --version`

### 2. Download the game code (one time)

```bash
git clone -b claude/blissful-keller-ybbygh https://github.com/rhuneark/It-s-Alive
cd It-s-Alive
npm ci
npx playwright install chromium
npx rundot-sdk-setup
```

- `npx playwright install chromium` downloads the browser the phone playthrough test uses.
- `npx rundot-sdk-setup` asks four questions: answer **y** to the first (copy the SDK docs into
  `rundot/docs`, which Claude reads) and **n** to the other three (the repo already has them).

### 3. Log in to RUN (one time, optional)

```bash
rundot login
```

Sign in with the Google account that owns It's Alive!. You only need this to deploy or publish
by hand (below); the checks and pushing work without it.

Do **not** run `rundot init` (the game already exists: `game.config.prod.json`, id
`GORVjkIRThUz5n2tmAms`; init would create a second game) and do not create another deploy key
(GitHub already has `RUNDOT_API_KEY`).

### 4. Every time you work on it

```bash
git pull          # get the latest first: Claude's cloud sessions push to this branch too
npm ci            # only needed when package.json changed
npm run dev       # opens the game at http://localhost:5173
```

The dev server fakes RUN (no sign-in, a stand-in crowd of voters). Add `?day=N` to the address to
jump to a night: `?day=0` is night 1, `?day=18` night 19, `?day=19` the vigil, `?day=20` Halloween.

When your change works, run every check and push:

```bash
npm run check     # types, unit tests, fairness simulation, build, RUN preflight, phone playthrough
git add -A
git commit -m "Say what you changed"
git push
```

The first `git push` asks you to sign in to GitHub. Every push deploys a new **private** version
automatically (GitHub, Actions tab, "Deploy to RUN", about a minute); try it with the private
share link. If `git push` is rejected because the branch moved on, run `git pull` and push again.

### Going public

Public players only get a version after it is published and RUN has reviewed it. On GitHub:
Actions, "Publish or unpublish on RUN", Run workflow, `publish` (leave the version blank for the
newest). Or, logged in, `rundot game set-public --version X.Y.Z`.

### Deploying by hand (optional)

Pushing is the normal way. To deploy without pushing (after `rundot login`):

```bash
npm run build
rundot deploy --orientation Portrait
```

### Repainting monster parts (optional)

The art tools in `tools/art` need Python 3 (`pip install requests pillow`) and your PixelLab API
token in `PIXELLAB_API_KEY` (Mac/Linux: `export PIXELLAB_API_KEY=...`, Windows PowerShell:
`$env:PIXELLAB_API_KEY="..."`). Never put the token in a file in the repo. Commands are in CLAUDE.md.
