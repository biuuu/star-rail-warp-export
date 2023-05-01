const mergeList = (a, b) => {
  if (!a || !a.length) return b || []
  if (!b || !b.length) return a
  const list = [...b, ...a]
  const result = []
  const idSet = new Set()
  list.forEach(item => {
    if (!idSet.has(item.id)) {
      result.push(item)
    }
    idSet.add(item.id)
  })
  return result.sort((m, n) => {
    const num = BigInt(m.id) - BigInt(n.id)
    if (num > 0) {
      return 1
    } else if (num < 0) {
      return -1
    }
    return 0
  })
}

const mergeData = (local, origin) => {
  if (local && local.result) {
    const localResult = local.result
    const localUid = local.uid
    const originUid = origin.uid
    if (localUid !== originUid) return origin.result
    const originResult = new Map()
    for (let [key, value] of origin.result) {
      const newVal = mergeList(localResult.get(key), value)
      originResult.set(key, newVal)
    }
    return originResult
  }
  return origin.result
}

module.exports = { mergeData, mergeList }