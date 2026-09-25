import { describe, expect, it } from 'vitest'
import type { Action } from '@/core/actions'
import type { ParseResult } from '@/core/parser'
import { DEFAULT_ROOM } from '@/core/room'
import { plan, plannedReplies } from '@/engine/planner'
import { renderReply } from '@/replies'
import { parseSync } from '../index'
import { X, type Case, type Expected } from './cases'
import { makeCtx, type CtxPatch } from './ctx'

/**
 * Regression table for the reviewer findings (SP/findings-nlu.md). Each group names the root cause;
 * every group mixes the reported inputs with near-miss inputs that must keep their old reading.
 */

const { c, j, wave, nod, walk, turn, timer, math, fan, unsup } = X

const parse = (text: string, p?: CtxPatch): ParseResult => parseSync(text, makeCtx(p))

function shape(a: Action): Expected {
  if (a.type === 'weather')
    return { type: 'weather', place: a.place?.id ?? null, dayOffset: a.dayOffset, aspect: a.aspect }
  return a
}

const FLY = unsup('physical', ['bay', 'fly'], undefined, { type: 'jump', count: 1 })

// ---------------------------------------------------------------------------------------- R1
/** Number words: "sau" (after) is not sáu, number words are never fuzzed, chục, glued units. */
const NUMBERS: Case[] = [
  // accented "sau" is always "after"; the number that follows is kept whole
  c('nhắc tôi uống thuốc sau mười lăm phút', [timer(900, 'uống thuốc')]),
  c('nhắc tôi uống thuốc sau mười phút', [timer(600, 'uống thuốc')]),
  c('cháu ơi nhắc bà uống thuốc sau mười lăm phút nữa nha', [timer(900, 'uống thuốc')]),
  c('robot ơi con nhắc bà uống thuốc huyết áp sau ba mươi phút nữa nhé', [timer(1800, 'uống thuốc')]),
  c('nhắc tôi sau bốn mươi phút uống thuốc', [timer(2400, 'uống thuốc')]),
  c('hẹn giờ sau năm phút', [timer(300)]),
  c('sau hai phút nhắc tôi uống thuốc', [timer(120, 'uống thuốc')]),
  c('nhắc tôi uống thuốc sau năm phút', [timer(300, 'uống thuốc')]),
  c('sau năm phút nữa nhắc tôi uống thuốc', [timer(300, 'uống thuốc')]),
  c('sau bốn phút nhắc tôi', [timer(240)]),
  c('nhắc tôi nấu cơm sau một tiếng', [timer(3600, 'nấu cơm')]),
  c('nhắc tôi đi chợ sau một tiếng', [timer(3600, 'đi chợ')]),
  c('nhắc tôi sau hai tiếng', [timer(7200)]),
  c('nhắc bà đo huyết áp sau hai mươi phút', [timer(1200, 'đo huyết áp')]),
  c('nhắc tôi đo huyết áp sau ba mươi phút', [timer(1800, 'đo huyết áp')]),
  c('hẹn giờ sau ba mươi giây', [timer(30)]),
  c('nhắc tui đi ngủ sau mười phút', [timer(600, 'đi ngủ')]),
  c('nhắc tau uống thuốc sau mười phút nghe', [timer(600, 'uống thuốc')]),
  c('nhắc tui uống thuốc sau hai mươi phút', [timer(1200, 'uống thuốc')]),
  c('nhắc tau nấu cơm sau hai mươi phút', [timer(1200, 'nấu cơm')]),
  c('nhắc tôi uống thuốc sau một tiếng', [timer(3600, 'uống thuốc')]),
  c('nhắc mệ uống thuốc sau năm phút', [timer(300, 'uống thuốc')]),
  c('nhắc tui uống nác sau năm phút', [timer(300, 'uống nước')]),
  c('báo tui sau năm phút', [timer(300)]),
  c('nhắc tui uống thuốc trong năm phút', [timer(300, 'uống thuốc')]),
  c('lùi ra sau hai bước', [walk('backward', 2)]),
  c('lùi về phía sau hai bước', [walk('backward', 2)]),
  // no diacritics: "sau" + a number + a unit is "after N units"
  c('nhac toi uong thuoc sau muoi lam phut', [timer(900, 'uống thuốc')]),
  c('nhac tau uong thuoc sau hai muoi phut', [timer(1200, 'uống thuốc')]),
  c('nhac toi uong thuoc sau mot tieng', [timer(3600, 'uống thuốc')]),
  c('nhac tau uong thuoc sau muoi phut nghe', [timer(600, 'uống thuốc')]),
  c('hen gio sau muoi phut', [timer(600)]),
  c('sau muoi phut nua nhac tui', [timer(600)]),
  c('nhac tau uong thuoc sau nam phut', [timer(300, 'uống thuốc')]),
  c('nhac toi sau muoi phut', [timer(600)]),
  c('hen gio sau hai muoi phut', [timer(1200)]),
  c('nhac tui don chau sau hai chuc phut', [timer(1200, 'đón cháu')]),
  c('lui ra sau hai buoc', [walk('backward', 2)]),
  // "bay" is fly in accented text, never bảy
  c('mi bay hai vòng coi', [FLY]),
  c('bay ba vòng', [FLY]),
  // number words are never rewritten into verbs
  c('nhảy tám', [j(8)]),
  c('gật đầu tám', [nod(8)]),
  c('nhảy bảy', [j(7)]),
  c('nhảy năm', [j(5)]),
  c('vẫy tay bảy', [wave(7)]),
  c('tám', [], { unknown: true }),
  c('bảy', [], { unknown: true }),
  c('tám chục cộng hai chục', [math([80, '+', 20], 100)]),
  c('một chục cộng năm', [math([10, '+', 5], 15)]),
  // chục = ten
  c('hẹn giờ chục phút', [timer(600)]),
  c('hen gio mot chuc phut', [timer(600)]),
  c('nhảy hai chục lần', [j(10)], { notes: ['capped'] }),
  c('nhảy một chục cái', [j(10)]),
  c('đi chục bước', [walk('forward', 10)]),
  // "hai mười" (ASR/typing) = hai mươi; bare "tiếng rưỡi" = 1.5 h
  c('hẹn giờ hai mười phút', [timer(1200)]),
  c('năm mười cộng năm', [math([50, '+', 5], 55)]),
  c('hẹn giờ tiếng rưỡi', [timer(5400)]),
  c('tiếng rưỡi nữa nhắc tôi', [timer(5400)]),
  // a digit glued to its unit
  c('nhắc tôi uống thuốc sau 5phút', [timer(300, 'uống thuốc')]),
  c('nhac toi uong thuoc sau 10phut', [timer(600, 'uống thuốc')]),
  c('hẹn giờ 5phút', [timer(300)]),
  c('hen gio 10phut', [timer(600)]),
  c('dem nguoc 30giay', [timer(30)]),
  c('nhảy 3lần', [j(3)]),
  c('nhay 3lan', [j(3)]),
  c('vay tay 2lan', [wave(2)]),
  c('xoay 3vong', [turn('spin', 3)]),
  c('quay trai 2vong', [turn('spin', 2)]),
  c('quat so3', [fan({ power: 'on', speed: 3 })]),
  // "h" for giờ outside "5h"
  c('mấy h rồi', [X.time]),
  c('may h roi', [X.time]),
  c('may h r', [X.time]),
  c('bây h mấy h', [X.time]),
  c('hen gio 1 h', [timer(3600)]),
  // near misses that must not change
  c('nhắc tôi uống thuốc sau 15 phút', [timer(900, 'uống thuốc')]),
  c('muoi lam phut nua nhac toi uong thuoc', [timer(900, 'uống thuốc')]),
  c('nhay sau lan', [j(6)]),
  c('hẹn giờ sáu phút', [timer(360)]),
  c('hen gio sau phut', [timer(360)]),
  c('nhảy hai ba lần', [j(3)]),
  c('sáu mươi cộng hai', [math([60, '+', 2], 62)]),
  c('sau muoi cong hai', [math([60, '+', 2], 62)]),
  c('hẹn giờ 1 tiếng 30 phút', [timer(5400)]),
  c('hẹn giờ mười phút', [timer(600)]),
  c('hẹn giờ 5h', [timer(18000)]),
  c('nhảy 8', [j(8)]),
  c('bay lên trời đi', [FLY]),
  c('5 nhân không', [math([5, '*', 0], 0)]),
  c('hai mươi mốt cộng một', [math([21, '+', 1], 22)]),
]

