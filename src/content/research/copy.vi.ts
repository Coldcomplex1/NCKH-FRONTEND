import { project } from '@/content/project'
import { provinceName } from '@/content/provinces'
import { SCALES, WHISPER_WINDOW_SEC } from '@/content/stats'
import type { MacroRegion } from '@/core/parser'
import { ENV } from '@/lib/env'
import { runDate, sci, signedPp, spanText } from './helpers'
import type { ResearchCopy } from './types'

/** Vietnamese research copy (the default UI language). Every figure comes from `stats`. */

const region: Record<MacroRegion, string> = { North: 'Bắc', Central: 'Trung', South: 'Nam' }
const regionLong: Record<MacroRegion, string> = {
  North: 'miền Bắc',
  Central: 'miền Trung',
  South: 'miền Nam',
}
const cap = (x: string): string => x.charAt(0).toLocaleUpperCase('vi') + x.slice(1)
const name = (id: string): string => provinceName(id, 'vi')

export const copyVi: ResearchCopy = {
  label: 'Nghiên cứu',
  common: {
    region,
    regionLong,
    split: { train: 'Huấn luyện', valid: 'Kiểm định', test: 'Kiểm tra' },
    lowerIsBetter: 'Thấp hơn là tốt hơn',
    soon: 'Sắp có',
    newTab: '(mở thẻ mới)',
    n: (n, f) => `n = ${f.int(n)}`,
    utterances: (n, f) => `${f.int(n)} câu`,
    seconds: (sec, f) => `${f.num(sec, 1)} giây`,
    scale: (max, f) => `Thang đo chung 0–${f.pct(max, 0)}`,
    yes: 'có',
    no: 'không',
  },

  overview: {
    eyebrow: (team) => `Đề tài NCKH · ${team}`,
    lede: (s, f) =>
      `Chúng tôi tinh chỉnh PhoWhisper-large trên bộ dữ liệu đa phương ngữ ViMD (${f.int(s.provinceCount)} tỉnh thành) để máy hiểu giọng nói của mọi miền — đặc biệt là người lớn tuổi nói giọng địa phương đậm. Robot ${project.botName} bên trên là bản demo cho cả hệ thống.`,
    mentor: 'Giáo viên hướng dẫn',
    tryRobot: 'Thử robot',
    seeResults: 'Xem kết quả',
    fullReport: 'Báo cáo kỹ thuật đầy đủ (tiếng Anh)',
    otherTitle: 'Tên tiếng Anh',
  },

  problem: {
    heading: 'Vì sao cần đề tài này?',
    intro: 'Nhận dạng giọng nói đã quen thuộc, nhưng chưa thật sự dành cho tất cả mọi người.',
    access: {
      title: 'Trợ lý giọng nói chưa quen giọng miền',
      body: 'Các trợ lý giọng nói phần lớn được huấn luyện trên giọng chuẩn. Vì vậy người lớn tuổi nói giọng địa phương đậm thường phải nhắc lại nhiều lần, hoặc bỏ cuộc và nhờ con cháu bấm hộ.',
    },
    data: {
      title: 'Số liệu của chính chúng tôi',
      body: (s, f) =>
        `Ngay cả sau khi tinh chỉnh, giọng ${regionLong[s.hardestRegion]} vẫn khó nhất: WER **${f.pct(s.regions[s.hardestRegion].wer)}**, so với **${f.pct(s.regions[s.easiestRegion].wer)}** của ${regionLong[s.easiestRegion]} (gấp **${f.num(s.regionGap.ratio)}** lần). **${f.int(s.hardest.inHardestRegion)}/${f.int(s.hardest.items.length)}** tỉnh khó nhất thuộc ${regionLong[s.hardestRegion]}; khó nhất là **${name(s.worst.id)}** (**${f.pct(s.worst.wer)}**).`,
      caveat: (s, f) =>
        `Mỗi tỉnh chỉ có ${f.int(s.provinceN.min)}–${f.int(s.provinceN.max)} câu trong tập kiểm tra, nên thứ hạng từng tỉnh cần đọc kèm cỡ mẫu.`,
    },
    goal: {
      title: 'Mục tiêu: công nghệ giọng nói cho mọi người',
      body: (s, f) =>
        `Tinh chỉnh PhoWhisper trên giọng nói của ${f.int(s.provinceCount)} tỉnh thành trong ViMD, rồi thêm bước hiệu chỉnh hậu kỳ bằng mô hình ngôn ngữ lớn (Qwen, sắp có) để sửa lỗi còn sót — để ai cũng có thể ra lệnh bằng chính giọng của mình.`,
    },
  },

  pipeline: {
    heading: 'Hệ thống hoạt động thế nào?',
    intro: 'Một câu lệnh đi qua năm bước, từ lời nói đến hành động của robot.',
    more: 'Tìm hiểu thêm',
    stepLabel: (i, total) => `Bước ${i}/${total}`,
    nodes: {
      input: {
        title: 'Giọng nói / Văn bản',
        sub: () => 'Micro hoặc bàn phím',
        body: () =>
          ENV.asr.enabled
            ? 'Bạn nói hoặc gõ lệnh bằng tiếng Việt, giọng miền nào cũng được — cả hai cách đều dùng được.'
            : 'Bạn nói hoặc gõ lệnh bằng tiếng Việt, giọng miền nào cũng được. Bản demo hiện nhận văn bản; phần giọng nói sẽ bật khi máy chủ nhận dạng sẵn sàng.',
      },
      asr: {
        title: 'PhoWhisper-large + ViMD',
        sub: (s) => `${s.model.checkpoint} · ${s.model.beams}-beam`,
        body: (s, f) =>
          `Mô hình PhoWhisper-large của VinAI được nhóm tinh chỉnh trên ViMD để chuyển giọng nói thành chữ. Trên tập kiểm tra, WER là ${f.pct(s.test.werNormalized)}.`,
      },
      qwen: {
        title: 'Hiệu chỉnh hậu kỳ (Qwen)',
        sub: () => 'Mô hình ngôn ngữ lớn',
        body: () =>
          'Mô hình ngôn ngữ lớn sẽ đọc lại bản chép lời và sửa những lỗi còn sót. Bước này đang được phát triển nên chưa có số đo nào.',
      },
      nlu: {
        title: 'Bộ hiểu lệnh (NLU dựa trên quy tắc)',
        sub: () => 'Thay được bằng LLM',
        body: () =>
          'Bộ quy tắc nhận ra từ địa phương (chừ, rứa, mô, quẹo…) và ý định của câu lệnh. Nó có giao diện chung nên sau này có thể thay bằng một mô hình ngôn ngữ.',
      },
      robot: {
        title: 'Robot 3D',
        sub: () => project.botName,
        body: () =>
          `${project.botName} thực hiện lệnh trong căn phòng 3D và trả lời bằng chữ cùng giọng đọc.`,
      },
    },
  },

  results: {
    heading: 'Kết quả chính',
    intro: (s) =>
      `Mô hình ${s.model.checkpoint}, giải mã ${s.model.beams}-beam, chấm trên tập kiểm tra của ViMD — những câu nói không hề dùng khi huấn luyện.`,
    wer: {
      label: 'WER tập kiểm tra',
      value: (s, f) => f.pct(s.test.werNormalized),
      sub: () => 'Tỉ lệ lỗi từ',
    },
    cer: {
      label: 'CER tập kiểm tra',
      value: (s, f) => f.pct(s.test.cerNormalized),
      sub: () => 'Tỉ lệ lỗi ký tự',
    },
    size: {
      label: 'Quy mô tập kiểm tra',
      value: (s, f) => f.int(s.test.utterances),
      unit: 'câu',
      sub: (s, f) => `${f.num(s.test.hours)} giờ ghi âm`,
    },
    coverage: {
      label: 'Độ phủ',
      value: (s, f) => f.int(s.test.provinces),
      unit: 'tỉnh thành',
      sub: (s, f) => `${f.int(s.test.speakers)} người nói trong tập kiểm tra`,
    },
    what: {
      summary: 'WER là gì?',
      formula: 'WER = (S + D + I) / N',
      legend:
        'S: số từ bị nghe nhầm thành từ khác · D: số từ bị bỏ sót · I: số từ bị chèn thêm · N: số từ trong câu gốc.',
      body: (s, f) =>
        `WER ${f.pct(s.test.werNormalized)} nghĩa là cứ khoảng 100 từ thì máy nghe sai khoảng ${f.int(s.wrongWordsPer100)} từ.`,
      raw: (s, f) =>
        `Con số trên được chấm sau khi chuẩn hoá (chữ thường, bỏ dấu câu, đọc số thành chữ — xem mục Dữ liệu). Chấm trên văn bản thô thì WER là ${f.pct(s.test.werRaw)}; phần chênh lệch đến từ cách viết như chữ hoa, dấu câu, không phải từ việc nghe.`,
    },
    comparison: {
      title: 'So sánh trên cùng tập kiểm tra',
      takeaway: (s, f) =>
        s.comparison.gainVsZeroShot === null
          ? `Mô hình tinh chỉnh đạt WER ${f.pct(s.comparison.ours)}.`
          : `Tinh chỉnh giảm WER ${f.pct(s.comparison.gainVsZeroShot, 0)} so với mô hình gốc chưa tinh chỉnh.`,
      zeroShot: 'PhoWhisper-large gốc (chưa tinh chỉnh)',
      ours: 'Sau tinh chỉnh trên ViMD',
      qwen: 'Thêm hiệu chỉnh hậu kỳ (Qwen)',
      tableCols: ['Mô hình', 'WER tập kiểm tra'],
    },
  },

  quality: {
    heading: 'Mô hình có ổn định không?',
    intro:
      'Ba cách kiểm tra: so hai tập dữ liệu, theo dõi quá trình huấn luyện và chấm lại các checkpoint tốt nhất.',
    valTest: {
      title: 'Tập kiểm định và tập kiểm tra',
      takeaway: (s, f) =>
        s.test.werNormalized <= s.validation.werNormalized
          ? `WER tập kiểm tra (${f.pct(s.test.werNormalized)}) không cao hơn tập kiểm định (${f.pct(s.validation.werNormalized)}): không có dấu hiệu quá khớp với tập kiểm định.`
          : `WER tập kiểm tra (${f.pct(s.test.werNormalized)}) cao hơn tập kiểm định (${f.pct(s.validation.werNormalized)}) ${f.pp(-s.testVsValidation.absolute)}.`,
      metrics: { wer: 'WER (chuẩn hoá)', werRaw: 'WER (thô)', cer: 'CER (chuẩn hoá)' },
      series: { validation: 'Kiểm định', test: 'Kiểm tra' },
      note: (s) =>
        `Cả hai tập đều giải mã ${s.model.beams}-beam. Checkpoint được chọn theo tập kiểm định, nên tập kiểm tra mới là thước đo độc lập.`,
      tableCols: ['Chỉ số', 'Kiểm định', 'Kiểm tra'],
    },
    trajectory: {
      title: 'WER kiểm định trong lúc huấn luyện (giải mã greedy)',
      takeaway: (s, f) =>
        `WER greedy giảm từ ${f.pct(s.training.first.wer)} ở bước ${f.int(s.training.first.step)} xuống ${f.pct(s.training.last.wer)} ở bước ${f.int(s.training.last.step)}.`,
      xLabel: 'Bước huấn luyện (step)',
      axisNote: 'Trục dọc không bắt đầu từ 0, để thấy rõ những thay đổi nhỏ.',
      svgTitle: 'Biểu đồ đường: WER kiểm định (greedy) theo bước huấn luyện',
      svgDesc: (s, f) =>
        `Có ${f.int(s.training.points.length)} lần đánh giá, từ bước ${f.int(s.training.first.step)} đến ${f.int(s.training.last.step)}. WER greedy thấp nhất là ${f.pct(s.training.bestGreedy.wer)} ở bước ${f.int(s.training.bestGreedy.step)}.`,
      pointLabel: (p, f) => `Bước ${f.int(p.step)}: WER ${f.pct(p.wer)}`,
      detail: (p, f) =>
        `Bước ${f.int(p.step)} · epoch ${f.num(p.epoch, 1)} · WER ${f.pct(p.wer)} · CER ${f.pct(p.cer)} · WER thô ${f.pct(p.werRaw)} · eval loss ${f.num(p.evalLoss, 3)}`,
      selected: (s) => `Chọn sau rerank ${s.model.beams}-beam`,
      bestGreedy: 'Greedy tốt nhất',
      beamNote: (s, f) =>
        s.training.selected
          ? `Đường cong dùng giải mã greedy (nhanh, dùng khi huấn luyện), nên ở bước ${f.int(s.training.selected.step)} WER là ${f.pct(s.training.selected.wer)} — cao hơn con số kiểm định **${f.pct(s.validation.werNormalized)}** ở trên, vốn được giải mã ${s.model.beams}-beam.`
          : `Đường cong dùng giải mã greedy; con số kiểm định **${f.pct(s.validation.werNormalized)}** ở trên được giải mã ${s.model.beams}-beam.`,
      tableCols: ['Bước', 'Epoch', 'WER greedy', 'CER', 'WER thô', 'Eval loss'],
    },
    rerank: {
      title: 'Chọn checkpoint bằng giải mã beam search',
      takeaway: (s, f) =>
        `${f.int(s.rerank.length)} checkpoint tốt nhất được chấm lại với ${s.model.beams}-beam; ${s.selectedRerank.checkpoint} có WER thấp nhất (${f.pct(s.selectedRerank.wer)}).`,
      selected: 'Đã chọn',
      delta: (r, f) =>
        r.selected ? 'Mốc so sánh' : `${signedPp(r.deltaVsSelected, f)} so với checkpoint đã chọn`,
      note: (s, f) =>
        `Đây là con số kiểm định ${f.pct(s.validation.werNormalized)} ở trên. Chênh lệch giữa các checkpoint rất nhỏ nên các thanh gần như bằng nhau.`,
      tableCols: ['Checkpoint', 'WER (5-beam)', 'WER thô', 'CER'],
    },
  },

  regions: {
    heading: (s, f) => `Ba miền, ${f.int(s.provinceCount)} tỉnh thành`,
    intro: (s, f) =>
      `Kết quả trên tập kiểm tra, chia theo ba miền và ${f.int(s.provinceCount)} tỉnh thành của người nói.`,
    bars: {
      title: 'WER theo miền',
      takeaway: (s, f) =>
        `${cap(regionLong[s.hardestRegion])} khó nhất (${f.pct(s.regions[s.hardestRegion].wer)}), ${regionLong[s.easiestRegion]} dễ nhất (${f.pct(s.regions[s.easiestRegion].wer)}).`,
      tableCols: ['Miền', 'WER', 'Số câu', 'Số tỉnh'],
    },
    facts: {
      title: 'Vài con số đáng chú ý',
      items: [
        {
          label: () => 'Tỉnh có WER thấp nhất',
          value: (s, f) => `${name(s.best.id)} — ${f.pct(s.best.wer)} (n = ${f.int(s.best.utterances)})`,
        },
        {
          label: () => 'Tỉnh có WER cao nhất',
          value: (s, f) => `${name(s.worst.id)} — ${f.pct(s.worst.wer)} (n = ${f.int(s.worst.utterances)})`,
        },
        {
          label: (s, f) => `Trong ${f.int(s.hardest.items.length)} tỉnh khó nhất`,
          value: (s, f) => `${f.int(s.hardest.inHardestRegion)} tỉnh thuộc ${regionLong[s.hardestRegion]}`,
        },
        {
          label: (s) => `Trung vị các tỉnh ${regionLong[s.hardestRegion]}`,
          value: (s, f) => f.pct(s.regions[s.hardestRegion].provinceMedian),
        },
        {
          label: (s, f) => `Trung vị của cả ${f.int(s.provinceCount)} tỉnh`,
          value: (s, f) => f.pct(s.provinceMedian),
        },
        {
          label: () => 'Cỡ mẫu mỗi tỉnh',
          value: (s, f) => `chỉ ${f.int(s.provinceN.min)}–${f.int(s.provinceN.max)} câu — hãy đọc kèm cỡ mẫu`,
        },
      ],
    },
    ranking: {
      title: 'Xếp hạng các tỉnh thành',
      takeaway: (s, f) =>
        `Hạng 1 là WER thấp nhất. Thang đo chung 0–${f.pct(SCALES.provinces, 0)}; mỗi tỉnh chỉ ${f.int(s.provinceN.min)}–${f.int(s.provinceN.max)} câu.`,
      filterLabel: 'Lọc theo miền',
      all: 'Tất cả',
      row: (p) => `Hạng ${p.rank}. ${p.name} — miền ${p.region} — WER ${p.wer} — ${p.n}`,
      showAll: (n, f) => `Xem tất cả ${f.int(n)} tỉnh`,
      showFewer: 'Thu gọn danh sách',
      announce: (count, filter, f) =>
        filter === 'all'
          ? `Đang hiện tất cả ${f.int(count)} tỉnh thành.`
          : `Đang hiện ${f.int(count)} tỉnh thành ${regionLong[filter]}.`,
    },
    footnote: (s, f) =>
      `${f.int(s.provinceCount)} tỉnh thành theo nhãn của bộ ViMD, tức địa giới trước đợt sắp xếp đơn vị hành chính năm 2025.`,
  },

  errors: {
    heading: 'Mô hình sai ở đâu?',
    intro: 'Phần lớn câu chỉ sai vài từ; một số ít câu sai rất nặng kéo WER trung bình lên.',
    histogram: {
      title: 'Phân bố WER của từng câu',
      takeaway: (s, f) =>
        `${f.int(s.distribution.perfectCount)} câu (${f.pct(s.distribution.perfectRate)}) đúng hoàn toàn; một nửa số câu có WER dưới ${f.pct(s.distribution.median)}.`,
      axis: 'Khoảng WER của từng câu (các khoảng rộng không đều nhau)',
      perfect: 'hoàn hảo',
      bin: (label, count, share, f) => `WER ${label}%: ${f.int(count)} câu (${f.pct(share, 1)})`,
      tableCols: ['Khoảng WER', 'Số câu', 'Tỉ lệ'],
    },
    stats: {
      title: 'Tóm tắt',
      median: {
        label: 'Trung vị',
        value: (s, f) => f.pct(s.distribution.median),
        sub: () => 'Một nửa số câu có WER thấp hơn mức này',
      },
      p90: {
        label: 'Phân vị 90',
        value: (s, f) => f.pct(s.distribution.p90),
        sub: () => '9 trên 10 câu có WER không vượt quá mức này',
      },
      perfect: {
        label: 'Câu đúng hoàn toàn',
        value: (s, f) => f.pct(s.distribution.perfectRate),
        sub: (s, f) => `${f.int(s.distribution.perfectCount)} câu không sai từ nào`,
      },
      high: {
        label: 'Câu sai nhiều',
        value: (s, f) => f.pct(s.distribution.highRate),
        sub: (s, f) => `WER từ ${f.pct(s.distribution.highThreshold, 0)} trở lên`,
      },
    },
    over100: {
      title: 'Vì sao WER có thể lớn hơn 100%?',
      body: (s, f) =>
        `WER đếm cả những từ bị chèn thêm. Khi mô hình bị “lặp vòng” — nói đi nói lại một cụm từ — số từ chèn thêm có thể nhiều hơn cả câu gốc, nên WER vượt 100%. Câu tệ nhất dưới đây có WER ${f.pct(s.maxExampleWer, 1)}.`,
    },
    worst: {
      title: 'Những câu sai nhiều nhất',
      intro: (s, f) =>
        `${f.int(s.examples.length)} câu có WER cao nhất trong tập kiểm tra. Lời được giữ nguyên văn như trong dữ liệu, kể cả lỗi gõ.`,
      cols: { index: '#', province: 'Tỉnh', duration: 'Thời lượng', wer: 'WER', compare: 'So sánh' },
      compare: 'So sánh',
      compareFor: (e) => `câu ${e.index}`,
      reference: 'Câu gốc (người chép lời)',
      prediction: 'Mô hình nghe được',
      showFull: 'Hiện nguyên văn',
      showShort: 'Rút gọn',
      repeat: (count, f) => `lặp lại ${f.int(count)} lần`,
      repeatNote:
        'Các cụm từ lặp liên tiếp được gộp thành một nhãn kèm số lần lặp (×). Bấm “Hiện nguyên văn” để xem đúng như dữ liệu.',
    },
  },

  dataset: {
    heading: 'Dữ liệu và cách huấn luyện',
    intro: (s, f) =>
      `ViMD có ${f.int(s.splitTotals.utterances)} câu nói (${f.num(s.splitTotals.hours)} giờ) của người nói từ ${f.int(s.provinceCount)} tỉnh thành, chia sẵn thành ba tập.`,
    splits: {
      title: 'Ba tập dữ liệu',
      cols: ['Tập', 'Số câu', 'Số giờ', 'Người nói', `Dài hơn ${WHISPER_WINDOW_SEC} giây`],
      total: 'Tổng',
      notSummed: 'Không cộng dồn: một người có thể có mặt ở nhiều tập',
      note: (s, f) =>
        `Whisper chỉ nghe tối đa ${f.int(WHISPER_WINDOW_SEC)} giây mỗi đoạn, nên ${f.int(s.splitTotals.over30s)} đoạn dài hơn bị cắt còn ${f.int(WHISPER_WINDOW_SEC)} giây đầu.`,
      trainUsed: (s, f) =>
        `Huấn luyện dùng ${f.int(s.recipe.trainUtterancesUsed)} câu của tập huấn luyện (loại ${f.int(s.recipe.trainUtterancesDropped)} câu).`,
    },
    recipe: {
      title: 'Công thức huấn luyện',
      items: [
        { label: 'Mô hình gốc', value: (s) => s.model.id },
        {
          label: 'Tốc độ học',
          value: (s, f) =>
            `${sci(s.recipe.learningRate, f)}, lịch “${s.recipe.lrScheduler}”, khởi động ${f.int(s.recipe.warmupSteps)} bước`,
        },
        {
          label: 'Batch hiệu dụng',
          value: (s, f) =>
            `${f.int(s.recipe.effectiveBatchSize)} (${f.int(s.recipe.perDeviceBatchSize)} × ${f.int(s.recipe.gradientAccumulationSteps)} bước tích luỹ gradient)`,
        },
        {
          label: 'Số epoch',
          value: (s, f) =>
            `tối đa ${f.int(s.recipe.maxEpochs)}; dừng sớm sau ${f.int(s.recipe.earlyStoppingPatience)} lần đánh giá không cải thiện`,
        },
        { label: 'Đánh giá', value: (s, f) => `mỗi ${f.int(s.recipe.evalSteps)} bước` },
        {
          label: 'SpecAugment',
          value: (s, f) =>
            s.recipe.specAugment
              ? `bật (che thời gian: xác suất ${f.numFlex(s.recipe.maskTimeProb)}, độ dài ${f.int(s.recipe.maskTimeLength)})`
              : 'tắt',
        },
        {
          label: 'Weight decay · giới hạn gradient',
          value: (s, f) => `${f.numFlex(s.recipe.weightDecay)} · ${f.numFlex(s.recipe.maxGradNorm)}`,
        },
        { label: 'Đọc số thành chữ', value: (s) => (s.recipe.expandNumbers ? 'có' : 'không') },
        {
          label: 'Giải mã khi chấm cuối',
          value: (s, f) => `${s.model.beams}-beam, tối đa ${f.int(s.recipe.maxLabelTokens)} token`,
        },
        { label: 'Seed', value: (s, f) => f.int(s.recipe.seed) },
        {
          label: 'Thời gian',
          value: (s, f) => {
            const { start, end, spanMinutes, runtimeHours } = s.run
            const train = `huấn luyện ${f.num(runtimeHours, 1)} giờ`
            if (!start || !end || spanMinutes === null) return train
            return `${runDate(start, 'vi')} → ${runDate(end, 'vi')} (${spanText(spanMinutes, 'vi', f)}); ${train}`
          },
        },
      ],
    },
    environment: {
      title: 'Môi trường tính toán',
      items: [
        { label: 'GPU', value: (s, f) => `${s.environment.gpu} (${f.num(s.environment.gpuVramGb, 1)} GB)` },
        { label: 'CUDA · cuDNN', value: (s) => `${s.environment.cuda} · ${s.environment.cudnnVersion}` },
        { label: 'PyTorch', value: (s) => s.environment.torchVersion },
        { label: 'Transformers', value: (s) => s.environment.transformers },
        { label: 'Python', value: (s) => s.environment.python },
        {
          label: 'Phần cứng hỗ trợ',
          value: (s) =>
            `BF16: ${s.environment.bf16 ? 'hỗ trợ' : 'không hỗ trợ'} · TF32: ${s.environment.tf32 ? 'khả dụng' : 'không khả dụng'}`,
        },
      ],
    },
    normalization: {
      title: 'Chuẩn hoá văn bản trước khi chấm',
      intro: 'WER được tính trên cả văn bản thô và văn bản đã chuẩn hoá. Con số chính dùng bản chuẩn hoá.',
      raw: 'Bản thô',
      rawRule: 'Chỉ chuẩn Unicode NFC và gộp khoảng trắng.',
      normalized: 'Bản chuẩn hoá',
      rules: {
        'Unicode NFC': { text: 'Chuẩn Unicode NFC' },
        'lowercase (diacritics preserved)': { text: 'Viết thường, giữ nguyên dấu' },
        'canonical Vietnamese tone placement (hoà = hòa, thuý = thúy)': {
          text: 'Thống nhất vị trí dấu thanh',
          sample: 'hoà = hòa, thuý = thúy',
        },
        "% expanded to 'phan tram'": { text: 'Ký hiệu % đọc thành chữ', sample: '% → phần trăm' },
        'digit sequences expanded to Vietnamese number words': { text: 'Chữ số đọc thành chữ tiếng Việt' },
        'punctuation and symbols replaced by spaces': { text: 'Dấu câu và ký hiệu thay bằng khoảng trắng' },
        'whitespace collapsed': { text: 'Gộp khoảng trắng' },
      },
    },
  },

  team: {
    heading: 'Nhóm thực hiện',
    team: (team) => `Nhóm ${team}`,
    intro: 'Đề tài nghiên cứu khoa học của học sinh, phi thương mại.',
    mentor: 'Giáo viên hướng dẫn',
    members: 'Thành viên',
  },

  credits: {
    heading: 'Nguồn và giấy phép',
    intro: 'Trang web này dựa trên các công trình dưới đây. Xin cảm ơn các tác giả.',
    licence: 'Giấy phép',
    noLicence: 'Chưa ghi giấy phép',
    source: 'Trang gốc',
    cite: 'Trích dẫn',
    nonCommercial:
      'Đây là dự án học tập phi thương mại. Bộ dữ liệu ViMD dùng giấy phép CC BY-NC-ND 4.0: không dùng cho mục đích thương mại, không phân phối bản đã chỉnh sửa.',
    report: 'Báo cáo kỹ thuật đầy đủ (tiếng Anh)',
  },
}
