import type { Bilingual } from '@/core/lang'

/** Family-friendly riddles and jokes; each works in both languages. 'chat.joke' wraps its index modulo the length. */
export const JOKES: readonly Bilingual[] = [
  {
    vi: 'Tại sao robot không bao giờ biết sợ? Vì nó có thần kinh thép!',
    en: 'Why is a robot never scared? It has nerves of steel!',
  },
  {
    vi: 'Mình định kể chuyện cười về cục pin, nhưng tiếc quá, nó hết pin mất rồi!',
    en: 'I wanted to tell a battery joke, but it ran out of charge!',
  },
  {
    vi: 'Tại sao máy tính hay bị lạnh? Vì nó cứ để Windows, tức là cửa sổ, mở suốt!',
    en: 'Why do computers get cold? They leave their Windows open!',
  },
  {
    vi: 'Ông hỏi cháu: “Robot có biết ăn không?” Cháu đáp: “Có chứ ông, nó ăn… điện!”',
    en: 'Grandpa asked: “Can robots eat?” The kid said: “Sure, Grandpa. They eat… electricity!”',
  },
  {
    vi: 'Tại sao con cá không chơi bóng rổ? Vì nó sợ… lưới!',
    en: "Why don't fish play basketball? They're afraid of the net!",
  },
  {
    vi: 'Cái gì càng lau càng ướt? Cái khăn lau!',
    en: 'What gets wetter the more it dries? A towel!',
  },
  {
    vi: 'Cái gì có cổ mà không có đầu? Cái áo!',
    en: 'What has a neck but no head? A shirt!',
  },
  {
    vi: 'Cái gì đầy lỗ mà vẫn giữ được nước? Miếng bọt biển!',
    en: "What's full of holes but still holds water? A sponge!",
  },
  {
    vi: 'Cái gì của bạn mà người khác dùng nhiều hơn bạn? Cái tên của bạn!',
    en: 'What belongs to you, but other people use it more than you do? Your name!',
  },
  {
    vi: 'Robot hỏi đồng hồ: “Sao bạn chăm chỉ thế?” Đồng hồ đáp: “Tại mình lúc nào cũng phải chạy mà!”',
    en: 'The robot asked the clock: “Why do you work so hard?” The clock said: “I’m always running!”',
  },
  {
    vi: 'Tại sao robot thích đi biển? Để nạp năng lượng mặt trời đó!',
    en: 'Why does the robot love the beach? To recharge in the sunshine!',
  },
  {
    vi: 'Tháng nào có 28 ngày? Tháng nào cũng có 28 ngày hết!',
    en: 'Which month has 28 days? All of them!',
  },
  {
    vi: 'Cái gì cứ đi lên mà không bao giờ đi xuống? Tuổi của bạn!',
    en: 'What goes up but never comes down? Your age!',
  },
  {
    vi: 'Tại sao quyển sách toán lúc nào cũng buồn? Vì nó có quá nhiều… bài toán khó!',
    en: 'Why is the math book always sad? It has too many problems!',
  },
  {
    vi: 'Robot thích nghe nhạc gì nhất? Nhạc heavy metal, vì toàn là kim loại!',
    en: 'What music do robots like best? Heavy metal, of course!',
  },
]

export function jokeAt(index: number): Bilingual {
  const n = JOKES.length
  const i = Number.isFinite(index) ? ((Math.trunc(index) % n) + n) % n : 0
  return JOKES[i]!
}