// ---------------------------------------------------------------------------------------- R2 / R3
const T1 = { timers: [{ id: 't1', endsAt: 0 }] }
const cancel = (label?: string): Expected =>
  label ? { type: 'timer_cancel', label } : { type: 'timer_cancel' }
const ask = (label?: string): Expected =>
  label ? { type: 'clarify', need: 'timer_duration', label } : { type: 'clarify', need: 'timer_duration' }
const clock = (label?: string): Expected =>
  label ? { type: 'clarify', need: 'clock_time', label } : { type: 'clarify', need: 'clock_time' }
const later = (device: 'light' | 'fan', power: 'on' | 'off'): Expected => ({
  type: 'clarify',
  need: 'device_later',
  device,
  power,
})

/** A timer request with tắt/dừng/bỏ in its label is a new timer, never "cancel every timer". */
const TIMER_VERBS: Case[] = [
  c('hẹn giờ mười phút tắt bếp', [timer(600, 'tắt bếp')], { ctx: T1 }),
  c('hẹn giờ tắt bếp sau 10 phút', [timer(600, 'tắt bếp')], { ctx: T1 }),
  c('hẹn giờ 10 phút để tắt bếp', [timer(600, 'tắt bếp')], { ctx: T1 }),
  c('đặt hẹn giờ 20 phút tắt bếp nhé', [timer(1200, 'tắt bếp')], { ctx: T1 }),
  c('bà muốn hẹn giờ mười lăm phút để tắt bếp', [timer(900, 'tắt bếp')], { ctx: T1 }),
  c('hẹn giờ tắt nồi 15 phút', [timer(900, 'tắt nồi')], { ctx: T1 }),
  c('hẹn giờ bỏ thuốc vào nồi 5 phút', [timer(300)], { ctx: T1 }),
  c('hẹn giờ dừng nấu sau 5 phút', [timer(300)], { ctx: T1 }),
  c('hẹn giờ 5 phút tắt bếp', [timer(300, 'tắt bếp')]),
  c('đặt hẹn giờ 5 phút để tắt bếp', [timer(300, 'tắt bếp')]),
  c('hẹn giờ 5 phút nhắc tôi tắt bếp', [timer(300, 'tắt bếp')]),
  c('hẹn giờ 20 phút tắt nồi cơm', [timer(1200, 'tắt nồi')]),
  // the room's own lamp / fan cannot be scheduled yet: say so, switch nothing
  c('hẹn giờ 10 phút tắt đèn', [later('light', 'off')], { ctx: T1 }),
  c('hẹn giờ 30 phút tắt quạt', [later('fan', 'off')], { ctx: T1 }),
  c('hẹn giờ tắt quạt 30 phút', [later('fan', 'off')], { ctx: T1 }),
  c('hẹn giờ 5 phút nhắc bà tắt quạt', [later('fan', 'off')], { ctx: T1 }),
  // cancelling still works when the verb governs the timer word
  c('hủy hẹn giờ', [cancel()], { ctx: T1 }),
  c('tắt hẹn giờ', [cancel()], { ctx: T1 }),
  c('tắt báo thức đi', [cancel()], { ctx: T1 }),
  c('hủy báo thức', [cancel()], { ctx: T1 }),
  c('xóa hẹn giờ', [cancel()], { ctx: T1 }),
  c('dừng hẹn giờ', [cancel()], { ctx: T1 }),
  c('bỏ hẹn giờ đi', [cancel()], { ctx: T1 }),
  c('hủy hẹn giờ 5 phút', [cancel()], { ctx: T1 }),
  c('hủy cái hẹn giờ', [cancel()], { ctx: T1 }),
  c('dẹp hẹn giờ đi', [cancel()], { ctx: T1 }),
  c('dẹp cái hẹn giờ', [cancel()], { ctx: T1 }),
  c('huy hen gio', [cancel()], { ctx: T1 }),
  // …and cancels only that reminder when a label is named
  c('hủy nhắc uống thuốc', [cancel('uống thuốc')], { ctx: T1 }),
  c('hủy hẹn giờ uống thuốc', [cancel('uống thuốc')], { ctx: T1 }),
  c('tắt nhắc nhở uống thuốc đi', [cancel('uống thuốc')], { ctx: T1 }),
  c('đừng nhắc tôi uống thuốc nữa', [cancel('uống thuốc')], { ctx: T1 }),
  c('không cần nhắc nữa', [cancel()], { ctx: T1 }),
  c('hẹn giờ còn bao lâu', [{ type: 'timer_status' }]),
]

