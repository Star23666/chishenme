/**
 * 今天吃啥 · 配置【模板】
 *
 * ★ 这是给人看的模板，真正生效的文件叫 config.js（被 .gitignore 排除，不在仓库里）。
 *   第一次拿到这份代码时：
 *     1. 把这个文件复制一份，改名为 config.js
 *     2. 想用家庭共享，就把 CLOUD_ENV 填成你自己的云开发环境 ID
 *        不想用，就留空 —— 本地模式照样能用，数据只存在本机
 *
 *   CLOUD_ENV 留空  ->  本地模式：数据只存这台手机，跟单机版完全一样
 *   CLOUD_ENV 填上  ->  云端模式：家人共用一个家庭房间，实时同步
 *
 * 怎么拿到 envId：微信开发者工具 → 顶部「云开发」按钮 → 开通（免费）
 *                → 控制台左上角环境名旁边那串，形如 cloud1-9gxxxxxxxxxxxx
 *
 * 填错或填了但还没开通，小程序不会崩：会自动回落到本地模式。
 */
module.exports = {

  /** 云开发环境 ID。留空 = 本地模式 */
  CLOUD_ENV: '',

  /** 云函数名（要和 cloudfunctions/ 下的文件夹名一致） */
  CLOUD_FUNCTION: 'csmMenu',

  /** 数据库集合名 */
  COL_FAMILIES: 'csm_families',
  COL_MENUS: 'csm_menus',

  /** 一个家庭最多几个人 */
  MAX_MEMBERS: 15
}
