export default function Dashboard() {
  return (
    <div>
      <h1>대시보드</h1>
      <p>여기는 전체 현황(진행률, 일정, 공지 등) 올릴 자리.</p>

      <div className="grid">
        <section className="card">
          <h3>이번 주</h3>
          <p>할 일 0개</p>
        </section>

        <section className="card">
          <h3>차수</h3>
          <p>선택 필요</p>
        </section>

        <section className="card">
          <h3>리마인드</h3>
          <p>없음</p>
        </section>
      </div>
    </div>
  );
}