/** A reminder or timer without a duration asks for one; a clock time is answered honestly. */
const REMINDERS: Case[] = [
  c('nhắc tôi uống thuốc', [ask('uống thuốc')]),
  c('nhắc bà uống thuốc', [ask('uống thuốc')]),
  c('chút nữa nhắc bà uống thuốc', [ask('uống thuốc')]),
  c('lát nữa nhắc tôi uống thuốc', [ask('uống thuốc')]),
  c('nhắc tôi đi ngủ', [ask('đi ngủ')]),
  c('nhắc tôi tắt bếp', [ask('tắt bếp')]),
  c('nhắc tôi gọi điện cho con', [ask('gọi điện')]),
  c('nhắc tui uống thuốc', [ask('uống thuốc')]),
  c('nhắc tui uống thuốc nghen', [ask('uống thuốc')]),
  c('nhac tui uong thuoc nghen', [ask('uống thuốc')]),
  c('nhac toi uong thuoc', [ask('uống thuốc')]),
  c('hẹn giờ uống thuốc', [ask('uống thuốc')]),
  c('hẹn giờ', [ask()]),
  c('nhắc tôi', [ask()]),
  // wake-up reminders
  c('đánh thức tôi', [ask('thức dậy')]),
  c('đánh thức tôi sau 20 phút', [timer(1200, 'thức dậy')]),
  c('đánh thức bà dậy sau mười phút', [timer(600, 'thức dậy')]),
  c('gọi tôi dậy sau 30 phút', [timer(1800, 'thức dậy')]),
  c('gọi tui dậy sau 30 phút', [timer(1800, 'thức dậy')]),
  c('kêu tui dậy sau 10 phút', [timer(600, 'thức dậy')]),
  c('kêu tui dậy', [ask('thức dậy')]),
  c('5 phút nữa kêu tui', [timer(300)]),
  c('gọi tau dậy sau 30 phút', [timer(1800, 'thức dậy')]),
  c('goi tau day sau 30 phut', [timer(1800, 'thức dậy')]),
  c('kêu tau dậy sau ba mươi phút', [timer(1800, 'thức dậy')]),
  c('10 phút nữa kêu tau dậy', [timer(600, 'thức dậy')]),
  c('kêu mệ dậy sau mười phút', [timer(600, 'thức dậy')]),
  c('gọi mệ dậy sau 10 phút', [timer(600, 'thức dậy')]),
  c('báo tau sau năm phút', [timer(300)]),
  c('mười phút nữa kêu tau', [timer(600)]),
  c('báo bà sau 10 phút', [timer(600)]),
  // clock times are not durations
  c('nhắc tôi lúc 9 giờ uống thuốc', [clock('uống thuốc')]),
  c('đặt báo thức lúc 6 giờ sáng', [clock()]),
  c('báo thức 6h sáng mai', [clock()]),
  c('hẹn giờ 5 giờ chiều', [clock()]),
  c('nhắc bà 7 giờ tối uống thuốc', [clock('uống thuốc')]),
  c('nhắc bà uống thuốc lúc 8 giờ tối', [clock('uống thuốc')]),
  c('nhắc tôi uống thuốc lúc 8h', [clock('uống thuốc')]),
  c('nhắc tôi nấu cơm lúc năm giờ', [clock('nấu cơm')]),
  c('hẹn giờ lúc mười giờ', [clock()]),
  c('đánh thức tôi lúc 5 giờ', [clock('thức dậy')]),
  c('đặt báo thức 6 giờ', [clock()]),
  c('nhac toi uong thuoc luc 9 gio toi', [clock('uống thuốc')]),
  // durations stay durations
  c('nhắc tôi sau 5h', [timer(18000)]),
  c('5h nữa nhắc tôi uống thuốc', [timer(18000, 'uống thuốc')]),
  c('đặt báo thức sau 30 phút', [timer(1800)]),
  c('hẹn giờ 1 giờ 30 phút', [timer(5400)]),
  c('hai tiếng rưỡi nữa nhắc tôi đi đón cháu', [timer(9000, 'đón cháu')]),
  c('nhắc tôi đón cháu sau 1 tiếng', [timer(3600, 'đón cháu')]),
  // a delayed lamp / fan command switches nothing and says so
  c('tắt quạt sau 30 phút', [later('fan', 'off')], { ctx: { fanOn: true } }),
  c('30 phút nữa tắt quạt nhé', [later('fan', 'off')], { ctx: { fanOn: true } }),
  c('tắt đèn sau 10 phút', [later('light', 'off')], { ctx: { lightOn: true } }),
  c('bật đèn sau 5 phút', [later('light', 'on')]),
  c('tắt đèn', [X.light('off')]),
  c('chạy 10 giây', [X.run(10)]),
]

/** Several timers, labels in other positions, commas. */
const TIMERS_MORE: Case[] = [
  c('hẹn giờ 1 phút hẹn giờ 2 phút', [timer(60), timer(120)]),
  c('hẹn giờ 1 phút và hẹn giờ 2 phút', [timer(60), timer(120)]),
  c('nhắc tôi uống thuốc sau 5 phút và tắt bếp sau 10 phút', [
    timer(300, 'uống thuốc'),
    timer(600, 'tắt bếp'),
  ]),
  c('uống thuốc, nhắc tôi sau 10 phút', [timer(600, 'uống thuốc')]),
  c('còn bao lâu nữa đến giờ uống thuốc', [{ type: 'timer_status' }], { ctx: T1 }),
  c('bao lâu nữa thì uống thuốc', [{ type: 'timer_status' }], { ctx: T1 }),
  c('hẹn giờ, 5 phút', [timer(300)]),
  c('nhảy, ba lần', [j(3)]),
  c('nhảy,ba,lần', [j(3)]),
  c('bật đèn, màu đỏ', [X.light('on', 'red')]),
  // near misses: a comma before a real command still splits
  c('thôi, nhảy đi', [X.stop, j()]),
  c('mấy giờ rồi, nhảy 2 cái đi', [X.time, j(2)]),
  c('còn bao nhiêu ngày nữa đến tết', [X.lunar('tet')]),
]

