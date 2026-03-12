import bcrypt from "bcrypt";
import { db } from "./db";
import { headquarters, teams, users, hqTeamRegionPermissions } from "@shared/schema";
import { count, eq } from "drizzle-orm";

// ─── 조직 구조 정의 ─────────────────────────────────────────────────────────
const SIDO_ABBREV: Record<string, string> = {
  '서울특별시': '서울', '부산광역시': '부산', '대구광역시': '대구', '인천광역시': '인천',
  '광주광역시': '광주', '대전광역시': '대전', '울산광역시': '울산', '세종특별자치시': '세종시',
  '경기도': '경기', '강원특별자치도': '강원', '충청북도': '충북', '충청남도': '충남',
  '전라북도': '전북', '전라남도': '전남', '경상북도': '경북', '경상남도': '경남',
  '제주특별자치도': '제주',
};

interface RegionPerm { doName: string; siName: string | null; gunName: string | null; }
interface TeamDef { name: string; code: string; regions: RegionPerm[]; }
interface HqDef { name: string; code: string; teams: TeamDef[]; }

function sido(doName: string): RegionPerm { return { doName, siName: null, gunName: null }; }
function si(doName: string, siName: string): RegionPerm { return { doName, siName, gunName: null }; }
function gun(doName: string, gunName: string): RegionPerm { return { doName, siName: null, gunName }; }
function regionName(r: RegionPerm): string {
  const abbrev = SIDO_ABBREV[r.doName] || r.doName;
  const sub = r.siName || r.gunName;
  return sub ? `${abbrev} ${sub}` : abbrev;
}

const ORG: HqDef[] = [
  {
    name: '수도권남부본부', code: 'HQ_SUDNAM',
    teams: [
      { name: '검사1팀', code: 'SUDNAM_T1', regions: [sido('인천광역시')] },
      {
        name: '검사2팀', code: 'SUDNAM_T2',
        regions: [
          si('경기도', '광주시'), si('경기도', '성남시'), gun('경기도', '양평군'),
          si('경기도', '여주시'), si('경기도', '이천시'), si('경기도', '하남시'),
        ],
      },
      {
        name: '검사3팀', code: 'SUDNAM_T3',
        regions: [
          si('경기도', '과천시'), si('경기도', '광명시'), si('경기도', '군포시'),
          si('경기도', '김포시'), si('경기도', '부천시'), si('경기도', '수원시'),
          si('경기도', '시흥시'), si('경기도', '안산시'), si('경기도', '안성시'),
          si('경기도', '안양시'), si('경기도', '오산시'), si('경기도', '용인시'),
          si('경기도', '의왕시'), si('경기도', '평택시'), si('경기도', '화성시'),
        ],
      },
    ],
  },
  {
    name: '수도권북부본부', code: 'HQ_SUDBUK',
    teams: [
      { name: '검사1팀', code: 'SUDBUK_T1', regions: [sido('서울특별시')] },
      {
        name: '검사2팀', code: 'SUDBUK_T2',
        regions: [
          si('경기도', '고양시'), si('경기도', '구리시'), si('경기도', '남양주시'),
          si('경기도', '동두천시'), si('경기도', '양주시'), si('경기도', '의정부시'),
          si('경기도', '파주시'), si('경기도', '포천시'),
          gun('경기도', '가평군'), gun('경기도', '연천군'),
        ],
      },
    ],
  },
  {
    name: '대전세종충남본부', code: 'HQ_DAEJEON',
    teams: [
      { name: '검사1팀', code: 'DAEJEON_T1', regions: [sido('세종특별자치시'), sido('대전광역시')] },
      { name: '검사2팀', code: 'DAEJEON_T2', regions: [sido('충청남도')] },
    ],
  },
  {
    name: '충북본부', code: 'HQ_CHUNGBUK',
    teams: [
      { name: '검사팀', code: 'CHUNGBUK_T1', regions: [sido('충청북도')] },
    ],
  },
  {
    name: '광주전남본부', code: 'HQ_GWANGJU',
    teams: [
      { name: '검사1팀', code: 'GWANGJU_T1', regions: [sido('광주광역시')] },
      { name: '검사2팀', code: 'GWANGJU_T2', regions: [sido('전라남도')] },
    ],
  },
  {
    name: '전북본부', code: 'HQ_JEONBUK',
    teams: [
      {
        name: '검사1팀', code: 'JEONBUK_T1',
        regions: [
          gun('전라북도', '고창군'), si('전라북도', '김제시'), si('전라북도', '남원시'),
          gun('전라북도', '무주군'), gun('전라북도', '부안군'), gun('전라북도', '순창군'),
          si('전라북도', '완주군'), gun('전라북도', '임실군'), gun('전라북도', '장수군'),
          si('전라북도', '전주시'), si('전라북도', '정읍시'), gun('전라북도', '진안군'),
        ],
      },
      { name: '검사2팀', code: 'JEONBUK_T2', regions: [si('전라북도', '군산시'), si('전라북도', '익산시')] },
    ],
  },
  {
    name: '부산울산경남본부', code: 'HQ_BUSAN',
    teams: [
      { name: '검사1팀', code: 'BUSAN_T1', regions: [sido('부산광역시')] },
      { name: '검사2팀', code: 'BUSAN_T2', regions: [sido('울산광역시')] },
      { name: '검사3팀', code: 'BUSAN_T3', regions: [sido('경상남도')] },
    ],
  },
  {
    name: '대구경북본부', code: 'HQ_DAEGU',
    teams: [
      { name: '검사1팀', code: 'DAEGU_T1', regions: [sido('대구광역시')] },
      { name: '검사2팀', code: 'DAEGU_T2', regions: [sido('경상북도')] },
    ],
  },
  {
    name: '강원본부', code: 'HQ_GANGWON',
    teams: [
      { name: '검사팀', code: 'GANGWON_T1', regions: [sido('강원특별자치도')] },
    ],
  },
  {
    name: '제주본부', code: 'HQ_JEJU',
    teams: [
      { name: '검사팀', code: 'JEJU_T1', regions: [sido('제주특별자치도')] },
    ],
  },
];

