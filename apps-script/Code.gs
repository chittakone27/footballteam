/**
 * Google Apps Script backend for the registration table.
 * Deploy this bound to your Google Sheet (Extensions > Apps Script),
 * then deploy it as a Web App. See README.md for full steps.
 *
 * doGet   -> returns all rows as JSON
 * doPost  -> { action: 'add' | 'update' | 'delete', ... } mutates the sheet
 */

// Name of the sheet/tab to read/write.
const SHEET_NAME = 'Sheet1';

// Name of the Drive folder used to store uploaded payment-proof images.
const DRIVE_FOLDER_NAME = 'ຫຼັກຖານການໂອນ - Uploads';

// Column layout (1-indexed): A=No., B=Name, C=Number, D=Size, E=Paid (image link)
const COL = { NO: 1, NAME: 2, SHIRT_NUMBER: 3, SIZE: 4, IMAGE_URL: 5 };
// Row 1 = "List Of Member", row 2 = "Task: Make New Football Kits", row 3 =
// the real header row (No. | Name | Number | Size | Paid) — data starts row 4.
const FIRST_DATA_ROW = 4;

function doGet(e) {
  try {
    const sheet = getSheet();
    const lastRow = sheet.getLastRow();
    const rows = [];

    if (lastRow >= FIRST_DATA_ROW) {
      const values = sheet
        .getRange(FIRST_DATA_ROW, 1, lastRow - FIRST_DATA_ROW + 1, 5)
        .getValues();

      values.forEach((row, i) => {
        const [no, name, shirtNumber, size, imageUrl] = row;
        // Include every row in range, even blank ones, so the app is a
        // faithful 1:1 mirror of the sheet (blank rows can be deleted from
        // the app itself if unwanted).
        rows.push({
          rowIndex: FIRST_DATA_ROW + i,
          no,
          name,
          shirtNumber,
          size,
          imageUrl,
        });
      });
    }

    return jsonResponse({ ok: true, rows });
  } catch (err) {
    return jsonResponse({ ok: false, error: err.message });
  }
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const action = data.action || 'add';

    if (action === 'add') return jsonResponse(handleAdd(data));
    if (action === 'update') return jsonResponse(handleUpdate(data));
    if (action === 'delete') return jsonResponse(handleDelete(data));

    throw new Error('Unknown action: ' + action);
  } catch (err) {
    return jsonResponse({ ok: false, error: err.message });
  }
}

function handleAdd(data) {
  const sheet = getSheet();
  const imageUrl = data.fileData
    ? saveImageToDrive(data.fileName, data.mimeType, data.fileData)
    : '';

  // No. is filled in by renumberRows() below; leave it blank for now.
  // Column order: No., Name, Number, Size, Paid.
  sheet.appendRow(['', data.name || '', data.shirtNumber || '', data.size || '', imageUrl]);
  const rowIndex = sheet.getLastRow();
  renumberRows(sheet);

  return {
    ok: true,
    row: {
      rowIndex,
      no: rowIndex - FIRST_DATA_ROW + 1,
      name: data.name || '',
      shirtNumber: data.shirtNumber || '',
      size: data.size || '',
      imageUrl,
    },
  };
}

function handleUpdate(data) {
  const rowIndex = Number(data.rowIndex);
  if (!rowIndex || rowIndex < FIRST_DATA_ROW) throw new Error('Invalid rowIndex');

  const sheet = getSheet();
  sheet.getRange(rowIndex, COL.NAME).setValue(data.name || '');
  sheet.getRange(rowIndex, COL.SHIRT_NUMBER).setValue(data.shirtNumber || '');
  sheet.getRange(rowIndex, COL.SIZE).setValue(data.size || '');

  let imageUrl = data.existingImageUrl || '';
  if (data.fileData) {
    imageUrl = saveImageToDrive(data.fileName, data.mimeType, data.fileData);
  }
  // Always write imageUrl (even blank) so removing an image actually clears the cell.
  sheet.getRange(rowIndex, COL.IMAGE_URL).setValue(imageUrl);

  return {
    ok: true,
    row: {
      rowIndex,
      no: rowIndex - FIRST_DATA_ROW + 1,
      name: data.name || '',
      shirtNumber: data.shirtNumber || '',
      size: data.size || '',
      imageUrl,
    },
  };
}

function handleDelete(data) {
  const rowIndex = Number(data.rowIndex);
  if (!rowIndex || rowIndex < FIRST_DATA_ROW) throw new Error('Invalid rowIndex');

  const sheet = getSheet();
  sheet.deleteRow(rowIndex);
  renumberRows(sheet);
  return { ok: true };
}

// Rewrites the "No." column as a plain 1, 2, 3... sequence matching row
// position, so it stays correct after rows are added/deleted via the app.
function renumberRows(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < FIRST_DATA_ROW) return;

  const count = lastRow - FIRST_DATA_ROW + 1;
  const numbers = Array.from({ length: count }, (_, i) => [i + 1]);
  sheet.getRange(FIRST_DATA_ROW, COL.NO, count, 1).setValues(numbers);
}

function saveImageToDrive(fileName, mimeType, base64Data) {
  const folder = getOrCreateFolder(DRIVE_FOLDER_NAME);
  const blob = Utilities.newBlob(
    Utilities.base64Decode(base64Data),
    mimeType,
    fileName || 'payment-proof'
  );
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return file.getUrl();
}

function getOrCreateFolder(name) {
  const folders = DriveApp.getFoldersByName(name);
  return folders.hasNext() ? folders.next() : DriveApp.createFolder(name);
}

function getSheet() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error('Sheet not found: ' + SHEET_NAME);
  return sheet;
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}
