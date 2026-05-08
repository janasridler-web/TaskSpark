/**
 * TaskSpark - External Task Submissions handler.
 *
 * This script is bound to a TaskSpark workspace's Google Sheet. When deployed
 * as a web app (Execute as: Me, Access: Anyone) it serves a public submission
 * page and writes submitted tasks into the bound sheet's Tasks tab with
 * status = 'inbox' so the owner can triage them in TaskSpark.
 *
 * The TaskSpark setup wizard replaces __WORKSPACE_NAME__ with the workspace
 * name before the user pastes this code into Apps Script.
 */

var VERSION = 1;
var WORKSPACE_NAME = '__WORKSPACE_NAME__';
var TASKS_SHEET_NAME = 'Tasks';

var HOURLY_LIMIT = 20;
var DAILY_LIMIT = 200;
var DEDUPE_SECONDS = 5;

var MAX_TITLE = 200;
var MAX_DESC = 2000;
var MAX_NAME = 100;

function doGet(e) {
  var params = (e && e.parameter) || {};

  if (params.ping === '1') {
    return _json({
      ok: true,
      marker: 'taskspark-submission-handler',
      version: VERSION,
      workspace: WORKSPACE_NAME
    });
  }

  var tmpl = HtmlService.createTemplateFromFile('Submit');
  tmpl.workspaceName = WORKSPACE_NAME;
  tmpl.fromName = _clean(params.from, MAX_NAME);
  return tmpl.evaluate()
    .setTitle('Submit a task to ' + WORKSPACE_NAME)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * Called by the served submission page via google.script.run.
 * Returns { ok: boolean, error?: string, dedup?: boolean }.
 */
function submitTask(payload) {
  try {
    var p = payload || {};
    var title = _clean(p.title, MAX_TITLE);
    var desc = _clean(p.desc, MAX_DESC);
    var submittedBy = _clean(p.from, MAX_NAME);
    var due = _cleanDate(p.due);

    if (!title) {
      return { ok: false, error: 'Task title is required.' };
    }

    var cache = CacheService.getScriptCache();

    if (!_checkRateLimit(cache)) {
      return { ok: false, error: 'Too many submissions right now. Please try again later.' };
    }

    var dedupeKey = 'tsdedupe:' + _hash(title + '|' + desc + '|' + submittedBy);
    if (cache.get(dedupeKey)) {
      return { ok: true, dedup: true };
    }
    cache.put(dedupeKey, '1', DEDUPE_SECONDS);

    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TASKS_SHEET_NAME);
    if (!sheet) {
      return { ok: false, error: 'This workspace is missing its Tasks tab.' };
    }

    var headers = sheet.getRange(1, 1, 1, Math.max(1, sheet.getLastColumn())).getValues()[0];
    var idx = {};
    for (var i = 0; i < headers.length; i++) {
      idx[String(headers[i])] = i;
    }

    var required = ['title', 'status', 'source', 'submittedBy', 'submittedAt'];
    for (var r = 0; r < required.length; r++) {
      if (!(required[r] in idx)) {
        return {
          ok: false,
          error: 'This sheet is missing the "' + required[r] + '" column. Ask the workspace owner to enable external submissions in TaskSpark.'
        };
      }
    }

    var row = new Array(headers.length);
    for (var k = 0; k < row.length; k++) row[k] = '';
    var now = new Date().toISOString();

    if ('id' in idx) row[idx['id']] = Utilities.getUuid();
    row[idx['title']] = title;
    if ('desc' in idx) row[idx['desc']] = desc;
    row[idx['status']] = 'inbox';
    row[idx['source']] = 'external';
    row[idx['submittedBy']] = submittedBy;
    row[idx['submittedAt']] = now;
    if ('createdAt' in idx) row[idx['createdAt']] = now;
    if ('completed' in idx) row[idx['completed']] = false;
    if ('archived' in idx) row[idx['archived']] = false;
    if (due && 'due' in idx) row[idx['due']] = due;

    sheet.appendRow(row);

    return { ok: true };
  } catch (err) {
    return { ok: false, error: 'Server error: ' + (err && err.message ? err.message : 'unknown') };
  }
}

function _clean(value, maxLen) {
  var raw = String(value == null ? '' : value);
  var out = '';
  for (var i = 0; i < raw.length && out.length < maxLen; i++) {
    var code = raw.charCodeAt(i);
    var allowed = code === 9 || code === 10 || code === 13 || (code >= 32 && code !== 127);
    if (allowed) out += raw.charAt(i);
  }
  return out.replace(/<[^>]*>/g, '').trim();
}

function _cleanDate(value) {
  var s = String(value == null ? '' : value).trim();
  return /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(s) ? s : '';
}

function _checkRateLimit(cache) {
  var now = new Date().toISOString();
  var hourKey = 'tsrate:h:' + now.substring(0, 13);
  var dayKey = 'tsrate:d:' + now.substring(0, 10);

  var hourCount = parseInt(cache.get(hourKey) || '0', 10);
  var dayCount = parseInt(cache.get(dayKey) || '0', 10);

  if (hourCount >= HOURLY_LIMIT || dayCount >= DAILY_LIMIT) {
    return false;
  }

  cache.put(hourKey, String(hourCount + 1), 3600);
  cache.put(dayKey, String(dayCount + 1), 21600);
  return true;
}

function _hash(s) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s);
  var out = '';
  for (var i = 0; i < bytes.length; i++) {
    var b = bytes[i] < 0 ? bytes[i] + 256 : bytes[i];
    var h = b.toString(16);
    out += h.length === 1 ? '0' + h : h;
  }
  return out;
}

function _json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
