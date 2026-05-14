export async function getKoreanHolidays(year) {
    // ✅ GitHub Pages base path(/manage-react/) 자동 반영
    const base = import.meta.env.BASE_URL || "/";
    const url = `${base}holidays-${year}.json`;
    const res = await fetch(url);
    if (!res.ok)
        return [];
    return (await res.json());
}
