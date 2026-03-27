// 직접 runOilPriceJob 호출 테스트 (오전 슬롯 시뮬레이션: 어제 날짜)
import { runOilPriceJob } from "./server/services/oilScheduler";

function getKSTNow() { return new Date(Date.now() + 9 * 60 * 60 * 1000); }
function getDateStr(d: Date) {
  return `${d.getUTCFullYear()}${String(d.getUTCMonth()+1).padStart(2,"0")}${String(d.getUTCDate()).padStart(2,"0")}`;
}

const kstNow = getKSTNow();
const kstYesterday = new Date(kstNow);
kstYesterday.setUTCDate(kstYesterday.getUTCDate() - 1);
const kstDayBefore = new Date(kstYesterday);
kstDayBefore.setUTCDate(kstDayBefore.getUTCDate() - 1);

const today = getDateStr(kstYesterday);    // 오전 슬롯: 어제
const yesterday = getDateStr(kstDayBefore); // 분석 비교용: 그제

console.log(`[테스트] 오전 슬롯 시뮬레이션: today=${today}, yesterday=${yesterday}`);
console.log(`[테스트] → downloadOilPriceCSV(${today}) 호출 예정`);

const result = await runOilPriceJob(today, yesterday, "test_morning");
console.log("\n[테스트] 결과:", JSON.stringify(result, null, 2));
