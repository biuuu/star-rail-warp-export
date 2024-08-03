const { app, ipcMain, dialog } = require('electron')
const fs = require('fs-extra')
const path = require('path')
const { getData, saveData, changeCurrent, convertTimeZone } = require('./getData')
const config = require('./config')
const { name, version } = require('../../package.json')
const i18n = require('./i18n')
const { mergeData } =  require('./utils/mergeData')
const { sendMsg } = require('./utils')

const getTimeString = () => {
  return new Date().toLocaleString('sv').replace(/[- :]/g, '').slice(0, -2)
}

const formatDate = (date) => {
  let y = date.getFullYear()
  let m = `${date.getMonth()+1}`.padStart(2, '0')
  let d = `${date.getDate()}`.padStart(2, '0')
  return `${y}-${m}-${d} ${date.toLocaleString('zh-cn', { hour12: false }).slice(-8)}`
}

const exportUIGF = async (uids) => {
  const { dataMap, current } = await getData()
  const result = {
    info: {
      export_timestamp: Math.ceil(Date.now() / 1000),
      export_app: `${name}`,
      export_app_version: `v${version}`,
      version: "v4.0"
    },
    hkrpg: []
  }
  let fulldata = []
  uids.forEach(uid => {
    fulldata.push(dataMap.get(uid))
  })
  if (!fulldata.length) {
    throw new Error('数据为空')
  }
  fulldata.forEach(data => {
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
    let dataTemp = {
      uid: data.uid,
      timezone: data.region_time_zone,
      lang: data.lang,
      list: []
    }
    listTemp.forEach(item => {
      dataTemp.list.push({
        ...item
      })
    })
    result.hkrpg.push(dataTemp)
  })
  const filePath = dialog.showSaveDialogSync({
    defaultPath: path.join(app.getPath('downloads'), fulldata.length > 1 ? `UIGF_${getTimeString()}` : `UIGF_${fulldata[0].uid}_${getTimeString()}`),
    filters: [
      { name: i18n.uigf.fileType, extensions: ['json'] }
    ]
  })
  if (filePath) {
    await fs.ensureFile(filePath)
    await fs.writeFile(filePath, JSON.stringify(result))
  }
}

const importUIGF = async () => {
  const filepath = await dialog.showOpenDialogSync({
    properties: ['openFile'],
    filters: [
      { name: i18n.uigf.fileType, extensions: ['json'] }
    ]
  })
  if (!filepath) return
  const { dataMap, current } = await getData()
  try {
    const jsonData = fs.readJsonSync(filepath[0])
    if('info' in jsonData && 'version' in jsonData.info) {
      if (jsonData.info.version !== 'v4.0') {
        sendMsg('不支持此版本UIGF')
        console.error('不支持此版本UIGF')
        return
      }
    } else {
      sendMsg('UIGF格式错误')
      console.error('UIGF格式错误')
      return
    }
    jsonData.hkrpg.forEach(uidData => {
      const resultTemp = []
      const isNew = !Boolean(dataMap.has(uidData.uid))
      let region_time_zone
      if (!isNew) region_time_zone = dataMap.get(uidData.uid).region_time_zone
      else region_time_zone = uidData.timezone

      uidData.list.forEach(recordEntry => {
        resultTemp.push({
          gacha_id: recordEntry.gacha_id,
          gacha_type: recordEntry.gacha_type,
          item_id: recordEntry.item_id,
          count: recordEntry.count,
          time: convertTimeZone(recordEntry.time, uidData.timezone, region_time_zone),
          name: recordEntry.name,
          item_type: recordEntry.item_type,
          rank_type: recordEntry.rank_type,
          id: recordEntry.id
        })
      })
      const resultTempGrouped = resultTemp.reduce((acc, curr) => {
        if (!acc[curr.gacha_type]) {
          acc[curr.gacha_type] = []
        }
        acc[curr.gacha_type].push(curr)
        return acc;
      }, {})
      const resultTempMap = new Map(Object.entries(resultTempGrouped))
      const resultMap = { result: resultTempMap, uid: uidData.uid}
      let data
      const mergedData = mergeData(dataMap.get(uidData.uid), resultMap)
      if (isNew) {
        data = { result: mergedData, time: Date.now(), uid: uidData.uid, lang: uidData.lang, region_time_zone: uidData.timezone, deleted: false }
      } else {
        data = { result: mergedData, time: Date.now(), uid: dataMap.get(uidData.uid).uid, lang: dataMap.get(uidData.uid).lang, region_time_zone: dataMap.get(uidData.uid).region_time_zone, deleted: dataMap.get(uidData.uid).deleted }
      }
      
      saveData(data, '')
      changeCurrent(uidData.uid)
      dataMap.set(uidData.uid, data)
    })
    return {
      dataMap,
      current: config.current
    }
  } catch (error) {
    sendMsg(error, 'ERROR')
    console.error(error)
  }
}

ipcMain.handle('EXPORT_UIGF_JSON', async (event, uids) => {
  await exportUIGF(uids)
})

ipcMain.handle('IMPORT_UIGF_JSON', async () => {
  return await importUIGF()
})