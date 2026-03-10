import axios from "axios";

const BASE_URL = "https://www.opinet.co.kr";
const DOWNLOAD_PAGE = `${BASE_URL}/user/opdown/opDownload.do`;
const DOWNLOAD_CSV = `${BASE_URL}/user/main/main_download_csv_big.do`;

function parseCookies(headers: Record<string, string | string[] | undefined>): string {
  const setCookie = headers["set-cookie"];
  if (!setCookie) return "";
  const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
  return cookies
    .map((c) => c.split(";")[0])
    .join("; ");
}

export async function downloadOilPriceCSV(
  startDate: string,
  endDate: string
): Promise<Buffer | null> {
  try {
    const pageRes = await axios.get(DOWNLOAD_PAGE, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36 Edg/145.0.0",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ko,en-US;q=0.9,en;q=0.8",
        "Accept-Encoding": "gzip, deflate, br",
      },
      timeout: 30000,
      maxRedirects: 5,
    });

    const cookieHeader = parseCookies(pageRes.headers as Record<string, string | string[] | undefined>);
    if (!cookieHeader) {
      console.error("[OilScraper] 세션 쿠키를 받지 못했습니다.");
      return null;
    }

    console.log(`[OilScraper] 쿠키 획득: ${cookieHeader.substring(0, 60)}...`);

    const params = new URLSearchParams({
      LPG_CD: "A",
      DATE_DIV_CD: "X",
      PAGE_DIV: "PAGE_DIV_6",
      SIDO_NM: "시/도",
      SIGUN_NM: "시/군/구",
      API_GBN: "30",
      rdo1: "A",
      rdo2: "A",
      rdo3: "A",
      rdo4: "N",
      START_DT: startDate,
      END_DT: endDate,
      SIDO_CD: "",
      SIGUN_CD: "",
    });

    const csvRes = await axios.post(DOWNLOAD_CSV, params.toString(), {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36 Edg/145.0.0",
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "ko,en-US;q=0.9,en;q=0.8",
        "Accept-Encoding": "gzip, deflate, br",
        "Cookie": cookieHeader,
        "Referer": DOWNLOAD_PAGE,
        "Origin": BASE_URL,
        "Upgrade-Insecure-Requests": "1",
      },
      responseType: "arraybuffer",
      timeout: 60000,
      maxRedirects: 5,
    });

    const contentType = (csvRes.headers["content-type"] || "").toLowerCase();
    const contentDisposition = csvRes.headers["content-disposition"] || "";

    if (contentType.includes("application/download") || contentDisposition.includes(".csv")) {
      console.log(`[OilScraper] CSV 다운로드 성공 — ${csvRes.data.byteLength} bytes`);
      return Buffer.from(csvRes.data);
    }

    const preview = Buffer.from(csvRes.data).slice(0, 200).toString("utf-8", 0, 200);
    console.error(`[OilScraper] 예상치 못한 응답 (content-type: ${contentType}): ${preview}`);
    return null;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[OilScraper] 다운로드 실패:", msg);
    return null;
  }
}
