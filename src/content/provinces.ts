import type { Bilingual, Lang } from '@/core/lang'

/**
 * Display names for the 63 ViMD province keys (`results.provinces[].id`, `results.examples[].province`).
 * These are the provinces as labelled in ViMD, i.e. before Vietnam's 2025 administrative merger.
 * VI carries full diacritics; EN follows the dashboard's plain "Quang Binh" style.
 */
export const PROVINCES = {
  AnGiang: { vi: 'An Giang', en: 'An Giang' },
  BaRiaVungTau: { vi: 'Bà Rịa – Vũng Tàu', en: 'Ba Ria – Vung Tau' },
  BacGiang: { vi: 'Bắc Giang', en: 'Bac Giang' },
  BacKan: { vi: 'Bắc Kạn', en: 'Bac Kan' },
  BacLieu: { vi: 'Bạc Liêu', en: 'Bac Lieu' },
  BacNinh: { vi: 'Bắc Ninh', en: 'Bac Ninh' },
  BenTre: { vi: 'Bến Tre', en: 'Ben Tre' },
  BinhDinh: { vi: 'Bình Định', en: 'Binh Dinh' },
  BinhDuong: { vi: 'Bình Dương', en: 'Binh Duong' },
  BinhPhuoc: { vi: 'Bình Phước', en: 'Binh Phuoc' },
  BinhThuan: { vi: 'Bình Thuận', en: 'Binh Thuan' },
  CaMau: { vi: 'Cà Mau', en: 'Ca Mau' },
  CanTho: { vi: 'Cần Thơ', en: 'Can Tho' },
  CaoBang: { vi: 'Cao Bằng', en: 'Cao Bang' },
  DaNang: { vi: 'Đà Nẵng', en: 'Da Nang' },
  DakLak: { vi: 'Đắk Lắk', en: 'Dak Lak' },
  DakNong: { vi: 'Đắk Nông', en: 'Dak Nong' },
  DienBien: { vi: 'Điện Biên', en: 'Dien Bien' },
  DongNai: { vi: 'Đồng Nai', en: 'Dong Nai' },
  DongThap: { vi: 'Đồng Tháp', en: 'Dong Thap' },
  GiaLai: { vi: 'Gia Lai', en: 'Gia Lai' },
  HaGiang: { vi: 'Hà Giang', en: 'Ha Giang' },
  HaNam: { vi: 'Hà Nam', en: 'Ha Nam' },
  HaNoi: { vi: 'Hà Nội', en: 'Hanoi' },
  HaTinh: { vi: 'Hà Tĩnh', en: 'Ha Tinh' },
  HaiDuong: { vi: 'Hải Dương', en: 'Hai Duong' },
  HaiPhong: { vi: 'Hải Phòng', en: 'Hai Phong' },
  HauGiang: { vi: 'Hậu Giang', en: 'Hau Giang' },
  HoChiMinh: { vi: 'TP. Hồ Chí Minh', en: 'Ho Chi Minh City' },
  HoaBinh: { vi: 'Hòa Bình', en: 'Hoa Binh' },
  HungYen: { vi: 'Hưng Yên', en: 'Hung Yen' },
  KhanhHoa: { vi: 'Khánh Hòa', en: 'Khanh Hoa' },
  KienGiang: { vi: 'Kiên Giang', en: 'Kien Giang' },
  KonTum: { vi: 'Kon Tum', en: 'Kon Tum' },
  LaiChau: { vi: 'Lai Châu', en: 'Lai Chau' },
  LamDong: { vi: 'Lâm Đồng', en: 'Lam Dong' },
  LangSon: { vi: 'Lạng Sơn', en: 'Lang Son' },
  LaoCai: { vi: 'Lào Cai', en: 'Lao Cai' },
  LongAn: { vi: 'Long An', en: 'Long An' },
  NamDinh: { vi: 'Nam Định', en: 'Nam Dinh' },
  NgheAn: { vi: 'Nghệ An', en: 'Nghe An' },
  NinhBinh: { vi: 'Ninh Bình', en: 'Ninh Binh' },
  NinhThuan: { vi: 'Ninh Thuận', en: 'Ninh Thuan' },
  PhuTho: { vi: 'Phú Thọ', en: 'Phu Tho' },
  PhuYen: { vi: 'Phú Yên', en: 'Phu Yen' },
  QuangBinh: { vi: 'Quảng Bình', en: 'Quang Binh' },
  QuangNam: { vi: 'Quảng Nam', en: 'Quang Nam' },
  QuangNgai: { vi: 'Quảng Ngãi', en: 'Quang Ngai' },
  QuangNinh: { vi: 'Quảng Ninh', en: 'Quang Ninh' },
  QuangTri: { vi: 'Quảng Trị', en: 'Quang Tri' },
  SocTrang: { vi: 'Sóc Trăng', en: 'Soc Trang' },
  SonLa: { vi: 'Sơn La', en: 'Son La' },
  TayNinh: { vi: 'Tây Ninh', en: 'Tay Ninh' },
  ThaiBinh: { vi: 'Thái Bình', en: 'Thai Binh' },
  ThaiNguyen: { vi: 'Thái Nguyên', en: 'Thai Nguyen' },
  ThanhHoa: { vi: 'Thanh Hóa', en: 'Thanh Hoa' },
  ThuaThienHue: { vi: 'Thừa Thiên Huế', en: 'Thua Thien Hue' },
  TienGiang: { vi: 'Tiền Giang', en: 'Tien Giang' },
  TraVinh: { vi: 'Trà Vinh', en: 'Tra Vinh' },
  TuyenQuang: { vi: 'Tuyên Quang', en: 'Tuyen Quang' },
  VinhLong: { vi: 'Vĩnh Long', en: 'Vinh Long' },
  VinhPhuc: { vi: 'Vĩnh Phúc', en: 'Vinh Phuc' },
  YenBai: { vi: 'Yên Bái', en: 'Yen Bai' },
} as const satisfies Record<string, Bilingual>

export type ProvinceId = keyof typeof PROVINCES

export function isProvinceId(id: string): id is ProvinceId {
  return Object.hasOwn(PROVINCES, id)
}

/**
 * Display name of a ViMD province key. Unknown keys (a future dataset revision) fall back to the key
 * split at its capitals ("NewPlace" → "New Place") instead of crashing the page.
 */
export function provinceName(id: string, lang: Lang): string {
  if (isProvinceId(id)) return PROVINCES[id][lang]
  return id.replace(/(\p{Ll})(\p{Lu})/gu, '$1 $2')
}
