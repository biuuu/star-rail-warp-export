const fs = require('fs-extra')
const util = require('util')
const path = require('path')
const { URL } = require('url')
const { app, ipcMain, shell } = require('electron')
const { sleep, request, sendMsg, readJSON, saveJSON, detectLocale, getCacheText, userDataPath, userPath, localIp, langMap } = require('./utils')
const config = require('./config')
const i18n = require('./i18n')
const { enableProxy, disableProxy } = require('./module/system-proxy')
const mitmproxy = require('./module/node-mitmproxy')
const { mergeData } =  require('./utils/mergeData')
const gachaTypeRaw = require('../gachaType.json')

const dataMap = new Map()
const order = ['11', '12', '1', '2']
let apiDomain = 'https://api-takumi.mihoyo.com'

const saveData = async (data, url) => {
  const obj = Object.assign({}, data)
  obj.result = [...obj.result]
  await config.save()
  await saveJSON(`gacha-list-${data.uid}.json`, obj)
}

const defaultTypeMap = new Map([
  ['11', '角色活动跃迁'],
  ['12', '光锥活动跃迁'],
  ['1', '常驻跃迁'],
  ['2', '新手跃迁']
])

const findDataFiles = async (dataPath, fileMap) => {
  const files = await readdir(dataPath)
  if (files?.length) {
    for (let name of files) {
      if (/^gacha-list-\d+\.json$/.test(name) && !fileMap.has(name)) {
        fileMap.set(name, dataPath)
      }
    }
  }
}

const collectDataFiles = async () => {
  await fs.ensureDir(userDataPath)
  const fileMap = new Map()
  await findDataFiles(userDataPath, fileMap)
  return fileMap
}

let localDataReaded = false
const readdir = util.promisify(fs.readdir)
const readData = async () => {
  if (localDataReaded) return
  localDataReaded = true
  const fileMap = await collectDataFiles()
  for (let [name, dataPath] of fileMap) {
    try {
      const data = await readJSON(dataPath, name)
      data.typeMap = new Map(data.typeMap) || defaultTypeMap
      data.result = new Map(data.result)
      data.result.forEach((value, key) => {
        value.forEach(item => {
          if (!('count' in item)) {
            item.count = "1";
          }
        });
      });
      if (data.uid) {
        dataMap.set(data.uid, data)
      }
    } catch (e) {
      sendMsg(e, 'ERROR')
    }
  }
  if ((!config.current && dataMap.size) || (config.current && dataMap.size && !dataMap.has(config.current))) {
    await changeCurrent(dataMap.keys().next().value)
  }
}

const deleteData = async (uid, action) => {
  const data = dataMap.get(uid)
  if (data) {
    data.deleted = action
    await saveData(data)
  }
}

const changeCurrent = async (uid) => {
  config.current = uid
  await config.save()
}

const detectGameLocale = async (userPath) => {
  let list = []
  const lang = app.getLocale()
  const arr = ['/miHoYo/崩坏：星穹铁道/', '/Cognosphere/Star Rail/']
  arr.forEach(str => {
    try {
      const pathname = path.join(userPath, '/AppData/LocalLow/', str, 'Player.log')
      fs.accessSync(pathname, fs.constants.F_OK)
      list.push(pathname)
    } catch (e) {}
  })
  if (config.logType) {
    if (config.logType === 2) {
      list.reverse()
    }
    list = list.slice(0, 1)
  } else if (lang !== 'zh-CN') {
    list.reverse()
  }
  return list
}

const getLatestUrl = (list) => {
  let result = list[list.length - 1]
  // let time = 0
  // for (let i = 0; i < list.length; i++) {
  //   const tsMch = list[i].match(/timestamp=(\d+)/)
  //   if (tsMch?.[1]) {
  //     const ts = parseInt(tsMch[1])
  //     if (time <= parseInt(tsMch[1])) {
  //       time = ts
  //       result = list[i]
  //     }
  //   }
  // }
  return result
}