/** Tones are phonemic: a correctly accented word is never "corrected" into another word. */
const FUZZY: Case[] = [
  c('bà đói bụng', [], { unknown: true }),
  c('tim bà đập nhanh quá', [], { unknown: true }),
  c('bà khát nước', [], { unknown: true }),
  c('chìa khóa bà để đâu rồi', [], { unknown: true }),
  c('dắt bà đi dạo', [walk()]),
  c('cuối tuần này thời tiết thế nào', [X.wx(null)]),
  c('thời tiết Vũng Tàu cuối tuần', [X.wx('VungTau')]),
  c('vặn quạt số ba', [fan({ power: 'on', speed: 3 })]),
  c('mấy giờ mặt trời mọc', [X.time]),
  c('đầu tiên nhảy rồi vẫy tay cuối cùng gật đầu', [j(), wave(), nod()]),
  c('có nên mang áo mưa không', [X.wx(null, 0, 'rain')]),
  c('rằm tháng giêng', [{ type: 'lunar', query: 'ram', dayOffset: 0, month: 1 }]),
  // Southern exclamations are fillers
  c('chèn ơi', [], { unknown: true }),
  c('chèn ơi nóng dữ', [fan({ power: 'on' })]),
  c('chèn đét ơi', [], { unknown: true }),
  c('mèn đét ơi', [], { unknown: true }),
  c('trời đất ơi', [], { unknown: true }),
  c('trời ơi đất hỡi', [], { unknown: true }),
  c('quá trời quá đất', [], { unknown: true }),
  c('trời đất ơi tối quá', [X.light('on')]),
  c('mấy đứa nhảy coi', [j()]),
  c('dở òm', [{ type: 'insult' }]),
  c('đèn đỏ chót', [X.light('on', 'red')]),
  c('chói quá', [], { unknown: true }),
  c('thụt lùi', [walk('backward')]),
  c('đi thụt lùi', [walk('backward')]),
  c('hổm rày khỏe hông', [X.small('how_are_you')]),
  c('thiệt tình', [], { unknown: true }),
  // numb "tê" and the Huế particle "tề" never make the robot fall
  c('bà bị tê chân quá', [], { unknown: true }),
  c('chân bị tê', [], { unknown: true }),
  c('tay tui tê rần', [], { unknown: true }),
  c('mấy giờ rồi tề', [X.time]),
  c('nhảy đi tề', [j()]),
  c('bật đèn lên tề', [X.light('on')]),
  // a capitalised name is a name
  c('o Lan ơi mấy giờ rồi', [X.time]),
  c('cô Lan ơi mấy giờ rồi', [X.time]),
  c('chị Lan ơi mấy giờ rồi', [X.time]),
  c('choa muốn nghe chuyện cười', [{ type: 'joke' }]),
  c('choa hỏi mấy giờ rồi', [X.time]),
  c('nhắc choa đi ngủ sau mười phút', [timer(600, 'đi ngủ')]),
  // hỏi / ngã / nặng merges and consonant merges still map
  c('nhãy', [j()]),
  c('nhãy đi', [j()]),
  c('nhãy ba lần', [j(3)]),
  c('nhãy 3 lần', [j(3)]),
  c('nhạy 3 lần', [j(3)]),
  c('nhạy ba cái', [j(3)]),
  c('nhãy ba cái đi', [j(3)]),
  c('bật quặt', [fan({ power: 'on' })]),
  c('mở đèng lêng coi', [X.light('on')]),
  c('vẩy tay', [wave()]),
  c('tắc đèn', [X.light('off')]),
  c('bậc quạt', [fan({ power: 'on' })]),
  c('dẫy tay', [wave()]),
  c('bật wạt', [fan({ power: 'on' })]),
  c('gậc đầu ba lần', [nod(3)]),
  // no diacritics: the no-diacritics reading of the DP wins over a refusal alternative
  c('mua di', [X.dance()]),
  c('mua nhe', [X.dance()]),
  c('mua di ban', [X.dance()]),
  c('mua cho tui coi', [X.dance()]),
  c('mua cho me coi', [X.dance()]),
  c('mua chuoi', [unsup('physical', ['mua', 'buy'], ['chuối', 'a banana'])]),
  c('cuoi di', [X.emote('happy')]),
  c('den mau nau', [], { unknown: true }),
  // a tone mark left out of a non-word, or a slip inside a longer phrase, is still understood
  c('bât đèn', [X.light('on')]),
  c('thơi tiết', [X.wx(null)]),
  c('thoi tiêt', [X.wx(null)]),
  c('mây giờ rồi', [X.time]),
  c('lăc đầu', [X.shake()]),
  c('mụa một bài', [X.dance()]),
  c('hẹn giờ năm phúc', [timer(300)]),
  c('hẹn giờ 5 fút', [timer(300)]),
  c('bật đèn màu hồn', [X.light('on', 'pink')]),
  c('bật đèn xăn lá', [X.light('on', 'green')]),
  c('đầu tiên nhảy rồi vẫy tay', [j(), wave()]),
  c('coi chừng té', [X.not('fall')]),
  c('choc tui cuoi coi', [{ type: 'joke' }]),
  c('hủy dùm cái hẹn giờ', [cancel()], { ctx: T1 }),
  c('hủy hết hẹn giờ', [cancel()], { ctx: T1 }),
  c('thôi khỏi hẹn giờ nữa', [cancel()], { ctx: T1 }),
  c('thôi không hẹn giờ nữa', [cancel()], { ctx: T1 }),
  c('đừng hẹn giờ', [{ type: 'ack_negation', target: 'timer_start' }]),
  // repeated letters (R16)
  c('nhayyy 3 lannn', [j(3)]),
  c('nhảyyy đi', [j()]),
]

