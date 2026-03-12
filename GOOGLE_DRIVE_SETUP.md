# Google Drive image storage (OAuth)

Cash drop receipt images can be stored in Google Drive with folder structure **Year → MonthName** (no day subfolder), and file names like **1_Register1_02112026143022.png** (`{shift}_{workstation}_mmddyyyyhhmmss.ext`).

## Enable Drive storage with OAuth

1. **Google Cloud Console**
   - Create or open a project at [Google Cloud Console](https://console.cloud.google.com).
   - Enable the **Google Drive API** (APIs & Services > Library > search “Google Drive API” > Enable).
   - Go to **APIs & Services > Credentials** and create an **OAuth 2.0 Client ID** (application type: “Desktop app” or “Web application”).
   - If “Web application”: add an **Authorized redirect URI**, e.g. `http://localhost:3080/oauth2callback` (must match the script’s URL below).
   - Copy the **Client ID** and **Client secret**.

2. **Environment variables** (in `.env`):

   ```env
   GOOGLE_DRIVE_ENABLED=true
   GOOGLE_CLIENT_ID=your_client_id.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=your_client_secret
   ```

3. **Get a refresh token** (one-time):

   ```bash
   npm run google-drive-token
   ```

   - A URL is printed. Open it in a browser and sign in with the **Google account that will own the Drive folder** (where images will be stored).
   - After authorizing, you are redirected to localhost. The script prints something like:
     ```env
     GOOGLE_REFRESH_TOKEN=1//0abc...
     ```
   - Add that line to your `.env`. Optionally add:
     ```env
     GOOGLE_DRIVE_REDIRECT_URI=http://localhost:3080/oauth2callback
     ```
     (Use the same value you added in the OAuth client’s redirect URIs.)

4. **Optional – root folder**: To store everything under one Drive folder, create that folder in Drive, copy its ID from the URL (`drive.google.com/.../folders/FOLDER_ID`), and set:

   ```env
   GOOGLE_DRIVE_ROOT_FOLDER_ID=your_folder_id
   ```

   If not set, folders are created in the signed-in user’s Drive root.

## Folder and file layout

- **Path**: `Year/MonthName` (e.g. `2026/March`). No day subfolder.
- **File name**: `{shift}_{workstation}_mmddyyyyhhmmss.ext` (e.g. `1_Register1_02112026143022.png`). The date/time in the name is the upload moment (month, day, year, hour, minute, second).

Files are shared as “anyone with the link can view” so the app can display them.

## label_image vs label_image_url

- **`label_image`** is the only value stored in the DB: a local path or a Drive view URL.
- **`label_image_url`** is not stored; it is computed per request. For Drive, it becomes the proxy URL so `<img src>` works.

## Fallback

If Drive is disabled or upload fails, images are saved locally under `media/cash_drop_labels/` as before.
