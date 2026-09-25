import type { Activity, Posture } from '@/core/robot'
import { project } from '@/content/project'

const bot = project.botName

const vi = {
  canvasLabel: `Robot ${bot} trong căn phòng nhỏ có đèn và quạt`,
  loading: 'Đang tải robot…',
  loadingPct: (pct: string): string => `Đang tải robot… ${pct}`,
  slow: 'Mạng hơi chậm, bạn chờ một chút nhé.',
  resetView: 'Đặt lại góc nhìn',
  home: 'Về chỗ cũ',
  noWebgl: `Trình duyệt này chưa hiển thị được hình 3D, nên ${bot} xuất hiện ở dạng hình vẽ. Các lệnh vẫn chạy bình thường.`,
  error: `Chưa tải được robot 3D. ${bot} tạm xuất hiện ở dạng hình vẽ, các lệnh vẫn chạy.`,
  lost: `Cảnh 3D vừa bị gián đoạn. ${bot} tạm xuất hiện ở dạng hình vẽ, các lệnh vẫn chạy.`,
  noWebglShort: 'Hình vẽ 2D: trình duyệt chưa hỗ trợ 3D.',
  errorShort: 'Hình vẽ 2D: chưa tải được cảnh 3D.',
  lostShort: 'Hình vẽ 2D: cảnh 3D bị gián đoạn.',
  retry: 'Thử lại',
  reload: 'Tải lại cảnh 3D',
  doing: (what: string): string => `${bot} đang: ${what}`,
  working: 'làm theo lệnh',
  activity: {
    idle: 'đứng chờ lệnh',
    walking: 'đi bộ',
    running: 'chạy',
    dancing: 'nhảy múa',
  } satisfies Record<Activity, string> as Record<Activity, string>,
  posture: {
    standing: 'đứng',
    sitting: 'ngồi',
    sleeping: 'ngủ',
    lying: 'nằm',
  } satisfies Record<Posture, string> as Record<Posture, string>,
  lightOn: 'Đèn đang bật',
  lightOff: 'Đèn đang tắt',
  fanOn: (speed: number): string => `Quạt đang chạy số ${speed}`,
  fanOff: 'Quạt đang tắt',
}

const en: typeof vi = {
  canvasLabel: `${bot} the robot in a small room with a lamp and a fan`,
  loading: 'Loading robot…',
  loadingPct: (pct) => `Loading robot… ${pct}`,
  slow: 'The network is a bit slow, please wait a moment.',
  resetView: 'Reset view',
  home: 'Back to my spot',
  noWebgl: `This browser can't show 3D graphics, so ${bot} appears as a drawing. Commands still work.`,
  error: `The 3D robot didn't load. ${bot} appears as a drawing for now; commands still work.`,
  lost: `The 3D scene was interrupted. ${bot} appears as a drawing for now; commands still work.`,
  noWebglShort: "2D drawing: this browser can't show 3D.",
  errorShort: "2D drawing: the 3D scene didn't load.",
  lostShort: '2D drawing: the 3D scene was interrupted.',
  retry: 'Try again',
  reload: 'Reload 3D scene',
  doing: (what) => `${bot} is ${what}`,
  working: 'following a command',
  activity: {
    idle: 'waiting for a command',
    walking: 'walking',
    running: 'running',
    dancing: 'dancing',
  },
  posture: {
    standing: 'standing',
    sitting: 'sitting',
    sleeping: 'sleeping',
    lying: 'lying down',
  },
  lightOn: 'The light is on',
  lightOff: 'The light is off',
  fanOn: (speed) => `The fan is on, speed ${speed}`,
  fanOff: 'The fan is off',
}

export const robotDict = { vi, en }