export async function seedDatabase() {
  const [{ total }] = await db.select({ total: count() }).from(headquarters);
  if (Number(total) > 0) {
    // 본부가 있어도 마스터 계정은 없을 수 있으므로 확인
    await ensureMasterUser();
    return;
  }

  console.log("시드 데이터 초기화 중...");

  for (const hqDef of ORG) {
    const [hq] = await db.insert(headquarters)
      .values({ name: hqDef.name, code: hqDef.code, enabled: true })
      .returning();

    for (const teamDef of hqDef.teams) {
      const [team] = await db.insert(teams)
        .values({ headquartersId: hq.id, name: teamDef.name, code: teamDef.code, enabled: true })
        .returning();

      for (const r of teamDef.regions) {
        const rName = regionName(r);
        await db.insert(hqTeamRegionPermissions).values({
          headquartersId: hq.id,
          teamId: team.id,
          doName: r.doName,
          siName: r.siName,
          gunName: r.gunName,
          guName: null,
          regionName: rName,
          enabled: true,
        });
      }
    }
  }

  await ensureMasterUser();
  console.log("시드 데이터 초기화 완료! (본부 10개, 팀 19개, 지역권한 60건+)");
}

async function ensureMasterUser() {
  const masterHash = await bcrypt.hash("kpetro!23", 10);

  const [existing] = await db.select().from(users).where(eq(users.username, "ax"));
  if (existing) {
    await db.update(users).set({
      passwordHash: masterHash,
      mustChangePassword: false,
      enabled: true,
      role: "MASTER",
    }).where(eq(users.username, "ax"));
    console.log("마스터 계정 비밀번호 동기화 완료 (ax)");
  } else {
    await db.insert(users).values({
      username: "ax",
      passwordHash: masterHash,
      displayName: "관리자",
      email: null,
      positionName: "시스템관리자",
      role: "MASTER",
      headquartersId: null,
      teamId: null,
      enabled: true,
      mustChangePassword: false,
    });
    console.log("마스터 계정 생성 완료 (ax)");
  }
}
