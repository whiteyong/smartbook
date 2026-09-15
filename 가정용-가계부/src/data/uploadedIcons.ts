export interface UploadedIconData {
  id: string;
  fileName: string;
  title: string;
  category: string;
  alt: string;
  description: string;
  svgContent: string;
  dataUri: string;
  localPath: string;
}

const createSvgDataUri = (svg: string) => `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;

const RAW_ICONS: Array<{
  id: string;
  fileName: string;
  title: string;
  alt: string;
  description: string;
  svg: string;
}> = [
  {
    id: 'icon_01_grid_view',
    fileName: '01_grid_view.svg',
    title: '그리드 뷰 (Grid View)',
    alt: '4개의 둥근 사각형으로 구성된 대시보드 그리드 뷰 아이콘',
    description: '대시보드 메인 메뉴, 갤러리 카드 보기, 전체 화면 레이아웃 토글 아이콘',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#1e293b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="2" /><rect x="14" y="3" width="7" height="7" rx="2" /><rect x="14" y="14" width="7" height="7" rx="2" /><rect x="3" y="14" width="7" height="7" rx="2" /></svg>`,
  },
  {
    id: 'icon_02_upload_file',
    fileName: '02_upload_file.svg',
    title: '파일 업로드 (Upload File)',
    alt: '위쪽 화살표가 있는 파일 문서 업로드 아이콘',
    description: '문서/이미지 업로드 버튼, 파일 첨부 드롭존 표시 아이콘',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#1e293b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><polyline points="9 15 12 12 15 15"/></svg>`,
  },
  {
    id: 'icon_03_receipt_long',
    fileName: '03_receipt_long.svg',
    title: '영수증 & 거래 내역 (Receipt Long)',
    alt: '지그재그 하단과 텍스트 라인이 있는 긴 영수증 아이콘',
    description: '결제 영수증, 전자 세금계산서, 주문 거래 내역 상세 아이콘',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#1e293b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2l2.5 1.5L9 2l2.5 1.5L14 2l2.5 1.5L19 2l2.5 1.5L20 22l-2.5-1.5L15 22l-2.5-1.5L10 22l-2.5-1.5L5 22l-1-20z"/><line x1="8" y1="7" x2="16" y2="7"/><line x1="8" y1="11" x2="16" y2="11"/><line x1="8" y1="15" x2="12" y2="15"/></svg>`,
  },
  {
    id: 'icon_04_tune',
    fileName: '04_tune.svg',
    title: '설정 슬라이더 튜닝 (Tune)',
    alt: '수평 슬라이더와 원형 조절 노브가 있는 필터 튜닝 아이콘',
    description: '상세 검색 필터, 이퀄라이저 설정, 커스텀 옵션 조정 아이콘',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#1e293b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="7" x2="20" y2="7"/><circle cx="9" cy="7" r="2.5" fill="#fff" stroke="#1e293b" stroke-width="2"/><line x1="4" y1="17" x2="20" y2="17"/><circle cx="15" cy="17" r="2.5" fill="#fff" stroke="#1e293b" stroke-width="2"/></svg>`,
  },
  {
    id: 'icon_05_wallet',
    fileName: '05_wallet.svg',
    title: '전자 지갑 (Wallet)',
    alt: '잠금장치가 달린 가죽 지갑 아이콘',
    description: '결제 수단 관리, 계좌 잔액, 포인트 및 가상 지갑 아이콘',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#1e293b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 5H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h15a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z"/><path d="M16 11h6v4h-6a2 2 0 0 1-2-2 2 2 0 0 1 2-2z"/><circle cx="18.5" cy="13" r="1" fill="#1e293b"/><path d="M2 9h18"/></svg>`,
  },
  {
    id: 'icon_06_account_balance',
    fileName: '06_account_balance.svg',
    title: '은행 & 금융 기관 (Account Balance)',
    alt: '4개의 기둥과 지붕이 있는 은행 건축물 아이콘',
    description: '은행 송금, 공식 공공기관, 금융 연동 서비스 아이콘',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#1e293b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18"/><path d="M3 10h18"/><path d="M12 3l9 7H3l9-7z"/><line x1="6" y1="10" x2="6" y2="21"/><line x1="10" y1="10" x2="10" y2="21"/><line x1="14" y1="10" x2="14" y2="21"/><line x1="18" y1="10" x2="18" y2="21"/></svg>`,
  },
  {
    id: 'icon_07_bar_chart',
    fileName: '07_bar_chart.svg',
    title: '막대 통계 차트 (Bar Chart)',
    alt: '높이가 다른 세로 막대들이 나열된 차트 그래프 아이콘',
    description: '매출 분석, 방문자 통계, 데이터 시각화 대시보드 아이콘',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#1e293b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="20" x2="21" y2="20"/><line x1="6" y1="20" x2="6" y2="14"/><line x1="11" y1="20" x2="11" y2="6"/><line x1="15" y1="20" x2="15" y2="16"/><line x1="19" y1="20" x2="19" y2="9"/></svg>`,
  },
  {
    id: 'icon_08_settings',
    fileName: '08_settings.svg',
    title: '환경 설정 톱니/태양 (Settings)',
    alt: '원형 중앙과 방사형 살이 뻗은 시스템 환경 설정 아이콘',
    description: '시스템 설정, 계정 환경설정, 테마 모드 변경 아이콘',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#1e293b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>`,
  },
  {
    id: 'icon_09_add_circle',
    fileName: '09_add_circle.svg',
    title: '원형 추가 버튼 (Add Circle)',
    alt: '원형 안에 플러스 기호가 들어간 파란색 추가 아이콘',
    description: '새 항목 등록, 이미지 추가, 빠른 생성 플로팅 버튼 아이콘',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#2563eb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9.5" /><line x1="12" y1="7.5" x2="12" y2="16.5" stroke-width="2.5" /><line x1="7.5" y1="12" x2="16.5" y2="12" stroke-width="2.5" /></svg>`,
  },
  {
    id: 'icon_10_calendar_today',
    fileName: '10_calendar_today.svg',
    title: '달력 & 일정 (Calendar Today)',
    alt: '상단 링과 3개의 일정이 표시된 캘린더 달력 아이콘',
    description: '일정 관리, 예약 날짜 선택기, 이벤트 달력 아이콘',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#1e293b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="3"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="9" x2="21" y2="9"/><circle cx="8" cy="14" r="1" fill="#1e293b"/><circle cx="12" cy="14" r="1" fill="#1e293b"/><circle cx="16" cy="14" r="1" fill="#1e293b"/></svg>`,
  },
  {
    id: 'icon_11_notifications',
    fileName: '11_notifications.svg',
    title: '알림 벨 & 뱃지 (Notifications)',
    alt: '빨간색 읽지 않은 알림 뱃지가 붙은 종 모양 벨 아이콘',
    description: '실시간 푸시 알림, 새 소식 확인, 메시지 수신함 아이콘',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#1e293b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/><circle cx="18" cy="5" r="2.5" fill="#ef4444" stroke="#ef4444"/></svg>`,
  },
  {
    id: 'icon_12_visibility_off',
    fileName: '12_visibility_off.svg',
    title: '비밀번호 숨김 (Visibility Off)',
    alt: '빨간색 대각선이 그어진 눈 모양 가리기 아이콘',
    description: '비밀번호 숨기기/보이기 토글, 비공개 콘텐츠 보호 아이콘',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#1e293b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><circle cx="12" cy="12" r="3"/><line x1="2" y1="2" x2="22" y2="22" stroke="#ef4444" stroke-width="2.5"/></svg>`,
  },
  {
    id: 'icon_13_search',
    fileName: '13_search.svg',
    title: '검색 돋보기 (Search)',
    alt: '대각선 손잡이가 달린 원형 돋보기 검색 아이콘',
    description: '글로벌 키워드 검색, 필터링, 이미지 찾아보기 아이콘',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#1e293b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="10.5" cy="10.5" r="7.5"/><line x1="16" y1="16" x2="21.5" y2="21.5" stroke-width="2.5"/></svg>`,
  },
  {
    id: 'icon_14_refresh_sync',
    fileName: '14_refresh_sync.svg',
    title: '새로고침 & 실시간 동기화 (Refresh Sync)',
    alt: '원형으로 회전하는 동기화 화살표 리프레시 아이콘',
    description: '데이터 새로고침, 클라우드 실시간 동기화 트리거 아이콘',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#1e293b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6"/><path d="M21.34 15.57a9 9 0 1 1-3.66-8.24l3.82 2.67"/><line x1="3" y1="12" x2="7" y2="12"/><line x1="17" y1="12" x2="21" y2="12"/></svg>`,
  },
  {
    id: 'icon_15_auto_awesome',
    fileName: '15_auto_awesome.svg',
    title: 'AI 추천 & 스마트 (Auto Awesome)',
    alt: '반짝이는 4각 별 모양의 푸른색 스마트 AI 매직 아이콘',
    description: 'AI 스마트 생성, 자동 태깅, 하이라이트 기능 아이콘',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="#3b82f6" stroke="#2563eb" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l2.4 5.6L20 10l-5.6 2.4L12 18l-2.4-5.6L4 10l5.6-2.4z"/><path d="M19 16l1 2.5L22.5 19.5 20 20.5 19 23l-1-2.5-2.5-1 2.5-1z"/></svg>`,
  },
  {
    id: 'icon_16_expand_more',
    fileName: '16_expand_more.svg',
    title: '더보기 & 드롭다운 (Expand More)',
    alt: '아래쪽을 향하는 브이 모양 셰브론 화살표 아이콘',
    description: '아코디언 펼치기, 드롭다운 셀렉트 박스 화살표 아이콘',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#1e293b" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`,
  },
  {
    id: 'icon_17_check_circle',
    fileName: '17_check_circle.svg',
    title: '성공 완료 체크 (Check Circle)',
    alt: '초록색 원형 안에 체크 기호가 표시된 완료 아이콘',
    description: '저장 완료 확인, 유효성 검사 통과, 성공 메시지 뱃지 아이콘',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="#dcfce7" stroke="#16a34a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9.5"/><polyline points="8 12 11 15 16 9" stroke-width="2.5"/></svg>`,
  },
  {
    id: 'icon_18_close_circle',
    fileName: '18_close_circle.svg',
    title: '취소 & 오류 삭제 (Close Circle)',
    alt: '붉은색 원형 안에 엑스 기호가 표시된 에러 닫기 아이콘',
    description: '입력 내용 초기화, 모달 닫기, 유효성 오류 경고 아이콘',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="#fee2e2" stroke="#dc2626" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9.5"/><line x1="8.5" y1="8.5" x2="15.5" y2="15.5" stroke-width="2.5"/><line x1="15.5" y1="8.5" x2="8.5" y2="15.5" stroke-width="2.5"/></svg>`,
  },
  {
    id: 'icon_19_call_split',
    fileName: '19_call_split.svg',
    title: '분기 & 경로 분할 (Call Split)',
    alt: '하나의 줄기에서 두 갈래로 나뉘는 Y자형 분기 아이콘',
    description: 'A/B 테스트 라우팅, 워크플로 조건 분기, 트래픽 분할 아이콘',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#1e293b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="20" r="1.5" fill="#1e293b"/><line x1="12" y1="18.5" x2="12" y2="13"/><path d="M12 13L6 7"/><path d="M12 13L18 7"/><polyline points="4 7 6 7 6 9"/><polyline points="20 7 18 7 18 9"/></svg>`,
  },
  {
    id: 'icon_20_sync_alt',
    fileName: '20_sync_alt.svg',
    title: '양방향 전환 교환 (Sync Alt)',
    alt: '상하로 반대 방향을 가리키는 평행 양방향 화살표 아이콘',
    description: '환율 변환, 출발지/도착지 맞교환, 양방향 데이터 교환 아이콘',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#1e293b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="8" x2="20" y2="8"/><polyline points="16 4 20 8 16 12"/><line x1="20" y1="16" x2="4" y2="16"/><polyline points="8 12 4 16 8 20"/></svg>`,
  },
  {
    id: 'icon_21_label_sell',
    fileName: '21_label_sell.svg',
    title: '가격표 & 라벨 태그 (Label Sell)',
    alt: '구멍이 뚫린 상품 가격표 라벨 태그 아이콘',
    description: '상품 할인 태그, 카테고리 라벨링, 쇼핑몰 프로모션 아이콘',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#1e293b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><circle cx="7" cy="7" r="1.5" fill="#1e293b"/></svg>`,
  },
  {
    id: 'icon_22_photo_camera',
    fileName: '22_photo_camera.svg',
    title: '카메라 촬영 (Photo Camera)',
    alt: '렌즈와 플래시 버튼이 있는 디지털 카메라 아이콘',
    description: '사진 촬영, 프로필 사진 변경, 갤러리 업로드 바로가기 아이콘',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#1e293b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>`,
  },
  {
    id: 'icon_23_drag_indicator',
    fileName: '23_drag_indicator.svg',
    title: '드래그 핸들 (Drag Indicator)',
    alt: '2열 3행으로 정렬된 6개의 원형 드래그 손잡이 점 아이콘',
    description: '목록 순서 재정렬 핸들러, 칸반 보드 카드 드래그 앤 드롭 아이콘',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="#1e293b"><circle cx="8.5" cy="6" r="1.7"/><circle cx="15.5" cy="6" r="1.7"/><circle cx="8.5" cy="12" r="1.7"/><circle cx="15.5" cy="12" r="1.7"/><circle cx="8.5" cy="18" r="1.7"/><circle cx="15.5" cy="18" r="1.7"/></svg>`,
  },
  {
    id: 'icon_24_warning',
    fileName: '24_warning.svg',
    title: '주의 & 긴급 경고 (Warning)',
    alt: '붉은 테두리와 느낌표가 표시된 삼각 주의 경고 아이콘',
    description: '주의 안내, 데이터 삭제 전 경고 알림, 유효성 검사 에러 아이콘',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="#fee2e2" stroke="#dc2626" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13" stroke-width="2.5"/><line x1="12" y1="17" x2="12.01" y2="17" stroke-width="2.5"/></svg>`,
  },
];

export const USER_UPLOADED_ICONS: UploadedIconData[] = RAW_ICONS.map((item) => ({
  id: item.id,
  fileName: item.fileName,
  title: item.title,
  category: '아이콘',
  alt: item.alt,
  description: item.description,
  svgContent: item.svg,
  dataUri: createSvgDataUri(item.svg),
  localPath: `/icons/${item.fileName}`,
}));