const SOS: Expected = { type: 'emergency' }
/** A user reporting a fall or an emergency: a serious answer, never the fall gag; tỉnh = province. */
const EMERGENCY: Case[] = [
  c('bà bị ngã rồi', [SOS]),
  c('bà té rồi con ơi', [SOS]),
  c('tôi bị ngã', [SOS]),
  c('tôi té', [SOS]),
  c('ông ngã rồi', [SOS]),
  c('cứu tôi với', [SOS]),
  c('cứu với', [SOS]),
  c('cứu bà với', [SOS]),
  c('bà cần gọi cấp cứu', [SOS]),
  c('gọi cấp cứu', [SOS]),
  c('tôi đau ngực', [SOS]),
  c('khó thở quá', [SOS]),
  c('cháy nhà', [SOS]),
  c('cuu toi voi', [SOS]),
  // robot commands still play the fall
  c('giả chết', [X.fall]),
  c('ngã xuống đi', [X.fall]),
  c('nằm xuống', [X.fall]),
  c('giả vờ ngã đi', [X.fall]),
  // "tỉnh" before a place is the province
  c('thời tiết tỉnh Quảng Nam', [X.wx('QuangNam')]),
  c('thời tiết tỉnh Nghệ An', [X.wx('NgheAn')]),
  c('thời tiết tỉnh Cần Thơ ngày mai', [X.wx('CanTho', 1)]),
  c('tỉnh Quảng Ngãi có mưa không', [X.wx('QuangNgai', 0, 'rain')]),
  c('ở tỉnh Bình Định hôm nay nóng không', [X.wx('BinhDinh', 0, 'temp')]),
  c('tỉnh dậy đi', [X.wake], { ctx: { posture: 'sleeping' } }),
]

const sadNo: Expected = { type: 'ack_negation', target: 'emote', emotion: 'sad' }
const angryNo: Expected = { type: 'ack_negation', target: 'emote', emotion: 'angry' }
const WHO = X.intro('who')
const HOWRU = X.small('how_are_you')
/** No-diacritics homographs are resolved by their neighbours; "dừng/đừng X" never performs X. */
const ASCII_CONTEXT: Case[] = [
  c('lam gi do', [], { unknown: true }),
  c('ban lam gi vay', [], { unknown: true }),
  c('lam chi rua', [], { unknown: true }),
  c('lam on bat den', [X.light('on')]),
  c('den mau lam', [X.light('on', 'blue')]),
  c('ten cua ban la gi', [WHO]),
  c('bat den cua phong', [X.light('on')]),
  c('bat quat cua toi', [fan({ power: 'on' })]),
  c('mo hinh cua ban la gi', [X.intro('project')]),
  c('te qua', [{ type: 'insult' }]),
  c('ban te qua', [{ type: 'insult' }]),
  c('thoi tiet mien nam', [X.wx(null)]),
  c('nhay cao hon', [j()]),
  c('lau qua', [], { unknown: true }),
  c('sao lau vay', [], { unknown: true }),
  c('ban ngu qua', [{ type: 'insult' }]),
  c('ngu di', [X.sleep]),
  c('nam xuong', [X.fall]),
  c('hong bat den', [X.not('light')]),
  c('hong can bat quat', [X.not('fan')]),
  c('hong tat quat', [X.not('fan')], { ctx: { fanOn: true } }),
  c('hong nhay nua', [X.stop], { ctx: { activity: 'dancing' } }),
  c('khoe hong', [HOWRU]),
  c('ban khoe hong', [HOWRU]),
  c('KHOE HONG', [HOWRU]),
  c('mo den duoc hong', [X.light('on')]),
  c('nhay duoc hong', [j()]),
  c('mai troi mua hong', [X.wx(null, 1, 'rain')]),
  c('den mau hong', [X.light('on', 'pink')]),
  c('dung nhay', [X.not('jump')]),
  c('dung tat den', [X.not('light')], { ctx: { lightOn: true } }),
  c('dung bat quat', [X.not('fan')]),
  c('dung bat den nha', [X.not('light')]),
  c('dung ngu', [X.not('sleep')]),
  c('dung chay nua', [X.stop], { ctx: { activity: 'dancing' } }),
  c('dung lai', [X.stop], { ctx: { activity: 'walking' } }),
  c('dừng nhảy', [X.stop]),
  c('dừng nhảy đi', [X.stop]),
  c('dừng múa lại', [X.stop], { ctx: { activity: 'dancing' } }),
  c('dừng nhảy', [X.stop], { ctx: { activity: 'dancing' } }),
  c('dung mua nua', [X.stop], { ctx: { activity: 'dancing' } }),
  c('tắt đèn ngay lập tức', [X.light('off')], { ctx: { lightOn: true } }),
  c('tat den ngay lap tuc', [X.light('off')], { ctx: { lightOn: true } }),
  c('bật quạt lập tức', [fan({ power: 'on' })]),
  c('vui lòng bật đèn', [X.light('on')]),
  c('tức cười quá', [{ type: 'praise' }]),
  c('tía ơi', [], { unknown: true }),
  c('tía tui đâu', [], { unknown: true }),
  c('đèn màu tía', [X.light('on', 'purple')]),
  c('vẫy tay chào ba đi', [wave()]),
  c('vay tay chao ba di', [wave()]),
  c('vẫy tay ba lần', [wave(3)]),
  // why don't you X? is a request; a negated emotion keeps its emotion
  c('răng mi không nhảy', [j()]),
  c('răng không bật đèn', [X.light('on')]),
  c('rang khong bat den', [X.light('on')]),
  c('sao bạn không nhảy', [j()]),
  c('đừng khóc', [sadNo]),
  c('đừng buồn nữa', [sadNo]),
  c('đừng giận bà nhé', [angryNo]),
  c('đừng giận tau nghe', [angryNo]),
  c('đừng nhảy', [X.not('jump')]),
  c('đừng nhảy nữa', [X.stop], { ctx: { activity: 'dancing' } }),
  c('thoi hong mua nua', [X.stop], { ctx: { activity: 'dancing' } }),
  c('hon toi', [unsup('physical', ['ôm', 'hug'], undefined, { type: 'wave', count: 1 })]),
  c('troi co mua khong', [X.wx(null, 0, 'rain')]),
  c('mai mua khong', [X.wx(null, 1, 'rain')]),
  c('hom nay mua khong', [X.wx(null, 0, 'rain')]),
  c('mua mot bai cho ba xem', [X.dance()]),
]

