import type { RecorderErrorKind } from '@/audio/useRecorder'
import type { FileProblem } from '@/audio/validateFile'

/** UI strings for the audio tab (recording, file upload, "coming soon" overlay). */

const vi = {
  soon: {
    badge: 'Sắp có',
    title: 'Ra lệnh bằng giọng nói',
    body: 'Mô hình nhận dạng giọng nói PhoWhisper-large tinh chỉnh trên ViMD đang được hoàn thiện phần máy chủ. Trong lúc chờ, bạn hãy dùng thẻ Văn bản.',
    switchToText: 'Chuyển sang Văn bản',
  },

  record: {
    heading: 'Ghi âm',
    start: 'Nhấn để nói',
    requesting: 'Đang xin quyền dùng micro…',
    stop: 'Dừng',
    stopLabel: 'Dừng ghi âm',
    cancel: 'Hủy',
    cancelLabel: 'Hủy bản ghi âm',
    elapsed: (now: string, max: string): string => `${now} / ${max}`,
    elapsedLabel: (now: string, max: string): string => `Đã ghi ${now} trên tối đa ${max}`,
    hint: 'Nói một câu lệnh ngắn, tối đa 30 giây. Máy tự dừng ghi âm sau 30 giây.',
    level: 'Âm lượng micro',
    errors: {
      denied: 'Bạn đã chặn micro. Hãy bấm biểu tượng ổ khóa cạnh địa chỉ trang, cho phép micro, rồi thử lại.',
      no_device: 'Không tìm thấy micro. Hãy cắm micro hoặc tai nghe có micro rồi thử lại.',
      busy: 'Micro đang được ứng dụng khác dùng. Hãy tắt ứng dụng đó rồi thử lại.',
      insecure: 'Trang cần mở bằng địa chỉ https:// thì mới dùng được micro.',
      unsupported: 'Trình duyệt này không ghi âm được. Hãy mở trang bằng Chrome, Edge hoặc Safari.',
      in_app: 'Ứng dụng này (Zalo, Facebook…) chặn micro. Hãy mở trang bằng Safari hoặc Chrome.',
      too_short: 'Quá ngắn — hãy nói lâu hơn một chút rồi mới bấm Dừng.',
      failed: 'Ghi âm bị lỗi. Bạn thử lại nhé.',
    } satisfies Record<RecorderErrorKind, string>,
  },

  file: {
    heading: 'Hoặc gửi tệp âm thanh',
    drop: 'Kéo thả tệp âm thanh vào đây',
    or: 'hoặc',
    choose: 'Chọn tệp',
    hint: (maxMB: number): string => `WAV, MP3, M4A, WebM, OGG · tối đa 30 giây · ${maxMB} MB`,
    checking: 'Đang đọc tệp…',
    errors: {
      type: 'Tệp này không phải định dạng âm thanh được hỗ trợ (WAV, MP3, M4A, WebM, OGG).',
      empty: 'Tệp trống.',
      size: 'Tệp lớn quá.',
    } satisfies Record<FileProblem, string>,
    sizeLimit: (maxMB: number): string => `Tối đa ${maxMB} MB.`,
    tooShort: 'Đoạn âm thanh quá ngắn (dưới 0,5 giây).',
    tooLong: (sec: string): string => `Đoạn âm thanh dài ${sec} giây, robot chỉ nghe tối đa 30 giây.`,
    useFirst: 'Dùng 30 giây đầu',
    cancel: 'Hủy',
  },

  preview: {
    heading: 'Nghe lại trước khi gửi',
    audioLabel: 'Bản ghi âm',
    duration: (sec: string): string => `Dài ${sec} giây`,
    trimmed: 'Robot sẽ chỉ nghe 30 giây đầu.',
    send: 'Gửi cho robot',
    again: 'Ghi lại',
    otherFile: 'Chọn tệp khác',
  },

  processing: {
    label: 'Đang nhận dạng giọng nói…',
    hint: 'Máy chủ đang nghe đoạn âm thanh của bạn.',
    cancel: 'Hủy',
  },

  done: 'Đã gửi. Xem kết quả ở ô “Robot nghe được” bên dưới.',
  mock: 'Chế độ thử (dev): máy chủ giả, trả lời câu mẫu.',
}

const en: typeof vi = {
  soon: {
    badge: 'Coming soon',
    title: 'Give commands by voice',
    body: 'The speech-recognition model — PhoWhisper-large fine-tuned on ViMD — is still getting its server. Meanwhile, please use the Text tab.',
    switchToText: 'Switch to Text',
  },

  record: {
    heading: 'Record',
    start: 'Tap to speak',
    requesting: 'Asking for the microphone…',
    stop: 'Stop',
    stopLabel: 'Stop recording',
    cancel: 'Cancel',
    cancelLabel: 'Discard the recording',
    elapsed: (now, max) => `${now} / ${max}`,
    elapsedLabel: (now, max) => `Recorded ${now} of at most ${max}`,
    hint: 'Say one short command, up to 30 seconds. Recording stops by itself.',
    level: 'Microphone level',
    errors: {
      denied:
        'The microphone is blocked. Click the lock icon next to the address, allow the microphone, then try again.',
      no_device: 'No microphone found. Plug in a microphone or headset and try again.',
      busy: 'Another app is using the microphone. Close it and try again.',
      insecure: 'The microphone only works when the page is opened over https://.',
      unsupported: "This browser can't record. Please open the page in Chrome, Edge or Safari.",
      in_app: 'This app (Zalo, Facebook…) blocks the microphone. Please open the page in Safari or Chrome.',
      too_short: 'Too short — keep talking a little longer, then tap Stop.',
      failed: 'Recording failed. Please try again.',
    },
  },

  file: {
    heading: 'Or send an audio file',
    drop: 'Drag and drop an audio file here',
    or: 'or',
    choose: 'Choose a file',
    hint: (maxMB) => `WAV, MP3, M4A, WebM, OGG · up to 30 seconds · ${maxMB} MB`,
    checking: 'Reading the file…',
    errors: {
      type: "This file isn't a supported audio format (WAV, MP3, M4A, WebM, OGG).",
      empty: 'The file is empty.',
      size: 'The file is too large.',
    },
    sizeLimit: (maxMB) => `Maximum ${maxMB} MB.`,
    tooShort: 'The audio is too short (under 0.5 seconds).',
    tooLong: (sec) => `The audio is ${sec} seconds long; the robot listens to 30 seconds at most.`,
    useFirst: 'Use the first 30 seconds',
    cancel: 'Cancel',
  },

  preview: {
    heading: 'Listen before sending',
    audioLabel: 'Recording',
    duration: (sec) => `${sec} seconds long`,
    trimmed: 'The robot will only hear the first 30 seconds.',
    send: 'Send to the robot',
    again: 'Record again',
    otherFile: 'Choose another file',
  },

  processing: {
    label: 'Recognising speech…',
    hint: 'The server is listening to your audio.',
    cancel: 'Cancel',
  },

  done: 'Sent. See the result under “What the robot heard” below.',
  mock: 'Test mode (dev): a fake server that answers with sample commands.',
}

export const audioDict = { vi, en }
