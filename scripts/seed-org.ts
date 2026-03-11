import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ─── 조직 구조 정의 ─────────────────────────────────────────────────────────

interface TeamDef {
  name: string;
  code: string;
  regions: RegionPerm[];
}

interface HqDef {
  name: string;
  code: string;
  teams: TeamDef[];
}

// doName 전체명 → 오피넷 sido 약칭 변환 (storage.ts 와 동일한 매핑)
const SIDO_ABBREV: Record<string, string> = {
  '서울특별시': '서울', '부산광역시': '부산', '대구광역시': '대구', '인천광역시': '인천',
  '광주광역시': '광주', '대전광역시': '대전', '울산광역시': '울산', '세종특별자치시': '세종시',
  '경기도': '경기', '강원특별자치도': '강원', '충청북도': '충북', '충청남도': '충남',
  '전라북도': '전북', '전라남도': '전남', '경상북도': '경북', '경상남도': '경남',
  '제주특별자치도': '제주',
};

// sido 전체: doName만 설정, siName/gunName null
function sido(doName: string): RegionPerm {
  return { doName, siName: null, gunName: null };
}
// 특정 시: doName + siName
function si(doName: string, siName: string): RegionPerm {
  return { doName, siName, gunName: null };
}
// 특정 군: doName + gunName
function gun(doName: string, gunName: string): RegionPerm {
  return { doName, siName: null, gunName };
}

interface RegionPerm {
  doName: string;
  siName: string | null;
  gunName: string | null;
}

function regionName(r: RegionPerm): string {
  const abbrev = SIDO_ABBREV[r.doName] || r.doName;
  const sub = r.siName || r.gunName;
  return sub ? `${abbrev} ${sub}` : abbrev;
}

const ORG: HqDef[] = [
  {
    name: '수도권남부본부', code: 'HQ_SUDNAM',
    teams: [
      {
        name: '검사1팀', code: 'SUDNAM_T1',
        regions: [sido('인천광역시')],
      },
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
      {
        name: '검사1팀', code: 'SUDBUK_T1',
        regions: [sido('서울특별시')],
      },
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
      {
        name: '검사1팀', code: 'DAEJEON_T1',
        regions: [sido('세종특별자치시'), sido('대전광역시')],
      },
      {
        name: '검사2팀', code: 'DAEJEON_T2',
        regions: [sido('충청남도')],
      },
    ],
  },
  {
    name: '충북본부', code: 'HQ_CHUNGBUK',
    teams: [
      {
        name: '검사팀', code: 'CHUNGBUK_T1',
        regions: [sido('충청북도')],
      },
    ],
  },
  {
    name: '광주전남본부', code: 'HQ_GWANGJU',
    teams: [
      {
        name: '검사1팀', code: 'GWANGJU_T1',
        regions: [sido('광주광역시')],
      },
      {
        name: '검사2팀', code: 'GWANGJU_T2',
        regions: [sido('전라남도')],
      },
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
      {
        name: '검사2팀', code: 'JEONBUK_T2',
        regions: [si('전라북도', '군산시'), si('전라북도', '익산시')],
      },
    ],
  },
  {
    name: '부산울산경남본부', code: 'HQ_BUSAN',
    teams: [
      {
        name: '검사1팀', code: 'BUSAN_T1',
        regions: [sido('부산광역시')],
      },
      {
        name: '검사2팀', code: 'BUSAN_T2',
        regions: [sido('울산광역시')],
      },
      {
        name: '검사3팀', code: 'BUSAN_T3',
        regions: [sido('경상남도')],
      },
    ],
  },
  {
    name: '대구경북본부', code: 'HQ_DAEGU',
    teams: [
      {
        name: '검사1팀', code: 'DAEGU_T1',
        regions: [sido('대구광역시')],
      },
      {
        name: '검사2팀', code: 'DAEGU_T2',
        regions: [sido('경상북도')],
      },
    ],
  },
  {
    name: '강원본부', code: 'HQ_GANGWON',
    teams: [
      {
        name: '검사팀', code: 'GANGWON_T1',
        regions: [sido('강원특별자치도')],
      },
    ],
  },
  {
    name: '제주본부', code: 'HQ_JEJU',
    teams: [
      {
        name: '검사팀', code: 'JEJU_T1',
        regions: [sido('제주특별자치도')],
      },
    ],
  },
];

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    console.log('1. 기존 데이터 삭제...');
    await client.query('DELETE FROM hq_team_region_permissions');
    await client.query("DELETE FROM users WHERE role != 'MASTER'");
    await client.query('DELETE FROM teams');
    await client.query('DELETE FROM headquarters');
    console.log('   ✓ 삭제 완료');

    console.log('2. 본부 생성...');
    for (const hq of ORG) {
      const hqRes = await client.query(
        `INSERT INTO headquarters (name, code, enabled) VALUES ($1, $2, true) RETURNING id`,
        [hq.name, hq.code]
      );
      const hqId = hqRes.rows[0].id;
      console.log(`   ✓ ${hq.name} (id=${hqId})`);

      console.log(`3. 팀 및 지역 권한 생성 - ${hq.name}...`);
      for (const team of hq.teams) {
        const teamRes = await client.query(
          `INSERT INTO teams (headquarters_id, name, code, enabled) VALUES ($1, $2, $3, true) RETURNING id`,
          [hqId, team.name, team.code]
        );
        const teamId = teamRes.rows[0].id;

        for (const r of team.regions) {
          const rName = regionName(r);
          await client.query(
            `INSERT INTO hq_team_region_permissions
               (headquarters_id, team_id, do_name, si_name, gun_name, gu_name, region_name, enabled)
             VALUES ($1, $2, $3, $4, $5, null, $6, true)`,
            [hqId, teamId, r.doName, r.siName, r.gunName, rName]
          );
        }
        console.log(`      → ${team.name} (id=${teamId}): ${team.regions.map(regionName).join(', ')}`);
      }
    }

    await client.query('COMMIT');

    // 결과 확인
    const hqCount = await client.query('SELECT COUNT(*) FROM headquarters');
    const teamCount = await client.query('SELECT COUNT(*) FROM teams');
    const permCount = await client.query('SELECT COUNT(*) FROM hq_team_region_permissions');
    console.log('\n✅ 시딩 완료');
    console.log(`   본부: ${hqCount.rows[0].count}개`);
    console.log(`   팀: ${teamCount.rows[0].count}개`);
    console.log(`   지역 권한: ${permCount.rows[0].count}건`);
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('❌ 오류 발생, 롤백:', e);
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
