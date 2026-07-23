# ຕາຕະລາງລົງທະບຽນ (Editable Sheet Table → Google Sheet)

A React (Vite) app that shows your Google Sheet as a live, editable spreadsheet-style table —
**No. | Name | Number | Size | Paid** — right in the browser. You can add rows, edit any cell
inline (changes autosave on blur), replace/upload payment-proof images, and delete rows, all
synced directly to the sheet.

Target sheet: https://docs.google.com/spreadsheets/d/1WxHgpLQr4jFqnek5m4PL5XkIFhjOvT0aHCd4Hl2Ah84/edit

## How it works

```
React table (this repo)  --GET (list) / POST (add, update, delete)-->  Google Apps Script Web App
                                                                             │
                                                                             ├── saves images to Google Drive
                                                                             └── reads/writes rows in the Sheet
```

There is no separate server to host — Google Apps Script *is* the backend, and it's free.

- Editing a text cell or the size dropdown saves automatically when you leave the field.
- Choosing a new image immediately uploads it and updates that row's link.
- "+ ເພີ່ມແຖວ" adds a new blank row; it's created in the sheet once you type a name.
- "ລຶບ" deletes the row from the sheet (asks for confirmation first).

## 1. Set up the Google Apps Script backend

1. Open your spreadsheet: https://docs.google.com/spreadsheets/d/1WxHgpLQr4jFqnek5m4PL5XkIFhjOvT0aHCd4Hl2Ah84/edit
2. The script expects the header row `No. | Name | Number | Size | Paid` to be on **row 3**, with
   data starting on **row 4** — matching this sheet's layout, which has two title rows above it
   (`List Of Member`, `Task: Make New Football Kits`). If your sheet's real header row is on a
   different row number, update `FIRST_DATA_ROW` at the top of `Code.gs` accordingly (it should
   be set to *header row number + 1*).
   - **No.** is auto-filled by the app (a running 1, 2, 3... sequence) — you don't need to fill
     it in yourself.
   - **Paid** stores the payment-proof image link.
3. Note the **tab name** at the bottom of the sheet (e.g. `Sheet1`). You'll need it in step 5.
4. Go to **Extensions → Apps Script**. Delete any starter code and paste in the contents of
   [`apps-script/Code.gs`](apps-script/Code.gs) from this repo.
5. At the top of the script, set `SHEET_NAME` to match your actual tab name from step 3.
6. Click **Deploy → New deployment**.
   - Click the gear icon next to "Select type" and choose **Web app**.
   - Execute as: **Me**
   - Who has access: **Anyone**
   - Click **Deploy**, and authorize the script when prompted (it needs access to Sheets and
     Drive).
7. Copy the **Web app URL** you're given (looks like
   `https://script.google.com/macros/s/AKfycb.../exec`). You'll need it in the next step.

> If you later edit `Code.gs`, use **Deploy → Manage deployments → Edit (pencil icon) → New
> version** to publish the changes — just saving the script is not enough.

## 2. Run the React app locally

```bash
npm install
cp .env.example .env
```

Edit `.env` and paste your Web app URL from step 1.7:

```
VITE_APPS_SCRIPT_URL=https://script.google.com/macros/s/XXXXXXXXXXXXXXXX/exec
```

Then start the dev server:

```bash
npm run dev
```

Open the printed local URL — you should see your sheet's existing rows loaded into the table.
Try editing a cell or adding a row; changes should appear in the actual Google Sheet within a
second or two.

## 3. Deploy to GitHub Pages

1. Create a new GitHub repo and push this project to it:

   ```bash
   git init
   git add .
   git commit -m "Registration form app"
   git branch -M main
   git remote add origin https://github.com/<your-username>/<your-repo>.git
   git push -u origin main
   ```

2. Make sure `.env` exists locally with your `VITE_APPS_SCRIPT_URL` (it's gitignored, so it
   won't be committed — Vite bakes the value into the build when you run `deploy`).

3. Build and publish the `dist/` folder to the `gh-pages` branch:

   ```bash
   npm run deploy
   ```

4. In your GitHub repo, go to **Settings → Pages**, and set **Source** to the `gh-pages` branch
   (root). Your app will be live at `https://<your-username>.github.io/<your-repo>/`.

Re-run `npm run deploy` any time you want to publish new changes.

## Notes

- Images are stored in a Google Drive folder named **"ຫຼັກຖານການໂອນ - Uploads"** (created
  automatically on first upload) and shared as "anyone with the link can view"; the sheet stores
  a link to the file, not the raw image. Replacing an image uploads a new file rather than
  overwriting the old one (the old file is left in Drive, unused).
- Apps Script Web Apps accept fairly large POST bodies, but keep payment-screenshot images
  reasonably sized (a few MB) for fast uploads.
- Deleting a row removes it from the sheet only — the image file already uploaded to Drive is
  not deleted.
- The **No.** column is rewritten as a plain 1, 2, 3... sequence any time a row is added or
  deleted through the app, so it stays in sync with row position. If you add/remove rows
  directly in Google Sheets (outside the app), **No.** won't auto-update until the next add or
  delete happens through the app.
- If requests fail with a CORS-looking error, double check you deployed with **Execute as: Me**
  and **Who has access: Anyone**, and that you're using the `/exec` URL (not `/dev`).
- Editing the spreadsheet directly in Google Sheets at the same time as someone is using the app
  is fine for casual use, but there's no real-time sync — refresh the page to see sheet-side
  changes made outside the app.
