const { clipboard, ipcMain } = require('electron')
const { getUrl, deleteData } = require('./getData')

ipcMain.handle('COPY_URL', async () => {
  const url = await getUrl()
  if (url) {
    clipboard.writeText(url)
    return true
  }
  return false
})

ipcMain.handle('DELETE_DATA', async (event, uid, action) => {
  await deleteData(uid, action)
})