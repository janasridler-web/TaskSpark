# TaskSpark V2

**Focus · Flow · Finish** — A desktop task manager built for ADHD and AuDHD minds.

## What's new in V2
- **One-click sign in** — just click "Sign in with Google", no setup required
- **Auto-creates your spreadsheet** — TaskSpark creates a Google Sheet in your Drive automatically
- **Auto-updates** — new versions install automatically in the background
- All V1 features carried over

## Setup (Development)

### Requirements
- Node.js LTS — https://nodejs.org
- A verified Google OAuth app (see below)

### Install & Run
```
npm install
npm start
```

### Before you can build
You need to add your OAuth credentials to `src/main.js`:
```js
const APP_CLIENT_ID     = 'YOUR_CLIENT_ID_HERE';
const APP_CLIENT_SECRET = 'YOUR_CLIENT_SECRET_HERE';
```

These come from your Google Cloud Console OAuth consent screen.
Once your OAuth app is verified by Google, any user can sign in without being added as a test user.

### Build installer
```
npm run build
```

### Publishing an update
1. Update version in `package.json`
2. Run `npm run build`
3. Create a new release on GitHub at https://github.com/janasridler-web/taskspark
4. Upload the `dist/TaskSpark Setup x.x.x.exe` and `dist/latest.yml` files
5. Users will be notified automatically on next launch

## Keyboard shortcuts
| Shortcut   | Action           |
|------------|------------------|
| Ctrl+Space | Quick add task   |
| Ctrl+Z     | Undo last action |
| N          | New task         |
| Escape     | Close modal      |
