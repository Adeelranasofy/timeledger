# TimeLedger

A desktop app for tracking attendance, hours and pay. Employees log check-in/out times and breaks; HR sees hours worked, amounts earned, payments made and balances owed, week to week.

## Run it

Requires [Node.js](https://nodejs.org) 20 or newer.

```bash
npm install      # first time only (downloads Electron)
npm start        # launch the app
npm test         # run the calculation test suite
```

Build an installer for your own OS:

```bash
npm run dist     # Windows: .exe installer + portable · macOS: .dmg · Linux: AppImage + .deb
```

Output lands in `dist/`. Build on the OS you're targeting (Windows installers need to be built on Windows).

## What's in it

**Ledger table (one per employee)**: Date · Check-in · Check-out · Rest break · Working hours · Rate · Amount · Paid amount · Paid ✓ · Balance · Running balance · Notes.

- **Workspaces**: separate sites, shops, clients or projects, picked from the dropdown at the top of the sidebar (name + details). One person can work in several workspaces, with a different hourly rate, role, opening balance and ledger in each. Add a new person or an existing one from another workspace; remove someone from a workspace without touching their other records.
- **New workspace setup**: name and details, default check-in/check-out, rest break, work days and hourly rate for that workspace, and a list to assign employees. Each assigned employee gets their own rate (pre-filled with the workspace default) and an **Import old attendance** checkbox. New people can be added from the same list. New rows in a workspace use its defaults; the Settings defaults are the starting values for new workspaces.
- **Share updates with employees**: send a payment receipt or a pay summary by **WhatsApp**, **email**, or **copy & paste**. Use the Share button, the ⋯ menu on a payment, or the prompt right after recording one. The message is editable. It lists the payment, the work it covers, hours, earned, paid for those days and the balance still due, optionally day by day. Payments that were shared show a *Shared* tag. Employee email and WhatsApp number are saved on the employee.
- **Import old attendance** when adding or editing an employee (or Export → Import old attendance). Paste cells copied from Excel / Google Sheets or pick a CSV file. Columns are matched automatically and can be changed. Dates like `01/09/2026`, `2026-09-01` or `1 Sep 2026`, 12- or 24-hour times, breaks, hours-only sheets, paid amounts, and Leave/Holiday days all work, and so does TimeLedger's own CSV export (payments included). A preview shows what will be imported and which lines can't be read. Nothing is saved until you save the employee, and one Undo reverses it.
- **12- or 24-hour times** (Settings → Display). Type `0600` and it becomes `06:00`; type `0600PM` or `6:30 pm` and it's read as PM. In 12-hour mode each time has a small AM/PM dropdown, used when you type a time without AM/PM.
- **Leave & holidays**: mark a date or a date range as leave (one employee) or holiday (everyone in the workspace). These days have no hours or pay, "Add week" skips them, and they are counted in the HR overview. Unpaid work rows on those dates are replaced; rows with pay recorded are kept.
- **Fast entry**: type times as `9`, `930`, `09:30`, or `n` for now. Breaks accept `30`, `0:30`, `1h 15m`. Enter moves down a row, like a spreadsheet.
- **Check in / Start break / Check out** buttons log today's shift live.
- **Add day** and **Add week** fill rows with your default times and work days. To insert between two rows, hover the line between them and click the small **+**. Add day offers the first free date in that gap (or a second shift if there is none), and Add week fills the free work days that follow.
- **Filters** (All · Unpaid · Needs attention) and week subtotals sit on their own row under the table buttons.
- **Expand** the table: **Large view** hides the summary cards and clock (Ctrl+Shift+L), and **Full screen** also hides the sidebar and fills the screen (Ctrl+Shift+F). A compact summary line stays visible, and Esc goes back.
- **Record payment** adds a payment row for a lump sum over a date range, e.g. "Paid Rs 460 for 01 Sep – 07 Sep 2026". It's matched to the oldest unpaid days in that range, and those days get a teal tick.
- **Pay groups** wrap a stretch of days (a few days, 10 days, a week and a half) with the payments made for them, e.g. 08 Sep – 17 Sep paid in two instalments. The group shows its days, then its payment rows, then a total row: total hours, amount, paid and pending balance, written out as "Paid $300 + $300 = $600 · $94 Pending balance". Payments whose covered dates fall inside the group join it automatically; tick or untick others in the group dialog. Click the arrow to fold a group down to its totals. Create one with the **Pay group** button or the ⋯ menu on a day or payment. Grouping never changes any balance.
- **Separator rows** for comments between weeks, in four colours.
- **Brought forward / Carried forward** rows on every period. Next week's brought-forward is always this week's carried-forward.
- **Drag rows** by the ⋮⋮ handle, use the ⋯ menu (move, duplicate, insert, delete), or **Sort** by date. Totals never depend on row order.
- **Week / 2 weeks / Month / All / Custom** periods, with optional weekly subtotals.
- **HR overview**: every employee's days, leave, hours, amount, paid and outstanding (this period and all-time), for one workspace or **all workspaces** with a per-workspace breakdown for each person, plus a "Needs attention" list (missing check-outs, invalid rows, days unpaid for over two weeks).
- **Currency** from a preset list or custom code and symbol, with decimal places, number format and symbol position.
- **Export**: CSV of a period, an HR summary CSV, PDF, and backup files.
- **Backup & sync** (File → Backup & Sync, or the backup status in the sidebar): automatic backups to **Google Drive** (sign in with Google), to a **folder** on this computer or a synced cloud folder (OneDrive, Dropbox, iCloud Drive, Google Drive for desktop, USB drive), and daily copies in the app data folder. Optional AES-256 passphrase encryption. Restore any backup from a list, or from a file; a safety copy is taken before every restore.
- **Undo/redo** for every change (Ctrl+Z / Ctrl+Shift+Z).
- Light and dark themes.

## Calculations

| Figure | Formula |
|---|---|
| Working hours | Check-out − Check-in − Rest break (overnight shifts wrap past midnight) |
| Amount | Working hours × Hourly rate, rounded per row |
| Day balance | Amount − Paid on the day − Share of payment rows |
| Running balance | Brought forward + Σ(Amount − Paid on the day) − Σ(Payment rows) |
| Carried forward | Brought forward + Earned this period − Paid this period |
| Pay group paid | Paid on the day (days in the group) + Σ(Payments in the group) |
| Pay group pending | Total amount of the group's days − Pay group paid |

Click any calculated figure in the table to see how it was worked out.

Every figure is recalculated from the row data on each change. No formula refers to a cell position, so adding, moving, sorting or deleting rows can't break anything. Each day keeps the rate it was logged at, so a rate change doesn't silently re-price history. When you edit a rate you choose whether it applies to new days only, to unpaid days as well, or to all days.

**Verify** (the self-review checkpoint) recalculates everything a second, independent way. It confirms hours, amounts, the ledger identity, carry-forward between periods, payment matching and table structure, and it flags incomplete or unusual rows.

## Data

Data saves automatically to `timeledger-data.json` in the app's data folder (File → Open Data Folder). Files from earlier versions, and old backups, are upgraded on load: everything moves into a "Main workspace" and each employee keeps their rate and opening balance there. Writes are atomic. One backup per day is kept for 1 week in `backups/`. If the data file is ever damaged, the newest backup loads automatically.

## Backups

Three automatic rules, each with its own checkbox in Backup & sync:

- **Back up after every change**: waits 30 seconds to 30 minutes after the last edit, so a burst of edits makes one backup.
- **Back up before closing the app**: only if something changed; closing waits at most 15 seconds.
- **Scheduled backup**: every day at a time you pick, or every 1–12 hours. If the computer was off at that time, it runs the next time TimeLedger opens.

 **One week** of backups is kept in every place (Google Drive, the folder, this computer); older ones are deleted automatically, and the newest one is always kept. Each backup is one file in the portable **TimeLedger backup format**, documented in [docs/BACKUP_FORMAT.md](docs/BACKUP_FORMAT.md), so the same file can be restored on any computer and by the planned mobile and web apps. Device-specific settings (folder path, Google sign-in) are kept in `backup-config.json` in the app data folder, never inside a backup. Secrets are protected with the operating system keychain.

### Google Drive backup (one-time setup for whoever builds the app)

Google sign-in needs an OAuth client that belongs to you, the app publisher:

1. In [Google Cloud Console](https://console.cloud.google.com/) create a project, enable the **Google Drive API**, and set up the OAuth consent screen. Add the scope `https://www.googleapis.com/auth/drive.file`. It only lets the app see files it creates, and it does not need Google verification.
2. Create credentials → **OAuth client ID** → application type **Desktop app**, and download the JSON.
3. Save it as `src/main/google-oauth.json` (see `google-oauth.example.json`; this file is git-ignored), or set `TIMELEDGER_GOOGLE_CLIENT_ID` and `TIMELEDGER_GOOGLE_CLIENT_SECRET`. A copy in the app data folder also works without rebuilding.

Sign-in opens the system browser (loopback redirect with PKCE). Backups go to a **TimeLedger Backups** folder in the user's Drive. Future mobile and web apps should use OAuth clients from the **same** Google Cloud project so they can see those files.

## Project layout

```
src/main/main.js        Electron main process: window, menus, file I/O, PDF
src/main/preload.js     Secure bridge (contextIsolation, sandboxed)
src/main/backup-core.js Backup format, encryption, retention, Google Drive + OAuth helpers (pure, tested)
src/main/backup-service.js Backup destinations, schedule, Google sign-in, IPC
src/renderer/calc.js    Calculation engine: pure functions, shared with tests
src/renderer/importer.js Spreadsheet / CSV attendance import: pure functions, shared with tests
src/renderer/app.js     UI
src/renderer/styles.css Design tokens, light/dark themes, print styles
tests/calc.test.js      Unit + randomized property tests (node --test)
tests/importer.test.js  Import parsing tests
tests/backup.test.js    Backup format, encryption, retention, Drive client (fake API)
tests/electron-backup.js Real-app backup check: folder, encryption, list, restore
docs/BACKUP_FORMAT.md   Backup file spec for desktop, mobile and web
tests/electron-smoke.js Boots the real app and checks save/load
```
