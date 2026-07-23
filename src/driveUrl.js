// Turn a Google Drive "view" URL (as stored by Code.gs / file.getUrl()) into
// a direct thumbnail image URL usable in an <img src>.
export function driveThumbnailUrl(viewUrl) {
  if (!viewUrl) return ''
  const match = viewUrl.match(/\/d\/([^/]+)/)
  if (!match) return ''
  return `https://drive.google.com/thumbnail?id=${match[1]}&sz=w200`
}
