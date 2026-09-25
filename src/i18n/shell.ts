import { project } from '@/content/project'

const vi = {
  skipToComposer: 'Bỏ qua, đến ô nhập lệnh',
  nav: { label: 'Điều hướng chính', demo: 'Demo', research: 'Nghiên cứu' },
  lang: { label: 'Ngôn ngữ giao diện', vi: 'Tiếng Việt', en: 'Tiếng Anh' },
  theme: {
    label: 'Giao diện sáng/tối',
    system: 'Tự động',
    light: 'Sáng',
    dark: 'Tối',
    next: (current: string): string => `Giao diện: ${current}. Nhấn để đổi.`,
  },
  voice: {
    on: 'Giọng đọc: Bật',
    off: 'Giọng đọc: Tắt',
    short: 'Giọng',
    toggle: (on: boolean): string => (on ? 'Tắt giọng đọc của robot' : 'Bật giọng đọc của robot'),
    unavailable: 'Trình duyệt không hỗ trợ giọng đọc',
  },
  siteName: project.siteName.vi,
  footer: {
    team: `Nhóm ${project.team}`,
    note: 'Dự án nghiên cứu khoa học, phi thương mại.',
    report: 'Báo cáo kỹ thuật đầy đủ',
    credits: 'Nguồn & giấy phép',
  },
  error: {
    title: { demo: 'Phần robot đang gặp sự cố', research: 'Chưa tải được phần kết quả nghiên cứu' },
    body: 'Có thể do mạng chập chờn. Bạn tải lại trang giúp mình nhé.',
    reload: 'Tải lại trang',
    report: 'Mở báo cáo kỹ thuật',
  },
  docTitle: `${project.siteName.vi} · ${project.team}`,
  docDescription:
    'Robot 3D hiểu lệnh tiếng Việt của mọi vùng miền — demo nghiên cứu PhoWhisper-large tinh chỉnh trên ViMD của nhóm PTNK.',
}

const en: typeof vi = {
  skipToComposer: 'Skip to the command box',
  nav: { label: 'Main navigation', demo: 'Demo', research: 'Research' },
  lang: { label: 'Interface language', vi: 'Vietnamese', en: 'English' },
  theme: {
    label: 'Light/dark theme',
    system: 'Auto',
    light: 'Light',
    dark: 'Dark',
    next: (current) => `Theme: ${current}. Click to change.`,
  },
  voice: {
    on: 'Voice: On',
    off: 'Voice: Off',
    short: 'Voice',
    toggle: (on) => (on ? "Mute the robot's voice" : "Unmute the robot's voice"),
    unavailable: 'This browser has no speech synthesis',
  },
  siteName: project.siteName.en,
  footer: {
    team: `Team ${project.team}`,
    note: 'A non-commercial student research project.',
    report: 'Full technical report',
    credits: 'Credits & licences',
  },
  error: {
    title: { demo: 'The robot demo ran into a problem', research: "The research results couldn't load" },
    body: 'This is often a flaky connection. Please reload the page.',
    reload: 'Reload page',
    report: 'Open the technical report',
  },
  docTitle: `${project.siteName.en} · ${project.team}`,
  docDescription:
    'A 3D robot that understands Vietnamese commands from every region — research demo of PhoWhisper-large fine-tuned on ViMD by team PTNK.',
}

export const shellDict = { vi, en }
