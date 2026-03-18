import Holidays from "date-holidays";

const hd = new Holidays("KR");

export function isKoreanHoliday(date: Date): boolean {
  const result = hd.isHoliday(date);
  return result !== false;
}
