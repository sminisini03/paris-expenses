# Paris Expenses

A private expense tracker for an exchange semester (Paris, 7 Oct 2026 – 31 Jan 2027).
It runs as an installable web app on iPhone and laptop, works offline, and keeps
**all data on the device**. No account, no server, no analytics.

**Live app:** https://sminisini03.github.io/paris-expenses/

- Quick add in three taps, plus Revolut CSV import with duplicate detection
- Splits with your partner: *Mine / 50-50 / Custom / Theirs*, a running balance and **Settle up**
- Overview: this month vs budget, a daily allowance, projection to the end of the exchange
- Charts per month and per category; tap any bar to see its transactions
- Costs that cover several months (rent) are spread by day in charts and budgets
- Excel export in the original cost-sheet layout, and JSON backup / restore
- Categories, rules, people, period, number format, theme and accent are all editable

---

## 1 · Install on iPhone

1. Open **Safari** (it must be Safari) and go to the live app link above.
2. Tap **Share** → **Add to Home Screen** → **Add**.
3. From now on open **Expenses** from the Home Screen.

> **Important:** the Home Screen app and Safari keep **separate data** on iOS, and so does
> every browser on your laptop. Pick the Home Screen app as your main copy. To move data
> between devices, use **Back up now** on one and **Restore** on the other (see §4).

First-time setup (≈ 2 minutes):

1. **Settings → People** → rename *Partner* to your partner's name (and *Me* to yours, if you like).
2. **Settings → Categories** → set a **monthly budget** on the categories you want to track.
3. **Settings → Restore or import** → pick `private/starter-plan.json` (AirDrop it to the
   phone first) to load the rent instalments, flights and bike subscription.
4. **Settings → Backup → Back up now** → *Save to Files*.

## 2 · Weekly routine: import your Revolut statement

1. In the **Revolut app**: open your EUR account → **⋯ / Statement** → choose the
   **spreadsheet (CSV / Excel)** format, not PDF → period: *since your last import*
   (overlapping is fine) → **Save to Files**.
2. In **Expenses**: **Transactions → Import CSV** → pick the file.
3. Check the preview. It shows what will happen to every row:
   - **New expenses**, and **Matched**: rows that confirm something you already entered,
     e.g. the Airbnb rent, so nothing is counted twice.
   - **Already imported**: safe to re-import the same file.
   - **Not spending, skipped**, with the reason for each row: top-ups, savings and pockets,
     transfers to yourself, pending, declined, before the exchange…
   - The first time, enter **your name as Revolut shows it on transfers**, so transfers
     to your own accounts are skipped.
4. Tap **Import**, then **Review** to categorise what no rule matched. In the inbox: tap a
   category and it moves to the next one. Tick *Always categorise like this* to create a rule.
5. **Back up** (the app reminds you after 7 days).

What the importer does with each row: it keeps completed card payments and transfers to
other people, adds Revolut's fee to the cost, uses the EUR amount Revolut charged for
foreign purchases, nets refunds against the original purchase (same category and split),
and recognises duplicates by date + time + amount + description.

## 3 · Everyday use

- **Quick add:** tap **+** → amount → category → **Save**. *More details* has date, who
  paid, the split, refund and spreading, and a note.
- **Split examples:** groceries for both → *50/50*. your partner paid for dinner → *Paid by: (partner), 50/50*.
  Something you bought for her → *Theirs*.
- **Settle up:** Overview → the balance card → **Settle up**. A settlement is not spending.
- **Spread a cost:** *More details → Spread the cost over a period* (rent, a 4-month pass…).
- **Bulk recategorise:** Transactions → **Select** → tick → **Set category**.
- **My share / Total:** the switch on Overview and Charts. Budgets always compare against your share.

## 4 · Backup, restore, moving between devices

- **Settings → Back up now** saves one `.json` file with everything (transactions,
  categories, rules, people, settings). On iPhone choose *Save to Files* (or iCloud Drive).
- **Settings → Restore or import → Choose file**:
  - *Add missing*: keeps what's on this device and adds what isn't (never duplicates).
  - *Replace all*: makes this device an exact copy of the backup.
- **Settings → Export .xlsx**: a *Summary* sheet (Overall + each month; Total / partner / you /
  budget per category) and a *Transactions* sheet with every record.

iOS can delete a web app's data when storage runs low. Back up weekly; the Overview banner
reminds you when the last backup is more than 7 days old.

## 5 · Add a new category (≈ 10 seconds)

**Settings → Categories → Add** → type the name → **Enter**.
Optionally pick an icon (emoji keyboard), a colour, *Fixed/Variable* and a monthly budget.
It appears immediately in quick add, filters, budgets and every chart.