let cacheFolder = null
const readLog = async () => {
  const text = i18n.log
  try {
    let userPath
    if (!process.env.WINEPREFIX) {
      userPath = app.getPath('home')
    } else {
      userPath = path.join(process.env.WINEPREFIX, 'drive_c/users', process.env.USER)
    }
    const logPaths = await detectGameLocale(userPath)
    if (!logPaths.length) {
      sendMsg(text.file.notFound)
      return false
    }
    const promises = logPaths.map(async logpath => {
      const logText = await fs.readFile(logpath, 'utf8')
      const gamePathMch = logText.match(/\w:\/.*?\/StarRail_Data\//i)
      if (gamePathMch) {
        const [cacheText, cacheFile] = await getCacheText(gamePathMch[0])
        const urlMch = cacheText.match(/https[^?]+?\?[^?]+?&auth_appid=webview_gacha&.+?authkey=.+?&game_biz=hkrpg_.+?&plat_type=pc/g)
        if (urlMch) {
          cacheFolder = cacheFile.replace(/Cache_Data[/\\]data_2$/, '')
          return getLatestUrl(urlMch)
        }
      }
    })
    const result = await Promise.all(promises)
    for (let url of result) {
      if (url) {
        return url
      }
    }
    sendMsg(text.url.notFound)
    return false
  } catch (e) {
    sendMsg(text.file.readFailed)
    return false
  }
}

const getGachaLog = async ({ key, page, name, retryCount, url, endId }) => {
  const text = i18n.log
  try {
    const res = await request(`${url}&gacha_type=${key}&page=${page}&size=${20}${endId ? '&end_id=' + endId : ''}`)
    if (res?.data?.list) {
      return res?.data
    }
    throw new Error(res?.message || res)
  } catch (e) {
    if (retryCount) {
      sendMsg(i18n.parse(text.fetch.retry, { name, page, count: 6 - retryCount }))
      await sleep(5)
      retryCount--
      return await getGachaLog({ key, page, name, retryCount, url, endId })
    } else {
      sendMsg(i18n.parse(text.fetch.retryFailed, { name, page }))
      throw e
    }
  }
}

const getGachaLogs = async ({ name, key }, queryString) => {
  const text = i18n.log
  let page = 1
  let list = []
  let res = null
  let logs = []
  let uid = ''
  let region = ''
  let region_time_zone = ''
  let endId = '0'
  const url = `${apiDomain}/common/gacha_record/api/getGachaLog?${queryString}`
  do {
    if (page % 10 === 0) {
      sendMsg(i18n.parse(text.fetch.interval, { name, page }))
      await sleep(1)
    }
    sendMsg(i18n.parse(text.fetch.current, { name, page }))
    res = await getGachaLog({ key, page, name, url, endId, retryCount: 5 })
    await sleep(0.3)
    logs = res?.list || []
    if (!uid && logs.length) {
      uid = logs[0].uid
    }
    if (!region) {
      region = res.region
    }
    if (!region_time_zone) {
      region_time_zone = res.region_time_zone
    }
    list.push(...logs)
    page += 1

    if (logs.length) {
      endId = logs[logs.length - 1].id
    }

    if (!config.fetchFullHistory && logs.length && uid && dataMap.has(uid)) {
      const result = dataMap.get(uid).result
      if (result.has(key)) {
        const arr = result.get(key)
        if (arr.length) {
          const localLatestId = arr[arr.length - 1].id
          if (localLatestId) {
            let shouldBreak = false
            logs.forEach(item => {
              if (item.id === localLatestId) {
                shouldBreak = true
              }
            })
            if (shouldBreak) {
              break
            }
          }
        }
      }
    }
  } while (logs.length > 0)
  return { list, uid, region, region_time_zone }
}

const checkResStatus = (res) => {
  const text = i18n.log
  if (res.retcode !== 0) {
    let message = res.message
    if (res.message === 'authkey timeout') {
      message = text.fetch.authTimeout
      sendMsg(true, 'AUTHKEY_TIMEOUT')
    }
    sendMsg(message)
    throw new Error(message)
  }
  sendMsg(false, 'AUTHKEY_TIMEOUT')
  return res
}

const tryGetUid = async (queryString) => {
  const url = `${apiDomain}/common/gacha_record/api/getGachaLog?${queryString}`
  try {
    for (let [key] of defaultTypeMap) {
      const res = await request(`${url}&gacha_type=${key}&page=1&size=6`)
      if (res.data.list && res.data.list.length) {
        return res.data.list[0].uid
      }
    }
  } catch (e) {}
  return config.current
}

const gachaTypeMap = new Map(gachaTypeRaw)
const getGachaType = (lang) => {
  const locale = detectLocale(lang)
  return gachaTypeMap.get(locale || lang)
}

const fixAuthkey = (url) => {
  const mr = url.match(/authkey=([^&]+)/)
  if (mr && mr[1] && mr[1].includes('=') && !mr[1].includes('%')) {
    return url.replace(/authkey=([^&]+)/, `authkey=${encodeURIComponent(mr[1])}`)
  }
  return url
}

const getQuerystring = (url) => {
  const text = i18n.log
  const { searchParams, host } = new URL(fixAuthkey(url))
  if (host.includes('webstatic-sea') || host.includes('hkrpg-api-os') || host.includes('api-os-takumi') || host.includes('hoyoverse.com')) {
    apiDomain = 'https://public-operation-hkrpg-sg.hoyoverse.com'
  } else {
    apiDomain = 'https://public-operation-hkrpg.mihoyo.com'
  }
  const authkey = searchParams.get('authkey')
  if (!authkey) {
    sendMsg(text.url.lackAuth)
    return false
  }
  searchParams.delete('page')
  searchParams.delete('size')
  searchParams.delete('gacha_type')
  searchParams.delete('end_id')
  return searchParams
}

const proxyServer = (port) => {
  return new Promise((rev) => {
    mitmproxy.createProxy({
      sslConnectInterceptor: (req, cltSocket, head) => {
        if (/webstatic([^\.]{2,10})?\.(mihoyo|hoyoverse)\.com/.test(req.url)) {
          return true
        }
      },
      requestInterceptor: (rOptions, req, res, ssl, next) => {
        next()
        if (/webstatic([^\.]{2,10})?\.(mihoyo|hoyoverse)\.com/.test(rOptions.hostname)) {
          if (/authkey=[^&]+/.test(rOptions.path)) {
            rev(`${rOptions.protocol}//${rOptions.hostname}${rOptions.path}`)
          }
        }
      },
      responseInterceptor: (req, res, proxyReq, proxyRes, ssl, next) => {
        next()
      },
      getPath: () => path.join(userPath, 'node-mitmproxy'),
      port
    })
  })
}

let proxyServerPromise
const useProxy = async () => {
  const text = i18n.log
  const ip = localIp()
  const port = config.proxyPort
  sendMsg(i18n.parse(text.proxy.hint, { ip, port }))
  await enableProxy('127.0.0.1', port)
  if (!proxyServerPromise) {
    proxyServerPromise = proxyServer(port)
  }
  const url = await proxyServerPromise
  await disableProxy()
  return url
}

const getUrlFromConfig = () => {
  if (config.urls.size) {
    if (config.current && config.urls.has(config.current)) {
      const url = config.urls.get(config.current)
      return url
    }
  }
}

const tryRequest = async (url, retry = false) => {
  const queryString = getQuerystring(url)
  if (!queryString) return false
  const gachaTypeUrl = `${apiDomain}/common/gacha_record/api/getGachaLog?${queryString}&page=1&size=5&gacha_type=1&end_id=0`
  try {
    const res = await request(gachaTypeUrl)
    checkResStatus(res)
  } catch (e) {
    if (e.code === 'ERR_PROXY_CONNECTION_FAILED' && !retry) {
      await disableProxy()
      return await tryRequest(url, true)
    }
    sendMsg(e.message.replace(url, '***'), 'ERROR')
    throw e
  }
}

const getUrl = async () => {
  let url = await readLog()
  if (!url && config.proxyMode) {
    url = await useProxy()
  }
  return url
}

const fetchData = async (urlOverride) => {
  const text = i18n.log
  await readData()
  let url = urlOverride
  if (!url) {
    url = await getUrl()
  }
  if (!url) {
    const message = text.url.notFound2
    sendMsg(message)
    throw new Error(message)
  }

  await tryRequest(url)

  const searchParams = getQuerystring(url)
  if (!searchParams) {
    const message = text.url.incorrect
    sendMsg(message)
    throw new Error(message)
  }
  let queryString = searchParams.toString()
  const vUid = await tryGetUid(queryString)
  const localLang = dataMap.has(vUid) ? dataMap.get(vUid).lang : ''
  if (localLang) {
    searchParams.set('lang', localLang)
  }
  queryString = searchParams.toString()
  const gachaType = await getGachaType(searchParams.get('lang'))

  const result = new Map()
  const typeMap = new Map()
  const lang = searchParams.get('lang')
  let originUid = ''
  let originRegion = ''
  let originTimeZone = ''
  for (const type of gachaType) {
    const { list, uid, region, region_time_zone } = await getGachaLogs(type, queryString)
    await sleep(0.3)
    const logs = list.map((item) => {
      const { id, item_id, item_type, name, rank_type, time, gacha_id, gacha_type, count} = item
      return { id, item_id, item_type, name, rank_type, time, gacha_id, gacha_type, count }
    })
    logs.reverse()
    typeMap.set(type.key, type.name)
    result.set(type.key, logs)
    if (!originUid) {
      originUid = uid
    }
    if (!originRegion) {
      originRegion = region
    }
    if (!originTimeZone) {
      originTimeZone = region_time_zone
    }
  }
  const data = { result, typeMap, time: Date.now(), uid: originUid, lang, region: originRegion, region_time_zone: originTimeZone }
  const localData = dataMap.get(originUid)
  const mergedResult = mergeData(localData, data)
  data.result = mergedResult
  dataMap.set(originUid, data)
  await changeCurrent(originUid)
  await saveData(data, url)
}

let proxyStarted = false
const fetchDataByProxy = async () => {
  if (proxyStarted) return
  proxyStarted = true
  const url = await useProxy()
  await fetchData(url)
}

ipcMain.handle('FETCH_DATA', async (event, param) => {
  try {
    if (param === 'proxy') {
      await fetchDataByProxy()
    } else {
      await fetchData(param)
    }
    return {
      dataMap,
      current: config.current
    }
  } catch (e) {
    sendMsg(e, 'ERROR')
    console.error(e)
  }
  return false
})

ipcMain.handle('READ_DATA', async () => {
  await readData()
  return {
    dataMap,
    current: config.current
  }
})

ipcMain.handle('CHANGE_UID', (event, uid) => {
  changeCurrent(uid)
})

ipcMain.handle('GET_CONFIG', () => {
  return config.value()
})

ipcMain.handle('LANG_MAP', () => {
  return langMap
})

ipcMain.handle('SAVE_CONFIG', (event, [key, value]) => {
  config[key] = value
  config.save()
})

ipcMain.handle('DISABLE_PROXY', async () => {
  await disableProxy()
})

ipcMain.handle('I18N_DATA', () => {
  return i18n.data
})

ipcMain.handle('OPEN_CACHE_FOLDER', () => {
  if (cacheFolder) {
    shell.openPath(cacheFolder)
  }
})

exports.getData = () => {
  return {
    dataMap,
    current: config.current
  }
}

exports.getUrl = getUrl
exports.deleteData = deleteData
