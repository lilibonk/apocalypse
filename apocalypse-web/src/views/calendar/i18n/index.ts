import type { AppI18nModule } from '@/i18n/module-loader'

import { calendarEn } from './en'
import { calendarZh } from './zh'

const calendarI18n = {
  namespace: 'calendar',
  resources: {
    zh: calendarZh,
    en: calendarEn,
  },
  menu: {
    zh: {
      万年历: '万年历',
      日历视图: '日历视图',
      日历管理: '日历管理',
      个人日期覆盖: '个人日期覆盖',
      业务日期覆盖: '业务日期覆盖',
      我的日程: '我的日程',
      业务日程: '业务日程',
      年度数据导入: '年度数据导入',
      投影授权: '投影授权',
    },
    en: {
      万年历: 'Calendar',
      日历视图: 'Calendar View',
      日历管理: 'Calendar Management',
      个人日期覆盖: 'Personal Date Overrides',
      业务日期覆盖: 'Managed Date Overrides',
      我的日程: 'My Events',
      业务日程: 'Managed Events',
      年度数据导入: 'Annual Data Imports',
      投影授权: 'Projection Grants',
    },
  },
} satisfies AppI18nModule

export default calendarI18n
