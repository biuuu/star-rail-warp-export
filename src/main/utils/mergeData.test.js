const { mergeList } = require('./mergeData')

test('mergeList successed', () => {
  const listA = [{
    "id": "1682521800010412850",
  },
  {
    "id": "1682521800010412950",
  }]

  const listB = [{
    "id": "1682521800010412900",
  }]

  expect(mergeList(listA, listB)).toEqual([
    {
      "id": "1682521800010412850",
    },
    {
      "id": "1682521800010412900",
    },
    {
      "id": "1682521800010412950",
    }
  ])
})

test('mergeList with repeated data successed', () => {
  const listA = [{
    "id": "1682521800010412850",
  },
  {
    "id": "1682521800010412950",
  }]

  const listB = [{
    "id": "1682521800010412950",
  }]

  expect(mergeList(listA, listB)).toEqual([
    {
      "id": "1682521800010412850",
    },
    {
      "id": "1682521800010412950",
    }
  ])
})

test('mergeList empty successed', () => {
  const listA = []
  const listB = [{
    "id": "1682521800010412900",
  }]
  expect(mergeList(listA, listB)).toEqual([
    {
      "id": "1682521800010412900",
    }
  ])
})

test('mergeList empty 2 successed', () => {
  const listA = [{
    "id": "1682521800010412900",
  }]
  const listB = []
  expect(mergeList(listA, listB)).toEqual([
    {
      "id": "1682521800010412900",
    }
  ])
})