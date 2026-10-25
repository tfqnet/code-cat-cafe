# Setting up Code Cat Café on your MacBook

This takes about 10 minutes the first time. You'll use the **Terminal** app (press `⌘ Space`, type *Terminal*, press Enter).

Lines in grey boxes are commands: copy one, paste it into Terminal, press Enter, and wait for it to finish before the next one.

---

## 1. Check what you already have

```bash
node -v
git --version
claude --version
```

- `node -v` should print **v20** or higher (e.g. `v22.11.0`). If it says *command not found* or a lower number, do step 2.
- `git --version` should print a version. If macOS pops up a window offering to install developer tools, click **Install** and wait.
- `claude --version` should print a version. If not, install Claude Code first: https://code.claude.com/docs

## 2. Install Node.js (only if step 1 said you need it)

The easiest way is Homebrew, the Mac package manager. If you don't have it yet:

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

At the end, Homebrew prints **"Next steps"** with two or three commands to add it to your PATH. Run those too. Then:

```bash
brew install node
node -v
```

## 3. Download the café

Pick a folder for your code. This guide uses `~/code`.

```bash
mkdir -p ~/code
cd ~/code
git clone https://github.com/tfqnet/code-cat-cafe.git
cd code-cat-cafe
npm install
```

## 4. Open the café

```bash
npm start
```

Your browser opens **http://localhost:4777** and the badge in the corner says **● Live**. The cats are just chilling for now, because nothing is connected yet.

**Leave this Terminal window open.** The café runs as long as it's open. To stop it, click the window and press `Ctrl + C`.

Want to see it in action right away? Open a **new Terminal tab** (`⌘ T`) and run:

```bash
cd ~/code/code-cat-cafe
npm run sample
```

You'll watch a full order go through: planning, the bell ringing for your approval, design, coding, a failed test, the fix, and the order being served.

## 5. Connect a project

In that second tab, still in the `code-cat-cafe` folder, connect the project you want to watch. Replace `~/code/my-app` with your project's folder:

```bash
npm run setup -- ~/code/my-app --team
```

This does two things:

- Adds the café hooks to `my-app/.claude/settings.local.json` (a personal settings file that isn't committed to git).
- Copies the cat team into your project: `.claude/agents/planner.md`, `designer.md`, `developer.md`, `tester.md`, and `CLAUDE.md` with the team workflow. If your project already has a `CLAUDE.md`, it's left alone and the workflow is saved as `CLAUDE.team.md` so you can merge it in yourself.

> Tip: to find a project's path, type `cd ` in Terminal (with a space), drag the project folder from Finder into the window, and press Enter. Then `pwd` prints the full path.

Open `CLAUDE.md` in your project and fill in **Project notes** at the bottom (stack, how to run, how to test).

Leave off `--team` if you only want the hooks and already have your own agents. To watch **every** project instead of one, use `npm run setup -- --global`.

## 6. Use it

1. Terminal tab 1: the café is running (`npm start`).
2. Terminal tab 2: go to your project and start Claude Code:

   ```bash
   cd ~/code/my-app
   claude
   ```

3. Ask for a feature, e.g. *"Add a dark mode toggle to the settings page"*.
4. Put the browser next to your terminal and watch. Click **🔕 Sound** once to turn on the bell sound.

When Claude needs your permission or is waiting for you, the bell rings in the café. **Answer in the terminal**: the café only shows what's happening, it doesn't control Claude.

Tap or click any cat to see what it's doing and its last action.

## Every day after that

```bash
cd ~/code/code-cat-cafe && npm start
```

Optional shortcut: add an alias so you can just type `cafe`:

```bash
echo 'alias cafe="cd ~/code/code-cat-cafe && npm start"' >> ~/.zshrc
source ~/.zshrc
```

To get the latest version later:

```bash
cd ~/code/code-cat-cafe
git pull
npm install
```

## Troubleshooting

**The badge says "Demo" or "Connecting…"**
The café server isn't running. Start it with `npm start` in the `code-cat-cafe` folder.

**"Port 4777 is already in use"**
The café is already open in another Terminal tab. Use that one, or close it with `Ctrl + C`.

**The café is Live but the cats don't react to Claude Code**
- Hooks are only loaded when a session starts. Quit Claude Code (`/exit`) and start it again.
- In Claude Code, type `/hooks` and check that the café's `curl ... # code-cat-cafe` entries are listed.
- Check that events are arriving: `tail -f ~/.code-cat-cafe/hook-events.jsonl` should print new lines as Claude works. If they arrive but the cats still don't react, send that file to whoever is helping you debug.

**Only the lead cat works**
Claude is doing the work itself instead of handing it to the team. Make sure the team files are in your project (`.claude/agents/`) and that `CLAUDE.md` contains the team workflow, or ask Claude directly: *"Use the planner, designer, developer and tester subagents for this."*

**Remove the café from a project**

```bash
cd ~/code/code-cat-cafe
npm run setup -- ~/code/my-app --remove
```
