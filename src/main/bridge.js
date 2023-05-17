const { clipboard, ipcMain } = require('electron')
const { getUrl } = require('./getData')

ipcMain.handle('COPY_URL', async () => {
  const url = await getUrl()
  if (url) {
    clipboard.writeText(url)
    return true
  }
  return false
})