- **Reorder** with ↑ / ↓ (this is also the stacking order in charts).
- **Archive** hides a category from pickers but keeps it on past expenses.
- **Delete** a category that has expenses: you're asked to move them to another category
  (or archive instead). Nothing is deleted silently.
- **Rules** (*Settings → Category rules*): keyword → category, optionally with a default split.
  Matching ignores case and accents and works on whole words, and the longest keyword wins
  (*UBER EATS* beats *UBER*).

---

## 6 · Deploying to GitHub Pages

The app is plain static files (no build step), so GitHub Pages serves it as-is.

**First time** (already done for this repo):
```bash
gh repo create <user>/paris-expenses --public --source . --push
gh api -X POST repos/<user>/paris-expenses/pages -f "source[branch]=main" -f "source[path]=/"
```
The site appears at `https://<user>.github.io/paris-expenses/` after about a minute.

**Releasing an update:**
```bash
node --test                       # all tests must pass
node tools/release.mjs 1.0.1      # bumps sw.js, js/app.js and the CSS ?v= in index.html
git commit -am "Release 1.0.1" && git push
```
Bumping the version is what makes phones update: the service worker caches the new files
and the app shows **"A new version is ready → Reload"**. If you forget, installed apps keep
the old version. When adding a new file, also add it to the `SHELL` list in `sw.js`.

## 7 · Development

```bash
python3 -m http.server 8080       # then open http://localhost:8080
node --test                       # unit tests (no install needed, Node 22+)
```
On `localhost` the service worker fetches from the network first, so edits show on reload.
iPhone testing needs HTTPS (service workers), i.e. the GitHub Pages URL.

```
index.html  manifest.json  sw.js  favicon.ico
css/tokens.css        every colour, size, radius, spacing value (light-dark() per token)
css/app.css           components; only references tokens
js/app.js             boot, hash routing (#/transactions?cat=…&month=…), navigation
js/db.js              IndexedDB wrapper (all data lives here)
js/import.js          Revolut CSV pipeline (pure functions)
js/rules.js           keyword → category matching
js/split.js           splits: iPaid / myShare per transaction
js/balance.js         balances and settlements
js/budget.js          spreading by day, budgets, projection, chart data
js/charts.js          Chart.js theme from tokens
js/export.js          JSON backup/restore, Excel export
js/settings.js        settings + theme/accent (accent text kept ≥ 4.5:1 for any accent)
js/seed.js            default categories, rules, people (first run only)
js/views/*.js         screens and dialogs
vendor/               Inter font, Chart.js 4.5.1, SheetJS 0.20.3 (mini). Loaded locally, cached offline
tests/                node:test suites + a FAKE Revolut CSV fixture
tools/release.mjs     version bump
private/              git-ignored: personal files (starter plan, sample export)
```

**Design system.** Change the look in `css/tokens.css` only. Accent colour and theme are also
in Settings. The 10 default category colours were validated for colour-blind separation and
≥ 3:1 contrast in both themes. Red and green are reserved for over/under budget.

**Data model.** Amounts are integer cents. Each transaction stores `amount` (total), `myShare`
and `iPaid`; what the partner owes = `iPaid − myShare`. `spread {from,to}` spreads the cost by day.
`source`, `externalId` and `fingerprint` exist so a future bank sync can de-duplicate against
imported and manual entries.

## 8 · Privacy

- No analytics, no third-party requests at runtime: fonts and libraries are served from this repo.
- The repo contains **code only**. `.gitignore` blocks `*.csv` (except the fake test fixture),
  `*.xlsx`, `.env`, backups and `private/`.
- Your data exists only in each device's browser storage and in the backup files you save.

## 9 · Accessibility

Checked with axe-core (WCAG 2.1 AA) on every screen and dialog, in light and dark mode and with
two accent colours: no violations. Keyboard: skip link → navigation → content, visible focus on
every control, dialogs trap focus and close with Esc, and focus returns to where it came from.
Every chart has a *Show as table* view, and every input has a label.

## 10 · Phase 2 (not built)

- **Bank sync** via Enable Banking (restricted production, own account) with a local `sync.py`.
  Secrets go in `.env`; it would output the backup JSON format and import with *Add missing*.
- **Apple Pay → Shortcuts.** Shortcuts open Safari, which has separate storage from the
  Home Screen app, so a Shortcut would append to a file in iCloud Drive for the app to import.
- **Shared view for your partner:** would need a sync backend; the model already tracks
  counterparts per transaction.
