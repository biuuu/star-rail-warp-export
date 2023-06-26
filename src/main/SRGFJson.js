const { app, ipcMain, dialog } = require('electron')
const fs = require('fs-extra')
const path = require('path')
const getData = require('./getData').getData
const { version } = require('../../package.json')
const i18n = require('./i18n')

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
      uid: data.uid,
      lang: data.lang,
      export_time: formatDate(new Date()),
      export_timestamp: Math.ceil(Date.now()/1000),
      export_app: 'star-rail-warp-export',
      export_app_version: `v${version}`,
      region_time_zone: data.region_time_zone,
      srgf_version: 'v1.0'
    },
    list: []
  }
  const listTemp = []
  for (let [type, arr] of data.result) {
    arr.forEach(log => {
      listTemp.push({
        gacha_id:log.gacha_id,
        gacha_type: log.gacha_type,
        item_id:log.item_id,
        count:"1",
        time:log.time,
        name:log.name,
        item_type:log.item_type,
        rank_type:log.rank_type,
        id:log.id
      })
    })
  }
  listTemp.sort((a, b) => a.id - b.id)
  listTemp.forEach(item => {
    result.list.push({
      ...item
    })
  })
  const filePath = dialog.showSaveDialogSync({
    defaultPath: path.join(app.getPath('downloads'), `SRGF_${data.uid}_${getTimeString()}`),
    filters: [
      { name: i18n.srgf.fileType, extensions: ['json'] }
    ]
  })
  if (filePath) {
    await fs.ensureFile(filePath)
    await fs.writeFile(filePath, JSON.stringify(result))
  }
}

ipcMain.handle('EXPORT_SRGF_JSON', async () => {
  await start()
})
