const { app, ipcMain, dialog } = require('electron')
const fs = require('fs-extra')
const path = require('path')
const { getData, saveData, changeCurrent, convertTimeZone } = require('./getData')
const config = require('./config')
const { name, version } = require('../../package.json')
const i18n = require('./i18n')
const { mergeData } =  require('./utils/mergeData')
const { sendMsg } = require('./utils')
const idJson = require('../idJson.json')

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
      version: "v4.1"
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

function parseData(data, dataMap) {
  const resultTemp = []
  const isNew = !dataMap.has(data.uid)

  let targetLang
  if (!isNew) targetLang = dataMap.get(data.uid).lang
  else targetLang = data.lang
  if(!idJson[targetLang] && (!data.list[0].name || !data.list[0].item_type || !data.list[0].rank_type)) targetLang = config.lang

  let idTargetLangJson = idJson[targetLang]

  data.list.forEach(recordEntry => {
    resultTemp.push({
      gacha_id: recordEntry.gacha_id,
      gacha_type: recordEntry.gacha_type,
      item_id: recordEntry.item_id,
      count: recordEntry.count ?? "1",
      time: recordEntry.time,
      name: idTargetLangJson?.[recordEntry.item_id].name ?? recordEntry.name,
      item_type: idTargetLangJson?.[recordEntry.item_id].item_type ?? recordEntry.item_type,
      rank_type: recordEntry.rank_type,
      id: recordEntry.id
    })
  })
  const resultTempGrouped = resultTemp.reduce((acc, curr) => {
    if (!acc[curr.gacha_type]) {
      acc[curr.gacha_type] = []
    }
    acc[curr.gacha_type].push(curr)
    return acc
  }, {})
  const resultTempMap = new Map(Object.entries(resultTempGrouped))
  const resultMap = { result: resultTempMap, uid: data.uid}
  let temp
  const mergedData = mergeData(dataMap.get(data.uid), resultMap)
  if (isNew) {
    temp = { result: mergedData, time: Date.now(), uid: data.uid, lang: targetLang, region_time_zone: data.timezone, deleted: false }
  } else {
    temp = { result: mergedData, time: Date.now(), uid: dataMap.get(data.uid).uid, lang: targetLang, region_time_zone: dataMap.get(data.uid).region_time_zone, deleted: dataMap.get(data.uid).deleted }
  }

  saveData(temp)
  changeCurrent(data.uid)
  dataMap.set(data.uid, temp)
}

const importUIGF = async () => {
  const filepath = dialog.showOpenDialogSync({
    properties: ['openFile'],
    filters: [
      { name: i18n.uigf.fileType, extensions: ['json'] }
    ]
  })
  if (!filepath) return
  const { dataMap, current } = getData()
  try {
    const jsonData = fs.readJsonSync(filepath[0])
    if('info' in jsonData && 'version' in jsonData.info) {
      if (jsonData.info.version !== 'v4.0' && jsonData.info.version !== 'v4.1') {
        sendMsg('不支持此版本UIGF')
        console.error('不支持此版本UIGF')
        return
      }
      jsonData.hkrpg.forEach(uidData => {
        parseData(uidData, dataMap)
      })
    } else if (jsonData?.info?.srgf_version) {
      parseData({
        uid: jsonData.info.uid,
        lang: jsonData.info.lang,
        timezone: jsonData.info.region_time_zone,
        ...jsonData
      }, dataMap)
    } else {
      sendMsg('UIGF格式错误')
      console.error('UIGF格式错误')
      return
    }
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