/** Central and Southern words, with or without diacritics. */
const DIALECTS: Case[] = [
  c('chu may gio roi rua', [X.time]),
  c('bay chu may gio', [X.time]),
  c('bay chu la may gio roi', [X.time]),
  c('den o mo', [], { unknown: true }),
  c('quat o mo', [], { unknown: true }),
  c('đèn ở mo', [], { unknown: true }),
  c('den mo', [], { unknown: true }),
  c('mi ten chi', [WHO]),
  c('mi ten la chi rua', [WHO]),
  c('ten chi', [WHO]),
  c('mi la ai rua', [WHO]),
  c('mi uong nac di', [unsup('physical', X.DRINK, ['nước', 'water'])]),
  c('tat den di mi', [X.light('off')], { ctx: { lightOn: true } }),
  c('bat quat len cho tau', [fan({ power: 'on' })]),
  c('den te tat di', [X.light('off')], { ctx: { lightOn: true } }),
  c('bat cai den te len', [X.light('on')]),
  c('bật đèn lên đi o', [X.light('on')]),
  c('bật đèn lên đi ả', [X.light('on')]),
  c('bật đèn lên đi ôn', [X.light('on')]),
  c('bật đèn lên đi eng', [X.light('on')]),
  c('bật đèn lên đi mạ', [X.light('on')]),
  c('bật đèn lên đi bọn', [X.light('on')]),
  c('bật đèn lên đi nì', [X.light('on')]),
  c('bật đèn lên đi mà', [X.light('on')]),
  c('bat den len di o', [X.light('on')]),
  c('nhảy đi bọ', [j()]),
  c('bật quạt đi bọ', [fan({ power: 'on' })]),
  c('mấy giờ rồi hí', [X.time]),
  c('mấy giờ rồi chơ', [X.time]),
  c('mấy giờ rồi ôn', [X.time]),
  c('mấy giờ rồi mạ', [X.time]),
  c('mấy giờ rồi bây', [X.time]),
  c('mấy giờ rồi đa', [X.time]),
  c('mấy giờ rồi hầy o', [X.time]),
  c('mấy giờ rồi nờ', [X.time]),
  c('bựa qua là thứ mấy', [X.weekday(-1)]),
  c('bựa qua là ngày mấy', [X.date(-1)]),
  c('bua qua la thu may', [X.weekday(-1)]),
  c('thời tiết Quảng Nôm', [X.wx('QuangNam')]),
  c('hẹn giờ tóm phút', [timer(480)]),
  c('hẹn giờ nôm phút', [timer(300)]),
  c('hẹn giờ mừi phút', [timer(600)]),
  c('hẹn giờ hai mưi phút', [timer(1200)]),
  c('nhắc tui uống thuốc sau mừi phút', [timer(600, 'uống thuốc')]),
  c('nhắc tui uống thuốc sau mời phút', [timer(600, 'uống thuốc')]),
  c('nhắc tui úng thúc sau mừi phút', [timer(600, 'uống thuốc')]),
  c('nói tíng anh đi', [{ type: 'set_language', lang: 'en' }]),
  c('thời tít hôm nay', [X.wx(null)]),
  c('mi bít làm chi', [{ type: 'capabilities' }]),
  c('ở Đà Nẵng mai có mơ không', [X.wx('DaNang', 1, 'rain')]),
  c('mi eng chuối đi', [unsup('physical', X.EAT, ['chuối', 'a banana'])]),
  c('tên dì', [WHO]),
  c('mày làm được dì', [{ type: 'capabilities' }]),
  c('mấy giờ rồi dợ', [X.time]),
  c('sao dợ', [], { unknown: true }),
  c('bi nhiu tuổi', [X.intro('age')]),
  c('hai cộng ba bằng nhiu', [math([2, '+', 3], 5)]),
  c('cảm ơn bạn nhìu', [{ type: 'thanks' }]),
  c('cam on ban nhiu', [{ type: 'thanks' }]),
  c('dề chỗ cũ', [walk('home')]),
  c('dìa nhà', [walk('home')]),
  c('dia cho cu di', [walk('home')]),
  c('kể chiện cười', [{ type: 'joke' }]),
  c('cừi lên', [X.emote('happy')]),
  c('dẫy tay dới tui', [wave()]),
  c('gồi xuống', [X.sit]),
  c('wẹo trái', [turn('left')]),
  c('tết là bữa mô', [X.lunar('tet')]),
  c('mở cấy đèn lên coi', [X.light('on')]),
]

/** Compounds, walking / turning phrases, the fan's own motion. */
const PHRASES: Case[] = [
  c('đọc tin tức cho bà nghe', [unsup('out_of_scope', ['đọc', 'read'], undefined, { type: 'joke' })]),
  c('bà muốn nghe tin tức', [], { unknown: true }),
  c('mắt bà kém lắm', [], { unknown: true }),
  c('máy bay', [], { unknown: true }),
  c('bà thích máy bay', [], { unknown: true }),
  c('dạo này con thế nào', [HOWRU]),
  c('dạo này sao', [HOWRU]),
  c('dạo này sao rồi bạn', [HOWRU]),
  c('dao nay sao roi', [HOWRU]),
  c('dao nay khoe khong', [HOWRU]),
  c('mi đi mô rứa', [], { unknown: true }),
  c('đi đâu vậy', [], { unknown: true }),
  c('bạn đi đâu vậy', [], { unknown: true }),
  c('đi vào đây', [walk('to_user')]),
  c('đi đến đây', [walk('to_user')]),
  c('đi dô đây', [walk('to_user')]),
  c('di zo day', [walk('to_user')]),
  c('đi ra phía sau ba bước', [walk('backward', 3)]),
  c('bước lui hai bước', [walk('backward', 2)]),
  c('cho quạt chạy số hai', [fan({ power: 'on', speed: 2 })]),
  c('quạt quay chậm lại', [fan({ speedDelta: -1 })], { ctx: { fanOn: true } }),
  c('quạt chạy số 1', [fan({ power: 'on', speed: 1 })]),
  c('bật quạt chạy', [fan({ power: 'on' })]),
  c('quẹo phải ba bước', [walk('right', 3)]),
  c('rẽ phải ba bước', [walk('right', 3)]),
  // near misses
  c('quẹo phải đi hai bước', [turn('right'), walk('forward', 2)]),
  c('đồ ngốc', [{ type: 'insult' }]),
  c('đi chơi', [walk()]),
  c('lùi lại hai bước', [walk('backward', 2)]),
]

