/**
 * 分类字典
 * v1 固定不可自定义。将来要做「自定义分类」，
 * 只需要把 EXPENSE / INCOME 改成从存储读取即可，页面代码不用动。
 *
 * ★ 注意：支出的「其他」和收入的「其他」必须用不同的 key（other_e / other_i），
 *   否则统计时会混在一起。
 */

var EXPENSE = [
  { key: 'food', name: '餐饮', color: '#FF8A65' },
  { key: 'transport', name: '交通', color: '#4DB6AC' },
  { key: 'shopping', name: '购物', color: '#F06292' },
  { key: 'fun', name: '娱乐', color: '#9575CD' },
  { key: 'daily', name: '日用', color: '#4FC3F7' },
  { key: 'medical', name: '医疗', color: '#AED581' },
  { key: 'study', name: '学习', color: '#7986CB' },
  { key: 'other_e', name: '其他', color: '#B0BEC5' }
]

var INCOME = [
  { key: 'salary', name: '工资', color: '#66BB6A' },
  { key: 'parttime', name: '兼职', color: '#26A69A' },
  { key: 'redpack', name: '红包', color: '#EF5350' },
  { key: 'invest', name: '理财', color: '#FFA726' },
  { key: 'other_i', name: '其他', color: '#B0BEC5' }
]

var FALLBACK = { key: 'unknown', name: '未分类', color: '#B0BEC5' }

/** 取某一类型下的全部分类 */
function list(type) {
  return type === 'income' ? INCOME : EXPENSE
}

/** 按 key 查分类（自动区分收入/支出） */
function find(type, key) {
  var arr = list(type)
  for (var i = 0; i < arr.length; i++) {
    if (arr[i].key === key) return arr[i]
  }
  return FALLBACK
}

/** 按 key 查支出分类 */
function findExpense(key) {
  return find('expense', key)
}

/** 按 key 查收入分类 */
function findIncome(key) {
  return find('income', key)
}

module.exports = {
  EXPENSE: EXPENSE,
  INCOME: INCOME,
  list: list,
  find: find,
  findExpense: findExpense,
  findIncome: findIncome
}
