const { app, ipcMain, dialog } = require('electron')
const fs = require('fs-extra')
const path = require('path')
const getData = require('./getData').getData
const { name, version } = require('../../package.json')
const i18n = require('./i18n')
const { exit } = require('process')

const getTimeString = () => {
  return new Date().toLocaleString('sv').replace(/[- :]/g, '').slice(0, -2)
}

const formatDate = (date) => {
  let y = date.getFullYear()
  let m = `${date.getMonth()+1}`.padStart(2, '0')
  let d = `${date.getDate()}`.padStart(2, '0')
  return `${y}-${m}-${d} ${date.toLocaleString('zh-cn', { hour12: false }).slice(-8)}`
}

const start = async () => {
  const { dataMap, current } = await getData()
  const data = dataMap.get(current)
  if (!data.result.size) {
    throw new Error('数据为空')
  }
  const result = {
    info: {
      export_timestamp: Math.ceil(Date.now() / 1000),
      export_app: `${name}`,
      export_app_version: `v${version}`,
      version: "v4.0"
    },
    hkrpg: [
      {
        uid: current,
        timezone: data.region_time_zone,
        lang: data.lang,
        list: []
      }
    ]
  }
  const listTemp = []
  for (let [type, arr] of data.result) {
    arr.forEach(log => {
      listTemp.push({
        gacha_id: log.gacha_id,
        gacha_type: log.gacha_type,
        item_id: log.item_id,
        count: log.count,
        time: log.time,
        name: log.name,
        item_type: log.item_type,
        rank_type: log.rank_type,
        id: log.id
      })
    })
  }
  listTemp.sort((a, b) => Number(BigInt(a.id) - BigInt(b.id)))
  listTemp.forEach(item => {
    result.nap[0].list.push({
      ...item
    })
  })
  const filePath = dialog.showSaveDialogSync({
    defaultPath: path.join(app.getPath('downloads'), `UIGF_${data.uid}_${getTimeString()}`),
    filters: [
      { name: i18n.uigf.fileType, extensions: ['json'] }
    ]
  })
  if (filePath) {
    await fs.ensureFile(filePath)
    await fs.writeFile(filePath, JSON.stringify(result))
  }
}

ipcMain.handle('EXPORT_UIGF_JSON', async () => {
  await start()
})
