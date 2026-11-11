# 마석고 1-3 학급 사이트

## 폴더 구조
```
index.html            뼈대 (로그인 화면은 HTML에 직접 들어 있어 즉시 표시)
assets/logo.svg       학교 로고 (브라우저가 캐시함)
css/style.css         스타일 전체 (번호 붙은 11개 구역으로 정리)
js/main.js            시작점: 로그인, 실시간 구독, 화면 그리기, 버튼 연결
js/firebase.js        Firebase·Cloudinary 설정과 데이터 위치
js/store.js           앱 상태, 권한 확인, 렌더 예약
js/utils.js           이스케이프, 날짜, 이미지 압축, 입력 보존 렌더링
js/dialog.js          <dialog> 모달 도우미
js/views/*.js         탭별 화면과 동작
```

## 새 버튼을 추가하는 방법
HTML에 `data-action="함수이름"`을 달고, 그 화면 파일 맨 아래 `actions`에 함수를 넣으면 됩니다.
값은 `data-id="${esc(값)}"`처럼 data 속성으로만 넘기고, 함수에서는 `el.dataset.id`로 읽습니다.
onclick="..." 안에 사용자 데이터를 넣지 마세요.

- 클릭: `data-action`
- 값 변경(체크박스, 선택 상자): `data-change`
- 폼 제출(Enter 포함): `<form data-submit="함수이름">`
- 입력 중 실시간 업데이트가 와도 지켜야 하는 칸: `data-keep` (+ `id` 또는 `data-key`)

## 배포
폴더 전체를 Netlify에 그대로 올리면 됩니다. 빌드 과정은 필요 없습니다.
