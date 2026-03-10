import bcrypt from "bcrypt";
import { db } from "./db";
import { headquarters, teams, users, hqTeamRegionPermissions } from "@shared/schema";
import { count } from "drizzle-orm";

// 기본 시드 데이터 초기화 함수
export async function seedDatabase() {
  const [{ total }] = await db.select({ total: count() }).from(users);
  if (Number(total) > 0) return; // 이미 데이터 있으면 건너뜀

  console.log("시드 데이터 초기화 중...");

  // 본부 생성
  const [hq1, hq2, hq3] = await db.insert(headquarters).values([
    { name: "서울본부", code: "HQ_SEOUL", enabled: true },
    { name: "부산본부", code: "HQ_BUSAN", enabled: true },
    { name: "대구본부", code: "HQ_DAEGU", enabled: true },
  ]).returning();

  // 팀 생성
  const [team1, team2, team3, team4, team5, team6] = await db.insert(teams).values([
    { headquartersId: hq1.id, name: "서울1팀", code: "SEOUL_T1", enabled: true },
    { headquartersId: hq1.id, name: "서울2팀", code: "SEOUL_T2", enabled: true },
    { headquartersId: hq2.id, name: "부산1팀", code: "BUSAN_T1", enabled: true },
    { headquartersId: hq2.id, name: "부산2팀", code: "BUSAN_T2", enabled: true },
    { headquartersId: hq3.id, name: "대구1팀", code: "DAEGU_T1", enabled: true },
    { headquartersId: hq3.id, name: "대구2팀", code: "DAEGU_T2", enabled: true },
  ]).returning();

  const masterHash = await bcrypt.hash("master1234!", 10);
  const userHash = await bcrypt.hash("user1234!", 10);

  // 사용자 생성
  await db.insert(users).values([
    {
      username: "master",
      passwordHash: masterHash,
      displayName: "시스템 관리자",
      email: "master@example.com",
      positionName: "관리자",
      departmentName: "IT운영부",
      role: "MASTER",
      headquartersId: hq1.id,
      teamId: team1.id,
      enabled: true,
    },
    {
      username: "seoul1_user",
      passwordHash: userHash,
      displayName: "김서울",
      email: "kim.seoul@example.com",
      positionName: "주임",
      departmentName: "영업부",
      role: "HQ_USER",
      headquartersId: hq1.id,
      teamId: team1.id,
      enabled: true,
    },
    {
      username: "seoul2_user",
      passwordHash: userHash,
      displayName: "이한강",
      email: "lee.hangang@example.com",
      positionName: "대리",
      departmentName: "마케팅부",
      role: "HQ_USER",
      headquartersId: hq1.id,
      teamId: team2.id,
      enabled: true,
    },
    {
      username: "busan1_user",
      passwordHash: userHash,
      displayName: "박부산",
      email: "park.busan@example.com",
      positionName: "과장",
      departmentName: "영업부",
      role: "HQ_USER",
      headquartersId: hq2.id,
      teamId: team3.id,
      enabled: true,
    },
    {
      username: "daegu1_user",
      passwordHash: userHash,
      displayName: "최대구",
      email: "choi.daegu@example.com",
      positionName: "사원",
      departmentName: "운영부",
      role: "HQ_USER",
      headquartersId: hq3.id,
      teamId: team5.id,
      enabled: true,
    },
  ]);

  // 지역 권한 시드
  await db.insert(hqTeamRegionPermissions).values([
    { headquartersId: hq1.id, teamId: team1.id, sidoCode: "11", regionName: "서울특별시", enabled: true },
    { headquartersId: hq1.id, teamId: team1.id, sidoCode: "11", sigunCode: "11010", regionName: "서울특별시 종로구", enabled: true },
    { headquartersId: hq1.id, teamId: team1.id, sidoCode: "11", sigunCode: "11020", regionName: "서울특별시 중구", enabled: true },
    { headquartersId: hq1.id, teamId: team2.id, sidoCode: "11", sigunCode: "11030", regionName: "서울특별시 용산구", enabled: true },
    { headquartersId: hq1.id, teamId: team2.id, sidoCode: "11", sigunCode: "11040", regionName: "서울특별시 성동구", enabled: true },
    { headquartersId: hq2.id, teamId: team3.id, sidoCode: "26", regionName: "부산광역시", enabled: true },
    { headquartersId: hq2.id, teamId: team3.id, sidoCode: "26", sigunCode: "26010", regionName: "부산광역시 중구", enabled: true },
    { headquartersId: hq2.id, teamId: team4.id, sidoCode: "26", sigunCode: "26020", regionName: "부산광역시 서구", enabled: true },
    { headquartersId: hq3.id, teamId: team5.id, sidoCode: "27", regionName: "대구광역시", enabled: true },
    { headquartersId: hq3.id, teamId: team6.id, sidoCode: "27", sigunCode: "27010", regionName: "대구광역시 중구", enabled: true },
  ]);

  console.log("시드 데이터 초기화 완료!");
}