const CALL: [string, string] = ['gọi điện', 'make phone calls']
const MASSAGE: [string, string] = ['xoa bóp', 'give massages']
const GO_OUT: [string, string] = ['đi ra ngoài', 'go out']
/** Everyday things the robot cannot do are refused (never a wrong motion). */
const REFUSALS: Case[] = [
  c('gọi cho con gái bà', [unsup('out_of_scope', CALL)]),
  c('gọi con gái bà về', [unsup('out_of_scope', CALL)]),
  c('pha trà cho bà', [unsup('physical', ['pha đồ uống', 'make drinks'])]),
  c('pha cho bà ly trà', [unsup('physical', ['pha', 'make'], ['trà', 'tea'])]),
  c('pha cà phê', [unsup('physical', ['pha đồ uống', 'make drinks'])]),
  c('bóp vai cho bà', [unsup('physical', MASSAGE)]),
  c('xoa bóp cho bà', [unsup('physical', MASSAGE)]),
  c('đấm lưng cho bà', [unsup('physical', MASSAGE)]),
  c('đưa bà cái điện thoại', [unsup('physical', ['lấy', 'fetch'], ['điện thoại', 'a phone'])]),
  c('tìm điện thoại giùm bà', [unsup('physical', ['tìm', 'find'], ['điện thoại', 'a phone'])]),
  c('đi ra ngoài', [unsup('physical', GO_OUT)]),
  c('ra ngoài chơi đi', [unsup('physical', GO_OUT)]),
  c('đỡ bà dậy', [unsup('physical', ['đỡ ai dậy', 'help anyone up'])]),
  c('đỡ bà dậy với', [unsup('physical', ['đỡ ai dậy', 'help anyone up'])]),
  c('nấu cháo', [unsup('physical', ['nấu', 'cook'], ['cháo', 'porridge'])]),
  c('lấy cho bà ly nước', [unsup('physical', ['lấy', 'fetch'], ['nước', 'water'])]),
  c('mua cho bà ổ bánh mì', [unsup('physical', ['mua', 'buy'], ['bánh mì', 'bread'])]),
  c('don dep nha cua', [unsup('physical', ['dọn', 'clean'], ['nhà', 'the house'])]),
  c('mo cua', [unsup('device_absent', ['mở', 'open'], ['cửa', 'a door'])]),
  c('doi mau den sang mau tim', [X.light('on', 'purple')]),
  // near misses
  c('gọi tôi dậy sau 30 phút', [timer(1800, 'thức dậy')]),
  c('đấm ba phát', [X.punch(3)]),
  c('đưa tay lên', [wave()]),
  c('con ơi', [{ type: 'greet' }]),
  c('cháu ơi', [{ type: 'greet' }]),
]

export const REGRESSION_GROUPS: [string, Case[]][] = [
  ['R1 numbers', NUMBERS],
  ['R2 timer verbs', TIMER_VERBS],
  ['R3 reminders', REMINDERS],
  ['R11 timers and commas', TIMERS_MORE],
  ['R4 fuzzy', FUZZY],
  ['R6/R7 emergencies and tỉnh', EMERGENCY],
  ['R5/R9 no-diacritics context and negation', ASCII_CONTEXT],
  ['R8 dialects', DIALECTS],
  ['R10 phrases', PHRASES],
  ['R14/R15 refusals', REFUSALS],
]

describe.each(REGRESSION_GROUPS)('regressions: %s', (_name, cases) => {
  it.each(cases.map((k): [string, Case] => [k.in || '(empty)', k]))('%s', (_label, k) => {
    const r = parse(k.in, k.ctx)
    expect(r.actions.map((a) => shape(a.action))).toEqual(k.out)
    expect(r.notes.map((n) => n.kind).sort()).toEqual([...(k.notes ?? [])].sort())
    expect(r.unknown.length > 0).toBe(k.unknown === true)
    for (const s of r.substitutions) expect(r.normalizedText.slice(s.start, s.end)).toBe(s.to)
  })
})

/** parse → plan → rendered VI / EN replies (what the bubble shows). */
function replies(text: string, p?: CtxPatch): { vi: string; en: string } {
  const ctx = makeCtx(p)
  const r = parseSync(text, ctx)
  const pl = plan(
    {
      actions: r.actions.map((a) => a.action),
      notes: r.notes,
      hasUnknown: r.unknown.length > 0,
      suggestions: r.suggestions,
    },
    {
      now: ctx.now,
      posture: ctx.robot.posture,
      pose: { x: 0, z: 0, yaw: 0 },
      room: structuredClone(DEFAULT_ROOM),
      reducedMotion: false,
      jokeIndex: 0,
    },
  )
  const refs = plannedReplies(pl.steps)
  return {
    vi: refs.map((x) => renderReply(x, 'vi').text).join(' | '),
    en: refs.map((x) => renderReply(x, 'en').text).join(' | '),
  }
}

describe('regressions: places', () => {
  const unknownPlace = (t: string): boolean | undefined => {
    const a = parse(t).actions[0]?.action
    return a?.type === 'weather' ? (a.placeUnknown ?? false) : undefined
  }
  it.each([
    ['thời tiết Paris', true],
    ['thời tiết miền Bắc', true],
    ['miền Nam có mưa không', true],
    ['Việt Nam hôm nay có mưa không', true],
    ['thoi tiet o paris', true],
    ['thời tiết hôm nay thế nào', false],
    ['thời tiết ở đây thế nào', false],
    ['trời có mưa không', false],
  ] as const)('%s → placeUnknown %s', (t, want) => {
    expect(unknownPlace(t)).toBe(want)
  })
  it.each([
    ['thời tiết Hà Tây', 'HaNoi'],
    ['thời tiết Sông Bé', 'BinhDuong'],
    ['thời tiết Quảng Nôm', 'QuangNam'],
    ['bà ở Quảng Nam, hôm nay trời sao con', 'QuangNam'],
    ['Đà Nẵng ngày kia thế nào', 'DaNang'],
  ])('%s → %s', (t, id) => {
    const a = parse(t).actions[0]?.action
    expect(a?.type === 'weather' ? a.place?.id : undefined).toBe(id)
  })
  it('says it does not know the place, without echoing it', () => {
    const r = replies('thời tiết Paris')
    expect(r.vi).toBe('Mình chưa biết nơi đó nên xem thời tiết TP. Hồ Chí Minh cho bạn nhé.')
    expect(r.en).toBe("I don't know that place yet, so here's the weather for Ho Chi Minh City.")
  })
})

