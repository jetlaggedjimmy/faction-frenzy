# Faction Frenzy

Faction Frenzy sorts your Twitch viewers into factions when they subscribe, gift subs, redeem channel
points or type `!jointhebattle` — then tracks faction points on an animated OBS leaderboard.

**v2 runs entirely on the streamer's PC.** No hosted server, no Firebase, no shared infrastructure:
an Electron desktop app with a local SQLite database that talks directly to Twitch.

## How it works

```
┌─────────────────────────── Streamer's PC ───────────────────────────┐
│  Electron app                                                       │
│  ├─ Control panel UI          http://127.0.0.1:4770/                │
│  ├─ Local server (Express + WebSocket)                              │
│  │   ├─ Sorter overlay        http://127.0.0.1:4770/overlay.html     │ ← OBS browser source
│  │   └─ Leaderboard overlay   http://127.0.0.1:4770/leaderboard.html │ ← OBS browser source
│  ├─ SQLite database (viewers, factions, points, seasons, themes)    │
│  └─ Twitch EventSub WebSocket (subs, gifts, redemptions, chat)      │
└─────────────────────────────────────────────────────────────────────┘
```

- **Twitch auth** uses the [Device Code Grant flow](https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/#device-code-grant-flow):
  no client secret is ever stored or shipped.
- **Events** arrive over an EventSub **WebSocket** (no public callback URL needed):
  `channel.subscribe`, `channel.subscription.gift`, `channel.subscription.message`,
  `channel.channel_points_custom_reward_redemption.add` and `channel.chat.message`.
- **Chat commands** (`!jointhebattle`, `!myfaction`, `!factionstandings`, `!award`) are read from
  `channel.chat.message` events and answered via the Helix *Send Chat Message* API — the old
  external chat bot is gone.
- **Overlays** connect to the local WebSocket for instant updates (this replaces the old Firestore
  `onSnapshot` listeners and queue collection).

## Streamer setup

1. Create a Twitch application at [dev.twitch.tv/console/apps](https://dev.twitch.tv/console/apps)
   - OAuth Redirect URL: `http://localhost` (unused, but required by the form)
   - Category: anything; **Client Type: Public**
2. Start Faction Frenzy, paste the app's **Client ID** into the Connection tab and click **Save**.
3. Click **Connect Twitch**, open the shown link and enter the code.
4. Pick a theme on the **Themes & Factions** tab and click **Apply to channel**.
5. Add the two overlay URLs as **Browser Sources** in OBS (copy buttons on the Connection tab).
6. Optional: create a channel point reward named exactly `Respin Faction Slot` to let viewers
   re-roll their faction.

### Points

| Action | Points |
| --- | --- |
| Subscription / resub (Tier 1 / 2 / 3) | 50 / 100 / 150 |
| Prime sub | 75 |
| Gifted subs (to the gifter, per gift) | 50 × tier |
| `!award @user n` (mods/broadcaster) | n |

## Development

```powershell
npm install            # also rebuilds better-sqlite3 for Electron
npm run build          # compile main process (tsc) + web UI (vite)
npm start              # build + launch the app
npm run package        # build a Windows installer into release/
npm run generate-presets  # regenerate src/web/public/presets.json from preset images
```

Project layout:

| Path | Contents |
| --- | --- |
| `src/main/` | Electron main process: local server, SQLite layer, Twitch auth/EventSub/Helix, game logic |
| `src/web/` | Control panel (`index.html`) and OBS overlays (`overlay.html`, `leaderboard.html`), built with Vite |
| `src/shared/` | Types shared between main process and web UI |
| `tools/` | `generate-presets.mjs` — builds `presets.json` from the preset image folders |

Data is stored in `%APPDATA%/faction-frenzy/faction-frenzy.sqlite`.