describe('regressions: refusal wording', () => {
  it.each([
    [
      'đi chợ mua rau',
      'Xin lỗi, mình là robot nên không thể mua rau được.',
      "Sorry, I'm a robot, so I can't buy vegetables.",
    ],
    [
      'lấy cho bà ly nước',
      'Xin lỗi, mình là robot nên không thể lấy nước được.',
      "Sorry, I'm a robot, so I can't fetch water.",
    ],
    [
      'mở cửa ra',
      'Xin lỗi, phòng mình không có cửa nên mình không mở được.',
      "Sorry, my room doesn't have a door, so I can't do that.",
    ],
    [
      'bật máy lạnh',
      'Xin lỗi, phòng mình không có máy lạnh nên mình không bật được.',
      "Sorry, my room doesn't have an air conditioner, so I can't do that.",
    ],
    [
      'don dep nha cua',
      'Xin lỗi, mình là robot nên không thể dọn nhà được.',
      "Sorry, I'm a robot, so I can't clean the house.",
    ],
  ])('%s', (t, vi, en) => {
    expect(replies(t)).toEqual({ vi, en })
  })
  it('records substitutions with the text as typed', () => {
    expect(parse('nhảyy').substitutions.map((x) => x.from)).toEqual(['nhảyy'])
  })
  it('keeps the chips neutral for a bare acknowledgement', () => {
    for (const t of ['dạ', 'vâng', 'ừ'])
      expect(parse(t).suggestions.map((x) => x.say)).not.toContain('đấm ba phát')
  })
})

describe('regressions: lunar', () => {
  const L = (t: string) => parse(t).actions.map((a) => a.action)
  it('reads the named year, festival or month', () => {
    expect(L('năm sau là năm con gì')).toEqual([
      { type: 'lunar', query: 'year', dayOffset: 0, yearOffset: 1 },
    ])
    expect(L('năm ngoái là năm con gì')).toEqual([
      { type: 'lunar', query: 'year', dayOffset: 0, yearOffset: -1 },
    ])
    expect(L('năm nay là năm con gì')).toEqual([{ type: 'lunar', query: 'year', dayOffset: 0 }])
    expect(L('tết trung thu là ngày nào')).toEqual([{ type: 'lunar', query: 'ram', dayOffset: 0, month: 8 }])
    expect(L('còn mấy ngày nữa đến trung thu')).toEqual([
      { type: 'lunar', query: 'ram', dayOffset: 0, month: 8 },
    ])
    expect(L('rằm tháng bảy là ngày nào')).toEqual([{ type: 'lunar', query: 'ram', dayOffset: 0, month: 7 }])
    expect(L('còn bao nhiêu ngày nữa đến tết')).toEqual([{ type: 'lunar', query: 'tet', dayOffset: 0 }])
    expect(L('rằm tháng này là ngày nào')).toEqual([{ type: 'lunar', query: 'ram', dayOffset: 0 }])
  })
  it('answers them', () => {
    expect(replies('năm sau là năm con gì').vi).toBe('Năm sau là năm Đinh Mùi, năm con Dê.')
    expect(replies('tết trung thu là ngày nào').vi).toMatch(
      /^Rằm tháng 8 âm lịch rơi vào thứ Sáu, ngày 25 tháng 9 năm 2026, là ngày mai đó\. Đó cũng là Tết Trung Thu\.$/,
    )
    expect(replies('rằm tháng giêng là ngày nào').vi).toMatch(/^Rằm tháng Giêng âm lịch rơi vào .* năm 2027/)
    expect(replies('năm sau là năm con gì').en).toBe('Next lunar year is Đinh Mùi, the year of the Goat.')
  })
})

describe('regressions: replies', () => {
  it('answers an emergency seriously, without the fall clip', () => {
    expect(replies('tôi bị ngã')).toEqual({
      vi: 'Mình chỉ là robot trình diễn nên không gọi giúp được. Nếu khẩn cấp, bạn hãy gọi 115 hoặc người thân ngay nhé.',
      en: "I'm only a demo robot and can't call for help. If this is an emergency, please call 115 or a family member right away.",
    })
    expect(parse('cứu tôi với').suggestions).toEqual([])
  })

  it('asks when a reminder has no duration (never a refusal)', () => {
    expect(replies('nhắc tôi uống thuốc')).toEqual({
      vi: 'Bạn muốn mình nhắc sau bao lâu? Ví dụ: “nhắc tôi uống thuốc sau 15 phút”.',
      en: 'When should I remind you? For example: “nhắc tôi uống thuốc sau 15 phút”.',
    })
    expect(replies('nhắc tôi đi ngủ').vi).toBe(
      'Bạn muốn mình nhắc sau bao lâu? Ví dụ: “nhắc tôi đi ngủ sau 15 phút”.',
    )
    const r = parse('nhắc tôi uống thuốc')
    expect(r.suggestions.map((x) => x.say)).toEqual([
      'nhắc tôi uống thuốc sau 15 phút',
      'nhắc tôi uống thuốc sau 30 phút',
    ])
    expect(r.status).toBe('ok')
  })

  it('says clock-time alarms are not supported yet', () => {
    expect(replies('nhắc tôi lúc 9 giờ uống thuốc')).toEqual({
      vi: 'Mình chưa hẹn theo giờ đồng hồ được. Bạn nói “sau 30 phút” giúp mình nhé.',
      en: "I can't set reminders for a clock time yet. Please say “sau 30 phút” (in 30 minutes) instead.",
    })
  })

  it('does not switch a device now for a delayed command', () => {
    expect(replies('tắt đèn sau 5 phút', { lightOn: true }).vi).toBe(
      'Mình chưa hẹn giờ cho đèn quạt được. Khi cần, bạn cứ nói “tắt đèn” nhé.',
    )
    expect(replies('bật quạt sau 10 phút').en).toBe(
      "I can't schedule the light or the fan yet. When you need it, just say “bật quạt”.",
    )
  })

  it('every clarify chip is itself a command the parser runs', () => {
    for (const t of [
      'nhắc tôi uống thuốc',
      'hẹn giờ',
      'nhắc tôi',
      'đánh thức tôi',
      'nhắc tôi lúc 9 giờ',
      'tắt đèn sau 5 phút',
    ]) {
      for (const s of parse(t).suggestions) {
        const r = parse(s.say)
        expect({ say: s.say, unknown: r.unknown }).toEqual({ say: s.say, unknown: [] })
        expect({ say: s.say, clarify: r.actions.filter((a) => a.action.type === 'clarify').length }).toEqual({
          say: s.say,
          clarify: 0,
        })
      }
    }
  })
})
